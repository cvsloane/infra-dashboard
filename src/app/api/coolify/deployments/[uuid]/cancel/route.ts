import { NextResponse } from 'next/server';
import { cancelDeployment } from '@/lib/coolify/client';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid } = await params;
    if (!uuid) {
      return NextResponse.json({ error: 'deployment uuid is required' }, { status: 400 });
    }

    const result = await cancelDeployment(uuid);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Failed to cancel deployment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel deployment' },
      { status: 500 }
    );
  }
}
