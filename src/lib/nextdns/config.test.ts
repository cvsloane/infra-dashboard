import { afterEach, describe, expect, it, vi } from 'vitest';
import { getExpectedChildDevices } from './config';

describe('getExpectedChildDevices', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses expected child devices from env JSON', () => {
    vi.stubEnv('NEXTDNS_EXPECTED_CHILD_DEVICES', JSON.stringify([
      {
        name: 'Chloe Laptop',
        device_ids: ['abc'],
        device_names: ['CHLOE-LAPTOP'],
        profile_ids: ['43d9e6'],
        max_silent_minutes: 30,
      },
    ]));

    expect(getExpectedChildDevices()).toEqual([
      {
        id: 'chloe-laptop',
        name: 'Chloe Laptop',
        device_ids: ['abc'],
        device_names: ['CHLOE-LAPTOP'],
        profile_ids: ['43d9e6'],
        max_silent_minutes: 30,
      },
    ]);
  });

  it('returns an empty list for malformed config', () => {
    vi.stubEnv('NEXTDNS_EXPECTED_CHILD_DEVICES', 'not-json');
    expect(getExpectedChildDevices()).toEqual([]);
  });
});
