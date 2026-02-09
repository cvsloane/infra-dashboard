import { describe, it, expect } from 'vitest';
import { DEFAULT_PINNED_WIDGET_IDS, WIDGETS_BY_ID, normalizeWidgetIds } from './registry';
import type { OverviewData } from '@/types/overview';

function baseData(): OverviewData {
  return {
    alerts: { status: 'ok', message: 'No firing alerts', firing: 0, suppressed: 0, critical: 0, warning: 0, alerts: [] },
    coolify: {
      status: 'ok',
      message: 'Connected',
      applicationCount: 3,
      recentDeployments: [],
      activeDeployments: [],
      stats: { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 },
    },
    postgres: { status: 'ok', message: 'Up', connections: 10, maxConnections: 100, metricsAgeSec: 3 },
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
    bullmq: { status: 'ok', message: 'Queues ok', queues: [], totalFailed: 0, workersDown: 0 },
    sites: { status: 'ok', downSites: [], allSites: [], totalSites: 4, healthySites: 4, sslExpiringSoonCount: 0, sslExpiryWarnDays: 14 },
  };
}

describe('widgets registry', () => {
  it('normalizeWidgetIds filters unknown and de-dupes', () => {
    const ids = normalizeWidgetIds(['alerts', 'alerts', 'nope', 123, 'sites']);
    expect(ids).toEqual(['alerts', 'sites']);
  });

  it('default pinned widgets are valid', () => {
    for (const id of DEFAULT_PINNED_WIDGET_IDS) {
      expect(WIDGETS_BY_ID[id]).toBeTruthy();
    }
  });

  it('alerts widget turns warning/error based on firing severity', () => {
    const data = baseData();
    data.alerts = {
      ...data.alerts,
      status: 'error',
      firing: 2,
      critical: 1,
      message: '2 firing (1 critical)',
      alerts: [{ name: 'Foo', severity: 'critical', state: 'firing' }],
    };

    const vm = WIDGETS_BY_ID.alerts.getViewModel(data);
    expect(vm.status).toBe('error');
    expect(vm.primary).toContain('2');
  });
});
