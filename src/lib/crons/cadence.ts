// Estimate the expected interval between firings of a scheduled job.
//
// Used by the staleness check so a "*/5 * * * *" job is flagged stale within
// an hour, while a "0 3 * * 0" (weekly) job has until well past one week.
//
// Returns milliseconds, or null if we can't estimate. The returned value is
// the typical interval, not the exact next firing time — close enough for
// staleness alerting.
//
// Handles:
//   - 5-field cron expressions (subset of common patterns)
//   - cron aliases: @hourly, @daily, @weekly, @monthly, @yearly
//   - run-parts labels: cron.hourly, cron.daily, cron.weekly, cron.monthly
//   - anacron: period=N delay=M
//   - systemd OnUnitActiveSec=Ns / Nm / Nh / Nd

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

const ALIAS_INTERVALS: Record<string, number> = {
  '@hourly': HOUR,
  '@daily': DAY,
  '@midnight': DAY,
  '@weekly': WEEK,
  '@monthly': MONTH,
  '@yearly': 365 * DAY,
  '@annually': 365 * DAY,
  'cron.hourly': HOUR,
  'cron.daily': DAY,
  'cron.weekly': WEEK,
  'cron.monthly': MONTH,
};

export function estimateIntervalMs(schedule: string | undefined | null): number | null {
  if (!schedule) return null;
  const trimmed = schedule.trim();
  if (!trimmed) return null;

  const aliasHit = ALIAS_INTERVALS[trimmed.toLowerCase()] || ALIAS_INTERVALS[trimmed];
  if (aliasHit) return aliasHit;

  // Anacron: "period=1 delay=5" means once per 1 day with 5min delay.
  const anacron = /^period=(\d+|@?\w+)/.exec(trimmed);
  if (anacron) {
    const p = anacron[1].toLowerCase();
    if (p === '@monthly') return MONTH;
    if (p === '@weekly') return WEEK;
    if (p === '@daily') return DAY;
    const days = parseInt(p, 10);
    if (Number.isFinite(days) && days > 0) return days * DAY;
  }

  // systemd OnUnitActiveSec=Ns / Nm / Nh / Nd or just N (seconds).
  const sd = /^(\d+)\s*([smhd])?$/.exec(trimmed);
  if (sd) {
    const n = Number(sd[1]);
    const unit = sd[2] || 's';
    if (Number.isFinite(n)) {
      switch (unit) {
        case 's': return n * 1000;
        case 'm': return n * MINUTE;
        case 'h': return n * HOUR;
        case 'd': return n * DAY;
      }
    }
  }

  // 5-field cron (`m h dom mon dow`). We only attempt a few common shapes;
  // anything else returns null and the caller falls back to a flat default.
  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    return interpretCronParts(parts);
  }

  return null;
}

function interpretCronParts(parts: string[]): number | null {
  const [m, h, dom, mon, dow] = parts;

  // Step expressions on the minute field: */N * * * * → every N minutes.
  if (m.startsWith('*/')) {
    const step = parseInt(m.slice(2), 10);
    if (Number.isFinite(step) && step > 0) {
      return step * MINUTE;
    }
  }

  // Comma-separated discrete minute hits within the hour: "5,20,35,50 * * * *".
  if (m.includes(',') && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    const count = m.split(',').filter(Boolean).length;
    if (count > 0) return Math.floor(HOUR / count);
  }

  // Range with step: "5-55/10 * * * *".
  const rangeStep = /^(\d+)-(\d+)\/(\d+)$/.exec(m);
  if (rangeStep && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    const step = parseInt(rangeStep[3], 10);
    if (Number.isFinite(step) && step > 0) return step * MINUTE;
  }

  // Hourly: minute is fixed (or `0`/digit), hour is `*` or step.
  if (/^\d+$/.test(m)) {
    if (h === '*') return HOUR;
    if (h.startsWith('*/')) {
      const step = parseInt(h.slice(2), 10);
      if (Number.isFinite(step) && step > 0) return step * HOUR;
    }
    if (h.includes(',') && dom === '*' && mon === '*' && dow === '*') {
      const count = h.split(',').filter(Boolean).length;
      if (count > 0) return Math.floor(DAY / count);
    }
    if (/^\d+$/.test(h)) {
      // Daily, weekly, or monthly depending on the remaining fields.
      if (dow !== '*' && dow !== '?' && dow !== '0-6') {
        // Specific day-of-week: weekly. (Multiple DoW = closer to daily, but
        // for stale detection the weekly bound is safe.)
        if (dow.includes(',')) {
          const days = dow.split(',').filter(Boolean).length;
          return Math.max(DAY, Math.floor(WEEK / Math.max(days, 1)));
        }
        return WEEK;
      }
      if (dom !== '*' && dom !== '?') {
        // Specific day-of-month: monthly.
        return MONTH;
      }
      return DAY;
    }
  }

  return null;
}

/**
 * Compute the staleness threshold for a job: 4× its expected interval, with
 * sensible floor and ceiling. Caller passes the schedule string (cron expr,
 * alias, or systemd spec). Returns minutes.
 */
export function stalenessThresholdMinutes(schedule: string | undefined | null): number {
  const intervalMs = estimateIntervalMs(schedule);
  if (!intervalMs) {
    // Unknown cadence — keep the conservative 7-day default.
    return 7 * 24 * 60;
  }
  // 4 missed cycles before we cry wolf — but never less than 30 minutes
  // (a `*/5` job naturally hits 5min intervals, so 4× = 20m feels too tight).
  // And never more than 14 days, so a once-a-month job still alerts within
  // two cycles instead of "ever".
  const ms = Math.min(Math.max(intervalMs * 4, 30 * MINUTE), 14 * DAY);
  return Math.floor(ms / MINUTE);
}
