import { NextRequest } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getHermesSidecarBaseUrl, hermesSidecarHeaders } from '@/lib/hermes/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthenticatedFromRequest(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const baseUrl = getHermesSidecarBaseUrl();
  if (!baseUrl) {
    return new Response('Hermes sidecar URL is not configured', { status: 503 });
  }

  const upstream = await fetch(`${baseUrl}/fleet/activity/stream`, {
    headers: hermesSidecarHeaders(),
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Hermes sidecar stream returned ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
