import { getPostgresBackupMetrics, type PostgresBackupMetrics } from '@/lib/prometheus/client';

export type BackupHealthStatus = 'ok' | 'warning' | 'error' | 'unknown';

export const DEFAULT_BACKUP_THRESHOLDS = {
  // Matches /opt/monitoring/prometheus/rules/general.yml
  walWarnSec: 24 * 60 * 60,
  walErrorSec: 48 * 60 * 60,

  // Logical dump runs nightly at 02:00.
  logicalWarnSec: 36 * 60 * 60,
  logicalErrorSec: 48 * 60 * 60,

  // Restore drill runs monthly (cron: 0 4 1 * *) and monitor threshold is 35 days.
  restoreDrillWarnSec: 35 * 24 * 60 * 60,
  restoreDrillErrorSec: 45 * 24 * 60 * 60,

  // Base backups should be rotated regularly; we warn before it gets "months old".
  basebackupWarnSec: 14 * 24 * 60 * 60,
  basebackupErrorSec: 30 * 24 * 60 * 60,

  // walg_basebackup_monitor runs daily; if the "checked" age is high, we can't trust basebackup freshness.
  basebackupCheckedWarnSec: 2 * 24 * 60 * 60,
  basebackupCheckedErrorSec: 7 * 24 * 60 * 60,
} as const;

export interface PostgresBackupsSummary {
  status: BackupHealthStatus;
  message: string;
  wal: { status: BackupHealthStatus; ageSec: number | null };
  logical: { status: BackupHealthStatus; ageSec: number | null; bytes: number | null };
  basebackup: { status: BackupHealthStatus; ageSec: number | null; checkedAgeSec: number | null };
  restoreDrill: { status: BackupHealthStatus; ageSec: number | null };
  thresholds: typeof DEFAULT_BACKUP_THRESHOLDS;
  _raw: PostgresBackupMetrics;
}

export function classifyAge(ageSec: number | null, warnSec: number, errorSec: number): BackupHealthStatus {
  if (ageSec === null || !Number.isFinite(ageSec)) return 'unknown';
  if (ageSec >= errorSec) return 'error';
  if (ageSec >= warnSec) return 'warning';
  return 'ok';
}

export function worstStatus(statuses: BackupHealthStatus[]): BackupHealthStatus {
  const rank: Record<BackupHealthStatus, number> = {
    ok: 0,
    unknown: 1,
    warning: 2,
    error: 3,
  };

  let worst: BackupHealthStatus = 'ok';
  for (const s of statuses) {
    if (rank[s] > rank[worst]) worst = s;
  }
  return worst;
}

function formatAge(ageSec: number | null): string {
  if (ageSec === null || !Number.isFinite(ageSec)) return '—';
  const rounded = Math.max(0, Math.round(ageSec));
  if (rounded < 60) return `${rounded}s`;
  if (rounded < 3600) return `${Math.round(rounded / 60)}m`;
  if (rounded < 86400) return `${Math.round(rounded / 3600)}h`;
  return `${Math.round(rounded / 86400)}d`;
}

export async function getPostgresBackupsSummary(): Promise<PostgresBackupsSummary> {
  const thresholds = DEFAULT_BACKUP_THRESHOLDS;
  const metrics = await getPostgresBackupMetrics();

  const walStatus = classifyAge(metrics.walArchiveAgeSeconds, thresholds.walWarnSec, thresholds.walErrorSec);
  const logicalStatus = classifyAge(metrics.logicalBackupAgeSeconds, thresholds.logicalWarnSec, thresholds.logicalErrorSec);
  const restoreDrillStatus = classifyAge(
    metrics.restoreDrillAgeSeconds,
    thresholds.restoreDrillWarnSec,
    thresholds.restoreDrillErrorSec
  );

  const basebackupAgeStatus = classifyAge(
    metrics.walgBasebackupAgeSeconds,
    thresholds.basebackupWarnSec,
    thresholds.basebackupErrorSec
  );
  const basebackupCheckedStatus = classifyAge(
    metrics.walgBasebackupLastCheckedAgeSeconds,
    thresholds.basebackupCheckedWarnSec,
    thresholds.basebackupCheckedErrorSec
  );
  const basebackupStatus = worstStatus([basebackupAgeStatus, basebackupCheckedStatus]);

  const overall = worstStatus([logicalStatus, walStatus, basebackupStatus, restoreDrillStatus]);

  const message = `Logical ${formatAge(metrics.logicalBackupAgeSeconds)} • WAL ${formatAge(metrics.walArchiveAgeSeconds)} • Base ${formatAge(metrics.walgBasebackupAgeSeconds)} • Drill ${formatAge(metrics.restoreDrillAgeSeconds)}`;

  return {
    status: overall,
    message,
    wal: { status: walStatus, ageSec: metrics.walArchiveAgeSeconds },
    logical: { status: logicalStatus, ageSec: metrics.logicalBackupAgeSeconds, bytes: metrics.logicalBackupBytes },
    basebackup: {
      status: basebackupStatus,
      ageSec: metrics.walgBasebackupAgeSeconds,
      checkedAgeSec: metrics.walgBasebackupLastCheckedAgeSeconds,
    },
    restoreDrill: { status: restoreDrillStatus, ageSec: metrics.restoreDrillAgeSeconds },
    thresholds,
    _raw: metrics,
  };
}

