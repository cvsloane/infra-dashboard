/**
 * Prometheus API Client
 *
 * Queries Prometheus for PostgreSQL and PgBouncer metrics.
 * Used to display database health and connection pool status.
 */

const PROMETHEUS_URL = process.env.PROMETHEUS_URL;
const VPS_PRIMARY_INSTANCE = process.env.VPS_PRIMARY_INSTANCE;
const VPS_DATABASE_INSTANCE = process.env.VPS_DATABASE_INSTANCE;

// Types
export interface PrometheusResult {
  metric: Record<string, string>;
  value: [number, string]; // [timestamp, value]
}

export interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: Array<[number, string]>; // [[timestamp, value], ...]
}

export interface PrometheusQueryResponse {
  status: 'success' | 'error';
  data: {
    resultType: 'vector' | 'matrix' | 'scalar' | 'string';
    result: PrometheusResult[] | PrometheusRangeResult[];
  };
  errorType?: string;
  error?: string;
}

export interface PostgresHealth {
  up: boolean;
  connections: {
    active: number;
    idle: number;
    max: number;
  };
  databases: DatabaseHealth[];
}

export interface DatabaseHealth {
  name: string;
  size_bytes: number;
  connections: number;
  transactions_committed: number;
  transactions_rolled_back: number;
}

export interface PgBouncerHealth {
  up: boolean;
  pools: PoolHealth[];
  total_active: number;
  total_waiting: number;
}

export interface PoolHealth {
  database: string;
  user: string;
  active: number;
  waiting: number;
  server_active: number;
  server_idle: number;
  max_connections: number;
}

// API Client
class PrometheusApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'PrometheusApiError';
  }
}

function requirePrometheusUrl(): string {
  if (!PROMETHEUS_URL) {
    throw new PrometheusApiError('PROMETHEUS_URL is not configured', 500);
  }
  return PROMETHEUS_URL;
}

async function queryPrometheus(query: string): Promise<PrometheusResult[]> {
  const url = new URL('/api/v1/query', requirePrometheusUrl());
  url.searchParams.set('query', query);

  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new PrometheusApiError(
      `Prometheus query failed: ${response.status}`,
      response.status
    );
  }

  const data: PrometheusQueryResponse = await response.json();

  if (data.status !== 'success') {
    throw new PrometheusApiError(
      data.error || 'Prometheus query failed',
      500,
      data
    );
  }

  return data.data.result as PrometheusResult[];
}

async function queryPrometheusRange(
  query: string,
  start: Date,
  end: Date,
  step: string
): Promise<PrometheusRangeResult[]> {
  const url = new URL('/api/v1/query_range', requirePrometheusUrl());
  url.searchParams.set('query', query);
  url.searchParams.set('start', (start.getTime() / 1000).toString());
  url.searchParams.set('end', (end.getTime() / 1000).toString());
  url.searchParams.set('step', step);

  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new PrometheusApiError(
      `Prometheus range query failed: ${response.status}`,
      response.status
    );
  }

  const data: PrometheusQueryResponse = await response.json();

  if (data.status !== 'success') {
    throw new PrometheusApiError(
      data.error || 'Prometheus range query failed',
      500,
      data
    );
  }

  return data.data.result as PrometheusRangeResult[];
}

// Helper to get numeric value from result
function getValue(results: PrometheusResult[], defaultValue = 0): number {
  if (results.length === 0) return defaultValue;
  return parseFloat(results[0].value[1]) || defaultValue;
}

// Public API Functions

