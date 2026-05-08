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
  const { status, warnings, monitoringWarnings } = computeHomeNetworkStatus(snapshot, ageSec, maxAgeSec);
  return {
    status,
    message: statusMessage(status, ageSec, warnings),
    checked_at: new Date(now).toISOString(),
    snapshot,
    history,
    age_sec: ageSec,
    max_age_sec: maxAgeSec,
    computed_warnings: warnings,
    computed_monitoring_warnings: monitoringWarnings,
  };
}

export function computeHomeNetworkStatus(
  snapshot: HomeNetworkSnapshot,
  ageSec: number,
  maxAgeSec = getHomeNetworkMaxAgeSec(),
): { status: HomeNetworkStatus; warnings: string[]; monitoringWarnings: string[] } {
  const snapshotWarnings = snapshot.warnings || [];
  const monitoringWarnings = new Set<string>(snapshot.monitoring_warnings || []);
  const healthWarnings = snapshotWarnings.filter((warning) => {
    if (isSecondarySyslogWarning(warning) && hasRouterEventSummaries(snapshot)) {
      monitoringWarnings.add(warning);
      return false;
    }
    return true;
  });
  const warnings = new Set<string>(healthWarnings);
  let status: HomeNetworkStatus =
    snapshot.status === 'error'
      ? 'error'
      : snapshot.status === 'warning' && healthWarnings.length > 0
        ? 'warning'
        : 'ok';

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

  for (const laptop of snapshot.windows_laptops || []) {
    if (!laptop.reachable) {
      warnings.add(`${laptop.label} is unreachable over SSH`);
      if (status === 'ok') status = 'warning';
    }
    if (laptop.openssh?.service_status && laptop.openssh.service_status !== 'Running') {
      warnings.add(`${laptop.label} sshd is ${laptop.openssh.service_status}`);
      if (status === 'ok') status = 'warning';
    }
    if (laptop.openssh?.start_type && laptop.openssh.start_type !== 'Automatic') {
      warnings.add(`${laptop.label} sshd is not Automatic`);
      if (status === 'ok') status = 'warning';
    }
    if (laptop.security?.norton_360_present) {
      warnings.add(`${laptop.label} still has Norton 360/Norton Antivirus present`);
      if (status === 'ok') status = 'warning';
    }
    if (laptop.security?.norton_family_present === false) {
      warnings.add(`${laptop.label} Norton Family missing`);
      if (status === 'ok') status = 'warning';
    }
    if (laptop.security?.defender_realtime === false) {
      warnings.add(`${laptop.label} Defender real-time protection is off`);
      if (status === 'ok') status = 'warning';
    }
  }

  return { status, warnings: [...warnings], monitoringWarnings: [...monitoringWarnings] };
}

export function makeHomeNetworkHistoryEntry(snapshot: HomeNetworkSnapshot): HomeNetworkHistoryEntry {
  return {
    collected_at: snapshot.collected_at,
    status: snapshot.status,
    router_count: snapshot.routers.length,
    client_count: snapshot.clients.length,
    warning_count: snapshot.warnings.length,
    unreachable_router_count: snapshot.routers.filter((router) => !router.reachable).length,
    weak_signal_count: snapshot.client_summary?.weak_signal,
    very_weak_signal_count: snapshot.client_summary?.very_weak_signal,
    multi_ap_mac_count: snapshot.client_summary?.multi_ap_mac_count,
    duplicate_hostname_count: snapshot.client_summary?.duplicate_hostname_count,
  };
}

function isSecondarySyslogWarning(warning: string): boolean {
  return /^flint-[\w-]+\.log is (stale|missing)/.test(warning);
}

function hasRouterEventSummaries(snapshot: HomeNetworkSnapshot): boolean {
  return snapshot.routers.every((router) => (router.event_summary?.sample_size ?? 0) > 0);
}

function statusMessage(status: HomeNetworkStatus, ageSec: number, warnings: string[]): string {
  if (status === 'unknown') return 'No snapshot data';
  if (status === 'error') return warnings[0] || 'Home network needs attention';
  if (status === 'warning') return warnings[0] || `Snapshot age ${ageSec}s`;
  return `All checks passing, snapshot age ${ageSec}s`;
}
