# Infra Dashboard

Real-time infrastructure monitoring dashboard for Coolify-managed applications, BullMQ job queues, PostgreSQL databases, and VPS servers. Built with Next.js 16, React 19, and TypeScript.

## Quick Start

```bash
git clone https://github.com/cvsloane/infra-dashboard.git
cd infra-dashboard
cp .env.example .env.local  # Edit with your credentials
npm install
npm run dev                 # http://localhost:3000
```

## Features

- **Overview Dashboard** - Unified view of infrastructure health at a glance
- **Coolify Integration** - Application status, trigger/cancel deployments, real-time build logs
- **Queue Management** - BullMQ queue stats, worker health, retry/delete failed jobs (single or bulk), pause/resume queues
- **PostgreSQL Monitoring** - Connection pools, PgBouncer stats, per-database metrics
- **Server Metrics** - CPU, memory, disk, load averages for app and database servers
- **Site Health** - HTTP status and SSL certificate checks for all deployed applications
- **Worker Supervisor** - Systemd/PM2/Coolify worker health with auto-restart watchdog
- **AutoHEAL** - Automatic remediation (restart + redeploy) for down sites
- **Agents** - Run summaries and history for background automation agents

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation and initial setup |
| [Configuration](docs/configuration.md) | Environment variables and config options |
| [Coolify Setup](docs/coolify-setup.md) | Integrating with Coolify |
| [Prometheus Setup](docs/prometheus-setup.md) | Metrics collection setup |
| [BullMQ Setup](docs/bullmq-setup.md) | Queue monitoring configuration |
| [AutoHEAL Setup](docs/autoheal.md) | Automatic recovery system |

## Architecture

```
Browser <──── HTTPS ────> Next.js App (standalone)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         SSE (15s)        API Routes       Direct DB
              │                │                │
         Coolify API      Prometheus       Coolify DB
              │                │                │
              └────────────────┼────────────────┘
                               │
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
| `/api/coolify/applications` | GET | List all Coolify applications |
| `/api/coolify/deployments` | GET | Get active + recent deployments with stats |
| `/api/coolify/deployments?view=all` | GET | Paginated deployment history with filters |
| `/api/coolify/deployments/[uuid]` | GET | Get single deployment with logs |
| `/api/coolify/deployments/[uuid]/cancel` | POST | Cancel queued/in-progress deployment |
| `/api/coolify/deploy` | POST | Trigger deployment for an application |

### BullMQ Queues
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bullmq/queues` | GET | Get all queue stats with worker health |
| `/api/bullmq/jobs/failed` | GET | Get failed jobs (supports `?queue=` filter) |
| `/api/bullmq/jobs/failed` | POST | Retry/delete jobs (`action`: retry, delete, retry_all, delete_all) |
| `/api/bullmq/queues/[queue]/pause` | POST | Pause queue processing |
| `/api/bullmq/queues/[queue]/resume` | POST | Resume paused queue |

### Infrastructure
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Basic health check (public, no auth required) |
| `/api/postgres/health` | GET | PostgreSQL + PgBouncer metrics |
| `/api/servers/status` | GET | VPS metrics and site health |
| `/api/workers/status` | GET | Worker supervisor status (systemd/PM2/Coolify) |
| `/api/sse/updates` | GET | Server-Sent Events stream for real-time updates |

### AutoHEAL
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/autoheal/config` | GET | Get AutoHEAL configuration |
| `/api/autoheal/config` | POST | Update AutoHEAL configuration |

### Agents
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/runs` | GET | Get latest run summaries for all agents |
| `/api/agents/[name]/history` | GET | Get run history for a specific agent (supports `?limit=` parameter) |

## Configuration

See `.env.example` and [docs/configuration.md](docs/configuration.md) for all options.

**Security note:** set `DASHBOARD_PASSWORD` in production.

## Deployment

### Docker
```bash
docker build -t infra-dashboard .
docker run -p 3000:3000 --env-file .env.local infra-dashboard
```

### Coolify
1. Create application from Git repository
2. Set build pack to Dockerfile
3. Configure environment variables in Coolify UI
4. Ensure container is on the `coolify` Docker network to access `coolify-db`

## Technical Details

### SSE Real-Time Updates
- **Poll interval**: 15 seconds (avoids Coolify API rate limiting)
- **Heartbeat**: 5 seconds (keeps connection alive through proxies)
- **Reconnect**: Automatic with 3-second delay

### Worker Detection
BullMQ workers are detected via `bull:*:stalled-check` TTL keys in Redis. A worker is marked DOWN after 5 consecutive check failures (not just a single missed heartbeat).

### Database Connections
- **Coolify DB**: Direct PostgreSQL queries for real-time deployment tracking
- **App Metrics**: Prometheus queries to postgres_exporter and pgbouncer_exporter

### Authentication
- Optional password protection via `DASHBOARD_PASSWORD`
- Sessions stored as httpOnly cookies, valid for 7 days
- Public endpoints: `/login`, `/api/health`
