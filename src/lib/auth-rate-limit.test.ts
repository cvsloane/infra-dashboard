import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis/client', () => ({
  getRedis: vi.fn(),
}));

import {
  checkLoginRateLimit,
  checkGlobalLoginRateLimit,
  getLoginClientIdentifier,
  recordLoginFailure,
  recordGlobalLoginFailure,
  resetLoginFailures,
} from './auth-rate-limit';

describe('login rate limiting', () => {
  it('prefers the Cloudflare client address and hashes it before storage', () => {
    const request = new Request('https://ops.example.com/login', {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.5, 10.0.0.1',
      },
    });

    const identifier = getLoginClientIdentifier(request);
    expect(identifier).toMatch(/^[a-f0-9]{64}$/);
    expect(identifier).not.toContain('203.0.113.10');
  });

  it('blocks at the configured threshold and reports retry timing', async () => {
    const client = {
      get: vi.fn().mockResolvedValue('5'),
      ttl: vi.fn().mockResolvedValue(812),
    };

    await expect(checkLoginRateLimit('client', client)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSec: 812,
    });
  });

  it('records failures atomically and clears them after success', async () => {
    const client = {
      eval: vi.fn().mockResolvedValue([3, 900]),
      del: vi.fn().mockResolvedValue(1),
    };

    await expect(recordLoginFailure('client', client)).resolves.toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSec: 900,
    });
    await resetLoginFailures('client', client);
    expect(client.del).toHaveBeenCalledOnce();
  });

  it('fails open when Redis is unavailable', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('redis unavailable')),
      ttl: vi.fn(),
    };

    await expect(checkLoginRateLimit('client', client)).resolves.toMatchObject({ allowed: true });
  });

  it('enforces a separate global failure budget that spoofed client headers cannot evade', async () => {
    const checkClient = {
      get: vi.fn().mockResolvedValue('30'),
      ttl: vi.fn().mockResolvedValue(600),
    };
    const updateClient = {
      eval: vi.fn().mockResolvedValue([29, 600]),
    };

    await expect(checkGlobalLoginRateLimit(checkClient)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSec: 600,
    });
    await expect(recordGlobalLoginFailure(updateClient)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
