'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { NextDnsCoverageSummary, NextDnsLogEntry, NextDnsLogQueryResult } from '@/types/nextdns';

export function NextDnsLogsPanel() {
  const [coverage, setCoverage] = useState<NextDnsCoverageSummary | null>(null);
  const [logs, setLogs] = useState<NextDnsLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceOptions = useMemo(() => coverage?.devices || [], [coverage]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '150' });
      if (search.trim()) params.set('search', search.trim());
      if (device) params.set('device', device);
      if (status) params.set('status', status);

      const [coverageRes, logsRes] = await Promise.all([
        fetch('/api/home-network/dns-coverage', { cache: 'no-store' }),
        fetch(`/api/home-network/dns-logs?${params.toString()}`, { cache: 'no-store' }),
      ]);

      if (!coverageRes.ok) throw new Error(`Coverage request failed: ${coverageRes.status}`);
      if (!logsRes.ok) throw new Error(`Log request failed: ${logsRes.status}`);

      setCoverage((await coverageRes.json()) as NextDnsCoverageSummary);
      const logPayload = (await logsRes.json()) as NextDnsLogQueryResult;
      setLogs(logPayload.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NextDNS logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 60000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, status]);

  const alertCount = coverage?.alerts.length || 0;
  const configured = coverage?.configured !== false;

  return (
    <Card>
      <CardHeader className="gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <CardTitle>Child Device DNS Logs</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Stored NextDNS activity with alerts when expected child devices stop reporting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={alertCount > 0 ? 'destructive' : 'secondary'} className="gap-1">
            {alertCount > 0 ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {alertCount} coverage alert{alertCount === 1 ? '' : 's'}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            {error}
          </div>
        ) : null}

        {!configured ? (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Configure `NEXTDNS_LOG_DB_URL`, `NEXTDNS_API_KEY`, and `NEXTDNS_PROFILE_IDS` to enable stored DNS logs.
          </div>
        ) : coverage && coverage.devices.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {coverage.devices.map((row) => (
              <div key={row.device.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 font-medium">{row.device.name}</div>
                  <Badge variant={row.status === 'ok' ? 'secondary' : 'destructive'}>
                    {row.status === 'ok' ? 'active' : row.status}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {row.last_seen_at ? (
                    <>
                      <div>{row.minutes_since_seen} min since last DNS query</div>
                      <div className="truncate font-mono">{row.last_domain || 'domain unavailable'}</div>
                    </>
                  ) : (
                    <div>No stored NextDNS activity yet</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Configure `NEXTDNS_EXPECTED_CHILD_DEVICES` to enable missing-coverage alerts.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') fetchData();
              }}
              className="pl-8"
              placeholder="Search domains"
            />
          </div>
          <select
            value={device}
            onChange={(event) => setDevice(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All devices</option>
            {deviceOptions.map((row) => {
              const value = row.device.device_ids[0] || row.device.device_names[0] || row.device.name;
              return (
                <option key={row.device.id} value={value}>
                  {row.device.name}
                </option>
              );
            })}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="blocked">Blocked</option>
            <option value="allowed">Allowed</option>
            <option value="default">Default</option>
            <option value="error">Error</option>
          </select>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            Search
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Device</th>
                <th className="py-2 pr-4 font-medium">Domain</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Protocol</th>
                <th className="py-2 pr-4 font-medium">Profile</th>
                <th className="py-2 pr-4 font-medium">Client IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={`${log.profile_id}-${log.id}`} className="border-b last:border-0">
                  <td className="py-3 pr-4 whitespace-nowrap">{formatTime(log.timestamp)}</td>
                  <td className="py-3 pr-4">
                    <div>{log.device_name || log.client || 'Unidentified'}</div>
                    <div className="font-mono text-xs text-muted-foreground">{log.device_id || '—'}</div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{log.domain}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={log.status === 'blocked' ? 'destructive' : 'outline'}>{log.status}</Badge>
                  </td>
                  <td className="py-3 pr-4">{log.protocol || '—'}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{log.profile_id}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{log.client_ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No stored DNS logs match.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
