import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HomeActivityPanel } from './HomeActivityPanel';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('household activity panel', () => {
  it('shows video titles with evidence and missing device coverage', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('activity-coverage') ? { configured: true, devices: [{ child: 'norah', device_id: 'NORAH-LAPTOP', last_collected: null, last_uploaded: null, errors: [], local_collection: false }] } : { events: [{ id: '1', event_timestamp: '2026-11-16T15:00:00Z', child: 'chloe', device_id: 'CHLOE-LAPTOP', event_type: 'youtube_video', title: 'Example video', video_id: 'dQw4w9WgXcQ', metadata: { evidence: 'local_page_visit' } }], next_before: null }))));
    render(<HomeActivityPanel />);
    expect(await screen.findByRole('link', { name: 'Example video' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(await screen.findByText('Video page opened · playback unconfirmed')).toBeInTheDocument();
    expect(await screen.findByText('No verified collection received')).toBeInTheDocument();
  });
  it('shows a reporting failure instead of suggesting no activity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    render(<HomeActivityPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Activity reporting unavailable');
    expect(screen.queryByText(/No verified records in this selection/)).not.toBeInTheDocument();
  });
});
