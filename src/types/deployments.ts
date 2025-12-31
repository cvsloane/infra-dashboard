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

export interface DeploymentStatsClient {
  queued: number;
  inProgress: number;
  finishedToday: number;
  failedToday: number;
}
