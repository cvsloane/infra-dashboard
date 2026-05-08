/**
 * Cron job monitoring types — shared between collector and dashboard.
 *
 * Mirrored in `@open-agents/shared/src/cron-store.ts` (writer side).
 * Keep both in sync when fields change.
 */

export type CronSource =
  | 'user-crontab'
  | 'system-crontab'
  | 'cron.d'
  | 'cron.hourly'
  | 'cron.daily'
  | 'cron.weekly'
  | 'cron.monthly'
  | 'systemd-timer'
  | 'anacron'
  | 'hermes';

export type CronRunStatus = 'success' | 'failure' | 'running' | 'missed' | 'unknown';

export interface CronInventoryRecord {
  /** Stable opaque ID (collector-generated, deterministic). */
  id: string;
  host: string;
  source: CronSource;
  /** Display name. Defaults to derived-from-command if no curated name available. */
  name: string;
  /** Cron expression or systemd OnCalendar/OnUnitActiveSec spec. */
  schedule: string;
  /** Human-readable rendering of the schedule (e.g., "Every 15 minutes"). */
  schedule_display?: string;
  /** Full command line. */
  command: string;
  /** Effective user the job runs as. */
  owner?: string;
  /** Path to the log file the collector tails for run inference. */
  log_path?: string;
  /** Curated description from inventory enrichment file. */
  description?: string;
  /** Curated runbook URL. */
  runbook_url?: string;
  /** Curated tags (e.g., ["vault", "qa"]). */
  tags?: string[];
  /** Curated severity if this job stops running. */
  severity_if_missing?: 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable explanation for an expected non-OK status that should not page. */
  false_positive_reason?: string;
  /** Whether the job is currently enabled. */
  enabled: boolean;
  /** ISO timestamp the job was first observed. */
  discovered_at: string;
  /** ISO timestamp the job was last observed. */
  last_seen_at: string;
  /** ISO timestamp of the next expected run, if computable. */
  next_run_at?: string | null;
  /** Source-specific raw line, helpful for debugging. */
  raw?: string;
  /** Hermes-only fields, when source === 'hermes'. */
  hermes?: {
    job_id?: string;
    slug?: string;
    provider?: string;
    model?: string;
  };
}

export interface CronRunRecord {
  host: string;
  jobId: string;
  runId: string;
  /** ISO start timestamp. */
  started_at: string;
  /** ISO end timestamp. */
  ended_at?: string | null;
  duration_ms?: number | null;
  exit_code?: number | null;
  status: CronRunStatus;
  /** Last ~2KB of stdout/stderr captured from the log file. */
  log_excerpt?: string | null;
  /** Where the collector inferred this run from. */
  source: 'systemd-show' | 'log-tail' | 'log-mtime' | 'syslog' | 'hermes-passthrough';
}

export interface CronJobSummary {
  inventory: CronInventoryRecord;
  /** Latest run, if any. */
  latest_run: CronRunRecord | null;
  /** Health status derived from latest run + staleness checks. */
  status: CronRunStatus | 'stale' | 'paused';
  /** Minutes since last run, or null if never observed. */
  age_minutes: number | null;
  /** Total runs in retained history. */
  run_count: number;
}

export interface CronStats {
  total_jobs: number;
  hosts: string[];
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  failing_jobs: number;
  stale_jobs: number;
  last_collected_at: string | null;
}

export interface CronListResponse {
  jobs: CronJobSummary[];
  stats: CronStats;
}

export interface CronJobDetailResponse {
  job: CronJobSummary;
  history: CronRunRecord[];
}
