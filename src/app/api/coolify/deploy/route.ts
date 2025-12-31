import { NextResponse } from 'next/server';
import { triggerDeploy } from '@/lib/coolify/client';
import { isAuthenticatedFromRequest } from '@/lib/auth';

export async function POST(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { applicationUuid, force = false } = body;

    if (!applicationUuid) {
      return NextResponse.json(
        { error: 'applicationUuid is required' },
        { status: 400 }
      );
    }

    const result = await triggerDeploy(applicationUuid, force);
    return NextResponse.json({
      success: true,
      deployment_uuid: result.deployment_uuid,
    });
  } catch (error) {
    console.error('Failed to trigger deployment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to trigger deployment' },
      { status: 500 }
    );
  }
}
