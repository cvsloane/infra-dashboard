import { describe, expect, it } from 'vitest';
import { activityEvidence, safeActivityUrl } from './labels';
import type { HomeActivityEvent } from '@/types/activity-events';
const event = (fields: Partial<HomeActivityEvent>) => ({ id: '1', source_event_id: 'e1', event_timestamp: '2026-11-16T00:00:00Z', source: 'browser_history', event_type: 'youtube_video', ingested_at: '2026-11-16T01:00:00Z', ...fields }) as HomeActivityEvent;
describe('activity evidence', () => {
  it('keeps a video page visit distinct from playback', () => expect(activityEvidence(event({ metadata: { evidence: 'local_page_visit' } }))).toContain('playback unconfirmed'));
  it('does not turn a join attempt into play', () => expect(activityEvidence(event({ event_type: 'roblox_game', metadata: { evidence: 'join_attempt' } }))).toBe('Roblox join attempted'));
  it('labels legacy attribution as unverified', () => expect(activityEvidence(event({}))).toContain('attribution unverified'));
  it('builds links only from validated identifiers', () => {
    expect(safeActivityUrl(event({ video_id: 'dQw4w9WgXcQ', url: 'javascript:alert(1)' }))).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(safeActivityUrl(event({ video_id: '../../evil', place_id: 'bad' }))).toBeNull();
    expect(safeActivityUrl(event({ place_id: '123456' }))).toBe('https://www.roblox.com/games/123456');
  });
});
