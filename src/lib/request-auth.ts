import { COOKIE_NAME, isValidSessionToken } from '@/lib/auth-token';
import { allowsAccessRequestOrigin, hasVerifiedAccessIdentity, usesCloudflareAccess } from '@/lib/cloudflare-access';

export function getSessionFromHeaders(request: Pick<Request, 'headers'>): string | null {
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

export async function isAuthenticatedFromRequest(request: Pick<Request, 'headers'> & { url?: string; method?: string }): Promise<boolean> {
  if (usesCloudflareAccess(request.headers, request.url)) {
    return allowsAccessRequestOrigin(request.headers, request.method) && await hasVerifiedAccessIdentity(request.headers);
  }
  if (!process.env.DASHBOARD_PASSWORD) return process.env.NODE_ENV !== 'production';
  const token = getSessionFromHeaders(request);
  return token !== null && isValidSessionToken(token);
}
