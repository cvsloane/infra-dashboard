import type { OverviewData } from '@/types/overview';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail?: string;
  href: string;
}

const FAILED_JOBS_WARN_THRESHOLD = 10;
const POSTGRES_CONN_WARN_PCT = 0.8;
const POSTGRES_CONN_CRIT_PCT = 0.9;
const METRICS_AGE_WARN_SEC = 60;
const METRICS_AGE_CRIT_SEC = 300;

function severityRank(sev: IssueSeverity): number {
  switch (sev) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

export function buildIssues(data: OverviewData | null): Issue[] {
  if (!data) return [];

  const issues: Issue[] = [];

  // Alerts
  if (data.alerts.firing > 0) {
    const sev: IssueSeverity =
      data.alerts.critical > 0 ? 'critical' : data.alerts.warning > 0 ? 'warning' : 'info';
    issues.push({
      id: 'alerts_firing',
      severity: sev,
      title: 'Firing alerts',
      detail: data.alerts.message,
      href: '/alerts',
    });
  }

  // Sites
  if (data.sites.downSites.length > 0) {
    issues.push({
      id: 'sites_down',
      severity: 'critical',
      title: 'Sites down',
      detail: `${data.sites.downSites.length} site${data.sites.downSites.length === 1 ? '' : 's'} down`,
      href: '/servers',
    });
  }

  if (data.sites.sslExpiringSoonCount > 0) {
    issues.push({
      id: 'ssl_expiring',
      severity: 'warning',
      title: 'SSL expiring soon',
      detail: `${data.sites.sslExpiringSoonCount} certificate${data.sites.sslExpiringSoonCount === 1 ? '' : 's'} expiring soon`,
      href: '/servers',
    });
  }

  // Coolify connectivity/deploys
  if (data.coolify.status === 'error') {
    issues.push({
      id: 'coolify_down',
      severity: 'critical',
      title: 'Coolify unreachable',
      detail: data.coolify.message,
      href: '/coolify',
    });
  }

  if (data.coolify.stats?.inProgress > 0) {
    issues.push({
      id: 'deploying',
      severity: 'info',
      title: 'Deployments in progress',
      detail: `${data.coolify.stats.inProgress} deploying`,
      href: '/coolify',
    });
  }

  if (data.coolify.stats?.failedToday > 0) {
    issues.push({
      id: 'deploy_failed_today',
      severity: 'info',
      title: 'Deployment failures today',
      detail: `${data.coolify.stats.failedToday} failed today`,
      href: '/coolify',
    });
  }

  // BullMQ
  if (data.bullmq.workersDown > 0) {
    issues.push({
      id: 'bullmq_workers_down',
      severity: 'critical',
      title: 'Queue workers down',
      detail: `${data.bullmq.workersDown} worker${data.bullmq.workersDown === 1 ? '' : 's'} down`,
      href: '/queues',
    });
  } else if (data.bullmq.totalFailed > FAILED_JOBS_WARN_THRESHOLD) {
    issues.push({
      id: 'bullmq_failed_jobs',
      severity: 'warning',
      title: 'Failed jobs need attention',
      detail: `${data.bullmq.totalFailed} failed jobs`,
      href: '/queues',
    });
  } else if (data.bullmq.totalFailed > 0) {
    issues.push({
      id: 'bullmq_failed_jobs',
      severity: 'info',
      title: 'Failed jobs present',
      detail: `${data.bullmq.totalFailed} failed job${data.bullmq.totalFailed === 1 ? '' : 's'}`,
      href: '/queues',
    });
  }

  // Worker Supervisor
  if (data.workerSupervisor.stale) {
    issues.push({
      id: 'worker_supervisor_stale',
      severity: 'warning',
      title: 'Worker supervisor stale',
      detail: data.workerSupervisor.message,
      href: '/workers',
    });
  } else if (data.workerSupervisor.summary.down > 0) {
    issues.push({
      id: 'workers_down',
      severity: 'critical',
      title: 'Workers down',
      detail: `${data.workerSupervisor.summary.down} worker${data.workerSupervisor.summary.down === 1 ? '' : 's'} down`,
      href: '/workers',
    });
  } else if (data.workerSupervisor.summary.warning > 0) {
    issues.push({
      id: 'workers_warning',
      severity: 'warning',
      title: 'Workers degraded',
      detail: `${data.workerSupervisor.summary.warning} warning`,
      href: '/workers',
    });
  }

  // Postgres
  if (data.postgres.status === 'error') {
    issues.push({
      id: 'postgres_down',
      severity: 'critical',
      title: 'PostgreSQL unhealthy',
      detail: data.postgres.message,
      href: '/postgres',
    });
  }

  const max = Math.max(1, data.postgres.maxConnections || 1);
  const ratio = (data.postgres.connections || 0) / max;
  if (ratio >= POSTGRES_CONN_CRIT_PCT) {
    issues.push({
      id: 'postgres_conn_high',
      severity: 'critical',
      title: 'PostgreSQL near connection limit',
      detail: `${data.postgres.connections}/${max} connections`,
      href: '/postgres',
    });
  } else if (ratio >= POSTGRES_CONN_WARN_PCT) {
    issues.push({
      id: 'postgres_conn_high',
      severity: 'warning',
      title: 'PostgreSQL connections high',
      detail: `${data.postgres.connections}/${max} connections`,
      href: '/postgres',
    });
  }

  if (data.postgres.metricsAgeSec !== null) {
    if (data.postgres.metricsAgeSec >= METRICS_AGE_CRIT_SEC) {
      issues.push({
        id: 'postgres_metrics_stale',
        severity: 'critical',
        title: 'PostgreSQL metrics stale',
        detail: `${Math.round(data.postgres.metricsAgeSec)}s since last scrape`,
        href: '/postgres',
      });
    } else if (data.postgres.metricsAgeSec >= METRICS_AGE_WARN_SEC) {
      issues.push({
        id: 'postgres_metrics_stale',
        severity: 'warning',
        title: 'PostgreSQL metrics aging',
        detail: `${Math.round(data.postgres.metricsAgeSec)}s since last scrape`,
        href: '/postgres',
      });
    }
  }

  // Backups
  if (data.backups.status === 'error') {
    issues.push({
      id: 'backups_error',
      severity: 'critical',
      title: 'Backups unhealthy',
      detail: data.backups.message,
      href: '/backups',
    });
  } else if (data.backups.status === 'warning' || data.backups.status === 'unknown') {
    issues.push({
      id: 'backups_warning',
      severity: 'warning',
      title: 'Backups need review',
      detail: data.backups.message,
      href: '/backups',
    });
  }

  // Sort by severity, stable among same severity.
  issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  // De-dup by id (keep most severe if duplicates occur).
  const dedup = new Map<string, Issue>();
  for (const issue of issues) {
    const prev = dedup.get(issue.id);
    if (!prev || severityRank(issue.severity) > severityRank(prev.severity)) {
      dedup.set(issue.id, issue);
    }
  }

  return Array.from(dedup.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

