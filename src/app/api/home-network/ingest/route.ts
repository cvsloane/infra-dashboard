import { NextResponse } from 'next/server';
import {
  storeHomeNetworkSnapshot,
  validateHomeNetworkSnapshot,
  validateSnapshotFreshForIngest,
} from '@/lib/redis/home-network';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  const validation = validateHomeNetworkSnapshot(body);
  if (!validation.ok || !validation.snapshot) {
    return NextResponse.json({ error: validation.error || 'Invalid snapshot' }, { status: 400 });
  }

  const freshnessError = validateSnapshotFreshForIngest(validation.snapshot);
  if (freshnessError) {
    return NextResponse.json({ error: freshnessError }, { status: 400 });
  }

  try {
    const history_entry = await storeHomeNetworkSnapshot(validation.snapshot);
    return NextResponse.json({
      ok: true,
      collected_at: validation.snapshot.collected_at,
      router_count: validation.snapshot.routers.length,
      client_count: validation.snapshot.clients.length,
      history_entry,
    });
  } catch (error) {
    console.error('Failed to ingest home network snapshot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ingest home network snapshot' },
      { status: 500 },
    );
  }
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.HOME_NETWORK_INGEST_TOKEN;
  if (!expected) {
    return false;
  }

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const headerToken = request.headers.get('x-ingest-token') || '';

  return constantTimeEqual(bearer, expected) || constantTimeEqual(headerToken, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
