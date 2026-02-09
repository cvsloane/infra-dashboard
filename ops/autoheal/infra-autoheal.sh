#!/usr/bin/env bash

set -u

log() {
  echo "[$(date -Is)] $*"
}

AUTOHEAL_CONFIG_KEY="${AUTOHEAL_CONFIG_KEY:-infra:autoheal:config}"
AUTOHEAL_STATUS_KEY="${AUTOHEAL_STATUS_KEY:-infra:autoheal:status}"
AUTOHEAL_STATUS_TTL_SEC="${AUTOHEAL_STATUS_TTL_SEC:-300}"
AUTOHEAL_EVENTS_KEY="${AUTOHEAL_EVENTS_KEY:-infra:autoheal:events}"
AUTOHEAL_EVENTS_MAX="${AUTOHEAL_EVENTS_MAX:-200}"

HOSTNAME_VALUE="$(hostname)"
RUN_AT="$(date -Is)"

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

redis_lpush() {
  "${REDIS_CMD[@]}" LPUSH "$1" "$2" >/dev/null 2>&1
}

redis_ltrim() {
  "${REDIS_CMD[@]}" LTRIM "$1" "$2" "$3" >/dev/null 2>&1
}

redis_del() {
  "${REDIS_CMD[@]}" DEL "$1" >/dev/null 2>&1
}

push_event() {
  local action="$1"
  local uuid="$2"
  local name="$3"
  local fqdn="$4"
  local detail="${5:-}"
  local http_code="${6:-}"

  if (( AUTOHEAL_EVENTS_MAX <= 0 )); then
    return 0
  fi

  local payload
  payload="$(jq -nc \
    --arg ts "$RUN_AT" \
    --arg host "$HOSTNAME_VALUE" \
    --arg action "$action" \
    --arg uuid "$uuid" \
    --arg name "$name" \
    --arg fqdn "$fqdn" \
    --arg detail "$detail" \
    --arg httpCode "$http_code" \
    '{
      ts: $ts,
      host: $host,
      action: $action,
      uuid: $uuid,
      name: $name,
      fqdn: $fqdn,
      detail: (if $detail == "" then null else $detail end),
      httpCode: (if $httpCode == "" then null else $httpCode end)
    }' 2>/dev/null || true)"

  if [[ -z "$payload" ]]; then
    return 0
  fi

  redis_lpush "$AUTOHEAL_EVENTS_KEY" "$payload"
  redis_ltrim "$AUTOHEAL_EVENTS_KEY" 0 $(( AUTOHEAL_EVENTS_MAX - 1 ))
}

write_status() {
  local enabled="$1"
  local enabled_sites_count="$2"
  local config_updated_at="$3"
  local checked="$4"
  local healthy="$5"
  local degraded="$6"
  local unhealthy="$7"
  local skipped_deploying="$8"
  local cooldown_skips="$9"
  local restarts_triggered="${10}"
  local restarts_failed="${11}"
  local redeploys_triggered="${12}"
  local redeploys_failed="${13}"

  local payload
  payload="$(jq -nc \
    --arg updatedAt "$RUN_AT" \
    --arg host "$HOSTNAME_VALUE" \
    --arg enabled "$enabled" \
    --argjson enabledSitesCount "$enabled_sites_count" \
    --arg configUpdatedAt "$config_updated_at" \
    --argjson checked "$checked" \
    --argjson healthy "$healthy" \
    --argjson degraded "$degraded" \
    --argjson unhealthy "$unhealthy" \
    --argjson skippedDeploying "$skipped_deploying" \
    --argjson cooldownSkips "$cooldown_skips" \
    --argjson restartsTriggered "$restarts_triggered" \
    --argjson restartsFailed "$restarts_failed" \
    --argjson redeploysTriggered "$redeploys_triggered" \
    --argjson redeploysFailed "$redeploys_failed" \
    '{
      version: 1,
      host: $host,
      updatedAt: $updatedAt,
      enabled: ($enabled == "true"),
      enabledSitesCount: $enabledSitesCount,
      configUpdatedAt: (if $configUpdatedAt == "" then null else $configUpdatedAt end),
      summary: {
        checked: $checked,
        healthy: $healthy,
        degraded: $degraded,
        unhealthy: $unhealthy,
        skippedDeploying: $skippedDeploying,
        cooldownSkips: $cooldownSkips,
        restartsTriggered: $restartsTriggered,
        restartsFailed: $restartsFailed,
        redeploysTriggered: $redeploysTriggered,
        redeploysFailed: $redeploysFailed
      }
    }' 2>/dev/null || true)"

  if [[ -z "$payload" ]]; then
    return 0
  fi

  # Set a heartbeat-style status so the dashboard can tell if the script is running.
  redis_setex "$AUTOHEAL_STATUS_KEY" "$AUTOHEAL_STATUS_TTL_SEC" "$payload"
}

config_json=$(redis_get "$AUTOHEAL_CONFIG_KEY")
if [[ -z "$config_json" || "$config_json" == "nil" ]]; then
  config_json="{}"
fi

enabled=$(echo "$config_json" | jq -r '.enabled // true')
config_updated_at="$(echo "$config_json" | jq -r '.updatedAt // ""')"

