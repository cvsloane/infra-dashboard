/**
 * Cron Job Reader
 *
 * Reads scheduled-job inventory + run history written by the cron-collector
 * agent (and any future producers) from Redis. Uses the same connection as
 * `redis/agents.ts` — see `redis/client.ts`.
 */

import { getRedis } from './client';
import { stalenessThresholdMinutes } from '@/lib/crons/cadence';
import type {
  CronInventoryRecord,
  CronJobSummary,
  CronListResponse,
  CronRunRecord,
  CronStats,
} from '@/types/cron';

const HISTORY_DEFAULT = 50;

export async function listCronHosts(): Promise<string[]> {
  const client = getRedis();
  return client.smembers('cron:hosts');
}

export async function listCronJobIds(host: string): Promise<string[]> {
  const client = getRedis();
  return client.smembers(`cron:jobs:${host}`);
}

export async function getCronInventory(
  host: string,
  jobId: string,
): Promise<CronInventoryRecord | null> {
  const client = getRedis();
  const raw = await client.get(`cron:job:${host}:${jobId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CronInventoryRecord;
  } catch {
    return null;
  }
}

export async function getCronRunHistory(
  host: string,
  jobId: string,
  limit: number = HISTORY_DEFAULT,
): Promise<CronRunRecord[]> {
  const client = getRedis();
  const ids = await client.lrange(`cron:history:${host}:${jobId}`, 0, limit - 1);
  if (!ids.length) return [];

  const out: CronRunRecord[] = [];
  for (const id of ids) {
    const raw = await client.get(`cron:run:${host}:${jobId}:${id}`);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as CronRunRecord);
    } catch {
      // skip
    }
  }
  return out;
}

export async function getLatestCronRun(
  host: string,
  jobId: string,
): Promise<CronRunRecord | null> {
  const runs = await getCronRunHistory(host, jobId, 1);
  return runs[0] || null;
}

export async function getLastCollectedAt(host: string): Promise<string | null> {
  const client = getRedis();
  return client.get(`cron:meta:last-collected-at:${host}`);
}

function deriveStatus(
  inv: CronInventoryRecord,
  run: CronRunRecord | null,
): { status: CronJobSummary['status']; ageMinutes: number | null } {
  if (!inv.enabled) return { status: 'paused', ageMinutes: null };
  if (!run) {
    return { status: 'unknown', ageMinutes: null };
  }
  const startedMs = Date.parse(run.started_at);
  const ageMinutes = Number.isFinite(startedMs)
    ? Math.max(0, Math.floor((Date.now() - startedMs) / 60_000))
    : null;
  // Per-job staleness threshold derived from the schedule cadence. A `*/5`
  // job becomes stale within ~30 minutes; a daily job after ~4 days; a
  // monthly job is capped at 14 days.
  const threshold = stalenessThresholdMinutes(inv.schedule);
  if (ageMinutes !== null && ageMinutes > threshold) {
    return { status: 'stale', ageMinutes };
  }
  return { status: run.status, ageMinutes };
}

async function buildSummary(
  host: string,
  jobId: string,
): Promise<CronJobSummary | null> {
  const inv = await getCronInventory(host, jobId);
  if (!inv) return null;
  const client = getRedis();
  const [latest, count] = await Promise.all([
    getLatestCronRun(host, jobId),
    client.llen(`cron:history:${host}:${jobId}`),
  ]);
  const { status, ageMinutes } = deriveStatus(inv, latest);
  return {
    inventory: inv,
    latest_run: latest,
    status,
    age_minutes: ageMinutes,
    run_count: count,
  };
}

export async function getAllCronJobs(): Promise<CronListResponse> {
  const hosts = await listCronHosts();
  const summaries: CronJobSummary[] = [];

  for (const host of hosts) {
    const ids = await listCronJobIds(host);
    for (const id of ids) {
      const summary = await buildSummary(host, id);
      if (summary) summaries.push(summary);
    }
  }

  summaries.sort((a, b) => {
    const hostCmp = a.inventory.host.localeCompare(b.inventory.host);
    if (hostCmp !== 0) return hostCmp;
    return a.inventory.name.localeCompare(b.inventory.name);
  });

  const stats = computeStats(summaries);
  // last_collected_at: most recent across hosts.
  let lastCollected: string | null = null;
  for (const host of hosts) {
    const t = await getLastCollectedAt(host);
    if (t && (!lastCollected || t > lastCollected)) lastCollected = t;
  }
  stats.last_collected_at = lastCollected;

  return { jobs: summaries, stats };
}

export async function getCronJobSummary(
  host: string,
  jobId: string,
): Promise<CronJobSummary | null> {
  return buildSummary(host, jobId);
}

function computeStats(summaries: CronJobSummary[]): CronStats {
  const hostsSet = new Set<string>();
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let failing = 0;
  let stale = 0;

  for (const s of summaries) {
    hostsSet.add(s.inventory.host);
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    bySource[s.inventory.source] = (bySource[s.inventory.source] || 0) + 1;
    if (s.status === 'failure') failing++;
    if (s.status === 'stale') stale++;
  }

  return {
    total_jobs: summaries.length,
    hosts: [...hostsSet].sort(),
    by_status: byStatus,
    by_source: bySource,
    failing_jobs: failing,
    stale_jobs: stale,
    last_collected_at: null,
  };
}
