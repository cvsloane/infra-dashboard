import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAutohealConfig } from '@/lib/autoheal/config';
import { getAutohealEvents, getAutohealHeartbeatStatus, getAutohealSiteStates } from '@/lib/redis/autoheal';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const config = await getAutohealConfig();
    const [status, events, siteStates] = await Promise.all([
      getAutohealHeartbeatStatus(),
      getAutohealEvents(limit),
      getAutohealSiteStates(config.enabledSites),
    ]);

    return NextResponse.json({
      status,
      events,
      siteStates,
    });
  } catch (error) {
    console.error('Failed to fetch autoheal status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch autoheal status' },
      { status: 500 }
    );
  }
}

