import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getHomeActivityDbUrl, getHomeActivityPool, ensureHomeActivitySchema } from '@/lib/activity-events/db';
import devices from '../../../../../config/home-activity-devices.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!getHomeActivityDbUrl()) return NextResponse.json({ configured: false, devices: [] });
  try {
    await ensureHomeActivitySchema();
    const { rows } = await getHomeActivityPool().query(`
      SELECT DISTINCT ON (lower(device_id)) device_id, event_timestamp, ingested_at, metadata
      FROM home_activity_events WHERE event_type = 'heartbeat'
        AND metadata->>'collector_version' = '2'
        AND lower(device_id) = ANY($1::text[])
      ORDER BY lower(device_id), event_timestamp DESC, ingested_at DESC
    `, [devices.map(device => device.device_id.toLowerCase())]);
    return NextResponse.json({ configured: true, devices: devices.map(device => {
      const row = rows.find(item => item.device_id.toLowerCase() === device.device_id.toLowerCase());
      return { child: device.child, device_id: device.device_id, last_collected: row?.event_timestamp || null, last_uploaded: row?.ingested_at || null, errors: Array.isArray(row?.metadata?.errors) ? row.metadata.errors : [], local_collection: row?.metadata?.away_collection === true };
    }) });
  } catch {
    return NextResponse.json({ error: 'Activity coverage unavailable' }, { status: 500 });
  }
}
