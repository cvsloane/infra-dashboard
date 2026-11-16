import type { HomeActivityEvent } from '@/types/activity-events';

export function activityEvidence(event: HomeActivityEvent): string {
  switch (event.metadata?.evidence) {
    case 'client_join_report': return 'Roblox client reported joining';
    case 'join_attempt': return 'Roblox join attempted';
    case 'local_page_visit': return event.event_type === 'youtube_video' ? 'Video page opened · playback unconfirmed' : 'Game page opened · play unconfirmed';
    default: return 'Historical record · device attribution unverified';
  }
}

export function safeActivityUrl(event: HomeActivityEvent): string | null {
  if (event.video_id && /^[A-Za-z0-9_-]{11}$/.test(event.video_id)) return `https://www.youtube.com/watch?v=${event.video_id}`;
  if (event.place_id && /^\d+$/.test(event.place_id)) return `https://www.roblox.com/games/${event.place_id}`;
  return null;
}
