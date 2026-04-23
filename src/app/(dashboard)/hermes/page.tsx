'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, Bot, CheckCircle, Clock, DollarSign, RefreshCw, Search, Server, XCircle } from 'lucide-react';
import { useDashboard } from '../layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { formatDurationShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { HermesActivityResponse, HermesCostSummary, HermesHealthStatus, HermesJob, HermesRun, HermesSummary } from '@/types/hermes';

const statusRank: Record<string, number> = { error: 0, warning: 1, stale: 1, overdue: 1, paused: 2, unknown: 3, ok: 4 };

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

function money(value?: number | null) {
  if (!Number.isFinite(value || NaN)) return '$0.00';
  return `$${(value || 0).toFixed(value && value >= 10 ? 2 : 3)}`;
}

function JobRow({ job }: { job: HermesJob }) {
  const status = normalizeJobStatus(job);
  const badge = badgeFor(status);
  const message = job.summary_message || job.summary_title || job.model || 'No recent summary';
  const href = `/hermes/jobs/${encodeURIComponent(job.job_id || job.slug || job.name)}`;

  return (
    <Link
      href={href}
      className="grid gap-3 border-b py-3 text-sm transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[minmax(0,1.7fr)_8rem_8rem_9rem_7rem] md:items-center"
    >
      <div className="min-w-0 px-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate font-medium">{job.name}</div>
          <Badge variant={badge.variant} className={cn('shrink-0', badge.className)}>
            {status}
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={message}>
          {message}
        </div>
      </div>
      <div className="px-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">{job.node || 'hq'}</div>
        <div>{job.provider || 'provider n/a'}</div>
      </div>
      <div className="px-2 text-xs text-muted-foreground">
        <div>Last {timeAgo(job.last_run_at)}</div>
        <div>Age {formatDurationShort((job.age_minutes || 0) * 60)}</div>
      </div>
      <div className="px-2 text-xs text-muted-foreground">
        <div>Next {timeAgo(job.next_run_at)}</div>
        <div>{job.schedule_display || 'schedule n/a'}</div>
      </div>
      <div className="px-2 text-xs text-muted-foreground">
        <div>{job.model || 'model n/a'}</div>
      </div>
    </Link>
  );
}

