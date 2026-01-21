#!/usr/bin/env bash

set -euo pipefail

log() {
  echo "[$(date -Is)] $*"
}

STATUS_KEY="${WORKER_SUPERVISOR_STATUS_KEY:-infra:workers:status}"
STATUS_TTL="${WORKER_SUPERVISOR_TTL_SEC:-600}"
RESTART_ENABLED="${WORKER_SUPERVISOR_RESTART:-false}"

SYSTEMD_REGEX="${WORKER_SYSTEMD_REGEX:-worker}"
SYSTEMD_EXCLUDE_REGEX="${WORKER_SYSTEMD_EXCLUDE_REGEX:-worker-supervisor}"
PM2_REGEX="${WORKER_PM2_REGEX:-worker}"
DOCKER_REGEX="${WORKER_DOCKER_REGEX:-worker}"
DOCKER_PROBE_ENABLED="${WORKER_DOCKER_PROBE_ENABLED:-true}"
DOCKER_PROBE_CMD="${WORKER_DOCKER_PROBE_CMD:-kill -0 1}"
DOCKER_PROBE_TIMEOUT="${WORKER_DOCKER_PROBE_TIMEOUT_SEC:-5}"

REDIS_CMD=()
if [[ -n "${REDIS_URL:-}" ]]; then
  REDIS_CMD=(redis-cli -u "$REDIS_URL")
else
  REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
  REDIS_PORT="${REDIS_PORT:-6379}"
  if command -v redis-cli >/dev/null 2>&1; then
    REDIS_CMD=(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT")
  else
    REDIS_CMD=(docker exec -i redis-broker redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT")
  fi

  if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    REDIS_CMD+=( -a "$REDIS_PASSWORD" )
  fi

  if [[ "${REDIS_TLS:-}" == "true" ]]; then
    REDIS_CMD+=( --tls )
    [[ -n "${REDIS_CA_CERT:-}" ]] && REDIS_CMD+=( --cacert "$REDIS_CA_CERT" )
    [[ -n "${REDIS_CLIENT_CERT:-}" ]] && REDIS_CMD+=( --cert "$REDIS_CLIENT_CERT" )
    [[ -n "${REDIS_CLIENT_KEY:-}" ]] && REDIS_CMD+=( --key "$REDIS_CLIENT_KEY" )
  fi
fi

HOSTNAME_VALUE="$(hostname)"
UPDATED_AT="$(date -Is)"

items_file="$(mktemp)"
cleanup() {
  rm -f "$items_file"
}
trap cleanup EXIT

add_item() {
  local name="$1"
  local source="$2"
  local status="$3"
  local detail="${4:-}"
  jq -nc \
    --arg name "$name" \
    --arg source "$source" \
    --arg status "$status" \
    --arg detail "$detail" \
    '{name:$name, source:$source, status:$status, detail: (if $detail == "" then null else $detail end)}' \
    >> "$items_file"
}

run_docker_probe() {
  local container="$1"
  if command -v timeout >/dev/null 2>&1; then
    timeout "$DOCKER_PROBE_TIMEOUT" docker exec "$container" sh -lc "$DOCKER_PROBE_CMD" >/dev/null 2>&1
  else
    docker exec "$container" sh -lc "$DOCKER_PROBE_CMD" >/dev/null 2>&1
  fi
}

systemd_units=()
if command -v systemctl >/dev/null 2>&1; then
  while IFS= read -r unit; do
    [[ -z "$unit" ]] && continue
    systemd_units+=("$unit")
  done < <(systemctl list-units --type=service --all --no-legend | awk '{print $1}' | grep -Ei "$SYSTEMD_REGEX" | grep -Eiv "$SYSTEMD_EXCLUDE_REGEX" || true)
fi

if [[ ${#systemd_units[@]} -gt 0 ]]; then
  for unit in "${systemd_units[@]}"; do
    active_state="$(systemctl show -p ActiveState --value "$unit" 2>/dev/null || true)"
    sub_state="$(systemctl show -p SubState --value "$unit" 2>/dev/null || true)"
    status="down"
    case "$active_state" in
      active)
        status="ok"
        ;;
      activating|reloading)
        status="warning"
        ;;
      *)
        status="down"
        ;;
    esac

    detail="state=${active_state:-unknown}/${sub_state:-unknown}"
    if [[ "$status" == "down" && "$RESTART_ENABLED" == "true" ]]; then
      if systemctl restart "$unit" >/dev/null 2>&1; then
        detail="$detail (restart triggered)"
      else
        detail="$detail (restart failed)"
      fi
    fi
    add_item "$unit" "systemd" "$status" "$detail"
  done
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | jq -c --arg re "$PM2_REGEX" '.[] | select(.name | test($re; "i"))' | while read -r row; do
    name="$(echo "$row" | jq -r '.name')"
    status_raw="$(echo "$row" | jq -r '.pm2_env.status')"
    restarts="$(echo "$row" | jq -r '.pm2_env.restart_time')"
    status="down"
    case "$status_raw" in
      online)
        status="ok"
        ;;
      launching|starting)
        status="warning"
        ;;
      *)
        status="down"
        ;;
    esac

    detail="pm2=${status_raw} restarts=${restarts}"
    if [[ "$status" == "down" && "$RESTART_ENABLED" == "true" ]]; then
      if pm2 restart "$name" >/dev/null 2>&1; then
        detail="$detail (restart triggered)"
      else
        detail="$detail (restart failed)"
      fi
    fi
    add_item "$name" "pm2" "$status" "$detail"
  done
