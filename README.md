# Infra Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A real-time infrastructure monitoring dashboard for self-hosted environments. Monitor your Coolify applications, BullMQ job queues, PostgreSQL databases, and VPS servers from a single unified interface.

Built with Next.js 16, React 19, and TypeScript.

## Features

### Application Management
- **Coolify Integration** - View all applications, their status, and deployment history
- **One-Click Deployments** - Trigger or cancel deployments directly from the dashboard
- **Real-Time Logs** - Stream build logs as deployments progress

### Queue Monitoring
- **BullMQ Support** - Monitor job queues across all your applications
- **Worker Health** - Track worker status with automatic DOWN detection
- **Job Management** - Retry or delete failed jobs, pause/resume queues

### Database Insights
- **PostgreSQL Metrics** - Connection counts, database sizes, activity stats
- **PgBouncer Monitoring** - Connection pool utilization and health
- **Historical Data** - Connection trends via Prometheus

### Server Health
- **VPS Metrics** - CPU, memory, disk usage, and load averages
- **Site Health Checks** - HTTP status and SSL certificate monitoring
- **Multi-Server Support** - Monitor multiple VPS instances

### Automatic Recovery
- **AutoHEAL System** - Automatically restart/redeploy unresponsive applications
- **Configurable Thresholds** - Set failure counts, cooldowns, and recovery strategies
- **Skip During Deploys** - Intelligent detection of active deployments

## Quick Start

```bash
# Clone and install
git clone https://github.com/cvsloane/infra-dashboard.git
cd infra-dashboard
npm install

# Configure
cp .env.example .env.local
# Edit .env.local with your Coolify API credentials

# Run
npm run dev
```

Visit http://localhost:3000 to access the dashboard.

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation and initial setup |
| [Configuration](docs/configuration.md) | All environment variables explained |
| [Coolify Setup](docs/coolify-setup.md) | Integrating with Coolify |
| [Prometheus Setup](docs/prometheus-setup.md) | Setting up metrics collection |
| [BullMQ Setup](docs/bullmq-setup.md) | Queue monitoring configuration |
| [AutoHEAL Setup](docs/autoheal.md) | Automatic recovery system |

## Minimal Configuration

At minimum, you need Coolify credentials:

```bash
# .env.local
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
COOLIFY_API_TOKEN=your-api-token
DASHBOARD_PASSWORD=your-secure-password
```

See [Configuration](docs/configuration.md) for the full list of options.

## Architecture

```
Browser <──── HTTPS ────> Next.js App (standalone)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         SSE (15s)        API Routes       Direct DB
              │                │                │
         Coolify API      Prometheus       Coolify DB
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         node_exporter   postgres_exp    pgbouncer_exp

         Redis ◄── BullMQ queues + AutoHEAL config
```

## API Reference

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate with dashboard password |
| `/api/auth/logout` | POST | Clear session cookie |

### Coolify
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/coolify/applications` | GET | List all applications |
| `/api/coolify/deployments` | GET | Get deployments with stats |
| `/api/coolify/deploy` | POST | Trigger deployment |
| `/api/coolify/deployments/[uuid]/cancel` | POST | Cancel deployment |

### BullMQ
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bullmq/queues` | GET | Get all queue stats |
| `/api/bullmq/jobs/failed` | GET | Get failed jobs |
| `/api/bullmq/jobs/failed` | POST | Retry/delete jobs |

### Infrastructure
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (public) |
| `/api/postgres/health` | GET | Database metrics |
| `/api/servers/status` | GET | VPS and site health |
| `/api/sse/updates` | GET | Real-time updates stream |

## Deployment

### Docker

```bash
docker build -t infra-dashboard .
docker run -d -p 3000:3000 --env-file .env.local infra-dashboard
```

### Coolify

1. Create application from Git repository
2. Select "Dockerfile" build pack
3. Configure environment variables in UI
4. Ensure container is on `coolify` network for database access

## Security

- **Always set `DASHBOARD_PASSWORD`** in production
- Sessions use httpOnly cookies (7-day expiry)
- API tokens never exposed to client
- See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
