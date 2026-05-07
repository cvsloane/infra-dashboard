# Setup Guide

Quick reference for setting up infra-dashboard. For detailed guides, see the [docs](docs/) directory.

## Prerequisites

| Requirement | Version | Required? |
|-------------|---------|-----------|
| Node.js | 18+ | Yes |
| npm | 9+ | Yes |
| Coolify | Latest | Yes |
| Git | Any | Yes |
| Redis | 6+ | Optional (BullMQ queues) |
| Prometheus | Latest | Optional (VPS/DB metrics) |

## Quick Install

```bash
git clone https://github.com/cvsloane/infra-dashboard.git
cd infra-dashboard
cp .env.example .env.local
# Edit .env.local with your credentials
npm install
npm run dev
```

Open http://localhost:3000 to see your dashboard.

## Environment Configuration

All configuration is done through environment variables in `.env.local`. Copy `.env.example` as a template.

### Required

```bash
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
COOLIFY_API_TOKEN=your-api-token
```

### Strongly Recommended

```bash
DASHBOARD_PASSWORD=your-secure-password
```

### Optional Integrations

```bash
# Real-time deployment tracking & site health
COOLIFY_DB_URL=postgresql://coolify:password@host:5432/coolify

# VPS & database metrics
PROMETHEUS_URL=http://your-prometheus:9090
VPS_PRIMARY_INSTANCE=192.168.1.100:9100

# BullMQ queue monitoring
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Alertmanager alerts
ALERTMANAGER_URL=http://your-alertmanager:9093

# Uptime Kuma integration
UPTIME_KUMA_URL=http://uptime-kuma:3001
UPTIME_KUMA_STATUS_PAGE=main

# Self-metrics endpoint protection
METRICS_TOKEN=your-metrics-secret
```

> See [docs/configuration.md](docs/configuration.md) for the complete reference with all variables and examples.

## Docker Deployment

```bash
docker build -t infra-dashboard .
docker run -d \
  -p 3000:3000 \
  --env-file .env.local \
  --restart unless-stopped \
  infra-dashboard
```

## Coolify Deployment

1. Create a new application from the Git repository
2. Set build pack to **Dockerfile**
3. Configure environment variables in the Coolify UI
4. If accessing the Coolify database directly, add the container to the `coolify` Docker network and use `coolify-db` as the hostname in `COOLIFY_DB_URL`

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checking |
| `npm test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Next Steps

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Detailed setup walkthrough |
| [Configuration](docs/configuration.md) | Complete environment variable reference |
| [Coolify Setup](docs/coolify-setup.md) | Coolify API and database integration |
| [Prometheus Setup](docs/prometheus-setup.md) | Metrics collection with exporters |
| [BullMQ Setup](docs/bullmq-setup.md) | Queue monitoring configuration |
| [AutoHEAL Setup](docs/autoheal.md) | Automatic recovery system |
| [API Reference](API.md) | Complete API endpoint documentation |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Coolify connection fails | Verify URL ends with `/api/v1` and token is valid |
| No deployment data | Add `COOLIFY_DB_URL` for real-time tracking |
| No queues found | Check Redis connectivity with `redis-cli -h $REDIS_HOST KEYS "bull:*"` |
| Prometheus unavailable | Ensure `PROMETHEUS_URL` has no trailing slash |
| No data at all | Check that required env vars are set in `.env.local` |
