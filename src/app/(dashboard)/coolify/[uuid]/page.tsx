'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DeploymentCard } from '@/components/coolify/DeploymentCard';
import { DeploymentLogs } from '@/components/coolify/DeploymentLogs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { CoolifyDeployment } from '@/types';

interface DeploymentDetail extends CoolifyDeployment {
  logs?: string;
}

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uuid = params.uuid as string;

  const [deployment, setDeployment] = useState<DeploymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchDeployment = async () => {
    try {
      const res = await fetch(`/api/coolify/deployments/${uuid}`);
      if (res.ok) {
        const data = await res.json();
        setDeployment(data);
      }
    } catch (error) {
      console.error('Failed to fetch deployment:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDeployment();

    // Poll for updates if deployment is in progress
    const interval = setInterval(() => {
      if (deployment?.status === 'in_progress' || deployment?.status === 'queued') {
        fetchDeployment();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [uuid, deployment?.status]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDeployment();
  };

  const handleCancel = async () => {
    if (!deployment) return;
    const canCancel = deployment.status === 'queued' || deployment.status === 'in_progress';
    if (!canCancel || cancelling) return;

    const confirmed = window.confirm(`Cancel deployment for ${deployment.application_name || 'this application'}?`);
    if (!confirmed) return;

    setCancelling(true);
    try {
      const res = await fetch(`/api/coolify/deployments/${uuid}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to cancel deployment');
      }
      setTimeout(fetchDeployment, 1000);
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-muted-foreground">Deployment not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Deployment Details</h1>
        </div>
        <div className="flex items-center gap-2">
          {(deployment.status === 'queued' || deployment.status === 'in_progress') && (
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling...' : 'Cancel'}
            </Button>
          )}
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <DeploymentCard deployment={deployment} showLink={false} />

      <DeploymentLogs
        logs={deployment.logs || null}
        title="Build Logs"
        autoScroll={deployment.status === 'in_progress'}
      />
    </div>
  );
}
