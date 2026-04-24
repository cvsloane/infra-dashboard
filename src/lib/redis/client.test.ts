import { describe, expect, it } from 'vitest';
import { getQueueWorkerState } from './workerState';

describe('getQueueWorkerState', () => {
  it('treats queues with no runnable work as idle when no worker heartbeat exists', () => {
    expect(
      getQueueWorkerState({
        waiting: 0,
        active: 0,
        workerResponding: false,
        failCount: 99,
      })
    ).toMatchObject({
      workerActive: true,
      workerState: 'idle',
    });
  });

  it('marks workers down only after repeated misses with runnable work', () => {
    expect(
      getQueueWorkerState({
        waiting: 2,
        active: 0,
        workerResponding: false,
        failCount: 5,
      })
    ).toMatchObject({
      workerActive: false,
      workerState: 'down',
    });
  });

  it('keeps fresh worker heartbeats active', () => {
    expect(
      getQueueWorkerState({
        waiting: 0,
        active: 0,
        workerResponding: true,
        failCount: 0,
      })
    ).toMatchObject({
      workerActive: true,
      workerState: 'active',
    });
  });
});
