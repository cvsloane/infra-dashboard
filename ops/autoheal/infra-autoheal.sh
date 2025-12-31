#!/usr/bin/env bash

set -u

log() {
  echo "[$(date -Is)] $*"
}

AUTOHEAL_CONFIG_KEY="${AUTOHEAL_CONFIG_KEY:-infra:autoheal:config}"

if [[ -z "${COOLIFY_API_URL:-}" ]]; then
  log "COOLIFY_API_URL is not set. Exiting."
  exit 1
fi

if [[ -z "${COOLIFY_API_TOKEN:-}" ]]; then
  log "COOLIFY_API_TOKEN is not set. Exiting."
  exit 1
fi

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

redis_get() {
  "${REDIS_CMD[@]}" GET "$1" 2>/dev/null | tr -d '\r'
}

redis_incr() {
  "${REDIS_CMD[@]}" INCR "$1" 2>/dev/null | tr -d '\r'
}

redis_expire() {
  "${REDIS_CMD[@]}" EXPIRE "$1" "$2" >/dev/null 2>&1
}

redis_setex() {
  "${REDIS_CMD[@]}" SETEX "$1" "$2" "$3" >/dev/null 2>&1
}

redis_del() {
  "${REDIS_CMD[@]}" DEL "$1" >/dev/null 2>&1
}

config_json=$(redis_get "$AUTOHEAL_CONFIG_KEY")
if [[ -z "$config_json" || "$config_json" == "nil" ]]; then
  config_json="{}"
fi

enabled=$(echo "$config_json" | jq -r '.enabled // true')
if [[ "$enabled" != "true" ]]; then
  log "AutoHEAL disabled."
  exit 0
fi

failure_threshold=$(echo "$config_json" | jq -r '.failureThreshold // 2')
failure_window_sec=$(echo "$config_json" | jq -r '.failureWindowSec // 120')
skip_when_deploying=$(echo "$config_json" | jq -r '.skipWhenDeploying // true')
cooldown_sec=$(echo "$config_json" | jq -r '.cooldownSec // 600')
redeploy_delay_sec=$(echo "$config_json" | jq -r '.redeployDelaySec // 90')
redeploy_after_restart=$(echo "$config_json" | jq -r '.redeployAfterRestart // true')

