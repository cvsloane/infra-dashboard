# AutoHEAL Setup Guide

AutoHEAL automatically restarts and redeploys applications that become unresponsive.

## Overview

AutoHEAL is a background script that:
1. Monitors configured sites via HTTP health checks
2. After consecutive failures, triggers a **restart** via Coolify API
3. If still unhealthy after restart, triggers a **redeploy**
4. Respects cooldown periods to prevent restart loops

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AutoHEAL      │────▶│     Redis       │◀────│ infra-dashboard │
│   (cron/timer)  │     │ (config store)  │     │   (config UI)   │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Coolify API   │
│ (restart/deploy)│
└─────────────────┘
```

## Components

1. **infra-dashboard** - Web UI to configure AutoHEAL settings
2. **Redis** - Stores configuration and failure counters
3. **autoheal script** - Bash script run via cron/systemd timer

## Installation

### Step 1: Deploy the Script

Copy the autoheal files to your Coolify server:

```bash
# On your Coolify server
mkdir -p /opt/autoheal
cd /opt/autoheal

# Copy from the ops/autoheal directory:
# - infra-autoheal.sh
# - infra-autoheal.env.example
# - infra-autoheal.service
# - infra-autoheal.timer
```

### Step 2: Configure Environment

```bash
cp infra-autoheal.env.example infra-autoheal.env
nano infra-autoheal.env
```

Required settings:
```bash
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your-coolify-api-token

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password  # if using auth
```

### Step 3: Install as Systemd Timer

```bash
# Copy service files
sudo cp infra-autoheal.service /etc/systemd/system/
sudo cp infra-autoheal.timer /etc/systemd/system/

# Edit service to point to your env file
sudo nano /etc/systemd/system/infra-autoheal.service
# Update: EnvironmentFile=/opt/autoheal/infra-autoheal.env

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable infra-autoheal.timer
sudo systemctl start infra-autoheal.timer

# Check status
sudo systemctl status infra-autoheal.timer
```

### Alternative: Cron Job

```bash
# Run every minute
* * * * * /opt/autoheal/infra-autoheal.sh >> /var/log/autoheal.log 2>&1
```

## Configuration via Dashboard

Once installed, configure AutoHEAL from the infra-dashboard UI:

### Global Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Enabled | true | Master on/off switch |
| Failure Threshold | 2 | Consecutive failures before action |
| Failure Window | 120s | Time window for counting failures |
| Cooldown | 600s | Minimum time between remediation attempts |
| Skip When Deploying | true | Don't heal apps that are actively deploying |
| Redeploy After Restart | true | Try redeploy if restart doesn't fix it |
| Redeploy Delay | 90s | Wait time between restart and redeploy |

### Per-Site Configuration

Enable AutoHEAL for specific applications by their Coolify UUID:

1. Go to the **Servers** page in infra-dashboard
2. Open **AutoHEAL Settings**
3. Toggle on the applications you want to monitor
4. Save configuration

## How It Works

### Health Check Flow

```
1. Script runs (every minute via timer/cron)
2. For each enabled site:
   a. Make HTTP HEAD request to site FQDN
   b. If 2xx/3xx response → Clear failure counter, done
   c. If 4xx response → Log "degraded", no action
   d. If 5xx/timeout/error → Increment failure counter

3. If failures >= threshold:
   a. Check cooldown (skip if recently healed)
   b. Trigger restart via Coolify API
   c. If redeployAfterRestart enabled:
      - Wait redeployDelaySec
      - If still failing, trigger redeploy
   d. Set cooldown timer
```

### Redis Keys Used

| Key | Purpose |
|-----|---------|
| `infra:autoheal:config` | JSON configuration from dashboard |
| `infra:autoheal:fail:{uuid}` | Failure counter (with TTL) |
| `infra:autoheal:phase:{uuid}` | Current healing phase |
| `infra:autoheal:cooldown:{uuid}` | Cooldown marker (with TTL) |

## Monitoring

### Check Logs

```bash
# If using systemd
journalctl -u infra-autoheal -f

# If using cron
tail -f /var/log/autoheal.log
```

### Example Log Output

```
[2024-01-15T10:30:00+00:00] Skipping my-app: deployment in progress.
[2024-01-15T10:31:00+00:00] Restart triggered for broken-app.
[2024-01-15T10:33:00+00:00] Redeploy triggered for broken-app.
[2024-01-15T10:35:00+00:00] Cooldown active for broken-app.
```

## Troubleshooting

### "AutoHEAL not running"

```bash
# Check timer status
sudo systemctl status infra-autoheal.timer

# Check last run
sudo systemctl status infra-autoheal.service

# Check for errors
journalctl -u infra-autoheal -n 50
```

### "Config not loading"

1. Verify Redis connectivity from script server
2. Check that dashboard saved config: `redis-cli GET infra:autoheal:config`
3. Ensure `AUTOHEAL_CONFIG_KEY` matches in both places

### "Restart not working"

1. Verify Coolify API token has restart permissions
2. Test manually: `curl -X POST -H "Authorization: Bearer TOKEN" http://coolify:8000/api/v1/applications/{uuid}/restart`
3. Check Coolify logs for errors

### "Too many restarts"

Increase the cooldown period or failure threshold in settings:
- Higher `failureThreshold` = more failures needed before action
- Higher `cooldownSec` = longer wait between remediation attempts

## Security Considerations

- The autoheal script needs your Coolify API token
- Store the env file with restricted permissions: `chmod 600 infra-autoheal.env`
- Consider running as a dedicated user with minimal permissions
