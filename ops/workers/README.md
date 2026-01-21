# Worker Supervisor

Collects worker health across systemd, PM2, and Docker (Coolify) and writes a summary into Redis for the dashboard.
Optionally restarts downed workers.

## Install (app server)

```bash
sudo mkdir -p /opt/system-automation/scripts
sudo cp ops/workers/worker-supervisor.sh /opt/system-automation/scripts/worker-supervisor.sh
sudo chmod +x /opt/system-automation/scripts/worker-supervisor.sh

sudo cp ops/workers/worker-supervisor.service /etc/systemd/system/worker-supervisor.service
sudo cp ops/workers/worker-supervisor.timer /etc/systemd/system/worker-supervisor.timer

sudo cp ops/workers/worker-supervisor.env.example /etc/worker-supervisor.env
sudo vi /etc/worker-supervisor.env

sudo systemctl daemon-reload
sudo systemctl enable --now worker-supervisor.timer
```

## Notes

- Set `WORKER_SUPERVISOR_RESTART=true` to auto-restart downed workers.
- By default, only units/containers/PM2 processes with “worker” in the name are tracked.
- Change regexes via `WORKER_SYSTEMD_REGEX`, `WORKER_PM2_REGEX`, `WORKER_DOCKER_REGEX`.
- Exclude specific systemd services with `WORKER_SYSTEMD_EXCLUDE_REGEX` (defaults to `worker-supervisor`).
- Output key: `infra:workers:status` (override via `WORKER_SUPERVISOR_STATUS_KEY`).
