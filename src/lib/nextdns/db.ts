import { Pool, type PoolClient } from 'pg';
import { getDefaultChildSilenceMinutes, getExpectedChildDevices, getNextDnsDbUrl } from '@/lib/nextdns/config';
import type {
  ExpectedChildDevice,
  NextDnsCoverageSummary,
  NextDnsDeviceCoverage,
  NextDnsLogEntry,
  NextDnsLogFilters,
  NextDnsLogQueryResult,
} from '@/types/nextdns';

let pool: Pool | null = null;

export function getNextDnsPool(): Pool {
  if (pool) return pool;

  const connectionString = getNextDnsDbUrl();
  if (!connectionString) {
    throw new Error('NEXTDNS_LOG_DB_URL or DATABASE_URL is required for NextDNS log storage');
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return pool;
}

export async function ensureNextDnsSchema(clientOrPool: Pool | PoolClient = getNextDnsPool()): Promise<void> {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS nextdns_logs (
      profile_id TEXT NOT NULL,
      nextdns_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      domain TEXT NOT NULL,
      root TEXT,
      encrypted BOOLEAN,
      protocol TEXT,
      client_ip TEXT,
      client TEXT,
      device_id TEXT,
      device_name TEXT,
      device_model TEXT,
      status TEXT NOT NULL,
      reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw JSONB NOT NULL,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (profile_id, nextdns_id)
    )
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS nextdns_logs_timestamp_idx
      ON nextdns_logs (timestamp DESC)
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS nextdns_logs_profile_timestamp_idx
      ON nextdns_logs (profile_id, timestamp DESC)
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS nextdns_logs_device_id_timestamp_idx
      ON nextdns_logs (device_id, timestamp DESC)
      WHERE device_id IS NOT NULL
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS nextdns_logs_device_name_timestamp_idx
      ON nextdns_logs (lower(device_name), timestamp DESC)
      WHERE device_name IS NOT NULL
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS nextdns_logs_domain_idx
      ON nextdns_logs (lower(domain))
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS nextdns_ingest_state (
      profile_id TEXT PRIMARY KEY,
      last_timestamp TIMESTAMPTZ,
      stream_id TEXT,
      last_success_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function insertNextDnsLogs(logs: NextDnsLogEntry[]): Promise<number> {
  if (logs.length === 0) return 0;

  const client = await getNextDnsPool().connect();
  try {
    await client.query('BEGIN');
    await ensureNextDnsSchema(client);

    let inserted = 0;
    for (const log of logs) {
      const result = await client.query(
        `
          INSERT INTO nextdns_logs (
            profile_id, nextdns_id, timestamp, domain, root, encrypted, protocol,
            client_ip, client, device_id, device_name, device_model, status, reasons, raw
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
          ON CONFLICT (profile_id, nextdns_id) DO NOTHING
        `,
        [
          log.profile_id,
          log.id,
          log.timestamp,
          log.domain,
          log.root,
          log.encrypted,
          log.protocol,
          log.client_ip,
          log.client,
          log.device_id,
          log.device_name,
          log.device_model,
          log.status,
          JSON.stringify(log.reasons),
          JSON.stringify(log.raw || log),
        ],
      );
      inserted += result.rowCount || 0;
    }

    for (const profileId of new Set(logs.map((log) => log.profile_id))) {
      const latest = logs
        .filter((log) => log.profile_id === profileId)
        .map((log) => log.timestamp)
        .sort()
        .at(-1);
      await client.query(
        `
          INSERT INTO nextdns_ingest_state (profile_id, last_timestamp, last_success_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (profile_id) DO UPDATE
          SET
            last_timestamp = GREATEST(nextdns_ingest_state.last_timestamp, EXCLUDED.last_timestamp),
            last_success_at = NOW(),
            updated_at = NOW()
        `,
        [profileId, latest],
      );
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getNextDnsLastTimestamp(profileId: string): Promise<string | null> {
  await ensureNextDnsSchema();
  const result = await getNextDnsPool().query(
    'SELECT last_timestamp FROM nextdns_ingest_state WHERE profile_id = $1',
    [profileId],
  );
  return result.rows[0]?.last_timestamp?.toISOString() || null;
}

export async function pruneNextDnsLogs(retentionDays: number): Promise<number> {
  await ensureNextDnsSchema();
  const result = await getNextDnsPool().query(
    "DELETE FROM nextdns_logs WHERE timestamp < NOW() - ($1::text || ' days')::interval",
    [retentionDays],
  );
  return result.rowCount || 0;
}

export async function queryNextDnsLogs(filters: NextDnsLogFilters): Promise<NextDnsLogQueryResult> {
  await ensureNextDnsSchema();
  const limit = clampLimit(filters.limit);
  const where: string[] = [];
  const params: Array<string | number> = [];

  addParam(where, params, 'profile_id =', filters.profileId);
  addParam(where, params, 'status =', filters.status);
  addParam(where, params, 'timestamp >=', filters.from);
  addParam(where, params, 'timestamp <', filters.to);
  addParam(where, params, 'timestamp <', filters.before);

  if (filters.device) {
    params.push(filters.device.toLowerCase());
    where.push(`(lower(device_id) = $${params.length} OR lower(device_name) = $${params.length})`);
  }

  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`(lower(domain) LIKE $${params.length} OR lower(root) LIKE $${params.length})`);
  }

  params.push(limit + 1);
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const result = await getNextDnsPool().query(
    `
      SELECT
        profile_id, nextdns_id, timestamp, domain, root, encrypted, protocol,
        host(client_ip) AS client_ip, client, device_id, device_name, device_model,
        status, reasons, raw
      FROM nextdns_logs
      ${whereSql}
      ORDER BY timestamp DESC, nextdns_id DESC
      LIMIT $${params.length}
    `,
    params,
  );

  const rows = result.rows.slice(0, limit);
  return {
    logs: rows.map(rowToLogEntry),
    next_before: result.rows.length > limit ? rows.at(-1)?.timestamp?.toISOString() || null : null,
  };
}

export async function getNextDnsCoverageSummary(now = new Date()): Promise<NextDnsCoverageSummary> {
  await ensureNextDnsSchema();
  const devices = getExpectedChildDevices();
  const coverage = await Promise.all(devices.map((device) => getDeviceCoverage(device, now)));
  return {
    checked_at: now.toISOString(),
    max_silent_minutes_default: getDefaultChildSilenceMinutes(),
    devices: coverage,
    alerts: coverage.filter((row) => row.status !== 'ok'),
  };
}

async function getDeviceCoverage(device: ExpectedChildDevice, now: Date): Promise<NextDnsDeviceCoverage> {
  const where: string[] = [];
  const params: Array<string | string[]> = [];
  const normalizedIds = device.device_ids.map((value) => value.toLowerCase());
  const normalizedNames = device.device_names.map((value) => value.toLowerCase());

  if (normalizedIds.length > 0) {
    params.push(normalizedIds);
    where.push(`lower(device_id) = ANY($${params.length})`);
  }
  if (normalizedNames.length > 0) {
    params.push(normalizedNames);
    where.push(`lower(device_name) = ANY($${params.length})`);
  }

  if (where.length === 0) {
    return emptyCoverage(device);
  }

  if (device.profile_ids.length > 0) {
    params.push(device.profile_ids);
    where.push(`profile_id = ANY($${params.length})`);
  }

  const result = await getNextDnsPool().query(
    `
      SELECT timestamp, domain, device_id, device_name
      FROM nextdns_logs
      WHERE (${where.slice(0, normalizedIds.length > 0 && normalizedNames.length > 0 ? 2 : 1).join(' OR ')})
        ${device.profile_ids.length > 0 ? `AND ${where.at(-1)}` : ''}
      ORDER BY timestamp DESC
      LIMIT 100
    `,
    params,
  );

  const latest = result.rows[0];
  if (!latest?.timestamp) {
    return emptyCoverage(device);
  }

  const lastSeenAt = latest.timestamp as Date;
  const minutesSinceSeen = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 60000));
  const matchedBy = latest.device_id && normalizedIds.includes(String(latest.device_id).toLowerCase())
    ? 'device_id'
    : 'device_name';

  return {
    device,
    status: minutesSinceSeen > device.max_silent_minutes ? 'warning' : 'ok',
    last_seen_at: lastSeenAt.toISOString(),
    last_domain: latest.domain || null,
    matched_by: matchedBy,
    minutes_since_seen: minutesSinceSeen,
    recent_count: result.rowCount || 0,
  };
}

function emptyCoverage(device: ExpectedChildDevice): NextDnsDeviceCoverage {
  return {
    device,
    status: 'unknown',
    last_seen_at: null,
    last_domain: null,
    matched_by: null,
    minutes_since_seen: null,
    recent_count: 0,
  };
}

function addParam(where: string[], params: Array<string | number>, clause: string, value: string | undefined): void {
  if (!value) return;
  params.push(value);
  where.push(`${clause} $${params.length}`);
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return 100;
  return Math.max(10, Math.min(Math.floor(limit), 500));
}

function rowToLogEntry(row: Record<string, unknown>): NextDnsLogEntry {
  return {
    id: String(row.nextdns_id),
    profile_id: String(row.profile_id),
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    domain: String(row.domain),
    root: nullableString(row.root),
    encrypted: typeof row.encrypted === 'boolean' ? row.encrypted : null,
    protocol: nullableString(row.protocol),
    client_ip: nullableString(row.client_ip),
    client: nullableString(row.client),
    device_id: nullableString(row.device_id),
    device_name: nullableString(row.device_name),
    device_model: nullableString(row.device_model),
    status: String(row.status),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    raw: row.raw,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
