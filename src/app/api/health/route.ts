import { NextResponse } from 'next/server';
import { healthCheck as coolifyHealth } from '@/lib/coolify/client';
import { healthCheck as prometheusHealth } from '@/lib/prometheus/client';
import { healthCheck as redisHealth } from '@/lib/redis/client';

export async function GET() {
  const [coolify, prometheus, redis] = await Promise.allSettled([
    coolifyHealth(),
    prometheusHealth(),
    redisHealth(),
  ]);

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      coolify: coolify.status === 'fulfilled' ? coolify.value : { ok: false, message: 'Check failed' },
      prometheus: prometheus.status === 'fulfilled' ? prometheus.value : { ok: false, message: 'Check failed' },
      redis: redis.status === 'fulfilled' ? redis.value : { ok: false, message: 'Check failed' },
    },
  };

  // Set overall status based on service health
  const allOk = Object.values(health.services).every((s) => s.ok);
  health.status = allOk ? 'ok' : 'degraded';

  return NextResponse.json(health, {
    status: allOk ? 200 : 503,
  });
}
