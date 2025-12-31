import { NextResponse } from 'next/server';
import { getLiveDeployments } from '@/lib/coolify/db';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Query Coolify's database directly for real-time deployment data
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
