/**
 * Redis/BullMQ Client
 *
 * Connects to Redis to inspect BullMQ queue states.
 * Provides queue depths, failed job details, and job management.
 */

import Redis from 'ioredis';

// Singleton Redis connection
let redis: Redis | null = null;

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

// Get or create Redis connection
export function getRedis(): Redis {
  if (redis) {
    return redis;
  }

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;

  redis = new Redis({
    host,
    port,
    password,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
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
  const client = getRedis();
  const queues = new Set<string>();

  // Scan for bull:* keys
  let cursor = '0';
  do {
    const [newCursor, keys] = await client.scan(cursor, 'MATCH', 'bull:*:meta', 'COUNT', 100);
    cursor = newCursor;

    for (const key of keys) {
      // Extract queue name from bull:<queue>:meta
      const match = key.match(/^bull:([^:]+):meta$/);
      if (match) {
        queues.add(match[1]);
      }
    }
  } while (cursor !== '0');

  // Also check for common queue patterns without meta key
  const commonPatterns = ['wait', 'active', 'completed', 'failed'];
  for (const pattern of commonPatterns) {
    cursor = '0';
    do {
      const [newCursor, keys] = await client.scan(cursor, 'MATCH', `bull:*:${pattern}`, 'COUNT', 100);
      cursor = newCursor;

      for (const key of keys) {
        const match = key.match(/^bull:([^:]+):/);
        if (match) {
          queues.add(match[1]);
        }
      }
    } while (cursor !== '0');
  }

  return Array.from(queues).sort();
}

// Key prefix for tracking consecutive failure count
const WORKER_FAIL_COUNT_PREFIX = 'infra:worker-fails:';
const WORKER_FAIL_COUNT_TTL = 300; // 5 minutes - enough to span multiple checks
const CONSECUTIVE_FAILURES_REQUIRED = 5; // Must fail 5 checks in a row to be considered down
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

  // Worker is only considered DOWN after N consecutive failures
  // This prevents false positives from timing issues with the 30s TTL refresh
  const workerActive = newFailCount < CONSECUTIVE_FAILURES_REQUIRED;

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

  return {
    name: queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
    isPaused: pausedFlag === 1,
    workerActive,
    workerLastSeen: currentlyResponding ? workerTtl : undefined,
    oldestWaitingAgeSec,
    jobsPerMin,
    failuresPerMin,
  };
}

// Get stats for all discovered queues
export async function getAllQueueStats(): Promise<QueueStats[]> {
  const queueNames = await discoverQueues();
  const [stats, heartbeatStats] = await Promise.all([
    Promise.all(queueNames.map(getQueueStats)),
    getWorkerHeartbeatStats(),
  ]);

  return stats.map((queueStat) => {
    const heartbeat = heartbeatStats[queueStat.name];
    if (!heartbeat) return queueStat;
    return {
      ...queueStat,
      workerActive: heartbeat.count > 0,
      workerCount: heartbeat.count,
      workerHeartbeatMaxAgeSec: heartbeat.maxAgeSec,
    };
  });
}

// Get failed jobs from a queue
export async function getFailedJobs(queueName: string, limit = 20): Promise<FailedJob[]> {
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

  return jobs;
}

// Get job details by ID
export async function getJobDetails(queueName: string, jobId: string): Promise<JobDetails | null> {
  const client = getRedis();
  const prefix = `bull:${queueName}`;

  const jobData = await client.hgetall(`${prefix}:${jobId}`);

  if (!jobData || Object.keys(jobData).length === 0) {
    return null;
  }

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
}

// Retry a failed job
export async function retryJob(queueName: string, jobId: string): Promise<boolean> {
  const client = getRedis();
  const prefix = `bull:${queueName}`;

  // Move from failed to wait
  const removed = await client.zrem(`${prefix}:failed`, jobId);
  if (removed) {
    await client.lpush(`${prefix}:wait`, jobId);
    // Reset attempts
    await client.hset(`${prefix}:${jobId}`, 'attemptsMade', '0');
    await client.hdel(`${prefix}:${jobId}`, 'failedReason', 'stacktrace', 'finishedOn');
    return true;
  }
  return false;
}

// Delete a job
export async function deleteJob(queueName: string, jobId: string): Promise<boolean> {
  const client = getRedis();
  const prefix = `bull:${queueName}`;

  // Remove from all possible sets/lists
  await Promise.all([
    client.lrem(`${prefix}:wait`, 0, jobId),
    client.lrem(`${prefix}:active`, 0, jobId),
    client.lrem(`${prefix}:paused`, 0, jobId),
    client.zrem(`${prefix}:completed`, jobId),
    client.zrem(`${prefix}:failed`, jobId),
    client.zrem(`${prefix}:delayed`, jobId),
  ]);

  // Delete job hash
  const deleted = await client.del(`${prefix}:${jobId}`);
  return deleted > 0;
}

// Retry all failed jobs in a queue
export async function retryAllFailed(queueName: string, limit?: number): Promise<number> {
  const client = getRedis();
  const prefix = `bull:${queueName}`;

  const end = limit && limit > 0 ? limit - 1 : -1;
  const jobIds = await client.zrevrange(`${prefix}:failed`, 0, end);
  if (jobIds.length === 0) return 0;

  const pipeline = client.pipeline();
  for (const jobId of jobIds) {
    pipeline.zrem(`${prefix}:failed`, jobId);
    pipeline.lpush(`${prefix}:wait`, jobId);
    pipeline.hset(`${prefix}:${jobId}`, 'attemptsMade', '0');
    pipeline.hdel(`${prefix}:${jobId}`, 'failedReason', 'stacktrace', 'finishedOn');
  }
  await pipeline.exec();
  return jobIds.length;
}

// Delete all failed jobs in a queue
export async function deleteAllFailed(queueName: string, limit?: number): Promise<number> {
  const client = getRedis();
  const prefix = `bull:${queueName}`;

  const end = limit && limit > 0 ? limit - 1 : -1;
  const jobIds = await client.zrevrange(`${prefix}:failed`, 0, end);
  if (jobIds.length === 0) return 0;

  const pipeline = client.pipeline();
  for (const jobId of jobIds) {
    pipeline.lrem(`${prefix}:wait`, 0, jobId);
    pipeline.lrem(`${prefix}:active`, 0, jobId);
    pipeline.lrem(`${prefix}:paused`, 0, jobId);
    pipeline.zrem(`${prefix}:completed`, jobId);
    pipeline.zrem(`${prefix}:failed`, jobId);
    pipeline.zrem(`${prefix}:delayed`, jobId);
    pipeline.del(`${prefix}:${jobId}`);
  }
  await pipeline.exec();
  return jobIds.length;
}

// Health check - tests connectivity to Redis
export async function healthCheck(): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const client = getRedis();
    await client.ping();
    const latencyMs = Date.now() - start;
    return { ok: true, message: 'Connected to Redis', latencyMs };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Redis',
    };
  }
}
