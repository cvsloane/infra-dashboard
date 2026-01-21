import { NextResponse } from 'next/server';
import { getApplications } from '@/lib/coolify/client';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const applications = await getApplications();
    return NextResponse.json({ applications });
  } catch (error) {
    console.error('Failed to fetch applications:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}
