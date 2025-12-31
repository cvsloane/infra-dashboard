/**
 * Coolify Database Client
 *
 * Direct connection to Coolify's PostgreSQL database for real-time deployment tracking.
 * Uses the coolify-db container on the same Docker network.
 */

import { Pool } from 'pg';

// Connection pool for Coolify's PostgreSQL database
const pool = new Pool({
  connectionString: process.env.COOLIFY_DB_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Types
export interface DeploymentRecord {
  uuid: string;
  applicationName: string;
  applicationUuid: string;
  status: 'queued' | 'in_progress' | 'finished' | 'failed' | 'cancelled' | 'cancelled-by-user';
  commit: string | null;
  commitMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}

export interface DeploymentStats {
  queued: number;
  inProgress: number;
  finishedToday: number;
  failedToday: number;
}

/**
 * Get active deployments (queued or in_progress)
 */
export async function getActiveDeployments(): Promise<DeploymentRecord[]> {
  const query = `
    SELECT
      deployment_uuid as uuid,
      application_name as "applicationName",
      application_id as "applicationUuid",
      status,
      commit,
      commit_message as "commitMessage",
      created_at as "createdAt",
      updated_at as "updatedAt",
      finished_at as "finishedAt",
      EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - created_at)) * 1000 as "durationMs"
    FROM application_deployment_queues
    WHERE status IN ('queued', 'in_progress')
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Get recent deployments (last N minutes)
 */
export async function getRecentDeployments(minutes: number = 30): Promise<DeploymentRecord[]> {
  const query = `
    SELECT
      deployment_uuid as uuid,
      application_name as "applicationName",
      application_id as "applicationUuid",
      status,
      commit,
      commit_message as "commitMessage",
      created_at as "createdAt",
      updated_at as "updatedAt",
      finished_at as "finishedAt",
      EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - created_at)) * 1000 as "durationMs"
    FROM application_deployment_queues
    WHERE updated_at > NOW() - INTERVAL '${minutes} minutes'
      AND status NOT IN ('queued', 'in_progress')
    ORDER BY updated_at DESC
    LIMIT 20
  `;

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Get deployment statistics for today
 */
export async function getDeploymentStats(): Promise<DeploymentStats> {
  const query = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued') as queued,
      COUNT(*) FILTER (WHERE status = 'in_progress') as "inProgress",
      COUNT(*) FILTER (WHERE status = 'finished' AND DATE(finished_at) = CURRENT_DATE) as "finishedToday",
      COUNT(*) FILTER (WHERE status = 'failed' AND DATE(updated_at) = CURRENT_DATE) as "failedToday"
    FROM application_deployment_queues
    WHERE updated_at > NOW() - INTERVAL '24 hours'
      OR status IN ('queued', 'in_progress')
  `;

  const result = await pool.query(query);
  return {
    queued: parseInt(result.rows[0].queued) || 0,
    inProgress: parseInt(result.rows[0].inProgress) || 0,
    finishedToday: parseInt(result.rows[0].finishedToday) || 0,
    failedToday: parseInt(result.rows[0].failedToday) || 0,
  };
}

/**
 * Get all live deployment data (active + recent + stats)
 */
export async function getLiveDeployments() {
  try {
    const [active, recent, stats] = await Promise.all([
      getActiveDeployments(),
      getRecentDeployments(30),
      getDeploymentStats(),
    ]);

    return {
      active,
      recent,
      stats,
    };
  } catch (error) {
    console.error('Failed to fetch live deployments:', error);
    return {
      active: [],
      recent: [],
      stats: { queued: 0, inProgress: 0, finishedToday: 0, failedToday: 0 },
    };
  }
}

/**
 * Get a single deployment by UUID (including logs)
 */
export interface DeploymentWithLogs extends DeploymentRecord {
  logs: string | null;
}

export async function getDeploymentByUuid(uuid: string): Promise<DeploymentWithLogs | null> {
  const query = `
    SELECT
      deployment_uuid as uuid,
      application_name as "applicationName",
      application_id as "applicationUuid",
      status,
      commit,
      commit_message as "commitMessage",
      created_at as "createdAt",
      updated_at as "updatedAt",
      finished_at as "finishedAt",
      EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - created_at)) * 1000 as "durationMs",
      logs
    FROM application_deployment_queues
    WHERE deployment_uuid = $1
  `;

  const result = await pool.query(query, [uuid]);
  return result.rows[0] || null;
}

/**
 * Health check for Coolify database connection
 */
export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await pool.query('SELECT 1');
    return { ok: true, message: 'Connected to Coolify database' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Coolify database',
    };
  }
}
