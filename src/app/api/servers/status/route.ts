import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAllVPSMetrics } from '@/lib/prometheus/client';
import { checkAllSites, quickHealthCheck } from '@/lib/health/sites';

export async function GET(request: Request) {
  if (!(await isAuthenticatedFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const sitesOnly = url.searchParams.get('sitesOnly') === 'true';

    const overviewSample = url.searchParams.get('scope') === 'overview';
    const [vps, sites] = await Promise.allSettled([
      sitesOnly ? Promise.resolve({ appsVps: null, dbVps: null }) : getAllVPSMetrics(),
      overviewSample ? quickHealthCheck() : checkAllSites().then(result => ({
        allHealthy: result.summary.healthy === result.summary.total && result.summary.sslExpiringSoon === 0,
        downCount: result.summary.down,
        sslExpiringSoonCount: result.summary.sslExpiringSoon,
        sslExpiryWarnDays: result.sslExpiryWarnDays,
        sites: result.sites,
        eligibleCount: result.summary.total,
      })),
    ]);

    return NextResponse.json({
      vps: vps.status === 'fulfilled' ? vps.value : { appsVps: null, dbVps: null },
      sites: sites.status === 'fulfilled' ? { ...sites.value, available: true }
        : { available: false, allHealthy: false, downCount: 0, sites: [] },
    });
  } catch (error) {
    console.error('Failed to fetch server status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch server status' },
      { status: 500 }
    );
  }
}
