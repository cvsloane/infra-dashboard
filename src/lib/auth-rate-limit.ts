import { createHash } from 'node:crypto';
import { getRedis } from '@/lib/redis/client';

interface LoginRateLimitClient {
  get(key: string): Promise<string | null>;
  ttl(key: string): Promise<number>;
  eval(script: string, numberOfKeys: number, key: string, windowSec: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface LoginRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

interface RateLimitConfig {
  maxAttempts: number;
  windowSec: number;
}

function clientConfig(): RateLimitConfig {
  return {
    maxAttempts: positiveInteger(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 5),
    windowSec: positiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_SEC, 15 * 60),
  };
}

function globalConfig(): RateLimitConfig {
  return {
    maxAttempts: positiveInteger(process.env.AUTH_GLOBAL_RATE_LIMIT_MAX_ATTEMPTS, 30),
    windowSec: positiveInteger(process.env.AUTH_GLOBAL_RATE_LIMIT_WINDOW_SEC, 15 * 60),
  };
}

function key(scope: 'client' | 'global', identifier = ''): string {
  return `infra-dashboard:auth:failures:${scope}${identifier ? `:${identifier}` : ''}`;
}

function result(count: number, ttl: number, settings: RateLimitConfig): LoginRateLimitResult {
  const { maxAttempts } = settings;
  return {
    allowed: count < maxAttempts,
    remaining: Math.max(0, maxAttempts - count),
    retryAfterSec: Math.max(1, ttl),
  };
}

async function checkLimit(
  redisKey: string,
  settings: RateLimitConfig,
  client: Pick<LoginRateLimitClient, 'get' | 'ttl'>,
): Promise<LoginRateLimitResult> {
  const [rawCount, ttl] = await Promise.all([client.get(redisKey), client.ttl(redisKey)]);
  return result(Number.parseInt(rawCount ?? '0', 10) || 0, ttl, settings);
}

async function recordFailure(
  redisKey: string,
  settings: RateLimitConfig,
  client: Pick<LoginRateLimitClient, 'eval'>,
): Promise<LoginRateLimitResult> {
  const raw = await client.eval(RECORD_FAILURE_SCRIPT, 1, redisKey, settings.windowSec);
  const [count, ttl] = Array.isArray(raw) ? raw : [0, settings.windowSec];
  return result(Number(count) || 0, Number(ttl) || settings.windowSec, settings);
}

export function getLoginClientIdentifier(request: Request): string {
  const address = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  return createHash('sha256').update(address).digest('hex');
}

export async function checkLoginRateLimit(
  identifier: string,
  client: Pick<LoginRateLimitClient, 'get' | 'ttl'> = getRedis(),
): Promise<LoginRateLimitResult> {
  const settings = clientConfig();
  try {
    return await checkLimit(key('client', identifier), settings, client);
  } catch (error) {
    console.error('Login rate-limit check failed open:', error);
    return { allowed: true, remaining: settings.maxAttempts, retryAfterSec: 1 };
  }
}

export async function checkGlobalLoginRateLimit(
  client: Pick<LoginRateLimitClient, 'get' | 'ttl'> = getRedis(),
): Promise<LoginRateLimitResult> {
  const settings = globalConfig();
  try {
    return await checkLimit(key('global'), settings, client);
  } catch (error) {
    console.error('Global login rate-limit check failed open:', error);
    return { allowed: true, remaining: settings.maxAttempts, retryAfterSec: 1 };
  }
}

export async function recordLoginFailure(
  identifier: string,
  client: Pick<LoginRateLimitClient, 'eval'> = getRedis(),
): Promise<LoginRateLimitResult> {
  const settings = clientConfig();
  try {
    return await recordFailure(key('client', identifier), settings, client);
  } catch (error) {
    console.error('Login rate-limit update failed open:', error);
    return { allowed: true, remaining: settings.maxAttempts, retryAfterSec: 1 };
  }
}

export async function recordGlobalLoginFailure(
  client: Pick<LoginRateLimitClient, 'eval'> = getRedis(),
): Promise<LoginRateLimitResult> {
  const settings = globalConfig();
  try {
    return await recordFailure(key('global'), settings, client);
  } catch (error) {
    console.error('Global login rate-limit update failed open:', error);
    return { allowed: true, remaining: settings.maxAttempts, retryAfterSec: 1 };
  }
}

export async function resetLoginFailures(
  identifier: string,
  client: Pick<LoginRateLimitClient, 'del'> = getRedis(),
): Promise<void> {
  try {
    await client.del(key('client', identifier));
  } catch (error) {
    console.error('Login rate-limit reset failed:', error);
  }
}
