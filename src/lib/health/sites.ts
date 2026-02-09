/**
 * Site Health Checker
 *
 * Performs DNS resolution and SSL certificate checks for Coolify applications.
 */

import { Pool } from 'pg';
import tls from 'tls';

const EXCLUDED_SITES = (process.env.SITE_HEALTH_EXCLUSIONS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const SSL_EXPIRY_WARN_DAYS = (() => {
  const raw = process.env.SITE_HEALTH_SSL_EXPIRY_WARN_DAYS;
  if (!raw) return 14;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 14;
})();

// Reuse Coolify DB connection
const pool = new Pool({
  connectionString: process.env.COOLIFY_DB_URL,
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export interface SiteHealth {
  applicationUuid?: string;
  name: string;
  fqdn: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  httpStatus?: number;
  responseTimeMs?: number;
  sslValid?: boolean;
  sslExpiresAt?: string;
  sslDaysRemaining?: number;
  lastChecked: string;
  error?: string;
}

export interface SiteHealthSummary {
  sites: SiteHealth[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    sslExpiringSoon: number;
  };
}

export interface CoolifyAppTarget {
  uuid: string;
  name: string;
  fqdn: string;
}

/**
 * Get all Coolify applications with FQDNs
 */
export async function getCoolifyApps(): Promise<CoolifyAppTarget[]> {
  try {
    const result = await pool.query(`
      SELECT uuid, name, fqdn
      FROM applications
      WHERE fqdn IS NOT NULL AND fqdn != ''
      ORDER BY name
    `);

    const apps: CoolifyAppTarget[] = [];

    for (const row of result.rows) {
      // Skip excluded sites
      if (EXCLUDED_SITES.includes(row.name)) {
        continue;
      }

      // Split multiple FQDNs (comma-separated)
      const fqdns = (row.fqdn as string).split(',');
      // Use the first HTTPS URL, or first URL
      const primaryFqdn = fqdns.find(f => f.startsWith('https://')) || fqdns[0];

      if (primaryFqdn) {
        // Also check if the FQDN itself is excluded
        const domain = primaryFqdn.replace('https://', '').replace('http://', '').trim();
        if (EXCLUDED_SITES.some(excluded => domain.includes(excluded))) {
          continue;
        }

        // Skip malformed URLs (e.g., missing protocol, wildcards, internal Coolify URLs)
        if (domain.startsWith('://') || domain.includes('*') || domain.includes('.*.')) {
          continue;
        }

        apps.push({
          uuid: row.uuid,
          name: row.name,
          fqdn: primaryFqdn.trim(),
        });
      }
    }

    return apps;
  } catch (error) {
    console.error('Failed to get Coolify apps:', error);
    return [];
  }
}

/**
 * Check a single site's health
 */
async function checkSite(name: string, fqdn: string, applicationUuid?: string): Promise<SiteHealth> {
  const result: SiteHealth = {
    applicationUuid,
    name,
    fqdn,
    status: 'unknown',
    lastChecked: new Date().toISOString(),
  };

  try {
    // Extract URL for fetch
    let url = fqdn;
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    const parsedUrl = new URL(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    result.responseTimeMs = Date.now() - startTime;
    result.httpStatus = response.status;

    if (response.status >= 200 && response.status < 400) {
      result.status = 'healthy';
    } else if (response.status >= 400 && response.status < 500) {
      result.status = 'degraded';
    } else {
      result.status = 'down';
    }

    // Check SSL (only for HTTPS)
    if (parsedUrl.protocol === 'https:') {
      // If HTTPS worked without error, SSL is valid from Node's perspective.
      result.sslValid = true;

      const sslInfo = await getTlsCertificateInfo(parsedUrl.hostname, parsedUrl.port ? Number(parsedUrl.port) : 443);
      if (sslInfo.expiresAt) result.sslExpiresAt = sslInfo.expiresAt.toISOString();
      if (sslInfo.daysRemaining !== null) result.sslDaysRemaining = sslInfo.daysRemaining;

      // Do not flip status to "down" for expiry warnings; show as metadata.
      // This keeps "down" reserved for availability failures.
    }
  } catch (error) {
    result.status = 'down';
    result.error = error instanceof Error ? error.message : 'Unknown error';

    if (result.error.includes('certificate')) {
      result.sslValid = false;
    }
  }

  return result;
}

async function getTlsCertificateInfo(
  hostname: string,
  port: number
): Promise<{ expiresAt: Date | null; daysRemaining: number | null }> {
  const timeoutMs = 5000;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (payload: { expiresAt: Date | null; daysRemaining: number | null }) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname, // SNI
        rejectUnauthorized: false, // allow introspection even if chain is invalid
        timeout: timeoutMs,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const validTo = (cert as { valid_to?: string }).valid_to;
          const expiresAt = validTo ? new Date(validTo) : null;
          const expiresAtValid = expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null;
          const daysRemaining =
            expiresAtValid ? Math.ceil((expiresAtValid.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
          finish({ expiresAt: expiresAtValid, daysRemaining });
        } catch {
          finish({ expiresAt: null, daysRemaining: null });
        } finally {
          socket.end();
        }
      }
    );

    socket.on('timeout', () => {
      socket.destroy();
      finish({ expiresAt: null, daysRemaining: null });
    });

    socket.on('error', () => {
      finish({ expiresAt: null, daysRemaining: null });
    });
  });
}

/**
 * Check all sites and return summary
 */
export async function checkAllSites(): Promise<SiteHealthSummary> {
  const apps = await getCoolifyApps();

  // Check sites in parallel with concurrency limit
  const concurrency = 5;
  const results: SiteHealth[] = [];

  for (let i = 0; i < apps.length; i += concurrency) {
    const batch = apps.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(app => checkSite(app.name, app.fqdn, app.uuid))
    );
    results.push(...batchResults);
  }

  const healthy = results.filter(s => s.status === 'healthy').length;
  const degraded = results.filter(s => s.status === 'degraded').length;
  const down = results.filter(s => s.status === 'down').length;
  const sslExpiringSoon = results.filter((s) =>
    typeof s.sslDaysRemaining === 'number' && s.sslDaysRemaining <= SSL_EXPIRY_WARN_DAYS
  ).length;

  return {
    sites: results,
    summary: {
      total: results.length,
      healthy,
      degraded,
      down,
      sslExpiringSoon,
    },
  };
}

/**
 * Quick health check - just check a few critical sites
 */
export async function quickHealthCheck(): Promise<{
  allHealthy: boolean;
  downCount: number;
  sslExpiringSoonCount: number;
  sites: SiteHealth[];
}> {
  const apps = await getCoolifyApps();

  // Only check first 10 sites for quick check
  const appsToCheck = apps.slice(0, 10);

  const results = await Promise.all(
    appsToCheck.map(app => checkSite(app.name, app.fqdn, app.uuid))
  );

  const downCount = results.filter(s => s.status === 'down').length;
  const expiringSoonCount = results.filter((s) =>
    typeof s.sslDaysRemaining === 'number' && s.sslDaysRemaining <= SSL_EXPIRY_WARN_DAYS
  ).length;

  return {
    allHealthy: downCount === 0 && expiringSoonCount === 0,
    downCount,
    sslExpiringSoonCount: expiringSoonCount,
    sites: results,
  };
}
