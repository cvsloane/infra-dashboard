'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DeploymentRecordClient, DeploymentStatsClient } from '@/types/deployments';

interface SSEOptions {
  onConnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

export function useSSE<T>(url: string, options: SSEOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<() => void>(() => {});

  // Store callbacks in refs to avoid recreating connection on callback changes
  const onConnectRef = useRef(options.onConnect);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onConnectRef.current = options.onConnect;
    onErrorRef.current = options.onError;
  }, [options.onConnect, options.onError]);

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
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
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
    reconnect: connect,
    disconnect,
  };
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
  deployments?: {
    active: DeploymentRecordClient[];
    recent: DeploymentRecordClient[];
    stats: DeploymentStatsClient;
  };
  postgres?: {
    up: boolean;
    connections: { active: number; idle: number; max: number };
    databases: Array<{ name: string; size_bytes: number; connections: number }>;
  } | null;
  pgbouncer?: {
    up: boolean;
    total_active: number;
    total_waiting: number;
    pools: Array<{ database: string; user: string; active: number; waiting: number }>;
  } | null;
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
    workerLastSeen?: number;
    workerCount?: number;
    workerHeartbeatMaxAgeSec?: number;
    oldestWaitingAgeSec?: number;
    jobsPerMin?: number;
    failuresPerMin?: number;
  }>;
  vps?: {
    appsVps: {
      hostname: string;
      cpu: { usagePercent: number; cores: number };
      memory: { totalBytes: number; availableBytes: number; usedPercent: number };
      disk: { totalBytes: number; availableBytes: number; usedPercent: number; mountPoint: string };
      load: { load1: number; load5: number; load15: number };
      uptime: number;
    } | null;
    dbVps: {
      hostname: string;
      cpu: { usagePercent: number; cores: number };
      memory: { totalBytes: number; availableBytes: number; usedPercent: number };
      disk: { totalBytes: number; availableBytes: number; usedPercent: number; mountPoint: string };
      load: { load1: number; load5: number; load15: number };
      uptime: number;
    } | null;
  };
  sites?: {
    allHealthy: boolean;
    downCount: number;
    sites: Array<{
      applicationUuid?: string;
      name: string;
      fqdn: string;
      status: 'healthy' | 'degraded' | 'down' | 'unknown';
      httpStatus?: number;
      responseTimeMs?: number;
      sslValid?: boolean;
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
  message?: string;
}
