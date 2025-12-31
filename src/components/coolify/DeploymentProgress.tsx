'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, GitCommit, Timer } from 'lucide-react';
import type { DeploymentRecordClient } from '@/types/deployments';

interface DeploymentProgressProps {
  deployment: DeploymentRecordClient;
  onCancel?: (deploymentUuid: string) => Promise<void> | void;
}

function formatElapsedTime(startTime: Date | string): string {
  const now = new Date();
  const elapsed = Math.floor((now.getTime() - new Date(startTime).getTime()) / 1000);

  if (elapsed < 60) {
    return `${elapsed}s`;
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function DeploymentProgress({ deployment, onCancel }: DeploymentProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(formatElapsedTime(deployment.createdAt));
  const [isCancelling, setIsCancelling] = useState(false);

  // Update elapsed time every second for in-progress deployments
  useEffect(() => {
    if (deployment.status !== 'in_progress' && deployment.status !== 'queued') {
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(deployment.createdAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [deployment.createdAt, deployment.status]);

  const isActive = deployment.status === 'in_progress';
  const isQueued = deployment.status === 'queued';
  const canCancel = isActive || isQueued;

  const handleCancel = async () => {
    if (!canCancel || !onCancel || isCancelling) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Cancel deployment for ${deployment.applicationName}?`);
      if (!confirmed) return;
    }
    setIsCancelling(true);
    try {
      await onCancel(deployment.uuid);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Card className="border-blue-500/50 bg-blue-500/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold truncate">{deployment.applicationName}</span>
              <Badge variant={isQueued ? 'secondary' : 'outline'} className="gap-1 shrink-0">
                <Loader2 className={`h-3 w-3 ${isActive ? 'animate-spin text-blue-500' : ''}`} />
                {isQueued ? 'Queued' : 'Building'}
              </Badge>
            </div>

            {deployment.commit && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <GitCommit className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono text-xs">{deployment.commit.slice(0, 7)}</span>
                {deployment.commitMessage && (
                  <span className="truncate text-xs">{deployment.commitMessage}</span>
                )}
              </div>
            )}

            {/* Progress bar animation */}
            {isActive && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                <div className="h-full bg-blue-500 rounded-full animate-pulse w-full origin-left animate-[progress_2s_ease-in-out_infinite]" />
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Elapsed time */}
            <div className="flex items-center gap-1.5 text-sm font-medium text-blue-500">
              <Timer className="h-4 w-4" />
              <span className="tabular-nums">{elapsedTime}</span>
            </div>
            {canCancel && onCancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DeploymentProgressListProps {
  deployments: DeploymentRecordClient[];
  onCancel?: (deploymentUuid: string) => Promise<void> | void;
}

export function DeploymentProgressList({ deployments, onCancel }: DeploymentProgressListProps) {
  if (deployments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        Deploying Now ({deployments.length})
      </h3>
      <div className="space-y-2">
        {deployments.map((deployment) => (
          <DeploymentProgress key={deployment.uuid} deployment={deployment} onCancel={onCancel} />
        ))}
      </div>
    </div>
  );
}
