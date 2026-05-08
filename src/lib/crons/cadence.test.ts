import { describe, expect, it } from 'vitest';
import { estimateIntervalMs, stalenessThresholdMinutes } from './cadence';

describe('estimateIntervalMs', () => {
  it('handles aliases', () => {
    expect(estimateIntervalMs('@hourly')).toBe(60 * 60_000);
    expect(estimateIntervalMs('@daily')).toBe(24 * 60 * 60_000);
    expect(estimateIntervalMs('@weekly')).toBe(7 * 24 * 60 * 60_000);
  });

  it('handles run-parts source labels', () => {
    expect(estimateIntervalMs('cron.hourly')).toBe(60 * 60_000);
    expect(estimateIntervalMs('cron.daily')).toBe(24 * 60 * 60_000);
  });

  it('handles step expressions on minutes', () => {
    expect(estimateIntervalMs('*/5 * * * *')).toBe(5 * 60_000);
    expect(estimateIntervalMs('*/15 * * * *')).toBe(15 * 60_000);
  });

  it('handles comma-separated minutes within the hour', () => {
    expect(estimateIntervalMs('5,20,35,50 * * * *')).toBe(15 * 60_000);
  });

  it('handles range/step on minutes', () => {
    expect(estimateIntervalMs('5-55/10 * * * *')).toBe(10 * 60_000);
  });

  it('handles hourly with fixed minute', () => {
    expect(estimateIntervalMs('17 * * * *')).toBe(60 * 60_000);
  });

  it('handles every-N-hours', () => {
    expect(estimateIntervalMs('0 */6 * * *')).toBe(6 * 60 * 60_000);
  });

  it('handles multiple discrete hours per day', () => {
    expect(estimateIntervalMs('20 2,8,14,20 * * *')).toBe(6 * 60 * 60_000);
  });

  it('handles daily', () => {
    expect(estimateIntervalMs('0 3 * * *')).toBe(24 * 60 * 60_000);
  });

  it('handles weekly (specific dow)', () => {
    expect(estimateIntervalMs('0 2 * * 0')).toBe(7 * 24 * 60 * 60_000);
  });

  it('handles monthly (specific dom)', () => {
    expect(estimateIntervalMs('0 4 1 * *')).toBe(30 * 24 * 60 * 60_000);
  });

  it('handles anacron period=N', () => {
    expect(estimateIntervalMs('period=1 delay=5')).toBe(24 * 60 * 60_000);
    expect(estimateIntervalMs('period=7 delay=10')).toBe(7 * 24 * 60 * 60_000);
    expect(estimateIntervalMs('period=@monthly delay=15')).toBe(30 * 24 * 60 * 60_000);
  });

  it('returns null for unknowable cadence', () => {
    expect(estimateIntervalMs('systemd-timer')).toBeNull();
    expect(estimateIntervalMs('')).toBeNull();
    expect(estimateIntervalMs(undefined as unknown as string)).toBeNull();
  });
});

describe('stalenessThresholdMinutes', () => {
  it('floors at 30 minutes for very frequent schedules', () => {
    // 5-min cadence × 4 = 20min, but floor is 30.
    expect(stalenessThresholdMinutes('*/5 * * * *')).toBe(30);
  });

  it('uses 4x cadence for medium schedules', () => {
    // 15min × 4 = 60min.
    expect(stalenessThresholdMinutes('*/15 * * * *')).toBe(60);
    // hourly × 4 = 4h.
    expect(stalenessThresholdMinutes('@hourly')).toBe(4 * 60);
  });

  it('caps at 14 days for long schedules', () => {
    // monthly × 4 = 120 days, but cap is 14.
    expect(stalenessThresholdMinutes('@monthly')).toBe(14 * 24 * 60);
  });

  it('falls back to 7 days when cadence is unknown', () => {
    expect(stalenessThresholdMinutes('systemd-timer')).toBe(7 * 24 * 60);
  });
});
