'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CronStatusBadge } from '@/components/crons/CronStatusBadge';
import { CronRunRow } from '@/components/crons/CronRunRow';
import { CronActions } from '@/components/crons/CronActions';
import { formatDistanceToNow } from 'date-fns';
import type { CronJobDetailResponse } from '@/types/cron';

interface PageProps {
  params: Promise<{ host: string; jobId: string }>;
}

export default function CronDetailPage({ params }: PageProps) {
  const { host, jobId } = use(params);
  const [data, setData] = useState<CronJobDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(
        `/api/crons/${encodeURIComponent(host)}/${encodeURIComponent(jobId)}?limit=50`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          setError('Job not found — it may have been pruned.');
          return;
        }
        if (res.status === 401) {
          setError('Not signed in.');
          return;
        }
        throw new Error(`Request failed: ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [host, jobId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/crons"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All scheduled jobs
        </Link>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data ? (
        <DetailBody data={data} onRefresh={load} />
      ) : null}
    </div>
  );
}

function DetailBody({ data, onRefresh }: { data: CronJobDetailResponse; onRefresh: () => void }) {
  const { job, history } = data;
  const inv = job.inventory;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{inv.name}</h1>
            <CronStatusBadge status={job.status} />
          </div>
          {inv.description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{inv.description}</p>
          ) : null}
          {inv.tags && inv.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {inv.tags.map((t) => (
                <Badge key={t} variant="outline" className="px-1 py-0 text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <CronActions inv={inv} onRefresh={onRefresh} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Host" value={inv.host} />
            <Field label="Source" value={inv.source} />
            <Field label="Owner" value={inv.owner || '—'} />
            <Field
              label="Schedule"
              value={
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {inv.schedule_display || inv.schedule}
                </code>
              }
            />
            <Field
              label="Next run"
              value={inv.next_run_at ? formatDistanceToNow(new Date(inv.next_run_at), { addSuffix: true }) : '—'}
            />
            <Field
              label="Severity if missing"
              value={inv.severity_if_missing ? <Badge variant="outline">{inv.severity_if_missing}</Badge> : '—'}
            />
            <Field label="Log path" value={inv.log_path ? <code className="text-xs">{inv.log_path}</code> : '—'} />
            <Field
              label="Runbook"
              value={
                inv.runbook_url ? (
                  <a
                    className="text-blue-500 underline-offset-2 hover:underline"
                    href={inv.runbook_url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    open
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <Field
              label="Discovered"
              value={formatDistanceToNow(new Date(inv.discovered_at), { addSuffix: true })}
            />
            <Field
              label="Last seen"
              value={formatDistanceToNow(new Date(inv.last_seen_at), { addSuffix: true })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Command</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {inv.command}
            </pre>
            {inv.raw && inv.raw !== inv.command ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  raw entry
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/30 p-2 text-[11px] whitespace-pre-wrap">
                  {inv.raw}
                </pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Run history ({history.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {history.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No runs recorded yet. The collector will detect runs the next time the job fires.
            </div>
          ) : (
            history.map((run) => <CronRunRow key={run.runId} run={run} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}
