import { describe, expect, it } from 'vitest';
import { discoverQueuesWithScan, type ScanFn } from './discoverQueues';

describe('discoverQueuesWithScan', () => {
  it('discovers unique queue names across meta + common suffix scans', async () => {
    const scan: ScanFn = async (cursor, ...args) => {
      const matchIdx = args.findIndex((v) => v === 'MATCH');
      const pattern = matchIdx >= 0 ? String(args[matchIdx + 1]) : '';

      if (pattern === 'bull:*:meta') {
        if (cursor === '0') {
          return ['1', ['bull:alpha:meta', 'bull:beta:meta', 'noise', 'bull::meta']];
        }
        return ['0', ['bull:alpha:meta']];
      }

      if (pattern === 'bull:*:wait') {
        return ['0', ['bull:gamma:wait', 'bull:alpha:wait']];
      }

      if (pattern === 'bull:*:active') {
        return ['0', ['bull:delta:active']];
      }

      if (pattern === 'bull:*:completed') {
        return ['0', []];
      }

      if (pattern === 'bull:*:failed') {
        return ['0', ['bull:beta:failed', 'bull:epsilon:failed']];
      }

      throw new Error(`Unexpected pattern: ${pattern}`);
    };

    const queues = await discoverQueuesWithScan(scan);
    expect(queues).toEqual(['alpha', 'beta', 'delta', 'epsilon', 'gamma']);
  });

  it('propagates scan errors', async () => {
    const scan: ScanFn = async () => {
      throw new Error('boom');
    };

    await expect(discoverQueuesWithScan(scan)).rejects.toThrow('boom');
  });
});

