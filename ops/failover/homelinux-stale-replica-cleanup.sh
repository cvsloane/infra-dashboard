#!/usr/bin/env bash
set -euo pipefail

readonly ACTIVE_PATH=/home/cvsloane/postgres-replica/data
readonly STALE_PATH=/home/cvsloane/postgres-replica/data.stale-20260710T215925Z
readonly REPLICA_PARENT=/home/cvsloane/postgres-replica
readonly CONTAINER=postgres-replica
readonly RETAIN_UNTIL='2026-08-10 03:00:00'

mode="${1:-review}"
if [[ "${mode}" != review && "${mode}" != --check ]]; then
  echo "usage: $0 [--check]" >&2
  exit 2
fi

if [[ ! -d "${STALE_PATH}" ]]; then
  echo "Stale replica directory is already absent: ${STALE_PATH}"
  exit 0
fi

if [[ -L "${REPLICA_PARENT}" || -L "${ACTIVE_PATH}" || -L "${STALE_PATH}" ]]; then
  echo "Replica cleanup paths must not be symbolic links" >&2
  exit 1
fi
if [[ "$(readlink -f "${REPLICA_PARENT}")" != "${REPLICA_PARENT}" ]]; then
  echo "Replica parent path is not canonical" >&2
  exit 1
fi
if [[ "$(stat -c '%U:%G' "${REPLICA_PARENT}")" != "cvsloane:cvsloane" ]]; then
  echo "Replica parent ownership is unexpected" >&2
  exit 1
fi
parent_mode="$(stat -c '%a' "${REPLICA_PARENT}")"
if (( (8#${parent_mode} & 8#002) != 0 )); then
  echo "Replica parent must not be world-writable" >&2
  exit 1
fi

active_real="$(readlink -f "${ACTIVE_PATH}")"
stale_real="$(readlink -f "${STALE_PATH}")"
if [[ -z "${active_real}" || -z "${stale_real}" \
  || "${active_real}" != "${ACTIVE_PATH}" \
  || "${stale_real}" != "${STALE_PATH}" \
  || "${active_real}" == "${stale_real}" ]]; then
  echo "Active and stale replica paths are not safely distinct" >&2
  exit 1
fi

mounted_source="$(
  docker inspect "${CONTAINER}" \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}'
)"
if [[ "$(readlink -f "${mounted_source}")" != "${active_real}" ]]; then
  echo "Replica container is not mounted from the expected active path" >&2
  exit 1
fi

receiver_status="$(
  docker exec -u postgres "${CONTAINER}" \
    psql -d postgres -Atc \
      "select pg_is_in_recovery()::text || '|' || coalesce((select status from pg_stat_wal_receiver limit 1), 'missing');"
)"
if [[ "${receiver_status}" != "true|streaming" && "${receiver_status}" != "t|streaming" ]]; then
  echo "Replacement replica is not in recovery with a streaming WAL receiver: ${receiver_status}" >&2
  exit 1
fi

if [[ "${mode}" == --check ]]; then
  echo "Cleanup preflight passed; retained until ${RETAIN_UNTIL} America/New_York"
  exit 0
fi

not_before="$(TZ=America/New_York date -d "${RETAIN_UNTIL}" +%s)"
if (( $(date +%s) < not_before )); then
  echo "Retention period has not elapsed; retained until ${RETAIN_UNTIL} America/New_York" >&2
  exit 1
fi

echo "Retention elapsed and safety review passed for ${STALE_PATH}"
echo "Automatic deletion is intentionally disabled; obtain fresh human approval before removal."
