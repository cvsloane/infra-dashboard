import { getRedis } from '@/lib/redis/client';

export interface WorkerSupervisorSummary {
  total: number;
  ok: number;
  warning: number;
  down: number;
}

export interface WorkerSupervisorItem {
  name: string;
  source: 'systemd' | 'pm2' | 'docker';
  status: 'ok' | 'warning' | 'down';
  detail?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface WorkerSupervisorStatus {
  version: number;
  host?: string;
  updatedAt: string;
  summary: WorkerSupervisorSummary;
  items: WorkerSupervisorItem[];
  stale?: boolean;
  ageSec?: number;
}

const STATUS_KEY = 'infra:workers:status';
const MAX_AGE_ENV = 'WORKER_STATUS_MAX_AGE_SEC';

function getMaxAgeSec(): number {
  const raw = process.env[MAX_AGE_ENV];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 180;
  return Math.floor(parsed);
}

function parseUpdatedAt(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export async function getWorkerSupervisorStatus(): Promise<WorkerSupervisorStatus | null> {
  const client = getRedis();
  const raw = await client.get(STATUS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as WorkerSupervisorStatus & { updatedAt?: string };
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.updatedAt) return parsed as WorkerSupervisorStatus;

    const updatedAtMs = parseUpdatedAt(parsed.updatedAt);
    if (!updatedAtMs) return parsed as WorkerSupervisorStatus;

    const ageSec = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000));
    const stale = ageSec > getMaxAgeSec();

    return {
      ...parsed,
      stale,
      ageSec,
    } as WorkerSupervisorStatus;
  } catch (error) {
    console.error('Failed to parse worker supervisor status:', error);
    return null;
  }
}
