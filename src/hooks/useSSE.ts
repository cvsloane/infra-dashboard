'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CoolifyBuildTopologyClient, DeploymentRecordClient, DeploymentStatsClient } from '@/types/deployments';
import type { HermesOverviewSummary } from '@/types/hermes';

interface SSEOptions<T> {
  onConnect?: () => void;
  onMessage?: (data: T) => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

export function useSSE<T>(url: string, options: SSEOptions<T> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<() => void>(() => {});

  // Store callbacks in refs to avoid recreating connection on callback changes
  const onConnectRef = useRef(options.onConnect);
  const onErrorRef = useRef(options.onError);
  const onMessageRef = useRef(options.onMessage);
  useEffect(() => {
    onConnectRef.current = options.onConnect;
    onErrorRef.current = options.onError;
    onMessageRef.current = options.onMessage;
  }, [options.onConnect, options.onError, options.onMessage]);

  const {
    autoReconnect = true,
    reconnectDelay = 3000,
  } = options;

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(true);
      setError(null);
      onConnectRef.current?.();
    };

    eventSource.onmessage = (event) => {
      setLastMessageAt(Date.now());
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
        onMessageRef.current?.(parsed);
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    };

    eventSource.onerror = (event) => {
      setIsConnected(false);
      setError('Connection lost');
      onErrorRef.current?.(event);

      // Auto-reconnect
      if (autoReconnect) {
        if (reconnectTimeoutRef.current) {
          return;
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectRef.current();
        }, reconnectDelay);
      }
    };
  }, [url, autoReconnect, reconnectDelay]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    data,
    isConnected,
    error,
    lastMessageAt,
    reconnect: connect,
    disconnect,
  };
}

interface HostSnapshot {
  hostname: string;
  observedAt?: string | null;
  metricsAgeSeconds?: number | null;
  cpu: { usagePercent: number; cores: number };
  memory: { totalBytes: number; availableBytes: number; availableObserved?: boolean; usedPercent: number };
  disk: { totalBytes: number; availableBytes: number; availableObserved?: boolean; usedPercent: number; mountPoint: string };
  load: { load1: number; load5: number; load15: number };
  uptime: number;
}

// Type for the dashboard SSE updates
export interface DashboardUpdate {
  type: 'connected' | 'update' | 'error';
  timestamp: string;
  health?: {
    coolify: { ok: boolean; message: string };
    prometheus: { ok: boolean; message: string };
    redis: { ok: boolean; message: string; latencyMs?: number };
  };
  alerts?: {
    status: 'ok' | 'warning' | 'error' | 'unknown';
    message: string;
    fetchedAt: string;
    total: number;
    firing: number;
    suppressed: number;
    bySeverity: Record<'critical' | 'warning' | 'info' | 'unknown', number>;
    alerts: Array<{
      fingerprint?: string;
      name: string;
      severity: 'critical' | 'warning' | 'info' | 'unknown';
      state: 'firing' | 'suppressed' | 'unknown';
      startsAt?: string;
      endsAt?: string;
      summary?: string;
      description?: string;
      generatorURL?: string;
      labels: Record<string, string>;
      annotations: Record<string, string>;
      silencedBy: string[];
      inhibitedBy: string[];
    }>;
  } | null;
  deployments?: {
    active: DeploymentRecordClient[];
    recent: DeploymentRecordClient[];
    stats: DeploymentStatsClient;
    buildTopology: CoolifyBuildTopologyClient | null;
    available?: boolean;
  };
  postgres?: {
    up: boolean;
    metricsAgeSeconds?: number | null;
    connections: { active: number; idle: number; max: number };
    databases: Array<{ name: string; size_bytes: number; connections: number }>;
  } | null;
  pgbouncer?: {
    up: boolean;
    total_active: number;
    total_waiting: number;
    pools: Array<{ database: string; user: string; active: number; waiting: number }>;
  } | null;
  backups?: {
    status: 'ok' | 'warning' | 'error' | 'unknown';
    message: string;
    wal: { status: 'ok' | 'warning' | 'error' | 'unknown'; ageSec: number | null };
    logical: { status: 'ok' | 'warning' | 'error' | 'unknown'; ageSec: number | null; bytes: number | null };
    basebackup: { status: 'ok' | 'warning' | 'error' | 'unknown'; ageSec: number | null; checkedAgeSec: number | null };
    restoreDrill: { status: 'ok' | 'warning' | 'error' | 'unknown'; ageSec: number | null };
    restic: Array<{
      host: string;
      job: string;
      status: 'ok' | 'warning' | 'error' | 'unknown';
      lastRunSuccess: number | null;
      lastRunAgeSec: number | null;
      lastSuccessAgeSec: number | null;
    }>;
    offsiteRestore?: {
      status: 'ok' | 'warning' | 'error' | 'unknown';
      lastRunAt: string | null;
      lastSuccessAt: string | null;
    };
    standbyLagSeconds?: number | null;
  } | null;
  queuesAvailable?: boolean;
  queues?: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    isPaused?: boolean;
    workerActive?: boolean;
    workerState?: 'active' | 'idle' | 'down' | 'unknown';
    workerStateReason?: string;
    workerLastSeen?: number;
    workerCount?: number;
    workerHeartbeatMaxAgeSec?: number;
    oldestWaitingAgeSec?: number;
    jobsPerMin?: number;
    failuresPerMin?: number;
  }>;
  vps?: {
    appsVps: HostSnapshot | null;
    dbVps: HostSnapshot | null;
  };
  sites?: {
    available?: boolean;
    eligibleCount?: number;
    allHealthy: boolean;
    downCount: number;
    sslExpiringSoonCount?: number;
    sslExpiryWarnDays?: number;
    sites: Array<{
      applicationUuid?: string;
      name: string;
      fqdn: string;
      status: 'healthy' | 'degraded' | 'down' | 'unknown';
      httpStatus?: number;
      responseTimeMs?: number;
      sslValid?: boolean;
      sslExpiresAt?: string;
      sslDaysRemaining?: number;
      lastChecked: string;
      error?: string;
    }>;
  };
  workerSupervisor?: {
    version: number;
    host?: string;
    updatedAt: string;
    stale?: boolean;
    ageSec?: number;
    summary: {
      total: number;
      ok: number;
      warning: number;
      down: number;
    };
    items: Array<{
      name: string;
      source: 'systemd' | 'pm2' | 'docker';
      status: 'ok' | 'warning' | 'down';
      detail?: string;
      metadata?: Record<string, string | number | boolean | null>;
    }>;
  } | null;
  hermes?: HermesOverviewSummary | null;
  message?: string;
}
