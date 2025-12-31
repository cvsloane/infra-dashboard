import { NextResponse } from 'next/server';
import { getAllQueueStats, getQueueStats } from '@/lib/redis/client';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const queueName = url.searchParams.get('name');

    if (queueName) {
      // Get stats for a specific queue
      const stats = await getQueueStats(queueName);
      return NextResponse.json({ queue: stats });
    }

    // Get all queue stats
    const queues = await getAllQueueStats();
    return NextResponse.json({ queues });
  } catch (error) {
    console.error('Failed to fetch queue stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch queue stats' },
      { status: 500 }
    );
  }
}
