# BullMQ Queue Monitoring Setup

This guide explains how to set up queue monitoring for BullMQ job queues.

## Overview

infra-dashboard can monitor BullMQ queues running in Redis, showing:
- Queue statistics (waiting, active, completed, failed jobs)
- Worker health status
- Failed job details with retry/delete actions
- Queue pause/resume controls

## Prerequisites

- Redis server accessible from infra-dashboard
- BullMQ queues already running in your applications

## Configuration

Add to your `.env.local`:

```bash
# Option 1: Full connection URL
REDIS_URL=redis://user:password@your-redis-host:6379

# Option 2: Individual parameters
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password  # if authentication is enabled
REDIS_USERNAME=default        # optional, for ACL-based auth
```

## How It Works

### Queue Discovery

The dashboard automatically discovers BullMQ queues by scanning Redis for keys matching the pattern `bull:*:meta`. Each queue creates these keys:
- `bull:{queueName}:meta` - Queue metadata
- `bull:{queueName}:id` - Job ID counter
- `bull:{queueName}:waiting` - Waiting jobs list
- `bull:{queueName}:active` - Active jobs list
- `bull:{queueName}:completed` - Completed jobs set
- `bull:{queueName}:failed` - Failed jobs set

### Worker Detection

Workers are detected via stalled-check keys (`bull:{queueName}:stalled-check:{workerId}`). These keys have a TTL and are refreshed by healthy workers.

A worker is marked as **DOWN** after 5 consecutive failed checks (not just one missed heartbeat).

### Job States

| State | Description |
|-------|-------------|
| Waiting | Job queued, not yet picked up |
| Active | Currently being processed |
| Completed | Successfully finished |
| Failed | Failed after all retries |
| Delayed | Scheduled for future execution |
| Paused | Queue is paused |

## Features

### Queue Statistics

For each discovered queue, the dashboard shows:
- **Waiting** - Jobs waiting to be processed
- **Active** - Jobs currently being processed
- **Completed** - Successfully completed jobs
- **Failed** - Jobs that failed all retries
- **Delayed** - Jobs scheduled for later
- **Worker Status** - UP/DOWN indicator

### Failed Job Management

View and manage failed jobs:
- **View details** - See job data, error message, stack trace
- **Retry** - Requeue a failed job
- **Delete** - Permanently remove a failed job
- **Bulk actions** - Retry all or delete all failed jobs in a queue

### Queue Controls

- **Pause** - Stop processing new jobs (active jobs continue)
- **Resume** - Resume processing paused queue

## Queue Naming Conventions

BullMQ queues are identified by name. Common patterns:

```typescript
// Your application code
import { Queue } from 'bullmq';

// These will appear in the dashboard as separate queues
const emailQueue = new Queue('email');
const reportQueue = new Queue('reports');
const webhookQueue = new Queue('webhooks');
```

The dashboard shows the queue name as it appears in Redis.

## Example: Typical BullMQ Setup

### Producer (Adding Jobs)

```typescript
import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

const emailQueue = new Queue('email', { connection });

// Add a job
await emailQueue.add('send-welcome', {
  to: 'user@example.com',
  template: 'welcome',
});
```

### Worker (Processing Jobs)

```typescript
import { Worker } from 'bullmq';

const worker = new Worker('email', async (job) => {
  // Process the job
  await sendEmail(job.data);
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} failed:`, err.message);
});
```

## Troubleshooting

### "No queues found"

1. Verify Redis connection:
   ```bash
   redis-cli -h your-host -p 6379 -a your-password KEYS "bull:*"
   ```
2. Check that BullMQ queues exist and have been used
3. Verify `REDIS_HOST` and `REDIS_PORT` are correct

### "Workers showing as DOWN"

Workers may appear DOWN if:
- The worker process has stopped
- Network issues between worker and Redis
- Worker is processing a very long job (stalled-check TTL expired)

Check worker logs and ensure workers are running.

### "Can't retry/delete jobs"

- Ensure Redis user has write permissions
- Check for Redis ACL restrictions
- Verify network connectivity allows writes

### "Queue stats not updating"

The dashboard polls Redis every 15 seconds. Stats update on the next poll cycle.
