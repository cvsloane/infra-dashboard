# Discord notification audit — 2026-09-12

## Scope and evidence

Read all 21 text channels visible to the configured Heaviside Discord bot; no active threads. Reviewed 1300 stored messages (up to 100 per channel, with monitoring paginated to 200 to cover September 5–12). 180 messages in that date window. This is a current sender/notification audit, not an exhaustive historical archive or private-DM audit. Candidate personal data and credentials are excluded from this report. Raw read-only evidence is in protected local `/tmp/discord-audit-20260912/`.

Compared message senders with live Hermes scheduler state, Coolify notification settings and task execution history, Uptime Kuma's monitor database, Prometheus alerts, and HomeLinux systemd service logs. No Discord messages were sent, edited or deleted.

## Findings and actions

| Source | Recent evidence | Assessment / action |
|---|---|---|
| HG Careers → heavisidebot | Five candidate messages September 5–12; latest September 12 | Comes from HG Websites careers screening, not a stale Hermes cron. User preference question pending: turn off candidate notifications while preserving applications. Still enabled. |
| Coolify successful deployments | Team1 webhook success setting enabled; native Discord settings already disabled | Disabled only `deployment_success_webhook_notifications`; readback false. Deployment and scheduled-task failure alerts remain enabled. |
| Coolify task failures → monitoring | 70 messages: HAI October pilot27, Smart Intake22, PPC purchase outbox8, chat transcript sweep5, failed GHL sync retry4, GHL contacts sync1, other generic failures3 | Keep failure detection. Five HG Websites task types have latest successful executions on September12; GHL contact sync latest recorded success September11. These are live workflows, not obsolete tasks. No task disabled. |
| Alertmanager → monitoring | 30 messages across backup, GPU lease exporter, model manifest drift, retired transcript relay, inference/media health | Retired transcript relay alert already removed in earlier cleanup. GPU lease exporter restart repaired its boot failure. Real backup/model-drift failures retained. |
| GPU lease exporter | Failed at boot because `tailscale ip -4` returned1, then hit systemd restart limit | Restarted only `local-ai-gpu-lease-exporter.service`; verified active, metrics endpoint200 and `local_ai_gpu_lease_up=1`. Prometheus exporter-down alert cleared. No inference service restarted. Does not establish future boot ordering fixed. |
| Uptime Kuma → monitoring | 20 up/down messages across Heaviside Agency, Against Reformation, Revenue Commander | All three checks currently active and200; two additional database checks also active. Keep. An old product name alone is not retirement evidence. |
| Infrastructure health / queue health → monitoring | 14 remaining messages, largely disk growth, reboot connectivity, watchdog/capability issues | Real incident evidence. Original capacity issue fixed; keep health coverage. Some messages were manually summarized by Hermes and are not separate scheduled jobs. |
| HomeLinux functional monitor → ai-videogen | Eight outage/monitor-error messages | Keep: covers host reachability and functional service failures. GPU exporter repair is distinct from this monitor. |
| Outbound daily report → outbound | 32 messages, including report fragments; repeated zero new activity and six unchanged pending reviews | Low-value routine delivery. User preference question pending to stop routine Discord digest while retaining processing and failure alerts. Still enabled. Source is outbound manifest, not disabled Cold Email Daily Report. |
| Historical Project Status, X inbound, updater, standup, EA inbox, social goals and other channels | No September5–12 messages in remaining17 channels | Historical messages are not proof of currently active notification jobs. Avoid disabling useful local jobs merely because old notifications remain visible. |

## Candidate delivery dependency

`hg-websites/src/lib/careers/hermes.ts` resolves `CAREERS_HERMES_WEBHOOK_URL` then `DISCORD_HEAVISIDELINUX_WEBHOOK`. The careers webhook is also a fallback for quiz notifications in `src/lib/quiz/hermes.ts`. Deleting that shared webhook or blindly removing env keys could suppress unrelated quiz leads. If candidates are muted, use a careers-specific change and preserve quiz notifications. Coolify application `cocowcc04ockwkg8w408goso` has runtime careers webhook and target env entries. No credential values copied here.

## Remaining problems, not stale alerts

- `ResticBackupLastRunFailed` and `ResticWeeklyBackupStale` on db-vps still firing. September6 run terminated with SIGTERM at06:00 server time; August30 is the last successful run in the journal. Daily PostgreSQL logical backup is a different system. Do not mute them because capacity was recovered.
- `LocalAIModelManifestDrift` still firing. Resolve expected/deployed model mismatch separately.
- `LocalAIGPULeaseStaleOwner` briefly pending after exporter recovery: now-visible lease telemetry, not evidence the exporter repair failed. Do not interrupt active inference to silence it.
- Coolify failures deserve first-failure/recovery visibility. Existing router uses incident reminders and per-hour duplicate limits. No new throttling system added in this audit.
- HOS manual migration/rehearsal backup lifecycle remains the next capacity-prevention item from the original infrastructure task.

