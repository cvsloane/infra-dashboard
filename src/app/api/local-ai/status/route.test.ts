import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAuthenticatedFromRequest: vi.fn(),
  getLocalAIGpuLeaseStatus: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  isAuthenticatedFromRequest: mocks.isAuthenticatedFromRequest,
}));

vi.mock('@/lib/prometheus/client', () => ({
  getLocalAIGpuLeaseStatus: mocks.getLocalAIGpuLeaseStatus,
}));

import { GET } from './route';

describe('GET /api/local-ai/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an authenticated dashboard session', async () => {
    mocks.isAuthenticatedFromRequest.mockReturnValue(false);

    const response = await GET(new Request('https://infra.test/api/local-ai/status'));

    expect(response.status).toBe(401);
    expect(mocks.getLocalAIGpuLeaseStatus).not.toHaveBeenCalled();
  });

  it('returns the Prometheus-backed fleet snapshot', async () => {
    const snapshot = { hosts: [], summary: { healthy: 0, active: 0, queued: 0, problems: 2 } };
    mocks.isAuthenticatedFromRequest.mockReturnValue(true);
    mocks.getLocalAIGpuLeaseStatus.mockResolvedValue(snapshot);

    const response = await GET(new Request('https://infra.test/api/local-ai/status'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
  });
});
