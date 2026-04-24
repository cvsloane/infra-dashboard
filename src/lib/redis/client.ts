/**
 * Redis/BullMQ Client
 *
 * Connects to Redis to inspect BullMQ queue states.
 * Provides queue depths, failed job details, and job management.
 */

import { Queue } from 'bullmq';
import Redis, { type RedisOptions } from 'ioredis';
import { discoverQueuesWithScan } from './discoverQueues';
import { getQueueWorkerState, type QueueWorkerState } from './workerState';
import { metrics, recordBullmqOp } from '@/lib/server/metrics';

// Singleton Redis connection
let redis: Redis | null = null;

// BullMQ mutation helpers (avoid manual key manipulation).
let bullConnection: Redis | RedisOptions | null = null;
const bullQueueCache = new Map<string, Queue>();

// Types
export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  isPaused?: boolean;
  workerActive: boolean;
  workerState: QueueWorkerState;
  workerStateReason?: string;
  workerLastSeen?: number; // TTL in seconds, indicates how recently worker checked in
  workerCount?: number;
  workerHeartbeatMaxAgeSec?: number;
  oldestWaitingAgeSec?: number;
  jobsPerMin?: number;
  failuresPerMin?: number;
}

export interface FailedJob {
  id: string;
  queue: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export interface JobDetails {
  id: string;
  name: string;
  data: Record<string, unknown>;
  opts: Record<string, unknown>;
  progress: number;
  delay: number;
  timestamp: number;
  attemptsMade: number;
  stacktrace: string[];
  returnvalue: unknown;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}

function getBullmqConnection(): Redis | RedisOptions {
  if (bullConnection) {
    return bullConnection;
  }

  const redisUrl = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME;

  bullConnection = redisUrl
    ? new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      })
    : {
        host,
        port,
        username,
        password,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };

  return bullConnection;
}

function getBullmqQueue(queueName: string): Queue {
  const existing = bullQueueCache.get(queueName);
  if (existing) return existing;

  const queue = new Queue(queueName, {
    connection: getBullmqConnection(),
  });
  bullQueueCache.set(queueName, queue);
  return queue;
}

// Get or create Redis connection
export function getRedis(): Redis {
  if (redis) {
    return redis;
  }

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME;
  const redisUrl = process.env.REDIS_URL;

  const baseOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
  };

  redis = redisUrl
    ? new Redis(redisUrl, baseOptions)
    : new Redis({
        host,
        port,
        username,
        password,
        ...baseOptions,
      });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });

  redis.on('connect', () => {
    console.log('Connected to Redis');
  });

  return redis;
}

// Close Redis connection (for cleanup)
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Discover all BullMQ queues by scanning keys
export async function discoverQueues(): Promise<string[]> {
  const startedAt = Date.now();
  const client = getRedis();

  try {
    const scan = client.scan.bind(client) as unknown as (
      cursor: string,
      ...args: Array<string | number>
    ) => Promise<[string, string[]]>;

    const queues = await discoverQueuesWithScan(scan);
    metrics.bullmqDiscoveredQueues.set(queues.length);
    recordBullmqOp('discover_queues', 'ok', (Date.now() - startedAt) / 1000);
    return queues;
  } catch (error) {
    recordBullmqOp('discover_queues', 'error', (Date.now() - startedAt) / 1000);
    throw error;
  }
}

// Key prefix for tracking consecutive failure count
const WORKER_FAIL_COUNT_PREFIX = 'infra:worker-fails:';
const WORKER_FAIL_COUNT_TTL = 300; // 5 minutes - enough to span multiple checks
const QUEUE_RATE_KEY_PREFIX = 'infra:queue-rate:';
const QUEUE_RATE_TTL = 300; // Keep last snapshot for 5 minutes
const MIN_RATE_SAMPLE_SECONDS = 15;
const WORKER_HEARTBEAT_PREFIX = 'infra:worker:heartbeat:';

interface WorkerHeartbeatStats {
  count: number;
  maxAgeSec?: number;
}

