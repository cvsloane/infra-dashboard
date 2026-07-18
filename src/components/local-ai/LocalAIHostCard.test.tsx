import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LocalAIGpuLeaseHost } from '@/lib/prometheus/client';
import { LocalAIHostCard } from './LocalAIHostCard';

const host: LocalAIGpuLeaseHost = {
  host: 'homelinux',
  state: 'queued',
  authorityUp: true,
  owner: { workload: 'ollama', kind: 'text-inference' },
  acquiredAt: '2026-07-18T01:00:00.000Z',
  acquiredAgeSeconds: 65,
  mediaWaiting: true,
  inhibited: false,
  staleOwner: false,
  metricsAgeSeconds: 4,
};

describe('LocalAIHostCard', () => {
  it('communicates state and ownership with visible text', () => {
    render(<LocalAIHostCard host={host} />);

    expect(screen.getByRole('heading', { name: 'homelinux' })).toBeInTheDocument();
    expect(screen.getByText('Media waiting')).toBeInTheDocument();
    expect(screen.getByText('ollama')).toBeInTheDocument();
    expect(screen.getByText('text-inference')).toBeInTheDocument();
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
    expect(screen.getByText('Waiting next')).toBeInTheDocument();
    expect(screen.getByText('Accepting demand')).toBeInTheDocument();
  });

  it('names an offline authority without relying on color', () => {
    render(
      <LocalAIHostCard
        host={{ ...host, state: 'offline', authorityUp: false, owner: null, mediaWaiting: false }}
      />
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
});
