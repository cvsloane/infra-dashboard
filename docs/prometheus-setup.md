# Prometheus Setup Guide

Learn how to collect and visualize system metrics from your VPS and databases using Prometheus. This guide covers installation, configuration, and troubleshooting for the complete metrics pipeline.

## Overview

Prometheus is a time-series database that collects metrics from your infrastructure. The dashboard queries Prometheus to display:

| Metric Type | What You See | Source |
|-------------|--------------|--------|
| **VPS Metrics** | CPU, memory, disk, load average | node_exporter |
| **PostgreSQL Metrics** | Connections, database sizes, query stats | postgres_exporter |
| **PgBouncer Metrics** | Connection pool utilization | pgbouncer_exporter |
| **PostgreSQL Backups** | Logical/WAL/base backup freshness + restore drill recency | postgres_exporter (custom queries) |

**Why Prometheus?** It's the industry standard for metrics collection, with excellent exporter ecosystem and powerful query language (PromQL).

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           infra-dashboard               │
                    │                                         │
                    │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
                    │  │ VPS      │  │ PostgreSQL│  │PgBouncer│ │
                    │  │ Panel    │  │ Panel     │  │ Panel   │ │
                    │  └────┬─────┘  └────┬─────┘  └────┬───┘ │
                    │       │             │             │      │
                    │       └─────────────┴─────────────┘      │
                    │                    │                      │
                    │                    ▼                      │
                    │           ┌──────────────┐                │
                    │           │   PromQL     │                │
                    │           │   Queries    │                │
                    │           └──────┬───────┘                │
                    └──────────────────┼────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   Prometheus    │
                              │   Server        │
                              │   (Port 9090)   │
                              └────────┬────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
        ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
        │ node_exporter│      │postgres_exporter│   │pgbouncer_    │
        │ (Port 9100)  │      │ (Port 9187)  │      │ exporter     │
        │              │      │              │      │ (Port 9127)  │
        │  VPS/Server  │      │  PostgreSQL  │      │  PgBouncer   │
        └──────────────┘      └──────────────┘      └──────────────┘
```

**Data flow:** Exporters expose metrics → Prometheus scrapes and stores → Dashboard queries and displays

## Step 1: Install Prometheus

### Option A: Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
      - '--storage.tsdb.retention.time=30d'
    restart: unless-stopped
    networks:
      - monitoring

volumes:
  prometheus_data:

networks:
  monitoring:
    driver: bridge
```

**Start Prometheus:**
```bash
docker compose up -d
```

**Verify it's running:**
```bash
curl http://localhost:9090/-/healthy
# Should return: Prometheus Server is Healthy.
```

### Create Prometheus Configuration

Create `prometheus.yml` in the same directory:

```yaml
# prometheus.yml
global:
  scrape_interval: 15s      # How often to scrape targets
  evaluation_interval: 15s  # How often to evaluate rules
  external_labels:
    monitor: 'infra-dashboard'

scrape_configs:
  # ═══════════════════════════════════════════════════
  # VPS System Metrics (node_exporter)
  # ═══════════════════════════════════════════════════
  - job_name: 'node'
    static_configs:
      - targets:
        - '192.168.1.100:9100'   # Your app server
        - '192.168.1.101:9100'   # Your database server (if separate)
        labels:
          group: 'vps'

  # ═══════════════════════════════════════════════════
  # PostgreSQL Metrics
  # ═══════════════════════════════════════════════════
  - job_name: 'postgres'
    static_configs:
      - targets: ['192.168.1.101:9187']
        labels:
          instance: 'database-server'

  # ═══════════════════════════════════════════════════
  # PgBouncer Connection Pool Metrics
  # ═══════════════════════════════════════════════════
  - job_name: 'pgbouncer'
    static_configs:
      - targets: ['192.168.1.101:9127']
        labels:
          instance: 'database-server'
```

> **Important:** Replace IP addresses with your actual server addresses. The targets must match what you configure in `VPS_PRIMARY_INSTANCE` and `VPS_DATABASE_INSTANCE`.

## Step 2: Install Exporters

Exporters run on your servers and expose metrics in a format Prometheus can scrape.

### node_exporter (VPS System Metrics)

Install on every server you want to monitor—both application and database servers.

**Quick install script:**

```bash
#!/bin/bash
# install-node-exporter.sh

VERSION="1.7.0"
ARCH="linux-amd64"

# Download and extract
wget https://github.com/prometheus/node_exporter/releases/download/v${VERSION}/node_exporter-${VERSION}.${ARCH}.tar.gz
tar xvfz node_exporter-${VERSION}.${ARCH}.tar.gz

# Install binary
sudo mv node_exporter-${VERSION}.${ARCH}/node_exporter /usr/local/bin/
rm -rf node_exporter-${VERSION}.${ARCH}*

# Create systemd service
sudo tee /etc/systemd/system/node_exporter.service > /dev/null << 'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
User=node_exporter
Group=node_exporter
ExecStart=/usr/local/bin/node_exporter \
  --collector.filesystem.mount-points-exclude='^/(sys|proc|dev|run|var/lib/docker)($|/)'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Create user (optional but recommended)
sudo useradd -rs /bin/false node_exporter 2>/dev/null || true

# Start service
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter

# Verify
sudo systemctl status node_exporter
```

**Test it's working:**
```bash
curl -s http://localhost:9100/metrics | head -20
```

You should see metrics like `node_cpu_seconds_total`, `node_memory_MemTotal_bytes`, etc.

### postgres_exporter (PostgreSQL Metrics)

Collects database performance metrics: connections, query statistics, database sizes, and more.

**Option A: Docker (Easiest)**

