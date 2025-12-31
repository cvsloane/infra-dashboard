# Configuration Reference

All configuration is done via environment variables. Create a `.env.local` file in the project root.

## Coolify Integration

### COOLIFY_API_URL
**Required** | Example: `http://192.168.1.100:8000/api/v1`

The Coolify API endpoint. This is typically your Coolify server's IP or hostname on port 8000.

```bash
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
```

### COOLIFY_API_TOKEN
**Required** | Example: `1|abc123...`

API token generated in Coolify UI under Settings → API Tokens.

```bash
COOLIFY_API_TOKEN=your-token-here
```

### COOLIFY_DB_URL
**Optional** | Example: `postgresql://coolify:password@localhost:5432/coolify`

Direct PostgreSQL connection to Coolify's database. Enables real-time deployment tracking (faster than API polling) and site health checks.

When running in Coolify, use the container name:
```bash
COOLIFY_DB_URL=postgresql://coolify:password@coolify-db:5432/coolify
```

---

## Prometheus Metrics

### PROMETHEUS_URL
**Optional** | Example: `http://192.168.1.100:9090`

Prometheus server URL for querying metrics.

```bash
PROMETHEUS_URL=http://your-prometheus-server:9090
```

### VPS_PRIMARY_INSTANCE
**Optional** | Example: `192.168.1.100:9100`

node_exporter instance for your primary/application server. Format: `hostname:port`

```bash
VPS_PRIMARY_INSTANCE=192.168.1.100:9100
```

### VPS_DATABASE_INSTANCE
**Optional** | Example: `192.168.1.101:9100`

node_exporter instance for your database server (if separate).

```bash
VPS_DATABASE_INSTANCE=192.168.1.101:9100
```

---

## Redis / BullMQ

### REDIS_URL
**Optional** | Example: `redis://user:password@localhost:6379`

Full Redis connection URL. Takes precedence over individual parameters.

```bash
REDIS_URL=redis://default:mypassword@192.168.1.100:6379
```

### REDIS_HOST
**Optional** | Default: none | Example: `192.168.1.100`

Redis server hostname or IP.

```bash
REDIS_HOST=192.168.1.100
```

### REDIS_PORT
**Optional** | Default: `6379`

Redis server port.

```bash
REDIS_PORT=6379
```

### REDIS_PASSWORD
**Optional** | Example: `your-redis-password`

Redis authentication password.

```bash
REDIS_PASSWORD=your-redis-password
```

### REDIS_USERNAME
**Optional** | Example: `default`

Redis username (for ACL-based authentication).

```bash
REDIS_USERNAME=default
```

---

## Uptime Kuma

### UPTIME_KUMA_URL
**Optional** | Example: `http://192.168.1.100:3001`

Uptime Kuma server URL for monitor status.

```bash
UPTIME_KUMA_URL=http://your-uptime-kuma:3001
```

### UPTIME_KUMA_STATUS_PAGE
**Optional** | Example: `main`

Status page slug from Uptime Kuma. This is the identifier in your status page URL.

```bash
UPTIME_KUMA_STATUS_PAGE=main
```

---

## Site Health

### SITE_HEALTH_EXCLUSIONS
**Optional** | Example: `internal-tool,staging.example.com`

Comma-separated list of application names or domains to exclude from health monitoring.

```bash
SITE_HEALTH_EXCLUSIONS=internal-worker,dev-app,staging.mysite.com
```

---

## Authentication

### DASHBOARD_PASSWORD
**Optional** | Example: `your-secure-password`

If set, users must enter this password to access the dashboard. Sessions last 7 days.

**Strongly recommended for production deployments.**

```bash
DASHBOARD_PASSWORD=your-secure-password
```

---

## Application

### NEXT_PUBLIC_APP_URL
**Optional** | Example: `https://ops.yourdomain.com`

Public URL of the dashboard. Used for SSE connection URLs in client-side code.

```bash
NEXT_PUBLIC_APP_URL=https://ops.yourdomain.com
```

---

## Example Configurations

### Minimal (Coolify only)
```bash
COOLIFY_API_URL=http://192.168.1.100:8000/api/v1
COOLIFY_API_TOKEN=your-token
DASHBOARD_PASSWORD=secure-password
```

### Full Stack
```bash
# Coolify
COOLIFY_API_URL=http://192.168.1.100:8000/api/v1
COOLIFY_API_TOKEN=your-token
COOLIFY_DB_URL=postgresql://coolify:pass@192.168.1.100:5432/coolify

# Prometheus
PROMETHEUS_URL=http://192.168.1.100:9090
VPS_PRIMARY_INSTANCE=192.168.1.100:9100
VPS_DATABASE_INSTANCE=192.168.1.101:9100

# Redis
REDIS_HOST=192.168.1.100
REDIS_PORT=6379
REDIS_PASSWORD=redis-password

# Optional
UPTIME_KUMA_URL=http://192.168.1.100:3001
UPTIME_KUMA_STATUS_PAGE=main
SITE_HEALTH_EXCLUSIONS=internal-tool

# Security
DASHBOARD_PASSWORD=secure-password
NEXT_PUBLIC_APP_URL=https://ops.yourdomain.com
```
