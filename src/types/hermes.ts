export type HermesHealthStatus = 'ok' | 'warning' | 'error' | 'unknown';

export interface HermesJob {
  name: string;
  slug?: string;
  status?: string;
  node?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  summary_status?: string | null;
  summary_title?: string | null;
  summary_message?: string | null;
  output_path?: string | null;
  job_id?: string;
  enabled?: boolean;
  last_status?: string | null;
  age_minutes?: number | null;
  pending_retry?: boolean;
}

export interface HermesNodeSummary {
  status: string;
  message?: string | null;
  issues?: unknown[];
  job_count: number;
}

export interface HermesSummary {
  status: HermesHealthStatus;
  message: string;
  checked_at: string;
  last_update?: string | null;
  counts: {
    total: number;
    ok: number;
    warning: number;
    error: number;
    paused: number;
    unknown: number;
  };
  nodes: Record<string, HermesNodeSummary>;
  alerts: HermesJob[];
  jobs: HermesJob[];
  fleet?: {
    status?: string;
    title?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  unavailable?: boolean;
}

export type HermesOverviewSummary = Omit<HermesSummary, 'jobs'>;
