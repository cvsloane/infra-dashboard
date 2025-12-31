'use client';

import { useEffect, useState } from 'react';
import { ApplicationList } from '@/components/coolify/ApplicationList';
import { DeploymentCard } from '@/components/coolify/DeploymentCard';
import { DeploymentProgressList } from '@/components/coolify/DeploymentProgress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
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

      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">
            Recent Deployments ({recentDeployments.length})
          </TabsTrigger>
          <TabsTrigger value="applications">
            Applications ({applications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="mt-4">
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