readarray -t enabled_sites < <(echo "$config_json" | jq -r '.enabledSites[]?')
if [[ ${#enabled_sites[@]} -eq 0 ]]; then
  log "No enabled sites configured."
  exit 0
fi

apps_json=$(curl -sS -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_URL/applications" || true)
if [[ -z "$apps_json" ]]; then
  log "Failed to fetch Coolify applications."
  exit 1
fi

apps_payload=$(echo "$apps_json" | jq -c 'if type=="object" then (.result // .data // []) else . end')

declare -A APP_NAME
declare -A APP_FQDN

while IFS=$'\t' read -r uuid name fqdn; do
  [[ -z "$uuid" ]] && continue
  APP_NAME["$uuid"]="$name"
  APP_FQDN["$uuid"]="$fqdn"
done < <(echo "$apps_payload" | jq -r '.[] | [.uuid, .name, (.fqdn // "")] | @tsv')

active_payload=$(curl -sS -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_URL/deployments" || true)
active_payload=$(echo "$active_payload" | jq -c 'if type=="object" then (.result // .data // []) else . end')

declare -A ACTIVE_IDS
declare -A ACTIVE_NAMES

while IFS=$'\t' read -r app_id app_name app_uuid; do
  [[ -n "$app_id" ]] && ACTIVE_IDS["$app_id"]=1
  [[ -n "$app_uuid" ]] && ACTIVE_IDS["$app_uuid"]=1
  if [[ -n "$app_name" ]]; then
    ACTIVE_NAMES["${app_name,,}"]=1
  fi
done < <(echo "$active_payload" | jq -r '.[]? | [(.application_id // ""), (.application_name // ""), (.application_uuid // "")] | @tsv')

restart_app() {
  local uuid="$1"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_URL/applications/$uuid/restart")
  [[ "$status" =~ ^2 ]]
}

redeploy_app() {
  local uuid="$1"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"uuid\":\"$uuid\",\"force\":true}" \
    "$COOLIFY_API_URL/deploy")
  [[ "$status" =~ ^2 ]]
}

for uuid in "${enabled_sites[@]}"; do
  name="${APP_NAME[$uuid]:-Unknown}"
  fqdn="${APP_FQDN[$uuid]:-}"

  if [[ -z "$fqdn" ]]; then
    log "Skipping $uuid ($name): no fqdn configured."
    continue
  fi

  # Pick first fqdn, prefer https
  if [[ "$fqdn" == *","* ]]; then
    IFS=',' read -ra fqdn_parts <<< "$fqdn"
    fqdn=""
    for part in "${fqdn_parts[@]}"; do
      part_trim=$(echo "$part" | xargs)
      if [[ "$part_trim" == https://* ]]; then
        fqdn="$part_trim"
        break
      fi
      [[ -z "$fqdn" ]] && fqdn="$part_trim"
    done
  fi

  if [[ "$fqdn" != http* ]]; then
    fqdn="https://$fqdn"
  fi

  if [[ "$skip_when_deploying" == "true" ]]; then
    if [[ -n "${ACTIVE_IDS[$uuid]:-}" || -n "${ACTIVE_NAMES[${name,,}]:-}" ]]; then
      log "Skipping $name: deployment in progress."
      redis_del "infra:autoheal:fail:$uuid"
      redis_del "infra:autoheal:phase:$uuid"
      continue
    fi
  fi

  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -I "$fqdn" || echo "000")

  if [[ "$http_code" =~ ^2|^3 ]]; then
    redis_del "infra:autoheal:fail:$uuid"
    redis_del "infra:autoheal:phase:$uuid"
    redis_del "infra:autoheal:cooldown:$uuid"
    continue
  fi

  if [[ "$http_code" =~ ^4 ]]; then
    log "Degraded $name ($http_code) - no autoheal."
    redis_del "infra:autoheal:fail:$uuid"
    redis_del "infra:autoheal:phase:$uuid"
    continue
  fi

  fail_key="infra:autoheal:fail:$uuid"
  phase_key="infra:autoheal:phase:$uuid"
  cooldown_key="infra:autoheal:cooldown:$uuid"

  failures=$(redis_incr "$fail_key")
  if [[ "$failures" == "1" ]]; then
    redis_expire "$fail_key" "$failure_window_sec"
  fi

  if (( failures < failure_threshold )); then
    continue
  fi

  if (( cooldown_sec > 0 )); then
    cooldown_state=$(redis_get "$cooldown_key")
    if [[ -n "$cooldown_state" && "$cooldown_state" != "nil" ]]; then
      log "Cooldown active for $name."
      continue
    fi
  fi

  phase=$(redis_get "$phase_key")
  now_ts=$(date +%s)

  if [[ -z "$phase" || "$phase" == "nil" ]]; then
    if restart_app "$uuid"; then
      log "Restart triggered for $name."
      if [[ "$redeploy_after_restart" == "true" ]]; then
        ttl=$(( redeploy_delay_sec > 0 ? redeploy_delay_sec * 3 : 300 ))
        redis_setex "$phase_key" "$ttl" "restart|$now_ts"
      else
        (( cooldown_sec > 0 )) && redis_setex "$cooldown_key" "$cooldown_sec" "restart"
      fi
    else
      log "Restart failed for $name."
    fi
    continue
  fi

  if [[ "$redeploy_after_restart" == "true" && "$phase" == restart* ]]; then
    phase_ts=${phase#restart|}
    if [[ "$phase_ts" =~ ^[0-9]+$ ]]; then
      if (( now_ts - phase_ts >= redeploy_delay_sec )); then
        if redeploy_app "$uuid"; then
          log "Redeploy triggered for $name."
          redis_del "$phase_key"
          (( cooldown_sec > 0 )) && redis_setex "$cooldown_key" "$cooldown_sec" "redeploy"
        else
          log "Redeploy failed for $name."
        fi
      else
        log "Waiting to redeploy $name (delay not met)."
      fi
    fi
  fi

done
