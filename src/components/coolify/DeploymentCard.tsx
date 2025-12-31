'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Clock, GitCommit, CheckCircle, XCircle, Loader2, Clock4 } from 'lucide-react';
import type { CoolifyDeployment } from '@/types';

interface DeploymentCardProps {
  deployment: CoolifyDeployment;
  showLink?: boolean;
}

const statusConfig = {
  queued: {
    icon: Clock4,
    color: 'text-yellow-500',
    variant: 'secondary' as const,
  },
  in_progress: {
    icon: Loader2,
    color: 'text-blue-500',
    variant: 'outline' as const,
  },
  finished: {
    icon: CheckCircle,
    color: 'text-green-500',
    variant: 'default' as const,
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    variant: 'destructive' as const,
  },
  cancelled: {
    icon: XCircle,
    color: 'text-muted-foreground',
    variant: 'secondary' as const,
  },
  'cancelled-by-user': {
    icon: XCircle,
    color: 'text-muted-foreground',
    variant: 'secondary' as const,
  },
};

export function DeploymentCard({ deployment, showLink = true }: DeploymentCardProps) {
  const config = statusConfig[deployment.status] || statusConfig.queued;
  const StatusIcon = config.icon;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getDuration = () => {
    if (!deployment.finished_at) return null;
    const start = new Date(deployment.created_at).getTime();
    const end = new Date(deployment.finished_at).getTime();
    const seconds = Math.floor((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const duration = getDuration();

  const content = (
    <Card className={cn('transition-colors', showLink && 'hover:bg-muted/50 cursor-pointer')}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">
          {deployment.application_name || 'Unknown Application'}
        </CardTitle>
        <Badge variant={config.variant} className="gap-1">
          <StatusIcon
            className={cn(
              'h-3 w-3',
              config.color,
              deployment.status === 'in_progress' && 'animate-spin'
            )}
          />
          {deployment.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {deployment.commit && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitCommit className="h-4 w-4" />
            <span className="font-mono truncate">{deployment.commit.slice(0, 8)}</span>
            {deployment.commit_message && (
              <span className="truncate">{deployment.commit_message}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(deployment.created_at)}
          </span>
          {duration && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded">{duration}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (showLink) {
    return (
      <Link href={`/coolify/${deployment.uuid}`}>
        {content}
      </Link>
    );
  }

  return content;
}
