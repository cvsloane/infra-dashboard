import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { authenticateActivityDevice, parseDeviceActivity } from './device-upload';
const config = JSON.stringify({ 'NORAH-LAPTOP': { child: 'norah', key_hash: createHash('sha256').update('test-key').digest('hex') } });
const event = { source_event_id: `endpoint:${'a'.repeat(64)}`, event_timestamp: '2026-11-16T15:00:00Z', device_id: 'NORAH-LAPTOP', hostname: 'NORAH-LAPTOP', child: 'norah', source: 'browser_history', event_type: 'youtube_video', video_id: 'dQw4w9WgXcQ', url: 'https://unrelated.example/secret', metadata: { collector_version: 2, evidence: 'local_page_visit', local_only: true } };
describe('scoped device upload', () => {
  it('fails closed without enrollment, with wrong keys or on another device', () => {
    expect(authenticateActivityDevice('NORAH-LAPTOP', 'test-key', undefined)).toBeNull();
    expect(authenticateActivityDevice('NORAH-LAPTOP', 'wrong', config)).toBeNull();
    expect(authenticateActivityDevice('JOSHUA-LAPTOP', 'test-key', config)).toBeNull();
    expect(authenticateActivityDevice('NORAH-LAPTOP', 'test-key', config)?.child).toBe('norah');
  });
  it('rejects cross-child and cross-device attribution', () => {
    expect(parseDeviceActivity({ events: [{ ...event, child: 'joseph' }] }, 'NORAH-LAPTOP', 'norah')).toBeNull();
    expect(parseDeviceActivity({ events: [event] }, 'JOSHUA-LAPTOP', 'norah')).toBeNull();
  });
  it('accepts only relevant local evidence and rebuilds canonical content links', () => {
    expect(parseDeviceActivity({ events: [event] }, 'NORAH-LAPTOP', 'norah')?.[0].url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(parseDeviceActivity({ events: [{ ...event, event_type: 'web_visit' }] }, 'NORAH-LAPTOP', 'norah')).toBeNull();
    expect(parseDeviceActivity({ events: [{ ...event, metadata: { collector_version: 2, local_only: false } }] }, 'NORAH-LAPTOP', 'norah')).toBeNull();
  });
});
