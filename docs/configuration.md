# Configuration Reference

Complete documentation for all environment variables in infra-dashboard. Use this guide to customize your setup and understand what each option controls.

## Table of Contents

- [Coolify Integration](#coolify-integration) — API and database connections
- [Prometheus Metrics](#prometheus-metrics) — Metrics collection endpoints
- [Redis / BullMQ](#redis--bullmq) — Queue monitoring and configuration storage
- [Uptime Kuma](#uptime-kuma) — External uptime monitoring
- [Site Health](#site-health) — Health check exclusions
- [Worker Supervisor](#worker-supervisor) — Worker health monitoring
- [Authentication](#authentication) — Dashboard access control
- [Example Configurations](#example-configurations) — Ready-to-use templates

---

## Coolify Integration

### `COOLIFY_API_URL`

**Required** — Your Coolify API endpoint.

```bash
COOLIFY_API_URL=http://192.168.1.100:8000/api/v1
```

The base URL for your Coolify instance's API. This enables the dashboard to list applications, trigger deployments, and cancel in-progress builds.

**Common URL patterns:**

| Scenario | URL Example |
|----------|-------------|
| Local network | `http://192.168.1.100:8000/api/v1` |
| VPN (Tailscale, WireGuard) | `http://100.x.x.x:8000/api/v1` |
| Public with SSL | `https://coolify.example.com/api/v1` |
| Inside Coolify network | `http://coolify:8000/api/v1` |

> **Note:** Always include the `/api/v1` suffix. The Coolify API version is required.

---

### `COOLIFY_API_TOKEN`

**Required** — Authentication token for Coolify API access.

```bash
COOLIFY_API_TOKEN=1|abc123def456...
```

**How to generate:**
1. Log into your Coolify dashboard
2. Navigate to **Settings** → **API Tokens**
3. Click **Create New Token**
4. Copy the token immediately (it won't be shown again)

**Security:** Store this securely—it's equivalent to a password for your Coolify instance.

---

### `COOLIFY_DB_URL`

**Optional but strongly recommended** — Direct PostgreSQL connection to Coolify's database.

```bash
# External access (dashboard outside Coolify network)
COOLIFY_DB_URL=postgresql://coolify:password@192.168.1.100:5432/coolify

# Internal access (dashboard inside Coolify network)
COOLIFY_DB_URL=postgresql://coolify:password@coolify-db:5432/coolify
```

**Why add database access?**

| Capability | API Only | With Database |
|------------|----------|---------------|
| Deployment status | 15-30 second delay | Real-time updates |
| Site health checks | ❌ Not available | ✅ Automatic HTTP/SSL monitoring |
| Deployment history | Limited | Complete with full logs |
| Performance | Subject to API rate limits | Direct queries, faster |

**Finding your database credentials:**

On your Coolify server, check the configuration:
```bash
ssh your-coolify-server
cat /data/coolify/.env | grep POSTGRES
```

> **Docker networking:** When running infra-dashboard as a Coolify-managed application, use `coolify-db` as the hostname. The container must be on the `coolify` Docker network for this hostname to resolve.

---

## Prometheus Metrics

### `PROMETHEUS_URL`

**Optional** — Your Prometheus server URL for metrics queries.

```bash
PROMETHEUS_URL=http://192.168.1.100:9090
```

Enables VPS system metrics and PostgreSQL database metrics in the dashboard.

**What happens if not set:**
- PostgreSQL and VPS metrics panels display as "unavailable"
- The dashboard continues to work with other data sources
- No error messages—just missing metrics

**Quick verification:**
```bash
curl "http://your-prometheus:9090/api/v1/query?query=up"
```

---

### `VPS_PRIMARY_INSTANCE`

**Optional** — node_exporter target for your primary/application server.

```bash
VPS_PRIMARY_INSTANCE=192.168.1.100:9100
```

Format: `hostname:port` — must exactly match the target in your Prometheus scrape configuration.

**Example prometheus.yml:**
```yaml
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['192.168.1.100:9100']  # Must match VPS_PRIMARY_INSTANCE
```

---

### `VPS_DATABASE_INSTANCE`

**Optional** — node_exporter target for your database server.

```bash
VPS_DATABASE_INSTANCE=192.168.1.101:9100
```

Use when your database runs on a separate server from your applications. This displays a second VPS health panel specifically for your database server.

**When to use:**
- ✅ Database on dedicated hardware/VM
- ✅ Database in separate cloud instance
- ❌ Single-server setup (omit this variable)

---

## Redis / BullMQ

Redis powers BullMQ queue monitoring and stores AutoHEAL configuration.

### `REDIS_URL`

**Optional** — Complete Redis connection URL.

```bash
REDIS_URL=redis://user:password@192.168.1.100:6379
```

**Takes precedence over individual parameters.** Use this when you have a complete connection string from your hosting provider (e.g., Redis Cloud, AWS ElastiCache).

---

### `REDIS_HOST`

**Optional** — Redis server hostname or IP.

```bash
REDIS_HOST=192.168.1.100
```

Default: `127.0.0.1`

---

### `REDIS_PORT`

**Optional** — Redis server port.

```bash
REDIS_PORT=6379
```

Default: `6379`

---

### `REDIS_PASSWORD`

**Optional** — Redis authentication password.

```bash
REDIS_PASSWORD=your-redis-password
```

Required if your Redis instance has AUTH enabled. **Strongly recommended for production.**

---

### `REDIS_USERNAME`

**Optional** — Redis username for ACL-based authentication.

```bash
REDIS_USERNAME=default
```

Use when your Redis server uses ACLs (Access Control Lists) for fine-grained permission management. Common with Redis 6+ and managed Redis services.

---

## Uptime Kuma

### `UPTIME_KUMA_URL`

**Optional** — Uptime Kuma server URL.

```bash
UPTIME_KUMA_URL=http://192.168.1.100:3001
```

Enables integration with Uptime Kuma for external monitoring status.

---

### `UPTIME_KUMA_STATUS_PAGE`

**Optional** — Status page slug from Uptime Kuma.

```bash
UPTIME_KUMA_STATUS_PAGE=main
```

This is the identifier in your status page URL (e.g., `http://uptime-kuma:3001/status/main`).

---

## Site Health

### `SITE_HEALTH_EXCLUSIONS`

**Optional** — Applications to exclude from health monitoring.

```bash
SITE_HEALTH_EXCLUSIONS=internal-tool,staging.example.com,worker-only-app
```

Comma-separated list of application names or domains. Useful for:
- Internal tools that don't need external monitoring
- Staging environments
- Worker-only applications with no HTTP interface

---

## Worker Supervisor

### `WORKER_STATUS_MAX_AGE_SEC`

**Optional** — Maximum age before worker status is considered stale.

```bash
WORKER_STATUS_MAX_AGE_SEC=180
```

Default: `180` (3 minutes)

Workers that haven't reported status within this window are marked as potentially unhealthy.

---

## Authentication

### `DASHBOARD_PASSWORD`

**Optional but strongly recommended** — Password-protects your dashboard.

```bash
DASHBOARD_PASSWORD=your-secure-password
```

When set, users must authenticate before accessing any data. Sessions are stored in httpOnly cookies and expire after 7 days.

**How it works:**
1. User visits dashboard → Redirected to login page
2. Enters password → Session cookie set (httpOnly, secure)
3. 7-day expiration → Automatic re-authentication required

**Password best practices:**

| Practice | Recommendation |
|----------|----------------|
| Length | Minimum 16 characters |
| Complexity | Mix of uppercase, lowercase, numbers, symbols |
| Generation | Use a password manager (Bitwarden, 1Password, etc.) |
| Rotation | Change quarterly or when team members leave |
| Storage | Never commit to version control |

**Example strong password:**
```bash
DASHBOARD_PASSWORD=Tr0ub4dor&3-Infra-Dash-2025!
```

> **Note:** This is just an example format. Generate your own unique password using a password manager.

---

## Example Configurations

### Configuration 1: Minimal (Coolify Only)

The fastest way to get started—just enough to see your applications.

```bash
# ═══════════════════════════════════════════════════
# COOLIFY (Required)
# ═══════════════════════════════════════════════════
COOLIFY_API_URL=http://192.168.1.100:8000/api/v1
COOLIFY_API_TOKEN=your-token-here

# ═══════════════════════════════════════════════════
# SECURITY (Strongly Recommended)
# ═══════════════════════════════════════════════════
DASHBOARD_PASSWORD=change-me-to-something-secure
```

**What you get:**
- ✅ Application list and status
- ✅ Trigger deployments manually
- ✅ Cancel in-progress deployments
- ✅ View deployment logs

**What's missing:**
- ⏱️ Real-time deployment updates (15-30s delay via API)
- 🔍 Site health monitoring
- 📊 Queue and metrics data

---

### Configuration 2: Standard (Coolify + Database)

Adds real-time capabilities for production use.

```bash
# ═══════════════════════════════════════════════════
# COOLIFY
# ═══════════════════════════════════════════════════
COOLIFY_API_URL=http://192.168.1.100:8000/api/v1
COOLIFY_API_TOKEN=your-token-here
COOLIFY_DB_URL=postgresql://coolify:password@192.168.1.100:5432/coolify

# ═══════════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════════
DASHBOARD_PASSWORD=change-me-to-something-secure
```

**What you get:**
- ✅ Everything from Minimal
- ✅ Real-time deployment updates (instant via database)
- ✅ Site health monitoring (HTTP/SSL checks)
- ✅ Complete deployment history

**When to use this:** Production deployments where you need immediate visibility into deployment status.

---

### Configuration 3: Full Stack (Everything)

Complete infrastructure visibility for serious self-hosters.

```bash
# ═══════════════════════════════════════════════════
# COOLIFY
# ═══════════════════════════════════════════════════
COOLIFY_API_URL=http://192.168.1.100:8000/api/v1
COOLIFY_API_TOKEN=your-token-here
COOLIFY_DB_URL=postgresql://coolify:password@192.168.1.100:5432/coolify

# ═══════════════════════════════════════════════════
# PROMETHEUS (VPS & Database Metrics)
# ═══════════════════════════════════════════════════
PROMETHEUS_URL=http://192.168.1.100:9090
VPS_PRIMARY_INSTANCE=192.168.1.100:9100
VPS_DATABASE_INSTANCE=192.168.1.101:9100

# ═══════════════════════════════════════════════════
# REDIS (BullMQ + AutoHEAL)
# ═══════════════════════════════════════════════════
REDIS_HOST=192.168.1.100
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# ═══════════════════════════════════════════════════
# OPTIONAL INTEGRATIONS
# ═══════════════════════════════════════════════════
UPTIME_KUMA_URL=http://192.168.1.100:3001
UPTIME_KUMA_STATUS_PAGE=main
SITE_HEALTH_EXCLUSIONS=internal-tool,staging-env

# ═══════════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════════
DASHBOARD_PASSWORD=change-me-to-something-secure
```

**What you get:**
- ✅ Complete application and deployment visibility
- ✅ BullMQ queue monitoring and management
- ✅ VPS and database metrics
- ✅ Automatic failure recovery (AutoHEAL)
- ✅ Worker supervision
- ✅ External uptime monitoring (Uptime Kuma)

**When to use this:** When you're running mission-critical services and need comprehensive observability.

---

## Environment Variable Priority

When multiple connection options are provided, the dashboard uses this priority:

| Priority | Variable | Behavior |
|----------|----------|----------|
| 1 | `REDIS_URL` | If set, ignores all individual Redis parameters |
| 2 | Individual Redis params | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_USERNAME` |
| 3 | Default values | `127.0.0.1:6379`, no password |

**Example:** If you set both `REDIS_URL` and `REDIS_HOST`, the dashboard uses `REDIS_URL` and ignores `REDIS_HOST`.

This allows you to override specific settings without rewriting your entire configuration.
