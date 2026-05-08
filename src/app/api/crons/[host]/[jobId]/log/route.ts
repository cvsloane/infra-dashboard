/**
 * API: tail the log file associated with a scheduled job.
 *
 * Read-only. Always available (no env flag). Limited to the local host —
 * remote-host log tailing requires routing through the collector (Phase 2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { loadInventory, tailLog } from '@/lib/crons/management';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_BYTES = 256 * 1024;
const DEFAULT_BYTES = 64 * 1024;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ host: string; jobId: string }> },
) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { host, jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const bytes = Math.max(
    1024,
    Math.min(MAX_BYTES, parseInt(searchParams.get('bytes') || `${DEFAULT_BYTES}`, 10)),
  );

  const inv = await loadInventory(host, jobId);
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!inv.log_path) {
    return NextResponse.json(
      { error: 'no log path configured for this job' },
      { status: 400 },
    );
  }

  const result = await tailLog(inv, bytes);
  if (!result) {
    return NextResponse.json(
      { error: 'log file unreadable or missing', log_path: inv.log_path },
      { status: 404 },
    );
  }

  return NextResponse.json({
    host,
    jobId,
    log_path: inv.log_path,
    ...result,
  });
}
