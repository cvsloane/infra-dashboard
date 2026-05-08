/**
 * API: detail for a single scheduled job, including run history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getCronJobSummary, getCronRunHistory } from '@/lib/redis/crons';

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
    const job = await getCronJobSummary(host, jobId);
    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const history = await getCronRunHistory(host, jobId, limit);
    return NextResponse.json({ job, history });
  } catch (error) {
    console.error(`Failed to fetch cron job ${host}/${jobId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch cron job' },
      { status: 500 },
    );
  }
}
