# Coolify Setup Guide

This guide explains how to configure infra-dashboard to work with Coolify.

## Overview

infra-dashboard integrates with Coolify in two ways:

1. **API Integration** - List applications, trigger deployments, view deployment status
2. **Database Integration** - Real-time deployment tracking, site health checks

## API Setup

### Step 1: Generate an API Token

1. Log into your Coolify dashboard
2. Navigate to **Settings** → **API Tokens**
3. Click **Create New Token**
4. Name it something descriptive (e.g., "infra-dashboard")
5. Copy the generated token

### Step 2: Configure the Dashboard

Add to your `.env.local`:

```bash
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
COOLIFY_API_TOKEN=1|your-api-token-here
```

**Finding your Coolify server address:**
- If on the same network: Use the server's internal IP (e.g., `192.168.1.100`)
- If using Tailscale: Use the Tailscale IP (e.g., `100.x.x.x`)
- If public: Use the domain (e.g., `https://coolify.yourdomain.com`)

### What You Get

With API integration, you can:
- View all Coolify applications and their status
- See recent deployments across all apps
- Trigger new deployments
- Cancel in-progress deployments
- View deployment logs

## Database Setup (Optional but Recommended)

Direct database access enables real-time deployment tracking and site health monitoring.

### Step 1: Get Database Credentials

Coolify stores its data in PostgreSQL. Find your credentials:

1. SSH into your Coolify server
2. Check the Coolify configuration:
   ```bash
   cat /data/coolify/.env | grep POSTGRES
   ```
3. Note the username, password, and database name

### Step 2: Configure Database Access

Add to your `.env.local`:

```bash
COOLIFY_DB_URL=postgresql://coolify:password@your-server:5432/coolify
```

### Running Inside Coolify

If you deploy infra-dashboard via Coolify itself, use the Docker container name:

```bash
COOLIFY_DB_URL=postgresql://coolify:password@coolify-db:5432/coolify
```

**Important:** The infra-dashboard container must be on the `coolify` Docker network to reach `coolify-db`.

To verify network connectivity:
```bash
docker network inspect coolify
```

### What You Get

With database integration, you get:
- **Real-time deployment updates** - Instant status changes without API polling
- **Site health monitoring** - Automatic HTTP/SSL checks for all deployed sites
- **Faster performance** - Direct queries are faster than API calls

## Deployment Tracking

The dashboard tracks deployments in real-time using Server-Sent Events (SSE):

1. Initial state loaded from Coolify API
2. Database polling every 15 seconds for changes
3. Instant updates pushed to connected browsers

### Deployment States

| Status | Description |
|--------|-------------|
| `queued` | Deployment waiting to start |
| `in_progress` | Build/deployment running |
| `finished` | Completed successfully |
| `failed` | Build or deployment failed |
| `cancelled` | Manually cancelled |

## Troubleshooting

### "Failed to connect to Coolify API"

- Verify `COOLIFY_API_URL` is correct
- Check that port 8000 is accessible
- Verify your API token is valid

### "Database connection failed"

- Verify PostgreSQL credentials
- Check network connectivity to database
- Ensure the database is running: `docker ps | grep coolify-db`

### "Applications showing but no deployments"

- Check if you have `COOLIFY_DB_URL` configured
- Verify database credentials are correct
- Check deployment history in Coolify UI to confirm deployments exist

### "Can't connect to coolify-db from container"

If running inside Coolify:
1. Check container network: `docker inspect your-container | grep Networks`
2. Ensure it's on the `coolify` network
3. Redeploy with network configuration if needed