async function getWorkerHeartbeatStats(): Promise<Record<string, WorkerHeartbeatStats>> {
  const client = getRedis();
  const stats: Record<string, WorkerHeartbeatStats> = {};
  let cursor = '0';
  const keys: string[] = [];

  do {
    const [nextCursor, batch] = await client.scan(
      cursor,
      'MATCH',
      `${WORKER_HEARTBEAT_PREFIX}*`,
      'COUNT',
      200
    );
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  if (keys.length === 0) return stats;

  const pipeline = client.pipeline();
  keys.forEach((key) => pipeline.get(key));
  const results = await pipeline.exec();

  keys.forEach((key, index) => {
    const parts = key.split(':');
    const queueName = parts[3];
    if (!queueName) {
      return;
    }

    if (!stats[queueName]) {
      stats[queueName] = { count: 0 };
    }

    stats[queueName].count += 1;

    const value = results?.[index]?.[1];
    if (!value) return;

    let timestamp: number | undefined;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        const raw =
          parsed.ts ??
          parsed.timestamp ??
          parsed.lastSeen ??
          parsed.last_seen ??
          parsed.updatedAt ??
          parsed.updated_at;

        if (typeof raw === 'number') {
          timestamp = raw < 1e12 ? raw * 1000 : raw;
        } else if (typeof raw === 'string') {
          const parsedDate = Date.parse(raw);
          if (!Number.isNaN(parsedDate)) {
            timestamp = parsedDate;
          }
        }
      } catch {
        const rawNumber = parseInt(value, 10);
        if (!Number.isNaN(rawNumber)) {
          timestamp = rawNumber < 1e12 ? rawNumber * 1000 : rawNumber;
        }
      }
    }

    if (timestamp) {
      const ageSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      const currentMax = stats[queueName].maxAgeSec ?? 0;
      stats[queueName].maxAgeSec = Math.max(currentMax, ageSec);
    }
  });

  return stats;
}

// Get stats for a single queue
export async function getQueueStats(queueName: string): Promise<QueueStats> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const client = getRedis();
    const prefix = `bull:${queueName}`;
    const failCountKey = `${WORKER_FAIL_COUNT_PREFIX}${queueName}`;
    const rateKey = `${QUEUE_RATE_KEY_PREFIX}${queueName}`;

    const [waiting, active, completed, failed, delayed, paused, pausedFlag, workerTtl, failCountStr, oldestWaitingJobId, rateSnapshotStr] = await Promise.all([
      client.llen(`${prefix}:wait`),
      client.llen(`${prefix}:active`),
      client.zcard(`${prefix}:completed`),
      client.zcard(`${prefix}:failed`),
      client.zcard(`${prefix}:delayed`),
      client.llen(`${prefix}:paused`),
      client.hexists(`${prefix}:meta`, 'paused'),
      client.ttl(`${prefix}:stalled-check`), // -2 = key doesn't exist, -1 = no expiry, >0 = TTL in seconds
      client.get(failCountKey), // Get consecutive failure count
      client.lindex(`${prefix}:wait`, -1), // Oldest waiting job id (tail of list)
      client.get(rateKey),
    ]);

    // Current check: worker is responding if stalled-check key exists with positive TTL
    const currentlyResponding = workerTtl > 0;
    const previousFailCount = parseInt(failCountStr || '0', 10);

    // Update failure count: reset to 0 if responding, increment if not
    const newFailCount = currentlyResponding ? 0 : previousFailCount + 1;

    if (newFailCount > 0) {
      await client.setex(failCountKey, WORKER_FAIL_COUNT_TTL, newFailCount.toString());
    } else {
      await client.del(failCountKey);
    }

    const workerState = getQueueWorkerState({
      waiting,
      active,
      workerResponding: currentlyResponding,
      failCount: newFailCount,
    });

    // Oldest waiting job age
    let oldestWaitingAgeSec: number | undefined;
    if (oldestWaitingJobId) {
      try {
        const timestampStr = await client.hget(`${prefix}:${oldestWaitingJobId}`, 'timestamp');
        const timestamp = timestampStr ? parseInt(timestampStr, 10) : NaN;
        if (!Number.isNaN(timestamp) && timestamp > 0) {
          oldestWaitingAgeSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        }
      } catch {
        // Ignore; leave undefined if job hash missing
      }
    }

    // Jobs per minute (completed/failed deltas)
    const now = Date.now();
    let jobsPerMin: number | undefined;
    let failuresPerMin: number | undefined;
    if (rateSnapshotStr) {
      try {
        const parsed = JSON.parse(rateSnapshotStr) as { ts: number; completed: number; failed: number };
        const elapsedSec = (now - parsed.ts) / 1000;
        if (elapsedSec >= MIN_RATE_SAMPLE_SECONDS && elapsedSec > 0) {
          const completedDelta = Math.max(0, completed - parsed.completed);
          const failedDelta = Math.max(0, failed - parsed.failed);
          jobsPerMin = Math.round((completedDelta / elapsedSec) * 60 * 10) / 10;
          failuresPerMin = Math.round((failedDelta / elapsedSec) * 60 * 10) / 10;
        }
      } catch {
        // Ignore parse errors
      }
    }
    await client.setex(rateKey, QUEUE_RATE_TTL, JSON.stringify({ ts: now, completed, failed }));

    result = 'ok';
    return {
      name: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      isPaused: pausedFlag === 1,
      ...workerState,
      workerLastSeen: currentlyResponding ? workerTtl : undefined,
      oldestWaitingAgeSec,
      jobsPerMin,
      failuresPerMin,
    };
  } finally {
    recordBullmqOp('get_queue_stats', result, (Date.now() - startedAt) / 1000);
  }
}

