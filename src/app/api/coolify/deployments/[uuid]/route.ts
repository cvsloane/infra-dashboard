import { NextResponse } from 'next/server';
import { getDeploymentByUuid } from '@/lib/coolify/db';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid } = await params;
    const deployment = await getDeploymentByUuid(uuid);

    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // Transform to expected format for frontend
    return NextResponse.json({
      uuid: deployment.uuid,
      application_name: deployment.applicationName,
      application_uuid: deployment.applicationUuid,
      status: deployment.status,
      commit: deployment.commit,
      commit_message: deployment.commitMessage,
      created_at: deployment.createdAt,
      finished_at: deployment.finishedAt,
      logs: deployment.logs,
    });
  } catch (error) {
    console.error('Failed to fetch deployment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch deployment' },
      { status: 500 }
    );
  }
}
