# Getting Started

Welcome! This guide will take you from zero to a fully functional dashboard monitoring your infrastructure. Whether you're a seasoned DevOps engineer or just getting started with self-hosting, you'll find everything you need here.

**What you'll accomplish:**
- Install and run the dashboard locally
- Connect it to your Coolify instance
- Configure additional integrations (queues, metrics, databases)
- Deploy to production securely

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Minimal Configuration](#minimal-configuration)
- [Feature-Specific Setup](#feature-specific-setup)
- [Production Deployment](#production-deployment)
- [Next Steps](#next-steps)
- [Troubleshooting Quick Reference](#troubleshooting-quick-reference)

---

## Prerequisites

Before you begin, ensure you have the following installed and accessible:

| Requirement | Version | Purpose | Required? |
|-------------|---------|---------|-----------|
| **Node.js** | 18+ | Required for Next.js 16 | ✅ Yes |
| **npm** | 9+ | Package management | ✅ Yes |
| **Coolify** | Latest | Application management platform | ✅ Yes |
| **Git** | Any | Clone the repository | ✅ Yes |
| **Redis** | 6+ | BullMQ queue monitoring | ❌ Optional |
| **Prometheus** | Latest | VPS and database metrics | ❌ Optional |

> **💡 Start simple:** You only need Node.js, npm, and Coolify to get started. The dashboard gracefully handles missing optional integrations—simply configure them when you're ready.

### Checking Your Versions

```bash
# Verify Node.js version (should be 18 or higher)
node --version

# Verify npm version
npm --version

# Verify Git
git --version
```

---

## Quick Start

Get up and running in under 5 minutes with these commands:

```bash
# 1. Clone the repository
git clone https://github.com/cvsloane/infra-dashboard.git
cd infra-dashboard

# 2. Create your configuration file
cp .env.example .env.local

# 3. Configure your credentials
# Use your preferred editor: nano, vim, or VS Code
nano .env.local

# 4. Install dependencies
npm install

# 5. Start the development server
npm run dev
```

**🎉 Success!** Visit [http://localhost:3000](http://localhost:3000) to see your dashboard.

**Next:** Continue reading to configure Coolify integration and unlock the dashboard's full potential.

---

## Minimal Configuration

The dashboard only requires Coolify credentials to display your applications. Here's the minimal configuration:

```bash
# .env.local (minimal)
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
COOLIFY_API_TOKEN=your-api-token-here
DASHBOARD_PASSWORD=your-secure-password
```

### Getting Your Coolify API Token

Your API token authenticates the dashboard with your Coolify instance:

1. Log into your Coolify dashboard
2. Navigate to **Settings** → **API Tokens**
3. Click **Create New Token**
4. Enter a descriptive name (e.g., "infra-dashboard")
5. **Important:** Copy the token immediately—it won't be shown again
6. Paste it into your `.env.local` file

### Finding Your Coolify URL

| Scenario | URL Format | Example |
|----------|------------|---------|
| Same local network | Internal IP | `http://192.168.1.100:8000/api/v1` |
| VPN (Tailscale, etc.) | VPN IP | `http://100.x.x.x:8000/api/v1` |
| Public domain | HTTPS domain | `https://coolify.example.com/api/v1` |

> **Understanding the architecture:** The dashboard uses two connection methods to Coolify:
> - **API** → Application lists, deployment control (required)
> - **Database** → Real-time updates, site health (optional, added later)
>
> Start with just the API—you'll add database access when you want real-time updates.

---

## Feature-Specific Setup

Enable only the features you need. Each integration adds new capabilities to your dashboard:

| Feature | What You Get | Required Services | Key Variables |
|---------|--------------|-------------------|---------------|
| **Application List** | View all Coolify apps and their status | Coolify API | `COOLIFY_API_URL`, `COOLIFY_API_TOKEN` |
| **Deployment Tracking** | Real-time deployment progress | Coolify API + DB | `COOLIFY_DB_URL` |
| **Queue Monitoring** | BullMQ stats, failed job management | Redis | `REDIS_HOST`, `REDIS_PORT` |
| **VPS Metrics** | CPU, memory, disk, load averages | Prometheus + node_exporter | `PROMETHEUS_URL`, `VPS_*_INSTANCE` |
| **Database Metrics** | PostgreSQL connections, sizes | Prometheus + postgres_exporter | `PROMETHEUS_URL` |
| **Site Health** | HTTP status and SSL monitoring | Coolify DB | `COOLIFY_DB_URL` |
| **Worker Supervisor** | Background job worker health | Redis + worker-supervisor | `REDIS_HOST`, `REDIS_PORT` |
| **Agents** | Automation run tracking | Redis | `REDIS_HOST`, `REDIS_PORT` |
| **AutoHEAL** | Automatic failure recovery | Redis + Coolify API | All Coolify + Redis vars |

> **Graceful degradation:** If `PROMETHEUS_URL` is not configured, the metrics panels will show as "unavailable"—this is expected behavior, not an error. The dashboard continues to work with available data sources.

---

## Production Deployment

### Option 1: Docker

Docker provides consistent, isolated deployments across any environment:

```bash
# Build the production image
docker build -t infra-dashboard:latest .

# Run with your environment file
docker run -d \
  --name infra-dashboard \
  -p 3000:3000 \
  --env-file .env.local \
  --restart unless-stopped \
  infra-dashboard:latest
```

**Verify it's running:**
```bash
docker ps | grep infra-dashboard
docker logs -f infra-dashboard
```

### Option 2: Coolify (Self-Hosting Meta)

Deploy infra-dashboard through Coolify itself for the ultimate self-hosting experience—monitor your infrastructure from an app running on that same infrastructure.

**Setup steps:**

1. In Coolify, create a **New Application**
2. Select **Docker** as the build pack
3. Point to this Git repository
4. Add your environment variables in the Coolify UI (copy from `.env.local`)
5. **Critical:** Add the `coolify` Docker network to your service if accessing the Coolify database

**Network Configuration:**

When running inside Coolify's Docker network, use container names instead of IP addresses:

```bash
# Inside Coolify network
COOLIFY_DB_URL=postgresql://coolify:password@coolify-db:5432/coolify

# Instead of using an IP
COOLIFY_DB_URL=postgresql://coolify:password@192.168.1.100:5432/coolify
```

The container must be on the `coolify` network to resolve `coolify-db` as a hostname.

### Security Checklist for Production

**Required:**
- [ ] Set `DASHBOARD_PASSWORD` to a strong, unique password
- [ ] Enable HTTPS (via reverse proxy or Coolify's built-in SSL)
- [ ] Keep `.env.local` out of version control (it's in `.gitignore` by default)

**Recommended:**
- [ ] Restrict dashboard access to VPN or internal network
- [ ] Set up automated backups of your configuration
- [ ] Rotate passwords periodically (quarterly recommended)
- [ ] Monitor logs for unauthorized access attempts

**How authentication works:**
- Password-protected sessions use httpOnly cookies
- Sessions remain valid for 7 days
- Public endpoints (`/login`, `/api/health`) remain accessible for health checks

---

## Next Steps

Congratulations! Your dashboard is running. Now explore these guides to unlock its full potential:

| Guide | What You'll Learn | Time to Complete |
|-------|-------------------|------------------|
| [Configuration Reference](./configuration.md) | Every environment variable explained | 10 minutes |
| [Coolify Setup](./coolify-setup.md) | Deep dive into API and database integration | 15 minutes |
| [Prometheus Setup](./prometheus-setup.md) | Complete metrics collection setup | 20 minutes |
| [BullMQ Setup](./bullmq-setup.md) | Queue monitoring and job management | 10 minutes |
| [AutoHEAL Setup](./autoheal.md) | Automatic failure recovery configuration | 15 minutes |

---

## Troubleshooting Quick Reference

| Problem | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| "Failed to connect to Coolify API" | Wrong URL or token | Verify `COOLIFY_API_URL` ends with `/api/v1` and token is copied correctly |
| "Database connection failed" | Network or credentials | Test with `psql $COOLIFY_DB_URL -c "SELECT 1"` |
| "No queues found" | Redis connection issue | Run `redis-cli -h $REDIS_HOST KEYS "bull:*"` to verify |
| "Prometheus unavailable" | Missing or wrong URL | Ensure `PROMETHEUS_URL` has no trailing slash |
| "Dashboard shows no data" | Services not configured | Check that required environment variables are set |

### Getting More Help

If these quick fixes don't resolve your issue:

1. **Check the detailed troubleshooting** in each feature-specific guide
2. **Review logs:** Run `npm run dev` and watch the terminal output
3. **Verify connectivity:** Use `curl` or database clients to test connections
4. **Open an issue:** Include your error messages and configuration (redact passwords and tokens)

---

*Last updated: 2025-01* · *Found an issue with this guide? [Let us know](https://github.com/cvsloane/infra-dashboard/issues)*
