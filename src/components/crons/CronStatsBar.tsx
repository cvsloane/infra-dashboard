import { Card, CardContent } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, Clock, Server } from 'lucide-react';
import type { CronStats } from '@/types/cron';

export function CronStatsBar({ stats }: { stats: CronStats }) {
  const lastCollected = stats.last_collected_at
    ? formatDistanceToNow(new Date(stats.last_collected_at), { addSuffix: true })
    : 'never';

  const items: Array<{ label: string; value: string | number; icon: typeof Activity; tone?: string }> = [
    { label: 'Total jobs', value: stats.total_jobs, icon: Activity },
    { label: 'Hosts reporting', value: stats.hosts.length, icon: Server },
    {
      label: 'Failing',
      value: stats.failing_jobs,
      icon: AlertTriangle,
      tone: stats.failing_jobs > 0 ? 'text-red-500' : undefined,
    },
    {
      label: 'Stale',
      value: stats.stale_jobs,
      icon: Clock,
      tone: stats.stale_jobs > 0 ? 'text-yellow-500' : undefined,
    },
    { label: 'Last collected', value: lastCollected, icon: Clock },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-5">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <it.icon className={`h-4 w-4 ${it.tone || 'text-muted-foreground'}`} />
            <div>
              <div className="text-xs text-muted-foreground">{it.label}</div>
              <div className={`text-lg font-semibold ${it.tone || ''}`}>{it.value}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
