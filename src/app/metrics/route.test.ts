import { beforeEach, describe, expect, it, vi } from 'vitest';

const { metrics } = vi.hoisted(() => ({
  metrics: vi.fn().mockResolvedValue('# test metrics\n'),
}));

vi.mock('@/lib/server/metrics', () => ({
  registry: {
    contentType: 'text/plain; version=0.0.4',
    metrics,
  },
}));

import { GET } from './route';

describe('GET /metrics', () => {
  beforeEach(() => {
    delete process.env.METRICS_TOKEN;
    metrics.mockClear();
  });

  it('fails closed when METRICS_TOKEN is absent', async () => {
    const response = await GET(new Request('https://ops.example.com/metrics'));
    expect(response.status).toBe(401);
    expect(metrics).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    process.env.METRICS_TOKEN = 'expected-token';
    const response = await GET(new Request('https://ops.example.com/metrics', {
      headers: { authorization: 'Bearer wrong-token' },
    }));
    expect(response.status).toBe(401);
  });

  it('serves metrics for the configured bearer token', async () => {
    process.env.METRICS_TOKEN = 'expected-token';
    const response = await GET(new Request('https://ops.example.com/metrics', {
      headers: { authorization: 'Bearer expected-token' },
    }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('# test metrics\n');
  });
});
