'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  loading?: boolean;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function MetricCard({
  title,
  value,
  loading = false,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  className,
}: MetricCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-green-500'
      : trend === 'down'
      ? 'text-red-500'
      : 'text-muted-foreground';

  return (
    <Card className={className} aria-busy={loading}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-8 w-24" />
            {(subtitle || trend) && (
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-3 w-28" />
                {trend && <Skeleton className="h-3 w-16" />}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {(subtitle || trend) && (
              <div className="flex items-center gap-2 mt-1">
                {subtitle && (
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                )}
                {trend && trendValue && (
                  <span className={cn('flex items-center text-xs', trendColor)}>
                    <TrendIcon className="h-3 w-3 mr-1" />
                    {trendValue}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
