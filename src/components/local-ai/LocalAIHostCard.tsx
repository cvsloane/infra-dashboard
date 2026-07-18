import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CheckCircle2,
  CircleOff,
  Clock3,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { LocalAIGpuLeaseHost, LocalAIGpuLeaseState } from '@/lib/prometheus/client';
import { cn } from '@/lib/utils';

const HOST_DETAILS = {
  homelinux: {
    gpu: 'RTX 3090 · 24 GB',
    role: 'Primary text inference and media generation',
  },
  heavisidelinux: {
    gpu: 'RTX 5060 Ti · 16 GB',
    role: 'Secondary inference, qmd, and WAN video',
  },
} as const;

const STATE_DETAILS: Record<
  LocalAIGpuLeaseState,
  { label: string; icon: LucideIcon; className: string }
> = {
  ready: {
    label: 'Ready',
    icon: CheckCircle2,
    className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  },
  'in-use': {
    label: 'In use',
    icon: Activity,
    className: 'border-blue-500/40 text-blue-700 dark:text-blue-300',
  },
  queued: {
    label: 'Media waiting',
    icon: Clock3,
    className: 'border-amber-500/50 text-amber-800 dark:text-amber-300',
  },
  inhibited: {
    label: 'Inhibited',
    icon: ShieldAlert,
    className: 'border-orange-500/50 text-orange-800 dark:text-orange-300',
  },
  stale: {
    label: 'Stale owner',
    icon: TriangleAlert,
    className: 'border-destructive/50 text-destructive',
  },
  offline: {
    label: 'Offline',
    icon: CircleOff,
    className: 'border-muted-foreground/40 text-muted-foreground',
  },
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function DetailRow({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">
        <span className="block break-words">{value}</span>
        {secondary ? (
          <span className="mt-0.5 block break-words text-xs font-normal text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export function LocalAIHostCard({ host }: { host: LocalAIGpuLeaseHost }) {
  const hostDetails = HOST_DETAILS[host.host];
  const stateDetails = STATE_DETAILS[host.state];
  const StateIcon = stateDetails.icon;

  return (
    <Card className={cn(host.state === 'stale' && 'border-destructive/50')}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg">{host.host}</h2>
        </CardTitle>
        <CardDescription>
          {hostDetails.gpu} · {hostDetails.role}
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className={stateDetails.className}>
            <StateIcon aria-hidden="true" />
            {stateDetails.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl>
          <DetailRow
            label="GPU owner"
            value={host.owner?.workload || 'No model resident'}
            secondary={host.owner?.kind}
          />
          <DetailRow label="Lease age" value={formatDuration(host.acquiredAgeSeconds)} />
          <DetailRow label="Media queue" value={host.mediaWaiting ? 'Waiting next' : 'Clear'} />
          <DetailRow label="Authority" value={host.authorityUp ? 'Online' : 'Unavailable'} />
          <DetailRow label="Safety" value={host.inhibited ? 'Inhibited' : 'Accepting demand'} />
          <DetailRow
            label="Metrics"
            value={
              host.metricsAgeSeconds === null
                ? 'No recent sample'
                : `${formatDuration(host.metricsAgeSeconds)} ago`
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}
