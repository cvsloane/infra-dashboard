import { expect, type Page, type Route, test } from '@playwright/test';

const now = '2026-05-16T18:00:00.000Z';

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockDashboardApis(page: Page) {
  const application = {
    uuid: 'app-1',
    name: 'paving-site',
    status: 'running',
    fqdn: 'https://paving.example.com',
    git_branch: 'main',
    environment: { name: 'production', project: { name: 'Heaviside' } },
  };

  const deployment = {
    uuid: 'deploy-1',
    applicationName: 'paving-site',
    applicationUuid: 'app-1',
    status: 'finished',
    commit: 'abcdef1234567890',
    commitMessage: 'Ship dashboard smoke',
    createdAt: now,
    finishedAt: now,
  };

  const deploymentStats = { queued: 0, inProgress: 0, finishedToday: 1, failedToday: 0 };
  const buildTopology = {
    servers: [],
    primaryBuilder: null,
    fallbackBuilder: null,
    registryHost: 'registry.example.com',
    registryUrl: 'https://registry.example.com',
    deploymentWorkersMin: 1,
    deploymentWorkersMax: 2,
  };

  const hermesSummary = {
    status: 'ok',
    message: 'Hermes healthy',
    checked_at: now,
    last_update: now,
    counts: { total: 1, ok: 1, warning: 0, error: 0, paused: 0, unknown: 0 },
    nodes: {
      heavisidelinux: {
        status: 'success',
        message: '1 job healthy',
        job_count: 1,
        issues: [],
      },
    },
    alerts: [],
    jobs: [
      {
        job_id: 'daily-work-log',
        slug: 'daily-work-log',
        name: 'Daily Work Log',
        node: 'heavisidelinux',
        status: 'ok',
        last_status: 'ok',
        summary_status: 'ok',
        summary_message: 'Recent successful run',
        enabled: true,
        provider: 'openai',
        model: 'gpt-5.2',
        last_run_at: now,
        next_run_at: now,
        age_minutes: 5,
        schedule_display: 'Daily',
        skills: [],
      },
    ],
    unavailable: false,
  };

  await page.route('**/api/sse/updates**', async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'SSE disabled in smoke test' });
  });
  await page.route('**/api/hermes/activity/stream', async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'stream disabled in smoke test' });
  });

  await page.route('**/api/coolify/applications', (route) => fulfillJson(route, { applications: [application] }));
  await page.route('**/api/coolify/deployments**', (route) =>
    fulfillJson(route, {
      active: [],
      recent: [deployment],
      stats: deploymentStats,
      buildTopology,
      all: { deployments: [deployment], nextCursor: null, totalCount: 1 },
    })
  );
  await page.route('**/api/postgres/health', (route) =>
    fulfillJson(route, {
      status: 'ok',
      message: 'PostgreSQL healthy',
      metrics: { pg_stat_activity_count: 3, pg_settings_max_connections: 100 },
    })
  );
  await page.route('**/api/postgres/backups', (route) =>
    fulfillJson(route, {
      status: 'ok',
      message: 'Backups fresh',
      wal: { status: 'ok', ageSec: 60 },
      logical: { status: 'ok', ageSec: 120, bytes: 1234 },
      basebackup: { status: 'ok', ageSec: 300, checkedAgeSec: 60 },
      restoreDrill: { status: 'ok', ageSec: 600 },
    })
  );
  await page.route('**/api/alertmanager/alerts', (route) =>
    fulfillJson(route, {
      status: 'ok',
      message: 'No firing alerts',
      fetchedAt: now,
      total: 0,
      firing: 0,
      suppressed: 0,
      bySeverity: { critical: 0, warning: 0, info: 0, unknown: 0 },
      alerts: [],
    })
  );
  await page.route('**/api/bullmq/queues', (route) =>
    fulfillJson(route, {
      queues: [
        {
          name: 'content',
          waiting: 0,
          active: 0,
          completed: 5,
          failed: 0,
          delayed: 0,
          paused: 0,
          workerState: 'active',
          workerCount: 1,
        },
      ],
    })
  );
  await page.route('**/api/servers/status', (route) =>
    fulfillJson(route, {
      sites: {
        allHealthy: true,
        downCount: 0,
        sslExpiringSoonCount: 0,
        sslExpiryWarnDays: 14,
        sites: [],
      },
    })
  );
  await page.route('**/api/workers/status', (route) =>
    fulfillJson(route, {
      status: {
        version: 1,
        host: 'apps-vps',
        updatedAt: now,
        stale: false,
        ageSec: 10,
        summary: { total: 1, ok: 1, warning: 0, down: 0 },
        items: [{ name: 'worker', source: 'systemd', status: 'ok', detail: 'running' }],
      },
    })
  );
  await page.route('**/api/agents/runs', (route) =>
    fulfillJson(route, {
      agents: [],
      stats: { total: 0, ok: 0, warning: 0, down: 0 },
    })
  );

  await page.route('**/api/hermes/summary', (route) => fulfillJson(route, hermesSummary));
  await page.route('**/api/hermes/costs**', (route) =>
    fulfillJson(route, { total_cost_usd: 0.42, run_count: 3, window: '24h' })
  );
  await page.route('**/api/hermes/activity**', (route) =>
    fulfillJson(route, {
      events: [
        {
          session_id: 'run-1',
          job_id: 'daily-work-log',
          job_name: 'Daily Work Log',
          status: 'success',
          started_at: now,
          duration_ms: 1200,
          estimated_cost_usd: 0.01,
          model: 'gpt-5.2',
        },
      ],
    })
  );
  await page.route('**/api/hermes/alerts**', (route) =>
    fulfillJson(route, { status: 'ok', alert_count: 0, alerts: [] })
  );
  await page.route('**/api/hermes/observability', (route) =>
    fulfillJson(route, {
      status: 'success',
      message: 'Observability healthy',
      local_traces: { event_count: 2, unique_trace_count: 1 },
      langfuse_export: { exported_envelope_count: 1 },
      langfuse: {
        base_url: 'https://langfuse.example.com',
        health: { status_code: 200 },
        ready: { status_code: 200 },
      },
    })
  );

  await page.route('**/api/crons**', (route) =>
    fulfillJson(route, {
      stats: {
        total_jobs: 1,
        hosts: ['apps-vps'],
        by_status: { success: 1 },
        by_source: { 'systemd-timer': 1 },
        failing_jobs: 0,
        stale_jobs: 0,
        last_collected_at: now,
      },
      jobs: [
        {
          inventory: {
            id: 'cron-1',
            host: 'apps-vps',
            source: 'systemd-timer',
            name: 'Infra Dashboard Self Check',
            schedule: 'hourly',
            schedule_display: 'Hourly',
            command: 'check-infra-dashboard',
            enabled: true,
            discovered_at: now,
            last_seen_at: now,
          },
          latest_run: {
            host: 'apps-vps',
            jobId: 'cron-1',
            runId: 'run-1',
            started_at: now,
            ended_at: now,
            duration_ms: 1000,
            exit_code: 0,
            status: 'success',
            source: 'systemd-show',
          },
          status: 'success',
          age_minutes: 5,
          run_count: 10,
        },
      ],
    })
  );

  await page.route('**/api/home-network', (route) =>
    fulfillJson(route, {
      status: 'ok',
      message: 'Home network healthy',
      checked_at: now,
      snapshot: {
        schema_version: 1,
        collected_at: now,
        collector_host: 'homelinux',
        status: 'ok',
        routers: [
          {
            hostname: 'flint-main',
            role: 'main',
            management_ip: '192.168.8.1',
            reachable: true,
            warnings: [],
            nextdns: { router_hostname: 'flint-main', running: true },
          },
        ],
        clients: [
          {
            mac: '00:11:22:33:44:55',
            ip: '192.168.8.10',
            hostname: 'laptop',
            router_hostname: 'flint-main',
            signal_dbm: -55,
          },
        ],
        client_summary: {
          total: 1,
          home_k: 0,
          weak_signal: 0,
          very_weak_signal: 0,
          unknown_hostname: 0,
          weakest: [],
        },
        dns: {
          baseline_profile: 'default',
          kids_profile: 'kids',
          routers: [{ router_hostname: 'flint-main', running: true, test_ok: true }],
        },
        warnings: [],
        monitoring_warnings: [],
        windows_laptops: [],
      },
      history: [],
      age_sec: 30,
      max_age_sec: 300,
      computed_warnings: [],
      computed_monitoring_warnings: [],
    })
  );
}

