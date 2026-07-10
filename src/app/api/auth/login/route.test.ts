import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validatePassword: vi.fn(),
  createSession: vi.fn(),
  checkLoginRateLimit: vi.fn(),
  checkGlobalLoginRateLimit: vi.fn(),
  getLoginClientIdentifier: vi.fn(),
  recordLoginFailure: vi.fn(),
  recordGlobalLoginFailure: vi.fn(),
  resetLoginFailures: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validatePassword: mocks.validatePassword,
  createSession: mocks.createSession,
}));

vi.mock('@/lib/auth-rate-limit', () => ({
  checkLoginRateLimit: mocks.checkLoginRateLimit,
  checkGlobalLoginRateLimit: mocks.checkGlobalLoginRateLimit,
  getLoginClientIdentifier: mocks.getLoginClientIdentifier,
  recordLoginFailure: mocks.recordLoginFailure,
  recordGlobalLoginFailure: mocks.recordGlobalLoginFailure,
  resetLoginFailures: mocks.resetLoginFailures,
}));

import { POST } from './route';

function loginRequest(body: string): Request {
  return new Request('https://ops.example.com/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLoginClientIdentifier.mockReturnValue('client-id');
    mocks.checkLoginRateLimit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 1 });
    mocks.checkGlobalLoginRateLimit.mockResolvedValue({ allowed: true, remaining: 30, retryAfterSec: 1 });
  });

  it.each([
    ['malformed JSON', '{'],
    ['null JSON', 'null'],
    ['array JSON', '[]'],
    ['non-string password', '{"password":123}'],
  ])('returns 400 for %s', async (_name, body) => {
    const response = await POST(loginRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.validatePassword).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('creates a session for a valid password', async () => {
    mocks.validatePassword.mockReturnValue(true);

    const response = await POST(loginRequest('{"password":"correct"}'));

    expect(response.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(mocks.resetLoginFailures).toHaveBeenCalledWith('client-id');
  });
});
