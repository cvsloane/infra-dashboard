import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Clock, Loader2, Pause, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CronJobSummary } from '@/types/cron';

interface CronStatusBadgeProps {
  status: CronJobSummary['status'];
  className?: string;
}

export function CronStatusBadge({ status, className }: CronStatusBadgeProps) {
  switch (status) {
    case 'success':
      return (
        <Badge variant="outline" className={cn('border-green-500/30 bg-green-500/10 text-green-700', className)}>
          <CheckCircle className="mr-1 h-3 w-3" />
          ok
        </Badge>
      );
    case 'failure':
      return (
        <Badge variant="destructive" className={className}>
          <XCircle className="mr-1 h-3 w-3" />
          failed
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="outline" className={cn('border-blue-500/30 bg-blue-500/10 text-blue-700', className)}>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          running
        </Badge>
      );
    case 'missed':
      return (
        <Badge variant="outline" className={cn('border-yellow-500/30 bg-yellow-500/10 text-yellow-700', className)}>
          <AlertCircle className="mr-1 h-3 w-3" />
          missed
        </Badge>
      );
    case 'stale':
      return (
        <Badge variant="outline" className={cn('border-yellow-500/30 bg-yellow-500/10 text-yellow-700', className)}>
          <Clock className="mr-1 h-3 w-3" />
          stale
        </Badge>
      );
    case 'paused':
      return (
        <Badge variant="outline" className={cn('text-muted-foreground', className)}>
          <Pause className="mr-1 h-3 w-3" />
          paused
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn('text-muted-foreground', className)}>
          <HelpCircle className="mr-1 h-3 w-3" />
          unknown
        </Badge>
      );
  }
}
