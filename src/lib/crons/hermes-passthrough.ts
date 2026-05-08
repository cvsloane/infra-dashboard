/**
 * Map Hermes-managed jobs (from the sidecar's `/fleet/summary` endpoint)
 * into the shape used by the `/crons` page so they render alongside raw
 * cron + systemd timer entries.
 *
 * The mapping is intentionally lossy: full Hermes context (run history,
 * traces, costs) stays at `/hermes`. The `/crons` view shows just enough to
 * recognise that the job exists and whether it's healthy.
 */

import type { CronJobSummary, CronRunRecord } from '@/types/cron';
import type { HermesJob, HermesSummary } from '@/types/hermes';
import { getHermesSummary } from '@/lib/hermes/client';

function statusFromHermesJob(job: HermesJob): CronJobSummary['status'] {
  if (job.enabled === false) return 'paused';
  const summary = String(job.summary_status || job.last_status || job.status || 'unknown').toLowerCase();
  if (summary === 'error') return 'failure';
  if (summary === 'warning' || summary === 'stale' || summary === 'overdue') return 'stale';
  if (summary === 'ok' || summary === 'success') return 'success';
  return 'unknown';
}

function syntheticLatestRun(job: HermesJob, status: CronJobSummary['status']): CronRunRecord | null {
  if (!job.last_run_at) return null;
  // Map our status enum back to the run-record status enum.
  const runStatus =
    status === 'failure'
      ? 'failure'
      : status === 'stale'
        ? 'unknown'
        : status === 'paused'
          ? 'unknown'
          : status === 'success'
            ? 'success'
            : 'unknown';
  return {
    host: job.node || 'hq',
    jobId: hermesJobId(job),
    runId: 'hermes-latest',
    started_at: job.last_run_at,
    ended_at: job.last_run_at,
    duration_ms: null,
    exit_code: null,
    status: runStatus,
    log_excerpt: job.summary_message || job.summary_title || null,
    source: 'hermes-passthrough',
  };
}

export function hermesJobId(job: HermesJob): string {
  return job.job_id || job.slug || `hermes-${(job.name || 'unnamed').replace(/\s+/g, '-')}`;
}

export function hermesJobToSummary(job: HermesJob): CronJobSummary {
  const id = hermesJobId(job);
  const host = job.node || 'hq';
  const status = statusFromHermesJob(job);
  const latest = syntheticLatestRun(job, status);
  const ageMinutes =
    typeof job.age_minutes === 'number' && Number.isFinite(job.age_minutes)
      ? Math.max(0, Math.floor(job.age_minutes))
      : latest && latest.started_at
        ? Math.max(0, Math.floor((Date.now() - Date.parse(latest.started_at)) / 60_000))
        : null;

  return {
    inventory: {
      id,
      host,
      source: 'hermes',
      name: job.name || job.slug || id,
      schedule: job.schedule_display || '(hermes-managed)',
      schedule_display: job.schedule_display || undefined,
      command: job.prompt_file || job.prompt_path || '(LLM-driven Hermes job)',
      owner: 'hermes',
      enabled: job.enabled !== false,
      description: job.summary_title || undefined,
      tags: job.skills && job.skills.length ? job.skills : ['hermes'],
      discovered_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      next_run_at: job.next_run_at || null,
      hermes: {
        job_id: job.job_id,
        slug: job.slug,
        provider: job.provider || undefined,
        model: job.model || undefined,
      },
    },
    latest_run: latest,
    status,
    age_minutes: ageMinutes,
    run_count: 0,
  };
}

export interface HermesPassthroughResult {
  jobs: CronJobSummary[];
  unavailable: boolean;
  message?: string;
}

export async function fetchHermesPassthrough(): Promise<HermesPassthroughResult> {
  let summary: HermesSummary;
  try {
    summary = await getHermesSummary();
  } catch (err) {
    return {
      jobs: [],
      unavailable: true,
      message: err instanceof Error ? err.message : 'hermes-summary-unavailable',
    };
  }
  if (summary.unavailable) {
    return { jobs: [], unavailable: true, message: summary.message };
  }
  return {
    jobs: summary.jobs.map(hermesJobToSummary),
    unavailable: false,
  };
}