// Get stats for all discovered queues
export async function getAllQueueStats(): Promise<QueueStats[]> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const queueNames = await discoverQueues();
    const [stats, heartbeatStats] = await Promise.all([
      Promise.all(queueNames.map(getQueueStats)),
      getWorkerHeartbeatStats(),
    ]);

    result = 'ok';
    return stats.map((queueStat) => {
      const heartbeat = heartbeatStats[queueStat.name];
      if (!heartbeat) return queueStat;
      return {
        ...queueStat,
        workerActive: true,
        workerState: 'active',
        workerStateReason: `${heartbeat.count} worker heartbeat${heartbeat.count === 1 ? '' : 's'} present`,
        workerCount: heartbeat.count,
        workerHeartbeatMaxAgeSec: heartbeat.maxAgeSec,
      };
    });
  } finally {
    recordBullmqOp('get_all_queue_stats', result, (Date.now() - startedAt) / 1000);
  }
}

// Get failed jobs from a queue
export async function getFailedJobs(queueName: string, limit = 20): Promise<FailedJob[]> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const client = getRedis();
    const prefix = `bull:${queueName}`;

    // Get failed job IDs (sorted set, most recent first)
    const jobIds = await client.zrevrange(`${prefix}:failed`, 0, limit - 1);

    const jobs: FailedJob[] = [];

    for (const jobId of jobIds) {
      const jobData = await client.hgetall(`${prefix}:${jobId}`);
      if (jobData && Object.keys(jobData).length > 0) {
        jobs.push({
          id: jobId,
          queue: queueName,
          name: jobData.name || 'unknown',
          data: jobData.data ? JSON.parse(jobData.data) : {},
          failedReason: jobData.failedReason || 'Unknown error',
          stacktrace: jobData.stacktrace ? JSON.parse(jobData.stacktrace) : [],
          attemptsMade: parseInt(jobData.attemptsMade || '0', 10),
          timestamp: parseInt(jobData.timestamp || '0', 10),
          processedOn: jobData.processedOn ? parseInt(jobData.processedOn, 10) : undefined,
          finishedOn: jobData.finishedOn ? parseInt(jobData.finishedOn, 10) : undefined,
        });
      }
    }

    result = 'ok';
    return jobs;
  } finally {
    recordBullmqOp('get_failed_jobs', result, (Date.now() - startedAt) / 1000);
  }
}

// Get job details by ID
export async function getJobDetails(queueName: string, jobId: string): Promise<JobDetails | null> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const client = getRedis();
    const prefix = `bull:${queueName}`;

    const jobData = await client.hgetall(`${prefix}:${jobId}`);

    if (!jobData || Object.keys(jobData).length === 0) {
      result = 'ok';
      return null;
    }

    result = 'ok';
    return {
      id: jobId,
      name: jobData.name || 'unknown',
      data: jobData.data ? JSON.parse(jobData.data) : {},
      opts: jobData.opts ? JSON.parse(jobData.opts) : {},
      progress: parseInt(jobData.progress || '0', 10),
      delay: parseInt(jobData.delay || '0', 10),
      timestamp: parseInt(jobData.timestamp || '0', 10),
      attemptsMade: parseInt(jobData.attemptsMade || '0', 10),
      stacktrace: jobData.stacktrace ? JSON.parse(jobData.stacktrace) : [],
      returnvalue: jobData.returnvalue ? JSON.parse(jobData.returnvalue) : null,
      failedReason: jobData.failedReason,
      processedOn: jobData.processedOn ? parseInt(jobData.processedOn, 10) : undefined,
      finishedOn: jobData.finishedOn ? parseInt(jobData.finishedOn, 10) : undefined,
    };
  } finally {
    recordBullmqOp('get_job_details', result, (Date.now() - startedAt) / 1000);
  }
}

