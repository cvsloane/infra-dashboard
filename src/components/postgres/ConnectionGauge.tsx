'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ConnectionGaugeProps {
  current: number;
  max: number;
  title?: string;
  className?: string;
}

export function ConnectionGauge({
  current,
  max,
  title = 'Connections',
  className,
}: ConnectionGaugeProps) {
  const percentage = max > 0 ? (current / max) * 100 : 0;

  const getColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTextColor = () => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className={cn('text-2xl font-bold', getTextColor())}>
            {current}
          </span>
          <span className="text-sm text-muted-foreground">/ {max}</span>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', getColor())}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {percentage.toFixed(1)}% utilized
        </p>
      </CardContent>
    </Card>
  );
}
