import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

const TOKEN_VERSION = 'v1';

function sessionSecret(explicitSecret?: string): string {
  return explicitSecret ?? process.env.DASHBOARD_SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD ?? '';
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createSessionToken(explicitSecret?: string, now = Date.now()): string {
  const payload = `${TOKEN_VERSION}.${now}`;
  const signature = signPayload(payload, sessionSecret(explicitSecret));
  return `${payload}.${signature}`;
}

export function isValidSessionToken(token: string, explicitSecret?: string, now = Date.now()): boolean {
  const [version, timestamp, signature, extra] = token.split('.');
  if (extra || version !== TOKEN_VERSION || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const tokenTime = Number(timestamp);
  if (!Number.isSafeInteger(tokenTime)) {
    return false;
  }

  const maxAgeMs = COOKIE_MAX_AGE_SEC * 1000;
  if (now - tokenTime > maxAgeMs || tokenTime - now > 60_000) {
    return false;
  }

  const payload = `${version}.${timestamp}`;
  const expected = signPayload(payload, sessionSecret(explicitSecret));
  return constantTimeEqual(signature, expected);
}
