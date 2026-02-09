/**
 * Alertmanager API Client
 *
 * Fetches active alerts from Alertmanager.
 * Used to surface firing/suppressed alerts in infra-dashboard (server-side only).
 */

const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL;

export type AlertHealthStatus = 'ok' | 'warning' | 'error' | 'unknown';
export type AlertSeverity = 'critical' | 'warning' | 'info' | 'unknown';
export type AlertState = 'firing' | 'suppressed' | 'unknown';

export interface AlertmanagerApiAlert {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
  endsAt?: string;
  generatorURL?: string;
  fingerprint?: string;
  status?: {
    state?: string;
    silencedBy?: string[];
    inhibitedBy?: string[];
  };
}

export interface NormalizedAlert {
  fingerprint?: string;
  name: string;
  severity: AlertSeverity;
  state: AlertState;
  startsAt?: string;
  endsAt?: string;
  summary?: string;
  description?: string;
  generatorURL?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  silencedBy: string[];
  inhibitedBy: string[];
}

export interface AlertmanagerSummary {
  status: AlertHealthStatus;
  message: string;
  fetchedAt: string;
  total: number;
  firing: number;
  suppressed: number;
  bySeverity: Record<AlertSeverity, number>;
  alerts: NormalizedAlert[];
}

class AlertmanagerApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'AlertmanagerApiError';
  }
}

function requireAlertmanagerUrl(): string {
  if (!ALERTMANAGER_URL) {
    throw new AlertmanagerApiError('ALERTMANAGER_URL is not configured', 500);
  }
  return ALERTMANAGER_URL;
}

async function fetchAlertmanager<T>(endpoint: string): Promise<T> {
  const url = new URL(endpoint, requireAlertmanagerUrl());

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AlertmanagerApiError(
      `Alertmanager request failed: ${response.status} ${response.statusText}`,
      response.status,
      text
    );
  }

  return (await response.json()) as T;
}

function normalizeSeverity(raw?: string | null): AlertSeverity {
  const v = (raw || '').toLowerCase().trim();
  if (!v) return 'unknown';

  // Common conventions across Prometheus rules.
  if (['crit', 'critical', 'page', 'p1', 'sev1', 'severity1'].includes(v)) return 'critical';
  if (['warn', 'warning', 'p2', 'sev2', 'severity2'].includes(v)) return 'warning';
  if (['info', 'informational', 'p3', 'sev3', 'severity3'].includes(v)) return 'info';

  return 'unknown';
}

function normalizeState(raw?: string | null): AlertState {
  const v = (raw || '').toLowerCase().trim();
  if (!v) return 'unknown';
  if (v === 'active') return 'firing';
  if (v === 'suppressed') return 'suppressed';
  return 'unknown';
}

function severityRank(s: AlertSeverity): number {
  switch (s) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    case 'unknown':
    default:
      return 0;
  }
}

export async function getAlertmanagerSummary(options?: { limit?: number }): Promise<AlertmanagerSummary> {
  const fetchedAt = new Date().toISOString();

  if (!ALERTMANAGER_URL) {
    return {
      status: 'unknown',
      message: 'Alertmanager is not configured',
      fetchedAt,
      total: 0,
      firing: 0,
      suppressed: 0,
      bySeverity: { critical: 0, warning: 0, info: 0, unknown: 0 },
      alerts: [],
    };
  }

  const limit = options?.limit ?? 50;

  const rawAlerts = await fetchAlertmanager<AlertmanagerApiAlert[]>('/api/v2/alerts');

  const alerts: NormalizedAlert[] = (rawAlerts || []).map((a) => {
    const labels = a.labels || {};
    const annotations = a.annotations || {};

    const name = labels.alertname || labels.alert || 'UnknownAlert';
    const severity = normalizeSeverity(labels.severity || labels.level);
    const state = normalizeState(a.status?.state);

    return {
      fingerprint: a.fingerprint,
      name,
      severity,
      state,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      summary: annotations.summary,
      description: annotations.description,
      generatorURL: a.generatorURL,
      labels,
      annotations,
      silencedBy: a.status?.silencedBy || [],
      inhibitedBy: a.status?.inhibitedBy || [],
    };
  });

  // Sort: firing first, then by severity, then newest first.
  alerts.sort((a, b) => {
    const stateRank = (s: AlertState) => (s === 'firing' ? 2 : s === 'suppressed' ? 1 : 0);
    const sr = stateRank(b.state) - stateRank(a.state);
    if (sr !== 0) return sr;

    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;

    const aStart = a.startsAt ? Date.parse(a.startsAt) : 0;
    const bStart = b.startsAt ? Date.parse(b.startsAt) : 0;
    return bStart - aStart;
  });

  const firingAlerts = alerts.filter((a) => a.state === 'firing');
  const suppressedAlerts = alerts.filter((a) => a.state === 'suppressed');

  const bySeverity: Record<AlertSeverity, number> = { critical: 0, warning: 0, info: 0, unknown: 0 };
  for (const a of firingAlerts) bySeverity[a.severity] += 1;

  const status: AlertHealthStatus =
    bySeverity.critical > 0
      ? 'error'
      : bySeverity.warning > 0 || bySeverity.unknown > 0
      ? 'warning'
      : 'ok';

  let message = 'No firing alerts';
  if (firingAlerts.length > 0) {
    const parts: string[] = [];
    if (bySeverity.critical) parts.push(`${bySeverity.critical} critical`);
    if (bySeverity.warning) parts.push(`${bySeverity.warning} warning`);
    if (bySeverity.info) parts.push(`${bySeverity.info} info`);
    if (bySeverity.unknown) parts.push(`${bySeverity.unknown} unknown`);
    message = `${firingAlerts.length} firing${parts.length ? ` (${parts.join(', ')})` : ''}`;
  } else if (suppressedAlerts.length > 0) {
    message = `${suppressedAlerts.length} suppressed`;
  }

  return {
    status,
    message,
    fetchedAt,
    total: alerts.length,
    firing: firingAlerts.length,
    suppressed: suppressedAlerts.length,
    bySeverity,
    alerts: alerts.slice(0, Math.max(0, limit)),
  };
}

export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  if (!ALERTMANAGER_URL) return { ok: false, message: 'ALERTMANAGER_URL is not configured' };
  try {
    await fetchAlertmanager('/api/v2/status');
    return { ok: true, message: 'Connected to Alertmanager' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Alertmanager',
    };
  }
}

