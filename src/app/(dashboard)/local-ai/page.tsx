'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { LocalAIHostCard } from '@/components/local-ai/LocalAIHostCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { LocalAIGpuLeaseSnapshot } from '@/lib/prometheus/client';

const REFRESH_INTERVAL_MS = 30_000;

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export default function LocalAIPage() {
  const [snapshot, setSnapshot] = useState<LocalAIGpuLeaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/local-ai/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(`status request returned ${response.status}`);
      setSnapshot((await response.json()) as LocalAIGpuLeaseSnapshot);
      setError(null);
    } catch (fetchError) {
      console.error('Failed to refresh Local AI status:', fetchError);
      setError('Unable to refresh Local AI status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(() => void fetchStatus(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Local AI</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Exclusive GPU ownership and demand state across the two local AI hosts.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void fetchStatus()}
          disabled={refreshing}
          aria-label="Refresh Local AI status"
        >
          <RefreshCw className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchStatus()}>
            Try again
          </Button>
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="space-y-4" aria-label="Loading Local AI status">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[420px] w-full" />
            <Skeleton className="h-[420px] w-full" />
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>{snapshot.summary.healthy} of 2 healthy</span>
                <span className="text-sm font-normal text-muted-foreground">
                  · Updated {new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
              <SummaryMetric label="Healthy" value={snapshot.summary.healthy} />
              <SummaryMetric label="Active" value={snapshot.summary.active} />
              <SummaryMetric label="Queued" value={snapshot.summary.queued} />
              <SummaryMetric label="Problems" value={snapshot.summary.problems} />
            </CardContent>
          </Card>

          <section aria-labelledby="local-ai-hosts-heading">
            <h2 id="local-ai-hosts-heading" className="sr-only">GPU hosts</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {snapshot.hosts.map((host) => (
                <LocalAIHostCard key={host.host} host={host} />
              ))}
            </div>
          </section>

          <Card className="border-dashed shadow-none hover:shadow-none">
            <CardContent className="flex gap-3 py-1 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                One workload owns each GPU. Active work is never preempted; media waits next, and idle text models unload after two minutes.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
