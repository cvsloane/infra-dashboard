import { NextResponse } from 'next/server';
import { pauseQueue } from '@/lib/redis/queue-control';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ queue: string }> }
) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { queue } = await params;
    if (!queue) {
      return NextResponse.json({ error: 'Queue name is required' }, { status: 400 });
    }

    await pauseQueue(queue);
    return NextResponse.json({ success: true, action: 'pause', queue });
  } catch (error) {
    console.error('Failed to pause queue:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to pause queue' },
      { status: 500 }
    );
  }
}
