import { isAuthenticatedFromRequest } from '@/lib/auth';
import { healthCheck as coolifyHealth } from '@/lib/coolify/client';
import { getLiveDeployments } from '@/lib/coolify/db';
import { healthCheck as prometheusHealth, getPostgresHealth, getPgBouncerHealth, getAllVPSMetrics } from '@/lib/prometheus/client';
import { healthCheck as redisHealth, getAllQueueStats } from '@/lib/redis/client';
import { getWorkerSupervisorStatus } from '@/lib/redis/workers';
import { quickHealthCheck } from '@/lib/health/sites';

// Polling interval in milliseconds (15s to avoid Coolify rate limiting)
const POLL_INTERVAL = 15000;

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();

  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {

      // Send initial connection message
      const connectMsg = `data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(connectMsg));

      // Send heartbeat every 5 seconds to keep connection alive through proxies
      const heartbeatId = setInterval(() => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            // Stream closed, ignore
          }
        }
      }, 5000);

      // Helper to safely enqueue data
      const safeEnqueue = (data: string) => {
        if (isClosed) return false;
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          isClosed = true;
          return false;
        }
      };

      // Helper to add timeout to promises
      const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
        ]);
      };

      // Send update
      const sendUpdate = async () => {
        try {
          const timeout = 3000; // 3 second timeout for each service

          const [
            coolifyStatus,
            prometheusStatus,
            redisStatus,
            liveDeployments,
            postgres,
            pgbouncer,
            queues,
            vpsMetrics,
            siteHealth,
            workerSupervisor,
          ] = await Promise.allSettled([
            withTimeout(coolifyHealth(), timeout, { ok: false, message: 'Timeout' }),
            withTimeout(prometheusHealth(), timeout, { ok: false, message: 'Timeout' }),
            withTimeout(redisHealth(), timeout, { ok: false, message: 'Timeout', latencyMs: 0 }),
            withTimeout(getLiveDeployments(), timeout, { active: [], recent: [], stats: { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 } }),
            withTimeout(getPostgresHealth(), timeout, { up: false, connections: { active: 0, idle: 0, max: 100 }, databases: [] }),
            withTimeout(getPgBouncerHealth(), timeout, { up: false, pools: [], total_active: 0, total_waiting: 0 }),
            withTimeout(getAllQueueStats(), timeout, []),
            withTimeout(getAllVPSMetrics(), timeout, { appsVps: null, dbVps: null }),
            withTimeout(quickHealthCheck(), 8000, { allHealthy: true, downCount: 0, sites: [] }),
            withTimeout(getWorkerSupervisorStatus(), timeout, null),
          ]);

          const deploymentsData = liveDeployments.status === 'fulfilled'
            ? liveDeployments.value
            : { active: [], recent: [], stats: { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 } };

          const vpsData = vpsMetrics.status === 'fulfilled'
            ? vpsMetrics.value
            : { appsVps: null, dbVps: null };

          const sitesData = siteHealth.status === 'fulfilled'
            ? siteHealth.value
            : { allHealthy: true, downCount: 0, sites: [] };

          const workerSupervisorData = workerSupervisor.status === 'fulfilled'
            ? workerSupervisor.value
            : null;

          const update = {
            type: 'update',
            timestamp: new Date().toISOString(),
            health: {
              coolify: coolifyStatus.status === 'fulfilled' ? coolifyStatus.value : { ok: false, message: 'Failed to check' },
              prometheus: prometheusStatus.status === 'fulfilled' ? prometheusStatus.value : { ok: false, message: 'Failed to check' },
              redis: redisStatus.status === 'fulfilled' ? redisStatus.value : { ok: false, message: 'Failed to check' },
            },
            deployments: deploymentsData,
            postgres: postgres.status === 'fulfilled' ? postgres.value : null,
            pgbouncer: pgbouncer.status === 'fulfilled' ? pgbouncer.value : null,
            queues: queues.status === 'fulfilled' ? queues.value : [],
            vps: vpsData,
            sites: sitesData,
            workerSupervisor: workerSupervisorData,
          };

          const data = `data: ${JSON.stringify(update)}\n\n`;
          safeEnqueue(data);
        } catch (error) {
          console.error('SSE update error:', error);
          const errorMsg = `data: ${JSON.stringify({
            type: 'error',
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : 'Unknown error',
          })}\n\n`;
          safeEnqueue(errorMsg);
        }
      };

      // Start polling (first update runs after short delay to let connection establish)
      const intervalId = setInterval(sendUpdate, POLL_INTERVAL);
      // Small delay before first update to ensure stream is established
      setTimeout(sendUpdate, 100);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(intervalId);
        clearInterval(heartbeatId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
