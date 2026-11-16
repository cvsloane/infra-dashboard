'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { HomeActivityEvent } from '@/types/activity-events';
import { activityEvidence, safeActivityUrl } from '@/lib/activity-events/labels';

type Coverage = { configured: boolean; devices: Array<{ child: string; device_id: string; last_collected: string | null; last_uploaded: string | null; errors: string[]; local_collection: boolean }> };

export function HomeActivityPanel() {
  const [events, setEvents] = useState<HomeActivityEvent[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [child, setChild] = useState('');
  const [kind, setKind] = useState('youtube_video');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState('7');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ event_type: kind, limit: '500', verified: '1', from: new Date(Date.now() - Number(days) * 86400000).toISOString() });
      if (child) params.set('child', child);
      if (search.trim()) params.set('search', search.trim());
      const [activity, status] = await Promise.all([fetch(`/api/home-network/activity-events?${params}`, { cache: 'no-store' }), fetch('/api/home-network/activity-coverage', { cache: 'no-store' })]);
      if (!activity.ok || !status.ok) throw new Error(`Activity reporting unavailable (${activity.status}/${status.status})`);
      const records = await activity.json();
      setEvents(records.events || []); setMore(Boolean(records.next_before)); setCoverage(await status.json());
    } catch (err) { setError(err instanceof Error ? err.message : 'Activity reporting unavailable'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
    // Search is submitted explicitly; selection changes refresh immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child, kind, days]);

  return <Card>
    <CardHeader><CardTitle>Roblox &amp; YouTube Activity</CardTitle>
      <p className="text-sm text-muted-foreground">Local records follow enrolled laptops across networks. Live upload requires device enrollment; otherwise away-from-home records upload when the laptop is reachable at home. Phones, tablets and native YouTube apps are not covered by this collector.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {coverage?.devices.map(device => <div key={device.device_id} className="rounded-md border p-3 text-sm">
          <div className="font-medium capitalize">{device.child} · {device.device_id}</div>
          <div>{device.last_collected ? `Last collected: ${new Date(device.last_collected).toLocaleString()}` : 'No verified collection received'}</div>
          {device.last_uploaded && <div className="text-muted-foreground">Uploaded: {new Date(device.last_uploaded).toLocaleString()}</div>}
          <div>{device.local_collection ? 'Local collection verified at last report' : 'Away-from-home collection not verified'}</div>
          {device.errors.length > 0 && <div className="text-amber-700 dark:text-amber-300">Collection errors: {device.errors.join('; ')}</div>}
        </div>)}
      </div>
      {coverage?.configured === false && <p>Activity database is not configured.</p>}
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void load(); }}>
        <select aria-label="Child" className="rounded-md border bg-background p-2 text-sm" value={child} onChange={event => setChild(event.target.value)}><option value="">All children</option>{coverage?.devices.map(device => <option key={device.device_id} value={device.child}>{device.child}</option>)}</select>
        <select aria-label="Activity type" className="rounded-md border bg-background p-2 text-sm" value={kind} onChange={event => setKind(event.target.value)}><option value="youtube_video">YouTube videos</option><option value="roblox_game">Roblox games</option></select>
        <select aria-label="Date range" className="rounded-md border bg-background p-2 text-sm" value={days} onChange={event => setDays(event.target.value)}><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
        <Input aria-label="Search video or game title" placeholder="Search video or game title" className="max-w-sm" value={search} onChange={event => setSearch(event.target.value)} />
        <Button type="submit" variant="outline" disabled={loading}>{loading ? 'Loading…' : 'Refresh / search'}</Button>
      </form>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      <p className="text-sm text-muted-foreground">Times use your browser’s timezone. Client joins do not measure active play; video-page visits do not establish watch time. Synced visits and historical records without local attribution are excluded.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">When</th><th className="p-2">Child / device</th><th className="p-2">Game or video</th><th className="p-2">Evidence</th></tr></thead><tbody>
        {events.map(event => { const href = safeActivityUrl(event); return <tr key={event.id} className="border-b align-top"><td className="p-2 whitespace-nowrap">{new Date(event.event_timestamp).toLocaleString()}</td><td className="p-2"><span className="capitalize">{event.child}</span><div className="text-xs text-muted-foreground">{event.device_id} · {event.app}</div></td><td className="p-2">{href ? <a className="underline" href={href} target="_blank" rel="noopener noreferrer">{event.title || event.video_id || event.place_id}</a> : event.title}<div className="text-xs text-muted-foreground">{event.video_id || event.place_id}</div></td><td className="p-2">{activityEvidence(event)}</td></tr>; })}
      </tbody></table></div>
      {!loading && !error && events.length === 0 && <p>No verified records in this selection. Check collection status above; this does not prove inactivity.</p>}
      {more && <p className="text-sm text-muted-foreground">Showing the newest 500 records. Narrow the child, date range or title search to see specific activity.</p>}
    </CardContent>
  </Card>;
}