test.beforeEach(async ({ page }) => {
  await mockDashboardApis(page);
});

test('overview smoke renders operator health summary', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(page.getByText('Action-first health summary')).toBeVisible();
  await expect(page.getByText('All clear')).toBeVisible();
});

test('scheduled jobs smoke renders cron inventory', async ({ page }) => {
  await page.goto('/crons');
  await expect(page.getByRole('heading', { name: 'Scheduled jobs' })).toBeVisible();
  await expect(page.getByText('Total jobs')).toBeVisible();
  await expect(page.getByText('Infra Dashboard Self Check')).toBeVisible();
});

test('Hermes smoke renders fleet health', async ({ page }) => {
  await page.goto('/hermes');
  await expect(page.getByRole('heading', { name: 'Hermes Fleet' })).toBeVisible();
  await expect(page.getByText('Hermes healthy').first()).toBeVisible();
  await expect(page.getByText('1 OK, 0 paused')).toBeVisible();
});

test('home-network smoke renders collected router state', async ({ page }) => {
  await page.goto('/home-network');
  await expect(page.getByRole('heading', { name: 'Home Network' })).toBeVisible();
  await expect(page.getByText('Collected by homelinux')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'flint-main', exact: true })).toBeVisible();
});

test('Coolify deployments smoke renders deployment status', async ({ page }) => {
  await page.goto('/coolify');
  await expect(page.getByRole('heading', { name: 'Coolify Deployments' })).toBeVisible();
  await expect(page.getByText('1 deployed today')).toBeVisible();
  await expect(page.getByText('paving-site')).toBeVisible();
});
