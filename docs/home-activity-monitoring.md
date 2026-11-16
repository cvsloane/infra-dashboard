# Household Roblox and YouTube activity

The activity view at `/home-network` reads the existing `home_activity_events` table. New verified records have `metadata.collector_version = 2`; old browser-history imports remain stored but are excluded from this view because their local-device attribution was not established.

## Evidence

- A local YouTube watch/Shorts/live/embed page visit records its video identifier and browser title. It does **not** establish playback or watch duration. Native YouTube mobile apps are not covered.
- A Roblox game-page visit is browsing, not a game join.
- Roblox's local `Joining game` marker is an attempt. `Report game_join_loadtime` is displayed as a client-reported join, not measured active play. The universe identifier resolves to the experience name using Roblox's public metadata API; the original place identifier remains available for teleports.
- Chrome/Edge/Brave visits must have local source (`COALESCE(visit_source.source,1)=1`) and an empty originating-device GUID. Synced visits are excluded.

## Device collection

`scripts/collect-home-app-activity.ps1` uses Windows' built-in `winsqlite3.dll`. Browser databases are queried through a temporary local snapshot to respect the browser's exclusive lock. Whole databases never leave the device. Only relevant video/game identifiers, canonical links, titles, timestamps and attribution are queued; unrelated web visits, cookies, Roblox authentication/job/server/user identifiers and raw log lines are not exported.

A scheduled `Home Activity Monitor` task runs as SYSTEM every five minutes, including on battery. It writes selected events under `C:\ProgramData\HomeActivityMonitor\spool`. Checkpoints advance only after the selected records are safely queued and the scan has no errors; repeated records use stable identifiers and the database deduplicates them. No retention/deletion schedule is introduced for unacknowledged events.

Without enrollment the queue stays local. An enrolled device reads `upload.json`, posts batches over certificate-verified HTTPS, and removes each queue file only after every batch is acknowledged. Errors retain the queue for the next scheduled run. Credential configuration must be readable only by SYSTEM/Administrators, and must not be included in diagnostics or Git.

The collector reads browser profiles for ordinary users on the assigned computer. The installation verifies the actual computer name before writing a script or registering a task. Phones/tablets require an additional supported source and are not enrolled by this Windows collector.

## Upload authentication

`POST /api/home-network/activity-upload` accepts a per-device key in `Authorization: Bearer ...` and the computer name in `X-Home-Device`. `HOME_ACTIVITY_DEVICE_KEYS` contains only hashed keys, keyed by computer name: `{ "COMPUTER": { "child": "label", "key_hash": "sha256-hex" } }`. Missing/malformed enrollment fails closed. Each key is bound to its child's computer and only the relevant local video/game/heartbeat event types. Content links are reconstructed from validated identifiers.

Activation requires explicit approval to create enrollment credentials and configure the exact upload path in Cloudflare Access. The dashboard, other API routes and existing sign-in requirements stay protected. An expired origin certificate must be repaired before relying on the direct origin HTTPS path; do not disable certificate verification.

## Administration

`scripts/collect-home-app-activity.py` uses the existing SSH management path to install or inspect the same native collector, and can upload/acknowledge selected queues through the existing ingest API when a valid route is configured. `--install --dry-run` only prints planned targets: no SSH, installation, state writes or data deletion occurs. `--dry-run` without installation reads queues without acknowledging them. Inventory lives in `config/home-activity-devices.json`; verify current IPs against the router snapshot and actual computer identity before installation.

Status cards show the last collection and upload separately, whether local collection was reported, and scan errors. A missing/stale report is a coverage gap, not evidence of inactivity. Historical browser snapshots and imported rows must not be relabeled as verified local collection.

## Pending enrollment

The existing homelinux `home-activity-collector.timer` invokes `enroll-home-app-activity.py` through `ops/home-network/run-home-activity-collector.sh`. It retries only devices without a completed receipt for the current collector hash. The installer verifies identity and script checksum, transfers the file through SFTP when needed, and scopes PowerShell execution policy to the collector process. Enrollment retrieves each device key directly from Bitwarden and transmits it over SSH standard input. The Windows upload configuration is restricted to SYSTEM and Administrators. Completed computers upload on their own; home-server reachability is needed only for enrollment or administrative inspection.
