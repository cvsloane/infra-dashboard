# Coolify Setup Guide

Learn how to connect infra-dashboard to your Coolify instance for complete deployment visibility and control. This guide covers both API and database integrations, explains what each enables, and helps you troubleshoot common issues.

## Table of Contents

- [Overview](#overview) — What you need and why
- [API Setup](#api-setup) — Required minimum configuration
- [Database Setup](#database-setup) — Unlock real-time features
- [Deployment Tracking](#deployment-tracking) — How updates flow to your browser
- [Troubleshooting](#troubleshooting) — Common problems and solutions

---

## Overview

infra-dashboard connects to Coolify at two integration levels:

| Integration | What It Provides | Required? | Effort |
|-------------|------------------|-----------|--------|
| **API** | Application lists, deployment triggers, basic deployment status | ✅ Yes | 5 minutes |
| **Database** | Real-time deployment tracking, site health checks, complete history | ❌ No (but recommended) | 10 minutes |

**Our recommendation:** Start with the API integration to get immediate value. Add database access when you want real-time updates without polling delays and automatic site health monitoring.

### Feature Comparison

| Feature | API Only | With Database |
|---------|----------|---------------|
| Application list | ✅ Yes | ✅ Yes |
| Trigger deployments | ✅ Yes | ✅ Yes |
| Cancel deployments | ✅ Yes | ✅ Yes |
| View deployment logs | ✅ Yes (with delay) | ✅ Yes (instant) |
| Real-time updates | ❌ 15-30s polling | ✅ Instant push |
| Site health checks | ❌ Not available | ✅ Automatic |
| Deployment history | ⚠️ Limited | ✅ Complete |

---

## API Setup

### Step 1: Generate an API Token

Your API token is the key that lets infra-dashboard communicate with Coolify.

**Generate your token:**

1. Log into your Coolify dashboard
2. Navigate to **Settings** → **API Tokens**
3. Click **Create New Token**
4. Enter a descriptive name (e.g., "infra-dashboard")
5. **⚠️ Copy the token immediately** — it won't be shown again

> **Security tip:** Treat API tokens like passwords. Store them in your password manager and rotate them quarterly or when team members leave.

---

### Step 2: Find Your Coolify URL

Determine the correct URL based on your network setup:

| Scenario | URL Format | Example |
|----------|------------|---------|
| Same local network | Coolify server's internal IP | `http://192.168.1.100:8000/api/v1` |
| VPN (Tailscale, WireGuard) | VPN-assigned IP | `http://100.x.x.x:8000/api/v1` |
| Public access | Domain with SSL | `https://coolify.yourdomain.com/api/v1` |
| Dashboard in Coolify | Container network | `http://coolify:8000/api/v1` |

**Test connectivity:**
```bash
curl http://your-coolify-server:8000/api/v1/servers \
  -H "Authorization: Bearer 1|your-token"
```

You should receive a JSON response listing your servers.

---

### Step 3: Configure the Dashboard

Add these variables to your `.env.local`:

```bash
# Coolify API
COOLIFY_API_URL=http://your-coolify-server:8000/api/v1
COOLIFY_API_TOKEN=1|your-api-token-here
```

**Verify the setup:**
1. Start the dashboard: `npm run dev`
2. Visit http://localhost:3000
3. You should see your Coolify applications listed

---

### What API Integration Provides

Once connected, you can:

| Capability | How to Access |
|------------|---------------|
| View applications | Applications tab in the dashboard |
| See deployment status | Deployment indicators on each app card |
| Trigger deployments | "Deploy" button on application cards |
| Cancel in-progress builds | "Cancel" button during deployments |
| View build logs | Click any deployment to see logs |

---

## Database Setup (Optional but Recommended)

Direct database access unlocks the dashboard's most powerful features. While optional, we strongly recommend it for production environments where real-time visibility matters.

### Why Add Database Access?

The difference is noticeable:

| Capability | API Only | With Database | Impact |
|------------|----------|---------------|--------|
| Deployment status | 15-30s delay | Instant | Know immediately when deployments finish |
| Site health checks | ❌ Not available | ✅ Automatic HTTP/SSL | Catch outages before users report them |
| Deployment history | Last 10-20 | Complete archive | Full audit trail and debugging |
| Query performance | API rate limited | Direct, fast | Snappier dashboard experience |

---

### Step 1: Get Database Credentials

Coolify stores everything in PostgreSQL. Here's how to extract the credentials:

**On your Coolify server:**
```bash
# SSH into your Coolify server
ssh your-coolify-server

# View the database configuration
cat /data/coolify/.env | grep POSTGRES
```

**You'll see:**
```bash
POSTGRES_USER=coolify
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=coolify
```

**Test the connection:**
```bash
psql postgresql://coolify:your-password@localhost:5432/coolify \
  -c "SELECT COUNT(*) FROM applications;"
```

---

### Step 2: Configure Database Access

Add the connection string to your `.env.local`:

```bash
# External access (dashboard outside Coolify network)
COOLIFY_DB_URL=postgresql://coolify:password@192.168.1.100:5432/coolify

# Internal access (dashboard inside Coolify network)
COOLIFY_DB_URL=postgresql://coolify:password@coolify-db:5432/coolify
```

---

### Running Inside Coolify? Read This

When infra-dashboard runs as a Coolify-managed application, use the Docker container name:

```bash
COOLIFY_DB_URL=postgresql://coolify:password@coolify-db:5432/coolify
```

**Why `coolify-db`?** Docker's internal DNS resolves container names to IPs within the same network. The `coolify-db` hostname only works when your container is attached to the `coolify` network.

**Verify network connectivity:**

```bash
# From your Coolify host, check the network
docker network inspect coolify

# Look for your infra-dashboard container in the "Containers" section
```

**If your container isn't on the network,** add this to your Coolify service configuration:

```yaml
networks:
  - coolify
```

Then redeploy.

---

### What Database Integration Provides

| Feature | Description | Where to See It |
|---------|-------------|-----------------|
| **Real-time updates** | Deployment status changes pushed instantly via SSE | Deployment progress bars update live |
| **Site health monitoring** | HTTP and SSL checks run automatically | Servers tab shows site status |
| **Complete history** | Every deployment ever run, with full logs | Deployment history pages |
| **Faster queries** | Direct database access bypasses API limits | Snappier page loads |

---

## Deployment Tracking

Understanding how deployment updates reach your browser helps you interpret what you see—and diagnose issues when updates don't arrive.

### Data Flow Architecture

```
┌─────────┐      SSE       ┌──────────────┐     Poll 15s     ┌──────────┐
│ Browser │◄──────────────►│ Dashboard    │◄───────────────►│ Coolify  │
│         │                │ Server       │                 │ Database │
└─────────┘                └──────────────┘                 └──────────┘
                                  │
                                  └─────── Push on change ───────┘
```

### How Updates Work

1. **Initial load** — Dashboard fetches current state from Coolify API
2. **Background polling** — Server queries database every 15 seconds
3. **Change detection** — When status changes, server pushes to all connected browsers
4. **Automatic reconnect** — Browser reconnects automatically if connection drops (3-second delay)

**Why 15 seconds?** This balances freshness with database load. Direct database queries are efficient, but polling too aggressively wastes resources.

---

### Deployment States Reference

| Status | Description | Visual Indicator | What It Means |
|--------|-------------|------------------|---------------|
| `queued` | Waiting in queue | ⏳ Yellow | Build will start when a worker is available |
| `in_progress` | Actively building/deploying | 🔄 Blue spinning | Code is being built and deployed now |
| `finished` | Successfully completed | ✅ Green | Your changes are live |
| `failed` | Build or deployment failed | ❌ Red | Check logs for error details |
| `cancelled` | Manually stopped | ⛔ Gray | You or another user cancelled this deployment |

---

### Understanding Update Latency

| Scenario | Expected Latency | Why |
|----------|------------------|-----|
| API-only setup | 15-30 seconds | Dashboard polls API, which caches data |
| With database | 0-15 seconds | Direct queries, instant SSE push on change |
| Page refresh | Instant | Full reload fetches latest state directly |

---

## Troubleshooting

### "Failed to connect to Coolify API"

**Symptoms:**
- Applications don't load
- API error messages in logs
- Empty application list

**Diagnostic steps:**

1. **Verify the URL format:**
   ```bash
   curl http://your-coolify-server:8000/api/v1/servers \
     -H "Authorization: Bearer 1|your-token"
   ```
   Should return JSON with server list. If you get 401, your token is wrong. If connection refused, check URL.

2. **Check port accessibility:**
   ```bash
   telnet your-coolify-server 8000
   ```
   If this hangs or fails, you have a network connectivity issue.

3. **Verify token validity:**
   - Tokens can expire or be revoked
   - Generate a new token in Coolify UI if unsure
   - Ensure you're copying the full token including the `1|` prefix

---

### "Database connection failed"

**Symptoms:**
- Applications load but deployment data is missing
- Database error messages in logs
- Site health shows as unavailable

**Diagnostic steps:**

1. **Test from your local machine:**
   ```bash
   psql postgresql://coolify:password@host:5432/coolify \
     -c "SELECT COUNT(*) FROM applications;"
   ```
   If this fails, check credentials and network.

2. **Check network connectivity:**
   ```bash
   telnet your-db-host 5432
   ```

3. **Verify credentials on Coolify server:**
   ```bash
   ssh your-coolify-server
   cat /data/coolify/.env | grep POSTGRES
   ```

4. **Confirm database is running:**
   ```bash
   docker ps | grep coolify-db
   ```

5. **Check PostgreSQL logs:**
   ```bash
   docker logs coolify-db 2>&1 | tail -50
   ```

---

### "Applications showing but no deployments"

**Symptoms:**
- App list displays correctly
- Deployment history is empty or incomplete

**Common causes:**

1. **`COOLIFY_DB_URL` not configured** — Deployment history requires database access
2. **Wrong credentials** — Database connects but authentication fails
3. **No deployments exist** — Check Coolify UI to verify deployments were triggered
4. **Permission denied** — Database user can't read `deployments` table

**Quick check:**
```bash
psql $COOLIFY_DB_URL -c "SELECT COUNT(*) FROM deployments;"
```
If this returns 0, either there are no deployments or the connection isn't working.

---

### "Can't connect to coolify-db from container"

**Symptoms:**
- Database connection works from host but fails inside container
- Error mentions hostname resolution or connection refused

**Diagnostic steps:**

1. **Check container network attachment:**
   ```bash
   docker inspect your-container | jq '.[0].NetworkSettings.Networks'
   ```
   Look for the `coolify` network in the output.

2. **Verify network membership:**
   ```bash
   docker network inspect coolify | grep your-container-name
   ```

3. **Test from inside the container:**
   ```bash
   docker exec -it your-container sh
   # Inside container:
   nc -zv coolify-db 5432
   ```

4. **Fix: Add to Coolify service configuration:**
   ```yaml
   networks:
     - coolify
   ```
   Then redeploy the service.

5. **Use the correct hostname:**
   - ❌ Wrong: `192.168.1.100` (may work from host but not container)
   - ✅ Right: `coolify-db` (works when on same Docker network)

---

### "Real-time updates not working"

**Symptoms:**
- Deployments show status but don't update live
- Need to refresh page to see changes

**Diagnostic steps:**

1. **Check browser console for SSE errors** — Look for EventSource connection failures
2. **Verify database is configured** — Real-time updates require `COOLIFY_DB_URL`
3. **Check for proxy/firewall blocking SSE** — Some proxies buffer SSE incorrectly
4. **Test SSE endpoint directly:**
   ```bash
   curl -H "Accept: text/event-stream" http://localhost:3000/api/sse/updates
   ```

---

### Still Stuck?

If these steps don't resolve your issue:

1. **Review the [Configuration Reference](./configuration.md)** — Double-check variable formats
2. **Check [Getting Started](./getting-started.md)** — Ensure you followed all setup steps
3. **Open a GitHub issue** — Include:
   - Error messages (redact tokens and passwords)
   - Your configuration (with sensitive values removed)
   - Steps you've already tried
   - Output from diagnostic commands above