fi

if command -v docker >/dev/null 2>&1; then
  docker_ids=$(docker ps -aq 2>/dev/null || true)
  if [[ -n "$docker_ids" ]]; then
    docker inspect $docker_ids | jq -c --arg re "$DOCKER_REGEX" '
      map({
        id: .Id,
        name: (.Name | ltrimstr("/")),
        resource: (.Config.Labels["coolify.resourceName"] // .Config.Labels["coolify.serviceName"] // (.Name | ltrimstr("/"))),
        state: .State.Status,
        health: (.State.Health.Status // null),
        labels: (.Config.Labels // {})
      })
      | map(select(
          ((.labels["coolify.resourceName"] // "") | test($re; "i")) or
          ((.name // "") | test($re; "i"))
        ))' | jq -c '.[]' | while read -r row; do
      name="$(echo "$row" | jq -r '.name')"
      display_name="$(echo "$row" | jq -r '.resource')"
      state="$(echo "$row" | jq -r '.state')"
      health="$(echo "$row" | jq -r '.health // empty')"
      status="down"
      detail="state=${state} container=${name}"

      if [[ "$state" == "running" ]]; then
        if [[ -z "$health" ]]; then
          status="warning"
        elif [[ "$health" == "healthy" ]]; then
          status="ok"
        elif [[ "$health" == "starting" ]]; then
          status="warning"
        else
          status="down"
        fi
        detail="state=${state} health=${health:-none} container=${name}"
      fi

      if [[ "$state" == "running" && -z "$health" && "$DOCKER_PROBE_ENABLED" == "true" ]]; then
        if run_docker_probe "$name"; then
          status="ok"
          detail="${detail} probe=ok"
        else
          status="warning"
          detail="${detail} probe=fail"
        fi
      fi

      if [[ "$status" == "down" && "$RESTART_ENABLED" == "true" ]]; then
        if docker restart "$name" >/dev/null 2>&1; then
          detail="$detail (restart triggered)"
        else
          detail="$detail (restart failed)"
        fi
      fi
      add_item "$display_name" "docker" "$status" "$detail"
    done
  fi
fi

items_json="[]"
if [[ -s "$items_file" ]]; then
  items_json=$(jq -s '.' "$items_file")
fi

summary_json=$(jq -n --argjson items "$items_json" '{
  total: ($items | length),
  ok: ($items | map(select(.status == "ok")) | length),
  warning: ($items | map(select(.status == "warning")) | length),
  down: ($items | map(select(.status == "down")) | length)
}')

payload=$(jq -n \
  --arg host "$HOSTNAME_VALUE" \
  --arg updatedAt "$UPDATED_AT" \
  --argjson summary "$summary_json" \
  --argjson items "$items_json" \
  '{version: 1, host: $host, updatedAt: $updatedAt, summary: $summary, items: $items}')

if [[ ${#REDIS_CMD[@]} -eq 0 ]]; then
  log "Redis command not configured; cannot persist worker status."
  exit 1
fi

set_response="$("${REDIS_CMD[@]}" SET "$STATUS_KEY" "$payload" EX "$STATUS_TTL" 2>/dev/null || true)"
if [[ "$set_response" != "OK" ]]; then
  log "Failed to write worker supervisor status to Redis (response: ${set_response:-empty})."
  exit 1
fi

log "Worker supervisor status updated (${STATUS_KEY})."
