import { createHash } from 'crypto';
import type { NextDnsLogEntry } from '@/types/nextdns';

export interface RawNextDnsLog {
  id?: unknown;
  timestamp?: unknown;
  domain?: unknown;
  root?: unknown;
  encrypted?: unknown;
  protocol?: unknown;
  clientIp?: unknown;
  client_ip?: unknown;
  client?: unknown;
  device?: unknown;
  status?: unknown;
  reasons?: unknown;
  [key: string]: unknown;
}

export function normalizeNextDnsLog(profileId: string, raw: RawNextDnsLog): NextDnsLogEntry | null {
  const timestamp = stringValue(raw.timestamp);
  const domain = stringValue(raw.domain);
  if (!timestamp || Number.isNaN(Date.parse(timestamp)) || !domain) {
    return null;
  }

  const device = raw.device && typeof raw.device === 'object' ? raw.device as Record<string, unknown> : {};
  const clientIp = stringValue(raw.clientIp) || stringValue(raw.client_ip);
  const id = stringValue(raw.id) || fallbackId(profileId, timestamp, domain, clientIp, stringValue(device.id), stringValue(raw.status));

  return {
    id,
    profile_id: profileId,
    timestamp,
    domain,
    root: stringValue(raw.root),
    encrypted: typeof raw.encrypted === 'boolean' ? raw.encrypted : null,
    protocol: stringValue(raw.protocol),
    client_ip: clientIp,
    client: stringValue(raw.client),
    device_id: stringValue(device.id),
    device_name: stringValue(device.name),
    device_model: stringValue(device.model),
    status: stringValue(raw.status) || 'default',
    reasons: Array.isArray(raw.reasons) ? raw.reasons.map((reason) => String(reason)).filter(Boolean) : [],
    raw,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fallbackId(
  profileId: string,
  timestamp: string,
  domain: string,
  clientIp: string | null,
  deviceId: string | null,
  status: string | null,
): string {
  return createHash('sha256')
    .update([profileId, timestamp, domain, clientIp || '', deviceId || '', status || ''].join('\0'))
    .digest('hex')
    .slice(0, 32);
}
