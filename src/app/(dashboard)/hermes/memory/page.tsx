'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Brain, FileText, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/dashboard/MetricCard';
import type { HermesMemoryResponse } from '@/types/hermes';

function formatBytes(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${value} B`;
}

export default function HermesMemoryPage() {
  const [data, setData] = useState<HermesMemoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMemory = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/hermes/memory');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as HermesMemoryResponse);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const fileCount = (data?.agents || []).reduce((sum, agent) => sum + agent.file_count, 0);

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
          <h1 className="text-2xl font-bold">Hermes Memory</h1>
          <p className="text-sm text-muted-foreground">{data?.root || 'Memory root unavailable'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMemory} disabled={refreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Agents" value={data?.agent_count || 0} subtitle={data?.exists ? 'memory root present' : 'memory root missing'} icon={Brain} />
        <MetricCard title="Files" value={fileCount} subtitle="tracked memory files" icon={FileText} />
        <MetricCard title="Status" value={data?.status || 'unknown'} subtitle="sidecar read-only browser" icon={Brain} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.agents || []).map((agent) => (
          <Card key={agent.agent}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{agent.agent}</span>
                <Badge variant="outline">{agent.file_count} files</Badge>
              </CardTitle>
              <div className="truncate text-xs text-muted-foreground">{agent.path}</div>
            </CardHeader>
            <CardContent className="space-y-3">
              {agent.files.length === 0 ? (
                <div className="text-sm text-muted-foreground">No memory files recorded.</div>
              ) : agent.files.map((file) => (
                <div key={file.path} className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 truncate font-medium">{file.relative_path}</div>
                    <Badge variant="outline">{formatBytes(file.size_bytes)}</Badge>
                  </div>
                  {file.preview && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-muted-foreground">{file.preview}</pre>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
