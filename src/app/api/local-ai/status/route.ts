import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getLocalAIGpuLeaseStatus } from '@/lib/prometheus/client';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await getLocalAIGpuLeaseStatus());
  } catch (error) {
    console.error('Failed to fetch Local AI GPU lease status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Local AI GPU lease status' },
      { status: 500 }
    );
  }
}