## Channel coverage

| Channel | Messages September5–12 | Latest visible message |
|---|---:|---|
| general (1458589528334794816) | 0 | 2026-06-17 |
| general (1475924972215206019) | 0 | 2026-08-24 |
| open-agents (1475924992859443272) | 0 | 2026-03-18 |
| agent-command (1475925000966897786) | 0 | 2026-08-02 |
| backend (1475925004645437627) | 0 | 2026-04-07 |
| x-accel (1475938564826206298) | 0 | 2026-08-22 |
| ai-videogen (1475938568831504547) | 8 | 2026-09-12 |
| monitoring (1475969677976014980) | 134 | 2026-09-12 |
| family (1475985139791298674) | 0 | 2026-02-25 |
| heavisidebot (1476027006817669242) | 6 | 2026-09-12 |
| daga (1484745674481340447) | 0 | 2026-03-21 |
| paperclip (1485753221892014203) | 0 | 2026-03-24 |
| standup (1486750694668238951) | 0 | 2026-06-10 |
| outbound (1486750696614395934) | 32 | 2026-09-12 |
| social-goals (1487463857088892998) | 0 | 2026-06-20 |
| ea-inbox (1491287359747264643) | 0 | 2026-05-12 |
| loop-control (1517986265235198075) | 0 | 2026-08-30 |
| coding-dispatch (1517986266031980654) | 0 | 2026-06-20 |
| vault-gardener (1517986267047133314) | 0 | 2026-06-20 |
| production-protection (1517986268070285423) | 0 | 2026-07-19 |
| project-focus (1517996534384431244) | 0 | none |

## Approved follow-through — 2026-09-12

Chris requested candidate screening be stopped because Heaviside Group is not hiring, and the outbound digest stopped.

- Paused apps-vps root careers cron, preserving protected crontab backup. Unpublished Account Manager and Part-Time Payroll & HR Admin openings; zero active Heaviside Group jobs. Public `/api/careers?tenant=heaviside-group` returns200, empty jobs, total0. Queue contains25completed screening jobs and no queued/running jobs. Applications preserved; shared careers/quiz webhook untouched. See HG Websites `docs/careers-screening-pause-2026-09-12.md`.
- Outbound Daily Report live scheduler paused via supported Hermes CLI. Saved manifest disabled; verified release preparation underway. Other outbound jobs preserved.
- Backup detail: weekly db-vps Restic backs up existing `/etc`, `/opt`, `/root` paths; missing `/var/lib/postgresql` and `/data` are skipped. August30 last successful journal entry, September6 terminated withSIGTERM. Daily logical directory `/opt/postgres/backups/logical/20260912_020015` exists independently; no restore proof performed.
- Model drift detail: exporter expects manifest SHA256 `59c59eaeda4b7f102c958e54ffa5a094ad16ef08e0d95d4063a4ff91f4890665`, deployed SHA256 `4cadd535c2ae2568408e136d282164a147750afcec70f1035ad60c74e1c29cf0`. Deployed single Qwen3.8 local-qwen and llama.cpp b10454 match canonical August18 cutover note. Editable local-ai-infra source still describes older three-model setup. Appears stale baseline/config-record drift, not model quality degradation; monitor baseline not changed in this turn.
- These alerts are generic Alertmanager incident embeds in #monitoring. Latest sampled weekly-backup alert September11 17:27EDT, last-run-failed September11 02:38EDT, model drift September11 18:36EDT. They are still firing in Prometheus September12.

Permanent outbound digest pause activated as `3b66c894e47fec458c36d89a203481bf400ffd7a`; full existing release suite passed and activation capability checks passed. Both live scheduler and installed manifest verify disabled. Existing enabled-job roster tests updated for36→35; unrelated dirty development test files preserved.


## Follow-up: September 12 20:01 EDT Open Agents alert

Read-only investigation of Discord message `1548483725258661980`, runtime logs, code, SSH journals, sysstat, PM2 and real health endpoints:

