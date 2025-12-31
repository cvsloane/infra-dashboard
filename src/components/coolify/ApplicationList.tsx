'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Rocket, ExternalLink, GitBranch } from 'lucide-react';
import type { CoolifyApplication } from '@/types';

interface ApplicationListProps {
  applications: CoolifyApplication[];
  isLoading?: boolean;
  onDeploy?: (uuid: string, force?: boolean) => void;
}

const statusColors: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  running: 'default',
  stopped: 'secondary',
  starting: 'outline',
  stopping: 'outline',
  restarting: 'outline',
  exited: 'destructive',
  degraded: 'destructive',
};

export function ApplicationList({ applications, isLoading, onDeploy }: ApplicationListProps) {
  const [deployingAction, setDeployingAction] = useState<{ uuid: string; force: boolean } | null>(null);

  const handleDeploy = async (uuid: string, force = false) => {
    setDeployingAction({ uuid, force });
    try {
      onDeploy?.(uuid, force);
    } finally {
      setTimeout(() => setDeployingAction(null), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No applications found
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Application</TableHead>
          <TableHead>Project / Environment</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Domain</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.map((app) => {
          const isDeploying = deployingAction?.uuid === app.uuid;
          return (
            <TableRow key={app.uuid}>
            <TableCell className="font-medium">{app.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {app.environment?.project?.name || '-'} / {app.environment?.name || '-'}
            </TableCell>
            <TableCell>
              {app.git_branch && (
                <span className="flex items-center gap-1 text-sm">
                  <GitBranch className="h-3 w-3" />
                  {app.git_branch}
                </span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={statusColors[app.status] || 'outline'}>
                {app.status}
              </Badge>
            </TableCell>
            <TableCell>
              {app.fqdn && (
                <a
                  href={app.fqdn.startsWith('http') ? app.fqdn : `https://${app.fqdn}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-500 hover:underline"
                >
                  {app.fqdn.replace(/https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeploy(app.uuid, false)}
                  disabled={isDeploying}
                >
                  <Rocket className="h-4 w-4 mr-1" />
                  {isDeploying && !deployingAction?.force ? 'Deploying...' : 'Deploy'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDeploy(app.uuid, true)}
                  disabled={isDeploying}
                >
                  {isDeploying && deployingAction?.force ? 'Forcing...' : 'Force'}
                </Button>
              </div>
            </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
