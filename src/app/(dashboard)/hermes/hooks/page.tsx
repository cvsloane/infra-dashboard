'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, History, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/dashboard/MetricCard';
import type { HermesHookHistoryResponse } from '@/types/hermes';

export default function HermesHooksPage() {
  const [window, setWindow] = useState('24h');
  const [data, setData] = useState<HermesHookHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHooks = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/hermes/hooks?window=${window}&limit=200`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as HermesHookHistoryResponse);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHooks();
    const interval = setInterval(fetchHooks, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href="/hermes"><ArrowLeft className="mr-2 h-4 w-4" />Hermes Fleet</Link>
          </Button>
          <h1 className="text-2xl font-bold">Hermes Hooks</h1>
          <p className="text-sm text-muted-foreground">Tool and hook telemetry from local Hermes traces.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={window} onChange={(event) => setWindow(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchHooks} disabled={refreshing}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Events" value={data?.event_count || 0} subtitle={data?.window || window} icon={History} />
        <MetricCard title="Event Types" value={data?.by_event.length || 0} subtitle="tool and hook names" icon={Wrench} />
        <MetricCard title="Status" value={data?.status || 'unknown'} subtitle="trace spool read" icon={History} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.events || []).map((event, index) => (
                  <TableRow key={`${event.trace_id}-${event.timestamp}-${index}`}>
                    <TableCell className="whitespace-nowrap text-xs">{event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}</TableCell>
                    <TableCell><Badge variant="outline">{event.event}</Badge></TableCell>
                    <TableCell className="max-w-[14rem] truncate">{event.job || '—'}</TableCell>
                    <TableCell>{event.tool || '—'}</TableCell>
                    <TableCell>{event.status || '—'}</TableCell>
                    <TableCell>
                      {event.trace_url ? <a href={event.trace_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open</a> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.by_event || []).map((item) => (
              <div key={item.event} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.event}</span>
                <Badge variant="outline">{item.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
