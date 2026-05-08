/**
 * API: list every scheduled job across the fleet.
 *
 * Sources:
 *   - Raw cron + systemd timers — read from Redis (written by cron-collector).
 *   - Hermes-managed jobs — fetched live from the Hermes sidecar's
 *     `/fleet/summary` endpoint and converted into the shared CronJobSummary
 *     shape so the UI renders both side-by-side.
 *
 * The Hermes pass-through is best-effort: if the sidecar is unreachable, we
 * still return the raw-cron data and surface `hermes_unavailable` so the UI
 * can show a banner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAllCronJobs } from '@/lib/redis/crons';
import { fetchHermesPassthrough } from '@/lib/crons/hermes-passthrough';
import type { CronJobSummary, CronListResponse, CronStats } from '@/types/cron';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ExtendedResponse extends CronListResponse {
  hermes_unavailable?: boolean;
  hermes_message?: string;
}

export async function GET(request: NextRequest) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [raw, hermes] = await Promise.all([getAllCronJobs(), fetchHermesPassthrough()]);
    const merged = mergeJobLists(raw.jobs, hermes.jobs);
    const stats = recomputeStats(merged, raw.stats);
    const body: ExtendedResponse = {
      jobs: merged,
      stats,
      hermes_unavailable: hermes.unavailable || undefined,
      hermes_message: hermes.message,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error('Failed to fetch cron jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cron jobs' },
      { status: 500 },
    );
  }
}

/**
 * Merge raw + Hermes job lists, then sort. We do not deduplicate today: a job
 * registered in both Hermes and a raw cron file would (correctly) show twice
 * with different `source` values.
 */
function mergeJobLists(raw: CronJobSummary[], hermes: CronJobSummary[]): CronJobSummary[] {
  const merged = [...raw, ...hermes];
  merged.sort((a, b) => {
    const hostCmp = a.inventory.host.localeCompare(b.inventory.host);
    if (hostCmp !== 0) return hostCmp;
    return a.inventory.name.localeCompare(b.inventory.name);
  });
  return merged;
}

function recomputeStats(merged: CronJobSummary[], rawStats: CronStats): CronStats {
  const hostsSet = new Set<string>();
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let failing = 0;
  let stale = 0;
  for (const j of merged) {
    hostsSet.add(j.inventory.host);
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    bySource[j.inventory.source] = (bySource[j.inventory.source] || 0) + 1;
    if (j.status === 'failure') failing++;
    if (j.status === 'stale') stale++;
  }
  return {
    total_jobs: merged.length,
    hosts: [...hostsSet].sort(),
    by_status: byStatus,
    by_source: bySource,
    failing_jobs: failing,
    stale_jobs: stale,
    last_collected_at: rawStats.last_collected_at,
  };
}
