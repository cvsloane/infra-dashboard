'use client';

import { useEffect, useState } from 'react';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { DeploymentCard } from '@/components/coolify/DeploymentCard';
import { DeploymentProgressList } from '@/components/coolify/DeploymentProgress';
import { QueueCard } from '@/components/queues/QueueCard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Server, Database, Activity, Rocket, Clock, AlertTriangle, Globe } from 'lucide-react';
import { useDashboard } from './layout';
import type { CoolifyDeployment } from '@/types';
import type { DeploymentRecordClient, DeploymentStatsClient } from '@/types/deployments';

interface SiteHealth {
  applicationUuid?: string;
  name: string;
  fqdn: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string;
}

interface OverviewData {
  coolify: {
    status: 'ok' | 'error' | 'warning' | 'loading';
    message: string;
    applicationCount: number;
    recentDeployments: CoolifyDeployment[];
    activeDeployments: DeploymentRecordClient[];
    stats: DeploymentStatsClient;
  };
  postgres: {
    status: 'ok' | 'error' | 'warning' | 'loading';
    message: string;
    connections: number;
    maxConnections: number;
  };
  bullmq: {
    status: 'ok' | 'error' | 'warning' | 'loading';
    message: string;
    queues: Array<{
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
      isPaused?: boolean;
      workerActive?: boolean;
      workerLastSeen?: number;
      workerCount?: number;
      workerHeartbeatMaxAgeSec?: number;
      oldestWaitingAgeSec?: number;
      jobsPerMin?: number;
      failuresPerMin?: number;
    }>;
    totalFailed: number;
    workersDown: number;
  };
  sites: {
    status: 'ok' | 'error' | 'warning' | 'loading';
    downSites: SiteHealth[];
    totalSites: number;
    healthySites: number;
  };
}

