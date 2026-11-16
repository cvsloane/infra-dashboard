import { NextResponse } from 'next/server';
import { authenticateActivityDevice, parseDeviceActivity } from '@/lib/activity-events/device-upload';
import { resolveRobloxTitles } from '@/lib/activity-events/roblox-titles';
import { insertHomeActivityEvents } from '@/lib/activity-events/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const device = (request.headers.get('x-home-device') || '').toUpperCase();
  const auth = request.headers.get('authorization') || '';
  const enrollment = authenticateActivityDevice(device, auth.startsWith('Bearer ') ? auth.slice(7) : '', process.env.HOME_ACTIVITY_DEVICE_KEYS);
  if (!enrollment) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json({ error: 'Upload batch too large' }, { status: 413 });
      }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const events = parseDeviceActivity(body, device, enrollment.child);
    if (!events) return NextResponse.json({ error: 'Invalid device activity batch' }, { status: 400 });
    await resolveRobloxTitles(events);
    const inserted = await insertHomeActivityEvents(events);
    return NextResponse.json({ ok: true, received: events.length, inserted });
  } catch {
    return NextResponse.json({ error: 'Device activity upload failed' }, { status: 500 });
  }
}
