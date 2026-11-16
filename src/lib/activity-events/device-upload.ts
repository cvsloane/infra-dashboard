import { createHash } from 'node:crypto';
import { secureCompare } from '@/lib/secure-compare';
import type { HomeActivityEventInput } from '@/types/activity-events';

type Enrollment = { child: string; key_hash: string };
export function authenticateActivityDevice(device: string, key: string, configuration: string | undefined): Enrollment | null {
  if (!configuration || !device || !key) return null;
  try {
    const enrollment = (JSON.parse(configuration) as Record<string, Enrollment>)[device];
    if (!enrollment || !/^[a-z][a-z0-9-]*$/.test(enrollment.child) || !/^[a-f0-9]{64}$/.test(enrollment.key_hash)) return null;
    return secureCompare(createHash('sha256').update(key).digest('hex'), enrollment.key_hash) ? enrollment : null;
  } catch { return null; }
}

export function parseDeviceActivity(body: unknown, device: string, child: string): HomeActivityEventInput[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { events?: unknown }).events)) return null;
  const rawEvents = (body as { events: unknown[] }).events;
  if (rawEvents.length > 500) return null;
  const events: HomeActivityEventInput[] = [];
  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as HomeActivityEventInput;
    if (e.device_id !== device || e.hostname !== device || e.child !== child || !/^endpoint:[a-f0-9]{64}$/.test(e.source_event_id) || !Number.isFinite(Date.parse(e.event_timestamp))) return null;
    if (!['browser_history', 'app_log'].includes(e.source) || !['youtube_video', 'roblox_game', 'heartbeat'].includes(e.event_type)) return null;
    if (!e.metadata || Array.isArray(e.metadata) || e.metadata.collector_version !== 2 || JSON.stringify(e.metadata).length > 65536) return null;
    if (e.event_type === 'youtube_video' && (e.source !== 'browser_history' || !/^[A-Za-z0-9_-]{11}$/.test(e.video_id || '') || e.metadata.evidence !== 'local_page_visit' || e.metadata.local_only !== true)) return null;
    if (e.event_type === 'roblox_game' && !/^\d+$/.test(e.place_id || '')) return null;
    if (e.event_type === 'heartbeat' && e.source !== 'app_log') return null;
    const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 2000) : null;
    events.push({
      source_event_id: e.source_event_id, event_timestamp: e.event_timestamp, device_id: device, hostname: device, child,
      source: e.source, event_type: e.event_type, windows_user: text(e.windows_user), app: text(e.app), browser: text(e.browser), profile: text(e.profile), title: text(e.title),
      video_id: e.event_type === 'youtube_video' ? e.video_id : null, place_id: e.event_type === 'roblox_game' ? e.place_id : null,
      url: e.event_type === 'youtube_video' ? `https://www.youtube.com/watch?v=${e.video_id}` : e.event_type === 'roblox_game' ? `https://www.roblox.com/games/${e.place_id}` : null,
      domain: e.event_type === 'youtube_video' ? 'youtube.com' : e.event_type === 'roblox_game' ? 'roblox.com' : null,
      metadata: e.metadata,
    });
  }
  return events;
}
