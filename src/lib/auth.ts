import { cookies, headers } from 'next/headers';
import { COOKIE_NAME, COOKIE_MAX_AGE_SEC, createSessionToken } from '@/lib/auth-token';
import { isAuthenticatedFromRequest } from '@/lib/request-auth';
import { secureCompare } from '@/lib/secure-compare';

export { getSessionFromHeaders, isAuthenticatedFromRequest } from '@/lib/request-auth';

export function validatePassword(password: string): boolean {
  const correctPassword = process.env.DASHBOARD_PASSWORD;
  if (!correctPassword) return process.env.NODE_ENV !== 'production';
  return secureCompare(password, correctPassword);
}

export async function isAuthenticated(): Promise<boolean> {
  return isAuthenticatedFromRequest({ headers: await headers() });
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
