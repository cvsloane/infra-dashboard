'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FailedJob {
  id: string;
  name: string;
  queue: string;
  failedReason: string;
  stacktrace?: string[];
  attemptsMade: number;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface FailedJobDetailProps {
  job: FailedJob;
  onRetry?: (jobId: string) => void;
  onDelete?: (jobId: string) => void;
  className?: string;
}

export function FailedJobDetail({
  job,
  onRetry,
  onDelete,
  className
}: FailedJobDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry(job.id);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(job.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader
        className="flex flex-row items-center justify-between pb-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <CardTitle className="text-sm font-medium">{job.name}</CardTitle>
          <Badge variant="outline" className="text-xs">{job.queue}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(job.timestamp)}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Error summary - always visible */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
          <p className="text-sm text-red-500 font-mono">{job.failedReason}</p>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Attempts: {job.attemptsMade}
          </span>
          <span className="text-muted-foreground font-mono text-xs">
            ID: {job.id}
          </span>
        </div>

        {/* Expanded details */}
        {expanded && (
          <>
            {/* Stack trace */}
            {job.stacktrace && job.stacktrace.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Stack Trace</p>
                <ScrollArea className="h-[200px] rounded-md border bg-black p-3">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                    {job.stacktrace.join('\n')}
                  </pre>
                </ScrollArea>
              </div>
            )}

            {/* Job data */}
            {job.data && Object.keys(job.data).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Job Data</p>
                <ScrollArea className="h-[150px] rounded-md border bg-muted p-3">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(job.data, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isRetrying || !onRetry}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isRetrying && 'animate-spin')} />
            {isRetrying ? 'Retrying...' : 'Retry'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting || !onDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
