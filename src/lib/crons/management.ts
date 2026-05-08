/**
 * Server-side cron management primitives. Used by the action routes.
 *
 * Safety model:
 *  - All writes are gated by `CRON_MANAGEMENT_ACTIONS=true`.
 *  - Actions only run when the inventory record's `host` matches the local
 *    hostname (`os.hostname()`). Cross-host management is not yet supported —
 *    a future implementation would route the request to the collector on the
 *    remote host.
 *  - Every attempted action — successful or not — is appended to an audit
 *    log at `~/.hermes/cron-management-actions.jsonl`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, stat } from 'node:fs/promises';
import { appendFile, mkdir } from 'node:fs/promises';
import { hostname, homedir } from 'node:os';
import { dirname } from 'node:path';
import { getCronInventory } from '@/lib/redis/crons';
import type { CronInventoryRecord } from '@/types/cron';

const execFileAsync = promisify(execFile);

const AUDIT_LOG_PATH =
  process.env.CRON_AUDIT_LOG_PATH || `${homedir()}/.hermes/cron-management-actions.jsonl`;

export const PAUSE_TAG = '# [cron-monitor:paused] ';

const LOG_TAIL_BYTES = 64 * 1024;

export type ManagementAction = 'pause' | 'enable' | 'run-now' | 'tail-log';

export type ActionOutcome =
  | { ok: true; details?: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

export interface AuditEntry {
  timestamp: string;
  action: ManagementAction;
  host: string;
  jobId: string;
  jobName?: string;
  source?: string;
  initiator?: string | null;
  outcome: ActionOutcome;
}

export function actionsEnabled(): boolean {
  return String(process.env.CRON_MANAGEMENT_ACTIONS || '').toLowerCase() === 'true';
}

function localHost(): string {
  return process.env.CRON_LOCAL_HOST || hostname();
}

function isLocal(host: string): boolean {
  return host === localHost();
}

export async function loadInventory(host: string, jobId: string): Promise<CronInventoryRecord | null> {
  return getCronInventory(host, jobId);
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
    await appendFile(AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    console.error('[cron-management] failed to write audit log:', err);
  }
}

export async function tailLog(
  inv: CronInventoryRecord,
  bytes: number = LOG_TAIL_BYTES,
): Promise<{ excerpt: string; truncated: boolean; size: number; mtime: string } | null> {
  if (!inv.log_path) return null;
  let stats;
  try {
    stats = await stat(inv.log_path);
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;
  const fh = await open(inv.log_path, 'r');
  try {
    const start = Math.max(0, stats.size - bytes);
    const length = Math.min(bytes, stats.size - start);
    if (length <= 0) {
      return { excerpt: '', truncated: false, size: stats.size, mtime: stats.mtime.toISOString() };
    }
    const buf = Buffer.allocUnsafe(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return {
      excerpt: buf.subarray(0, bytesRead).toString('utf8'),
      truncated: stats.size > length,
      size: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  } finally {
    await fh.close();
  }
}

/* -------------------------------------------------------------------------- */
/* run-now                                                                    */
/* -------------------------------------------------------------------------- */

export async function runNow(inv: CronInventoryRecord): Promise<ActionOutcome> {
  if (!isLocal(inv.host)) {
    return { ok: false, error: 'host is not local; cross-host run-now not supported yet', status: 400 };
  }

  // Run-now is intentionally limited to systemd-timer sources. Executing an
  // arbitrary user-crontab command via the dashboard would be an RCE-grade
  // surface (the command can be anything), and a UI button is not the right
  // affordance for that. systemctl-driven units are bounded and audited by
  // systemd itself.
  if (inv.source !== 'systemd-timer') {
    return {
      ok: false,
      error: `run-now is only supported for systemd-timer entries (source=${inv.source})`,
      status: 400,
    };
  }
  const unit = extractServiceUnit(inv);
  if (!unit) {
    return { ok: false, error: 'could not determine systemd service unit', status: 400 };
  }
  try {
    const { stdout, stderr } = await execFileAsync('systemctl', ['start', unit], {
      timeout: 30_000,
    });
    return { ok: true, details: { unit, stdout, stderr } };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, error: e.stderr || e.message || 'systemctl start failed', status: 500 };
  }
}

function extractServiceUnit(inv: CronInventoryRecord): string | null {
  // The collector currently stores systemd timers with command like
  // "(systemd: foo.timer → foo.service)" when ExecStart is empty. Try that
  // pattern first, then fall back to the timer's `name` which the discoverer
  // sets to the service unit when one is known.
  const m = inv.command.match(/→\s*([^\s)]+)/);
  if (m && m[1].endsWith('.service')) return m[1];
  if (inv.name && inv.name.endsWith('.service')) return inv.name;
  return null;
}

/* -------------------------------------------------------------------------- */
/* pause / enable (user crontab only for now)                                 */
/* -------------------------------------------------------------------------- */

export async function setEnabled(
  inv: CronInventoryRecord,
  enable: boolean,
): Promise<ActionOutcome> {
  if (!isLocal(inv.host)) {
    return { ok: false, error: 'host is not local; cross-host pause/enable not supported yet', status: 400 };
  }
  if (inv.source !== 'user-crontab') {
    return {
      ok: false,
      error: `pause/enable not supported for source=${inv.source}`,
      status: 400,
    };
  }
  if (!inv.raw) {
    return { ok: false, error: 'inventory record has no raw line; cannot mutate crontab', status: 400 };
  }

  let current: string;
  try {
    const { stdout } = await execFileAsync('crontab', ['-l'], { timeout: 5_000 });
    current = stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, error: e.stderr || e.message || 'crontab -l failed', status: 500 };
  }

  const lines = current.split('\n');
  const targetRaw = inv.raw.trim();
  let foundIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.startsWith(PAUSE_TAG) ? line.slice(PAUSE_TAG.length) : line;
    if (stripped.trim() === targetRaw) {
      foundIdx = i;
      break;
    }
  }
  if (foundIdx === -1) {
    return { ok: false, error: 'could not find matching crontab line', status: 404 };
  }

  const targetLine = lines[foundIdx];
  const isPaused = targetLine.startsWith(PAUSE_TAG);
  if (enable && !isPaused) return { ok: true, details: { noop: true } };
  if (!enable && isPaused) return { ok: true, details: { noop: true } };

  lines[foundIdx] = enable
    ? targetLine.slice(PAUSE_TAG.length)
    : `${PAUSE_TAG}${targetLine}`;
  const next = lines.join('\n');

  try {
    await writeCrontab(next);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, error: e.stderr || e.message || 'crontab install failed', status: 500 };
  }

  return { ok: true, details: { paused: !enable } };
}

async function writeCrontab(content: string): Promise<void> {
  // Pipe to `crontab -` via stdin.
  await new Promise<void>((resolve, reject) => {
    const proc = execFile('crontab', ['-'], (err) => (err ? reject(err) : resolve()));
    proc.stdin?.end(content);
  });
}
