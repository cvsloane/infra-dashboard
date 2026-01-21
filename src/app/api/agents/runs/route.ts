/**
 * API: Get all agent run summaries
 *
 * Returns the latest run for each known agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllAgentSummaries, getAgentStats } from '@/lib/redis/agents';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Verify authentication
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [summaries, stats] = await Promise.all([
      getAllAgentSummaries(),
      getAgentStats(),
    ]);

    return NextResponse.json({
      agents: summaries,
      stats,
    });
  } catch (error) {
    console.error('Failed to fetch agent runs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent runs' },
      { status: 500 }
    );
  }
}
