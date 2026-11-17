import { NextResponse, type NextRequest } from 'next/server';
import { dashboardAccess, usesCloudflareAccess } from '@/lib/cloudflare-access';
import { isAuthenticatedFromRequest } from '@/lib/request-auth';

function publicReturnUrl(request: NextRequest): URL {
  const home = new URL(`https://${dashboardAccess.hostname}`);
  const from = request.nextUrl.searchParams.get('from');
  if (!from || !URL.canParse(from, home)) return home;
  const target = new URL(from, home);
  return target.origin === home.origin && !/^\/login\/?$/.test(target.pathname) ? target : home;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // These handlers own their auth, including the metrics and collector bearer tokens.
  if (pathname.startsWith('/api/') || pathname === '/metrics') return NextResponse.next();

  const publicAccess = usesCloudflareAccess(request.headers, request.url);
  if (pathname === '/login' && !publicAccess) return NextResponse.next();

  if (await isAuthenticatedFromRequest(request)) {
    if (pathname === '/login') return NextResponse.redirect(publicReturnUrl(request));
    return NextResponse.next();
  }

  if (publicAccess) {
    return new NextResponse('Cloudflare could not verify your dashboard sign-in.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('from', pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
