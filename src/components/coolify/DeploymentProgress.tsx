'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  GitCommit,
  Timer,
  GitBranch,
  Package,
  Hammer,
  Rocket,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { DeploymentRecordClientWithLogs, BuildStage } from '@/types/deployments';
import { detectBuildStage, getLogPreview, isStageComplete, isStageActive } from '@/lib/coolify/buildStages';
import { cn } from '@/lib/utils';

// ANSI color code to CSS class mapping (from DeploymentLogs.tsx)
const ansiToClass: Record<string, string> = {
  '30': 'text-gray-400',
  '31': 'text-red-400',
  '32': 'text-green-400',
  '33': 'text-yellow-400',
  '34': 'text-blue-400',
  '35': 'text-purple-400',
  '36': 'text-cyan-400',
  '37': 'text-gray-300',
  '90': 'text-gray-500',
  '91': 'text-red-400',
  '92': 'text-green-400',
  '93': 'text-yellow-400',
  '94': 'text-blue-400',
  '95': 'text-purple-400',
  '96': 'text-cyan-400',
  '97': 'text-white',
};

function parseAnsiLine(line: string): { text: string; className: string }[] {
  const parts: { text: string; className: string }[] = [];
  const regex = /\x1b\[(\d+)m/g;

  let lastIndex = 0;
  let currentClass = '';
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: line.slice(lastIndex, match.index),
        className: currentClass,
      });
    }

    const code = match[1];
    if (code === '0') {
      currentClass = '';
    } else {
      currentClass = ansiToClass[code] || '';
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push({
      text: line.slice(lastIndex),
      className: currentClass,
    });
  }

  return parts.length > 0 ? parts : [{ text: line, className: '' }];
}

interface DeploymentProgressProps {
  deployment: DeploymentRecordClientWithLogs;
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

// Build Stage Indicator Component
interface BuildStageIndicatorProps {
  currentStage: BuildStage;
}

const STAGES: { key: BuildStage; label: string; Icon: typeof GitBranch }[] = [
  { key: 'cloning', label: 'Clone', Icon: GitBranch },
  { key: 'installing', label: 'Install', Icon: Package },
  { key: 'building', label: 'Build', Icon: Hammer },
  { key: 'deploying', label: 'Deploy', Icon: Rocket },
];

function BuildStageIndicator({ currentStage }: BuildStageIndicatorProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGES.map((stage, index) => {
        const isComplete = isStageComplete(currentStage, stage.key);
        const isActive = isStageActive(currentStage, stage.key);
        const Icon = stage.Icon;

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
                isComplete && 'text-green-500 bg-green-500/10',
                isActive && 'text-blue-500 bg-blue-500/10 font-medium',
                !isComplete && !isActive && 'text-muted-foreground bg-muted/50'
              )}
            >
              {isActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isComplete ? (
                <Check className="h-3 w-3" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              <span>{stage.label}</span>
            </div>
            {index < STAGES.length - 1 && (
              <div
                className={cn(
                  'w-3 h-0.5 mx-0.5',
                  isComplete ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Log Preview Component
interface LogPreviewProps {
  logs: string | null | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function LogPreview({ logs, expanded, onToggle }: LogPreviewProps) {
  const previewLines = getLogPreview(logs, expanded ? 10 : 5);

  if (previewLines.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
      >
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {expanded ? 'Hide logs' : 'Show logs'}
      </button>

      <div
        className={cn(
          'bg-black/90 rounded-md p-2 font-mono text-xs overflow-hidden transition-all',
          expanded ? 'max-h-48' : 'max-h-20'
        )}
      >
        {previewLines.map((line, i) => (
          <div key={i} className="text-gray-300 truncate leading-relaxed">
            {parseAnsiLine(line).map((part, j) => (
              <span key={j} className={part.className}>
                {part.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeploymentProgress({ deployment, onCancel }: DeploymentProgressProps) {
  const [elapsedTime, setElapsedTime] = useState(formatElapsedTime(deployment.createdAt));
  const [isCancelling, setIsCancelling] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);

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

  const currentStage = detectBuildStage(deployment.logs, deployment.status);

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

            {/* Build Stage Indicator */}
            {isActive && (
              <div className="mb-2">
                <BuildStageIndicator currentStage={currentStage} />
              </div>
            )}

            {/* Progress bar animation */}
            {isActive && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse w-full origin-left" />
              </div>
            )}

            {/* Log Preview */}
            {isActive && deployment.logs && (
              <LogPreview
                logs={deployment.logs}
                expanded={logsExpanded}
                onToggle={() => setLogsExpanded(!logsExpanded)}
              />
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
  deployments: DeploymentRecordClientWithLogs[];
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
