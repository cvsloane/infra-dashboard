'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Bot, CheckCircle, XCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AgentRunResult {
  agentName: string;
  runId: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  summary: string;
  metrics: Record<string, number>;
  actions: string[];
  costUsd: number;
  durationMs: number;
  error?: string;
}

interface AgentSummary {
  name: string;
  displayName: string;
  description: string;
  lastRun: AgentRunResult | null;
  schedule: string;
}

interface AgentStats {
  totalAgents: number;
  healthyAgents: number;
  warningAgents: number;
  errorAgents: number;
  lastRunTime: string | null;
  totalCostToday: number;
}

interface AgentsData {
  agents: AgentSummary[];
  stats: AgentStats;
}

const statusConfig = {
  success: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Healthy',
  },
  warning: {
    icon: AlertCircle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Warning',
  },
  error: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Error',
  },
};

function AgentRow({ agent }: { agent: AgentSummary }) {
  const lastRun = agent.lastRun;
  const config = lastRun ? statusConfig[lastRun.status] : null;
  const StatusIcon = config?.icon || Clock;

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <StatusIcon
          className={cn(
            'h-4 w-4',
            config?.color || 'text-muted-foreground'
          )}
        />
        <div>
          <p className="text-sm font-medium">{agent.displayName}</p>
          <p className="text-xs text-muted-foreground">{agent.description}</p>
        </div>
      </div>
      <div className="text-right">
        {lastRun ? (
          <>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(lastRun.timestamp), { addSuffix: true })}
            </p>
            <p className="text-xs text-muted-foreground">
              {lastRun.durationMs}ms / ${lastRun.costUsd.toFixed(4)}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Never run</p>
        )}
      </div>
    </div>
  );
}

export function AgentsCard({ className }: { className?: string }) {
  const [data, setData] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents/runs');
        if (!res.ok) {
          if (res.status === 401) {
            setError('Unauthorized');
            return;
          }
          throw new Error('Failed to fetch agents');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    fetchAgents();
    // Refresh every 60 seconds
    const interval = setInterval(fetchAgents, 60000);
    return () => clearInterval(interval);
  }, []);

  // Determine overall status
  const overallStatus = data
    ? data.stats.errorAgents > 0
      ? 'error'
      : data.stats.warningAgents > 0
        ? 'warning'
        : data.stats.healthyAgents > 0
          ? 'success'
          : null
    : null;

  const config = overallStatus ? statusConfig[overallStatus] : null;

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      {/* Background indicator */}
      {config && (
        <div className={cn('absolute inset-0 opacity-50', config.bgColor)} />
      )}

      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Agents</CardTitle>
        </div>
        {loading ? (
          <Badge variant="outline">
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Loading
          </Badge>
        ) : error ? (
          <Badge variant="destructive">Error</Badge>
        ) : config ? (
          <Badge variant={overallStatus === 'error' ? 'destructive' : overallStatus === 'warning' ? 'secondary' : 'default'}>
            {config.label}
          </Badge>
        ) : (
          <Badge variant="outline">No data</Badge>
        )}
      </CardHeader>

      <CardContent className="relative">
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 bg-muted animate-pulse rounded" />
            <div className="h-8 bg-muted animate-pulse rounded" />
            <div className="h-8 bg-muted animate-pulse rounded" />
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : data ? (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-lg font-semibold text-green-500">{data.stats.healthyAgents}</p>
                <p className="text-xs text-muted-foreground">Healthy</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-lg font-semibold text-yellow-500">{data.stats.warningAgents}</p>
                <p className="text-xs text-muted-foreground">Warning</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-lg font-semibold text-red-500">{data.stats.errorAgents}</p>
                <p className="text-xs text-muted-foreground">Error</p>
              </div>
            </div>

            {/* Agent list */}
            <div className="space-y-0">
              {data.agents.map((agent) => (
                <AgentRow key={agent.name} agent={agent} />
              ))}
            </div>

            {/* Footer stats */}
            {data.stats.lastRunTime && (
              <div className="mt-3 pt-3 border-t border-border/50 flex justify-between text-xs text-muted-foreground">
                <span>
                  Last run: {formatDistanceToNow(new Date(data.stats.lastRunTime), { addSuffix: true })}
                </span>
                <span>Today: ${data.stats.totalCostToday.toFixed(4)}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No agent data available</p>
        )}
      </CardContent>
    </Card>
  );
}
