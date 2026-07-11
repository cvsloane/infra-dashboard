# Infrastructure backup policy

Backups protect irreplaceable data and rebuild configuration. They are not host images: application source belongs in GitHub, and Docker images, registries, build environments, caches, generated media, and raw database volumes are not primary backup artifacts.

## db-vps

The primary PostgreSQL recovery path is the existing application-consistent pipeline:

- nightly logical snapshots (globals plus per-database dumps) copied to Cloudflare R2;
- continuous WAL archiving and WAL-G recovery assets;
- scheduled logical restore checks and restore drills;
- encrypted Restic coverage as a secondary host/config recovery layer.

Rocket.Chat MongoDB has its own logical archive pipeline and retention policy.

## apps-vps

`apps-vps-data-backup.sh` creates logical dumps for:

- Coolify PostgreSQL;
- FreeScout MariaDB;
- the retained `hg-wp` MySQL cluster;
- the active WordPress MySQL cluster;
- Langfuse PostgreSQL metadata;
- Postiz Temporal PostgreSQL.

It also captures `/etc`, Coolify control-plane/proxy/SSH configuration, per-app env/Compose files, selected `/opt` service configuration, and the small WordPress files volume. The root-only staging set is checksummed before Restic encrypts it into two independent repositories:

- `heavisidelinux` for a fast off-host copy;
- private Amazon S3 bucket `heaviside-infrastructure-backups-609812247225-us-east-1`, prefix `apps-vps/`, for the geographically separate copy.

Amazon access uses the bucket-scoped `apps-vps-restic` IAM user. Its access key, region, bucket name, and independent Restic password live in Bitwarden under `Infrastructure/APPS_VPS_RESTIC_*`; the root-only runtime files are `/etc/restic/apps-amazon.env` and `/etc/restic/apps-amazon.password`.

The following are intentionally excluded:

- Nextcloud data and database (operator decision, 2026-07-10);
- ai-videogen uploads/renders;
- Coolify's image registry and application source trees;
- virtual environments, dependencies, build caches, and runner workspaces;
- Redis queues/caches;
- Langfuse ClickHouse/MinIO telemetry;
- Postiz Elasticsearch;
- raw Docker database volumes.

The daily systemd service remains `apps-vps-restic-backup.service`; `apps-vps-restic-backup.timer` runs it at 03:00 `Europe/Berlin` time with up to ten minutes of jitter. Each destination runs in an isolated environment and Amazon is still attempted if `heavisidelinux` fails. Amazon backup and restore operations share a bounded repository lock. Success/freshness metrics are exported to node_exporter and monitored by Prometheus and the dashboard. The apps job warns after 36 hours and becomes critical after 48 hours; the separate weekly `db-vps` Restic job retains its eight-day threshold.

## Restore proof

For a baseline or periodic drill:

1. Run `restic check` independently against both repositories.
2. Restore the latest `apps-vps-data` snapshot from Amazon S3 to a temporary directory.
3. Run `sha256sum -c SHA256SUMS` inside the restored staging directory.
4. Load at least one restored logical dump into a matching disposable database version and run a substantive schema/data query.
5. Remove the disposable database and restore directory.

`apps-vps-amazon-restore-check.timer` repeats this Amazon proof monthly on the first day at 04:30 `Europe/Berlin` time with up to fifteen minutes of jitter. It runs `restic check`, restores and verifies every checksummed artifact, loads the Coolify dump into a disposable PostgreSQL 15 container, requires a non-empty public schema, removes the temporary data, and publishes separate restore-check telemetry. Prometheus alerts on a failed run, missing telemetry, or no success within 35 days.

The 2026-07-10 baseline restored all protected archives and loaded the Coolify dump into PostgreSQL 15, where the restored `coolify` database contained 64 public tables.

## Verified replica rollback retention

The pre-reseed HomeLinux PostgreSQL directory is retained through 2026-08-10. The one-shot `homelinux-stale-replica-cleanup.timer` then verifies that the stale and active paths remain distinct, the replica container still mounts the active path, and its WAL receiver is streaming. It does not delete automatically because the replica parent is operator-writable; fresh human approval is required after the retention review. `homelinux-stale-replica-cleanup --check` performs the same safety checks before the eligibility date.
