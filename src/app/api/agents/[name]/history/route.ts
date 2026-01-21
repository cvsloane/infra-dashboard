/**
 * API: Get agent run history
 *
 * Returns the last N runs for a specific agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentRunHistory } from '@/lib/redis/agents';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  // Verify authentication
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  try {
    const history = await getAgentRunHistory(name, limit);

    return NextResponse.json({
      agent: name,
      runs: history,
    });
  } catch (error) {
    console.error(`Failed to fetch agent history for ${name}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch agent history' },
      { status: 500 }
    );
  }
}
