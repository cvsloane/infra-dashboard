'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, DollarSign, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MetricCard } from '@/components/dashboard/MetricCard';
import type { HermesCostSummary } from '@/types/hermes';

function money(value?: number | null) {
  if (!Number.isFinite(value || NaN)) return '$0.00';
  return `$${(value || 0).toFixed(value && value >= 10 ? 2 : 4)}`;
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function HermesCostsPage() {
  const [window, setWindow] = useState('24h');
  const [data, setData] = useState<HermesCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCosts = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/hermes/costs?window=${window}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as HermesCostSummary);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(fetchCosts, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window]);

  const maxModelCost = useMemo(() => Math.max(0.000001, ...(data?.by_model || []).map((row) => row.cost_usd)), [data]);
  const maxDailyCost = useMemo(() => Math.max(0.000001, ...(data?.daily || []).map((row) => row.cost_usd)), [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}</div>
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
          <h1 className="text-2xl font-bold">Hermes Costs</h1>
          <p className="text-sm text-muted-foreground">Estimated from Hermes session token usage and the dashboard pricing table.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={window} onChange={(event) => setWindow(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchCosts} disabled={refreshing}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total Cost" value={money(data?.total_cost_usd)} subtitle={data?.window || window} icon={DollarSign} />
        <MetricCard title="Runs" value={(data?.run_count || 0).toLocaleString()} subtitle="Hermes cron sessions" icon={BarChart3} />
        <MetricCard title="Pricing" value={data?.pricing_version || '—'} subtitle="estimate source" icon={DollarSign} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cost By Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.by_model || []).map((row) => (
            <div key={`${row.provider}-${row.model}`} className="grid gap-2 text-sm md:grid-cols-[11rem_minmax(0,1fr)_6rem] md:items-center">
              <div className="min-w-0">
                <div className="truncate font-medium">{row.model}</div>
                <div className="text-xs text-muted-foreground">{row.provider} · {row.runs.toLocaleString()} runs</div>
              </div>
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-primary" style={{ width: `${Math.max(1, (row.cost_usd / maxModelCost) * 100)}%` }} />
              </div>
              <div className="text-right font-medium">{money(row.cost_usd)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.by_job_top_n || []).map((row) => (
                  <TableRow key={row.job_id}>
                    <TableCell className="max-w-[22rem] truncate">
                      <Link href={`/hermes/jobs/${encodeURIComponent(row.job_id)}`} className="font-medium hover:underline">{row.job_name}</Link>
                      <div className="text-xs text-muted-foreground">{row.node || 'node n/a'}</div>
                    </TableCell>
                    <TableCell>{row.runs.toLocaleString()}</TableCell>
                    <TableCell>{compactNumber(row.total_tokens)}</TableCell>
                    <TableCell>{money(row.cost_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daily Trend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.daily || []).map((row) => (
              <div key={row.date} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{row.date}</span>
                  <Badge variant="outline">{money(row.cost_usd)}</Badge>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-primary" style={{ width: `${Math.max(1, (row.cost_usd / maxDailyCost) * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
