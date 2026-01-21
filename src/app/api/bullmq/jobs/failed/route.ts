import { NextResponse } from 'next/server';
import { getFailedJobs, retryJob, deleteJob, retryAllFailed, deleteAllFailed, discoverQueues } from '@/lib/redis/client';
import { isAuthenticatedFromRequest } from '@/lib/auth';

const normalizeLimit = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
};

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const queueName = url.searchParams.get('queue');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    if (queueName) {
      // Get failed jobs for a specific queue
      const jobs = await getFailedJobs(queueName, limit);
      return NextResponse.json({ jobs });
    }

    // Get failed jobs from all queues
    const queues = await discoverQueues();
    const allJobs = await Promise.all(
      queues.map(async (queue) => {
        const jobs = await getFailedJobs(queue, Math.ceil(limit / queues.length));
        return jobs;
      })
    );

    const jobs = allJobs.flat().slice(0, limit);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Failed to fetch failed jobs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch failed jobs' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, queue, jobId, limit } = body;
    const limitValue = normalizeLimit(limit);

    if (action === 'retry') {
      if (!queue || !jobId) {
        return NextResponse.json(
          { error: 'queue and jobId are required' },
          { status: 400 }
        );
      }
      const success = await retryJob(queue, jobId);
      return NextResponse.json({ success, action: 'retry' });
    }

    if (action === 'delete') {
      if (!queue || !jobId) {
        return NextResponse.json(
          { error: 'queue and jobId are required' },
          { status: 400 }
        );
      }
      const success = await deleteJob(queue, jobId);
      return NextResponse.json({ success, action: 'delete' });
    }

    if (action === 'retry_all' || action === 'delete_all') {
      const queueList = queue && queue !== 'all'
        ? [queue]
        : await discoverQueues();

      let results: Array<{ queue: string; processed: number }>;
      if (limitValue !== undefined && queueList.length > 1) {
        let remaining = limitValue;
        results = [];
        for (const queueName of queueList) {
          if (remaining <= 0) {
            results.push({ queue: queueName, processed: 0 });
            continue;
          }
          const processed = action === 'retry_all'
            ? await retryAllFailed(queueName, remaining)
            : await deleteAllFailed(queueName, remaining);
          results.push({ queue: queueName, processed });
          remaining -= processed;
        }
      } else {
        results = await Promise.all(
          queueList.map(async (queueName) => {
            const processed = action === 'retry_all'
              ? await retryAllFailed(queueName, limitValue)
              : await deleteAllFailed(queueName, limitValue);
            return { queue: queueName, processed };
          })
        );
      }

      const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
      return NextResponse.json({
        success: true,
        action,
        queues: results,
        processed: totalProcessed,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "retry", "delete", "retry_all", or "delete_all"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to process job action:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process job action' },
      { status: 500 }
    );
  }
}