export default function OverviewPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applicationCount, setApplicationCount] = useState(0);
  const [isCancellingDeployment, setIsCancellingDeployment] = useState(false);

  const fetchApplicationCount = async () => {
    try {
      const res = await fetch('/api/coolify/applications');
      const coolifyData = await res.json();
      setApplicationCount(coolifyData.applications?.length || 0);
    } catch (error) {
      console.error('Failed to fetch application count:', error);
    }
  };

  const handleCancelDeployment = async (deploymentUuid: string) => {
    if (isCancellingDeployment) return;
    setIsCancellingDeployment(true);
    try {
      const res = await fetch(`/api/coolify/deployments/${deploymentUuid}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to cancel deployment');
      }
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
    } finally {
      setIsCancellingDeployment(false);
    }
  };

  useEffect(() => {
    fetchApplicationCount();
    const interval = setInterval(fetchApplicationCount, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (sseData?.type !== 'update') return;

    const deploymentsData = sseData.deployments || { active: [], recent: [], stats: { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 } };
    const queues = sseData.queues || [];
    const totalFailed = queues.reduce((sum, q) => sum + (q.failed || 0), 0);
    const workersDown = queues.filter((q) =>
      q.workerCount !== undefined ? q.workerCount === 0 : q.workerActive === false
    ).length;

    const recentDeployments: CoolifyDeployment[] = (deploymentsData.recent || []).slice(0, 3).map((d: DeploymentRecordClient) => ({
      uuid: d.uuid,
      application_name: d.applicationName,
      application_uuid: d.applicationUuid,
      status: d.status,
      commit: d.commit || undefined,
      commit_message: d.commitMessage || undefined,
      created_at: d.createdAt?.toString(),
      finished_at: d.finishedAt?.toString(),
    }));

    const coolifyHealth = sseData.health?.coolify;
    const postgresHealth = sseData.postgres;
    const sitesData = sseData.sites;

    setData({
      coolify: {
        status: coolifyHealth?.ok ? 'ok' : 'error',
        message: coolifyHealth?.ok
          ? `${applicationCount} applications running`
          : coolifyHealth?.message || 'Unable to connect to Coolify',
        applicationCount,
        recentDeployments,
        activeDeployments: deploymentsData.active || [],
        stats: deploymentsData.stats || { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 },
      },
      postgres: {
        status: postgresHealth?.up ? 'ok' : 'error',
        message: postgresHealth?.up
          ? `${postgresHealth.connections.active} active connections`
          : 'PostgreSQL is down',
        connections: postgresHealth?.connections.active || 0,
        maxConnections: postgresHealth?.connections.max || 100,
      },
      bullmq: {
        status: workersDown > 0 ? 'error' : totalFailed > 0 ? 'warning' : 'ok',
        message: workersDown > 0
          ? `${workersDown} worker${workersDown > 1 ? 's' : ''} down`
          : totalFailed > 0
          ? `${totalFailed} failed jobs need attention`
          : `${queues.length} queues active`,
        queues,
        totalFailed,
        workersDown,
      },
      sites: {
        status: (sitesData?.downCount || 0) > 0 ? 'error' : 'ok',
        downSites: (sitesData?.sites || []).filter((s: SiteHealth) => s.status === 'down'),
        totalSites: sitesData?.sites?.length || 0,
        healthySites: (sitesData?.sites || []).filter((s: SiteHealth) => s.status === 'healthy').length,
      },
    });
    setLoading(false);
  }, [sseData, applicationCount]);

  useEffect(() => {
    if (isConnected) return;
    const fetchData = async () => {
      try {
        const [coolifyRes, postgresRes, bullmqRes, sitesRes] = await Promise.all([
          fetch('/api/coolify/applications'),
          fetch('/api/postgres/health'),
          fetch('/api/bullmq/queues'),
          fetch('/api/servers/status'),
        ]);

        const coolifyData = await coolifyRes.json();
        setApplicationCount(coolifyData.applications?.length || 0);
        const postgresData = await postgresRes.json();
        const bullmqData = await bullmqRes.json();
        const sitesData = sitesRes.ok ? await sitesRes.json() : { sites: { sites: [], downCount: 0 } };

        // Fetch recent deployments (now includes active, recent, and stats)
        const deploymentsRes = await fetch('/api/coolify/deployments');
        const deploymentsData = await deploymentsRes.json();

        const totalFailed = bullmqData.queues?.reduce(
          (sum: number, q: { failed: number }) => sum + (q.failed || 0),
          0
        ) || 0;

        const workersDown = bullmqData.queues?.filter(
          (q: { workerActive?: boolean; workerCount?: number }) =>
            q.workerCount !== undefined ? q.workerCount === 0 : q.workerActive === false
        ).length || 0;

        // Convert recent deployments to CoolifyDeployment format
        const recentDeployments: CoolifyDeployment[] = (deploymentsData.recent || []).slice(0, 3).map((d: DeploymentRecordClient) => ({
          uuid: d.uuid,
          application_name: d.applicationName,
          application_uuid: d.applicationUuid,
          status: d.status,
          commit: d.commit || undefined,
          commit_message: d.commitMessage || undefined,
          created_at: d.createdAt?.toString(),
          finished_at: d.finishedAt?.toString(),
        }));

        setData({
          coolify: {
            status: coolifyRes.ok ? 'ok' : 'error',
            message: coolifyRes.ok
              ? `${coolifyData.applications?.length || 0} applications running`
              : 'Unable to connect to Coolify',
            applicationCount: coolifyData.applications?.length || 0,
            recentDeployments,
            activeDeployments: deploymentsData.active || [],
            stats: deploymentsData.stats || { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 },
          },
          postgres: {
            status: postgresData.status || 'error',
            message: postgresData.message || 'Unable to connect to PostgreSQL',
            connections: postgresData.metrics?.pg_stat_activity_count || 0,
            maxConnections: postgresData.metrics?.pg_settings_max_connections || 100,
          },
          bullmq: {
            status: workersDown > 0 ? 'error' : totalFailed > 0 ? 'warning' : bullmqRes.ok ? 'ok' : 'error',
            message: workersDown > 0
              ? `${workersDown} worker${workersDown > 1 ? 's' : ''} down`
              : totalFailed > 0
              ? `${totalFailed} failed jobs need attention`
              : `${bullmqData.queues?.length || 0} queues active`,
            queues: bullmqData.queues || [],
            totalFailed,
            workersDown,
          },
          sites: {
            status: sitesData.sites?.downCount > 0 ? 'error' : 'ok',
            downSites: (sitesData.sites?.sites || []).filter((s: SiteHealth) => s.status === 'down'),
            totalSites: sitesData.sites?.sites?.length || 0,
            healthySites: (sitesData.sites?.sites || []).filter((s: SiteHealth) => s.status === 'healthy').length,
          },
        });
      } catch (error) {
        console.error('Failed to fetch overview data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Infrastructure Overview</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const queues = data?.bullmq.queues || [];
  const heartbeatQueues = queues.filter((q) => q.workerCount !== undefined);
  const totalWorkers = heartbeatQueues.reduce((sum, q) => sum + (q.workerCount || 0), 0);
  const oldestHeartbeatAgeSec = heartbeatQueues.length > 0
    ? Math.max(...heartbeatQueues.map((q) => q.workerHeartbeatMaxAgeSec || 0))
    : undefined;
  const totalThroughput = queues.reduce((sum, q) => sum + (q.jobsPerMin || 0), 0);
  const oldestWaitAgeSec = queues.reduce((max, q) => {
    if (q.oldestWaitingAgeSec === undefined) return max;
    return Math.max(max, q.oldestWaitingAgeSec);
  }, 0);

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined) return '—';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remaining}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Infrastructure Overview</h1>
        {isConnected && (
          <span className="flex items-center gap-2 text-sm text-green-500">
            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Down Sites Alert - Show prominently when sites are down */}
      {data?.sites.downSites && data.sites.downSites.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="font-semibold text-red-500">
                {data.sites.downSites.length} Site{data.sites.downSites.length > 1 ? 's' : ''} Down
              </span>
            </div>
            <div className="space-y-2">
              {data.sites.downSites.map((site) => (
                <div key={site.fqdn} className="flex items-center justify-between p-2 rounded bg-red-500/10">
                  <div>
                    <div className="font-medium text-sm">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.fqdn.replace('https://', '').replace('http://', '')}
                    </div>
                  </div>
                  <Badge variant="destructive">
                    {site.httpStatus || site.error || 'Unreachable'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Deployments - Show prominently when something is deploying */}
      {data?.coolify.activeDeployments && data.coolify.activeDeployments.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4">
            <DeploymentProgressList
              deployments={data.coolify.activeDeployments}
              onCancel={handleCancelDeployment}
            />
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatusCard
          title="Coolify"
          status={data?.coolify.status || 'loading'}
          message={data?.coolify.message}
          icon={Server}
          stats={[
            { label: 'Applications', value: data?.coolify.applicationCount || 0 },
          ]}
        />
        <StatusCard
          title="Sites"
          status={data?.sites.status || 'loading'}
          message={(data?.sites.downSites?.length ?? 0) > 0
            ? `${data?.sites.downSites?.length} site${(data?.sites.downSites?.length ?? 0) > 1 ? 's' : ''} down`
            : `${data?.sites.healthySites ?? 0}/${data?.sites.totalSites ?? 0} healthy`}
          icon={Globe}
          stats={[
            { label: 'Healthy', value: data?.sites.healthySites ?? 0 },
            { label: 'Down', value: data?.sites.downSites?.length ?? 0 },
          ]}
        />
        <StatusCard
          title="PostgreSQL"
          status={data?.postgres.status || 'loading'}
          message={data?.postgres.message}
          icon={Database}
          stats={[
            {
              label: 'Connections',
              value: `${data?.postgres.connections || 0}/${data?.postgres.maxConnections || 0}`,
            },
          ]}
        />
        <StatusCard
          title="BullMQ"
          status={data?.bullmq.status || 'loading'}
          message={data?.bullmq.message}
          icon={Activity}
          stats={[
            { label: 'Queues', value: data?.bullmq.queues?.length || 0 },
            { label: 'Workers Down', value: data?.bullmq.workersDown || 0 },
            { label: 'Failed Jobs', value: data?.bullmq.totalFailed || 0 },
          ]}
        />
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Applications"
          value={data?.coolify.applicationCount || 0}
          icon={Rocket}
        />
        <MetricCard
          title="DB Connections"
          value={data?.postgres.connections || 0}
          subtitle={`of ${data?.postgres.maxConnections || 0} max`}
          icon={Database}
        />
        <MetricCard
          title="Active Queues"
          value={data?.bullmq.queues?.length || 0}
          icon={Activity}
        />
        <MetricCard
          title="Failed Jobs"
          value={data?.bullmq.totalFailed || 0}
          icon={Clock}
          trend={data?.bullmq.totalFailed && data.bullmq.totalFailed > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Worker Health */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Workers Online"
          value={heartbeatQueues.length > 0 ? totalWorkers : '—'}
          subtitle={heartbeatQueues.length > 0 ? `${heartbeatQueues.length} queues reporting` : 'Heartbeat data not available'}
          icon={Activity}
        />
        <MetricCard
          title="Oldest Heartbeat"
          value={heartbeatQueues.length > 0 ? formatDuration(oldestHeartbeatAgeSec) : '—'}
          subtitle="Max age across queues"
          icon={Clock}
        />
        <MetricCard
          title="Throughput"
          value={totalThroughput > 0 ? `${totalThroughput.toFixed(1)}/min` : '—'}
          subtitle="Jobs completed per minute"
          icon={Rocket}
        />
        <MetricCard
          title="Oldest Waiting Job"
          value={queues.length > 0 && oldestWaitAgeSec > 0 ? formatDuration(oldestWaitAgeSec) : '—'}
          subtitle="Across all queues"
          icon={Clock}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Deployments */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Deployments</h2>
          {data?.coolify.recentDeployments && data.coolify.recentDeployments.length > 0 ? (
            <div className="space-y-3">
              {data.coolify.recentDeployments.map((deployment) => (
                <DeploymentCard key={deployment.uuid} deployment={deployment} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No recent deployments</p>
          )}
        </div>

        {/* Queue Overview */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Queue Status</h2>
          {data?.bullmq.queues && data.bullmq.queues.length > 0 ? (
            <div className="space-y-3">
              {data.bullmq.queues.slice(0, 3).map((queue) => (
                <QueueCard key={queue.name} queue={queue} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No queues found</p>
          )}
        </div>
      </div>
    </div>
  );
}
