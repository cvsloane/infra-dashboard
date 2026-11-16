import type { HomeActivityEventInput } from '@/types/activity-events';

// Roblox metadata identifies the experience; the observed place still identifies
// the exact place joined, including teleports within one experience.
export async function resolveRobloxTitles(events: HomeActivityEventInput[]): Promise<void> {
  const ids = [...new Set(events.map(event => event.metadata?.universe_id).filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)))];
  for (let start = 0; start < ids.length; start += 100) {
    const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${ids.slice(start, start + 100).join(',')}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) throw new Error('Roblox title lookup failed');
    const games = await response.json() as { data: Array<{ id: number; name: string; rootPlaceId: number }> };
    for (const event of events) {
      const game = games.data.find(item => String(item.id) === event.metadata?.universe_id);
      if (game && event.metadata) { event.title = game.name; event.metadata.root_place_id = String(game.rootPlaceId); }
    }
  }
}
