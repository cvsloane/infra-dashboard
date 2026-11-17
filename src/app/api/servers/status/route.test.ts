import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const sources = vi.hoisted(() => ({
  capacity: vi.fn(),
  fullSites: vi.fn(),
  sampleSites: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ isAuthenticatedFromRequest: async () => true }));
vi.mock('@/lib/prometheus/client', () => ({ getAllVPSMetrics: sources.capacity }));
vi.mock('@/lib/health/sites', () => ({
  checkAllSites: sources.fullSites,
  quickHealthCheck: sources.sampleSites,
}));

describe('server status source coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sources.capacity.mockResolvedValue({ appsVps: { hostname: 'apps-vps' }, dbVps: null });
  });

  it('returns host readings when site inventory is unavailable', async () => {
    sources.fullSites.mockRejectedValue(new Error('Inventory unavailable'));
    const result = await GET(new Request('http://localhost/api/servers/status'));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      vps: { appsVps: { hostname: 'apps-vps' }, dbVps: null },
      sites: { available: false, allHealthy: false, downCount: 0, sites: [] },
    });
  });

  it('uses the same sample as the live overview when requested', async () => {
    sources.sampleSites.mockResolvedValue({ eligibleCount: 12, sites: [{ name: 'Sampled site' }] });
    const result = await GET(new Request('http://localhost/api/servers/status?scope=overview'));
    expect((await result.json()).sites).toEqual({
      available: true, eligibleCount: 12, sites: [{ name: 'Sampled site' }],
    });
    expect(sources.fullSites).not.toHaveBeenCalled();
  });
});
