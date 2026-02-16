import 'server-only';

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

type BullmqOp =
  | 'discover_queues'
  | 'get_queue_stats'
  | 'get_all_queue_stats'
  | 'get_failed_jobs'
  | 'get_job_details'
  | 'retry_job'
  | 'delete_job'
  | 'retry_all_failed'
  | 'delete_all_failed'
  | 'health_check';

type Result = 'ok' | 'error';
type UptimeResult = 'ok' | 'non_ok' | 'error';

type InfraDashboardMetrics = {
  registry: Registry;

  bullmqOpDurationSeconds: Histogram<'op' | 'result'>;
  bullmqOpTotal: Counter<'op' | 'result'>;
  bullmqDiscoveredQueues: Gauge;

  uptimeKumaMetricsFetchDurationSeconds: Histogram<'result'>;
  uptimeKumaMetricsFetchTotal: Counter<'result'>;
};

declare global {
  var __infraDashboardMetrics: InfraDashboardMetrics | undefined;
}

function initMetrics(): InfraDashboardMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: 'infra-dashboard' });

  collectDefaultMetrics({ register: registry });

  const bullmqOpDurationSeconds = new Histogram({
    name: 'infra_dashboard_bullmq_op_duration_seconds',
    help: 'Latency of BullMQ/Redis inspection operations performed by infra-dashboard.',
    labelNames: ['op', 'result'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const bullmqOpTotal = new Counter({
    name: 'infra_dashboard_bullmq_op_total',
    help: 'Count of BullMQ/Redis inspection operations performed by infra-dashboard.',
    labelNames: ['op', 'result'] as const,
    registers: [registry],
  });

  const bullmqDiscoveredQueues = new Gauge({
    name: 'infra_dashboard_bullmq_discovered_queues',
    help: 'Number of BullMQ queues discovered in Redis via SCAN.',
    registers: [registry],
  });

  const uptimeKumaMetricsFetchDurationSeconds = new Histogram({
    name: 'infra_dashboard_uptime_kuma_metrics_fetch_duration_seconds',
    help: 'Latency of fetching Uptime Kuma /metrics (if configured).',
    labelNames: ['result'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const uptimeKumaMetricsFetchTotal = new Counter({
    name: 'infra_dashboard_uptime_kuma_metrics_fetch_total',
    help: 'Count of attempts to fetch Uptime Kuma /metrics (if configured).',
    labelNames: ['result'] as const,
    registers: [registry],
  });

  return {
    registry,

    bullmqOpDurationSeconds,
    bullmqOpTotal,
    bullmqDiscoveredQueues,

    uptimeKumaMetricsFetchDurationSeconds,
    uptimeKumaMetricsFetchTotal,
  };
}

export const metrics: InfraDashboardMetrics =
  globalThis.__infraDashboardMetrics ?? initMetrics();

if (!globalThis.__infraDashboardMetrics) {
  globalThis.__infraDashboardMetrics = metrics;
}

export const registry = metrics.registry;

export function recordBullmqOp(
  op: BullmqOp,
  result: Result,
  durationSeconds: number
): void {
  metrics.bullmqOpDurationSeconds.observe({ op, result }, durationSeconds);
  metrics.bullmqOpTotal.inc({ op, result });
}

export function recordUptimeKumaMetricsFetch(
  result: UptimeResult,
  durationSeconds: number
): void {
  metrics.uptimeKumaMetricsFetchDurationSeconds.observe({ result }, durationSeconds);
  metrics.uptimeKumaMetricsFetchTotal.inc({ result });
}
