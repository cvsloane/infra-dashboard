import type { ExpectedChildDevice } from '@/types/nextdns';

const DEFAULT_CHILD_SILENCE_MINUTES = 60;

export function getNextDnsDbUrl(): string | undefined {
  return process.env.NEXTDNS_LOG_DB_URL || process.env.DATABASE_URL;
}

export function getNextDnsProfileIds(): string[] {
  return splitList(process.env.NEXTDNS_PROFILE_IDS);
}

export function getNextDnsApiKey(): string | undefined {
  return process.env.NEXTDNS_API_KEY;
}

export function getNextDnsRetentionDays(): number {
  return positiveIntFromEnv('NEXTDNS_LOG_RETENTION_DAYS', 30);
}

export function getDefaultChildSilenceMinutes(): number {
  return positiveIntFromEnv('NEXTDNS_CHILD_DEVICE_MAX_SILENT_MINUTES', DEFAULT_CHILD_SILENCE_MINUTES);
}

export function getExpectedChildDevices(): ExpectedChildDevice[] {
  const raw = process.env.NEXTDNS_EXPECTED_CHILD_DEVICES;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const defaultSilence = getDefaultChildSilenceMinutes();
  return parsed.flatMap((row, index) => {
    if (!row || typeof row !== 'object') return [];
    const candidate = row as Record<string, unknown>;
    const name = stringValue(candidate.name);
    if (!name) return [];

    const id = stringValue(candidate.id) || slugify(name) || `child-device-${index + 1}`;
    return [{
      id,
      name,
      device_ids: stringList(candidate.device_ids || candidate.deviceIds || candidate.device_id || candidate.deviceId),
      device_names: stringList(candidate.device_names || candidate.deviceNames || candidate.device_name || candidate.deviceName || name),
      profile_ids: stringList(candidate.profile_ids || candidate.profileIds || candidate.profile_id || candidate.profileId),
      max_silent_minutes: positiveInt(candidate.max_silent_minutes || candidate.maxSilentMinutes, defaultSilence),
    }];
  });
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.includes(',') ? splitList(value) : [value.trim()].filter(Boolean);
  }
  return [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  return positiveInt(process.env[name], fallback);
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
