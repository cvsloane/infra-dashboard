# Infra Dashboard

[![CI](https://github.com/cvsloane/infra-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/cvsloane/infra-dashboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/cvsloane/infra-dashboard)](https://github.com/cvsloane/infra-dashboard/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Your infrastructure, visible and actionable.**

A real-time monitoring dashboard that brings together everything you run: Coolify deployments, BullMQ queues, PostgreSQL metrics, and VPS health—all in one unified view. Built with Next.js 16, React 19, and TypeScript for a fast, modern experience.

## Why Infra Dashboard?

If you self-host applications with Coolify, you've probably felt the pain of context switching: checking deployment status in one tab, queue health in another, server metrics somewhere else. This dashboard solves that by bringing everything together.

**Before:** Five different tools, constant tab switching, mental overhead remembering where to look.

**After:** One dashboard, real-time updates, immediate action when things break.

## Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/cvsloane/infra-dashboard/main/docs/images/dashboard-overview.png" alt="Dashboard Overview" width="800">
</p>

<details>
<summary>More screenshots</summary>

| Coolify Deployments | Queue Management |
|:-------------------:|:----------------:|
| ![Coolify](https://raw.githubusercontent.com/cvsloane/infra-dashboard/main/docs/images/coolify-deployments.png) | ![Queues](https://raw.githubusercontent.com/cvsloane/infra-dashboard/main/docs/images/queue-management.png) |

| PostgreSQL Metrics |
|:------------------:|
| ![PostgreSQL](https://raw.githubusercontent.com/cvsloane/infra-dashboard/main/docs/images/postgres-metrics.png) |

</details>

## Quick Start

```bash
git clone https://github.com/cvsloane/infra-dashboard.git
cd infra-dashboard
cp .env.example .env.local  # Edit with your credentials
npm install
npm run dev                 # http://localhost:3000
```

**Prerequisites:** Node.js 18+, npm 9+, and a Coolify instance to connect to.

## Features

| Feature | What It Does | Why It Helps |
|---------|--------------|--------------|
| **📊 Overview Dashboard** | Unified infrastructure health at a glance | Know the status of everything in seconds, not minutes |
| **🚀 Coolify Integration** | App status, deployment control, real-time build logs | Manage deployments without leaving the dashboard |
| **📬 Queue Management** | BullMQ stats, worker health, bulk job actions | Fix failed jobs and monitor queue performance |
| **🐘 PostgreSQL Monitoring** | Connection pools, PgBouncer stats, per-database metrics | Spot database bottlenecks before they impact users |
| **🗄️ Database Backups** | Logical dump freshness, WAL archiving freshness, WAL-G base backup age, restore drill recency | Verify backups are current and restore procedures are exercised |
| **🖥️ Server Metrics** | CPU, memory, disk, load averages | Understand resource usage across your infrastructure |
| **🔍 Site Health** | HTTP status and SSL certificate checks | Know immediately when sites go down or certificates expire |
| **⚙️ Worker Supervisor** | Systemd/PM2/Coolify worker health monitoring | Ensure background jobs are always running |
| **🩹 AutoHEAL** | Automatic restart/redeploy for failing services | Reduce downtime without manual intervention |
| **🤖 Agents** | Background automation run tracking | Monitor scheduled tasks and maintenance jobs |

## Documentation

Each guide is designed to be self-contained—start where you need help:

| Guide | Description | When You Need It |
|-------|-------------|------------------|
| [Setup Guide](SETUP.md) | Quick install and configuration reference | First time setup |
| [API Reference](API.md) | Complete API endpoint documentation | Integrating or extending |
| [Getting Started](docs/getting-started.md) | Detailed installation and setup walkthrough | Step-by-step setup |
| [Configuration](docs/configuration.md) | Complete environment variable reference | Customizing your setup |
| [Coolify Setup](docs/coolify-setup.md) | Deep dive into Coolify integration | Connecting to Coolify |
| [Prometheus Setup](docs/prometheus-setup.md) | Metrics collection with exporters | Adding VPS/DB metrics |
| [BullMQ Setup](docs/bullmq-setup.md) | Queue monitoring configuration | Monitoring job queues |
| [AutoHEAL Setup](docs/autoheal.md) | Automatic recovery system | Enabling auto-remediation |

## Architecture

```
┌─────────┐     HTTPS      ┌─────────────────────────┐
│ Browser │◄──────────────►│   Next.js App           │
└─────────┘                │   (standalone build)    │
                           └───────────┬─────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
        ┌──────────┐            ┌──────────┐           ┌─────────────┐
        │  SSE     │            │  API     │           │  Direct DB  │
        │  (15s)   │            │  Routes  │           │  Connection │
        └────┬─────┘            └────┬─────┘           └──────┬──────┘
             │                       │                        │
             ▼                       ▼                        ▼
       ┌──────────┐           ┌──────────┐            ┌─────────────┐
       │ Coolify  │           │Prometheus│            │  Coolify    │
       │   API    │           │          │            │    DB       │
       └──────────┘           └────┬─────┘            └─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        ┌──────────┐      ┌────────────┐      ┌────────────┐
        │node_exp  │      │postgres_exp│      │pgbouncer_  │
        │          │      │            │      │  exporter  │
        └──────────┘      └────────────┘      └────────────┘

                           ┌────────┐
                           │ Redis  │◄──── BullMQ queues
                           │        │      + AutoHEAL config
                           └────────┘
```

**Data flow:** The dashboard aggregates information from multiple sources. Coolify API provides application control, direct database queries enable real-time updates, Prometheus delivers metrics, and Redis powers queue monitoring.

## API Reference

> See [**API.md**](API.md) for the complete API documentation with request/response examples.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate with dashboard password |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/health` | GET | Health check (public, no auth) |
| `/api/coolify/applications` | GET | List all Coolify applications |
| `/api/coolify/deployments` | GET | Active + recent deployments with stats |
| `/api/coolify/deployments?view=all` | GET | Paginated deployment history |
| `/api/coolify/deployments/[uuid]` | GET | Single deployment with logs |
| `/api/coolify/deployments/[uuid]/cancel` | POST | Cancel a deployment |
| `/api/coolify/deploy` | POST | Trigger deployment |
| `/api/bullmq/queues` | GET | Queue stats with worker health |
| `/api/bullmq/jobs/failed` | GET/POST | View and manage failed jobs |
| `/api/bullmq/queues/[queue]/pause` | POST | Pause a queue |
| `/api/bullmq/queues/[queue]/resume` | POST | Resume a queue |
| `/api/postgres/health` | GET | PostgreSQL + PgBouncer metrics |
| `/api/postgres/backups` | GET | Backup freshness (logical/WAL/base/drill) |
| `/api/servers/status` | GET | VPS metrics and site health |
| `/api/workers/status` | GET | Worker supervisor status |
| `/api/sse/updates` | GET | SSE stream for real-time updates |
| `/api/alertmanager/alerts` | GET | Firing and suppressed alerts |
| `/api/autoheal/config` | GET/POST | AutoHEAL configuration |
| `/api/autoheal/status` | GET | AutoHEAL worker heartbeat and events |
| `/api/agents/runs` | GET | Latest run summaries for all agents |
| `/api/agents/[name]/history` | GET | Run history for a specific agent |
| `/metrics` | GET | Self-metrics (Prometheus format) |

## Configuration

The dashboard is configured entirely through environment variables. See [`.env.example`](.env.example) for a complete template and [`docs/configuration.md`](docs/configuration.md) for detailed explanations.

### Essential Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `COOLIFY_API_URL` | Your Coolify API endpoint | Yes |
| `COOLIFY_API_TOKEN` | API token for Coolify access | Yes |
| `COOLIFY_DB_URL` | Direct PostgreSQL connection for real-time updates | Recommended |
| `DASHBOARD_PASSWORD` | Protects the dashboard with authentication | Strongly recommended |

### Optional Integration Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PROMETHEUS_URL` | Prometheus server URL | — |
| `VPS_PRIMARY_INSTANCE` | node_exporter target for app server | — |
| `VPS_DATABASE_INSTANCE` | node_exporter target for DB server | — |
| `REDIS_URL` | Full Redis connection URL (overrides individual params) | — |
| `REDIS_HOST` | Redis hostname | `127.0.0.1` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | — |
| `ALERTMANAGER_URL` | Alertmanager server URL | — |
| `UPTIME_KUMA_URL` | Uptime Kuma server URL | — |
| `UPTIME_KUMA_STATUS_PAGE` | Status page slug | — |
| `METRICS_TOKEN` | Bearer token for `/metrics` endpoint | — (public) |
| `SITE_HEALTH_EXCLUSIONS` | Comma-separated apps to exclude from health checks | — |
| `SITE_HEALTH_SSL_EXPIRY_WARN_DAYS` | Days before SSL cert expiry to show warning | `14` |
| `WORKER_STATUS_MAX_AGE_SEC` | Max age before worker status is stale | `180` |
| `AUTOHEAL_STATUS_KEY` | Redis key for AutoHEAL heartbeat | `infra:autoheal:status` |
| `AUTOHEAL_EVENTS_KEY` | Redis key for AutoHEAL events | `infra:autoheal:events` |
| `AUTOHEAL_STATUS_MAX_AGE_SEC` | Max age before AutoHEAL heartbeat is stale | `180` |
| `AUTOHEAL_EVENTS_LIMIT` | Max AutoHEAL events to display | `50` |

> **Security note:** Always set `DASHBOARD_PASSWORD` in production. Never commit credentials to version control.

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

### Real-Time Updates with SSE

The dashboard uses Server-Sent Events (SSE) to push updates to your browser without page refreshes:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Poll interval** | 15 seconds | Balances freshness with API rate limits |
| **Heartbeat** | 5 seconds | Keeps connection alive through proxies and firewalls |
| **Reconnect** | Automatic | 3-second delay with exponential backoff |

### How Worker Detection Works

BullMQ workers are detected via `bull:*:stalled-check` TTL keys in Redis. Rather than marking a worker DOWN on a single missed heartbeat, the dashboard waits for **5 consecutive failures**. This approach:

- Prevents false positives during brief network hiccups
- Handles temporary high load without alerting noise
- Ensures genuine worker issues are caught reliably

### Database Connection Architecture

| Connection | Method | Purpose | Performance |
|------------|--------|---------|-------------|
| **Coolify DB** | Direct PostgreSQL | Real-time deployment tracking, site health | Sub-second updates |
| **Metrics DB** | Prometheus queries | Time-series metrics, historical data | Optimized for analytics |
| **Queue State** | Redis | BullMQ job states, worker status | Instant access |

### Authentication & Security

- **Password protection** — Optional but strongly recommended via `DASHBOARD_PASSWORD`
- **Session management** — httpOnly cookies with 7-day expiration
- **Public endpoints** — Only `/login` and `/api/health` are accessible without authentication
- **Token storage** — All API tokens stay server-side in environment variables

## Development & Community

- **[Changelog](CHANGELOG.md)** — Recent updates and version history
- **[Contributing Guide](CONTRIBUTING.md)** — How to report issues, suggest features, and submit PRs
- **[Security Policy](SECURITY.md)** — Reporting vulnerabilities and best practices
- **[Project Status](project_status.md)** — Auto-generated recent activity summary

---

<p align="center">
  Built with ❤️ for the self-hosting community<br>
  <sub>MIT License · <a href="https://github.com/cvsloane/infra-dashboard">GitHub</a> · <a href="https://github.com/cvsloane/infra-dashboard/issues">Issues</a></sub>
</p>
