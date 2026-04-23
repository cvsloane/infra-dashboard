import { describe, it, expect } from 'vitest';
import { buildIssues } from './buildIssues';
import type { OverviewData } from '@/types/overview';

function baseData(): OverviewData {
  return {
    alerts: {
      status: 'ok',
      message: 'No firing alerts',
      firing: 0,
      suppressed: 0,
      critical: 0,
      warning: 0,
      alerts: [],
    },
    coolify: {
      status: 'ok',
      message: 'Connected',
      applicationCount: 10,
      recentDeployments: [],
      activeDeployments: [],
      stats: { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 },
    },
    postgres: {
      status: 'ok',
      message: 'Up',
      connections: 10,
      maxConnections: 100,
      metricsAgeSec: 0,
    },
    backups: {
      status: 'ok',
      message: 'Logical 1h • WAL 10s • Base 2h • Drill 10d',
      logicalAgeSec: 3600,
      walAgeSec: 10,
      basebackupAgeSec: 7200,
      restoreDrillAgeSec: 864000,
    },
    workerSupervisor: {
      status: 'ok',
      message: '7/7 healthy',
      summary: { total: 7, ok: 7, warning: 0, down: 0 },
      stale: false,
      ageSec: 5,
      items: [],
    },
    hermes: {
      status: 'ok',
      message: 'Hermes fleet healthy',
      checked_at: '2026-04-23T00:00:00.000Z',
      last_update: '2026-04-23T00:00:00.000Z',
      counts: { total: 64, ok: 64, warning: 0, error: 0, paused: 0, unknown: 0 },
      nodes: {},
      alerts: [],
    },
    bullmq: {
      status: 'ok',
      message: 'Queues ok',
      queues: [],
      totalFailed: 0,
      workersDown: 0,
    },
    sites: {
      status: 'ok',
      downSites: [],
      allSites: [],
      totalSites: 10,
      healthySites: 10,
      sslExpiringSoonCount: 0,
      sslExpiryWarnDays: 14,
    },
  };
}

describe('buildIssues', () => {
  it('returns empty for null', () => {
    expect(buildIssues(null)).toEqual([]);
  });

  it('prioritizes critical over warning over info', () => {
    const data = baseData();
    data.alerts = { ...data.alerts, firing: 1, critical: 1, status: 'error', message: '1 firing (1 critical)' };
    data.sites.downSites = [{ name: 'A', fqdn: 'https://a.com', status: 'down' }];
    data.bullmq.totalFailed = 2;

    const issues = buildIssues(data);

    expect(issues[0]?.severity).toBe('critical');
    expect(issues.some((i) => i.id === 'sites_down')).toBe(true);
    expect(issues.some((i) => i.id === 'alerts_firing')).toBe(true);
    expect(issues.some((i) => i.severity === 'info')).toBe(true);
  });

  it('flags BullMQ failed jobs above threshold as warning', () => {
    const data = baseData();
    data.bullmq.totalFailed = 11;
    const issues = buildIssues(data);
    const issue = issues.find((i) => i.id === 'bullmq_failed_jobs');
    expect(issue?.severity).toBe('warning');
  });

  it('flags BullMQ workers down as critical', () => {
    const data = baseData();
    data.bullmq.workersDown = 2;
    const issues = buildIssues(data);
    const issue = issues.find((i) => i.id === 'bullmq_workers_down');
    expect(issue?.severity).toBe('critical');
  });

  it('surfaces Hermes fleet warnings', () => {
    const data = baseData();
    data.hermes = {
      ...data.hermes!,
      status: 'warning',
      message: '2 Hermes job(s) need review',
      counts: { ...data.hermes!.counts, warning: 2, ok: 62 },
    };

    const issues = buildIssues(data);
    const issue = issues.find((i) => i.id === 'hermes_jobs_warning');

    expect(issue?.severity).toBe('warning');
  });

  it('flags Postgres high connections', () => {
    const data = baseData();
    data.postgres.connections = 85;
    const issues1 = buildIssues(data);
    expect(issues1.find((i) => i.id === 'postgres_conn_high')?.severity).toBe('warning');

    data.postgres.connections = 95;
    const issues2 = buildIssues(data);
    expect(issues2.find((i) => i.id === 'postgres_conn_high')?.severity).toBe('critical');
  });
});
