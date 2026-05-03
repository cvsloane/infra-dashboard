import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getHomeNetworkReadModel } from '@/lib/redis/home-network';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await getHomeNetworkReadModel());
  } catch (error) {
    console.error('Failed to fetch home network snapshot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch home network snapshot' },
      { status: 500 },
    );
  }
}
