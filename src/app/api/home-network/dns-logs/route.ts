import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getNextDnsDbUrl } from '@/lib/nextdns/config';
import { queryNextDnsLogs } from '@/lib/nextdns/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    if (!getNextDnsDbUrl()) {
      return NextResponse.json({ configured: false, logs: [], next_before: null });
    }

    const result = await queryNextDnsLogs({
      profileId: optionalParam(url, 'profile_id'),
      device: optionalParam(url, 'device'),
      status: optionalParam(url, 'status'),
      search: optionalParam(url, 'search'),
      from: optionalParam(url, 'from'),
      to: optionalParam(url, 'to'),
      before: optionalParam(url, 'before'),
      limit: intParam(url, 'limit'),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch NextDNS logs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch NextDNS logs' },
      { status: 500 },
    );
  }
}

function optionalParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

function intParam(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
