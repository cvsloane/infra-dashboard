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
  schedule_display?: string | null;
  model?: string | null;
  provider?: string | null;
  deliver?: string | null;
  max_stale_minutes?: number | null;
  skills?: string[];
  state?: string | null;
  paused_at?: string | null;
  paused_reason?: string | null;
  created_at?: string | null;
  repeat?: { times?: number | null; completed?: number | null };
  prompt_file?: string | null;
  prompt_path?: string | null;
  routing?: Record<string, unknown>;
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

export interface HermesRun {
  session_id: string;
  job_id?: string | null;
  job_name?: string | null;
  job_slug?: string | null;
  node?: string | null;
  source?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  status: 'ok' | 'error' | 'running' | 'unknown';
  end_reason?: string | null;
  model?: string | null;
  provider?: string | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  estimated_cost_usd?: number | null;
  actual_cost_usd?: number | null;
  cost_status?: string | null;
  cost_source?: string | null;
  trace_id?: string | null;
  trace_url?: string | null;
  title?: string | null;
}

export interface HermesOutput {
  job?: string;
  job_id?: string;
  output_path?: string | null;
  timestamp?: string | null;
  content?: string | null;
}

export interface HermesJobDetail {
  status: string;
  checked_at: string;
  job: HermesJob;
  runs: HermesRun[];
  latest_output: HermesOutput;
  prompt: {
    path?: string | null;
    content?: string | null;
  };
  evaluator?: {
    status?: string | null;
    scores?: HermesEvaluatorScore[];
    all_scores?: HermesEvaluatorScore[];
    warnings?: string[];
  };
}

export interface HermesRunDetail {
  status: string;
  checked_at: string;
  run: HermesRun;
  messages: Array<{
    id: number;
    role: string;
    content?: string | null;
    tool_call_id?: string | null;
    tool_name?: string | null;
    timestamp?: string | null;
    token_count?: number | null;
    finish_reason?: string | null;
  }>;
}

export interface HermesCostSummary {
  status: string;
  checked_at: string;
  window: string;
  pricing_version: string;
  total_cost_usd: number;
  run_count: number;
  budget_alarms?: {
    status: 'ok' | 'warning' | 'critical' | string;
    window: string;
    threshold_key: string;
    warning_usd?: number | null;
    critical_usd?: number | null;
    job_alerts: Array<{
      job_id?: string | null;
      job_name?: string | null;
      cost_usd: number;
      warning_usd: number;
    }>;
    configured: boolean;
    mutations: string;
  };
  by_model: Array<{
    model: string;
    provider: string;
    runs: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
  }>;
  by_job_top_n: Array<{
    job_id: string;
    job_name: string;
    job_slug?: string | null;
    node?: string | null;
    runs: number;
    total_tokens: number;
    cost_usd: number;
  }>;
  daily: Array<{ date: string; cost_usd: number }>;
}

export interface HermesActivityResponse {
  status: string;
  checked_at: string;
  events: HermesRun[];
}

export interface HermesActionResponse {
  status: 'success' | 'error';
  checked_at: string;
  result: {
    node: string;
    job: string;
    job_id: string;
    action?: string;
    ok: boolean;
    stdout?: string;
    stderr?: string;
  };
  audit?: Record<string, unknown>;
}

export interface HermesAlert {
  timestamp?: string | null;
  trace_id?: string | null;
  trace_url?: string | null;
  job: string;
  alias?: string | null;
  status: string;
  router_status?: string | null;
  title?: string | null;
  target_key?: string | null;
  target_label?: string | null;
  outcome?: string | null;
  reason?: string | null;
  should_deliver?: boolean;
}

export interface HermesAlertsResponse {
  status: string;
  checked_at: string;
  window: string;
  alert_count: number;
  error_count: number;
  warning_count: number;
  alerts: HermesAlert[];
  by_job: Array<{
    job: string;
    count: number;
    last_at?: string | null;
    error: number;
    warning: number;
  }>;
  by_target: Array<{ target: string; count: number }>;
}

