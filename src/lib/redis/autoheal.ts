import { getRedis } from '@/lib/redis/client';

export interface AutohealHeartbeatSummary {
  checked: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  skippedDeploying: number;
  cooldownSkips: number;
  restartsTriggered: number;
  restartsFailed: number;
  redeploysTriggered: number;
  redeploysFailed: number;
}

export interface AutohealHeartbeatStatus {
  version: number;
  host?: string;
  updatedAt: string;
  enabled: boolean;
  enabledSitesCount: number;
  configUpdatedAt?: string | null;
  summary: AutohealHeartbeatSummary;
  stale?: boolean;
  ageSec?: number;
}

export interface AutohealEvent {
  ts: string;
  host?: string;
  action: string;
  uuid: string;
  name: string;
  fqdn: string;
  detail?: string | null;
  httpCode?: string | null;
  ageSec?: number;
}

export interface AutohealSiteState {
  uuid: string;
  failCount?: number | null;
  failTtlSec?: number | null;
  phase?: string | null;
  phaseTtlSec?: number | null;
  cooldown?: string | null;
  cooldownTtlSec?: number | null;
}

const STATUS_KEY = process.env.AUTOHEAL_STATUS_KEY || 'infra:autoheal:status';
const EVENTS_KEY = process.env.AUTOHEAL_EVENTS_KEY || 'infra:autoheal:events';
const MAX_AGE_ENV = 'AUTOHEAL_STATUS_MAX_AGE_SEC';
const EVENTS_LIMIT_ENV = 'AUTOHEAL_EVENTS_LIMIT';

function getMaxAgeSec(): number {
  const raw = process.env[MAX_AGE_ENV];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 180;
  return Math.floor(parsed);
}

function getEventsLimit(): number {
  const raw = process.env[EVENTS_LIMIT_ENV];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(200, Math.floor(parsed));
}

function parseDateMs(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function parseTtl(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  // -2 key does not exist, -1 no expiry
  if (value < 0) return null;
  return Math.floor(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }
  return null;
}

export async function getAutohealHeartbeatStatus(): Promise<AutohealHeartbeatStatus | null> {
  const client = getRedis();
  const raw = await client.get(STATUS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AutohealHeartbeatStatus & { updatedAt?: string };
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.updatedAt) return parsed as AutohealHeartbeatStatus;

    const updatedAtMs = parseDateMs(parsed.updatedAt);
    if (!updatedAtMs) return parsed as AutohealHeartbeatStatus;

    const ageSec = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000));
    const stale = ageSec > getMaxAgeSec();

    return {
      ...parsed,
      stale,
      ageSec,
    } as AutohealHeartbeatStatus;
  } catch (error) {
    console.error('Failed to parse autoheal heartbeat status:', error);
    return null;
  }
}

export async function getAutohealEvents(limit?: number): Promise<AutohealEvent[]> {
  const client = getRedis();
  const take = limit && limit > 0 ? Math.min(200, Math.floor(limit)) : getEventsLimit();

  const rawEvents = await client.lrange(EVENTS_KEY, 0, take - 1);
  if (!rawEvents.length) return [];

  const events: AutohealEvent[] = [];

  for (const raw of rawEvents) {
    try {
      const parsed = JSON.parse(raw) as Partial<AutohealEvent>;
      if (!parsed || typeof parsed !== 'object') continue;
      if (!parsed.ts || !parsed.action) continue;

      const event: AutohealEvent = {
        ts: String(parsed.ts),
        host: parsed.host ? String(parsed.host) : undefined,
        action: String(parsed.action),
        uuid: parsed.uuid ? String(parsed.uuid) : '',
        name: parsed.name ? String(parsed.name) : '',
        fqdn: parsed.fqdn ? String(parsed.fqdn) : '',
        detail: parsed.detail === undefined ? undefined : (parsed.detail === null ? null : String(parsed.detail)),
        httpCode: parsed.httpCode === undefined ? undefined : (parsed.httpCode === null ? null : String(parsed.httpCode)),
      };

      const tsMs = parseDateMs(event.ts);
      if (tsMs) {
        event.ageSec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
      }

      events.push(event);
    } catch {
      // Ignore malformed events.
    }
  }

  return events;
}

export async function getAutohealSiteStates(uuids: string[]): Promise<Record<string, AutohealSiteState>> {
  const client = getRedis();
  const unique = Array.from(new Set(uuids.filter(Boolean)));
  if (unique.length === 0) return {};

  const pipeline = client.pipeline();
  for (const uuid of unique) {
    const failKey = `infra:autoheal:fail:${uuid}`;
    const phaseKey = `infra:autoheal:phase:${uuid}`;
    const cooldownKey = `infra:autoheal:cooldown:${uuid}`;

    pipeline.get(failKey);
    pipeline.ttl(failKey);
    pipeline.get(phaseKey);
    pipeline.ttl(phaseKey);
    pipeline.get(cooldownKey);
    pipeline.ttl(cooldownKey);
  }

  const results = await pipeline.exec();

  const states: Record<string, AutohealSiteState> = {};
  for (let i = 0; i < unique.length; i++) {
    const uuid = unique[i]!;
    const baseIndex = i * 6;
    const failRaw = results?.[baseIndex]?.[1];
    const failTtlRaw = results?.[baseIndex + 1]?.[1];
    const phaseRaw = results?.[baseIndex + 2]?.[1];
    const phaseTtlRaw = results?.[baseIndex + 3]?.[1];
    const cooldownRaw = results?.[baseIndex + 4]?.[1];
    const cooldownTtlRaw = results?.[baseIndex + 5]?.[1];

    states[uuid] = {
      uuid,
      failCount: parseNumber(failRaw),
      failTtlSec: parseTtl(failTtlRaw),
      phase: typeof phaseRaw === 'string' ? phaseRaw : null,
      phaseTtlSec: parseTtl(phaseTtlRaw),
      cooldown: typeof cooldownRaw === 'string' ? cooldownRaw : null,
      cooldownTtlSec: parseTtl(cooldownTtlRaw),
    };
  }

  return states;
}

