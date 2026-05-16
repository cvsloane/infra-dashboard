export type NextDnsLogStatus = 'default' | 'allowed' | 'blocked' | 'error' | string;

export interface NextDnsLogEntry {
  id: string;
  profile_id: string;
  timestamp: string;
  domain: string;
  root?: string | null;
  encrypted?: boolean | null;
  protocol?: string | null;
  client_ip?: string | null;
  client?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  device_model?: string | null;
  status: NextDnsLogStatus;
  reasons: string[];
  raw?: unknown;
}

export interface NextDnsLogFilters {
  profileId?: string;
  device?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
}

export interface NextDnsLogQueryResult {
  configured?: boolean;
  logs: NextDnsLogEntry[];
  next_before: string | null;
  total?: number;
}

export interface ExpectedChildDevice {
  id: string;
  name: string;
  device_ids: string[];
  device_names: string[];
  profile_ids: string[];
  max_silent_minutes: number;
}

export interface NextDnsDeviceCoverage {
  device: ExpectedChildDevice;
  status: 'ok' | 'warning' | 'unknown';
  last_seen_at: string | null;
  last_domain: string | null;
  matched_by: 'device_id' | 'device_name' | null;
  minutes_since_seen: number | null;
  recent_count: number;
}

export interface NextDnsCoverageSummary {
  configured?: boolean;
  checked_at: string;
  max_silent_minutes_default: number;
  devices: NextDnsDeviceCoverage[];
  alerts: NextDnsDeviceCoverage[];
}
