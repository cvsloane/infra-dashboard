'use client';

import { useEffect, useState } from 'react';
import { DeploymentCard } from '@/components/coolify/DeploymentCard';
import { DeploymentProgressList } from '@/components/coolify/DeploymentProgress';
import { QueueCard } from '@/components/queues/QueueCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { useDashboard } from './layout';
import { AgentsCard } from '@/components/agents/AgentsCard';
import type { CoolifyDeployment } from '@/types';
import type { DeploymentRecordClient } from '@/types/deployments';
import type { OverviewData, OverviewSiteHealth } from '@/types/overview';
import { formatDurationLong, formatDurationShort } from '@/lib/format';
import { buildIssues } from '@/lib/issues/buildIssues';
import { IssueInbox } from '@/components/dashboard/IssueInbox';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import { WidgetPicker } from '@/components/dashboard/widgets/WidgetPicker';
import { WidgetTile } from '@/components/dashboard/widgets/WidgetTile';
import {
  DEFAULT_PINNED_WIDGET_IDS,
  MAX_VISIBLE_WIDGETS,
  normalizeWidgetIds,
  PINNED_WIDGETS_STORAGE_KEY,
  WIDGETS_BY_ID,
  type WidgetId,
} from '@/components/dashboard/widgets/registry';

export default function OverviewPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applicationCount, setApplicationCount] = useState(0);
  const [isCancellingDeployment, setIsCancellingDeployment] = useState(false);
  const [pinnedWidgetIds, setPinnedWidgetIds] = useState<WidgetId[]>(DEFAULT_PINNED_WIDGET_IDS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PINNED_WIDGETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const ids = normalizeWidgetIds(parsed);
      if (ids.length > 0) setPinnedWidgetIds(ids);
    } catch {
      // Ignore invalid JSON / storage access errors.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_WIDGETS_STORAGE_KEY, JSON.stringify(pinnedWidgetIds));
    } catch {
      // Ignore storage errors (private mode, quota, etc).
    }
  }, [pinnedWidgetIds]);

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
      q.workerState ? q.workerState === 'down' : q.workerCount !== undefined ? q.workerCount === 0 : q.workerActive === false
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
    const backupsData = sseData.backups;
    const alertsData = sseData.alerts;
    const sitesData = sseData.sites;
    const sitesList = sitesData?.sites || [];
    const workerSupervisor = sseData.workerSupervisor;
    const hermesData = sseData.hermes ?? null;
    const workerSummary = workerSupervisor?.summary || { total: 0, ok: 0, warning: 0, down: 0 };
    const workerStatus = workerSupervisor
      ? workerSupervisor.stale
        ? 'warning'
        : workerSummary.down > 0
        ? 'error'
        : workerSummary.warning > 0
        ? 'warning'
        : 'ok'
      : 'warning';
    const workerMessage = workerSupervisor
      ? workerSupervisor.stale
        ? `Stale update (${formatDurationLong(workerSupervisor.ageSec)})`
        : `${workerSummary.ok}/${workerSummary.total} healthy`
      : 'No supervisor data';

    setData({
      alerts: {
        status: alertsData?.status ?? 'unknown',
        message: alertsData?.message ?? 'No alert data',
        firing: alertsData?.firing ?? 0,
        suppressed: alertsData?.suppressed ?? 0,
        critical: alertsData?.bySeverity?.critical ?? 0,
        warning: alertsData?.bySeverity?.warning ?? 0,
        alerts: alertsData?.alerts ?? [],
      },
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
        metricsAgeSec: postgresHealth?.metricsAgeSeconds ?? null,
      },
      backups: {
        status: backupsData?.status ?? 'unknown',
        message: backupsData?.message ?? 'No backup metrics',
        logicalAgeSec: backupsData?.logical?.ageSec ?? null,
        walAgeSec: backupsData?.wal?.ageSec ?? null,
        basebackupAgeSec: backupsData?.basebackup?.ageSec ?? null,
        restoreDrillAgeSec: backupsData?.restoreDrill?.ageSec ?? null,
      },
      workerSupervisor: {
        status: workerStatus,
        message: workerMessage,
        summary: workerSummary,
        stale: workerSupervisor?.stale,
        ageSec: workerSupervisor?.ageSec,
        items: workerSupervisor?.items || [],
      },
      hermes: hermesData,
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
        status: (sitesData?.downCount || 0) > 0 ? 'error' : (sitesData?.sslExpiringSoonCount || 0) > 0 ? 'warning' : 'ok',
        downSites: sitesList.filter((s) => s.status === 'down'),
        allSites: sitesList,
        totalSites: sitesList.length,
        healthySites: sitesList.filter((s) => s.status === 'healthy').length,
        sslExpiringSoonCount: sitesData?.sslExpiringSoonCount || 0,
        sslExpiryWarnDays: sitesData?.sslExpiryWarnDays ?? 14,
      },
    });
    setLoading(false);
  }, [sseData, applicationCount]);

  useEffect(() => {
    if (isConnected) return;
    const fetchData = async () => {
      try {
        const [coolifyRes, postgresRes, backupsRes, alertsRes, bullmqRes, sitesRes, workerRes, hermesRes] = await Promise.all([
          fetch('/api/coolify/applications'),
          fetch('/api/postgres/health'),
          fetch('/api/postgres/backups'),
          fetch('/api/alertmanager/alerts'),
          fetch('/api/bullmq/queues'),
          fetch('/api/servers/status'),
          fetch('/api/workers/status'),
          fetch('/api/hermes/summary'),
        ]);

        const coolifyData = await coolifyRes.json();
        setApplicationCount(coolifyData.applications?.length || 0);
        const postgresData = await postgresRes.json();
        const backupsData = backupsRes.ok ? await backupsRes.json() : null;
        const alertsData = alertsRes.ok ? await alertsRes.json() : null;
        const bullmqData = await bullmqRes.json();
        const sitesData = sitesRes.ok ? await sitesRes.json() : { sites: { sites: [], downCount: 0, sslExpiringSoonCount: 0 } };
        const sitesList = sitesData.sites?.sites || [];
        const workerData = workerRes.ok ? await workerRes.json() : { status: null };
        const hermesData = hermesRes.ok ? await hermesRes.json() : null;

        // Fetch recent deployments (now includes active, recent, and stats)
        const deploymentsRes = await fetch('/api/coolify/deployments');
        const deploymentsData = await deploymentsRes.json();

        const totalFailed = bullmqData.queues?.reduce(
          (sum: number, q: { failed: number }) => sum + (q.failed || 0),
          0
        ) || 0;

        const workersDown = bullmqData.queues?.filter(
          (q: { workerActive?: boolean; workerCount?: number; workerState?: 'active' | 'idle' | 'down' | 'unknown' }) =>
            q.workerState ? q.workerState === 'down' : q.workerCount !== undefined ? q.workerCount === 0 : q.workerActive === false
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

        const workerSupervisor = workerData.status || null;
        const workerSummary = workerSupervisor?.summary || { total: 0, ok: 0, warning: 0, down: 0 };
        const workerStatus = workerSupervisor
          ? workerSupervisor.stale
            ? 'warning'
            : workerSummary.down > 0
            ? 'error'
            : workerSummary.warning > 0
            ? 'warning'
            : 'ok'
          : 'warning';
        const workerMessage = workerSupervisor
          ? workerSupervisor.stale
            ? `Stale update (${formatDurationLong(workerSupervisor.ageSec)})`
            : `${workerSummary.ok}/${workerSummary.total} healthy`
          : 'No supervisor data';

        setData({
          alerts: {
            status: alertsData?.status ?? 'unknown',
            message: alertsData?.message ?? 'No alert data',
            firing: alertsData?.firing ?? 0,
            suppressed: alertsData?.suppressed ?? 0,
            critical: alertsData?.bySeverity?.critical ?? 0,
            warning: alertsData?.bySeverity?.warning ?? 0,
            alerts: alertsData?.alerts ?? [],
          },
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
            metricsAgeSec: null,
          },
          backups: {
            status: backupsData?.status ?? 'unknown',
            message: backupsData?.message ?? 'No backup metrics',
            logicalAgeSec: backupsData?.logical?.ageSec ?? null,
            walAgeSec: backupsData?.wal?.ageSec ?? null,
            basebackupAgeSec: backupsData?.basebackup?.ageSec ?? null,
            restoreDrillAgeSec: backupsData?.restoreDrill?.ageSec ?? null,
          },
          workerSupervisor: {
            status: workerStatus,
            message: workerMessage,
            summary: workerSummary,
            stale: workerSupervisor?.stale,
            ageSec: workerSupervisor?.ageSec,
            items: workerSupervisor?.items || [],
          },
          hermes: hermesData,
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
            status: sitesData.sites?.downCount > 0 ? 'error' : (sitesData.sites?.sslExpiringSoonCount || 0) > 0 ? 'warning' : 'ok',
            downSites: sitesList.filter((s: OverviewSiteHealth) => s.status === 'down'),
            allSites: sitesList,
            totalSites: sitesList.length,
            healthySites: sitesList.filter((s: OverviewSiteHealth) => s.status === 'healthy').length,
            sslExpiringSoonCount: sitesData.sites?.sslExpiringSoonCount || 0,
            sslExpiryWarnDays: sitesData.sites?.sslExpiryWarnDays ?? 14,
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

  const visibleWidgetIds = pinnedWidgetIds.slice(0, MAX_VISIBLE_WIDGETS);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Overview</h1>
            <p className="text-sm text-muted-foreground">Action-first health summary</p>
          </div>
          <WidgetPicker selected={pinnedWidgetIds} onChange={setPinnedWidgetIds} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {(visibleWidgetIds.length ? visibleWidgetIds : DEFAULT_PINNED_WIDGET_IDS).slice(0, MAX_VISIBLE_WIDGETS).map((id) => (
            <Skeleton key={id} className="h-24" />
          ))}
        </div>

        <Skeleton className="h-40" />

        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  const issues = buildIssues(data);

  const firingAlerts = (data?.alerts.alerts || []).filter((a) => a.state === 'firing');
  const deployStats = data?.coolify.stats || { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 };

  const queues = data?.bullmq.queues || [];
  const topQueues = queues
    .slice()
    .sort((a, b) => {
      const aScore = (a.failed || 0) * 1000 + (a.waiting || 0) * 10 + (a.active || 0);
      const bScore = (b.failed || 0) * 1000 + (b.waiting || 0) * 10 + (b.active || 0);
      return bScore - aScore;
    })
    .slice(0, 5);

  const workerAlerts = data?.workerSupervisor?.items.filter((item) => item.status !== 'ok') || [];
  const workerPanelTone = data?.workerSupervisor?.stale
    ? 'border-yellow-500/30 bg-yellow-500/5'
    : workerAlerts.length > 0
    ? 'border-red-500/30 bg-red-500/5'
    : 'border-border';
  const workerPanelIcon = data?.workerSupervisor?.stale ? 'text-yellow-600' : 'text-red-600';

  const sslWarnDays = data?.sites.sslExpiryWarnDays ?? 14;
  const allSites = data?.sites.allSites || [];
  const sitesNeedingAttention = allSites
    .filter((s) => {
      const sslSoon = typeof s.sslDaysRemaining === 'number' && s.sslDaysRemaining <= sslWarnDays;
      return s.status !== 'healthy' || sslSoon;
    })
    .slice()
    .sort((a, b) => {
      const rank = (st: OverviewSiteHealth['status']) =>
        st === 'down' ? 3 : st === 'degraded' ? 2 : st === 'unknown' ? 1 : 0;
      const r = rank(b.status) - rank(a.status);
      if (r !== 0) return r;
      const aSsl = typeof a.sslDaysRemaining === 'number' ? a.sslDaysRemaining : 999999;
      const bSsl = typeof b.sslDaysRemaining === 'number' ? b.sslDaysRemaining : 999999;
      return aSsl - bSsl;
    })
    .slice(0, 8);

  const sectionOpen = {
    alerts: (data?.alerts.firing || 0) > 0,
    deployments: (data?.coolify.activeDeployments?.length || 0) > 0 || deployStats.failedToday > 0,
    queues: (data?.bullmq.workersDown || 0) > 0 || (data?.bullmq.totalFailed || 0) > 0 || workerAlerts.length > 0 || Boolean(data?.workerSupervisor?.stale),
    sites: (data?.sites.downSites?.length || 0) > 0 || (data?.sites.sslExpiringSoonCount || 0) > 0,
    data: (data?.postgres.status || 'unknown') !== 'ok' || (data?.backups.status || 'unknown') !== 'ok',
  };

  const alertBadge = (sev: 'critical' | 'warning' | 'info' | 'unknown') => {
    if (sev === 'critical') return { variant: 'destructive' as const, className: '' };
    if (sev === 'warning') return { variant: 'outline' as const, className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/25' };
    if (sev === 'info') return { variant: 'outline' as const, className: 'bg-muted text-muted-foreground border-border' };
    return { variant: 'outline' as const, className: 'text-muted-foreground' };
  };

  const siteStatusBadge = (st: OverviewSiteHealth['status']) => {
    if (st === 'down') return { variant: 'destructive' as const, className: '' };
    if (st === 'degraded') return { variant: 'outline' as const, className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/25' };
    if (st === 'unknown') return { variant: 'outline' as const, className: 'text-muted-foreground' };
    return { variant: 'outline' as const, className: 'bg-green-500/10 text-green-700 border-green-500/25' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Action-first health summary</p>
        </div>
        <WidgetPicker selected={pinnedWidgetIds} onChange={setPinnedWidgetIds} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {visibleWidgetIds.map((id) => {
          const def = WIDGETS_BY_ID[id];
          if (!def) return null;
          const vm = def.getViewModel(data);
          return (
            <WidgetTile
              key={id}
              title={def.label}
              href={def.href}
              status={vm.status}
              primary={vm.primary}
              secondary={vm.secondary}
              meta={vm.meta}
              icon={def.icon}
            />
          );
        })}
      </div>

      <IssueInbox issues={issues} />

      <div className="space-y-3">
        <CollapsibleSection
          title="Alerting"
          status={data?.alerts.status || 'unknown'}
          href="/alerts"
          defaultOpen={sectionOpen.alerts}
          summary={[
            { label: 'Firing', value: data?.alerts.firing ?? 0 },
            { label: 'Crit', value: data?.alerts.critical ?? 0 },
            { label: 'Warn', value: data?.alerts.warning ?? 0 },
          ]}
        >
          {firingAlerts.length > 0 ? (
            <div className="space-y-2">
              {firingAlerts.slice(0, 6).map((a) => {
                const key = a.fingerprint || `${a.name}-${a.startsAt || ''}`;
                const b = alertBadge(a.severity);
                const detail = a.summary || a.description || '—';
                return (
                  <div key={key} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-medium text-sm truncate">{a.name}</div>
                        <Badge variant={b.variant} className={b.className}>
                          {a.severity}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate" title={detail}>
                        {detail}
                      </div>
                    </div>
                    {a.startsAt && (
                      <div className="text-xs text-muted-foreground shrink-0">
                        {new Date(a.startsAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{data?.alerts.message || 'No alert data'}</div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Deployments"
          status={data?.coolify.status || 'unknown'}
          href="/coolify"
          defaultOpen={sectionOpen.deployments}
          summary={[
            { label: 'In progress', value: deployStats.inProgress },
            { label: 'Queued', value: deployStats.queued },
            { label: 'Failed today', value: deployStats.failedToday },
          ]}
        >
          {data?.coolify.activeDeployments && data.coolify.activeDeployments.length > 0 && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-3">
              <DeploymentProgressList deployments={data.coolify.activeDeployments} onCancel={handleCancelDeployment} />
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div className="font-semibold text-sm">Recent</div>
            {data?.coolify.recentDeployments && data.coolify.recentDeployments.length > 0 ? (
              <div className="space-y-3">
                {data.coolify.recentDeployments.map((deployment) => (
                  <DeploymentCard key={deployment.uuid} deployment={deployment} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent deployments</p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Queues & Workers"
          status={data?.bullmq.status || 'unknown'}
          href="/queues"
          defaultOpen={sectionOpen.queues}
          summary={[
            { label: 'Workers down', value: data?.bullmq.workersDown ?? 0 },
            { label: 'Failed', value: data?.bullmq.totalFailed ?? 0 },
            { label: 'Queues', value: data?.bullmq.queues?.length ?? 0 },
          ]}
        >
          {(data?.workerSupervisor?.stale || workerAlerts.length > 0) && (
            <div className={`rounded-lg border p-3 ${workerPanelTone}`}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className={`h-4 w-4 ${workerPanelIcon}`} />
                <span className="font-semibold text-sm">
                  {data?.workerSupervisor?.stale
                    ? `Worker supervisor stale (${formatDurationLong(data?.workerSupervisor?.ageSec)})`
                    : `${workerAlerts.length} worker issue${workerAlerts.length > 1 ? 's' : ''}`}
                </span>
              </div>
              {workerAlerts.length > 0 ? (
                <div className="space-y-2">
                  {workerAlerts.slice(0, 8).map((item) => (
                    <div
                      key={`${item.source}-${item.name}`}
                      className="flex items-center justify-between gap-2 p-2 rounded bg-background/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.source.toUpperCase()} {item.detail ? `• ${item.detail}` : ''}
                        </div>
                      </div>
                      <Badge variant={item.status === 'down' ? 'destructive' : 'secondary'} className="shrink-0">
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No worker status updates received yet.</p>
              )}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div className="font-semibold text-sm">Queues</div>
            {topQueues.length > 0 ? (
              <div className="space-y-3">
                {topQueues.map((queue) => (
                  <QueueCard key={queue.name} queue={queue} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No queues found</p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Sites & TLS"
          status={data?.sites.status || 'unknown'}
          href="/servers"
          defaultOpen={sectionOpen.sites}
          summary={[
            { label: 'Down', value: data?.sites.downSites?.length ?? 0 },
            { label: 'SSL soon', value: data?.sites.sslExpiringSoonCount ?? 0 },
            { label: 'Healthy', value: `${data?.sites.healthySites ?? 0}/${data?.sites.totalSites ?? 0}` },
          ]}
        >
          {sitesNeedingAttention.length > 0 ? (
            <div className="space-y-2">
              {sitesNeedingAttention.map((site) => {
                const key = `${site.fqdn}-${site.name}`;
                const b = siteStatusBadge(site.status);
                const host = site.fqdn.replace('https://', '').replace('http://', '');
                const sslSoon = typeof site.sslDaysRemaining === 'number' && site.sslDaysRemaining <= sslWarnDays;
                return (
                  <div key={key} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-medium text-sm truncate">{site.name}</div>
                        <Badge variant={b.variant} className={b.className}>
                          {site.status}
                        </Badge>
                        {sslSoon && (
                          <Badge variant="outline" className="text-muted-foreground">
                            SSL {site.sslDaysRemaining}d
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate" title={host}>
                        {host}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {site.status === 'down' && (
                        <Badge variant="destructive">
                          {site.httpStatus || site.error || 'Down'}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No sites needing attention.</div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Data (Postgres & Backups)"
          status={data?.postgres.status === 'error' || data?.backups.status === 'error' ? 'error' : data?.postgres.status === 'warning' || data?.backups.status === 'warning' ? 'warning' : 'ok'}
          defaultOpen={sectionOpen.data}
          summary={[
            { label: 'Conn', value: `${data?.postgres.connections ?? 0}/${data?.postgres.maxConnections ?? 0}` },
            { label: 'Scrape', value: formatDurationShort(data?.postgres.metricsAgeSec) },
            { label: 'Backups', value: data?.backups.status ?? 'unknown' },
          ]}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {(() => {
              const def = WIDGETS_BY_ID.postgres;
              const vm = def.getViewModel(data);
              return (
                <WidgetTile
                  title={def.label}
                  href={def.href}
                  status={vm.status}
                  primary={vm.primary}
                  secondary={vm.secondary}
                  meta={vm.meta}
                  icon={def.icon}
                />
              );
            })()}
            {(() => {
              const def = WIDGETS_BY_ID.backups;
              const vm = def.getViewModel(data);
              return (
                <WidgetTile
                  title={def.label}
                  href={def.href}
                  status={vm.status}
                  primary={vm.primary}
                  secondary={vm.secondary}
                  meta={vm.meta}
                  icon={def.icon}
                />
              );
            })()}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Postgres: {data?.postgres.message || '—'} • Backups: {data?.backups.message || '—'}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Autonomous Agents" status="unknown" defaultOpen={false}>
          <AgentsCard />
        </CollapsibleSection>
      </div>
    </div>
  );
}
