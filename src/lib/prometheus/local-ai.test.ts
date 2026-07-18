import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW_MS = 1_784_338_400_000;

function prometheusResponse(query: string) {
  const timestamp = NOW_MS / 1000 - 5;
  const resultByQuery: Record<string, Array<{ metric: Record<string, string>; value: [number, string] }>> = {
    local_ai_gpu_lease_up: [
      { metric: { host: 'homelinux' }, value: [timestamp, '1'] },
      { metric: { host: 'heavisidelinux' }, value: [timestamp, '1'] },
    ],
    local_ai_gpu_lease_owner: [
      { metric: { host: 'homelinux', workload: 'ollama', kind: 'text-inference' }, value: [timestamp, '1'] },
      { metric: { host: 'heavisidelinux', workload: 'none', kind: 'none' }, value: [timestamp, '0'] },
    ],
    local_ai_gpu_lease_acquired_timestamp_seconds: [
      { metric: { host: 'homelinux' }, value: [timestamp, String(NOW_MS / 1000 - 45)] },
      { metric: { host: 'heavisidelinux' }, value: [timestamp, '0'] },
    ],
    local_ai_gpu_lease_media_waiting: [
      { metric: { host: 'homelinux' }, value: [timestamp, '1'] },
      { metric: { host: 'heavisidelinux' }, value: [timestamp, '0'] },
    ],
    local_ai_gpu_lease_inhibited: [
      { metric: { host: 'homelinux' }, value: [timestamp, '0'] },
      { metric: { host: 'heavisidelinux' }, value: [timestamp, '0'] },
    ],
    local_ai_gpu_lease_stale_owner: [
      { metric: { host: 'homelinux' }, value: [timestamp, '0'] },
      { metric: { host: 'heavisidelinux' }, value: [timestamp, '0'] },
    ],
  };

  return new Response(JSON.stringify({
    status: 'success',
    data: { resultType: 'vector', result: resultByQuery[query] || [] },
  }));
}

describe('getLocalAIGpuLeaseStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PROMETHEUS_URL', 'http://prometheus.test:9090');
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return prometheusResponse(url.searchParams.get('query') || '');
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps ownership and queued media into named host states', async () => {
    const { getLocalAIGpuLeaseStatus } = await import('./client');

    const snapshot = await getLocalAIGpuLeaseStatus();

    expect(snapshot.hosts).toHaveLength(2);
    expect(snapshot.hosts[0]).toMatchObject({
      host: 'homelinux',
      state: 'queued',
      authorityUp: true,
      owner: { workload: 'ollama', kind: 'text-inference' },
      acquiredAgeSeconds: 45,
      mediaWaiting: true,
    });
    expect(snapshot.hosts[1]).toMatchObject({
      host: 'heavisidelinux',
      state: 'ready',
      authorityUp: true,
      owner: null,
    });
    expect(snapshot.summary).toEqual({ healthy: 2, active: 1, queued: 1, problems: 0 });
  });

  it('keeps both expected hosts visible when one exporter is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const response = await prometheusResponse(url.searchParams.get('query') || '');
      const body = await response.json();
      body.data.result = body.data.result.filter(
        (item: { metric: { host?: string } }) => item.metric.host !== 'homelinux'
      );
      return new Response(JSON.stringify(body));
    }));
    const { getLocalAIGpuLeaseStatus } = await import('./client');

    const snapshot = await getLocalAIGpuLeaseStatus();

    expect(snapshot.hosts.find((host) => host.host === 'homelinux')).toMatchObject({
      state: 'offline',
      authorityUp: false,
    });
    expect(snapshot.summary.problems).toBe(1);
  });
});
