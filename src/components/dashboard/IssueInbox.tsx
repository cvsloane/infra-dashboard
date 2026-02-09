'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Issue, IssueSeverity } from '@/lib/issues/buildIssues';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

function severityStyles(sev: IssueSeverity): { label: string; className: string; icon: React.ElementType } {
  switch (sev) {
    case 'critical':
      return { label: 'Critical', className: 'bg-red-500/10 text-red-600 border-red-500/20', icon: AlertTriangle };
    case 'warning':
      return {
        label: 'Warning',
        className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/25',
        icon: AlertTriangle,
      };
    case 'info':
    default:
      return { label: 'Info', className: 'bg-muted text-muted-foreground border-border', icon: Info };
  }
}

export interface IssueInboxProps {
  issues: Issue[];
  maxItems?: number;
  className?: string;
}

export function IssueInbox({ issues, maxItems = 6, className }: IssueInboxProps) {
  const visible = issues.slice(0, Math.max(0, maxItems));

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Needs Attention</CardTitle>
        <Badge variant="outline" className="text-muted-foreground">
          {issues.length} issue{issues.length === 1 ? '' : 's'}
        </Badge>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>All clear</span>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((issue) => {
              const s = severityStyles(issue.severity);
              const Icon = s.icon;
              return (
                <Link
                  key={issue.id}
                  href={issue.href}
                  className={cn(
                    'flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/20 transition-colors'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4 shrink-0', issue.severity === 'info' ? 'text-muted-foreground' : '')} />
                      <div className="font-medium text-sm truncate">{issue.title}</div>
                    </div>
                    {issue.detail && (
                      <div className="mt-1 text-xs text-muted-foreground truncate" title={issue.detail}>
                        {issue.detail}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className={cn('shrink-0', s.className)}>
                    {s.label}
                  </Badge>
                </Link>
              );
            })}
            {issues.length > visible.length && (
              <div className="text-xs text-muted-foreground">
                Showing {visible.length} of {issues.length}.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

