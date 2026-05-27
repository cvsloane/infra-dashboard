CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
);

CREATE INDEX IF NOT EXISTS home_activity_events_timestamp_idx
  ON home_activity_events (event_timestamp DESC);

CREATE INDEX IF NOT EXISTS home_activity_events_child_timestamp_idx
  ON home_activity_events (lower(child), event_timestamp DESC)
  WHERE child IS NOT NULL;

CREATE INDEX IF NOT EXISTS home_activity_events_device_timestamp_idx
  ON home_activity_events (lower(device_id), event_timestamp DESC)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS home_activity_events_hostname_timestamp_idx
  ON home_activity_events (lower(hostname), event_timestamp DESC)
  WHERE hostname IS NOT NULL;

CREATE INDEX IF NOT EXISTS home_activity_events_domain_idx
  ON home_activity_events (lower(domain))
  WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS home_activity_events_type_timestamp_idx
  ON home_activity_events (event_type, event_timestamp DESC);
