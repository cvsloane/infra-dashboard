import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAlertmanagerSummary } from '@/lib/alertmanager/client';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const payload = await getAlertmanagerSummary({ limit: Number.isFinite(limit) ? limit : undefined });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to fetch alertmanager alerts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch alertmanager alerts' },
      { status: 500 }
    );
  }
}

