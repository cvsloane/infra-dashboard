import { Activity, AlertTriangle, Laptop, Router, Users, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { HomeNetworkReadResponse } from '@/types/home-network';
import { formatMaybeSeconds, statusClassName } from './status-utils';

interface HomeNetworkSummaryProps {
  data: HomeNetworkReadResponse;
}

export function HomeNetworkSummary({ data }: HomeNetworkSummaryProps) {
  const snapshot = data.snapshot;
  const routerCount = snapshot?.routers.length ?? 0;
  const clientCount = snapshot?.clients.length ?? 0;
  const weakClientCount = snapshot?.client_summary?.weak_signal ?? 0;
  const veryWeakClientCount = snapshot?.client_summary?.very_weak_signal ?? 0;
  const multiApMacCount = snapshot?.client_summary?.multi_ap_mac_count ?? 0;
  const duplicateHostnameCount = snapshot?.client_summary?.duplicate_hostname_count ?? 0;
  const warningCount = data.computed_warnings.length;
  const laptopCount = snapshot?.windows_laptops?.length ?? 0;
  const laptopWarningCount = snapshot?.windows_laptops?.filter((laptop) => laptop.status !== 'ok').length ?? 0;

  const cards = [
    {
      label: 'Status',
      value: data.status.toUpperCase(),
      detail: data.message,
      icon: Activity,
      className: statusClassName(data.status),
    },
    {
      label: 'Snapshot age',
      value: data.age_sec === null ? '—' : formatMaybeSeconds(data.age_sec),
      detail: `Max ${data.max_age_sec}s`,
      icon: Wifi,
      className: 'border-border bg-card',
    },
    {
      label: 'Routers',
      value: `${routerCount}/3`,
      detail: snapshot ? snapshot.routers.map((router) => router.hostname).join(', ') : 'No snapshot',
      icon: Router,
      className: 'border-border bg-card',
    },
    {
      label: 'Clients',
      value: `${clientCount}`,
      detail: `${weakClientCount} weak, ${veryWeakClientCount} very weak, ${multiApMacCount} multi-AP, ${duplicateHostnameCount} duplicate names`,
      icon: Users,
      className: veryWeakClientCount > 0 ? statusClassName('warning') : 'border-border bg-card',
    },
    {
      label: 'Laptops',
      value: `${laptopCount}`,
      detail: laptopCount > 0 ? `${laptopWarningCount} need attention` : 'No endpoint snapshot',
      icon: Laptop,
      className: laptopWarningCount > 0 ? statusClassName('warning') : 'border-border bg-card',
    },
    {
      label: 'Warnings',
      value: `${warningCount}`,
      detail: warningCount > 0 ? data.computed_warnings[0] : 'No active warnings',
      icon: AlertTriangle,
      className: warningCount > 0 ? statusClassName(data.status === 'ok' ? 'warning' : data.status) : 'border-border bg-card',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label} className={card.className}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
            <card.icon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
