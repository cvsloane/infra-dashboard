// Coolify Types
export interface CoolifyApplication {
  uuid: string;
  name: string;
  description?: string;
  fqdn?: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting' | 'exited' | 'degraded';
  git_repository?: string;
  git_branch?: string;
  git_commit_sha?: string;
  environment?: {
    name: string;
    project?: {
      name: string;
    };
  };
  created_at: string;
  updated_at: string;
}

export interface CoolifyDeployment {
  uuid: string;
  status: 'queued' | 'in_progress' | 'finished' | 'failed' | 'cancelled' | 'cancelled-by-user';
  application_uuid?: string;
  application_name?: string;
  commit?: string;
  commit_message?: string;
  created_at: string;
  finished_at?: string;
  logs?: string;
}

// PostgreSQL Types
export interface PostgresHealth {
  status: 'ok' | 'error' | 'warning';
  message: string;
  metrics: PostgresMetrics;
  databases?: DatabaseInfo[];
}

export interface PostgresMetrics {
  pg_up: number;
  pg_stat_activity_count: number;
  pg_settings_max_connections: number;
  pgbouncer_pools_client_active: number;
  pgbouncer_pools_client_waiting: number;
  pgbouncer_pools_server_active: number;
  pgbouncer_pools_server_idle: number;
}

export interface DatabaseInfo {
  name: string;
  connections: number;
  maxConnections: number;
  activeQueries?: number;
  size?: string;
  uptime?: string;
}

// BullMQ Types
export interface QueueStats {
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

export interface WorkerSupervisorItem {
  name: string;
  source: 'systemd' | 'pm2' | 'docker';
  status: 'ok' | 'warning' | 'down';
  detail?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface WorkerSupervisorStatus {
  version: number;
  host?: string;
  updatedAt: string;
  summary: {
    total: number;
    ok: number;
    warning: number;
    down: number;
  };
  items: WorkerSupervisorItem[];
  stale?: boolean;
  ageSec?: number;
}

export interface FailedJob {
  id: string;
  name: string;
  queue: string;
  failedReason: string;
  stacktrace?: string[];
  attemptsMade: number;
  timestamp: number;
  data?: Record<string, unknown>;
}

// SSE Types
export interface SSEUpdate {
  coolify: {
    applications: CoolifyApplication[];
    deployments: CoolifyDeployment[];
  };
  postgres: {
    status: string;
    metrics: PostgresMetrics;
  };
  bullmq: {
    queues: QueueStats[];
  };
  timestamp: string;
}
