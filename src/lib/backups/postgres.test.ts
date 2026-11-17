import { afterEach, describe, it, expect, vi } from 'vitest';
import * as prometheus from '@/lib/prometheus/client';
import {
  getPostgresBackupsSummary,
  classifyAge,
  classifyResticBackup,
  worstStatus,
  DEFAULT_BACKUP_THRESHOLDS,
  resticThresholdsForHost,
} from './postgres';

describe('postgres backups helpers', () => {
  it('classifyAge returns unknown when metric missing', () => {
    expect(classifyAge(null, 10, 20)).toBe('unknown');
    expect(classifyAge(-1, 10, 20)).toBe('unknown');
  });

  it('classifyAge respects warning/error thresholds', () => {
    expect(classifyAge(0, 10, 20)).toBe('ok');
    expect(classifyAge(9, 10, 20)).toBe('ok');
    expect(classifyAge(10, 10, 20)).toBe('warning');
    expect(classifyAge(19, 10, 20)).toBe('warning');
    expect(classifyAge(20, 10, 20)).toBe('error');
  });

  it('worstStatus orders ok < unknown < warning < error', () => {
    expect(worstStatus(['ok', 'ok'])).toBe('ok');
    expect(worstStatus(['ok', 'unknown'])).toBe('unknown');
    expect(worstStatus(['unknown', 'warning'])).toBe('warning');
    expect(worstStatus(['warning', 'error'])).toBe('error');
  });

  it('default thresholds are internally consistent', () => {
    expect(DEFAULT_BACKUP_THRESHOLDS.walWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.walErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.logicalWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.logicalErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.restoreDrillWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.restoreDrillErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.basebackupWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.basebackupErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.basebackupCheckedWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.basebackupCheckedErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.appsResticWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.appsResticErrorSec);
    expect(DEFAULT_BACKUP_THRESHOLDS.dbResticWarnSec).toBeLessThan(DEFAULT_BACKUP_THRESHOLDS.dbResticErrorSec);
  });

  it('uses daily thresholds for apps-vps and weekly thresholds for db-vps', () => {
    expect(resticThresholdsForHost('apps-vps')).toEqual({
      warnSec: 36 * 60 * 60,
      errorSec: 48 * 60 * 60,
    });
    expect(resticThresholdsForHost('db-vps')).toEqual({
      warnSec: 7.5 * 24 * 60 * 60,
      errorSec: 8 * 24 * 60 * 60,
    });
  });

  it('classifies Restic backups from last-run result and successful snapshot age', () => {
    expect(classifyResticBackup(null, null, 10, 20)).toBe('unknown');
    expect(classifyResticBackup(0, null, 10, 20)).toBe('error');
    expect(classifyResticBackup(0, 1, 10, 20)).toBe('error');
    expect(classifyResticBackup(1, 5, 10, 20)).toBe('ok');
    expect(classifyResticBackup(1, 10, 10, 20)).toBe('warning');
    expect(classifyResticBackup(1, 20, 10, 20)).toBe('error');
  });
});


describe('recovery health for the daily snapshot policy', () => {
  const fresh = new Date(Date.now() - 3600 * 1000).toISOString();
  const metrics: prometheus.PostgresBackupMetrics = {
    walArchiveAgeSeconds: 90 * 86400,
    walgBasebackupAgeSeconds: 90 * 86400,
    walgBasebackupLastCheckedAgeSeconds: 90 * 86400,
    logicalBackupAgeSeconds: 3600,
    logicalBackupBytes: 100,
    restoreDrillAgeSeconds: 3600,
    resticBackups: ['apps-vps', 'db-vps'].map((host) => ({
      host, job: host, lastRunSuccess: 1, lastRunAgeSeconds: 3600, lastSuccessAgeSeconds: 3600,
    })),
    offsiteRestore: { lastRunSuccess: 1, lastRunAt: fresh, lastSuccessAt: fresh },
    standbyLagSeconds: 4,
  };

  afterEach(() => vi.restoreAllMocks());

  it('scores required checks and still returns historical physical readings', async () => {
    vi.spyOn(prometheus, 'getPostgresBackupMetrics').mockResolvedValue(metrics);
    expect(await getPostgresBackupsSummary()).toMatchObject({
      status: 'ok',
      wal: { status: 'error' },
      basebackup: { status: 'error' },
      offsiteRestore: { status: 'ok', lastSuccessAt: fresh },
      standbyLagSeconds: 4,
    });
  });

  it('reports a failed offsite exercise rather than borrowing its past success', async () => {
    vi.spyOn(prometheus, 'getPostgresBackupMetrics').mockResolvedValue({
      ...metrics, offsiteRestore: { ...metrics.offsiteRestore, lastRunSuccess: 0 },
    });
    expect(await getPostgresBackupsSummary()).toMatchObject({
      status: 'error', offsiteRestore: { status: 'error', lastSuccessAt: fresh },
    });
  });
});
