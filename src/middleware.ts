/**
 * Next.js Middleware for Authentication
 *
 * Protects all routes except /login and /api/health.
 * Redirects unauthenticated users to login page.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'infra-dashboard-session';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/health', '/api/auth'];

// API routes handle their own auth (return 401 instead of redirect)
const API_PREFIX = '/api/';

function isValidSessionToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [timestamp, marker] = decoded.split(':');

    if (marker !== 'valid') return false;

    // Check token is not too old (7 days)
    const tokenTime = parseInt(timestamp, 10);
    const maxAge = 60 * 60 * 24 * 7 * 1000; // 7 days in ms
    if (Date.now() - tokenTime > maxAge) return false;

    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
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

  // If no password is configured, allow all access
  // Note: This check happens at runtime, so we need a fallback
  // The actual env check happens in the auth lib
  const sessionCookie = request.cookies.get(COOKIE_NAME);

  // If cookie exists and is valid, allow access
  if (sessionCookie?.value && isValidSessionToken(sessionCookie.value)) {
    return NextResponse.next();
  }

  // Check if password protection is enabled via a header hint
  // (We can't access env vars directly in edge runtime in all cases)
  // For simplicity, we'll always require auth if no valid cookie
  // The login page will handle the "no password set" case

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
