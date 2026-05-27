export type HomeActivitySource = 'browser_history' | 'app_log' | 'account_export' | 'dns_log' | 'manual';

export type HomeActivityEventType =
  | 'web_visit'
  | 'search'
  | 'youtube_video'
  | 'ai_usage'
  | 'roblox_game'
  | 'app_activity'
  | 'heartbeat';

export interface HomeActivityEventInput {
  source_event_id: string;
  event_timestamp: string;
  child?: string | null;
  device_id?: string | null;
  hostname?: string | null;
  windows_user?: string | null;
  source: HomeActivitySource;
  event_type: HomeActivityEventType;
  app?: string | null;
  browser?: string | null;
  profile?: string | null;
  url?: string | null;
  domain?: string | null;
  title?: string | null;
  search_query?: string | null;
  video_id?: string | null;
  place_id?: string | null;
  ai_service?: string | null;
  confidence?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface HomeActivityEvent extends HomeActivityEventInput {
  id: string;
  ingested_at: string;
}

export interface HomeActivityEventFilters {
  child?: string;
  device?: string;
  source?: string;
  eventType?: string;
  app?: string;
  domain?: string;
  search?: string;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
}

export interface HomeActivityEventQueryResult {
  events: HomeActivityEvent[];
  next_before: string | null;
}