// Retry a failed job
export async function retryJob(queueName: string, jobId: string): Promise<boolean> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const queue = getBullmqQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      result = 'ok';
      return false;
    }

    const opts = { resetAttemptsMade: true, resetAttemptsStarted: true };
    try {
      await job.retry('failed', opts);
      result = 'ok';
      return true;
    } catch {
      // If the job is in a different terminal state (e.g. completed), allow retry anyway.
      try {
        await job.retry('completed', opts);
        result = 'ok';
        return true;
      } catch (retryError) {
        console.error(`Failed to retry job ${queueName}/${jobId}:`, retryError);
        result = 'error';
        return false;
      }
    }
  } finally {
    recordBullmqOp('retry_job', result, (Date.now() - startedAt) / 1000);
  }
}

// Delete a job
export async function deleteJob(queueName: string, jobId: string): Promise<boolean> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const queue = getBullmqQueue(queueName);
    try {
      const code = await queue.remove(jobId, { removeChildren: true });
      result = 'ok';
      return code === 1;
    } catch (error) {
      console.error(`Failed to delete job ${queueName}/${jobId}:`, error);
      result = 'error';
      return false;
    }
  } finally {
    recordBullmqOp('delete_job', result, (Date.now() - startedAt) / 1000);
  }
}

// Retry all failed jobs in a queue
export async function retryAllFailed(queueName: string, limit?: number): Promise<number> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const queue = getBullmqQueue(queueName);
    const end = limit && limit > 0 ? limit - 1 : -1;

    const jobs = await queue.getJobs(['failed'], 0, end, true);
    if (!jobs.length) {
      result = 'ok';
      return 0;
    }

    const opts = { resetAttemptsMade: true, resetAttemptsStarted: true };
    let processed = 0;
    let hadError = false;
    for (const job of jobs) {
      if (!job) continue;
      try {
        await job.retry('failed', opts);
        processed += 1;
      } catch (error) {
        hadError = true;
        // Skip locked/missing jobs.
        console.error(`Failed to retry job ${queueName}/${job.id}:`, error);
      }
    }

    result = hadError ? 'error' : 'ok';
    return processed;
  } finally {
    recordBullmqOp('retry_all_failed', result, (Date.now() - startedAt) / 1000);
  }
}

// Delete all failed jobs in a queue
export async function deleteAllFailed(queueName: string, limit?: number): Promise<number> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const queue = getBullmqQueue(queueName);
    const end = limit && limit > 0 ? limit - 1 : -1;

    const jobs = await queue.getJobs(['failed'], 0, end, true);
    if (!jobs.length) {
      result = 'ok';
      return 0;
    }

    let processed = 0;
    let hadError = false;
    for (const job of jobs) {
      if (!job) continue;
      const jobId = job.id;
      if (!jobId) continue;
      try {
        const code = await queue.remove(jobId, { removeChildren: true });
        if (code === 1) {
          processed += 1;
        }
      } catch (error) {
        hadError = true;
        console.error(`Failed to delete job ${queueName}/${jobId}:`, error);
      }
    }

    result = hadError ? 'error' : 'ok';
    return processed;
  } finally {
    recordBullmqOp('delete_all_failed', result, (Date.now() - startedAt) / 1000);
  }
}

// Health check - tests connectivity to Redis
export async function healthCheck(): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const startedAt = Date.now();
  let result: 'ok' | 'error' = 'error';
  try {
    const client = getRedis();
    await client.ping();
    const latencyMs = Date.now() - startedAt;
    result = 'ok';
    return { ok: true, message: 'Connected to Redis', latencyMs };
  } catch (error) {
    result = 'error';
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Redis',
    };
  } finally {
    recordBullmqOp('health_check', result, (Date.now() - startedAt) / 1000);
  }
}
