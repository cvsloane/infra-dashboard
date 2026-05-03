import { getRedis } from '@/lib/redis/client';
import {
  buildHomeNetworkReadResponse,
  getHomeNetworkHistoryLimit,
  getHomeNetworkMaxAgeSec,
  validateHomeNetworkSnapshot,
  validateSnapshotFreshForIngest,
} from '@/lib/home-network/status';
import type {
  HomeNetworkHistoryEntry,
  HomeNetworkReadResponse,
  HomeNetworkSnapshot,
} from '@/types/home-network';

export {
  buildHomeNetworkReadResponse,
  computeHomeNetworkStatus,
  getHomeNetworkHistoryLimit,
  getHomeNetworkIngestRejectAgeSec,
  getHomeNetworkMaxAgeSec,
  validateHomeNetworkSnapshot,
  validateSnapshotFreshForIngest,
} from '@/lib/home-network/status';

export const HOME_NETWORK_LATEST_KEY = 'home-network:latest';
export const HOME_NETWORK_HISTORY_KEY = 'home-network:history';
export const HOME_NETWORK_LAST_COLLECTED_KEY = 'home-network:meta:last-collected-at';

export async function storeHomeNetworkSnapshot(snapshot: HomeNetworkSnapshot): Promise<HomeNetworkHistoryEntry> {
  const client = getRedis();
  const historyEntry = makeHistoryEntry(snapshot);
  const pipeline = client.pipeline();
  pipeline.set(HOME_NETWORK_LATEST_KEY, JSON.stringify(snapshot));
  pipeline.set(HOME_NETWORK_LAST_COLLECTED_KEY, snapshot.collected_at);
  pipeline.lpush(HOME_NETWORK_HISTORY_KEY, JSON.stringify(historyEntry));
  pipeline.ltrim(HOME_NETWORK_HISTORY_KEY, 0, getHomeNetworkHistoryLimit() - 1);
  await pipeline.exec();
  return historyEntry;
}

export async function getHomeNetworkReadModel(): Promise<HomeNetworkReadResponse> {
  const client = getRedis();
  const [rawLatest, rawHistory] = await Promise.all([
    client.get(HOME_NETWORK_LATEST_KEY),
    client.lrange(HOME_NETWORK_HISTORY_KEY, 0, getHomeNetworkHistoryLimit() - 1),
  ]);

  const history = rawHistory.flatMap((raw) => {
    try {
      return [JSON.parse(raw) as HomeNetworkHistoryEntry];
    } catch {
      return [];
    }
  });

  if (!rawLatest) {
    return {
      status: 'unknown',
      message: 'No home network snapshot has been ingested',
      checked_at: new Date().toISOString(),
      snapshot: null,
      history,
      age_sec: null,
      max_age_sec: getHomeNetworkMaxAgeSec(),
      computed_warnings: [],
    };
  }

  try {
    const parsed = JSON.parse(rawLatest) as unknown;
    const validation = validateHomeNetworkSnapshot(parsed);
    if (!validation.ok || !validation.snapshot) {
      return invalidStoredSnapshotResponse(validation.error || 'Stored home network snapshot is invalid', history);
    }

    return buildHomeNetworkReadResponse(validation.snapshot, history);
  } catch {
    return invalidStoredSnapshotResponse('Stored home network snapshot is not valid JSON', history);
  }
}

function invalidStoredSnapshotResponse(
  message: string,
  history: HomeNetworkHistoryEntry[],
): HomeNetworkReadResponse {
  return {
    status: 'error',
    message,
    checked_at: new Date().toISOString(),
    snapshot: null,
    history,
    age_sec: null,
    max_age_sec: getHomeNetworkMaxAgeSec(),
    computed_warnings: [message],
  };
}

function makeHistoryEntry(snapshot: HomeNetworkSnapshot): HomeNetworkHistoryEntry {
  return {
    collected_at: snapshot.collected_at,
    status: snapshot.status,
    router_count: snapshot.routers.length,
    client_count: snapshot.clients.length,
    warning_count: snapshot.warnings.length,
    unreachable_router_count: snapshot.routers.filter((router) => !router.reachable).length,
  };
}
