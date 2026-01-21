'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

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

interface SiteHealthSummary {
  allHealthy: boolean;
  downCount: number;
  sites: SiteHealth[];
}

interface SiteHealthCardProps {
  data: SiteHealthSummary | null;
  compact?: boolean;
}

const statusConfig = {
  healthy: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    badge: 'default' as const,
  },
  degraded: {
    icon: AlertCircle,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    badge: 'secondary' as const,
  },
  down: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    badge: 'destructive' as const,
  },
  unknown: {
    icon: Clock,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    badge: 'secondary' as const,
  },
};

export function SiteHealthCard({ data, compact = false }: SiteHealthCardProps) {
  if (!data || data.sites.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Site Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sites to monitor</p>
        </CardContent>
      </Card>
    );
  }

  const healthyCount = data.sites.filter(s => s.status === 'healthy').length;
  const totalCount = data.sites.length;

  if (compact) {
    return (
      <Card className={data.allHealthy ? 'border-green-500/30' : 'border-red-500/30'}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Sites</span>
            </div>
            <div className="flex items-center gap-2">
              {data.allHealthy ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {healthyCount}/{totalCount} Healthy
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {data.downCount} Down
                </Badge>
              )}
            </div>
          </div>
          {!data.allHealthy && (
            <div className="mt-3 space-y-1">
              {data.sites
                .filter(s => s.status === 'down')
                .slice(0, 3)
                .map(site => (
                  <div key={site.fqdn} className="text-sm text-red-500 truncate">
                    {site.name}: {site.error || 'Unreachable'}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Site Health
          </CardTitle>
          <Badge variant={data.allHealthy ? 'default' : 'destructive'}>
            {healthyCount}/{totalCount} Healthy
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {data.sites.map(site => {
            const config = statusConfig[site.status];
            const StatusIcon = config.icon;

            return (
              <div
                key={site.fqdn}
                className={`flex items-center justify-between p-2 rounded-md ${config.bg}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon className={`h-4 w-4 shrink-0 ${config.color}`} />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{site.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {site.fqdn.replace('https://', '').replace('http://', '')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {site.responseTimeMs !== undefined && site.status === 'healthy' && (
                    <span className="text-xs text-muted-foreground">
                      {site.responseTimeMs}ms
                    </span>
                  )}
                  {site.httpStatus && (
                    <Badge variant={config.badge} className="text-xs">
                      {site.httpStatus}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
