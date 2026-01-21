import { NextResponse } from 'next/server';
import { getLiveDeployments, getAllDeployments } from '@/lib/coolify/db';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');
  const cursor = searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  // Parse filters
  const statusFilter = searchParams.get('status')?.split(',').filter(Boolean);
  const applicationFilter = searchParams.get('application') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const filters = {
    ...(statusFilter && statusFilter.length > 0 && { status: statusFilter }),
    ...(applicationFilter && { applicationName: applicationFilter }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate })
  };

  try {
    // If view=all, fetch paginated all deployments
    if (view === 'all') {
      const { active, recent, stats } = await getLiveDeployments();
      const allData = await getAllDeployments(cursor, limit, filters);

      return NextResponse.json({
        active,
        recent,
        stats,
        all: allData,
      });
    }

    // Default behavior: fetch live deployments only (backwards compatible)
    const { active, recent, stats } = await getLiveDeployments();

    // Transform to expected format for backwards compatibility
    const deployments = [...active, ...recent].map(d => ({
      uuid: d.uuid,
      application_name: d.applicationName,
      application_uuid: d.applicationUuid,
      status: d.status,
      commit: d.commit,
      commit_message: d.commitMessage,
      created_at: d.createdAt,
      finished_at: d.finishedAt,
      duration_ms: d.durationMs,
    }));

    return NextResponse.json({
      deployments,
      active,
      recent,
      stats,
    });
  } catch (error) {
    console.error('Failed to fetch deployments:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch deployments' },
      { status: 500 }
    );
  }
}
