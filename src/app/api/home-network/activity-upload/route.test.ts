import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const insert = vi.hoisted(() => vi.fn(async () => 1));
vi.mock('@/lib/activity-events/db', () => ({ insertHomeActivityEvents: insert }));
vi.mock('@/lib/activity-events/roblox-titles', () => ({ resolveRobloxTitles: vi.fn(async () => undefined) }));
import { POST } from './route';
const device = 'CHLOE-LAPTOP';
const valid = { source_event_id: `endpoint:${'a'.repeat(64)}`, event_timestamp: '2026-11-16T15:00:00Z', device_id: device, hostname: device, child: 'chloe', source: 'browser_history', event_type: 'youtube_video', video_id: 'dQw4w9WgXcQ', metadata: { collector_version: 2, evidence: 'local_page_visit', local_only: true } };
function request(body: string, authorized = true) {
  vi.stubEnv('HOME_ACTIVITY_DEVICE_KEYS', JSON.stringify({ [device]: { child: 'chloe', key_hash: createHash('sha256').update('test-key').digest('hex') } }));
  return new Request('https://example.com/api/home-network/activity-upload', { method: 'POST', headers: { 'X-Home-Device': device, Authorization: authorized ? 'Bearer test-key' : 'Bearer wrong' }, body });
}
afterEach(() => { vi.unstubAllEnvs(); insert.mockClear(); });
describe('device upload HTTP boundary', () => {
 it('rejects unauthenticated uploads before parsing', async () => expect((await POST(request('invalid', false))).status).toBe(401));
 it('acknowledges a valid device-bound batch only after insertion', async () => {
  const result = await POST(request(JSON.stringify({ events: [valid] })));
  expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ ok: true, received: 1, inserted: 1 }); expect(insert).toHaveBeenCalledOnce();
 });
 it('rejects cross-child attribution without inserting', async () => { expect((await POST(request(JSON.stringify({ events: [{ ...valid, child: 'joseph' }] })))).status).toBe(400); expect(insert).not.toHaveBeenCalled(); });
 it('rejects oversized bodies without inserting', async () => { expect((await POST(request(' '.repeat(4 * 1024 * 1024 + 1)))).status).toBe(413); expect(insert).not.toHaveBeenCalled(); });
});
