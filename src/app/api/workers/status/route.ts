import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getWorkerSupervisorStatus } from '@/lib/redis/workers';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = await getWorkerSupervisorStatus();
    return NextResponse.json({ status });
  } catch (error) {
    console.error('Failed to fetch worker supervisor status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch worker status' },
      { status: 500 }
    );
  }
}
