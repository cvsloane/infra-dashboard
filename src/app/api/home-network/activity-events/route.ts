import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import {
  getHomeActivityDbUrl,
  insertHomeActivityEvents,
  queryHomeActivityEvents,
} from '@/lib/activity-events/db';
import type { HomeActivityEventInput } from '@/types/activity-events';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    if (!getHomeActivityDbUrl()) {
      return NextResponse.json({ configured: false, events: [], next_before: null });
    }

    const result = await queryHomeActivityEvents({
      child: optionalParam(url, 'child'),
      device: optionalParam(url, 'device'),
      source: optionalParam(url, 'source'),
      eventType: optionalParam(url, 'event_type'),
      app: optionalParam(url, 'app'),
      domain: optionalParam(url, 'domain'),
      search: optionalParam(url, 'search'),
      from: optionalParam(url, 'from'),
      to: optionalParam(url, 'to'),
      before: optionalParam(url, 'before'),
      limit: intParam(url, 'limit'),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch home activity events:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch home activity events' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isIngestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }

  const events = parseEvents(body);
  if (!events.ok) {
    return NextResponse.json({ error: events.error }, { status: 400 });
  }

  try {
    const inserted = await insertHomeActivityEvents(events.events);
    return NextResponse.json({ ok: true, received: events.events.length, inserted });
  } catch (error) {
    console.error('Failed to ingest home activity events:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ingest home activity events' },
      { status: 500 },
    );
  }
}

function parseEvents(body: unknown): { ok: true; events: HomeActivityEventInput[] } | { ok: false; error: string } {
  const events: unknown[] | null = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : null;

  if (!events) return { ok: false, error: 'Expected JSON array or object with events array' };
  if (events.length > 1000) return { ok: false, error: 'At most 1000 events can be ingested per request' };

  const parsed: HomeActivityEventInput[] = [];
  for (const [index, raw] of events.entries()) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `events[${index}] must be an object` };
    }
    const event = raw as Record<string, unknown>;
    const sourceEventId = stringValue(event.source_event_id);
    const eventTimestamp = stringValue(event.event_timestamp);
    const source = stringValue(event.source);
    const eventType = stringValue(event.event_type);

    if (!sourceEventId || !eventTimestamp || !source || !eventType) {
      return { ok: false, error: `events[${index}] is missing source_event_id, event_timestamp, source, or event_type` };
    }
    if (Number.isNaN(Date.parse(eventTimestamp))) {
      return { ok: false, error: `events[${index}].event_timestamp is not a valid timestamp` };
    }

    parsed.push({
      source_event_id: sourceEventId,
      event_timestamp: eventTimestamp,
      child: stringValue(event.child),
      device_id: stringValue(event.device_id),
      hostname: stringValue(event.hostname),
      windows_user: stringValue(event.windows_user),
      source: source as HomeActivityEventInput['source'],
      event_type: eventType as HomeActivityEventInput['event_type'],
      app: stringValue(event.app),
      browser: stringValue(event.browser),
      profile: stringValue(event.profile),
      url: stringValue(event.url),
      domain: stringValue(event.domain),
      title: stringValue(event.title),
      search_query: stringValue(event.search_query),
      video_id: stringValue(event.video_id),
      place_id: stringValue(event.place_id),
      ai_service: stringValue(event.ai_service),
      confidence: numberValue(event.confidence),
      metadata: event.metadata && typeof event.metadata === 'object'
        ? event.metadata as Record<string, unknown>
        : {},
    });
  }

  return { ok: true, events: parsed };
}

function isIngestAuthorized(request: Request): boolean {
  const expected = process.env.HOME_ACTIVITY_INGEST_TOKEN || process.env.HOME_NETWORK_INGEST_TOKEN;
  if (!expected) return false;

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const headerToken = request.headers.get('x-ingest-token') || '';

  return constantTimeEqual(bearer, expected) || constantTimeEqual(headerToken, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function optionalParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

function intParam(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}
