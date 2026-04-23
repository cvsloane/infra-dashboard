import { describe, expect, it } from 'vitest';
import { COOKIE_MAX_AGE_SEC, createSessionToken, isValidSessionToken } from './auth-token';

describe('auth session tokens', () => {
  it('accepts signed tokens created with the same secret', () => {
    const now = Date.UTC(2026, 3, 23);
    const token = createSessionToken('test-secret', now);

    expect(isValidSessionToken(token, 'test-secret', now + 1000)).toBe(true);
  });

  it('rejects forged legacy timestamp tokens', () => {
    const legacyToken = Buffer.from(`${Date.now()}:valid`).toString('base64');

    expect(isValidSessionToken(legacyToken, 'test-secret')).toBe(false);
  });

  it('rejects tokens signed with another secret', () => {
    const now = Date.UTC(2026, 3, 23);
    const token = createSessionToken('right-secret', now);

    expect(isValidSessionToken(token, 'wrong-secret', now + 1000)).toBe(false);
  });

  it('rejects expired tokens', () => {
    const now = Date.UTC(2026, 3, 23);
    const token = createSessionToken('test-secret', now);
    const afterExpiry = now + COOKIE_MAX_AGE_SEC * 1000 + 1;

    expect(isValidSessionToken(token, 'test-secret', afterExpiry)).toBe(false);
  });
});
