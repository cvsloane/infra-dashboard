'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from '@/app/(dashboard)/layout';
import type { DashboardUpdate } from '@/hooks/useSSE';

type PollReading = { update: DashboardUpdate; startedAt: number };

async function read<T>(path: string, signal: AbortSignal, allowDegraded = false): Promise<T | undefined> {
  try {
    const response = await fetch(path, { cache: 'no-store', signal });
    if (response.ok || (allowDegraded && response.status === 503)) return await response.json();
  } catch {
    // An absent source is rendered as a monitoring gap.
  }
}

async function pollOverview(signal: AbortSignal): Promise<DashboardUpdate | null> {
  // Record the collection start so a delayed HTTP response cannot replace a newer live frame.
  const timestamp = new Date().toISOString();
  const [alerts, queueResponse, siteResponse, backups, deployments, health] = await Promise.all([
    read<DashboardUpdate['alerts']>('/api/alertmanager/alerts', signal),
    read<{ queues?: DashboardUpdate['queues'] }>('/api/bullmq/queues', signal),
    read<Pick<DashboardUpdate, 'sites' | 'vps'>>('/api/servers/status?scope=overview', signal),
    read<DashboardUpdate['backups']>('/api/postgres/backups', signal),
    read<DashboardUpdate['deployments']>('/api/coolify/deployments', signal),
    read<{ services?: DashboardUpdate['health'] }>('/api/health', signal, true),
  ]);
  if (![alerts, queueResponse?.queues, siteResponse?.sites, backups, deployments, health?.services].some(Boolean)) return null;
  return {
    type: 'update', timestamp, alerts, queues: queueResponse?.queues, sites: siteResponse?.sites,
    backups, deployments, health: health?.services, vps: siteResponse?.vps,
    queuesAvailable: Array.isArray(queueResponse?.queues),
  };
}

export function useServiceSnapshot() {
  const { data, reading, isConnected, refresh } = useDashboard();
  const [poll, setPoll] = useState<PollReading | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const streamError = data?.type === 'error';
  const liveReadExpired = reading !== null && now !== null && now - reading.receivedAt > 45000;
  const hasFreshLive = isConnected && data?.type === 'update' && reading !== null && !liveReadExpired;

  useEffect(() => {
    if (hasFreshLive) return;
    const controller = new AbortController();
    let nextAttempt = 0;

    const sample = async () => {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
      const startedAt = Date.now();
      const update = await pollOverview(signal);
      if (controller.signal.aborted) return;
      setPollFailed(!update);
      if (update) setPoll({ update, startedAt });
      nextAttempt = window.setTimeout(sample, 30000);
    };

    // A connected stream may still be waiting on its first source collection.
    const waitingForFirstFrame = isConnected && !streamError && !liveReadExpired;
    nextAttempt = window.setTimeout(sample, waitingForFirstFrame ? 9000 : 1200);
    return () => {
      controller.abort();
      window.clearTimeout(nextAttempt);
    };
  }, [hasFreshLive, isConnected, liveReadExpired, refreshKey, streamError]);

  const snapshot = useMemo(() => {
    if (reading && (!poll || reading.receivedAt >= poll.startedAt)) {
      return { update: reading.update, at: reading.receivedAt, source: 'live' as const };
    }
    return poll && { update: poll.update, at: poll.startedAt, source: 'poll' as const };
  }, [reading, poll]);
  const delayed = snapshot !== null && now !== null && now - snapshot.at > 60000;
  const stale = delayed || (snapshot?.source === 'live' && !hasFreshLive)
    || (snapshot?.source === 'poll' && !hasFreshLive && pollFailed);

  return {
    snapshot,
    stale,
    unavailable: !snapshot && (pollFailed || streamError),
    retry() {
      setPollFailed(false);
      setRefreshKey(key => key + 1);
      refresh();
    },
  };
}
