'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeNetworkSummary } from '@/components/home-network/HomeNetworkSummary';
import { RouterTable } from '@/components/home-network/RouterTable';
import { ClientAssociations } from '@/components/home-network/ClientAssociations';
import { DnsPolicyPanel } from '@/components/home-network/DnsPolicyPanel';
import { WarningsPanel } from '@/components/home-network/WarningsPanel';
import { WindowsLaptopPanel } from '@/components/home-network/WindowsLaptopPanel';
import type { HomeNetworkReadResponse } from '@/types/home-network';

export default function HomeNetworkPage() {
  const [data, setData] = useState<HomeNetworkReadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const res = await fetch('/api/home-network', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      setData((await res.json()) as HomeNetworkReadResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load home network data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 30000);
    return () => window.clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Home Network</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Home Network</h1>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {error || 'Home network data unavailable'}
        </div>
      </div>
    );
  }

  const snapshot = data.snapshot;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Home Network</h1>
          <p className="text-sm text-muted-foreground">
            {snapshot ? `Collected by ${snapshot.collector_host} at ${new Date(snapshot.collected_at).toLocaleString()}` : 'No snapshot yet'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <HomeNetworkSummary data={data} />

      {snapshot ? (
        <>
          <RouterTable routers={snapshot.routers} />
          <WindowsLaptopPanel laptops={snapshot.windows_laptops || []} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <ClientAssociations clients={snapshot.clients} />
            <div className="space-y-6">
              <DnsPolicyPanel dns={snapshot.dns} />
              <WarningsPanel warnings={data.computed_warnings} />
              {data.computed_monitoring_warnings && data.computed_monitoring_warnings.length > 0 ? (
                <WarningsPanel title="Monitoring Notes" warnings={data.computed_monitoring_warnings} />
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <WarningsPanel warnings={data.computed_warnings.length > 0 ? data.computed_warnings : ['No snapshot has been ingested yet.']} />
      )}
    </div>
  );
}
