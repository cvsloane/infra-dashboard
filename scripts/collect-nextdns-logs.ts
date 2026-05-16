#!/usr/bin/env tsx

import { getNextDnsApiKey, getNextDnsProfileIds, getNextDnsRetentionDays } from '../src/lib/nextdns/config';
import { getNextDnsLastTimestamp, insertNextDnsLogs, pruneNextDnsLogs } from '../src/lib/nextdns/db';
import { normalizeNextDnsLog, type RawNextDnsLog } from '../src/lib/nextdns/normalize';

interface CollectorArgs {
  once: boolean;
  profiles: string[];
  lookbackMinutes: number;
  limit: number;
  maxPages: number;
  prune: boolean;
}

interface NextDnsLogsResponse {
  data?: RawNextDnsLog[];
  meta?: {
    pagination?: {
      cursor?: string;
    };
    stream?: {
      id?: string;
    };
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getNextDnsApiKey();
  if (!apiKey) {
    throw new Error('NEXTDNS_API_KEY is required');
  }

  const profiles = args.profiles.length > 0 ? args.profiles : getNextDnsProfileIds();
  if (profiles.length === 0) {
    throw new Error('NEXTDNS_PROFILE_IDS or --profile is required');
  }

  let totalFetched = 0;
  let totalStored = 0;
  for (const profileId of profiles) {
    const from = await getFetchStart(profileId, args.lookbackMinutes);
    const logs = await fetchProfileLogs({
      apiKey,
      profileId,
      from,
      limit: args.limit,
      maxPages: args.maxPages,
    });
    const normalized = logs.flatMap((log) => {
      const entry = normalizeNextDnsLog(profileId, log);
      return entry ? [entry] : [];
    });
    const stored = await insertNextDnsLogs(normalized);
    totalFetched += logs.length;
    totalStored += stored;
    console.log(JSON.stringify({ profile_id: profileId, fetched: logs.length, normalized: normalized.length, stored }));
  }

  let pruned = 0;
  if (args.prune) {
    pruned = await pruneNextDnsLogs(getNextDnsRetentionDays());
  }

  console.log(JSON.stringify({ ok: true, profiles: profiles.length, fetched: totalFetched, stored: totalStored, pruned }));
}

async function getFetchStart(profileId: string, lookbackMinutes: number): Promise<string> {
  const lastTimestamp = await getNextDnsLastTimestamp(profileId);
  const baseMs = lastTimestamp ? Date.parse(lastTimestamp) : Date.now();
  const fromMs = baseMs - lookbackMinutes * 60_000;
  return new Date(fromMs).toISOString();
}

async function fetchProfileLogs(options: {
  apiKey: string;
  profileId: string;
  from: string;
  limit: number;
  maxPages: number;
}): Promise<RawNextDnsLog[]> {
  const out: RawNextDnsLog[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < options.maxPages; page += 1) {
    const url = new URL(`https://api.nextdns.io/profiles/${encodeURIComponent(options.profileId)}/logs`);
    url.searchParams.set('from', options.from);
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('limit', String(options.limit));
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url, {
      headers: {
        'X-Api-Key': options.apiKey,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`NextDNS logs request failed for ${options.profileId}: ${response.status}`);
    }

    const payload = await response.json() as NextDnsLogsResponse;
    const rows = Array.isArray(payload.data) ? payload.data : [];
    out.push(...rows);
    cursor = payload.meta?.pagination?.cursor;
    if (!cursor || rows.length === 0) break;
  }

  return out;
}

function parseArgs(argv: string[]): CollectorArgs {
  const args: CollectorArgs = {
    once: false,
    profiles: [],
    lookbackMinutes: positiveInt(process.env.NEXTDNS_LOG_LOOKBACK_MINUTES, 15),
    limit: positiveInt(process.env.NEXTDNS_LOG_FETCH_LIMIT, 1000),
    maxPages: positiveInt(process.env.NEXTDNS_LOG_FETCH_MAX_PAGES, 5),
    prune: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--once') {
      args.once = true;
    } else if (arg === '--profile' && next) {
      args.profiles.push(next);
      i += 1;
    } else if (arg === '--lookback-minutes' && next) {
      args.lookbackMinutes = positiveInt(next, args.lookbackMinutes);
      i += 1;
    } else if (arg === '--limit' && next) {
      args.limit = Math.max(10, Math.min(positiveInt(next, args.limit), 1000));
      i += 1;
    } else if (arg === '--max-pages' && next) {
      args.maxPages = positiveInt(next, args.maxPages);
      i += 1;
    } else if (arg === '--no-prune') {
      args.prune = false;
    }
  }

  args.limit = Math.max(10, Math.min(args.limit, 1000));
  return args;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
