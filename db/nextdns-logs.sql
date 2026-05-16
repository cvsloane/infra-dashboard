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
);

CREATE INDEX IF NOT EXISTS nextdns_logs_timestamp_idx
  ON nextdns_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS nextdns_logs_profile_timestamp_idx
  ON nextdns_logs (profile_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS nextdns_logs_device_id_timestamp_idx
  ON nextdns_logs (device_id, timestamp DESC)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS nextdns_logs_device_name_timestamp_idx
  ON nextdns_logs (lower(device_name), timestamp DESC)
  WHERE device_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS nextdns_logs_domain_idx
  ON nextdns_logs (lower(domain));

CREATE TABLE IF NOT EXISTS nextdns_ingest_state (
  profile_id TEXT PRIMARY KEY,
  last_timestamp TIMESTAMPTZ,
  stream_id TEXT,
  last_success_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
