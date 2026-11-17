import { describe, expect, it } from 'vitest';
import type { DashboardUpdate } from '@/hooks/useSSE';
import type { DeploymentRecordClient } from '@/types/deployments';
import { buildServiceRows } from './overview';

const readAt = '2026-11-17T23:00:00.000Z';
const before = '2026-11-17T22:50:00.000Z';
const update: DashboardUpdate = { type: 'update', timestamp: readAt };
const deployment: DeploymentRecordClient = {
  uuid: 'd-1', applicationName: 'Portal', applicationUuid: '38', applicationPublicUuid: 'public-1',
  status: 'finished', commit: '123456789', commitMessage: null, createdAt: before, updatedAt: before,
  finishedAt: before, durationMs: 500,
};

describe('service overview evidence', () => {
  it('keeps source failures and partial site samples distinct from healthy services', () => {
    const rows = buildServiceRows({
      ...update, queues: [], queuesAvailable: false,
      sites: {
        eligibleCount: 14,
        allHealthy: true, downCount: 0,
        sites: [{ name: 'Portal', fqdn: 'portal.example.test', status: 'healthy', httpStatus: 200, lastChecked: before }],
      },
    });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'alerting', status: 'unknown', observedAt: null }),
      expect.objectContaining({ id: 'queue-coverage', status: 'unknown', observedAt: null }),
      expect.objectContaining({ id: 'site-coverage', status: 'unknown', summary: '1 of 14 eligible sites checked.' }),
      expect.objectContaining({ name: 'Portal', status: 'healthy', observedAt: before }),
    ]));
  });

  it('connects a site to deployments by the public application UUID only', () => {
    const rows = buildServiceRows({
      ...update,
      sites: {
        eligibleCount: 1, allHealthy: false, downCount: 1,
        sites: [{ applicationUuid: 'public-1', name: 'Portal', fqdn: 'portal.example.test', status: 'down', lastChecked: readAt }],
      },
      deployments: {
        active: [],
        recent: [deployment, { ...deployment, uuid: 'unrelated', applicationPublicUuid: 'public-2' },
          { ...deployment, uuid: 'legacy', applicationUuid: 'public-1', applicationPublicUuid: undefined }],
        stats: { queued: 0, inProgress: 0, finishedToday: 3, failedToday: 0 },
        buildTopology: null,
      },
    });
    expect(rows.find((row) => row.id === 'site:public-1')?.events).toEqual([
      { at: before, label: 'Deployment finished', detail: 'Portal · 12345678', href: '/coolify/d-1' },
    ]);
    expect(rows.find((row) => row.id === 'deployments')?.events).toHaveLength(3);
  });

  it('keeps alert identity and observation time separate from when the alert began', () => {
    const rows = buildServiceRows({
      ...update,
      alerts: {
        status: 'error', message: '2 firing', fetchedAt: readAt, total: 2, firing: 2, suppressed: 0,
        bySeverity: { critical: 2, warning: 0, info: 0, unknown: 0 },
        alerts: [{
          fingerprint: 'deployed-alert-id', name: 'ProbeUnreachable', severity: 'critical', state: 'firing',
          annotations: {}, labels: { instance: 'portal.example.test' }, silencedBy: [], inhibitedBy: [],
          startsAt: before,
        }],
      },
    });
    expect(rows.find((row) => row.id === 'alert:deployed-alert-id')).toMatchObject({
      status: 'affected', observedAt: readAt,
      facts: expect.arrayContaining([{ label: 'instance', value: 'portal.example.test' }]),
      events: [{ at: before, label: 'Alert started', detail: 'ProbeUnreachable' }],
    });
    expect(rows.find((row) => row.id === 'alerting')).toMatchObject({ status: 'unknown', summary: '1 of 2 firing alerts shown here.' });
  });

  it('displays measured zero capacity separately from an unavailable metric', () => {
    const host = {
      hostname: 'apps-vps', observedAt: before, metricsAgeSeconds: 65,
      cpu: { usagePercent: 1, cores: 4 },
      disk: { totalBytes: 1024 ** 3, availableBytes: 0, availableObserved: true, usedPercent: 100, mountPoint: '/' },
      memory: { totalBytes: 2 * 1024 ** 3, availableBytes: 1024 ** 3, availableObserved: true, usedPercent: 50 },
      load: { load1: 1, load5: 1, load15: 1 }, uptime: 3600,
    };
    const rows = buildServiceRows({
      ...update, vps: { appsVps: host, dbVps: { ...host, disk: { ...host.disk, availableObserved: false } } },
    });
    expect(rows.find((row) => row.id === 'capacity:apps')).toMatchObject({
      status: 'degraded', observedAt: before,
      facts: expect.arrayContaining([{ label: 'Available space on /', value: '0.0 GiB' }]),
    });
    expect(rows.find((row) => row.id === 'capacity:db')).toMatchObject({
      status: 'unknown',
      facts: expect.arrayContaining([{ label: 'Available space on /', value: 'Unavailable' }]),
    });
  });

  it('distinguishes retained failures, unconfirmed workers and sampled throughput', () => {
    const idle = { name: 'idle', waiting: 0, active: 0, failed: 23, completed: 0, delayed: 0, paused: 0, workerState: 'idle' as const };
    const rows = buildServiceRows({
      ...update,
      queues: [
        idle,
        { ...idle, name: 'pending', waiting: 2, workerState: 'unknown' },
        { ...idle, name: 'stopped', waiting: 4, workerState: 'down', oldestWaitingAgeSec: 80, jobsPerMin: 0 },
      ],
    });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'queue:idle', status: 'healthy' }),
      expect.objectContaining({ id: 'queue:pending', status: 'unknown' }),
      expect.objectContaining({ id: 'queue:stopped', status: 'affected', facts: expect.arrayContaining([
        { label: 'Oldest waiting job', value: '1m 20s' },
        { label: 'Completions per minute', value: '0' },
        { label: 'Recent failures per minute', value: 'Unavailable' },
      ]) }),
    ]));
  });
});
