#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <job> <host>" >&2
  exit 2
fi

job="$1"
host="$2"
textfile_dir="${TEXTFILE_DIR:-/var/lib/prometheus/node-exporter}"
output="${textfile_dir}/heaviside_restic_restore_check.prom"
tmp="${output}.tmp.$$"
now="$(date +%s)"
last_success=0

install -d -m 0755 "${textfile_dir}"

if [[ -r "${output}" ]]; then
  last_success="$({ awk '/^heaviside_restic_restore_check_last_success_timestamp_seconds/ { print $2; exit }' "${output}" || true; })"
  [[ "${last_success}" =~ ^[0-9]+$ ]] || last_success=0
fi

success=0
if [[ "${SERVICE_RESULT:-unknown}" == "success" ]]; then
  success=1
  last_success="${now}"
fi

cat >"${tmp}" <<EOF
# HELP heaviside_restic_restore_check_last_run_success Whether the most recent Restic restore check succeeded (1) or failed (0).
# TYPE heaviside_restic_restore_check_last_run_success gauge
heaviside_restic_restore_check_last_run_success{restore_job="${job}",host="${host}"} ${success}
# HELP heaviside_restic_restore_check_last_run_timestamp_seconds Unix timestamp of the most recent Restic restore check.
# TYPE heaviside_restic_restore_check_last_run_timestamp_seconds gauge
heaviside_restic_restore_check_last_run_timestamp_seconds{restore_job="${job}",host="${host}"} ${now}
# HELP heaviside_restic_restore_check_last_success_timestamp_seconds Unix timestamp of the most recent successful Restic restore check.
# TYPE heaviside_restic_restore_check_last_success_timestamp_seconds gauge
heaviside_restic_restore_check_last_success_timestamp_seconds{restore_job="${job}",host="${host}"} ${last_success}
EOF

chmod 0644 "${tmp}"
mv -f "${tmp}" "${output}"
