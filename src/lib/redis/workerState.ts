export type QueueWorkerState = 'active' | 'idle' | 'down' | 'unknown';

export interface QueueWorkerStateResult {
  workerActive: boolean;
  workerState: QueueWorkerState;
  workerStateReason?: string;
}

const CONSECUTIVE_FAILURES_REQUIRED = 5;

export function getQueueWorkerState(args: {
  waiting: number;
  active: number;
  workerResponding: boolean;
  failCount: number;
}): QueueWorkerStateResult {
  if (args.workerResponding) {
    return {
      workerActive: true,
      workerState: 'active',
      workerStateReason: 'worker heartbeat present',
    };
  }

  const hasRunnableWork = args.waiting > 0 || args.active > 0;
  if (!hasRunnableWork) {
    return {
      workerActive: true,
      workerState: 'idle',
      workerStateReason: 'no waiting or active jobs',
    };
  }

  if (args.failCount >= CONSECUTIVE_FAILURES_REQUIRED) {
    return {
      workerActive: false,
      workerState: 'down',
      workerStateReason: `${args.failCount} missed worker checks with runnable jobs`,
    };
  }

  return {
    workerActive: true,
    workerState: 'unknown',
    workerStateReason: `${args.failCount} missed worker checks; waiting for confirmation`,
  };
}
