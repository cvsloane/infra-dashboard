import { describe, expect, it } from 'vitest';
import { normalizeNextDnsLog } from './normalize';

describe('normalizeNextDnsLog', () => {
  it('normalizes a NextDNS log row with device metadata', () => {
    const entry = normalizeNextDnsLog('43d9e6', {
      id: 'abc123',
      timestamp: '2026-05-14T12:00:00.000Z',
      domain: 'example.com',
      root: 'example.com',
      encrypted: true,
      protocol: 'DNS-over-HTTPS',
      clientIp: '192.168.109.20',
      client: 'router',
      device: {
        id: 'kid-laptop',
        name: 'Kid Laptop',
        model: 'Windows',
      },
      status: 'blocked',
      reasons: ['parental-control'],
    });

    expect(entry).toMatchObject({
      id: 'abc123',
      profile_id: '43d9e6',
      domain: 'example.com',
      client_ip: '192.168.109.20',
      device_id: 'kid-laptop',
      device_name: 'Kid Laptop',
      status: 'blocked',
      reasons: ['parental-control'],
    });
  });

  it('generates a stable fallback id when NextDNS omits one', () => {
    const raw = {
      timestamp: '2026-05-14T12:00:00.000Z',
      domain: 'example.com',
      clientIp: '192.168.109.20',
      status: 'default',
    };

    const first = normalizeNextDnsLog('43d9e6', raw);
    const second = normalizeNextDnsLog('43d9e6', raw);

    expect(first?.id).toBeTruthy();
    expect(first?.id).toBe(second?.id);
  });

  it('rejects rows without a timestamp or domain', () => {
    expect(normalizeNextDnsLog('43d9e6', { domain: 'example.com' })).toBeNull();
    expect(normalizeNextDnsLog('43d9e6', { timestamp: '2026-05-14T12:00:00.000Z' })).toBeNull();
  });
});
