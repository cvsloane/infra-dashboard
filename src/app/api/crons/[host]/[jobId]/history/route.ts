/**
 * API: run history for a single scheduled job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getCronRunHistory } from '@/lib/redis/crons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ host: string; jobId: string }> },
) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { host, jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = Math.max(
    1,
    Math.min(200, parseInt(searchParams.get('limit') || '50', 10)),
  );

  try {
    const history = await getCronRunHistory(host, jobId, limit);
    return NextResponse.json({ host, jobId, history });
  } catch (error) {
    console.error(`Failed to fetch cron history ${host}/${jobId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch cron history' },
      { status: 500 },
    );
  }
}
