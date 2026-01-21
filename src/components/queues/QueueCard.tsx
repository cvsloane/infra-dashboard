'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Clock,
  Play,
  CheckCircle,
  XCircle,
  Pause,
  Activity,
  Cog,
} from 'lucide-react';

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  isPaused?: boolean;
  workerActive?: boolean;
  workerLastSeen?: number;
  workerCount?: number;
  workerHeartbeatMaxAgeSec?: number;
  oldestWaitingAgeSec?: number;
  jobsPerMin?: number;
  failuresPerMin?: number;
}

interface QueueCardProps {
  queue: QueueStats;
  onClick?: () => void;
  className?: string;
  onPause?: (queueName: string) => void;
  onResume?: (queueName: string) => void;
  isPausing?: boolean;
  isResuming?: boolean;
}

export function QueueCard({
  queue,
  onClick,
  className,
  onPause,
  onResume,
  isPausing,
  isResuming,
}: QueueCardProps) {
  const formatDuration = (seconds?: number) => {
    if (seconds === undefined) return '—';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remaining}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatRate = (rate?: number) => {
    if (rate === undefined) return '—';
    return `${rate.toFixed(1)}/min`;
  };

  const heartbeatClass = (ageSec?: number) => {
    if (ageSec === undefined) return 'text-muted-foreground';
    if (ageSec > 300) return 'text-red-500';
    if (ageSec > 120) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  const isPaused = queue.isPaused ?? queue.paused > 0;

  const getStatus = () => {
    if (queue.failed > 0) return { label: 'Has Failures', variant: 'destructive' as const };
    if (isPaused) return { label: 'Paused', variant: 'secondary' as const };
    if (queue.active > 0) return { label: 'Processing', variant: 'default' as const };
    if (queue.waiting > 0) return { label: 'Queued', variant: 'outline' as const };
    return { label: 'Idle', variant: 'secondary' as const };
  };

  const status = getStatus();

  const stats = [
    { icon: Clock, label: 'Waiting', value: queue.waiting, color: 'text-blue-500' },
    { icon: Play, label: 'Active', value: queue.active, color: 'text-yellow-500' },
    { icon: CheckCircle, label: 'Completed', value: queue.completed, color: 'text-green-500' },
    { icon: XCircle, label: 'Failed', value: queue.failed, color: 'text-red-500' },
  ];

  return (
    <Card
      className={cn(
        'transition-colors',
        onClick && 'hover:bg-muted/50 cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 min-w-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0 overflow-hidden">
          <Activity className="h-4 w-4 shrink-0" />
          <span className="truncate">{queue.name}</span>
        </CardTitle>
        <div className="flex items-center gap-2 shrink-0">
          {queue.workerActive !== undefined && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs',
                queue.workerActive ? 'text-green-500' : 'text-red-500'
              )}
              title={queue.workerActive ? 'Worker is running' : 'No worker connected'}
            >
              <Cog className={cn('h-3 w-3', queue.workerActive && 'animate-spin')} style={{ animationDuration: '3s' }} />
              <span className="hidden sm:inline">{queue.workerActive ? 'Worker' : 'No Worker'}</span>
            </div>
          )}
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <stat.icon className={cn('h-4 w-4 mx-auto mb-1', stat.color)} />
              <p className="text-lg font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {(queue.delayed > 0 || queue.paused > 0 || isPaused || queue.oldestWaitingAgeSec !== undefined || queue.jobsPerMin !== undefined || queue.failuresPerMin !== undefined || queue.workerLastSeen !== undefined || queue.workerCount !== undefined || queue.workerHeartbeatMaxAgeSec !== undefined) && (
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {queue.delayed > 0 && (
              <span className="text-muted-foreground">
                <Pause className="h-3 w-3 inline mr-1" />
                {queue.delayed} delayed
              </span>
            )}
            {isPaused && (
              <span className="text-muted-foreground">
                <Pause className="h-3 w-3 inline mr-1" />
                {queue.paused > 0 ? `${queue.paused} paused` : 'Paused'}
              </span>
            )}
            {queue.oldestWaitingAgeSec !== undefined && queue.waiting > 0 && (
              <span className="text-muted-foreground">
                Oldest wait: {formatDuration(queue.oldestWaitingAgeSec)}
              </span>
            )}
            {queue.jobsPerMin !== undefined && (
              <span className="text-muted-foreground">
                Throughput: {formatRate(queue.jobsPerMin)}
              </span>
            )}
            {queue.failuresPerMin !== undefined && queue.failuresPerMin > 0 && (
              <span className="text-red-500">
                Failures: {formatRate(queue.failuresPerMin)}
              </span>
            )}
            {queue.workerLastSeen !== undefined && queue.workerActive && queue.workerCount === undefined && (
              <span className="text-muted-foreground">
                Worker TTL: {formatDuration(queue.workerLastSeen)}
              </span>
            )}
            {queue.workerCount !== undefined && (
              <span className="text-muted-foreground">
                Workers: {queue.workerCount}
              </span>
            )}
            {queue.workerHeartbeatMaxAgeSec !== undefined && (
              <span className={heartbeatClass(queue.workerHeartbeatMaxAgeSec)}>
                Heartbeat age: {formatDuration(queue.workerHeartbeatMaxAgeSec)}
              </span>
            )}
          </div>
        )}

        {(onPause || onResume) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onPause && !isPaused && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPausing}
                onClick={(event) => {
                  event.stopPropagation();
                  onPause(queue.name);
                }}
              >
                {isPausing ? 'Pausing...' : 'Pause'}
              </Button>
            )}
            {onResume && isPaused && (
              <Button
                size="sm"
                variant="outline"
                disabled={isResuming}
                onClick={(event) => {
                  event.stopPropagation();
                  onResume(queue.name);
                }}
              >
                {isResuming ? 'Resuming...' : 'Resume'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
