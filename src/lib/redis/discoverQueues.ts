export type ScanFn = (
  cursor: string,
  ...args: Array<string | number>
) => Promise<[string, string[]]>;

/**
 * Pure queue discovery helper (testable without Redis).
 *
 * BullMQ queue keys are prefixed like:
 * - bull:<queue>:meta
 * - bull:<queue>:wait
 * - bull:<queue>:active
 * etc
 */
export async function discoverQueuesWithScan(scan: ScanFn): Promise<string[]> {
  const queues = new Set<string>();

  async function scanPattern(pattern: string, extractor: (key: string) => string | null): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const name = extractor(key);
        if (name) queues.add(name);
      }
    } while (cursor !== '0');
  }

  // Scan for bull:*:meta keys
  await scanPattern('bull:*:meta', (key) => {
    const match = key.match(/^bull:([^:]+):meta$/);
    return match?.[1] ?? null;
  });

  // Also check for common queue patterns without meta key
  const commonPatterns = ['wait', 'active', 'completed', 'failed'];
  for (const suffix of commonPatterns) {
    await scanPattern(`bull:*:${suffix}`, (key) => {
      const match = key.match(/^bull:([^:]+):/);
      return match?.[1] ?? null;
    });
  }

  return Array.from(queues).sort();
}
