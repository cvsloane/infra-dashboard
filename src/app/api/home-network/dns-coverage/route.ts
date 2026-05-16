import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getDefaultChildSilenceMinutes, getNextDnsDbUrl } from '@/lib/nextdns/config';
import { getNextDnsCoverageSummary } from '@/lib/nextdns/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!getNextDnsDbUrl()) {
      return NextResponse.json({
        configured: false,
        checked_at: new Date().toISOString(),
        max_silent_minutes_default: getDefaultChildSilenceMinutes(),
        devices: [],
        alerts: [],
      });
    }

    return NextResponse.json(await getNextDnsCoverageSummary());
  } catch (error) {
    console.error('Failed to fetch NextDNS coverage:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch NextDNS coverage' },
      { status: 500 },
    );
  }
}
