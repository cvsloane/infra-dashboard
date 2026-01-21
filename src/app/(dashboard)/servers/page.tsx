'use client';

import { useEffect, useState } from 'react';
import { VPSCard } from '@/components/vps/VPSCard';
import { SiteHealthCard } from '@/components/health/SiteHealthCard';
import { AutohealSettings } from '@/components/health/AutohealSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '../layout';

interface VPSMetrics {
  hostname: string;
  cpu: {
    usagePercent: number;
    cores: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
    usedPercent: number;
  };
  disk: {
    totalBytes: number;
    availableBytes: number;
    usedPercent: number;
    mountPoint: string;
  };
  load: {
    load1: number;
    load5: number;
    load15: number;
  };
  uptime: number;
}

interface SiteHealth {
  applicationUuid?: string;
  name: string;
  fqdn: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  httpStatus?: number;
  responseTimeMs?: number;
  sslValid?: boolean;
  lastChecked: string;
  error?: string;
}

interface ServersData {
  vps: {
    appsVps: VPSMetrics | null;
    dbVps: VPSMetrics | null;
  };
  sites: {
    allHealthy: boolean;
    downCount: number;
    sites: SiteHealth[];
  };
}

export default function ServersPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [data, setData] = useState<ServersData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sseData?.type === 'update' && sseData.vps) {
      const vps = sseData.vps;
      setData((prev) => ({
        vps,
        sites: prev?.sites || { allHealthy: true, downCount: 0, sites: [] },
      }));
      setLoading(false);
    }
  }, [sseData]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = isConnected ? '/api/servers/status?sitesOnly=true' : '/api/servers/status';
        const res = await fetch(url);
        if (res.ok) {
          const result = await res.json();
          const vps = isConnected && sseData?.vps ? sseData.vps : result.vps;
          setData({
            vps,
            sites: result.sites,
          });
        }
      } catch (error) {
        console.error('Failed to fetch servers data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, isConnected ? 60000 : 15000);
    return () => clearInterval(interval);
  }, [isConnected, sseData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Servers</h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Servers</h1>
        {isConnected && (
          <span className="flex items-center gap-2 text-sm text-green-500">
            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* VPS Status */}
      <div>
        <h2 className="text-lg font-semibold mb-4">VPS Health</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <VPSCard name="App Server" metrics={data?.vps?.appsVps || null} />
          <VPSCard name="DB Server" metrics={data?.vps?.dbVps || null} />
        </div>
      </div>

      {/* Site Health */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Site Health</h2>
        <SiteHealthCard data={data?.sites || null} />
      </div>

      {/* AutoHEAL Settings */}
      <div>
        <h2 className="text-lg font-semibold mb-4">AutoHEAL</h2>
        <AutohealSettings sites={data?.sites?.sites || []} />
      </div>
    </div>
  );
}
