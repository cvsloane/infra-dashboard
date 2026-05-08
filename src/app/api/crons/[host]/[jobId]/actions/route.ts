/**
 * API: management actions for a scheduled job.
 *
 *   POST /api/crons/<host>/<jobId>/actions  body: { action: "pause"|"enable"|"run-now" }
 *
 * All write actions are gated by `CRON_MANAGEMENT_ACTIONS=true` and only run
 * when the inventory record's `host` matches the local hostname. Every
 * attempt is recorded to `~/.hermes/cron-management-actions.jsonl`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import {
  actionsEnabled,
  audit,
  loadInventory,
  runNow,
  setEnabled,
  type ActionOutcome,
  type ManagementAction,
} from '@/lib/crons/management';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_ACTIONS: ManagementAction[] = ['pause', 'enable', 'run-now'];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ host: string; jobId: string }> },
) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { host, jobId } = await context.params;
  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const action = body.action as ManagementAction | undefined;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `invalid action; expected one of ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    );
  }

  if (!actionsEnabled()) {
    const outcome: ActionOutcome = {
      ok: false,
      error: 'management actions are disabled (set CRON_MANAGEMENT_ACTIONS=true to enable)',
      status: 501,
    };
    await audit({
      timestamp: new Date().toISOString(),
      action,
      host,
      jobId,
      initiator: 'web',
      outcome,
    });
    return NextResponse.json(
      { ok: outcome.ok, error: outcome.ok ? undefined : outcome.error },
      { status: 501 },
    );
  }

  const inv = await loadInventory(host, jobId);
  if (!inv) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }

  let outcome: ActionOutcome;
  switch (action) {
    case 'run-now':
      outcome = await runNow(inv);
      break;
    case 'pause':
      outcome = await setEnabled(inv, false);
      break;
    case 'enable':
      outcome = await setEnabled(inv, true);
      break;
    default:
      outcome = { ok: false, error: 'unsupported', status: 400 };
  }

  await audit({
    timestamp: new Date().toISOString(),
    action,
    host,
    jobId,
    jobName: inv.name,
    source: inv.source,
    initiator: 'web',
    outcome,
  });

  if (!outcome.ok) {
    const status = outcome.status ?? 500;
    return NextResponse.json({ ok: false, error: outcome.error }, { status });
  }
  return NextResponse.json({ ok: true, action, details: outcome.details });
}
