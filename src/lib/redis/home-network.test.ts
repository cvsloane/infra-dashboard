import { describe, expect, it, vi } from 'vitest';
import {
  buildHomeNetworkReadResponse,
  computeHomeNetworkStatus,
  makeHomeNetworkHistoryEntry,
  validateHomeNetworkSnapshot,
  validateSnapshotFreshForIngest,
} from '@/lib/home-network/status';
import type { HomeNetworkSnapshot } from '@/types/home-network';

const baseSnapshot: HomeNetworkSnapshot = {
  schema_version: 1,
  collected_at: '2026-05-02T20:00:00.000Z',
  collector_host: 'homelinux',
  status: 'ok',
  routers: [
    {
      hostname: 'flint-cabinet',
      role: 'main',
      management_ip: '192.168.8.1',
      reachable: true,
      wan: { name: 'wan', up: true, gateway: '192.168.1.1' },
      internet_ping: { ok: true, loss_percent: 0, avg_ms: 12 },
      nextdns: { router_hostname: 'flint-cabinet', running: true, test_ok: true },
    },
    {
      hostname: 'flint-office',
      role: 'office',
      management_ip: '192.168.8.113',
      reachable: true,
      wan: { name: 'wan', up: true, address: '192.168.8.113' },
      internet_ping: { ok: true, loss_percent: 0, avg_ms: 10 },
      nextdns: { router_hostname: 'flint-office', running: true, test_ok: true },
    },
    {
      hostname: 'flint-school',
      role: 'school',
      management_ip: '192.168.8.246',
      reachable: true,
      wan: { name: 'wan', up: true, address: '192.168.8.246' },
      internet_ping: { ok: true, loss_percent: 0, avg_ms: 11 },
      nextdns: { router_hostname: 'flint-school', running: true, test_ok: true },
    },
  ],
  clients: [],
  dns: {
    baseline_profile: '23b61e',
    kids_profile: '43d9e6',
    routers: [
      { router_hostname: 'flint-cabinet', running: true, test_ok: true },
      { router_hostname: 'flint-office', running: true, test_ok: true },
      { router_hostname: 'flint-school', running: true, test_ok: true },
    ],
  },
  warnings: [],
};

describe('home-network snapshot validation', () => {
  it('accepts a complete schema v1 snapshot', () => {
    const result = validateHomeNetworkSnapshot(baseSnapshot);
    expect(result.ok).toBe(true);
  });

  it('rejects invalid schema versions', () => {
    const result = validateHomeNetworkSnapshot({ ...baseSnapshot, schema_version: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('schema_version');
  });

  it('rejects snapshots too old for ingest', () => {
    vi.stubEnv('HOME_NETWORK_INGEST_REJECT_AGE_SEC', '60');
    const error = validateSnapshotFreshForIngest(baseSnapshot, Date.parse('2026-05-02T20:02:00.000Z'));
    expect(error).toContain('too old');
    vi.unstubAllEnvs();
  });
});

describe('home-network health semantics', () => {
  it('marks a fresh healthy snapshot ok', () => {
    const result = computeHomeNetworkStatus(baseSnapshot, 30, 180);
    expect(result.status).toBe('ok');
    expect(result.warnings).toEqual([]);
  });

  it('marks stale snapshots warning without losing the latest payload', () => {
    const response = buildHomeNetworkReadResponse(baseSnapshot, [], Date.parse('2026-05-02T20:05:00.000Z'));
    expect(response.status).toBe('warning');
    expect(response.snapshot?.routers).toHaveLength(3);
    expect(response.computed_warnings[0]).toContain('stale');
  });

  it('treats stale pushed syslog as a monitoring note when SSH event summaries are present', () => {
    const snapshot: HomeNetworkSnapshot = {
      ...baseSnapshot,
      status: 'warning',
      warnings: [
        'flint-cabinet.log is stale: 373s old',
        'flint-office.log is stale: 373s old',
        'flint-school.log is stale: 373s old',
      ],
      routers: baseSnapshot.routers.map((router) => ({
        ...router,
        event_summary: { sample_size: 80 },
      })),
    };

    const response = buildHomeNetworkReadResponse(snapshot, [], Date.parse('2026-05-02T20:00:30.000Z'));

    expect(response.status).toBe('ok');
    expect(response.computed_warnings).toEqual([]);
    expect(response.computed_monitoring_warnings).toHaveLength(3);
  });

  it('keeps stale pushed syslog as a health warning when SSH event summaries are absent', () => {
    const snapshot: HomeNetworkSnapshot = {
      ...baseSnapshot,
      status: 'warning',
      warnings: ['flint-cabinet.log is stale: 373s old'],
    };

    const response = buildHomeNetworkReadResponse(snapshot, [], Date.parse('2026-05-02T20:00:30.000Z'));

    expect(response.status).toBe('warning');
    expect(response.computed_warnings[0]).toContain('flint-cabinet.log is stale');
  });

  it('marks unreachable routers and NextDNS failures as errors', () => {
    const snapshot: HomeNetworkSnapshot = {
      ...baseSnapshot,
      routers: baseSnapshot.routers.map((router) =>
        router.role === 'office'
          ? { ...router, reachable: false, nextdns: { router_hostname: router.hostname, running: false } }
          : router,
      ),
    };
    const result = computeHomeNetworkStatus(snapshot, 20, 180);
    expect(result.status).toBe('error');
    expect(result.warnings.join(' ')).toContain('flint-office');
    expect(result.warnings.join(' ')).toContain('NextDNS');
  });

  it('marks office and school uplink loss as an error', () => {
    const snapshot: HomeNetworkSnapshot = {
      ...baseSnapshot,
      routers: baseSnapshot.routers.map((router) =>
        router.role === 'school' ? { ...router, wan: { name: 'wan', up: false } } : router,
      ),
    };
    const result = computeHomeNetworkStatus(snapshot, 20, 180);
    expect(result.status).toBe('error');
    expect(result.warnings.join(' ')).toContain('uplink is down');
  });
});

describe('home-network history entries', () => {
  it('preserves client stability counters for trend analysis', () => {
    const snapshot: HomeNetworkSnapshot = {
      ...baseSnapshot,
      clients: [
        { mac: 'aa:aa:aa:aa:aa:aa', signal_dbm: -72 },
        { mac: 'bb:bb:bb:bb:bb:bb', signal_dbm: -78 },
      ],
      client_summary: {
        total: 2,
        home_k: 1,
        weak_signal: 2,
        very_weak_signal: 1,
        unknown_hostname: 0,
        multi_ap_mac_count: 1,
        duplicate_hostname_count: 1,
        weakest: [],
      },
    };

    const entry = makeHomeNetworkHistoryEntry(snapshot);

    expect(entry.client_count).toBe(2);
    expect(entry.weak_signal_count).toBe(2);
    expect(entry.very_weak_signal_count).toBe(1);
    expect(entry.multi_ap_mac_count).toBe(1);
    expect(entry.duplicate_hostname_count).toBe(1);
  });
});
