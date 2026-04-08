# API Reference

Complete reference for all infra-dashboard API endpoints. All endpoints return JSON unless otherwise noted.

## Authentication

Most endpoints require authentication via a session cookie. Only `/login`, `/api/health`, and `/api/auth/*` are publicly accessible.

**How to authenticate:**
1. `POST /api/auth/login` with `{ "password": "your-password" }`
2. A session cookie (`infra-dashboard-session`) is set automatically
3. Include this cookie in subsequent requests

Session cookies are httpOnly, valid for 7 days, and secured in production (`secure` flag enabled).

---

## Authentication Endpoints

### POST `/api/auth/login`

Authenticate with the dashboard password.

**Request:**

```json
{
  "password": "your-dashboard-password"
}
```

**Response (success):**

```json
{
  "success": true,
  "passwordRequired": true
}
```

**Response (failure):**

```json
{
  "error": "Invalid password",
  "success": false
}
```

> If `DASHBOARD_PASSWORD` is not set, login succeeds automatically and `passwordRequired` is `false`.

### POST `/api/auth/logout`

Clear the session cookie and log out.

**Response:**

```json
{
  "success": true
}
```

---

## Health Check

### GET `/api/health`

Public health check endpoint (no authentication required). Returns the status of all connected services.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "services": {
    "coolify": { "ok": true, "message": "Connected" },
    "prometheus": { "ok": true, "message": "Connected" },
    "redis": { "ok": true, "message": "Connected", "latencyMs": 2 }
  }
}
```

| Field | Values | Meaning |
|-------|--------|---------|
| `status` | `"ok"`, `"degraded"` | Overall health based on all services |
| HTTP status code | `200` (healthy), `503` (degraded) | Use for load balancer health checks |

---

## Coolify

### GET `/api/coolify/applications`

List all Coolify applications and their status.

**Response:** Array of application objects with name, UUID, status, FQDN, and deployment info.

### GET `/api/coolify/deployments`

Get active and recent deployments with summary stats.

**Response:**

```json
{
  "active": [],
  "recent": [],
  "stats": {
    "queued": 0,
    "inProgress": 1,
    "finishedToday": 3,
    "failedToday": 0
  }
}
```

### GET `/api/coolify/deployments?view=all`

Paginated deployment history with filters.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `view` | string | Set to `"all"` for full history |
| `page` | number | Page number for pagination |
| `status` | string | Filter by deployment status |

### GET `/api/coolify/deployments/[uuid]`

Get details for a single deployment including build logs.

### POST `/api/coolify/deployments/[uuid]/cancel`

Cancel a queued or in-progress deployment.

### POST `/api/coolify/deploy`

Trigger a new deployment for an application.

**Request:**

```json
{
  "uuid": "application-uuid-here"
}
```

---

## BullMQ Queues

### GET `/api/bullmq/queues`

Get all discovered queue statistics with worker health status.

**Response:**

```json
{
  "queues": [
    {
      "name": "email",
      "waiting": 5,
      "active": 2,
      "completed": 150,
      "failed": 3,
      "delayed": 0,
      "workers": { "up": 2, "down": 0 }
    }
  ]
}
```

### GET `/api/bullmq/jobs/failed`

Get failed jobs across all queues.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `queue` | string | Filter to a specific queue name |

### POST `/api/bullmq/jobs/failed`

Perform actions on failed jobs.

**Request:**

```json
{
  "action": "retry",
  "jobId": "123",
  "queue": "email"
}
```

| Action | Description |
|--------|-------------|
| `retry` | Retry a specific failed job |
| `delete` | Delete a specific failed job |
| `retry_all` | Retry all failed jobs in a queue |
| `delete_all` | Delete all failed jobs in a queue |

### POST `/api/bullmq/queues/[queue]/pause`

Pause a queue (stops processing new jobs; active jobs continue).

### POST `/api/bullmq/queues/[queue]/resume`

Resume a paused queue.

---

## Infrastructure

### GET `/api/postgres/health`

PostgreSQL and PgBouncer metrics including connections, database sizes, and pool stats.

**Response includes:**
- Connection counts (active, idle, max)
- Per-database sizes
- PgBouncer pool utilization (if configured)

### GET `/api/postgres/backups`

PostgreSQL backup freshness metrics: logical dump age, WAL archiving status, WAL-G base backup age, and restore drill recency.

### GET `/api/servers/status`

VPS metrics and site health data.

**Response includes:**
- CPU, memory, disk usage for configured VPS instances
- Site health checks (HTTP status, SSL certificate expiry)

### GET `/api/workers/status`

Worker supervisor status for systemd/PM2/Coolify-managed workers.

**Response includes:**
- Worker name, source (systemd/pm2/docker), status
- Summary counts (total, ok, warning, down)

> Workers are reported as stale if their status hasn't been updated within `WORKER_STATUS_MAX_AGE_SEC` seconds (default: 180).

---

## Server-Sent Events

### GET `/api/sse/updates`

Real-time event stream for dashboard updates. Requires authentication.

**Connection details:**

| Parameter | Value |
|-----------|-------|
| Content-Type | `text/event-stream` |
| Poll interval | 15 seconds |
| Heartbeat | Every 5 seconds (`: heartbeat` comment) |
| Reconnect | Automatic (client-side, 3-second delay) |

**Event types:**

| Type | Description |
|------|-------------|
| `connected` | Initial connection confirmation |
| `update` | Full state update with all metrics |
| `error` | Error occurred during data collection |

**Update event payload includes:**
- Service health (Coolify, Prometheus, Redis)
- Deployment status and statistics
- PostgreSQL and PgBouncer metrics
- Backup freshness data
- Queue statistics
- VPS metrics
- Site health checks
- Worker supervisor status
- Alertmanager alerts

---

## Alertmanager

### GET `/api/alertmanager/alerts`

Get firing and suppressed alerts from Alertmanager.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Maximum number of alerts to return |

**Response:**

```json
{
  "status": "warning",
  "message": "2 firing (1 critical, 1 warning)",
  "fetchedAt": "2025-01-15T10:30:00.000Z",
  "total": 3,
  "firing": 2,
  "suppressed": 1,
  "bySeverity": {
    "critical": 1,
    "warning": 1,
    "info": 0,
    "unknown": 0
  },
  "alerts": [
    {
      "fingerprint": "abc123",
      "name": "HighErrorRate",
      "severity": "critical",
      "state": "firing",
      "startsAt": "2025-01-15T09:00:00Z",
      "summary": "Error rate above 5%",
      "labels": {},
      "annotations": {},
      "silencedBy": [],
      "inhibitedBy": []
    }
  ]
}
```

> Requires `ALERTMANAGER_URL` to be configured. Returns empty list with `status: "unknown"` if not configured.

---

## AutoHEAL

### GET `/api/autoheal/config`

Get the current AutoHEAL configuration.

### POST `/api/autoheal/config`

Update AutoHEAL configuration.

**Request body includes:**

```json
{
  "enabled": true,
  "failureThreshold": 2,
  "failureWindowSec": 120,
  "cooldownSec": 600,
  "skipWhenDeploying": true,
  "redeployAfterRestart": true,
  "redeployDelaySec": 90,
  "enabledSites": ["uuid-1", "uuid-2"]
}
```

### GET `/api/autoheal/status`

Get AutoHEAL worker heartbeat status, recent events, and per-site state.

**Response includes:**
- Worker heartbeat (version, host, last update, stale indicator)
- Summary statistics (checked, healthy, degraded, unhealthy, restarts, redeploys)
- Recent action events
- Per-site failure counts, phases, and cooldown status

> The worker status is marked as stale if the heartbeat hasn't been updated within `AUTOHEAL_STATUS_MAX_AGE_SEC` seconds (default: 180).

---

## Agents

### GET `/api/agents/runs`

Get latest run summaries for all known agents.

**Response:**

```json
{
  "agents": [
    {
      "name": "backup-monitor",
      "lastRun": { "status": "success", "finishedAt": "..." }
    }
  ],
  "stats": {
    "total": 5,
    "success": 4,
    "failed": 1
  }
}
```

### GET `/api/agents/[name]/history`

Get run history for a specific agent.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Number of runs to return |

**Response:**

```json
{
  "agent": "backup-monitor",
  "runs": [
    {
      "status": "success",
      "startedAt": "2025-01-15T06:00:00Z",
      "finishedAt": "2025-01-15T06:00:12Z",
      "durationMs": 12000
    }
  ]
}
```

---

## Self-Metrics

### GET `/metrics`

Prometheus-format metrics for the dashboard itself (not part of `/api/` prefix).

**Authentication:** If `METRICS_TOKEN` is set, requires either:
- `Authorization: Bearer <token>` header
- `x-metrics-token: <token>` header

If `METRICS_TOKEN` is not set, the endpoint is publicly accessible.

**Exposed metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `infra_dashboard_bullmq_op_duration_seconds` | Histogram | Latency of BullMQ/Redis operations |
| `infra_dashboard_bullmq_op_total` | Counter | Count of BullMQ/Redis operations |
| `infra_dashboard_bullmq_discovered_queues` | Gauge | Number of discovered BullMQ queues |
| `infra_dashboard_uptime_kuma_metrics_fetch_duration_seconds` | Histogram | Latency of Uptime Kuma metrics fetches |
| `infra_dashboard_uptime_kuma_metrics_fetch_total` | Counter | Count of Uptime Kuma fetch attempts |

Plus default Node.js metrics from `prom-client` (process CPU, memory, heap, etc.).

---

## Error Responses

All API endpoints follow a consistent error format:

```json
{
  "error": "Description of what went wrong"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `401` | Not authenticated (session cookie missing or invalid) |
| `500` | Internal server error (service connection failure, etc.) |
| `503` | Service degraded (used by `/api/health` when services are down) |
