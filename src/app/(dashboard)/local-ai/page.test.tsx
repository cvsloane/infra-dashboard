import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LocalAIPage from './page';

const snapshot = {
  fetchedAt: '2026-07-18T01:00:00.000Z',
  summary: { healthy: 2, active: 1, queued: 0, problems: 0 },
  hosts: [
    {
      host: 'homelinux',
      state: 'in-use',
      authorityUp: true,
      owner: { workload: 'ace-step', kind: 'media' },
      acquiredAt: '2026-07-18T00:59:30.000Z',
      acquiredAgeSeconds: 30,
      mediaWaiting: false,
      inhibited: false,
      staleOwner: false,
      metricsAgeSeconds: 5,
    },
    {
      host: 'heavisidelinux',
      state: 'ready',
      authorityUp: true,
      owner: null,
      acquiredAt: null,
      acquiredAgeSeconds: null,
      mediaWaiting: false,
      inhibited: false,
      staleOwner: false,
      metricsAgeSeconds: 3,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LocalAIPage', () => {
  it('loads the fleet snapshot and supports an explicit refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<LocalAIPage />);

    expect(screen.getByRole('heading', { name: 'Local AI' })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'homelinux' });
    expect(screen.getByText('2 of 2 healthy')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Local AI status' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows a retryable request failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<LocalAIPage />);

    expect(await screen.findByText('Unable to refresh Local AI status')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
