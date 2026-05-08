import { format, formatDistanceToNow } from 'date-fns';
import { CheckCircle, XCircle, AlertCircle, Loader2, HelpCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CronRunRecord } from '@/types/cron';

const ICON: Record<CronRunRecord['status'], { Icon: typeof CheckCircle; tone: string }> = {
  success: { Icon: CheckCircle, tone: 'text-green-500' },
  failure: { Icon: XCircle, tone: 'text-red-500' },
  running: { Icon: Loader2, tone: 'text-blue-500 animate-spin' },
  missed: { Icon: AlertCircle, tone: 'text-yellow-500' },
  unknown: { Icon: HelpCircle, tone: 'text-muted-foreground' },
};

interface CronRunRowProps {
  run: CronRunRecord;
}

export function CronRunRow({ run }: CronRunRowProps) {
  const { Icon, tone } = ICON[run.status] ?? { Icon: Clock, tone: 'text-muted-foreground' };
  const started = new Date(run.started_at);
  const startedValid = !Number.isNaN(started.getTime());
  return (
    <div className="grid gap-2 border-b px-3 py-2 text-sm last:border-0 md:grid-cols-[1.5rem_minmax(0,9rem)_minmax(0,7rem)_minmax(0,6rem)_1fr] md:items-start">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
      <div className="text-xs">
        <div className="font-medium tabular-nums">{startedValid ? format(started, 'PP HH:mm:ss') : '—'}</div>
        <div className="text-muted-foreground">
          {startedValid ? formatDistanceToNow(started, { addSuffix: true }) : ''}
        </div>
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">
        {run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">
        {run.exit_code != null ? `exit ${run.exit_code}` : run.source}
      </div>
      {run.log_excerpt ? (
        <details className="md:col-span-1">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            log excerpt
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-snug whitespace-pre-wrap">
            {run.log_excerpt}
          </pre>
        </details>
      ) : (
        <div className="text-xs text-muted-foreground">no log captured</div>
      )}
    </div>
  );
}