function ActivityTicker({ events }: { events: HermesRun[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4" />
          Live Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground">No recent activity.</div>
        ) : (
          events.slice(0, 20).map((event) => (
            <Link
              key={event.session_id}
              href={`/hermes/jobs/${encodeURIComponent(event.job_id || event.job_slug || '')}`}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] gap-2 rounded-md border p-2 text-xs hover:bg-muted/40"
            >
              <div className="text-muted-foreground">{event.started_at ? new Date(event.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
              <div className="min-w-0">
                <div className="truncate font-medium">{event.job_name || event.job_id}</div>
                <div className="truncate text-muted-foreground">{event.model || 'model n/a'} · {event.duration_ms ? `${Math.round(event.duration_ms / 1000)}s` : event.status}</div>
              </div>
              <div className="text-right text-muted-foreground">{money(event.estimated_cost_usd)}</div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
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
        {[1, 2, 3, 4].map((id) => <Skeleton key={id} className="h-28" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export default function HermesPage() {
  const { data: sseData, isConnected } = useDashboard();
  const searchRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<HermesSummary | null>(null);
  const [costs, setCosts] = useState<HermesCostSummary | null>(null);
  const [activity, setActivity] = useState<HermesRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'risk' | 'last' | 'next' | 'name'>('risk');

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summaryResponse, costsResponse, activityResponse] = await Promise.all([
        fetch('/api/hermes/summary'),
        fetch('/api/hermes/costs?window=24h'),
        fetch('/api/hermes/activity?limit=20'),
      ]);
      if (!summaryResponse.ok) throw new Error(`Hermes summary HTTP ${summaryResponse.status}`);
      setSummary((await summaryResponse.json()) as HermesSummary);
      if (costsResponse.ok) setCosts((await costsResponse.json()) as HermesCostSummary);
      if (activityResponse.ok) setActivity(((await activityResponse.json()) as HermesActivityResponse).events || []);
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
  }, []);

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
    fetchAll();
    if (isConnected) return;
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, isConnected]);

  useEffect(() => {
    const source = new EventSource('/api/hermes/activity/stream');
    const onActivity = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as HermesActivityResponse;
        if (payload.events?.length) setActivity(payload.events);
      } catch {
        // Ignore malformed stream events.
      }
    };
    source.addEventListener('activity', onActivity);
    return () => source.close();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const jobs = useMemo(() => summary?.jobs || [], [summary?.jobs]);
  const nodes = useMemo(() => Array.from(new Set(jobs.map((job) => job.node).filter(Boolean))) as string[], [jobs]);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => statusFilter === 'all' || normalizeJobStatus(job) === statusFilter)
      .filter((job) => nodeFilter === 'all' || job.node === nodeFilter)
      .filter((job) => {
        if (!needle) return true;
        return [job.name, job.slug, job.job_id, job.model, job.provider, ...(job.skills || [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .slice()
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'last') return String(b.last_run_at || '').localeCompare(String(a.last_run_at || ''));
        if (sortBy === 'next') return String(a.next_run_at || '').localeCompare(String(b.next_run_at || ''));
        const rank = (statusRank[normalizeJobStatus(a)] ?? 3) - (statusRank[normalizeJobStatus(b)] ?? 3);
        return rank || String(b.last_run_at || '').localeCompare(String(a.last_run_at || ''));
      });
  }, [jobs, nodeFilter, query, sortBy, statusFilter]);

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
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/hermes/costs">
              <DollarSign className="mr-2 h-4 w-4" />
              Costs
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatusCard title="Fleet" status={healthStatus} message={summary?.message} icon={healthIcon} stats={[{ label: 'Errors', value: counts.error }, { label: 'Warnings', value: counts.warning }]} />
        <MetricCard title="Jobs" value={counts.total} subtitle={`${counts.ok} OK, ${counts.paused} paused`} icon={Bot} />
        <MetricCard title="Cost Today" value={money(costs?.total_cost_usd)} subtitle={`${costs?.run_count || 0} runs`} icon={DollarSign} />
        <MetricCard title="Last Update" value={summary?.last_update ? timeAgo(summary.last_update) : '—'} subtitle={summary?.checked_at ? `Checked ${timeAgo(summary.checked_at)}` : '—'} icon={Clock} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {nodeEntries.map(([node, item]) => {
              const status = item.status === 'success' ? 'ok' : item.status === 'error' ? 'error' : item.status === 'warning' ? 'warning' : 'unknown';
              return (
                <StatusCard key={node} title={node} status={status} message={item.message || `${item.job_count} jobs`} icon={Server} stats={[{ label: 'Jobs', value: item.job_count }, { label: 'Issues', value: item.issues?.length || 0 }]} />
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4" />
                  Scheduled Jobs
                </CardTitle>
                <Badge variant="outline">{filteredJobs.length} shown</Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs" className="pl-8" />
                </div>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border bg-background px-3 text-sm">
                  <option value="all">All statuses</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="paused">Paused</option>
                  <option value="unknown">Unknown</option>
                  <option value="ok">OK</option>
                </select>
                <select value={nodeFilter} onChange={(event) => setNodeFilter(event.target.value)} className="rounded-md border bg-background px-3 text-sm">
                  <option value="all">All nodes</option>
                  {nodes.map((node) => <option key={node} value={node}>{node}</option>)}
                </select>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-md border bg-background px-3 text-sm">
                  <option value="risk">Risk first</option>
                  <option value="last">Last run</option>
                  <option value="next">Next run</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredJobs.length > 0 ? (
                <div>{filteredJobs.map((job) => <JobRow key={`${job.node}-${job.job_id || job.slug || job.name}`} job={job} />)}</div>
              ) : (
                <div className="text-sm text-muted-foreground">{summary?.unavailable ? 'Hermes sidecar is unavailable.' : 'No Hermes jobs match the current filters.'}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <StatusCard title="Attention" status={attentionCount > 0 ? 'warning' : 'ok'} message={`${attentionCount} jobs need review`} icon={AlertTriangle} stats={[{ label: 'Unknown', value: counts.unknown }, { label: 'Alerts', value: summary?.alerts.length || 0 }]} />
          <ActivityTicker events={activity} />
        </div>
      </div>
    </div>
  );
}
