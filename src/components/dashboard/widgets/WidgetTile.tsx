'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import type { WidgetStatus } from './registry';

const statusDot: Record<WidgetStatus, string> = {
  ok: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  loading: 'bg-muted-foreground/40',
  unknown: 'bg-muted-foreground/40',
};

export interface WidgetTileProps {
  title: string;
  href: string;
  status: WidgetStatus;
  primary: string;
  secondary?: string;
  meta?: Array<{ label: string; value: string }>;
  icon?: LucideIcon;
  className?: string;
}

export function WidgetTile({
  title,
  href,
  status,
  primary,
  secondary,
  meta,
  icon: Icon,
  className,
}: WidgetTileProps) {
  const content = (
    <Card className={cn('p-3 hover:bg-muted/20 transition-colors', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
            <div className="text-xs font-medium text-muted-foreground truncate">{title}</div>
          </div>
        </div>
        <span className={cn('h-2 w-2 rounded-full shrink-0 mt-1.5', statusDot[status])} aria-label={status} />
      </div>

      <div className="mt-2">
        <div className="text-lg font-semibold leading-tight">{primary}</div>
        {secondary && (
          <div className="mt-0.5 text-xs text-muted-foreground truncate" title={secondary}>
            {secondary}
          </div>
        )}
      </div>

      {meta && meta.length > 0 && (
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {meta.slice(0, 2).map((m) => (
            <div key={m.label} className="truncate">
              <span className="font-medium text-foreground/80">{m.label}</span>{' '}
              <span>{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-md">
      {content}
    </Link>
  );
}