export async function getPostgresHealth(): Promise<PostgresHealth> {
  try {
    // Check if Postgres is up
    const upResult = await queryPrometheus('pg_up');
    const up = getValue(upResult) === 1;

    // Get PgBouncer connection counts (this is what apps actually use)
    // Fall back to direct Postgres stats if PgBouncer not available
    let activeConns = 0;
    let idleConns = 0;

    try {
      const pgbouncerActive = await queryPrometheus('sum(pgbouncer_pools_client_active_connections)');
      const pgbouncerWaiting = await queryPrometheus('sum(pgbouncer_pools_client_waiting_connections)');
      const pgbouncerServerIdle = await queryPrometheus('sum(pgbouncer_pools_server_idle_connections)');

      activeConns = getValue(pgbouncerActive);
      idleConns = getValue(pgbouncerServerIdle);

      // If PgBouncer has data, use it
      if (activeConns > 0 || idleConns > 0) {
        // PgBouncer metrics available
      } else {
        // Fall back to direct Postgres metrics
        const activeResult = await queryPrometheus('pg_stat_activity_count{state="active"}');
        const idleResult = await queryPrometheus('pg_stat_activity_count{state="idle"}');
        activeConns = getValue(activeResult);
        idleConns = getValue(idleResult);
      }
    } catch {
      // Fall back to direct Postgres metrics
      const activeResult = await queryPrometheus('pg_stat_activity_count{state="active"}');
      const idleResult = await queryPrometheus('pg_stat_activity_count{state="idle"}');
      activeConns = getValue(activeResult);
      idleConns = getValue(idleResult);
    }

    const maxResult = await queryPrometheus('pg_settings_max_connections');

    // Get per-database stats
    const dbSizeResult = await queryPrometheus('pg_database_size_bytes');
    const dbConnResult = await queryPrometheus('pg_stat_database_numbackends');

    // Build database list
    const databases: DatabaseHealth[] = [];
    const seenDbs = new Set<string>();

    for (const result of dbSizeResult) {
      const dbName = result.metric.datname;
      if (dbName && !seenDbs.has(dbName) && !['template0', 'template1'].includes(dbName)) {
        seenDbs.add(dbName);

        // Find connection count for this DB
        const connResult = dbConnResult.find(r => r.metric.datname === dbName);

        databases.push({
          name: dbName,
          size_bytes: parseFloat(result.value[1]) || 0,
          connections: connResult ? parseFloat(connResult.value[1]) : 0,
          transactions_committed: 0,
          transactions_rolled_back: 0,
        });
      }
    }

    return {
      up,
      connections: {
        active: activeConns,
        idle: idleConns,
        max: getValue(maxResult, 100),
      },
      databases,
    };
  } catch (error) {
    console.error('Failed to get Postgres health:', error);
    return {
      up: false,
      connections: { active: 0, idle: 0, max: 100 },
      databases: [],
    };
  }
}

export async function getPgBouncerHealth(): Promise<PgBouncerHealth> {
  try {
    // Check if PgBouncer exporter is up
    const upResult = await queryPrometheus('pgbouncer_up');
    const up = getValue(upResult) === 1;

    // Get pool stats
    const activeResult = await queryPrometheus('pgbouncer_pools_client_active_connections');
    const waitingResult = await queryPrometheus('pgbouncer_pools_client_waiting_connections');
    const serverActiveResult = await queryPrometheus('pgbouncer_pools_server_active_connections');
    const serverIdleResult = await queryPrometheus('pgbouncer_pools_server_idle_connections');

    // Build pool list
    const pools: PoolHealth[] = [];
    let totalActive = 0;
    let totalWaiting = 0;

    for (const result of activeResult) {
      const database = result.metric.database || 'unknown';
      const user = result.metric.user || 'unknown';
      const active = parseFloat(result.value[1]) || 0;

      // Find matching metrics
      const waiting = waitingResult.find(
        r => r.metric.database === database && r.metric.user === user
      );
      const serverActive = serverActiveResult.find(
        r => r.metric.database === database && r.metric.user === user
      );
      const serverIdle = serverIdleResult.find(
        r => r.metric.database === database && r.metric.user === user
      );

      totalActive += active;
      totalWaiting += waiting ? parseFloat(waiting.value[1]) : 0;

      pools.push({
        database,
        user,
        active,
        waiting: waiting ? parseFloat(waiting.value[1]) : 0,
        server_active: serverActive ? parseFloat(serverActive.value[1]) : 0,
        server_idle: serverIdle ? parseFloat(serverIdle.value[1]) : 0,
        max_connections: 100, // Default, could be queried from config
      });
    }

    return {
      up,
      pools,
      total_active: totalActive,
      total_waiting: totalWaiting,
    };
  } catch (error) {
    console.error('Failed to get PgBouncer health:', error);
    return {
      up: false,
      pools: [],
      total_active: 0,
      total_waiting: 0,
    };
  }
}

