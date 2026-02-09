'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

type SectionStatus = 'ok' | 'warning' | 'error' | 'loading' | 'unknown';

const statusDot: Record<SectionStatus, string> = {
  ok: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  loading: 'bg-muted-foreground/40',
  unknown: 'bg-muted-foreground/40',
};

export interface CollapsibleSectionProps {
  title: string;
  status?: SectionStatus;
  summary?: Array<{ label: string; value: string | number }>;
  href?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  status = 'unknown',
  summary,
  href,
  defaultOpen,
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className={cn('group rounded-lg border bg-card', className)}
    >
      <summary
        className={cn(
          'cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3',
          'hover:bg-muted/15 transition-colors',
          '[&::-webkit-details-marker]:hidden'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('h-2 w-2 rounded-full shrink-0', statusDot[status])} aria-label={status} />
          <div className="font-semibold truncate">{title}</div>
          {summary && summary.length > 0 && (
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
              {summary.slice(0, 3).map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
                  <span className="opacity-80">{s.label}</span>
                  <span className="font-medium text-foreground/80">{s.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {href && (
            <Link
              href={href}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View
            </Link>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}
