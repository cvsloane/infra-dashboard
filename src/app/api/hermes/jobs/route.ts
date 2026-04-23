import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getHermesSummary } from '@/lib/hermes/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await getHermesSummary();
  return NextResponse.json({
    jobs: summary.jobs,
    fleet_health: {
      status: summary.status,
      message: summary.message,
      counts: summary.counts,
      nodes: summary.nodes,
      checked_at: summary.checked_at,
      last_update: summary.last_update,
    },
  });
}