export async function getConnectionHistory(hours = 1): Promise<{ time: Date; connections: number }[]> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const step = hours <= 1 ? '1m' : '5m';

  try {
    const results = await queryPrometheusRange(
      'sum(pg_stat_activity_count)',
      start,
      end,
      step
    );

    if (results.length === 0) return [];

    return results[0].values.map(([timestamp, value]) => ({
      time: new Date(timestamp * 1000),
      connections: parseFloat(value) || 0,
    }));
  } catch (error) {
    console.error('Failed to get connection history:', error);
    return [];
  }
}

// Health check - tests connectivity to Prometheus
export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    await queryPrometheus('up');
    return { ok: true, message: 'Connected to Prometheus' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Prometheus',
    };
  }
}

// VPS System Metrics (requires node_exporter)
export interface VPSMetrics {
  hostname: string;
  cpu: {
    usagePercent: number;
    cores: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
    usedPercent: number;
  };
  disk: {
    totalBytes: number;
    availableBytes: number;
    usedPercent: number;
    mountPoint: string;
  };
  load: {
    load1: number;
    load5: number;
    load15: number;
  };
  uptime: number;
}

export async function getVPSMetrics(instance: string): Promise<VPSMetrics | null> {
  try {
    // CPU usage (100 - idle percentage)
    const cpuIdle = await queryPrometheus(
      `100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle",instance="${instance}"}[5m])) * 100)`
    );

    // CPU cores
    const cpuCores = await queryPrometheus(
      `count(node_cpu_seconds_total{mode="idle",instance="${instance}"}) by (instance)`
    );

    // Memory
    const memTotal = await queryPrometheus(`node_memory_MemTotal_bytes{instance="${instance}"}`);
    const memAvailable = await queryPrometheus(`node_memory_MemAvailable_bytes{instance="${instance}"}`);

    // Disk (root filesystem)
    const diskTotal = await queryPrometheus(
      `node_filesystem_size_bytes{instance="${instance}",mountpoint="/",fstype!="rootfs"}`
    );
    const diskAvailable = await queryPrometheus(
      `node_filesystem_avail_bytes{instance="${instance}",mountpoint="/",fstype!="rootfs"}`
    );

    // Load average
    const load1 = await queryPrometheus(`node_load1{instance="${instance}"}`);
    const load5 = await queryPrometheus(`node_load5{instance="${instance}"}`);
    const load15 = await queryPrometheus(`node_load15{instance="${instance}"}`);

    // Uptime
    const bootTime = await queryPrometheus(`node_boot_time_seconds{instance="${instance}"}`);

    const totalMem = getValue(memTotal);
    const availMem = getValue(memAvailable);
    const totalDisk = getValue(diskTotal);
    const availDisk = getValue(diskAvailable);

    return {
      hostname: instance.split(':')[0],
      cpu: {
        usagePercent: Math.round(getValue(cpuIdle) * 10) / 10,
        cores: getValue(cpuCores),
      },
      memory: {
        totalBytes: totalMem,
        availableBytes: availMem,
        usedPercent: totalMem > 0 ? Math.round((1 - availMem / totalMem) * 1000) / 10 : 0,
      },
      disk: {
        totalBytes: totalDisk,
        availableBytes: availDisk,
        usedPercent: totalDisk > 0 ? Math.round((1 - availDisk / totalDisk) * 1000) / 10 : 0,
        mountPoint: '/',
      },
      load: {
        load1: getValue(load1),
        load5: getValue(load5),
        load15: getValue(load15),
      },
      uptime: Date.now() / 1000 - getValue(bootTime),
    };
  } catch (error) {
    console.error(`Failed to get VPS metrics for ${instance}:`, error);
    return null;
  }
}

export async function getAllVPSMetrics(): Promise<{ appsVps: VPSMetrics | null; dbVps: VPSMetrics | null }> {
  const [appsVps, dbVps] = await Promise.all([
    VPS_PRIMARY_INSTANCE ? getVPSMetrics(VPS_PRIMARY_INSTANCE) : Promise.resolve(null),
    VPS_DATABASE_INSTANCE ? getVPSMetrics(VPS_DATABASE_INSTANCE) : Promise.resolve(null),
  ]);

  return { appsVps, dbVps };
}