export interface HermesActionLogResponse {
  status: string;
  checked_at: string;
  count: number;
  actions: Array<Record<string, unknown>>;
  by_action: Array<{ action: string; count: number }>;
}

export interface HermesObservabilityResponse {
  status: 'success' | 'warning' | 'error';
  checked_at: string;
  message: string;
  langfuse: {
    configured: boolean;
    base_url?: string | null;
    project_id?: string | null;
    trace_url_template_configured: boolean;
    public_key_configured: boolean;
    secret_key_configured: boolean;
    health?: {
      ok: boolean;
      status_code?: number | null;
      latency_ms?: number | null;
      error?: string | null;
    } | null;
    ready?: {
      ok: boolean;
      status_code?: number | null;
      latency_ms?: number | null;
      error?: string | null;
    } | null;
  };
  local_traces: {
    path: string;
    exists: boolean;
    event_count: number;
    recent_event_count_24h: number;
    unique_trace_count: number;
    latest_event_at?: string | null;
    event_counts: Record<string, number>;
  };
  langfuse_export?: {
    path: string;
    exists: boolean;
    exported_envelope_count: number;
    updated_at?: string | null;
    latest_exported_at?: string | null;
  };
}

export interface HermesRoadmapItem {
  area: string;
  status: string;
  configured_count: number;
  expected_count: number;
  surface: string;
  remaining?: string | null;
}

export interface HermesEvaluatorScore {
  job: string;
  score: number;
  threshold: number;
}

export interface HermesRoadmapResponse {
  status: string;
  checked_at: string;
  config_path: string;
  activation_matrix: {
    status: string;
    title: string;
    message: string;
    metrics: {
      area_count: number;
      ready_or_active_count: number;
      remaining_count: number;
    };
    details: {
      items: HermesRoadmapItem[];
      config_path: string;
      mutations: string;
    };
  };
  reflection: {
    status: string;
    title: string;
    message: string;
    metrics: Record<string, number>;
    details: {
      warnings?: string[];
      latest_scores?: HermesEvaluatorScore[];
      memory_dirs?: Record<string, boolean>;
      rubrics?: Record<string, boolean>;
      tool_hook_event_count_48h?: number;
      langfuse?: Record<string, unknown>;
    };
  };
}

export interface HermesMemoryResponse {
  status: string;
  checked_at: string;
  root: string;
  exists: boolean;
  agent_count: number;
  agents: Array<{
    agent: string;
    path: string;
    file_count: number;
    latest_modified_at?: string | null;
    files: Array<{
      path: string;
      relative_path: string;
      size_bytes: number;
      modified_at?: string | null;
      preview: string;
    }>;
  }>;
}

export interface HermesHookHistoryResponse {
  status: string;
  checked_at: string;
  window: string;
  event_count: number;
  events: Array<{
    timestamp?: string | null;
    trace_id?: string | null;
    trace_url?: string | null;
    event: string;
    job?: string | null;
    tool?: string | null;
    status?: string | null;
    reason?: string | null;
  }>;
  by_event: Array<{ event: string; count: number }>;
}

export interface HermesPromptHistoryResponse {
  status: string;
  checked_at: string;
  job: HermesJob;
  prompt_path?: string | null;
  current_content?: string | null;
  commits: Array<{
    hash: string;
    short_hash: string;
    author: string;
    committed_at?: string | null;
    subject: string;
    diff_to_next: string;
  }>;
}

export interface HermesScheduleProposalResponse {
  status: string;
  checked_at: string;
  proposal: {
    timestamp: string;
    actor: string;
    job_id?: string | null;
    job_name?: string | null;
    job_slug?: string | null;
    current_schedule?: unknown;
    proposed_schedule: string;
    note: string;
    status: string;
    mutations: string;
  };
}