- At 20:00 EDT the infra-health job's 10-second SSH banner check to db-vps timed out. Server sshd logged the corresponding HQ connection reset at 20:00:31 EDT. Both servers had ample CPU headroom in the surrounding 10-minute sample (HQ 97.64% idle, db-vps 94.68% idle); no same-time reboot or sshd throttling evidence. The daily database backup began 20:01:31 EDT, after the failure, so cannot explain its onset. Tailscale established/changed the direct db-vps endpoint at 20:00:15 EDT, coincident with the probe. A transient connection delay is plausible but exact cause remains unproven. The exact SSH probe subsequently passed on repeated investigation reads, and PostgreSQL accepts connections. No timeout/retry/network setting changed.
- EC4L's warning is cumulative PM2 restart count 14, not current repeated failure. Both VPS hosts rebooted around 06:00 CEST. Tracker startup errors from 06:01:40–47 explicitly report unavailable DB. Postgres became ready at 06:01:47.604 CEST, tracker verified DB at 06:01:47.971 and began listening immediately. Current PID3263 has run continuously since then (~20 hours), unstable_restarts=0, GET localhost:3456/health returns healthy/database connected. The monitor flags every total restart count above 5 without a time window. Recommend recent-restart detection while preserving stopped/errored alerts; do not restart a healthy app or erase history merely to silence it.
- Notification delivery has a separate configuration gap. Active release `3b66c894e47fec458c36d89a203481bf400ffd7a` has no monitoring webhook in its dotenv; ~/.hermes/.env also lacks that key, whereas editable repo dotenv has it. In addition, infra-health's enforced agent_read_only capability excludes DISCORD_MONITORING_WEBHOOK. Changing only the secret source would therefore not fix routing. Actual wrapper audit recorded fallback_requested and Discord message explicitly says manual routing. Recommend restoring the existing router's narrowly scoped webhook access and supported runtime secret injection through the reviewed release path; do not grant broad Discord credentials to all jobs or send a test message without authorization.
- The seven preceding half-hour infra checks recorded only the EC4L warning and kept it local under critical-only notification policy. The SSH timeout elevated the combined report to Discord. Prometheus alerts are separate and were empty during investigation.

No production mutations or outbound messages were performed for this follow-up investigation.


## Approved fixes completed — September 12 20:12 EDT

- Activated reviewed immutable release `ec1fc399827e532ea8984334f6baff1b501a1f4d`, based directly on previous live `3b66c894e47fec458c36d89a203481bf400ffd7a`; unrelated dirty development changes excluded. Source branch `ops/fix-infra-alerts-20260912`, worktree `/tmp/open-agents-fix-infra-alerts-20260912`.
- PM2 historical restart warning now settles after 30 minutes continuous uptime. Existing >5 total restart threshold remains; stopped/errored alerts remain regardless of uptime. This is a stability cutoff, not a newly tracked sliding-window restart count. Regression tests cover cutoff and stopped/errored protection.
- Infra-health alone receives DISCORD_MONITORING_WEBHOOK through per-job allowed_secrets override preserving existing keys. Existing canonical Heaviside Platform Bitwarden webhook installed in ~/.hermes/.env (0600), backup `.env.pre-infra-webhook-20260912`. Read-only Discord webhook metadata verifies channel1475969677976014980/name open-agents-router. No new webhook or token rotation.
- Actual scoped environment + existing router loader verified webhook configured and bot token absent. No synthetic Discord message sent.
- Full standard release verification passed: build, 1856 Python tests, workspace TypeScript tests including PM2 regressions, resolvability, skill checks, sync dry-run. Independent review passed; activation capability measurement passed.
- Existing live wrapper `run-hermes-agent.sh --local-only infra-health` completed exit0 in8.619s, both servers checked, warnings0/critical0, HEARTBEAT_OK. This exercises actual PM2/SSH checks and keeps verification output local.
- Global `sync-hermes.py --verify` reports unrelated existing scheduler/skill drift (older workdirs, deliberate paused jobs). No broad sync performed. Verified live infra-health prompt explicitly invokes `$HOME/.local/share/open-agents/current/scripts/run-hermes-agent.sh`, so subsequent runs use the new release. Existing SSH timeouts/retry settings unchanged.


## Apps backup retirement dependency repair — September 12 21:34 EDT

New Discord message1548500386086654085 was a real apps-vps backup failure, not recurrence of the repaired infra-health warning. Daily job at03:01CEST aborted on required freescout-db; script also still required retired langfuse-postgres-1. Removed exactly those two dump calls in source/live script. All four retained database containers verified running. bash -n and independent review passed; ShellCheck unavailable. Original live script retained as `/usr/local/bin/restic-backup-apps.sh.pre-retirement-fix-20260912`.

Reran the existing full service: four logical dumps, configuration/WordPress archives, checksums, both Restic destinations and existing retention all completed exit0. Stage20260913T013224Z. New heavisidelinux snapshot4fe59c8f and Amazon snapshot81ce0b91 verified from repositories. Recovered SHA256SUMS from Amazon snapshot: lists all four live database dumps and archives. Success metric1, last success1789263255. This is snapshot/manifest recovery evidence, not a full database restore. Reusable retirement-dependency lesson recorded.

Final Prometheus evaluation cleared the apps-vps backup alert; zero firing or pending alerts at verification.
