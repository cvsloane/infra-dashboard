import { registry } from '@/lib/server/metrics';
import { secureCompare } from '@/lib/secure-compare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return false;

  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return secureCompare(auth.slice('Bearer '.length), expected);
  }

  return secureCompare(request.headers.get('x-metrics-token') || '', expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized\n', { status: 401 });
  }

  const body = await registry.metrics();
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': registry.contentType,
      'cache-control': 'no-store',
    },
  });
}
