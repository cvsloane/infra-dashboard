'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, CircleAlert, FileCheck, RefreshCw, Route, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/dashboard/MetricCard';
import type { HermesRoadmapItem, HermesRoadmapResponse } from '@/types/hermes';

function statusBadge(status: string) {
  if (status === 'active' || status === 'success') return <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700">{status}</Badge>;
  if (status === 'warning' || status === 'partial' || status === 'ready') return <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700">{status}</Badge>;
  if (status === 'error') return <Badge variant="destructive">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function RoadmapRow({ item }: { item: HermesRoadmapItem }) {
  return (
    <div className="grid gap-3 border-b py-3 text-sm last:border-0 md:grid-cols-[minmax(0,1fr)_7rem_8rem_minmax(0,1.1fr)] md:items-center">
      <div className="min-w-0">
        <div className="font-medium">{item.area}</div>
        <div className="truncate text-xs text-muted-foreground">{item.surface}</div>
      </div>
      <div>{statusBadge(item.status)}</div>
      <div className="text-xs text-muted-foreground">{item.configured_count} / {item.expected_count}</div>
      <div className="text-xs text-muted-foreground">{item.remaining || 'Live configuration present'}</div>
    </div>
  );
}

export default function HermesRoadmapPage() {
  const [data, setData] = useState<HermesRoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoadmap = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/hermes/roadmap');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as HermesRoadmapResponse);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoadmap();
    const interval = setInterval(fetchRoadmap, 60000);
    return () => clearInterval(interval);
  }, []);

  const items = useMemo(() => data?.activation_matrix.details.items || [], [data]);
  const activeCount = items.filter((item) => item.status === 'active').length;
  const remainingCount = items.filter((item) => item.remaining).length;
  const warnings = data?.reflection.details.warnings || [];
  const lowScoreCount = data?.reflection.metrics.low_score_count || 0;

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
          <h1 className="text-2xl font-bold">Hermes Roadmap</h1>
          <p className="text-sm text-muted-foreground">{data?.activation_matrix.message || 'Roadmap activation status unavailable.'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRoadmap} disabled={refreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Active Areas" value={activeCount} subtitle={`${items.length} tracked`} icon={Route} />
        <MetricCard title="Remaining" value={remainingCount} subtitle="configuration gates" icon={CircleAlert} />
        <MetricCard title="Tool Hooks" value={data?.reflection.metrics.tool_hook_event_count_48h || 0} subtitle="last 48h" icon={CheckCircle} />
        <MetricCard title="Low Scores" value={lowScoreCount} subtitle="latest evaluator audit" icon={lowScoreCount > 0 ? XCircle : FileCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Activation Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            {items.map((item) => <RoadmapRow key={item.area} item={item} />)}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reflection Layer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                {statusBadge(data?.reflection.status || 'unknown')}
              </div>
              <div className="text-muted-foreground">{data?.reflection.message}</div>
              {warnings.length > 0 && (
                <div className="space-y-2">
                  {warnings.map((warning) => <div key={warning} className="rounded-md border p-2 text-xs">{warning}</div>)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rubrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {Object.entries(data?.reflection.details.rubrics || {}).map(([path, present]) => (
                <div key={path} className="flex items-center justify-between gap-3">
                  <span className="truncate text-muted-foreground">{path}</span>
                  {statusBadge(present ? 'active' : 'error')}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