failure_threshold=$(echo "$config_json" | jq -r '.failureThreshold // 2')
failure_window_sec=$(echo "$config_json" | jq -r '.failureWindowSec // 120')
skip_when_deploying=$(echo "$config_json" | jq -r '.skipWhenDeploying // true')
cooldown_sec=$(echo "$config_json" | jq -r '.cooldownSec // 600')
redeploy_delay_sec=$(echo "$config_json" | jq -r '.redeployDelaySec // 90')
redeploy_after_restart=$(echo "$config_json" | jq -r '.redeployAfterRestart // true')

readarray -t enabled_sites < <(echo "$config_json" | jq -r '.enabledSites[]?')

checked_count=0
healthy_count=0
degraded_count=0
unhealthy_count=0
skipped_deploying_count=0
cooldown_skips_count=0
restart_triggered_count=0
restart_failed_count=0
redeploy_triggered_count=0
redeploy_failed_count=0

if [[ "$enabled" != "true" ]]; then
  log "AutoHEAL disabled."
  write_status "false" "${#enabled_sites[@]}" "$config_updated_at" \
    "$checked_count" "$healthy_count" "$degraded_count" "$unhealthy_count" \
    "$skipped_deploying_count" "$cooldown_skips_count" \
    "$restart_triggered_count" "$restart_failed_count" "$redeploy_triggered_count" "$redeploy_failed_count"
  exit 0
fi

if [[ ${#enabled_sites[@]} -eq 0 ]]; then
  log "No enabled sites configured."
  write_status "true" 0 "$config_updated_at" \
    "$checked_count" "$healthy_count" "$degraded_count" "$unhealthy_count" \
    "$skipped_deploying_count" "$cooldown_skips_count" \
    "$restart_triggered_count" "$restart_failed_count" "$redeploy_triggered_count" "$redeploy_failed_count"
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
      skipped_deploying_count=$(( skipped_deploying_count + 1 ))
      redis_del "infra:autoheal:fail:$uuid"
      redis_del "infra:autoheal:phase:$uuid"
      continue
    fi
  fi

  checked_count=$(( checked_count + 1 ))
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -I "$fqdn" || echo "000")

  if [[ "$http_code" =~ ^2|^3 ]]; then
    healthy_count=$(( healthy_count + 1 ))
    redis_del "infra:autoheal:fail:$uuid"
    redis_del "infra:autoheal:phase:$uuid"
    redis_del "infra:autoheal:cooldown:$uuid"
    continue
  fi

  if [[ "$http_code" =~ ^4 ]]; then
    log "Degraded $name ($http_code) - no autoheal."
    degraded_count=$(( degraded_count + 1 ))
    redis_del "infra:autoheal:fail:$uuid"
    redis_del "infra:autoheal:phase:$uuid"
    continue
  fi

  unhealthy_count=$(( unhealthy_count + 1 ))
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
      cooldown_skips_count=$(( cooldown_skips_count + 1 ))
      continue
    fi
  fi

  phase=$(redis_get "$phase_key")
  now_ts=$(date +%s)

  if [[ -z "$phase" || "$phase" == "nil" ]]; then
    if restart_app "$uuid"; then
      log "Restart triggered for $name."
      restart_triggered_count=$(( restart_triggered_count + 1 ))
      push_event "restart_triggered" "$uuid" "$name" "$fqdn" "" "$http_code"
      if [[ "$redeploy_after_restart" == "true" ]]; then
        ttl=$(( redeploy_delay_sec > 0 ? redeploy_delay_sec * 3 : 300 ))
        redis_setex "$phase_key" "$ttl" "restart|$now_ts"
      else
        (( cooldown_sec > 0 )) && redis_setex "$cooldown_key" "$cooldown_sec" "restart"
      fi
    else
      log "Restart failed for $name."
      restart_failed_count=$(( restart_failed_count + 1 ))
      push_event "restart_failed" "$uuid" "$name" "$fqdn" "" "$http_code"
    fi
    continue
  fi

  if [[ "$redeploy_after_restart" == "true" && "$phase" == restart* ]]; then
    phase_ts=${phase#restart|}
    if [[ "$phase_ts" =~ ^[0-9]+$ ]]; then
      if (( now_ts - phase_ts >= redeploy_delay_sec )); then
        if redeploy_app "$uuid"; then
          log "Redeploy triggered for $name."
          redeploy_triggered_count=$(( redeploy_triggered_count + 1 ))
          push_event "redeploy_triggered" "$uuid" "$name" "$fqdn" "" "$http_code"
          redis_del "$phase_key"
          (( cooldown_sec > 0 )) && redis_setex "$cooldown_key" "$cooldown_sec" "redeploy"
        else
          log "Redeploy failed for $name."
          redeploy_failed_count=$(( redeploy_failed_count + 1 ))
          push_event "redeploy_failed" "$uuid" "$name" "$fqdn" "" "$http_code"
        fi
      else
        log "Waiting to redeploy $name (delay not met)."
      fi
    fi
  fi

done

write_status "true" "${#enabled_sites[@]}" "$config_updated_at" \
  "$checked_count" "$healthy_count" "$degraded_count" "$unhealthy_count" \
  "$skipped_deploying_count" "$cooldown_skips_count" \
  "$restart_triggered_count" "$restart_failed_count" "$redeploy_triggered_count" "$redeploy_failed_count"
