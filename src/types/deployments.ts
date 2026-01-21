/**
 * Deployment build stages tracked during the deployment process.
 */
export type BuildStage = 'queued' | 'cloning' | 'installing' | 'building' | 'deploying' | 'completed' | 'failed';

/**
 * Client-side representation of a deployment record.
 */
export interface DeploymentRecordClient {
  uuid: string;
  applicationName: string;
  applicationUuid: string;
  status: 'queued' | 'in_progress' | 'finished' | 'failed' | 'cancelled' | 'cancelled-by-user';
  commit: string | null;
  commitMessage: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  finishedAt: string | Date | null;
  durationMs: number | null;
}

/**
 * Deployment record with full logs included.
 */
export interface DeploymentRecordClientWithLogs extends DeploymentRecordClient {
  logs?: string | null;
}

/**
 * Aggregate deployment statistics.
 */
export interface DeploymentStatsClient {
  queued: number;
  inProgress: number;
  finishedToday: number;
  failedToday: number;
}

export interface DeploymentPage {
  deployments: DeploymentRecordClient[];
  nextCursor: string | null;
  totalCount: number;
}

export interface DeploymentFilters {
  status?: ('finished' | 'failed' | 'cancelled' | 'cancelled-by-user')[];
  applicationName?: string;
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
}
