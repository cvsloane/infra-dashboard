import { NextResponse } from 'next/server';
import { isAuthenticatedFromRequest } from '@/lib/auth';
import { getAllVPSMetrics } from '@/lib/prometheus/client';
import { checkAllSites } from '@/lib/health/sites';

export async function GET(request: Request) {
  if (!isAuthenticatedFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const sitesOnly = url.searchParams.get('sitesOnly') === 'true';

    const [vpsMetrics, siteHealth] = await Promise.all([
      sitesOnly ? Promise.resolve({ appsVps: null, dbVps: null }) : getAllVPSMetrics(),
      checkAllSites(),
    ]);

    // Transform to match expected format
    const sitesData = {
      allHealthy: siteHealth.summary.down === 0,
      downCount: siteHealth.summary.down,
      sites: siteHealth.sites,
    };

    return NextResponse.json({
      vps: vpsMetrics,
      sites: sitesData,
    });
  } catch (error) {
    console.error('Failed to fetch server status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch server status' },
      { status: 500 }
    );
  }
}
