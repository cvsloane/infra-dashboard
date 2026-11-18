import type { DashboardUpdate } from '@/hooks/useSSE';
import { formatDurationLong } from '@/lib/format';
import type { DeploymentRecordClient } from '@/types/deployments';

export interface ServiceRow {
  id: string;
  name: string;
  kind: string;
  status: 'affected' | 'degraded' | 'unknown' | 'healthy';
  summary: string;
  observedAt: string | null;
  href: string;
  action: string;
  facts: { label: string; value: string }[];
  events: { at: string; label: string; detail?: string; href?: string }[];
}

function timestamp(value?: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberLabel(value: number | undefined | null, suffix = ''): string {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value) ? `${value}${suffix}` : 'Unavailable';
}

function duration(value?: number | null): string {
  return value != null && Number.isFinite(value) && value >= 0 ? formatDurationLong(value) : 'Unavailable';
}

function unavailable(
  id: string, name: string, kind: string, summary: string, href: string, action: string,
): ServiceRow {
  return { id, name, kind, summary, href, action, status: 'unknown', observedAt: null, facts: [], events: [] };
}

function alertRows(alerts: DashboardUpdate['alerts']): ServiceRow[] {
  const info = { name: 'Alertmanager', kind: 'Monitoring', href: '/alerts', action: 'Open Alerts' };
  if (!alerts || alerts.status === 'unknown') {
    return [unavailable('alerting', info.name, info.kind, 'Alert status is unavailable.', info.href, info.action)];
  }

  const observedAt = timestamp(alerts.fetchedAt);
  const firing = alerts.alerts.filter((alert) => alert.state === 'firing');
  const rows = firing.map<ServiceRow>((alert) => {
    const startedAt = timestamp(alert.startsAt);
    const labels = Object.entries(alert.labels ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return {
      id: `alert:${alert.fingerprint ?? JSON.stringify([alert.name, startedAt, labels])}`,
      name: alert.name, kind: 'Firing alert',
      status: alert.severity === 'critical' ? 'affected' : 'degraded',
      summary: alert.summary || alert.description || `A ${alert.severity} alert is firing.`,
      observedAt, href: info.href, action: info.action,
      facts: [
        { label: 'Severity', value: alert.severity },
        ...labels.filter(([label]) => !['alertname', 'severity', 'level'].includes(label))
          .slice(0, 6).map(([label, value]) => ({ label, value })),
      ],
      events: startedAt ? [{ at: startedAt, label: 'Alert started', detail: alert.name }] : [],
    };
  });

  if (rows.length < alerts.firing || alerts.firing === 0) {
    rows.push({
      id: 'alerting', ...info, observedAt,
      status: rows.length < alerts.firing || alerts.status === 'error' ? 'unknown' : 'healthy',
      summary: alerts.firing > 0 ? `${rows.length} of ${alerts.firing} firing alerts shown here.`
        : alerts.status === 'error' ? 'Alert status is unavailable.' : 'No firing alerts in the latest reading.',
      facts: [{ label: 'Suppressed at last check', value: String(alerts.suppressed) }], events: [],
    });
  }

  return rows;
}

function deploymentEvent(deployment: DeploymentRecordClient): ServiceRow['events'][number] | null {
  const at = timestamp(deployment.finishedAt ?? deployment.updatedAt ?? deployment.createdAt);
  if (at === null) return null;

  return {
    at,
    label: `Deployment ${deployment.status.replace(/[-_]/g, ' ')}`,
    detail: deployment.commit ? `${deployment.applicationName} · ${deployment.commit.slice(0, 8)}` : deployment.applicationName,
    href: `/coolify/${encodeURIComponent(deployment.uuid)}`,
  };
}

function deploymentEvents(deployments: DeploymentRecordClient[]): ServiceRow['events'] {
  return Array.from(new Map(deployments.map((deployment) => [deployment.uuid, deployment])).values())
    .map(deploymentEvent).filter((event) => event !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

function deploymentRow(data: DashboardUpdate, observedAt: string | null): ServiceRow {
  const source = data.deployments;
  const base = unavailable('deployments', 'Coolify deployments', 'Changes', 'Deployment history is unavailable.', '/coolify', 'Open Deployments');
  if (!source || source.available === false) return base;

  const recentFailed = source.recent.filter((record) => record.status === 'failed').length;
  const known = source.available || !!source.buildTopology || source.recent.length + source.active.length > 0;
  if (!known) return base;

  return {
    ...base, status: recentFailed > 0 ? 'degraded' : 'healthy', observedAt,
    summary: recentFailed > 0 ? `${recentFailed} failed in the recent deployment list.`
      : source.active.length > 0 ? `${source.active.length} deployments queued or running.`
        : 'No active deployment or recent release failure was reported.',
    facts: [
      { label: 'Active deployments', value: String(source.active.length) },
      { label: 'Recent list', value: 'Up to 20 completed deployments updated in the last 30 min' },
    ],
    events: deploymentEvents([...source.active, ...source.recent]).slice(0, 8),
  };
}

function siteRows(data: DashboardUpdate, observedAt: string | null): ServiceRow[] {
  const coverage = unavailable('site-coverage', 'Site monitoring coverage', 'Monitoring', 'Site observations are unavailable.', '/servers', 'Open Site Health');
  const source = data.sites;
  if (!source || source.available === false) return [coverage];

  const eligibleCount = source.eligibleCount;
  const scope = eligibleCount == null
    ? `${source.sites.length} site checks reported`
    : `${source.sites.length} of ${eligibleCount} eligible sites checked`;
  const active = data.deployments?.available === false ? [] : (
    [...(data.deployments?.active ?? []), ...(data.deployments?.recent ?? [])]
  );
  const rows = source.sites.map<ServiceRow>((site) => {
    const certificateWarning = site.sslValid === false ||
      (site.sslDaysRemaining !== undefined && source.sslExpiryWarnDays !== undefined &&
       site.sslDaysRemaining <= source.sslExpiryWarnDays);
    const status = site.status === 'down' ? 'affected' : site.status === 'unknown' ? 'unknown'
      : site.status === 'degraded' || certificateWarning ? 'degraded' : 'healthy';
    return {
      id: `site:${site.applicationUuid ?? site.fqdn}`,
      name: site.name, kind: 'Site', status,
      summary: site.error || (site.httpStatus != null
        ? `Latest HTTP probe returned ${site.httpStatus}.`
        : 'No HTTP result was reported.'),
      observedAt: timestamp(site.lastChecked),
      href: coverage.href, action: coverage.action,
      facts: [
        { label: 'Monitored address', value: site.fqdn },
        { label: 'Latest probe time', value: numberLabel(site.responseTimeMs, ' ms') },
        { label: 'Certificate', value: site.sslValid === false ? 'Invalid'
          : site.sslDaysRemaining === undefined ? 'Expiry unavailable' : `${site.sslDaysRemaining}d until expiry` },
        { label: 'Coverage', value: scope },
      ],
      events: site.applicationUuid
        ? deploymentEvents(active.filter((record) => record.applicationPublicUuid === site.applicationUuid)).slice(0, 5) : [],
    };
  });

  if (eligibleCount == null || eligibleCount > source.sites.length || source.sites.length === 0) {
    rows.push({
      ...coverage,
      summary: source.sites.length === 0 && eligibleCount !== 0
        ? 'No site observations were returned.'
        : eligibleCount === 0 ? 'No sites are configured for this check.' : `${scope}.`,
      observedAt: eligibleCount !== undefined || source.sites.length > 0 ? observedAt : null,
      facts: [{ label: 'Probe scope', value: 'Point-in-time HTTP and certificate checks' }],
    });
  }

  return rows;
}

function queueRows(data: DashboardUpdate, observedAt: string | null): ServiceRow[] {
  const href = '/queues';
  const action = 'Open Queues';
  if (!data.queues || data.queuesAvailable === false || (data.queues.length === 0 && !data.queuesAvailable)) {
    return [unavailable('queue-coverage', 'Queue monitoring', 'Monitoring', 'Queue observations are unavailable.', href, action)];
  }

  return data.queues.map((queue): ServiceRow => {
    const worker = queue.workerState || (queue.workerActive === false ? 'down' : 'unknown');
    const hasWork = queue.waiting > 0 || queue.active > 0;
    const failedRecently = queue.failuresPerMin != null && queue.failuresPerMin > 0;
    const affected = worker === 'down' && hasWork;
    const paused = queue.isPaused === true;
    const status = affected ? 'affected' : paused || failedRecently ? 'degraded'
      : worker === 'unknown' || worker === 'down' ? 'unknown' : 'healthy';
    const waiting = `${queue.waiting} waiting · ${queue.active} active`;
    return {
      id: `queue:${queue.name}`, name: queue.name, kind: 'Queue', status, observedAt, href, action,
      summary: affected ? `Worker down with runnable jobs. ${waiting}.`
        : paused ? `Queue paused. ${waiting}.`
        : failedRecently ? `Recent job failures reported. ${waiting}.`
        : status === 'unknown' ? `Worker status unconfirmed. ${waiting}.`
        : `${waiting}.`,
      facts: [
        { label: 'Worker evidence', value: queue.workerStateReason || worker },
        { label: 'Oldest waiting job', value: queue.waiting === 0 ? 'No waiting jobs' : duration(queue.oldestWaitingAgeSec) },
        { label: 'Completions per minute', value: numberLabel(queue.jobsPerMin) },
        { label: 'Recent failures per minute', value: numberLabel(queue.failuresPerMin) },
        { label: 'Retained failed jobs', value: String(queue.failed) },
        { label: 'Paused jobs', value: String(queue.paused) },
      ],
      events: [],
    };
  });
}

function backupStatus(status?: string): ServiceRow['status'] {
  if (status === 'error') return 'affected';
  if (status === 'warning') return 'degraded';
  return status === 'ok' ? 'healthy' : 'unknown';
}

function recoveryRow(source: DashboardUpdate['backups'], observedAt: string | null): ServiceRow {
  const base = unavailable('recovery', 'Database recovery', 'Backups', 'Backup and restore evidence is unavailable.', '/backups', 'Open Backups');
  if (!source) return base;

  const offsite = source.offsiteRestore;
  const checks = [
    source.logical?.status,
    source.restoreDrill?.status,
    offsite?.status,
    ...['apps-vps', 'db-vps'].map((host) => source.restic?.find((backup) => backup.host === host)?.status),
  ].map(backupStatus);
  const status = checks.includes('affected') ? 'affected' : checks.includes('degraded') ? 'degraded'
    : checks.includes('unknown') ? 'unknown' : 'healthy';
  const lastSuccess = timestamp(offsite?.lastSuccessAt);
  const lastRun = timestamp(offsite?.lastRunAt);
  const events: ServiceRow['events'] = [];
  if (lastRun && lastRun !== lastSuccess) events.push({ at: lastRun, label: 'Offsite restore check ran' });
  if (lastSuccess) events.push({ at: lastSuccess, label: 'Offsite restore check succeeded' });

  return {
    ...base, status, observedAt,
    summary: status === 'affected' ? 'A required backup or restore check failed or is overdue.'
      : status === 'degraded' ? 'A required recovery check is approaching its freshness limit.'
      : status === 'unknown' ? 'One or more required recovery checks have missing evidence.'
      : 'The logical snapshot and required restore and backup checks are current.',
    facts: [
      { label: 'Latest logical snapshot', value: duration(source.logical?.ageSec) },
      { label: 'Database restore drill', value: duration(source.restoreDrill?.ageSec) },
      { label: 'Offsite restore evidence', value: lastSuccess ? `Last success ${lastSuccess.slice(0, 10)} UTC` : 'Unavailable' },
      ...['apps-vps', 'db-vps'].map((host) => ({
        label: `${host} Restic backup`,
        value: duration(source.restic?.find((backup) => backup.host === host)?.lastSuccessAgeSec),
      })),
      { label: 'Observed standby lag', value: numberLabel(source.standbyLagSeconds, ' s') },
    ],
    events: events.sort((a, b) => b.at.localeCompare(a.at)),
  };
}

function sourceHealthRows(data: DashboardUpdate, observedAt: string | null): ServiceRow[] {
  const probes = [
    { id: 'coolify', name: 'Coolify API', scope: 'Project-list request', href: '/coolify', action: 'Open Deployments' },
    { id: 'prometheus', name: 'Prometheus', scope: 'Prometheus query request', href: '/servers', action: 'Open Servers' },
    { id: 'redis', name: 'Redis', scope: 'Redis PING request', href: '/queues', action: 'Open Queues' },
  ] as const;

  return probes.map(({ id, name, scope, href, action }) => {
    const report = data.health?.[id];
    return {
      id: `source:${id}`, name, kind: 'Source connectivity', href, action, observedAt: report ? observedAt : null,
      status: report?.ok ? 'healthy' : 'unknown',
      summary: !report ? 'There is no reading for this connectivity check.'
        : report.ok ? 'The dashboard’s connectivity check succeeded.' : 'The dashboard’s connectivity check failed.',
      facts: [{ label: 'Check scope', value: scope }], events: [],
    };
  });
}

type HostReading = NonNullable<NonNullable<DashboardUpdate['vps']>['appsVps']>;

function observedCapacity(reading: HostReading['memory'] | HostReading['disk']): boolean {
  return (reading.availableObserved ?? reading.availableBytes > 0)
    && Number.isFinite(reading.availableBytes) && reading.availableBytes >= 0
    && Number.isFinite(reading.totalBytes) && reading.totalBytes > 0
    && reading.availableBytes <= reading.totalBytes;
}

function gibibytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function hostCapacityRow(host: HostReading | null | undefined, id: string, name: string): ServiceRow {
  const base = unavailable(id, name, 'Capacity', 'Host capacity observations are unavailable.', '/servers', 'Open Servers');
  if (!host) return base;

  const observedAt = timestamp(host.observedAt);
  const stale = host.metricsAgeSeconds != null && host.metricsAgeSeconds > 120;
  const memory = observedCapacity(host.memory);
  const disk = observedCapacity(host.disk);
  // Match the existing VPS card’s high-usage boundary.
  const low = (memory && host.memory.usedPercent >= 80) || (disk && host.disk.usedPercent >= 80);
  const status = !observedAt || stale || !memory || !disk ? 'unknown' : low ? 'degraded' : 'healthy';
  return {
    ...base, status, observedAt,
    summary: !observedAt ? 'The host scrape time is unavailable.'
      : stale ? 'These host readings are stale.'
      : !memory || !disk ? 'One or more capacity observations are missing.'
      : low ? 'Root filesystem or memory usage reached 80% in the latest reading.'
      : 'Root filesystem and host memory headroom are available.',
    facts: [
      { label: 'Host', value: host.hostname },
      { label: 'Available space on /', value: disk ? gibibytes(host.disk.availableBytes) : 'Unavailable' },
      { label: 'Available host memory', value: memory ? gibibytes(host.memory.availableBytes) : 'Unavailable' },
      { label: 'Scrape age at collection', value: duration(host.metricsAgeSeconds) },
    ],
  };
}

export function buildServiceRows(update: DashboardUpdate): ServiceRow[] {
  if (update.type !== 'update') return [];
  const observedAt = timestamp(update.timestamp);
  return [
    ...alertRows(update.alerts),
    ...siteRows(update, observedAt),
    ...queueRows(update, observedAt),
    deploymentRow(update, observedAt),
    recoveryRow(update.backups, observedAt),
    hostCapacityRow(update.vps?.appsVps, 'capacity:apps', 'App server capacity'),
    hostCapacityRow(update.vps?.dbVps, 'capacity:db', 'Database server capacity'),
    ...sourceHealthRows(update, observedAt),
  ];
}
