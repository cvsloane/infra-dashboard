'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Bell, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/dashboard/MetricCard';
import type { HermesActionLogResponse, HermesAlert, HermesAlertsResponse } from '@/types/hermes';

function timeAgo(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDistanceToNow(date, { addSuffix: true });
}

function statusBadge(status?: string | null) {
  if (status === 'error') return <Badge variant="destructive">error</Badge>;
  if (status === 'warning') return <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700">warning</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">{status || 'unknown'}</Badge>;
}

function alertHref(alert: HermesAlert) {
  if (alert.trace_url) return alert.trace_url;
  return null;
}

export default function HermesAlertsPage() {
  const [window, setWindow] = useState('24h');
  const [alerts, setAlerts] = useState<HermesAlertsResponse | null>(null);
  const [actions, setActions] = useState<HermesActionLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [alertsResponse, actionsResponse] = await Promise.all([
        fetch(`/api/hermes/alerts?window=${window}&limit=200`),
        fetch('/api/hermes/actions?limit=50'),
      ]);
      if (!alertsResponse.ok) throw new Error(`Alerts HTTP ${alertsResponse.status}`);
      setAlerts((await alertsResponse.json()) as HermesAlertsResponse);
      if (actionsResponse.ok) setActions((await actionsResponse.json()) as HermesActionLogResponse);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window]);

  const topJob = useMemo(() => alerts?.by_job?.[0], [alerts]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}</div>
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
          <h1 className="text-2xl font-bold">Hermes Alerts</h1>
          <p className="text-sm text-muted-foreground">Routed Hermes warnings, errors, and dashboard control audit events.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={window} onChange={(event) => setWindow(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={refreshing}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Alerts" value={(alerts?.alert_count || 0).toLocaleString()} subtitle={alerts?.window || window} icon={Bell} />
        <MetricCard title="Errors" value={(alerts?.error_count || 0).toLocaleString()} subtitle="routed events" icon={Bell} />
        <MetricCard title="Warnings" value={(alerts?.warning_count || 0).toLocaleString()} subtitle="routed events" icon={Bell} />
        <MetricCard title="Actions" value={(actions?.count || 0).toLocaleString()} subtitle="recent control events" icon={ShieldCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Alert Events</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(alerts?.alerts || []).map((alert) => {
                  const href = alertHref(alert);
                  return (
                    <TableRow key={`${alert.trace_id}-${alert.timestamp}-${alert.job}`}>
                      <TableCell>{timeAgo(alert.timestamp)}</TableCell>
                      <TableCell>{statusBadge(alert.status)}</TableCell>
                      <TableCell className="max-w-[18rem] truncate">
                        <div className="font-medium">{alert.job}</div>
                        <div className="truncate text-xs text-muted-foreground">{alert.title || alert.reason || 'No title'}</div>
                      </TableCell>
                      <TableCell>{alert.target_label || alert.target_key || 'local'}</TableCell>
                      <TableCell>{alert.router_status || alert.outcome || '—'}</TableCell>
                      <TableCell>
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">{alert.trace_id ? alert.trace_id.slice(0, 8) : '—'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Alerting Job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="font-medium">{topJob?.job || 'No alerts in window'}</div>
              <div className="text-muted-foreground">{topJob ? `${topJob.count} alerts · last ${timeAgo(topJob.last_at)}` : 'Quiet window'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Dashboard Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(actions?.actions || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No recent dashboard actions.</div>
              ) : (
                (actions?.actions || []).map((action, index) => (
                  <div key={`${String(action.timestamp)}-${index}`} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{String(action.action || 'action')}</span>
                      <Badge variant={action.ok ? 'outline' : 'destructive'}>{action.ok ? 'ok' : 'failed'}</Badge>
                    </div>
                    <div className="mt-1 truncate text-muted-foreground">{String(action.job_name || action.job_id || 'unknown job')}</div>
                    <div className="text-muted-foreground">{timeAgo(String(action.timestamp || ''))} · {String(action.actor || 'dashboard')}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
