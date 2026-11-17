// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dashboardAccess } from '@/lib/cloudflare-access';
import { COOKIE_NAME, createSessionToken } from '@/lib/auth-token';
import { isAuthenticatedFromRequest } from '@/lib/request-auth';
import { proxy } from '@/proxy';
import { GET as getLocalAi } from '@/app/api/local-ai/status/route';
import { POST as passwordLogin } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';

vi.mock('@/lib/redis/client', () => ({ getRedis: vi.fn() }));
vi.mock('@/lib/prometheus/client', () => ({ getLocalAIGpuLeaseStatus: async () => ({ status: 'ok' }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: vi.fn() }) }));

const publicOrigin = `https://${dashboardAccess.hostname}`;
const directOrigin = 'http://localhost:3000';
let privateKey: CryptoKey;

async function applicationToken(changes: JWTPayload = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: dashboardAccess.issuer, aud: [dashboardAccess.audience], sub: 'test-operator',
    email: 'operator@example.test', type: 'app', iat: now, exp: now + 60, ...changes,
  }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey);
}

describe('dashboard email sign-in', () => {
  beforeAll(async () => {
    vi.stubEnv('DASHBOARD_PASSWORD', 'local-test-password');
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(String(url)).toBe(`${dashboardAccess.issuer}/cdn-cgi/access/certs`);
      return Response.json({ keys: [jwk] });
    }));
  });
  afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('opens a deep link and its data with the single Access identity and issues no password cookie', async () => {
    const headers = { 'cf-access-jwt-assertion': await applicationToken() };
    const page = await proxy(new NextRequest(`${publicOrigin}/queues`, { headers }));
    expect(page.headers.get('x-middleware-next')).toBe('1');
    expect(page.headers.has('set-cookie')).toBe(false);
    const api = await getLocalAi(new Request(`${publicOrigin}/api/local-ai/status`, { headers }));
    expect(await api.json()).toEqual({ status: 'ok' });
    const bookmark = await proxy(new NextRequest(`${publicOrigin}/login?from=%2Fqueues`, { headers }));
    expect(bookmark.headers.get('location')).toBe(`${publicOrigin}/queues`);
    const offsite = await proxy(new NextRequest(`${publicOrigin}/login?from=https://example.test`, { headers }));
    expect(offsite.headers.get('location')).toBe(`${publicOrigin}/`);
  });

  it.each([
    { aud: 'another-application' }, { iss: 'https://example.test' },
    { exp: 100 }, { nbf: 4_000_000_000 }, { type: 'org' }, { email: '' },
  ])('rejects a signed identity outside the app policy (%o)', async (claims) => {
    const headers = { 'cf-access-jwt-assertion': await applicationToken(claims) };
    expect(await isAuthenticatedFromRequest(new Request(publicOrigin, { headers }))).toBe(false);
  });

  it('requires a verified identity on the public host even when a recovery cookie exists', async () => {
    const headers = { cookie: `${COOKIE_NAME}=${createSessionToken()}`, 'cf-access-authenticated-user-email': 'operator@example.test' };
    expect((await proxy(new NextRequest(publicOrigin, { headers }))).status).toBe(403);
    expect((await getLocalAi(new Request(`${publicOrigin}/api/local-ai/status`, { headers }))).status).toBe(401);
    expect((await passwordLogin(new Request(`${publicOrigin}/api/auth/login`, { method: 'POST', headers }))).status).toBe(403);
    expect(await isAuthenticatedFromRequest(new Request(directOrigin, { headers: { ...headers, host: dashboardAccess.hostname } }))).toBe(false);
    const accessHeaders = { 'cf-access-jwt-assertion': await applicationToken(), 'x-forwarded-host': dashboardAccess.hostname };
    expect(await isAuthenticatedFromRequest(new Request(directOrigin, { headers: accessHeaders }))).toBe(false);
    expect(await isAuthenticatedFromRequest(new Request(publicOrigin, { headers: { ...accessHeaders, host: 'localhost:3000' } }))).toBe(false);
  });

  it('allows changes from the signed-in dashboard and rejects cross-origin browser changes', async () => {
    const assertion = await applicationToken();
    const request = (origin: string) => new Request(publicOrigin, {
      method: 'POST', headers: { origin, 'cf-access-jwt-assertion': assertion },
    });
    expect(await isAuthenticatedFromRequest(request(publicOrigin))).toBe(true);
    expect(await isAuthenticatedFromRequest(request('https://other.example.test'))).toBe(false);
    expect((await logout(request('https://other.example.test'))).status).toBe(403);
  });

  it('keeps the direct recovery login and existing machine endpoints available', async () => {
    const direct = await proxy(new NextRequest(directOrigin));
    expect(direct.headers.get('location')).toBe(`${directOrigin}/login?from=%2F`);
    const headers = { cookie: `${COOKIE_NAME}=${createSessionToken()}` };
    expect(await isAuthenticatedFromRequest(new Request(directOrigin, { headers }))).toBe(true);
    for (const path of ['/api/health', '/metrics', '/api/home-network/ingest']) {
      expect((await proxy(new NextRequest(`${directOrigin}${path}`))).headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('sends sign-out to the provider that issued the session', async () => {
    const publicResult = await logout(new Request(`${publicOrigin}/api/auth/logout`, { method: 'POST' }));
    const directResult = await logout(new Request(`${directOrigin}/api/auth/logout`, { method: 'POST' }));
    expect((await publicResult.json()).redirectTo).toBe('/cdn-cgi/access/logout');
    expect((await directResult.json()).redirectTo).toBe('/login');
  });
});
