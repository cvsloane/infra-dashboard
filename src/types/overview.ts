import type { CoolifyDeployment } from '@/types';
import type { DeploymentRecordClient, DeploymentStatsClient } from '@/types/deployments';

export interface OverviewSiteHealth {
  applicationUuid?: string;
  name: string;
  fqdn: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string;
  sslDaysRemaining?: number;
}

export interface OverviewData {
  alerts: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    message: string;
    firing: number;
    suppressed: number;
    critical: number;
    warning: number;
    alerts: Array<{
      fingerprint?: string;
      name: string;
      severity: 'critical' | 'warning' | 'info' | 'unknown';
      state: 'firing' | 'suppressed' | 'unknown';
      startsAt?: string;
      endsAt?: string;
      summary?: string;
      description?: string;
      generatorURL?: string;
    }>;
  };
  coolify: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    message: string;
    applicationCount: number;
    recentDeployments: CoolifyDeployment[];
    activeDeployments: DeploymentRecordClient[];
    stats: DeploymentStatsClient;
  };
  postgres: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    message: string;
    connections: number;
    maxConnections: number;
    metricsAgeSec: number | null;
  };
  backups: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    message: string;
    logicalAgeSec: number | null;
    walAgeSec: number | null;
    basebackupAgeSec: number | null;
    restoreDrillAgeSec: number | null;
  };
  workerSupervisor: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    message: string;
    summary: {
      total: number;
      ok: number;
      warning: number;
      down: number;
    };
    stale?: boolean;
    ageSec?: number;
    items: Array<{
      name: string;
      source: 'systemd' | 'pm2' | 'docker';
      status: 'ok' | 'warning' | 'down';
      detail?: string;
    }>;
  };
  bullmq: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    message: string;
    queues: Array<{
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
    }>;
    totalFailed: number;
    workersDown: number;
  };
  sites: {
    status: 'ok' | 'error' | 'warning' | 'loading' | 'unknown';
    downSites: OverviewSiteHealth[];
    allSites: OverviewSiteHealth[];
    totalSites: number;
    healthySites: number;
    sslExpiringSoonCount: number;
    sslExpiryWarnDays: number;
  };
}
