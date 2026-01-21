import type { AutohealConfig } from '@/types/autoheal';
import { getRedis } from '@/lib/redis/client';
import { getCoolifyApps } from '@/lib/health/sites';

const AUTOHEAL_CONFIG_KEY = 'infra:autoheal:config';

const DEFAULT_CONFIG: AutohealConfig = {
  enabled: true,
  failureThreshold: 2,
  failureWindowSec: 120,
  skipWhenDeploying: true,
  cooldownSec: 600,
  redeployDelaySec: 90,
  redeployAfterRestart: true,
  enabledSites: [],
};

const DEFAULT_SITE_PATTERNS: Array<RegExp> = [
  /hg[-\s]?market\s?report/i,
  /hg[-\s]?websites/i,
  /hg[-\s]?seo\s?commander/i,
  /agency\s?commander/i,
];

function dedupeSites(sites: string[]): string[] {
  return Array.from(new Set(sites.filter(Boolean)));
}

function normalizeConfig(input: Partial<AutohealConfig> | null | undefined): AutohealConfig {
  const cfg = input ?? {};
  return {
    enabled: cfg.enabled ?? DEFAULT_CONFIG.enabled,
    failureThreshold: Math.max(1, Number(cfg.failureThreshold ?? DEFAULT_CONFIG.failureThreshold)),
    failureWindowSec: Math.max(30, Number(cfg.failureWindowSec ?? DEFAULT_CONFIG.failureWindowSec)),
    skipWhenDeploying: cfg.skipWhenDeploying ?? DEFAULT_CONFIG.skipWhenDeploying,
    cooldownSec: Math.max(0, Number(cfg.cooldownSec ?? DEFAULT_CONFIG.cooldownSec)),
    redeployDelaySec: Math.max(0, Number(cfg.redeployDelaySec ?? DEFAULT_CONFIG.redeployDelaySec)),
    redeployAfterRestart: cfg.redeployAfterRestart ?? DEFAULT_CONFIG.redeployAfterRestart,
    enabledSites: dedupeSites(
      Array.isArray(cfg.enabledSites)
        ? cfg.enabledSites.filter((site) => typeof site === 'string')
        : DEFAULT_CONFIG.enabledSites
    ),
    updatedAt: cfg.updatedAt,
  };
}

async function buildDefaultConfig(): Promise<AutohealConfig> {
  const defaults = normalizeConfig(DEFAULT_CONFIG);

  try {
    const apps = await getCoolifyApps();
    const suggested = apps
      .filter((app) => {
        const haystack = `${app.name} ${app.fqdn}`.toLowerCase();
        return DEFAULT_SITE_PATTERNS.some((pattern) => pattern.test(haystack));
      })
      .map((app) => app.uuid);

    defaults.enabledSites = dedupeSites(suggested);
  } catch (error) {
    console.error('Failed to seed autoheal defaults from Coolify apps:', error);
  }

  defaults.updatedAt = new Date().toISOString();
  return defaults;
}

export async function getAutohealConfig(): Promise<AutohealConfig> {
  const redis = getRedis();

  try {
    const raw = await redis.get(AUTOHEAL_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutohealConfig>;
      return normalizeConfig(parsed);
    }
  } catch (error) {
    console.error('Failed to load autoheal config:', error);
  }

  const defaults = await buildDefaultConfig();
  try {
    await redis.set(AUTOHEAL_CONFIG_KEY, JSON.stringify(defaults));
  } catch (error) {
    console.error('Failed to persist autoheal defaults:', error);
  }

  return defaults;
}

export async function saveAutohealConfig(input: Partial<AutohealConfig>): Promise<AutohealConfig> {
  const redis = getRedis();
  const normalized = normalizeConfig(input);
  normalized.updatedAt = new Date().toISOString();

  await redis.set(AUTOHEAL_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}
