'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertCircle, Loader2, LucideIcon } from 'lucide-react';

interface StatusCardProps {
  title: string;
  status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
  message?: string;
  icon?: LucideIcon;
  stats?: Array<{ label: string; value: string | number }>;
  className?: string;
}

const statusConfig = {
  ok: {
    icon: CheckCircle,
    color: 'text-green-500',
    borderColor: 'border-l-green-500',
    badgeVariant: 'default' as const,
    label: 'Healthy',
  },
  error: {
    icon: XCircle,
    color: 'text-red-500',
    borderColor: 'border-l-red-500',
    badgeVariant: 'destructive' as const,
    label: 'Error',
  },
  warning: {
    icon: AlertCircle,
    color: 'text-yellow-500',
    borderColor: 'border-l-yellow-500',
    badgeVariant: 'secondary' as const,
    label: 'Warning',
  },
  loading: {
    icon: Loader2,
    color: 'text-muted-foreground',
    borderColor: 'border-l-muted',
    badgeVariant: 'outline' as const,
    label: 'Loading',
  },
  unknown: {
    icon: AlertCircle,
    color: 'text-muted-foreground',
    borderColor: 'border-l-muted',
    badgeVariant: 'outline' as const,
    label: 'Unknown',
  },
};

export function StatusCard({
  title,
  status,
  message,
  icon: CustomIcon,
  stats,
  className,
}: StatusCardProps) {
  const config = statusConfig[status];
  const StatusIcon = CustomIcon || config.icon;

  return (
    <Card className={cn('border-l-4', config.borderColor, className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Badge variant={config.badgeVariant}>{config.label}</Badge>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-3">
          <StatusIcon
            className={cn(
              'h-8 w-8',
              config.color,
              status === 'loading' && 'animate-spin'
            )}
          />
          <div className="flex-1 min-w-0">
            {message && (
              <p className="text-sm text-muted-foreground truncate" title={message}>{message}</p>
            )}
            {stats && stats.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-sm truncate">
                    <span className="text-muted-foreground">{stat.label}: </span>
                    <span className="font-medium">{stat.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}