#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
exec python3 /opt/home-activity-collector/enroll-home-app-activity.py \
  --devices /opt/home-activity-collector/home-activity-devices.json
