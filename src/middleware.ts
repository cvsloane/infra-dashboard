/**
 * Next.js Middleware for Authentication
 *
 * Protects all routes except /login and /api/health.
 * Redirects unauthenticated users to login page.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'infra-dashboard-session';
const COOKIE_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000;
const TOKEN_VERSION = 'v1';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/health', '/api/auth'];

// API routes handle their own auth (return 401 instead of redirect)
const API_PREFIX = '/api/';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sessionSecret(): string {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD || '';
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function isValidSessionToken(token: string): Promise<boolean> {
  const [version, timestamp, signature, extra] = token.split('.');
  if (extra || version !== TOKEN_VERSION || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const tokenTime = Number(timestamp);
  if (!Number.isSafeInteger(tokenTime)) {
    return false;
  }

  const now = Date.now();
  if (now - tokenTime > COOKIE_MAX_AGE_MS || tokenTime - now > 60_000) {
    return false;
  }

  const expected = await signPayload(`${version}.${timestamp}`, sessionSecret());
  return constantTimeEqual(signature, expected);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Let API routes handle their own authentication (they return 401 instead of redirect)
  if (pathname.startsWith(API_PREFIX)) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // If no password is configured, allow all access.
  if (!process.env.DASHBOARD_PASSWORD) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(COOKIE_NAME);

  // If cookie exists and is valid, allow access
  if (sessionCookie?.value && await isValidSessionToken(sessionCookie.value)) {
    return NextResponse.next();
  }

  // Redirect to login for protected routes
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
