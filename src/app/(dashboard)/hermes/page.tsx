'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, Bot, CheckCircle, Clock, RefreshCw, Server, XCircle } from 'lucide-react';
import { useDashboard } from '../layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { formatDurationShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { HermesHealthStatus, HermesJob, HermesSummary } from '@/types/hermes';

const statusRank: Record<string, number> = {
  error: 0,
  warning: 1,
  stale: 1,
  overdue: 1,
  paused: 2,
  unknown: 3,
  ok: 4,
};

function normalizeJobStatus(job: HermesJob): HermesHealthStatus | 'paused' {
  const summaryStatus = String(job.summary_status || '').toLowerCase();
  if (summaryStatus === 'error' || summaryStatus === 'warning') return summaryStatus;
  if (job.enabled === false) return 'paused';
  const raw = String(job.status || job.last_status || 'unknown').toLowerCase();
  if (raw === 'error' || raw === 'warning') return raw;
  if (raw === 'stale' || raw === 'overdue') return 'warning';
  if (raw === 'ok') return 'ok';
  return 'unknown';
}

function badgeFor(status: string) {
  if (status === 'error') return { variant: 'destructive' as const, className: '' };
  if (status === 'warning') return { variant: 'outline' as const, className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700' };
  if (status === 'paused') return { variant: 'outline' as const, className: 'text-muted-foreground' };
  if (status === 'ok') return { variant: 'outline' as const, className: 'border-green-500/30 bg-green-500/10 text-green-700' };
  return { variant: 'outline' as const, className: 'text-muted-foreground' };
}

function timeAgo(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return formatDistanceToNow(date, { addSuffix: true });
}

function JobRow({ job }: { job: HermesJob }) {
  const status = normalizeJobStatus(job);
  const badge = badgeFor(status);
  const message = job.summary_message || job.summary_title || job.output_path || 'No recent summary';

  return (
    <div className="grid gap-3 border-b py-3 last:border-0 md:grid-cols-[minmax(0,1.6fr)_8rem_8rem_9rem] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">{job.name}</div>
          <Badge variant={badge.variant} className={cn('shrink-0', badge.className)}>
            {status}
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={message}>
          {message}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <div className="font-medium text-foreground">{job.node || 'hq'}</div>
        <div>{job.slug || job.job_id || 'unknown'}</div>
      </div>
      <div className="text-xs text-muted-foreground">
        <div>Last {timeAgo(job.last_run_at)}</div>
        <div>Age {formatDurationShort((job.age_minutes || 0) * 60)}</div>
      </div>
      <div className="text-xs text-muted-foreground">
        <div>Next {timeAgo(job.next_run_at)}</div>
        {job.pending_retry ? <div className="text-yellow-700">Pending retry</div> : <div>No retry</div>}
      </div>
    </div>
  );
}

function loadingView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((id) => (
          <Skeleton key={id} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export default function HermesPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [summary, setSummary] = useState<HermesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/hermes/summary');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSummary((await response.json()) as HermesSummary);
    } catch (error) {
      setSummary({
        status: 'warning',
        message: error instanceof Error ? error.message : 'Hermes data unavailable',
        checked_at: new Date().toISOString(),
        last_update: null,
        counts: { total: 0, ok: 0, warning: 0, error: 0, paused: 0, unknown: 0 },
        nodes: {},
        alerts: [],
        jobs: [],
        unavailable: true,
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sseData?.type === 'update' && sseData.hermes) {
      setSummary((current) => ({
        ...(current || { jobs: [] }),
        ...sseData.hermes,
        jobs: current?.jobs || [],
      } as HermesSummary));
      setLoading(false);
    }
  }, [sseData]);

  useEffect(() => {
    fetchSummary();
    if (isConnected) return;
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const sortedJobs = useMemo(() => {
    return (summary?.jobs || []).slice().sort((a, b) => {
      const aStatus = normalizeJobStatus(a);
      const bStatus = normalizeJobStatus(b);
      const rank = (statusRank[aStatus] ?? 3) - (statusRank[bStatus] ?? 3);
      if (rank !== 0) return rank;
      return String(b.last_run_at || '').localeCompare(String(a.last_run_at || ''));
    });
  }, [summary]);

  if (loading) return loadingView();

  const counts = summary?.counts || { total: 0, ok: 0, warning: 0, error: 0, paused: 0, unknown: 0 };
  const nodeEntries = Object.entries(summary?.nodes || {});
  const attentionCount = counts.error + counts.warning;
  const healthStatus = summary?.status || 'unknown';
  const healthIcon = healthStatus === 'error' ? XCircle : healthStatus === 'warning' ? AlertTriangle : CheckCircle;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Hermes Fleet</h1>
          <p className="text-sm text-muted-foreground">{summary?.message || 'Scheduled agent job health'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSummary} disabled={refreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatusCard
          title="Fleet"
          status={healthStatus}
          message={summary?.message}
          icon={healthIcon}
          stats={[
            { label: 'Errors', value: counts.error },
            { label: 'Warnings', value: counts.warning },
          ]}
        />
        <MetricCard title="Jobs" value={counts.total} subtitle={`${counts.ok} OK, ${counts.paused} paused`} icon={Bot} />
        <MetricCard title="Attention" value={attentionCount} subtitle={`${counts.unknown} unknown`} icon={AlertTriangle} />
        <MetricCard title="Last Update" value={summary?.last_update ? timeAgo(summary.last_update) : '—'} subtitle={summary?.checked_at ? `Checked ${timeAgo(summary.checked_at)}` : '—'} icon={Clock} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {nodeEntries.map(([node, item]) => {
          const status = item.status === 'success' ? 'ok' : item.status === 'error' ? 'error' : item.status === 'warning' ? 'warning' : 'unknown';
          return (
            <StatusCard
              key={node}
              title={node}
              status={status}
              message={item.message || `${item.job_count} jobs`}
              icon={Server}
              stats={[
                { label: 'Jobs', value: item.job_count },
                { label: 'Issues', value: item.issues?.length || 0 },
              ]}
            />
          );
        })}
      </div>

      {(summary?.alerts || []).length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-700" />
              Jobs Needing Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(summary?.alerts || []).slice(0, 6).map((job) => (
              <div key={`${job.node}-${job.job_id || job.slug}`} className="flex items-center justify-between gap-3 rounded-md border bg-background/60 p-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{job.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{job.summary_message || job.summary_title || job.last_status || 'No summary'}</div>
                </div>
                <Badge variant={normalizeJobStatus(job) === 'error' ? 'destructive' : 'outline'}>
                  {normalizeJobStatus(job)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4" />
              Scheduled Jobs
            </CardTitle>
            <Badge variant="outline">{sortedJobs.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {sortedJobs.length > 0 ? (
            <div>
              {sortedJobs.map((job) => (
                <JobRow key={`${job.node}-${job.job_id || job.slug || job.name}`} job={job} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {summary?.unavailable ? 'Hermes sidecar is unavailable.' : 'No Hermes jobs returned.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
