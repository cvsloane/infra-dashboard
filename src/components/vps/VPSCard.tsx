'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Server, Cpu, HardDrive, MemoryStick, Clock } from 'lucide-react';

interface VPSMetrics {
  hostname: string;
  cpu: {
    usagePercent: number;
    cores: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
    usedPercent: number;
  };
  disk: {
    totalBytes: number;
    availableBytes: number;
    usedPercent: number;
    mountPoint: string;
  };
  load: {
    load1: number;
    load5: number;
    load15: number;
  };
  uptime: number;
}

interface VPSCardProps {
  name: string;
  metrics: VPSMetrics | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getStatusColor(percent: number): string {
  if (percent < 60) return 'text-green-500';
  if (percent < 80) return 'text-yellow-500';
  return 'text-red-500';
}

function getProgressColor(percent: number): string {
  if (percent < 60) return 'bg-green-500';
  if (percent < 80) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function VPSCard({ name, metrics }: VPSCardProps) {
  if (!metrics) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              {name}
            </CardTitle>
            <Badge variant="secondary">No Data</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Waiting for node_exporter metrics...
          </p>
        </CardContent>
      </Card>
    );
  }

  const isHealthy = metrics.cpu.usagePercent < 80 &&
                    metrics.memory.usedPercent < 80 &&
                    metrics.disk.usedPercent < 80;

  return (
    <Card className={isHealthy ? 'border-green-500/30' : 'border-yellow-500/30'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            {name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isHealthy ? 'default' : 'secondary'} className="gap-1">
              <Clock className="h-3 w-3" />
              {formatUptime(metrics.uptime)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CPU */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              CPU ({metrics.cpu.cores} cores)
            </span>
            <span className={getStatusColor(metrics.cpu.usagePercent)}>
              {metrics.cpu.usagePercent.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={metrics.cpu.usagePercent}
            className="h-1.5"
            indicatorClassName={getProgressColor(metrics.cpu.usagePercent)}
          />
        </div>

        {/* Memory */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MemoryStick className="h-3.5 w-3.5" />
              Memory
            </span>
            <span className={getStatusColor(metrics.memory.usedPercent)}>
              {formatBytes(metrics.memory.totalBytes - metrics.memory.availableBytes)} / {formatBytes(metrics.memory.totalBytes)}
            </span>
          </div>
          <Progress
            value={metrics.memory.usedPercent}
            className="h-1.5"
            indicatorClassName={getProgressColor(metrics.memory.usedPercent)}
          />
        </div>

        {/* Disk */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Disk
            </span>
            <span className={getStatusColor(metrics.disk.usedPercent)}>
              {formatBytes(metrics.disk.totalBytes - metrics.disk.availableBytes)} / {formatBytes(metrics.disk.totalBytes)}
            </span>
          </div>
          <Progress
            value={metrics.disk.usedPercent}
            className="h-1.5"
            indicatorClassName={getProgressColor(metrics.disk.usedPercent)}
          />
        </div>

        {/* Load Average */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
          <span>Load Average:</span>
          <span className="font-mono">
            {metrics.load.load1.toFixed(2)} / {metrics.load.load5.toFixed(2)} / {metrics.load.load15.toFixed(2)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
