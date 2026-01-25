# Getting Started

This guide walks you through setting up infra-dashboard from scratch.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - Required for Next.js 15
- **Coolify** - Self-hosted PaaS running on your server
- **Redis** - For BullMQ queue monitoring (optional)
- **Prometheus** - For VPS and database metrics (optional)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/cvsloane/infra-dashboard-oss.git
cd infra-dashboard-oss

# Install dependencies
npm install

# Create your configuration file
cp .env.example .env.local

# Edit .env.local with your credentials (see Configuration guide)
nano .env.local

# Start the development server
npm run dev
```

Visit http://localhost:3000 to see the dashboard.

## Minimal Configuration

At minimum, you need to configure Coolify to see your applications:

```bash
# .env.local (minimal)
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
COOLIFY_API_TOKEN=your-api-token-here
```

### Getting Your Coolify API Token

1. Log into your Coolify dashboard
2. Go to **Settings** → **API Tokens**
3. Click **Create New Token**
4. Give it a name (e.g., "infra-dashboard")
5. Copy the token and add it to your `.env.local`

## Feature-Specific Setup

Different features require different services. Enable only what you need:

| Feature | Required Services | Configuration |
|---------|-------------------|---------------|
| Application List | Coolify API | `COOLIFY_API_URL`, `COOLIFY_API_TOKEN` |
| Deployment Tracking | Coolify DB | `COOLIFY_DB_URL` |
| Queue Monitoring | Redis | `REDIS_HOST`, `REDIS_PORT` |
| VPS Metrics | Prometheus + node_exporter | `PROMETHEUS_URL`, `VPS_*_INSTANCE` |
| Database Metrics | Prometheus + postgres_exporter | `PROMETHEUS_URL` |
| Site Health | Coolify DB | `COOLIFY_DB_URL` |
| AutoHEAL | Redis + Coolify API | All Coolify + Redis vars |

## Production Deployment

### Using Docker

```bash
# Build the image
docker build -t infra-dashboard .

# Run with environment file
docker run -d \
  --name infra-dashboard \
  -p 3000:3000 \
  --env-file .env.local \
  infra-dashboard
```

### Using Coolify

1. Create a new application in Coolify
2. Select "Docker" as the build pack
3. Point to your Git repository (or this public repo)
4. Add environment variables in Coolify's UI
5. **Important**: If connecting to Coolify's database, ensure the container is on the `coolify` Docker network

### Securing the Dashboard

Always set a password in production:

```bash
DASHBOARD_PASSWORD=your-secure-password-here
```

Users must authenticate before accessing any data. Sessions are stored in httpOnly cookies for 7 days.

## Next Steps

- [Configuration Reference](./configuration.md) - All environment variables explained
- [Coolify Setup](./coolify-setup.md) - Detailed Coolify integration guide
- [Prometheus Setup](./prometheus-setup.md) - Setting up metrics collection
- [BullMQ Setup](./bullmq-setup.md) - Queue monitoring configuration
- [AutoHEAL Setup](./autoheal.md) - Automatic recovery system
