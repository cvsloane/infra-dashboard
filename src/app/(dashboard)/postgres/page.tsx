'use client';

import { useEffect, useState } from 'react';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ConnectionGauge } from '@/components/postgres/ConnectionGauge';
import { DatabaseCard } from '@/components/postgres/DatabaseCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, Activity, Clock, HardDrive } from 'lucide-react';

interface PostgresHealth {
  status: 'ok' | 'error' | 'warning';
  message: string;
  metrics: {
    pg_up: number;
    pg_stat_activity_count: number;
    pg_settings_max_connections: number;
    pgbouncer_pools_client_active: number;
    pgbouncer_pools_client_waiting: number;
    pgbouncer_pools_server_active: number;
    pgbouncer_pools_server_idle: number;
  };
  databases?: Array<{
    name: string;
    connections: number;
    maxConnections: number;
    activeQueries?: number;
    size?: string;
  }>;
}

export default function PostgresPage() {
  const [health, setHealth] = useState<PostgresHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/postgres/health');
        const data = await res.json();
        setHealth(data);
      } catch (error) {
        console.error('Failed to fetch postgres health:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">PostgreSQL Monitoring</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = health?.metrics || {
    pg_up: 0,
    pg_stat_activity_count: 0,
    pg_settings_max_connections: 100,
    pgbouncer_pools_client_active: 0,
    pgbouncer_pools_client_waiting: 0,
    pgbouncer_pools_server_active: 0,
    pgbouncer_pools_server_idle: 0,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">PostgreSQL Monitoring</h1>

      {/* Overall Status */}
      <StatusCard
        title="Database Health"
        status={health?.status || 'error'}
        message={health?.message || 'Unable to connect'}
        icon={Database}
      />

      {/* Connection Gauges */}
      <div className="grid gap-4 md:grid-cols-2">
        <ConnectionGauge
          title="PostgreSQL Connections"
          current={metrics.pg_stat_activity_count}
          max={metrics.pg_settings_max_connections}
        />
        <ConnectionGauge
          title="PgBouncer Active Clients"
          current={metrics.pgbouncer_pools_client_active}
          max={metrics.pgbouncer_pools_client_active + metrics.pgbouncer_pools_client_waiting + 10}
        />
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Active Connections"
          value={metrics.pg_stat_activity_count}
          icon={Activity}
        />
        <MetricCard
          title="Max Connections"
          value={metrics.pg_settings_max_connections}
          icon={Database}
        />
        <MetricCard
          title="PgBouncer Server Active"
          value={metrics.pgbouncer_pools_server_active}
          icon={HardDrive}
        />
        <MetricCard
          title="PgBouncer Server Idle"
          value={metrics.pgbouncer_pools_server_idle}
          icon={Clock}
        />
      </div>

      {/* PgBouncer Details */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">PgBouncer Pool Status</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Client Active"
            value={metrics.pgbouncer_pools_client_active}
            subtitle="Active client connections"
          />
          <MetricCard
            title="Client Waiting"
            value={metrics.pgbouncer_pools_client_waiting}
            subtitle="Waiting for server connection"
            trend={metrics.pgbouncer_pools_client_waiting > 0 ? 'down' : 'neutral'}
          />
          <MetricCard
            title="Server Active"
            value={metrics.pgbouncer_pools_server_active}
            subtitle="Active server connections"
          />
          <MetricCard
            title="Server Idle"
            value={metrics.pgbouncer_pools_server_idle}
            subtitle="Idle server connections"
          />
        </div>
      </div>

      {/* Database Cards */}
      {health?.databases && health.databases.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Databases</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {health.databases.map((db) => (
              <DatabaseCard key={db.name} database={db} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
