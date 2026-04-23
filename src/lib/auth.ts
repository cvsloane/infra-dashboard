/**
 * Simple Password Authentication
 *
 * Basic cookie-based auth for dashboard access.
 * Single password stored in DASHBOARD_PASSWORD env var.
 */

import { cookies } from 'next/headers';
import { COOKIE_MAX_AGE_SEC, createSessionToken, isValidSessionToken } from '@/lib/auth-token';

const COOKIE_NAME = 'infra-dashboard-session';

// Validate password against environment variable
export function validatePassword(password: string): boolean {
  const correctPassword = process.env.DASHBOARD_PASSWORD;
  if (!correctPassword) {
    console.warn('DASHBOARD_PASSWORD not set - authentication disabled');
    return true; // Allow access if no password set
  }
  return password === correctPassword;
}

// Check if current request is authenticated (for server components)
export async function isAuthenticated(): Promise<boolean> {
  // If no password is set, allow all access
  if (!process.env.DASHBOARD_PASSWORD) {
    return true;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);

  if (!sessionCookie?.value) {
    return false;
  }

  return isValidSessionToken(sessionCookie.value);
}

// Create session cookie after successful login
export async function createSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = createSessionToken();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SEC,
    path: '/',
  });
}

// Clear session cookie (logout)
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Get session token from request headers (for API routes)
export function getSessionFromHeaders(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith(`${COOKIE_NAME}=`));

  if (!sessionCookie) return null;

  // Use substring to handle base64 values that may contain '='
  // URL-decode the cookie value since cookies can be percent-encoded
  const rawValue = sessionCookie.substring(COOKIE_NAME.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue; // Return as-is if decoding fails
  }
}

// Check auth from request (for API routes)
export function isAuthenticatedFromRequest(request: Request): boolean {
  if (!process.env.DASHBOARD_PASSWORD) {
    return true;
  }

  const token = getSessionFromHeaders(request);
  if (!token) return false;

  return isValidSessionToken(token);
}
