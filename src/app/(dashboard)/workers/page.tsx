'use client';

import { useEffect, useState, useMemo } from 'react';
import { useDashboard } from '../layout';
import type { WorkerSupervisorStatus } from '@/types';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, Clock, Cog, RefreshCw, Server } from 'lucide-react';

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

const statusOrder: Record<'down' | 'warning' | 'ok', number> = {
  down: 0,
  warning: 1,
  ok: 2,
};

export default function WorkersPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [status, setStatus] = useState<WorkerSupervisorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/workers/status');
      if (res.ok) {
        const payload = await res.json();
        setStatus(payload.status || null);
      }
    } catch (error) {
      console.error('Failed to fetch worker supervisor status:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sseData?.type === 'update' && sseData.workerSupervisor !== undefined) {
      setStatus(sseData.workerSupervisor || null);
      setLoading(false);
    }
  }, [sseData]);

  useEffect(() => {
    if (isConnected) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const summary = status?.summary || { total: 0, ok: 0, warning: 0, down: 0 };
  const overallStatus = status
    ? status.stale
      ? 'warning'
      : summary.down > 0
      ? 'error'
      : summary.warning > 0
      ? 'warning'
      : 'ok'
    : 'warning';

  const issues = status?.items.filter((item) => item.status !== 'ok') || [];

  const grouped = useMemo(() => {
    const buckets: Record<'systemd' | 'pm2' | 'docker', WorkerSupervisorStatus['items']> = {
      systemd: [],
      pm2: [],
      docker: [],
    };
    (status?.items || []).forEach((item) => {
      buckets[item.source].push(item);
    });
    (Object.keys(buckets) as Array<keyof typeof buckets>).forEach((key) => {
      buckets[key].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    });
    return buckets;
  }, [status]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Workers</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Workers</h1>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={refreshing}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {(status?.stale || issues.length > 0) && (
        <Card className={status?.stale ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-red-500/50 bg-red-500/10'}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${status?.stale ? 'text-yellow-500' : 'text-red-500'}`} />
              <span className="font-semibold">
                {status?.stale
                  ? `Supervisor stale (${formatDuration(status?.ageSec)})`
                  : `${issues.length} worker issue${issues.length > 1 ? 's' : ''}`}
              </span>
            </div>
            {issues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {issues.slice(0, 10).map((item) => (
                  <div key={`${item.source}-${item.name}`} className="flex items-center gap-2 px-2 py-1 rounded bg-background/40 text-sm">
                    <Cog className="h-3 w-3" />
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.source.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="Supervisor"
          status={overallStatus}
          message={status?.stale ? `Stale update (${formatDuration(status?.ageSec)})` : `${summary.ok}/${summary.total} healthy`}
          icon={Activity}
          stats={[
            { label: 'Down', value: summary.down },
            { label: 'Warn', value: summary.warning },
          ]}
        />
        <MetricCard
          title="Total Workers"
          value={summary.total}
          subtitle={status?.host ? `Host: ${status.host}` : '—'}
          icon={Server}
        />
        <MetricCard
          title="Last Update"
          value={status?.updatedAt ? new Date(status.updatedAt).toLocaleTimeString() : '—'}
          subtitle={status?.updatedAt ? new Date(status.updatedAt).toLocaleDateString() : '—'}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(['systemd', 'pm2', 'docker'] as const).map((source) => (
          <Card key={source}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {source.toUpperCase()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {grouped[source].length === 0 ? (
                <p className="text-sm text-muted-foreground">No workers detected.</p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {grouped[source].map((item) => (
                    <div key={`${item.source}-${item.name}`} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{item.name}</div>
                        {item.detail && (
                          <div className="text-xs text-muted-foreground truncate">{item.detail}</div>
                        )}
                      </div>
                      <Badge variant={item.status === 'down' ? 'destructive' : item.status === 'warning' ? 'secondary' : 'default'}>
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
