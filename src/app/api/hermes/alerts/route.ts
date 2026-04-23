import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getHermesAlerts } from '@/lib/hermes/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const window = request.nextUrl.searchParams.get('window') || '24h';
  const limit = Number(request.nextUrl.searchParams.get('limit') || 100);
  return NextResponse.json(await getHermesAlerts(window, limit));
}
