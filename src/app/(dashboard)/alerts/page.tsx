'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, AlertTriangle, CheckCircle, Clock, ShieldOff, RefreshCw } from 'lucide-react';

type AlertSeverity = 'critical' | 'warning' | 'info' | 'unknown';
type AlertState = 'firing' | 'suppressed' | 'unknown';

interface NormalizedAlert {
  fingerprint?: string;
  name: string;
  severity: AlertSeverity;
  state: AlertState;
  startsAt?: string;
  endsAt?: string;
  summary?: string;
  description?: string;
  generatorURL?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  silencedBy: string[];
  inhibitedBy: string[];
}

interface AlertmanagerSummary {
  status: 'ok' | 'warning' | 'error' | 'unknown';
  message: string;
  fetchedAt: string;
  total: number;
  firing: number;
  suppressed: number;
  bySeverity: Record<AlertSeverity, number>;
  alerts: NormalizedAlert[];
}

function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function ageSeconds(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 1000;
}

const severityBadge: Record<AlertSeverity, { variant: 'destructive' | 'secondary' | 'default' | 'outline'; label: string }> = {
  critical: { variant: 'destructive', label: 'critical' },
  warning: { variant: 'secondary', label: 'warning' },
  info: { variant: 'default', label: 'info' },
  unknown: { variant: 'outline', label: 'unknown' },
};

const stateBadge: Record<AlertState, { variant: 'destructive' | 'secondary' | 'default' | 'outline'; label: string; icon: typeof AlertTriangle }> = {
  firing: { variant: 'destructive', label: 'firing', icon: AlertTriangle },
  suppressed: { variant: 'secondary', label: 'suppressed', icon: ShieldOff },
  unknown: { variant: 'outline', label: 'unknown', icon: Clock },
};

export default function AlertsPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [data, setData] = useState<AlertmanagerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/alertmanager/alerts?limit=200');
      if (res.ok) {
        const payload = (await res.json()) as AlertmanagerSummary;
        setData(payload);
      }
    } catch (error) {
      console.error('Failed to fetch alertmanager alerts:', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sseData?.type === 'update' && sseData.alerts !== undefined) {
      setData((sseData.alerts || null) as AlertmanagerSummary | null);
      setLoading(false);
    }
  }, [sseData]);

  useEffect(() => {
    if (isConnected) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const firingAlerts = useMemo(() => (data?.alerts || []).filter((a) => a.state === 'firing'), [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const statusTone =
    data?.status === 'error'
      ? 'border-red-500/50 bg-red-500/10'
      : data?.status === 'warning'
      ? 'border-yellow-500/50 bg-yellow-500/10'
      : 'border-green-500/30 bg-green-500/5';

  const hasFiring = (data?.firing || 0) > 0;
  const hasCritical = (data?.bySeverity?.critical || 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Alerts</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={refreshing}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Card className={statusTone}>
        <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-2">
              {hasFiring ? (
                <AlertTriangle className={`h-5 w-5 ${hasCritical ? 'text-red-500' : 'text-yellow-500'}`} />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              <span className="truncate">{data?.message || 'No alert data'}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Fetched {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : '—'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={hasFiring ? 'destructive' : 'default'}>{data?.firing || 0} firing</Badge>
            <Badge variant="secondary">{data?.suppressed || 0} suppressed</Badge>
            <Badge variant="outline">{data?.total || 0} total</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data?.bySeverity?.critical || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data?.bySeverity?.warning || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Info</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data?.bySeverity?.info || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Suppressed</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data?.suppressed || 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Firing Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {firingAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No firing alerts.</p>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {firingAlerts.map((alert) => {
                const sev = severityBadge[alert.severity];
                const st = stateBadge[alert.state];
                const StateIcon = st.icon;
                const age = ageSeconds(alert.startsAt);
                const key = alert.fingerprint || `${alert.name}-${alert.startsAt || ''}`;

                return (
                  <div key={key} className="flex items-start justify-between gap-3 p-3 rounded-md border bg-muted/20">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <StateIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="font-medium text-sm truncate" title={alert.name}>{alert.name}</div>
                        <Badge variant={sev.variant} className="shrink-0">{sev.label}</Badge>
                        <Badge variant={st.variant} className="shrink-0">{st.label}</Badge>
                        {age !== null && (
                          <Badge variant="outline" className="shrink-0">since {formatDuration(age)}</Badge>
                        )}
                      </div>
                      {(alert.summary || alert.description) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {alert.summary || alert.description}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(alert.labels || {})
                          .filter(([k]) => !['alertname', 'severity', 'level'].includes(k))
                          .slice(0, 6)
                          .map(([k, v]) => (
                            <Badge key={`${key}-${k}`} variant="outline" className="text-[10px] font-mono">
                              {k}={v}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    {alert.generatorURL && (
                      <a
                        href={alert.generatorURL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                      >
                        source
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

