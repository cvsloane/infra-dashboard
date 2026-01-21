# Prometheus Setup Guide

This guide explains how to set up Prometheus metrics collection for VPS and database monitoring.

## Overview

infra-dashboard queries Prometheus to display:
- **VPS Metrics** - CPU, memory, disk, load average
- **PostgreSQL Metrics** - Connections, database sizes
- **PgBouncer Metrics** - Connection pool status

## Architecture

```
infra-dashboard
      │
      ▼
  Prometheus  ◄── Scrapes metrics from:
      │
      ├── node_exporter (VPS system metrics)
      ├── postgres_exporter (PostgreSQL metrics)
      └── pgbouncer_exporter (Connection pool metrics)
```

## Step 1: Install Prometheus

### Docker Compose

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'

volumes:
  prometheus_data:
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # VPS metrics
  - job_name: 'node'
    static_configs:
      - targets:
        - 'primary-server:9100'   # Your app server
        - 'database-server:9100'  # Your database server

  # PostgreSQL metrics
  - job_name: 'postgres'
    static_configs:
      - targets: ['database-server:9187']

  # PgBouncer metrics
  - job_name: 'pgbouncer'
    static_configs:
      - targets: ['database-server:9127']
```

## Step 2: Install Exporters

### node_exporter (VPS Metrics)

Install on each server you want to monitor:

```bash
# Download
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-1.7.0.linux-amd64.tar.gz
sudo mv node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/

# Create systemd service
sudo cat > /etc/systemd/system/node_exporter.service << 'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
```

Verify it's running: `curl http://localhost:9100/metrics`

### postgres_exporter (PostgreSQL Metrics)

```bash
# Using Docker
docker run -d \
  --name postgres_exporter \
  -p 9187:9187 \
  -e DATA_SOURCE_NAME="postgresql://user:pass@localhost:5432/postgres?sslmode=disable" \
  prometheuscommunity/postgres-exporter
```

Or with Docker Compose:
```yaml
postgres_exporter:
  image: prometheuscommunity/postgres-exporter
  environment:
    DATA_SOURCE_NAME: "postgresql://user:pass@postgres:5432/postgres?sslmode=disable"
  ports:
    - "9187:9187"
```

### pgbouncer_exporter (PgBouncer Metrics)

```bash
# Using Docker
docker run -d \
  --name pgbouncer_exporter \
  -p 9127:9127 \
  prometheuscommunity/pgbouncer-exporter \
  --pgBouncer.connectionString="postgres://pgbouncer:pass@localhost:6432/pgbouncer?sslmode=disable"
```

## Step 3: Configure infra-dashboard

Add to your `.env.local`:

```bash
# Prometheus server
PROMETHEUS_URL=http://your-prometheus-server:9090

# VPS instances (must match targets in prometheus.yml)
VPS_PRIMARY_INSTANCE=primary-server:9100
VPS_DATABASE_INSTANCE=database-server:9100
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
