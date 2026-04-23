'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Bot, Clock, DollarSign, Pause, Play, RefreshCw, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { formatDurationShort } from '@/lib/format';
import type { HermesActionResponse, HermesJobDetail, HermesRun } from '@/types/hermes';

function timeAgo(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return formatDistanceToNow(date, { addSuffix: true });
}

function money(value?: number | null) {
  if (!Number.isFinite(value || NaN)) return '$0.00';
  return `$${(value || 0).toFixed(value && value >= 10 ? 2 : 4)}`;
}

function statusBadge(status?: string | null) {
  if (status === 'error') return <Badge variant="destructive">error</Badge>;
  if (status === 'warning') return <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700">warning</Badge>;
  if (status === 'running') return <Badge variant="outline">running</Badge>;
  if (status === 'ok') return <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">ok</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">{status || 'unknown'}</Badge>;
}

function totalCost(runs: HermesRun[]) {
  return runs.reduce((sum, run) => sum + Number(run.actual_cost_usd || run.estimated_cost_usd || 0), 0);
}

export default function HermesJobPage() {
  const params = useParams();
  const id = String(params.id || '');
  const [detail, setDetail] = useState<HermesJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const fetchDetail = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/hermes/jobs/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setDetail((await response.json()) as HermesJobDetail);
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Failed to fetch job detail' });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const runAction = async (action: 'pause' | 'resume' | 'run-now') => {
    const label = action === 'run-now' ? 'run now' : action;
    if (!window.confirm(`${label} ${detail?.job.name || 'this Hermes job'}?`)) return;
    setActioning(action);
    try {
      const response = await fetch(`/api/hermes/jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as Partial<HermesActionResponse> & { error?: string };
      if (!response.ok || payload.status === 'error') throw new Error(payload.error || payload.result?.stderr || `Action failed: ${response.status}`);
      setNotice({ kind: 'success', message: `${label} queued for ${payload.result?.job || detail?.job.name || 'job'}` });
      setTimeout(fetchDetail, 1200);
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Action failed' });
    } finally {
      setActioning(null);
    }
  };

  const runs = useMemo(() => detail?.runs || [], [detail?.runs]);
  const latestRun = runs[0];
  const averageDuration = useMemo(() => {
    const values = runs.map((run) => run.duration_ms).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [runs]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}</div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild><Link href="/hermes"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Hermes job detail is unavailable.</CardContent></Card>
      </div>
    );
  }

  const job = detail.job;
  const isPaused = job.enabled === false || job.state === 'paused' || job.status === 'paused';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href="/hermes"><ArrowLeft className="mr-2 h-4 w-4" />Hermes Fleet</Link>
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{job.name}</h1>
            {statusBadge(job.status || job.last_status)}
          </div>
          <p className="text-sm text-muted-foreground">{job.node || 'heavisidelinux'} · {job.provider || 'provider n/a'} · {job.model || 'model n/a'} · {job.schedule_display || 'schedule n/a'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchDetail} disabled={refreshing}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => runAction('run-now')} disabled={!!actioning}>
            <RotateCw className="mr-2 h-4 w-4" />Run now
          </Button>
          {isPaused ? (
            <Button variant="outline" size="sm" onClick={() => runAction('resume')} disabled={!!actioning}>
              <Play className="mr-2 h-4 w-4" />Resume
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => runAction('pause')} disabled={!!actioning}>
              <Pause className="mr-2 h-4 w-4" />Pause
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <Card className={notice.kind === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'}>
          <CardContent className="py-3 text-sm">{notice.message}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Last Run" value={latestRun?.started_at ? timeAgo(latestRun.started_at) : 'Never'} subtitle={latestRun?.status || 'unknown'} icon={Clock} />
        <MetricCard title="Next Run" value={job.next_run_at ? timeAgo(job.next_run_at) : '—'} subtitle={job.schedule_display || '—'} icon={Bot} />
        <MetricCard title="Run Cost" value={money(latestRun?.actual_cost_usd || latestRun?.estimated_cost_usd)} subtitle="latest run" icon={DollarSign} />
        <MetricCard title="Avg Duration" value={averageDuration ? formatDurationShort(Math.round(averageDuration / 1000)) : '—'} subtitle={`${runs.length} runs loaded`} icon={Clock} />
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="output">Latest Output</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="runs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.session_id}>
                      <TableCell>{run.started_at ? timeAgo(run.started_at) : '—'}</TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                      <TableCell>{run.duration_ms ? formatDurationShort(Math.round(run.duration_ms / 1000)) : '—'}</TableCell>
                      <TableCell>{(run.input_tokens + run.output_tokens + run.cache_read_tokens + run.cache_write_tokens).toLocaleString()}</TableCell>
                      <TableCell>{money(run.actual_cost_usd || run.estimated_cost_usd)}</TableCell>
                      <TableCell className="max-w-[16rem] truncate font-mono text-xs">{run.session_id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="output">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Latest Output</CardTitle>
              <div className="text-xs text-muted-foreground">{detail.latest_output.output_path || 'No output path'}</div>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[34rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">{detail.latest_output.content || 'No output recorded.'}</pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Prompt</CardTitle>
              <div className="text-xs text-muted-foreground">{detail.prompt.path || job.prompt_file || 'Prompt file unavailable'}</div>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[34rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">{detail.prompt.content || 'Prompt content unavailable.'}</pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">Job ID:</span> <span className="font-mono">{job.job_id}</span></div>
              <div><span className="text-muted-foreground">Slug:</span> {job.slug || '—'}</div>
              <div><span className="text-muted-foreground">Deliver:</span> {job.deliver || '—'}</div>
              <div><span className="text-muted-foreground">Max stale:</span> {job.max_stale_minutes ? `${job.max_stale_minutes}m` : '—'}</div>
              <div><span className="text-muted-foreground">Created:</span> {job.created_at ? timeAgo(job.created_at) : '—'}</div>
              <div><span className="text-muted-foreground">Completed:</span> {job.repeat?.completed ?? '—'}</div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Skills:</span> {(job.skills || []).join(', ') || '—'}</div>
              <div className="md:col-span-2"><span className="text-muted-foreground">50-run cost:</span> {money(totalCost(runs))}</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
