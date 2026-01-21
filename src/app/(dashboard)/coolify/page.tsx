'use client';

import { useEffect, useState, useCallback } from 'react';
import { ApplicationList } from '@/components/coolify/ApplicationList';
import { DeploymentCard } from '@/components/coolify/DeploymentCard';
import { DeploymentProgressList } from '@/components/coolify/DeploymentProgress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import type { CoolifyApplication, CoolifyDeployment } from '@/types';
import type { DeploymentRecordClient, DeploymentStatsClient } from '@/types/deployments';
import { useDashboard } from '../layout';

export default function CoolifyPage() {
  const { data: sseData, isConnected } = useDashboard();
  const [applications, setApplications] = useState<CoolifyApplication[]>([]);
  const [activeDeployments, setActiveDeployments] = useState<DeploymentRecordClient[]>([]);
  const [recentDeployments, setRecentDeployments] = useState<DeploymentRecordClient[]>([]);
  const [stats, setStats] = useState<DeploymentStatsClient>({ queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 });
  const [loading, setLoading] = useState(true);

  // All History tab state
  const [allDeployments, setAllDeployments] = useState<DeploymentRecordClient[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState('recent');

  // Filter state (Phase 2)
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [applicationFilter, setApplicationFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const fetchApplications = async () => {
    try {
      const appsRes = await fetch('/api/coolify/applications');
      const appsData = await appsRes.json();
      setApplications(appsData.applications || []);
    } catch (error) {
      console.error('Failed to fetch applications:', error);
    }
  };

  const fetchDeployments = async () => {
    try {
      const deploysRes = await fetch('/api/coolify/deployments');
      const deploysData = await deploysRes.json();
      setActiveDeployments(deploysData.active || []);
      setRecentDeployments(deploysData.recent || []);
      setStats(deploysData.stats || { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 });
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDeployments = useCallback(async (
    options: { isInitial?: boolean; cursor?: string | null } = {}
  ) => {
    const { isInitial = false, cursor } = options;
    if (isInitial) {
      setAllDeployments([]);
      setNextCursor(null);
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        view: 'all',
        limit: '50',
        ...(cursor && !isInitial && { cursor }),
        ...(statusFilter.length > 0 && { status: statusFilter.join(',') }),
        ...(applicationFilter && { application: applicationFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      });

      const res = await fetch(`/api/coolify/deployments?${params}`);
      const data = await res.json();

      if (data.all) {
        if (isInitial) {
          setAllDeployments(data.all.deployments);
        } else {
          setAllDeployments(prev => [...prev, ...data.all.deployments]);
        }
        setNextCursor(data.all.nextCursor);
        setTotalCount(data.all.totalCount);
      }
    } catch (error) {
      console.error('Failed to fetch all deployments:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [statusFilter, applicationFilter, startDate, endDate]);

  const loadMoreDeployments = () => {
    if (nextCursor && !loadingMore) {
      setLoadingMore(true);
      fetchAllDeployments({ cursor: nextCursor });
    }
  };

  useEffect(() => {
    fetchApplications().finally(() => setLoading(false));
    const interval = setInterval(fetchApplications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (sseData?.type === 'update' && sseData.deployments) {
      setActiveDeployments(sseData.deployments.active || []);
      setRecentDeployments(sseData.deployments.recent || []);
      setStats(sseData.deployments.stats || { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 });
      setLoading(false);
    }
  }, [sseData]);

  useEffect(() => {
    if (isConnected) return;
    fetchDeployments();
    // Poll more frequently when there are active deployments
    const interval = setInterval(fetchDeployments, activeDeployments.length > 0 ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [activeDeployments.length, isConnected]);

  // Fetch all deployments when viewing history (also refreshes when filters change)
  useEffect(() => {
    if (activeTab !== 'history') return;
    fetchAllDeployments({ isInitial: true });
  }, [activeTab, fetchAllDeployments]);

  const handleDeploy = async (uuid: string, force = false) => {
    try {
      const res = await fetch('/api/coolify/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationUuid: uuid, force }),
      });

      if (res.ok) {
        // Refresh data after triggering deployment
        setTimeout(fetchDeployments, 1000);
      }
    } catch (error) {
      console.error('Failed to trigger deployment:', error);
    }
  };

  const handleCancelDeployment = async (deploymentUuid: string) => {
    try {
      const res = await fetch(`/api/coolify/deployments/${deploymentUuid}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to cancel deployment');
      }
      setTimeout(fetchDeployments, 1000);
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
    }
  };

  // Convert recent deployments to CoolifyDeployment format for DeploymentCard
  const deploymentsForCards: CoolifyDeployment[] = recentDeployments.map(d => ({
    uuid: d.uuid,
    application_name: d.applicationName,
    application_uuid: d.applicationUuid,
    status: d.status as CoolifyDeployment['status'],
    commit: d.commit || undefined,
    commit_message: d.commitMessage || undefined,
    created_at: d.createdAt.toString(),
    finished_at: d.finishedAt?.toString(),
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Coolify Deployments</h1>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coolify Deployments</h1>
        {/* Today's stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>{stats.finishedToday} deployed today</span>
          </div>
          {stats.failedToday > 0 && (
            <div className="flex items-center gap-1.5 text-red-600">
              <XCircle className="h-4 w-4" />
              <span>{stats.failedToday} failed</span>
            </div>
          )}
        </div>
      </div>

      {/* Active deployments section */}
      {activeDeployments.length > 0 && (
          <Card className="border-blue-500/30">
          <CardContent className="pt-4">
            <DeploymentProgressList deployments={activeDeployments} onCancel={handleCancelDeployment} />
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="recent">
            Recent (Last 30 min) ({recentDeployments.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            All History {totalCount > 0 ? `(${totalCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="applications">
            Applications ({applications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {deploymentsForCards.map((deployment) => (
              <DeploymentCard key={deployment.uuid} deployment={deployment} />
            ))}
          </div>
          {recentDeployments.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recent deployments in the last 30 minutes</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="space-y-4">
            {/* Phase 2: Filters will go here */}
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Status Filter */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <div className="flex flex-wrap gap-2">
                      {['finished', 'failed', 'cancelled'].map(status => (
                        <Button
                          key={status}
                          variant={statusFilter.includes(status) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setStatusFilter(prev =>
                              prev.includes(status)
                                ? prev.filter(s => s !== status)
                                : [...prev, status]
                            );
                          }}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Application Filter */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Application</label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={applicationFilter}
                      onChange={(e) => setApplicationFilter(e.target.value)}
                    >
                      <option value="">All Applications</option>
                      {applications.map(app => (
                        <option key={app.uuid} value={app.name}>
                          {app.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Date Range</label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        placeholder="Start"
                        className="text-sm"
                      />
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        placeholder="End"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Clear Filters Button */}
                {(statusFilter.length > 0 || applicationFilter || startDate || endDate) && (
                  <div className="mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatusFilter([]);
                        setApplicationFilter('');
                        setStartDate('');
                        setEndDate('');
                      }}
                    >
                      Clear All Filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deployment grid */}
            {allDeployments.length === 0 && !loadingMore ? (
              <p className="text-center text-muted-foreground py-8">
                No deployments found
              </p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {allDeployments.map((deployment) => (
                    <DeploymentCard
                      key={deployment.uuid}
                      deployment={{
                        uuid: deployment.uuid,
                        status: deployment.status,
                        application_uuid: deployment.applicationUuid,
                        application_name: deployment.applicationName,
                        commit: deployment.commit || undefined,
                        commit_message: deployment.commitMessage || undefined,
                        created_at: typeof deployment.createdAt === 'string'
                          ? deployment.createdAt
                          : deployment.createdAt.toISOString(),
                        finished_at: deployment.finishedAt
                          ? (typeof deployment.finishedAt === 'string'
                            ? deployment.finishedAt
                            : deployment.finishedAt.toISOString())
                          : undefined,
                      }}
                    />
                  ))}
                </div>

                {/* Load More button */}
                {nextCursor && (
                  <div className="mt-6 text-center">
                    <Button
                      onClick={loadMoreDeployments}
                      disabled={loadingMore}
                      variant="outline"
                    >
                      {loadingMore ? 'Loading...' : 'Load More'}
                    </Button>
                  </div>
                )}

                {/* Pagination info */}
                {totalCount > 0 && (
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Showing {allDeployments.length} of {totalCount} deployments
                  </p>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <ApplicationList
            applications={applications}
            onDeploy={handleDeploy}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
