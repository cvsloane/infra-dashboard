import { registry } from '@/lib/server/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return true;

  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length) === expected;
  }

  return request.headers.get('x-metrics-token') === expected;
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

