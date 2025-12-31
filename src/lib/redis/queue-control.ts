import { Queue } from 'bullmq';

const getQueueConnection = () => {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME;

  return {
    host,
    port,
    username,
    password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
};

const queueCache = new Map<string, Queue>();

function getQueue(queueName: string): Queue {
  const existing = queueCache.get(queueName);
  if (existing) return existing;

  const queue = new Queue(queueName, {
    connection: getQueueConnection(),
  });
  queueCache.set(queueName, queue);
  return queue;
}

export async function pauseQueue(queueName: string): Promise<void> {
  const queue = getQueue(queueName);
  await queue.pause();
}

export async function resumeQueue(queueName: string): Promise<void> {
  const queue = getQueue(queueName);
  await queue.resume();
}
