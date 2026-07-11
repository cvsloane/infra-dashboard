#!/usr/bin/env bash
set -euo pipefail

readonly RESTORE_ENV=/etc/restic/apps-amazon.env
readonly CONTAINER=apps-amazon-restore-check
readonly AMAZON_LOCK=/run/lock/apps-vps-amazon-restic.lock

exec 9>"${AMAZON_LOCK}"
flock -w 1800 9

source "${RESTORE_ENV}"

restore_root="$(mktemp -d /var/tmp/apps-amazon-restore-check.XXXXXX)"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  rm -rf -- "${restore_root}"
}
trap cleanup EXIT

# Remove residue only from a previously interrupted copy of this exact drill.
docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

restic check
restic restore latest --tag apps-vps-data --target "${restore_root}"

stage="$(find "${restore_root}" -type f -name SHA256SUMS -printf '%h\n' -quit)"
if [[ -z "${stage}" ]]; then
  echo "Restored snapshot did not contain SHA256SUMS" >&2
  exit 1
fi

(
  cd "${stage}"
  sha256sum -c SHA256SUMS
)

docker run -d \
  --name "${CONTAINER}" \
  -e POSTGRES_PASSWORD=restore-check \
  postgres:15-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "${CONTAINER}" pg_isready -U postgres >/dev/null

gzip -dc "${stage}/databases/coolify-postgres.sql.gz" \
  | docker exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U postgres >/dev/null

table_count="$(
  docker exec "${CONTAINER}" \
    psql -U postgres -d coolify -Atc \
      "select count(*) from information_schema.tables where table_schema = 'public';"
)"

if [[ ! "${table_count}" =~ ^[0-9]+$ ]] || (( table_count == 0 )); then
  echo "Restored Coolify database contains no public tables" >&2
  exit 1
fi

snapshot_id="$(restic snapshots --tag apps-vps-data --json | jq -r 'sort_by(.time) | last | .short_id')"
echo "Amazon restore check passed: snapshot=${snapshot_id} coolify_public_tables=${table_count}"
