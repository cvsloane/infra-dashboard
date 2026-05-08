import { Laptop, ShieldCheck, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { HomeWindowsLaptopRecord } from '@/types/home-network';
import { formatMaybeNumber, statusClassName } from './status-utils';

interface WindowsLaptopPanelProps {
  laptops: HomeWindowsLaptopRecord[];
}

export function WindowsLaptopPanel({ laptops }: WindowsLaptopPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Laptop className="h-4 w-4" />
          Windows Laptops
        </CardTitle>
      </CardHeader>
      <CardContent>
        {laptops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Windows laptop health snapshot has been merged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wi-Fi</TableHead>
                  <TableHead>OpenSSH</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Memory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {laptops.map((laptop) => (
                  <TableRow key={laptop.label}>
                    <TableCell>
                      <div className="font-medium">{laptop.computer_name || laptop.label}</div>
                      <div className="text-xs text-muted-foreground">{primaryIp(laptop) || laptop.ssh_target || 'No LAN IP'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusClassName(laptop.status)} variant="outline">
                        {laptop.status}
                      </Badge>
                      {laptop.warnings && laptop.warnings.length > 0 ? (
                        <div className="mt-1 max-w-64 text-xs text-muted-foreground">{laptop.warnings[0]}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                        {laptop.wifi?.ssid || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ch {laptop.wifi?.channel || '—'} · {formatMaybeNumber(laptop.wifi?.rx_rate_mbps)} /{' '}
                        {formatMaybeNumber(laptop.wifi?.tx_rate_mbps)} Mbps · {laptop.wifi?.signal || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{laptop.openssh?.service_status || 'unknown'}</div>
                      <div className="text-xs text-muted-foreground">
                        {laptop.openssh?.start_type || '—'} · listeners {laptop.openssh?.listener_count ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        Defender {laptop.security?.defender_realtime === false ? 'off' : 'on'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        N360 {laptop.security?.norton_360_present ? 'present' : 'absent'} · Family{' '}
                        {laptop.security?.norton_family_present ? 'present' : 'missing'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatMaybeNumber(laptop.memory?.free_physical_mb, ' MB')} free</div>
                      <div className="text-xs text-muted-foreground">
                        {formatMaybeNumber(laptop.memory?.total_visible_mb, ' MB')} total
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function primaryIp(laptop: HomeWindowsLaptopRecord): string | null {
  const row = laptop.lan_ipv4_addresses?.find((address) => address.IPAddress);
  return row?.IPAddress || null;
}
