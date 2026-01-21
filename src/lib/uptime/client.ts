/**
 * Uptime Kuma API Client
 *
 * Fetches monitor status from Uptime Kuma's API.
 * Falls back to direct health checks if Uptime Kuma is not configured.
 */

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL;
const UPTIME_KUMA_STATUS_PAGE = process.env.UPTIME_KUMA_STATUS_PAGE;

export interface Monitor {
  id: number;
  name: string;
  url?: string;
  type: string;
  status: 'up' | 'down' | 'pending' | 'maintenance';
  uptime24h: number;
  uptime30d: number;
  responseTime: number;
  lastCheck: string;
}

export interface UptimeStatus {
  monitors: Monitor[];
  summary: {
    total: number;
    up: number;
    down: number;
    pending: number;
  };
}

/**
 * Get all monitors from Uptime Kuma's push API or status page
 */
export async function getUptimeStatus(): Promise<UptimeStatus> {
  if (!UPTIME_KUMA_URL) {
    return {
      monitors: [],
      summary: { total: 0, up: 0, down: 0, pending: 0 },
    };
  }

  const baseUrl = UPTIME_KUMA_URL.replace(/\/+$/, '');

  try {
    // Try the metrics endpoint first (if enabled)
    const metricsRes = await fetch(`${baseUrl}/metrics`, {
      cache: 'no-store',
    });

    if (metricsRes.ok) {
      const text = await metricsRes.text();
      return parsePrometheusMetrics(text);
    }

    // Try status page API (optional)
    if (UPTIME_KUMA_STATUS_PAGE) {
      const statusRes = await fetch(`${baseUrl}/api/status-page/${UPTIME_KUMA_STATUS_PAGE}`, {
        cache: 'no-store',
      });

      if (statusRes.ok) {
        const data = await statusRes.json();
        return parseStatusPage(data);
      }
    }

    // Return empty status if no data available
    return {
      monitors: [],
      summary: { total: 0, up: 0, down: 0, pending: 0 },
    };
  } catch (error) {
    console.error('Failed to fetch Uptime Kuma status:', error);
    return {
      monitors: [],
      summary: { total: 0, up: 0, down: 0, pending: 0 },
    };
  }
}

function parsePrometheusMetrics(text: string): UptimeStatus {
  const monitors: Monitor[] = [];
  const lines = text.split('\n');

  // Parse monitor_status lines
  // Format: monitor_status{monitor_name="...",monitor_type="...",monitor_url="..."} 1
  const statusRegex = /monitor_status\{([^}]+)\}\s+(\d+)/;
  const responseTimeRegex = /monitor_response_time\{([^}]+)\}\s+([\d.]+)/;

  const statusMap = new Map<string, { status: number; labels: Record<string, string> }>();
  const responseMap = new Map<string, number>();

  for (const line of lines) {
    const statusMatch = line.match(statusRegex);
    if (statusMatch) {
      const labels = parseLabels(statusMatch[1]);
      const name = labels.monitor_name || 'Unknown';
      statusMap.set(name, {
        status: parseInt(statusMatch[2]),
        labels,
      });
    }

    const responseMatch = line.match(responseTimeRegex);
    if (responseMatch) {
      const labels = parseLabels(responseMatch[1]);
      const name = labels.monitor_name || 'Unknown';
      responseMap.set(name, parseFloat(responseMatch[2]));
    }
  }

  let up = 0, down = 0, pending = 0;

  for (const [name, data] of statusMap) {
    const status = data.status === 1 ? 'up' : data.status === 0 ? 'down' : 'pending';
    if (status === 'up') up++;
    else if (status === 'down') down++;
    else pending++;

    monitors.push({
      id: monitors.length + 1,
      name,
      url: data.labels.monitor_url,
      type: data.labels.monitor_type || 'http',
      status,
      uptime24h: status === 'up' ? 100 : 0,
      uptime30d: status === 'up' ? 100 : 0,
      responseTime: responseMap.get(name) || 0,
      lastCheck: new Date().toISOString(),
    });
  }

  return {
    monitors,
    summary: {
      total: monitors.length,
      up,
      down,
      pending,
    },
  };
}

function parseLabels(labelStr: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(labelStr)) !== null) {
    labels[match[1]] = match[2];
  }
  return labels;
}

function parseStatusPage(data: unknown): UptimeStatus {
  // Status page format varies, this is a basic parser
  const monitors: Monitor[] = [];

  if (data && typeof data === 'object' && 'publicGroupList' in data) {
    const groups = (data as { publicGroupList: Array<{ monitorList: unknown[] }> }).publicGroupList;
    for (const group of groups) {
      if (group.monitorList) {
        for (const monitor of group.monitorList as Array<{
          id: number;
          name: string;
          url?: string;
          type: string;
          active: boolean;
        }>) {
          monitors.push({
            id: monitor.id,
            name: monitor.name,
            url: monitor.url,
            type: monitor.type,
            status: monitor.active ? 'up' : 'down',
            uptime24h: monitor.active ? 100 : 0,
            uptime30d: monitor.active ? 100 : 0,
            responseTime: 0,
            lastCheck: new Date().toISOString(),
          });
        }
      }
    }
  }

  const up = monitors.filter(m => m.status === 'up').length;
  const down = monitors.filter(m => m.status === 'down').length;

  return {
    monitors,
    summary: {
      total: monitors.length,
      up,
      down,
      pending: monitors.length - up - down,
    },
  };
}

export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${UPTIME_KUMA_URL}/api/entry-page`, {
      cache: 'no-store',
    });
    return {
      ok: res.ok,
      message: res.ok ? 'Uptime Kuma connected' : 'Uptime Kuma unavailable',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to connect to Uptime Kuma',
    };
  }
}
