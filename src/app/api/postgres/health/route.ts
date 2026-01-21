import { NextResponse } from 'next/server';
import { getPostgresHealth, getPgBouncerHealth, getConnectionHistory } from '@/lib/prometheus/client';
import { isAuthenticatedFromRequest } from '@/lib/auth';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const includeHistory = url.searchParams.get('history') === 'true';
    const historyHours = parseInt(url.searchParams.get('hours') || '1', 10);

    const [postgres, pgbouncer, history] = await Promise.all([
      getPostgresHealth(),
      getPgBouncerHealth(),
      includeHistory ? getConnectionHistory(historyHours) : Promise.resolve([]),
    ]);

    // Calculate aggregated pgbouncer stats
    const pgbouncerServerActive = pgbouncer.pools.reduce((sum, p) => sum + p.server_active, 0);
    const pgbouncerServerIdle = pgbouncer.pools.reduce((sum, p) => sum + p.server_idle, 0);

    // Determine status and message
    const prometheusConfigured = Boolean(process.env.PROMETHEUS_URL);
    const status = postgres.up ? 'ok' : prometheusConfigured ? 'error' : 'warning';
    const message = postgres.up
      ? `${postgres.connections.active} active connections`
      : prometheusConfigured
      ? 'PostgreSQL is down'
      : 'Prometheus not configured';

    return NextResponse.json({
      // UI-expected fields
      status,
      message,
      metrics: {
        pg_up: postgres.up ? 1 : 0,
        pg_stat_activity_count: postgres.connections.active,
        pg_settings_max_connections: postgres.connections.max,
        pgbouncer_pools_client_active: pgbouncer.total_active,
        pgbouncer_pools_client_waiting: pgbouncer.total_waiting,
        pgbouncer_pools_server_active: pgbouncerServerActive,
        pgbouncer_pools_server_idle: pgbouncerServerIdle,
      },
      databases: postgres.databases.map(db => ({
        name: db.name,
        connections: db.connections,
        maxConnections: 100,
        size: formatBytes(db.size_bytes),
      })),
      // Raw data for debugging/advanced usage
      _raw: {
        postgres,
        pgbouncer,
        history: includeHistory ? history : undefined,
      },
    });
  } catch (error) {
    console.error('Failed to fetch postgres health:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch postgres health' },
      { status: 500 }
    );
  }
}
