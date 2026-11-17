import { createRemoteJWKSet, jwtVerify } from 'jose';

// Public identity-provider metadata for the Infra Dashboard Access application.
export const dashboardAccess = {
  hostname: 'ops.heavisidetechnology.com',
  issuer: 'https://heavisidegroup.cloudflareaccess.com',
  audience: 'e12e5b4de2ca000a103943b2161b3d9c19cc694d2c87e20a3d446c949cb2da2e',
} as const;

const assertionHeader = 'cf-access-jwt-assertion';
const signingKeys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', dashboardAccess.issuer));

type IncomingHeaders = Pick<Headers, 'get'>;

function isDashboardHost(host: string | null): boolean {
  return host?.split(':')[0].toLowerCase().replace(/\.$/, '') === dashboardAccess.hostname;
}

export function usesCloudflareAccess(headers: IncomingHeaders, url?: string): boolean {
  // Host information selects the stricter sign-in path. Only a verified token grants access.
  return headers.get(assertionHeader) !== null
    || isDashboardHost(headers.get('host'))
    || isDashboardHost(headers.get('x-forwarded-host')?.split(',')[0].trim() ?? null)
    || (url !== undefined && isDashboardHost(new URL(url).hostname));
}

export function allowsAccessRequestOrigin(headers: IncomingHeaders, method = 'GET'): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const origin = headers.get('origin');
  const site = headers.get('sec-fetch-site');
  return (origin === null || origin === `https://${dashboardAccess.hostname}`)
    && (site === null || site === 'same-origin' || site === 'none');
}

export async function hasVerifiedAccessIdentity(headers: IncomingHeaders): Promise<boolean> {
  const assertion = headers.get(assertionHeader);
  if (!assertion) return false;

  try {
    const { payload } = await jwtVerify(assertion, signingKeys, {
      issuer: dashboardAccess.issuer,
      audience: dashboardAccess.audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email', 'type'],
    });
    return payload.type === 'app' && typeof payload.sub === 'string' && payload.sub.length > 0
      && typeof payload.email === 'string' && payload.email.trim().length > 0;
  } catch {
    return false;
  }
}
