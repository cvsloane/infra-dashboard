'use client';

import { useEffect, useState } from 'react';
import { QueueCard } from '@/components/queues/QueueCard';
import { FailedJobDetail } from '@/components/queues/FailedJobDetail';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Activity, Clock, CheckCircle, XCircle, AlertTriangle, Cog, RefreshCw, Users, Zap } from 'lucide-react';
import { useDashboard } from '../layout';

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

export default function QueuesPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [queues, setQueues] = useState<QueueStats[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkQueue, setBulkQueue] = useState('all');
  const [bulkLimit, setBulkLimit] = useState(200);
  const [bulkAction, setBulkAction] = useState<'retry_all' | 'delete_all' | null>(null);
  const [queueFilter, setQueueFilter] = useState('');
  const [queueAction, setQueueAction] = useState<{ name: string; action: 'pause' | 'resume' } | null>(null);

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

  const fetchQueues = async () => {
    try {
      const queuesRes = await fetch('/api/bullmq/queues');
      const queuesData = await queuesRes.json();
      setQueues(queuesData.queues || []);
    } catch (error) {
      console.error('Failed to fetch queues:', error);
    }
  };

  const fetchFailedJobs = async () => {
    try {
      const failedRes = await fetch('/api/bullmq/jobs/failed');
      const failedData = await failedRes.json();
      setFailedJobs(failedData.jobs || []);
    } catch (error) {
      console.error('Failed to fetch failed jobs:', error);
    }
  };

  useEffect(() => {
    if (sseData?.type === 'update' && sseData.queues) {
      setQueues(sseData.queues);
      setLoading(false);
    }
  }, [sseData]);

  useEffect(() => {
    if (isConnected) return;
    fetchQueues().finally(() => setLoading(false));
    const interval = setInterval(fetchQueues, 15000);
    return () => clearInterval(interval);
  }, [isConnected]);

  useEffect(() => {
    fetchFailedJobs().finally(() => setLoading(false));
    const interval = setInterval(fetchFailedJobs, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: string) => {
    try {
      const job = failedJobs.find((j) => j.id === jobId);
      if (!job) return;

      await fetch('/api/bullmq/jobs/failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry',
          queue: job.queue,
          jobId,
        }),
      });

      // Refresh data
      fetchFailedJobs();
      if (!isConnected) {
        fetchQueues();
      }
    } catch (error) {
      console.error('Failed to retry job:', error);
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      const job = failedJobs.find((j) => j.id === jobId);
      if (!job) return;

      await fetch('/api/bullmq/jobs/failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          queue: job.queue,
          jobId,
        }),
      });

      // Refresh data
      fetchFailedJobs();
      if (!isConnected) {
        fetchQueues();
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  const handleBulkAction = async (action: 'retry_all' | 'delete_all') => {
    if (action === 'delete_all') {
      const confirmed = window.confirm('Delete all failed jobs for the selected queue(s)? This cannot be undone.');
      if (!confirmed) return;
    }

    setBulkAction(action);
    try {
      await fetch('/api/bullmq/jobs/failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          queue: bulkQueue,
          limit: bulkLimit,
        }),
      });
      fetchFailedJobs();
      if (!isConnected) {
        fetchQueues();
      }
    } catch (error) {
      console.error('Failed to run bulk action:', error);
    } finally {
      setBulkAction(null);
    }
  };

  const handleRefresh = () => {
    fetchQueues();
    fetchFailedJobs();
  };

  const handlePauseQueue = async (queueName: string) => {
    setQueueAction({ name: queueName, action: 'pause' });
    try {
      await fetch(`/api/bullmq/queues/${encodeURIComponent(queueName)}/pause`, {
        method: 'POST',
      });
      fetchQueues();
    } catch (error) {
      console.error('Failed to pause queue:', error);
    } finally {
      setQueueAction(null);
    }
  };

  const handleResumeQueue = async (queueName: string) => {
    setQueueAction({ name: queueName, action: 'resume' });
    try {
      await fetch(`/api/bullmq/queues/${encodeURIComponent(queueName)}/resume`, {
        method: 'POST',
      });
      fetchQueues();
    } catch (error) {
      console.error('Failed to resume queue:', error);
    } finally {
      setQueueAction(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">BullMQ Queues</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const totals = queues.reduce(
    (acc, q) => ({
      waiting: acc.waiting + q.waiting,
      active: acc.active + q.active,
      completed: acc.completed + q.completed,
      failed: acc.failed + q.failed,
    }),
    { waiting: 0, active: 0, completed: 0, failed: 0 }
  );

  const queuesWithoutWorkers = queues.filter((q) =>
    q.workerCount !== undefined ? q.workerCount === 0 : q.workerActive === false
  );
  const overallStatus = queuesWithoutWorkers.length > 0 ? 'error' : totals.failed > 0 ? 'warning' : queues.length > 0 ? 'ok' : 'unknown';
  const filteredQueues = queues.filter((queue) =>
    queue.name.toLowerCase().includes(queueFilter.trim().toLowerCase())
  );

  const heartbeatQueues = queues.filter((q) => q.workerCount !== undefined);
  const totalWorkers = heartbeatQueues.reduce((sum, q) => sum + (q.workerCount || 0), 0);
  const oldestHeartbeatAgeSec = heartbeatQueues.length > 0
    ? Math.max(...heartbeatQueues.map((q) => q.workerHeartbeatMaxAgeSec || 0))
    : undefined;
  const totalThroughput = queues.reduce((sum, q) => sum + (q.jobsPerMin || 0), 0);
  const totalFailures = queues.reduce((sum, q) => sum + (q.failuresPerMin || 0), 0);
  const oldestWaitAgeSec = queues.reduce((max, q) => {
    if (q.oldestWaitingAgeSec === undefined) return max;
    return Math.max(max, q.oldestWaitingAgeSec);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">BullMQ Queues</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Worker Down Alert */}
      {queuesWithoutWorkers.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="font-semibold text-red-500">
                {queuesWithoutWorkers.length} Queue{queuesWithoutWorkers.length > 1 ? 's' : ''} Without Workers
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {queuesWithoutWorkers.map((q) => (
                <div key={q.name} className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-sm">
                  <Cog className="h-3 w-3" />
                  {q.name}
                  {q.waiting > 0 && (
                    <span className="text-xs text-muted-foreground">({q.waiting} waiting)</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Status */}
      <StatusCard
        title="Queue System"
        status={overallStatus}
        message={
          queuesWithoutWorkers.length > 0
            ? `${queuesWithoutWorkers.length} queue${queuesWithoutWorkers.length > 1 ? 's' : ''} without workers`
            : totals.failed > 0
            ? `${totals.failed} failed jobs need attention`
            : `${queues.length} queues running`
        }
        icon={Activity}
      />

      {/* Summary Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Waiting" value={totals.waiting} icon={Clock} />
        <MetricCard title="Active" value={totals.active} icon={Activity} />
        <MetricCard title="Completed" value={totals.completed} icon={CheckCircle} />
        <MetricCard
          title="Failed"
          value={totals.failed}
          icon={XCircle}
          trend={totals.failed > 0 ? 'down' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" />
                Worker Health
              </div>
              <div className="text-xs text-muted-foreground">
                {heartbeatQueues.length > 0
                  ? `${totalWorkers} workers across ${heartbeatQueues.length} queues`
                  : 'Heartbeat data not available'}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                title="Workers Online"
                value={heartbeatQueues.length > 0 ? totalWorkers : '—'}
                subtitle={queuesWithoutWorkers.length > 0 ? `${queuesWithoutWorkers.length} queue${queuesWithoutWorkers.length > 1 ? 's' : ''} without workers` : 'All queues staffed'}
                icon={Users}
              />
              <MetricCard
                title="Oldest Heartbeat"
                value={heartbeatQueues.length > 0 ? formatDuration(oldestHeartbeatAgeSec) : '—'}
                subtitle="Max age across queues"
                icon={Clock}
              />
              <MetricCard
                title="Oldest Wait"
                value={totals.waiting > 0 ? formatDuration(oldestWaitAgeSec) : '—'}
                subtitle="Oldest job in wait"
                icon={Clock}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-green-500" />
                Throughput: {totalThroughput > 0 ? `${totalThroughput.toFixed(1)}/min` : '—'}
              </span>
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Failure rate: {totalFailures > 0 ? `${totalFailures.toFixed(1)}/min` : '—'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="text-sm font-medium">Operations</div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Queue</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={bulkQueue}
                  onChange={(event) => setBulkQueue(event.target.value)}
                >
                  <option value="all">All queues</option>
                  {queues.map((queue) => (
                    <option key={queue.name} value={queue.name}>{queue.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Limit</span>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={bulkLimit}
                  onChange={(event) => {
                    const next = parseInt(event.target.value || '0', 10);
                    setBulkLimit(Number.isNaN(next) ? 200 : next);
                  }}
                  className="w-full"
                />
              </div>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('retry_all')}
                  disabled={bulkAction !== null}
                >
                  {bulkAction === 'retry_all' ? 'Retrying...' : 'Retry failed'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleBulkAction('delete_all')}
                  disabled={bulkAction !== null}
                >
                  {bulkAction === 'delete_all' ? 'Deleting...' : 'Delete failed'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queues">
        <TabsList>
          <TabsTrigger value="queues">Queues ({filteredQueues.length})</TabsTrigger>
          <TabsTrigger value="failed">
            Failed Jobs ({failedJobs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queues" className="mt-4">
          <div className="mb-4">
            <Input
              placeholder="Filter queues by name..."
              value={queueFilter}
              onChange={(event) => setQueueFilter(event.target.value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredQueues.map((queue) => (
              <QueueCard
                key={queue.name}
                queue={queue}
                onPause={handlePauseQueue}
                onResume={handleResumeQueue}
                isPausing={queueAction?.name === queue.name && queueAction?.action === 'pause'}
                isResuming={queueAction?.name === queue.name && queueAction?.action === 'resume'}
              />
            ))}
          </div>
          {filteredQueues.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No queues found
            </p>
          )}
        </TabsContent>

        <TabsContent value="failed" className="mt-4">
          <div className="space-y-4">
            {failedJobs.map((job) => (
              <FailedJobDetail
                key={job.id}
                job={job}
                onRetry={handleRetry}
                onDelete={handleDelete}
              />
            ))}
            {failedJobs.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No failed jobs - all queues are healthy!
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