```bash
docker run -d \
  --name postgres_exporter \
  --network host \
  -p 9187:9187 \
  -e DATA_SOURCE_NAME="postgresql://user:password@localhost:5432/postgres?sslmode=disable" \
  prometheuscommunity/postgres-exporter
```

**Option B: Docker Compose**

```yaml
  postgres_exporter:
    image: prometheuscommunity/postgres-exporter
    container_name: postgres_exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://user:password@postgres:5432/postgres?sslmode=disable"
    ports:
      - "9187:9187"
    restart: unless-stopped
    networks:
      - monitoring
```

**Required database user:**

```sql
-- Connect to PostgreSQL as superuser
CREATE USER prometheus WITH PASSWORD 'your-password';
GRANT pg_monitor TO prometheus;
```

**Verify it's working:**
```bash
curl -s http://localhost:9187/metrics | grep pg_stat_activity_count
```

### pgbouncer_exporter (PgBouncer Metrics)

Monitors connection pool utilization—critical for understanding database connection bottlenecks.

**Docker:**

```bash
docker run -d \
  --name pgbouncer_exporter \
  --network host \
  -p 9127:9127 \
  prometheuscommunity/pgbouncer-exporter \
  --pgBouncer.connectionString="postgres://pgbouncer:password@localhost:6432/pgbouncer?sslmode=disable"
```

**Docker Compose:**

```yaml
  pgbouncer_exporter:
    image: prometheuscommunity/pgbouncer-exporter
    container_name: pgbouncer_exporter
    command:
      - '--pgBouncer.connectionString=postgres://pgbouncer:password@pgbouncer:6432/pgbouncer?sslmode=disable'
    ports:
      - "9127:9127"
    restart: unless-stopped
    networks:
      - monitoring
```

**Verify it's working:**
```bash
curl -s http://localhost:9127/metrics | grep pgbouncer_pools_client_active_connections
```

## Step 3: Configure infra-dashboard

Add these variables to your `.env.local`:

```bash
# ═══════════════════════════════════════════════════
# PROMETHEUS
# ═══════════════════════════════════════════════════
PROMETHEUS_URL=http://192.168.1.100:9090

# VPS instances (must match targets in prometheus.yml exactly)
VPS_PRIMARY_INSTANCE=192.168.1.100:9100
VPS_DATABASE_INSTANCE=192.168.1.101:9100
```

**Critical:** The `VPS_*_INSTANCE` values must **exactly match** the targets in your `prometheus.yml`. If your prometheus.yml has `192.168.1.100:9100`, use that—not a hostname or different IP.

**Verify the connection:**
```bash
# Test Prometheus is reachable
curl "http://192.168.1.100:9090/api/v1/query?query=up"

# Test specific instance query
curl "http://192.168.1.100:9090/api/v1/query?query=node_cpu_seconds_total"
```

## Metrics Displayed

### VPS Health Panel

| Metric | Source | Query |
|--------|--------|-------|
| CPU Usage | node_exporter | `100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100` |
| Memory | node_exporter | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` |
| Disk | node_exporter | `node_filesystem_avail_bytes{mountpoint="/"}` |
| Load Average | node_exporter | `node_load1`, `node_load5`, `node_load15` |
| Uptime | node_exporter | `node_boot_time_seconds` |

### PostgreSQL Panel

| Metric | Source | Query |
|--------|--------|-------|
| Connection Count | postgres_exporter | `pg_stat_activity_count` |
| Database Size | postgres_exporter | `pg_database_size_bytes` |
| Max Connections | postgres_exporter | `pg_settings_max_connections` |

### PostgreSQL Backup Freshness (Optional)

The dashboard can surface backup freshness and restore drill recency if your `postgres_exporter` exposes these metrics (typically via a custom `queries.yaml` plus a script that records last-success timestamps somewhere Postgres can read).

| Signal | Query | Notes |
|--------|-------|-------|
| WAL archive freshness | `pg_stat_archiver_seconds_since_last_wal` | Seconds since last archived WAL segment |
| Logical dump freshness | `pg_backup_status_logical_backup_age_seconds` | Seconds since last successful `pg_dumpall` |
| Restore drill freshness | `pg_backup_status_restore_drill_age_seconds` | Seconds since last successful restore drill |
| WAL-G base backup age | `pg_backup_status_walg_basebackup_age_seconds` | Seconds since latest base backup (from `wal-g backup-list`) |
| Base backup check age | `pg_backup_status_walg_basebackup_last_checked_age_seconds` | Seconds since the base backup monitor last ran |

### PgBouncer Panel

| Metric | Source | Query |
|--------|--------|-------|
| Active Connections | pgbouncer_exporter | `pgbouncer_pools_client_active_connections` |
| Waiting Connections | pgbouncer_exporter | `pgbouncer_pools_client_waiting_connections` |
| Server Idle | pgbouncer_exporter | `pgbouncer_pools_server_idle_connections` |

## Troubleshooting

### "No VPS data showing"

1. Verify Prometheus is reachable: `curl http://prometheus:9090/api/v1/query?query=up`
2. Check node_exporter is in targets: Prometheus UI → Status → Targets
3. Verify `VPS_PRIMARY_INSTANCE` matches exactly what Prometheus uses

### "PostgreSQL metrics missing"

1. Check postgres_exporter is running and scraped by Prometheus
2. Verify database connection string in postgres_exporter
3. Query Prometheus directly: `pg_up` should return 1

### "Prometheus connection timeout"

- Ensure network connectivity between dashboard and Prometheus
- Check firewall rules allow port 9090
- Verify Prometheus URL doesn't have trailing slash
