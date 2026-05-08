/**
 * Tests for the cron reader's status derivation. The Redis-backed code paths
 * are exercised in integration; this locks in the pure logic, including the
 * schedule-aware staleness threshold.
 */

import { describe, expect, it } from 'vitest';
import { stalenessThresholdMinutes } from '@/lib/crons/cadence';
import type { CronInventoryRecord, CronRunRecord } from '@/types/cron';

// Mirror of `deriveStatus` in `lib/redis/crons.ts`. Kept here to avoid
// pulling in the Redis client during tests.
function deriveStatusForTest(
  inv: CronInventoryRecord,
  run: CronRunRecord | null,
  now = Date.now(),
): { status: string; ageMinutes: number | null } {
  if (!inv.enabled) return { status: 'paused', ageMinutes: null };
  if (!run) return { status: 'unknown', ageMinutes: null };
  const startedMs = Date.parse(run.started_at);
  const ageMinutes = Number.isFinite(startedMs)
    ? Math.max(0, Math.floor((now - startedMs) / 60_000))
    : null;
  const threshold = stalenessThresholdMinutes(inv.schedule);
  if (ageMinutes !== null && ageMinutes > threshold) {
    return { status: 'stale', ageMinutes };
  }
  return { status: run.status, ageMinutes };
}

const baseInv: CronInventoryRecord = {
  id: 'abc',
  host: 'h',
  source: 'user-crontab',
  name: 'test',
  schedule: '0 3 * * *', // daily; threshold = 4 days.
  command: '/bin/true',
  enabled: true,
  discovered_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
};

const baseRun: CronRunRecord = {
  host: 'h',
  jobId: 'abc',
  runId: 'r1',
  started_at: new Date().toISOString(),
  status: 'success',
  source: 'systemd-show',
};

describe('cron status derivation', () => {
  it('paused jobs report paused regardless of run state', () => {
    const inv = { ...baseInv, enabled: false };
    expect(deriveStatusForTest(inv, baseRun).status).toBe('paused');
    expect(deriveStatusForTest(inv, null).status).toBe('paused');
  });

  it('jobs with no run record are unknown', () => {
    expect(deriveStatusForTest(baseInv, null).status).toBe('unknown');
  });

  it('a daily job that last ran 5 days ago is stale (4-day threshold)', () => {
    const now = Date.now();
    const old = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(deriveStatusForTest(baseInv, { ...baseRun, started_at: old }, now).status).toBe('stale');
  });

  it('a daily job that last ran 1 day ago is healthy', () => {
    const now = Date.now();
    const fresh = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(deriveStatusForTest(baseInv, { ...baseRun, started_at: fresh }, now).status).toBe('success');
  });

  it('a */5 job that last ran 1h ago is stale (30-minute threshold)', () => {
    const inv = { ...baseInv, schedule: '*/5 * * * *' };
    const now = Date.now();
    const old = new Date(now - 60 * 60_000).toISOString();
    expect(deriveStatusForTest(inv, { ...baseRun, started_at: old }, now).status).toBe('stale');
  });

  it('a */5 job that last ran 10m ago is fine', () => {
    const inv = { ...baseInv, schedule: '*/5 * * * *' };
    const now = Date.now();
    const fresh = new Date(now - 10 * 60_000).toISOString();
    expect(deriveStatusForTest(inv, { ...baseRun, started_at: fresh }, now).status).toBe('success');
  });

  it('a monthly job that last ran 10 days ago is fine (cap at 14d)', () => {
    const inv = { ...baseInv, schedule: '0 4 1 * *' };
    const now = Date.now();
    const old = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(deriveStatusForTest(inv, { ...baseRun, started_at: old }, now).status).toBe('success');
  });

  it('failure status passes through when not stale', () => {
    expect(deriveStatusForTest(baseInv, { ...baseRun, status: 'failure' }).status).toBe('failure');
  });

  it('age is reported in whole minutes from start', () => {
    const now = Date.now();
    const tenMinAgo = new Date(now - 10 * 60_000 - 5_000).toISOString();
    const result = deriveStatusForTest(
      baseInv,
      { ...baseRun, started_at: tenMinAgo },
      now,
    );
    expect(result.ageMinutes).toBe(10);
  });
});
