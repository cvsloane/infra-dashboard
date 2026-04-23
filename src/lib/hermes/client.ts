import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import type { HermesOverviewSummary, HermesSummary } from '@/types/hermes';

const execFileAsync = promisify(execFile);

const DEFAULT_OPEN_AGENTS_ROOT = '/home/cvsloane/dev/open-agents';
const COMMAND_TIMEOUT_MS = Number(process.env.HERMES_COMMAND_TIMEOUT_MS || 60000);

function unavailableSummary(message: string): HermesSummary {
  const checkedAt = new Date().toISOString();
  return {
    status: 'warning',
    message,
    checked_at: checkedAt,
    last_update: null,
    counts: {
      total: 0,
      ok: 0,
      warning: 0,
      error: 0,
      paused: 0,
      unknown: 0,
    },
    nodes: {},
    alerts: [],
    jobs: [],
    unavailable: true,
  };
}

function compactSummary(summary: HermesSummary): HermesOverviewSummary {
  return {
    status: summary.status,
    message: summary.message,
    checked_at: summary.checked_at,
    last_update: summary.last_update,
    counts: summary.counts,
    nodes: summary.nodes,
    alerts: summary.alerts,
    fleet: summary.fleet,
    unavailable: summary.unavailable,
  };
}

function sidecarBaseUrl(): string | null {
  const raw = process.env.HERMES_SIDECAR_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

async function fetchFromSidecar(): Promise<HermesSummary> {
  const baseUrl = sidecarBaseUrl();
  if (!baseUrl) {
    throw new Error('HERMES_SIDECAR_URL is not configured');
  }

  const headers: HeadersInit = {};
  const token = process.env.HERMES_SIDECAR_TOKEN || process.env.HERMES_DASHBOARD_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = windowlessSetTimeout(() => controller.abort(), Number(process.env.HERMES_SIDECAR_TIMEOUT_MS || 5000));
  try {
    const response = await fetch(`${baseUrl}/fleet/summary`, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Hermes sidecar returned ${response.status}`);
    }
    return (await response.json()) as HermesSummary;
  } finally {
    clearTimeout(timeout);
  }
}

function windowlessSetTimeout(callback: () => void, ms: number): NodeJS.Timeout {
  return setTimeout(callback, ms);
}

async function fetchFromLocalCli(): Promise<HermesSummary> {
  const root = process.env.HERMES_OPEN_AGENTS_ROOT || DEFAULT_OPEN_AGENTS_ROOT;
  const script = `${root}/scripts/hermes-dashboard-sidecar.py`;
  if (!existsSync(script)) {
    throw new Error(`Hermes sidecar CLI not found at ${script}`);
  }

  const { stdout } = await execFileAsync(process.env.HERMES_PYTHON_BIN || 'python3', [script, '--once', 'summary'], {
    cwd: root,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout) as HermesSummary;
}

export async function getHermesSummary(): Promise<HermesSummary> {
  try {
    if (sidecarBaseUrl()) {
      return await fetchFromSidecar();
    }
    return await fetchFromLocalCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hermes summary unavailable';
    return unavailableSummary(message);
  }
}

export async function getHermesOverviewSummary(): Promise<HermesOverviewSummary> {
  const summary = await getHermesSummary();
  return compactSummary(summary);
}
