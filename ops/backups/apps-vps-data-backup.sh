#!/usr/bin/env bash
set -euo pipefail

source /etc/restic/apps.env

readonly BACKUP_ROOT=/var/backups/apps-vps-data
readonly TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAGE_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
readonly DATABASE_DIR="${STAGE_DIR}/databases"
readonly CONFIG_LIST="${STAGE_DIR}/config-files.list"

install -d -m 0700 -o root -g root "${BACKUP_ROOT}" "${STAGE_DIR}" "${DATABASE_DIR}"

require_container() {
  local container="$1"
  if [[ "$(docker inspect -f '{{.State.Running}}' "${container}" 2>/dev/null)" != "true" ]]; then
    echo "Required database container is not running: ${container}" >&2
    exit 1
  fi
}

dump_postgres_cluster() {
  local container="$1"
  local output_name="$2"

  require_container "${container}"
  echo "Dumping PostgreSQL cluster: ${container}"
  docker exec "${container}" sh -ec \
    'exec pg_dumpall -U "$POSTGRES_USER"' \
    | gzip -1 > "${DATABASE_DIR}/${output_name}.sql.gz"
  gzip -t "${DATABASE_DIR}/${output_name}.sql.gz"
}

dump_mysql_cluster() {
  local container="$1"
  local output_name="$2"

  require_container "${container}"
  echo "Dumping MySQL/MariaDB cluster: ${container}"
  docker exec "${container}" sh -ec '
    if command -v mariadb-dump >/dev/null 2>&1; then
      exec mariadb-dump --protocol=socket --user=root --password="$MYSQL_ROOT_PASSWORD" \
        --single-transaction --quick --routines --events --all-databases
    fi
    exec mysqldump --protocol=socket --user=root --password="$MYSQL_ROOT_PASSWORD" \
      --single-transaction --quick --routines --events --all-databases
  ' | gzip -1 > "${DATABASE_DIR}/${output_name}.sql.gz"
  gzip -t "${DATABASE_DIR}/${output_name}.sql.gz"
}

# Recovery-critical control plane and business application databases.
# Nextcloud is intentionally excluded by operator decision.
dump_postgres_cluster coolify-db coolify-postgres
dump_mysql_cluster freescout-db freescout-mariadb
dump_mysql_cluster hg-wp-mysql hg-wordpress-mysql
dump_mysql_cluster mysql-g0o040wk8gw0g0gwooccw0cc wordpress-mysql
dump_postgres_cluster langfuse-postgres-1 langfuse-postgres
dump_postgres_cluster postiz-temporal-postgresql postiz-temporal-postgres

# Capture only rebuild configuration, not application source trees, registries,
# generated media, venvs, caches, telemetry stores, or raw database volumes.
find /data/coolify/applications \
  -mindepth 2 -maxdepth 2 -type f \
  \( -name '.env' -o -name 'docker-compose.yml' -o -name 'docker-compose.yaml' \) \
  -print0 > "${CONFIG_LIST}"
find /opt \
  -mindepth 2 -maxdepth 3 -type f \
  \( -name '.env' -o -name 'compose.yml' -o -name 'compose.yaml' \
     -o -name 'docker-compose.yml' -o -name 'docker-compose.yaml' \
     -o -name '*.conf' \) \
  -print0 >> "${CONFIG_LIST}"

tar --absolute-names --null --files-from="${CONFIG_LIST}" \
  -czf "${STAGE_DIR}/rebuild-config.tar.gz" \
  /etc \
  /data/coolify/source \
  /data/coolify/proxy \
  /data/coolify/ssh
gzip -t "${STAGE_DIR}/rebuild-config.tar.gz"

# WordPress content is small and may not be reproducible from GitHub alone.
tar -C /var/lib/docker/volumes/g0o040wk8gw0g0gwooccw0cc_wordpress-files \
  -czf "${STAGE_DIR}/wordpress-files.tar.gz" _data
gzip -t "${STAGE_DIR}/wordpress-files.tar.gz"

(
  cd "${STAGE_DIR}"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS
)
chmod -R go-rwx "${STAGE_DIR}"

restic backup --tag apps-vps-data "${STAGE_DIR}"
restic forget --prune --group-by host,tags --tag apps-vps-data \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6

# Keep two root-only local staging sets for fast recovery; Restic is the durable copy.
mapfile -t old_stages < <(
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
    | sort -r \
    | tail -n +3
)
for old_stage in "${old_stages[@]}"; do
  rm -rf -- "${BACKUP_ROOT:?}/${old_stage}"
done

echo "Apps data backup completed: ${TIMESTAMP}"
