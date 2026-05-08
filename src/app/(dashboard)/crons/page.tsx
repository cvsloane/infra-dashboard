'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CronStatsBar } from '@/components/crons/CronStatsBar';
import { CronTable } from '@/components/crons/CronTable';
import type { CronListResponse } from '@/types/cron';

interface ExtendedResponse extends CronListResponse {
  hermes_unavailable?: boolean;
  hermes_message?: string;
}

export default function CronsPage() {
  const [data, setData] = useState<ExtendedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await fetch('/api/crons');
      if (!res.ok) {
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
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scheduled jobs</h1>
          <p className="text-sm text-muted-foreground">
            User crontabs, system crontabs, systemd timers, and anacron — across the fleet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : error ? (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data ? (
        <>
          <CronStatsBar stats={data.stats} />
          {data.hermes_unavailable ? (
            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-700">
              Hermes-managed jobs are not currently visible:{' '}
              <span className="font-mono">{data.hermes_message || 'sidecar unavailable'}</span>.
              Raw cron + systemd timers below remain accurate.
            </div>
          ) : null}
          <CronTable jobs={data.jobs} />
        </>
      ) : null}
    </div>
  );
}
