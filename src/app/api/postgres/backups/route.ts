import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getPostgresBackupsSummary } from '@/lib/backups/postgres';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await getPostgresBackupsSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to fetch postgres backup status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch postgres backup status' },
      { status: 500 }
    );
  }
}

