import { Pool, type PoolClient } from 'pg';
import { getNextDnsDbUrl } from '@/lib/nextdns/config';
import type {
  HomeActivityEvent,
  HomeActivityEventFilters,
  HomeActivityEventInput,
  HomeActivityEventQueryResult,
} from '@/types/activity-events';

let pool: Pool | null = null;

export function getHomeActivityDbUrl(): string | undefined {
  return process.env.HOME_ACTIVITY_DB_URL || getNextDnsDbUrl();
}

export function getHomeActivityPool(): Pool {
  if (pool) return pool;

  const connectionString = getHomeActivityDbUrl();
  if (!connectionString) {
    throw new Error('HOME_ACTIVITY_DB_URL, NEXTDNS_LOG_DB_URL, or DATABASE_URL is required for home activity storage');
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return pool;
}

export async function ensureHomeActivitySchema(clientOrPool: Pool | PoolClient = getHomeActivityPool()): Promise<void> {
  await clientOrPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS home_activity_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_event_id TEXT NOT NULL UNIQUE,
      event_timestamp TIMESTAMPTZ NOT NULL,
      child TEXT,
      device_id TEXT,
      hostname TEXT,
      windows_user TEXT,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      app TEXT,
      browser TEXT,
      profile TEXT,
      url TEXT,
      domain TEXT,
      title TEXT,
      search_query TEXT,
      video_id TEXT,
      place_id TEXT,
      ai_service TEXT,
      confidence REAL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS home_activity_events_timestamp_idx
      ON home_activity_events (event_timestamp DESC)
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS home_activity_events_child_timestamp_idx
      ON home_activity_events (lower(child), event_timestamp DESC)
      WHERE child IS NOT NULL
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS home_activity_events_device_timestamp_idx
      ON home_activity_events (lower(device_id), event_timestamp DESC)
      WHERE device_id IS NOT NULL
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS home_activity_events_hostname_timestamp_idx
      ON home_activity_events (lower(hostname), event_timestamp DESC)
      WHERE hostname IS NOT NULL
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS home_activity_events_domain_idx
      ON home_activity_events (lower(domain))
      WHERE domain IS NOT NULL
  `);
  await clientOrPool.query(`
    CREATE INDEX IF NOT EXISTS home_activity_events_type_timestamp_idx
      ON home_activity_events (event_type, event_timestamp DESC)
  `);
}

export async function insertHomeActivityEvents(events: HomeActivityEventInput[]): Promise<number> {
  if (events.length === 0) return 0;

  const client = await getHomeActivityPool().connect();
  try {
    await client.query('BEGIN');
    await ensureHomeActivitySchema(client);

    let inserted = 0;
    for (const event of events) {
      const result = await client.query(
        `
          INSERT INTO home_activity_events (
            source_event_id, event_timestamp, child, device_id, hostname, windows_user,
            source, event_type, app, browser, profile, url, domain, title,
            search_query, video_id, place_id, ai_service, confidence, metadata
          )
          VALUES (
            $1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''),
            $7, $8, NULLIF($9, ''), NULLIF($10, ''), NULLIF($11, ''), NULLIF($12, ''),
            NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''),
            NULLIF($17, ''), NULLIF($18, ''), $19, $20::jsonb
          )
          ON CONFLICT (source_event_id) DO NOTHING
        `,
        [
          event.source_event_id,
          event.event_timestamp,
          event.child || '',
          event.device_id || '',
          event.hostname || '',
          event.windows_user || '',
          event.source,
          event.event_type,
          event.app || '',
          event.browser || '',
          event.profile || '',
          event.url || '',
          event.domain || '',
          event.title || '',
          event.search_query || '',
          event.video_id || '',
          event.place_id || '',
          event.ai_service || '',
          boundedConfidence(event.confidence),
          JSON.stringify(event.metadata || {}),
        ],
      );
      inserted += result.rowCount || 0;
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

export async function queryHomeActivityEvents(filters: HomeActivityEventFilters): Promise<HomeActivityEventQueryResult> {
  await ensureHomeActivitySchema();
  const limit = clampLimit(filters.limit);
  const where: string[] = [];
  const params: Array<string | number> = [];

  addParam(where, params, 'source =', filters.source);
  addParam(where, params, 'event_type =', filters.eventType);
  addParam(where, params, 'app =', filters.app);
  addParam(where, params, 'event_timestamp >=', filters.from);
  addParam(where, params, 'event_timestamp <', filters.to);
  addParam(where, params, 'event_timestamp <', filters.before);

  if (filters.child) {
    params.push(filters.child.toLowerCase());
    where.push(`lower(child) = $${params.length}`);
  }

  if (filters.device) {
    params.push(filters.device.toLowerCase());
    where.push(`(lower(device_id) = $${params.length} OR lower(hostname) = $${params.length})`);
  }

  if (filters.domain) {
    params.push(filters.domain.toLowerCase());
    where.push(`lower(domain) = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`(
      lower(coalesce(url, '')) LIKE $${params.length}
      OR lower(coalesce(title, '')) LIKE $${params.length}
      OR lower(coalesce(search_query, '')) LIKE $${params.length}
      OR lower(coalesce(domain, '')) LIKE $${params.length}
    )`);
  }

  params.push(limit + 1);
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const result = await getHomeActivityPool().query(
    `
      SELECT
        id, source_event_id, event_timestamp, child, device_id, hostname, windows_user,
        source, event_type, app, browser, profile, url, domain, title,
        search_query, video_id, place_id, ai_service, confidence, metadata, ingested_at
      FROM home_activity_events
      ${whereSql}
      ORDER BY event_timestamp DESC, source_event_id DESC
      LIMIT $${params.length}
    `,
    params,
  );

  const rows = result.rows.slice(0, limit);
  return {
    events: rows.map(rowToEvent),
    next_before: result.rows.length > limit ? rows.at(-1)?.event_timestamp?.toISOString() || null : null,
  };
}

function rowToEvent(row: Record<string, unknown>): HomeActivityEvent {
  return {
    id: String(row.id),
    source_event_id: String(row.source_event_id),
    event_timestamp: dateString(row.event_timestamp),
    child: nullableString(row.child),
    device_id: nullableString(row.device_id),
    hostname: nullableString(row.hostname),
    windows_user: nullableString(row.windows_user),
    source: String(row.source) as HomeActivityEvent['source'],
    event_type: String(row.event_type) as HomeActivityEvent['event_type'],
    app: nullableString(row.app),
    browser: nullableString(row.browser),
    profile: nullableString(row.profile),
    url: nullableString(row.url),
    domain: nullableString(row.domain),
    title: nullableString(row.title),
    search_query: nullableString(row.search_query),
    video_id: nullableString(row.video_id),
    place_id: nullableString(row.place_id),
    ai_service: nullableString(row.ai_service),
    confidence: typeof row.confidence === 'number' ? row.confidence : null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    ingested_at: dateString(row.ingested_at),
  };
}

function addParam(where: string[], params: Array<string | number>, clause: string, value: string | undefined): void {
  if (!value) return;
  params.push(value);
  where.push(`${clause} $${params.length}`);
}

function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.trunc(value), 1), 500);
}

function boundedConfidence(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), 1);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function dateString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
