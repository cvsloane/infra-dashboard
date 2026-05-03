import type {
  HomeNetworkHistoryEntry,
  HomeNetworkReadResponse,
  HomeNetworkRouter,
  HomeNetworkSnapshot,
  HomeNetworkStatus,
} from '@/types/home-network';

const DEFAULT_MAX_AGE_SEC = 180;
const DEFAULT_HISTORY_LIMIT = 1440;
const DEFAULT_INGEST_REJECT_AGE_SEC = 3600;
const DEFAULT_FUTURE_SKEW_SEC = 300;
const HIGH_LATENCY_WARNING_MS = 150;

export interface ValidationResult {
  ok: boolean;
  snapshot?: HomeNetworkSnapshot;
  error?: string;
}

export function getHomeNetworkMaxAgeSec(): number {
  return positiveIntFromEnv('HOME_NETWORK_MAX_AGE_SEC', DEFAULT_MAX_AGE_SEC);
}

export function getHomeNetworkHistoryLimit(): number {
  return positiveIntFromEnv('HOME_NETWORK_HISTORY_LIMIT', DEFAULT_HISTORY_LIMIT);
}

export function getHomeNetworkIngestRejectAgeSec(): number {
  return positiveIntFromEnv('HOME_NETWORK_INGEST_REJECT_AGE_SEC', DEFAULT_INGEST_REJECT_AGE_SEC);
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function validateHomeNetworkSnapshot(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'snapshot must be an object' };
  }

  const candidate = input as Partial<HomeNetworkSnapshot>;
  if (candidate.schema_version !== 1) {
    return { ok: false, error: 'schema_version must be 1' };
  }
  if (!candidate.collected_at || Number.isNaN(Date.parse(candidate.collected_at))) {
    return { ok: false, error: 'collected_at must be a valid ISO timestamp' };
  }
  if (typeof candidate.collector_host !== 'string' || candidate.collector_host.length === 0) {
    return { ok: false, error: 'collector_host is required' };
  }
  if (!isHomeNetworkStatus(candidate.status)) {
    return { ok: false, error: 'status is invalid' };
  }
  if (!Array.isArray(candidate.routers)) {
    return { ok: false, error: 'routers must be an array' };
  }
  if (!Array.isArray(candidate.clients)) {
    return { ok: false, error: 'clients must be an array' };
  }
  if (!candidate.dns || typeof candidate.dns !== 'object' || !Array.isArray(candidate.dns.routers)) {
    return { ok: false, error: 'dns.routers must be an array' };
  }
  if (!Array.isArray(candidate.warnings)) {
    return { ok: false, error: 'warnings must be an array' };
  }

  for (const router of candidate.routers) {
    if (!router || typeof router !== 'object') {
      return { ok: false, error: 'router entries must be objects' };
    }
    const r = router as Partial<HomeNetworkRouter>;
    if (!r.hostname || !r.management_ip || !r.role) {
      return { ok: false, error: 'router hostname, role, and management_ip are required' };
    }
    if (typeof r.reachable !== 'boolean') {
      return { ok: false, error: `router ${r.hostname} reachable must be boolean` };
    }
  }

  return { ok: true, snapshot: candidate as HomeNetworkSnapshot };
}

function isHomeNetworkStatus(value: unknown): value is HomeNetworkStatus {
  return value === 'ok' || value === 'warning' || value === 'error' || value === 'unknown';
}

export function validateSnapshotFreshForIngest(snapshot: HomeNetworkSnapshot, now = Date.now()): string | null {
  const collectedMs = Date.parse(snapshot.collected_at);
  if (Number.isNaN(collectedMs)) return 'collected_at must be valid';

  const futureSkewMs = DEFAULT_FUTURE_SKEW_SEC * 1000;
  if (collectedMs - now > futureSkewMs) {
    return 'snapshot collected_at is too far in the future';
  }

  const rejectAgeMs = getHomeNetworkIngestRejectAgeSec() * 1000;
  if (now - collectedMs > rejectAgeMs) {
    return 'snapshot is too old for ingest';
  }

  return null;
}

export function buildHomeNetworkReadResponse(
  snapshot: HomeNetworkSnapshot,
  history: HomeNetworkHistoryEntry[] = [],
  now = Date.now(),
): HomeNetworkReadResponse {
  const maxAgeSec = getHomeNetworkMaxAgeSec();
  const ageSec = Math.max(0, Math.floor((now - Date.parse(snapshot.collected_at)) / 1000));
  const { status, warnings } = computeHomeNetworkStatus(snapshot, ageSec, maxAgeSec);
  return {
    status,
    message: statusMessage(status, ageSec, warnings),
    checked_at: new Date(now).toISOString(),
    snapshot,
    history,
    age_sec: ageSec,
    max_age_sec: maxAgeSec,
    computed_warnings: warnings,
  };
}

export function computeHomeNetworkStatus(
  snapshot: HomeNetworkSnapshot,
  ageSec: number,
  maxAgeSec = getHomeNetworkMaxAgeSec(),
): { status: HomeNetworkStatus; warnings: string[] } {
  const warnings = new Set<string>(snapshot.warnings || []);
  let status: HomeNetworkStatus = snapshot.status === 'error' ? 'error' : snapshot.status === 'warning' ? 'warning' : 'ok';

  if (ageSec > maxAgeSec) {
    warnings.add(`Snapshot is stale: ${ageSec}s old`);
    if (status === 'ok') status = 'warning';
  }

  for (const router of snapshot.routers) {
    if (!router.reachable) {
      warnings.add(`${router.hostname} is unreachable`);
      status = 'error';
    }
    if (router.nextdns?.running === false) {
      warnings.add(`${router.hostname} NextDNS is down`);
      status = 'error';
    }
    if ((router.role === 'office' || router.role === 'school') && router.wan?.up === false) {
      warnings.add(`${router.hostname} uplink is down`);
      status = 'error';
    }
    if (router.role === 'main' && router.wan?.gateway === undefined && router.wan?.up === false) {
      warnings.add(`${router.hostname} default route/uplink is down`);
      status = 'error';
    }
    if (router.internet_ping?.ok === false) {
      warnings.add(`${router.hostname} internet ping failed`);
      status = 'error';
    } else if (
      router.internet_ping?.loss_percent !== undefined &&
      router.internet_ping.loss_percent > 0
    ) {
      warnings.add(`${router.hostname} internet packet loss ${router.internet_ping.loss_percent}%`);
      if (status === 'ok') status = 'warning';
    } else if (
      router.internet_ping?.avg_ms !== undefined &&
      router.internet_ping.avg_ms > HIGH_LATENCY_WARNING_MS
    ) {
      warnings.add(`${router.hostname} high internet latency ${Math.round(router.internet_ping.avg_ms)}ms`);
      if (status === 'ok') status = 'warning';
    }
  }

  for (const dns of snapshot.dns.routers) {
    if (dns.running === false) {
      warnings.add(`${dns.router_hostname} NextDNS is down`);
      status = 'error';
    }
    if (dns.test_ok === false) {
      warnings.add(`${dns.router_hostname} DNS test failed`);
      status = 'error';
    }
  }

  return { status, warnings: [...warnings] };
}

function statusMessage(status: HomeNetworkStatus, ageSec: number, warnings: string[]): string {
  if (status === 'unknown') return 'No snapshot data';
  if (status === 'error') return warnings[0] || 'Home network needs attention';
  if (status === 'warning') return warnings[0] || `Snapshot age ${ageSec}s`;
  return `All checks passing, snapshot age ${ageSec}s`;
}
