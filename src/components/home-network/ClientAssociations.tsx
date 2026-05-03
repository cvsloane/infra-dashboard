'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { HomeNetworkClient } from '@/types/home-network';
import { formatMaybeNumber } from './status-utils';

interface ClientAssociationsProps {
  clients: HomeNetworkClient[];
}

export function ClientAssociations({ clients }: ClientAssociationsProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return clients;
    return clients.filter((client) =>
      [
        client.hostname,
        client.ip,
        client.mac,
        client.router_hostname,
        client.ssid,
        client.band,
        client.bssid,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [clients, normalizedQuery]);

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Client Associations</CardTitle>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
            placeholder="Search clients"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Client</th>
              <th className="py-2 pr-4 font-medium">IP</th>
              <th className="py-2 pr-4 font-medium">AP</th>
              <th className="py-2 pr-4 font-medium">SSID</th>
              <th className="py-2 pr-4 font-medium">Band</th>
              <th className="py-2 pr-4 font-medium">Signal</th>
              <th className="py-2 pr-4 font-medium">RX/TX</th>
              <th className="py-2 pr-4 font-medium">BSSID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={`${client.mac}-${client.router_hostname}-${client.bssid}`} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-medium">{client.hostname || 'Unknown'}</div>
                  <div className="font-mono text-xs text-muted-foreground">{client.mac}</div>
                </td>
                <td className="py-3 pr-4 font-mono text-xs">{client.ip || '—'}</td>
                <td className="py-3 pr-4">{client.router_hostname || '—'}</td>
                <td className="py-3 pr-4">{client.ssid || '—'}</td>
                <td className="py-3 pr-4">{client.band || '—'}</td>
                <td className="py-3 pr-4">{formatMaybeNumber(client.signal_dbm, ' dBm')}</td>
                <td className="py-3 pr-4">
                  {formatMaybeNumber(client.rx_rate_mbps, 'M')} / {formatMaybeNumber(client.tx_rate_mbps, 'M')}
                </td>
                <td className="py-3 pr-4 font-mono text-xs">{client.bssid || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No clients match.</p>}
      </CardContent>
    </Card>
  );
}
