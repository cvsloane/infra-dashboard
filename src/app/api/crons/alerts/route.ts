/**
 * API: alerting subset of scheduled jobs — anything stale or failing,
 * filtered by severity. Designed for periodic polling (e.g. a Hermes job
 * that posts the result to Discord).
 *
 * Query params:
 *   min_severity = low | medium | high | critical (default: low)
 *   include_unknown = true|false (default: false) — surface jobs that have
 *     never produced a run record. Most fleets have a long tail of these
 *     for jobs whose runs aren't observable, so the default suppresses them.
 *   include_false_positives = true|false (default: false) — include jobs
 *     annotated with false_positive_reason.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAllCronJobs } from '@/lib/redis/crons';
import { fetchHermesPassthrough } from '@/lib/crons/hermes-passthrough';
import type { CronJobSummary } from '@/types/cron';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SEVERITY_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export async function GET(request: NextRequest) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const minSev = (searchParams.get('min_severity') || 'low').toLowerCase();
  const includeUnknown = searchParams.get('include_unknown') === 'true';
  const includeFalsePositives = searchParams.get('include_false_positives') === 'true';
  const minRank = SEVERITY_RANK[minSev] ?? 0;

  try {
    const [raw, hermes] = await Promise.all([getAllCronJobs(), fetchHermesPassthrough()]);
    const all = [...raw.jobs, ...hermes.jobs];

    const suppressedFalsePositives = all.filter((j) =>
      j.inventory.false_positive_reason && isAlerting(j, minRank, includeUnknown, true),
    );
    const alerts = all.filter((j) => isAlerting(j, minRank, includeUnknown, includeFalsePositives));
    alerts.sort((a, b) => severityRank(b) - severityRank(a));

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      min_severity: minSev,
      include_unknown: includeUnknown,
      include_false_positives: includeFalsePositives,
      alert_count: alerts.length,
      suppressed_false_positive_count: includeFalsePositives ? 0 : suppressedFalsePositives.length,
      counts_by_status: countBy(alerts, (j) => j.status),
      counts_by_host: countBy(alerts, (j) => j.inventory.host),
      alerts,
      hermes_unavailable: hermes.unavailable || undefined,
    });
  } catch (error) {
    console.error('Failed to compute cron alerts:', error);
    return NextResponse.json({ error: 'Failed to compute alerts' }, { status: 500 });
  }
}

function severityRank(j: CronJobSummary): number {
  const sev = j.inventory.severity_if_missing;
  return sev ? (SEVERITY_RANK[sev] ?? 0) : 0;
}

function isAlerting(
  j: CronJobSummary,
  minRank: number,
  includeUnknown: boolean,
  includeFalsePositives: boolean,
): boolean {
  const sev = severityRank(j);
  if (sev < minRank) return false;
  if (!includeFalsePositives && j.inventory.false_positive_reason) return false;
  if (j.status === 'failure' || j.status === 'stale') return true;
  if (includeUnknown && j.status === 'unknown') return true;
  return false;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
