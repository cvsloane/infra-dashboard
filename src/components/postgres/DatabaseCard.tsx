'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Activity, Clock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatabaseStats {
  name: string;
  connections: number;
  maxConnections: number;
  activeQueries?: number;
  uptime?: string;
  size?: string;
}

interface DatabaseCardProps {
  database: DatabaseStats;
  className?: string;
}

export function DatabaseCard({ database, className }: DatabaseCardProps) {
  const connectionPercent = database.maxConnections > 0
    ? (database.connections / database.maxConnections) * 100
    : 0;

  const getStatus = () => {
    if (connectionPercent >= 90) return { label: 'Critical', variant: 'destructive' as const };
    if (connectionPercent >= 70) return { label: 'Warning', variant: 'secondary' as const };
    return { label: 'Healthy', variant: 'default' as const };
  };

  const status = getStatus();

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          {database.name}
        </CardTitle>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              Connections
            </div>
            <p className="text-lg font-semibold">
              {database.connections}
              <span className="text-sm text-muted-foreground font-normal">
                /{database.maxConnections}
              </span>
            </p>
          </div>

          {database.activeQueries !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Activity className="h-3 w-3" />
                Active Queries
              </div>
              <p className="text-lg font-semibold">{database.activeQueries}</p>
            </div>
          )}

          {database.uptime && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Uptime
              </div>
              <p className="text-sm font-medium">{database.uptime}</p>
            </div>
          )}

          {database.size && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Database className="h-3 w-3" />
                Size
              </div>
              <p className="text-sm font-medium">{database.size}</p>
            </div>
          )}
        </div>

        {/* Mini connection bar */}
        <div className="mt-4">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                connectionPercent >= 90
                  ? 'bg-red-500'
                  : connectionPercent >= 70
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              )}
              style={{ width: `${Math.min(connectionPercent, 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
