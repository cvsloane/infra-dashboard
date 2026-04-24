# Lessons

## Routing

- SloaneVault remains the canonical infrastructure knowledge base. Use `/home/cvsloane/SloaneVault/tasks/lessons.md`, `tasks/decisions.jsonl`, and the VPS infrastructure runbooks for service facts, cutover decisions, DNS, secrets policy, and incident history.
- Keep infra-dashboard lessons focused on product/code behavior: collector assumptions, health-check semantics, alert thresholds, service inventory modeling, display copy that can mislead operators, and deployment quirks specific to this dashboard.
- When a SloaneVault infrastructure lesson changes what the dashboard should collect or display, mirror only that dashboard-relevant rule here and link back to the vault source instead of copying the full runbook.

## 2026-04-22
- Mirror infrastructure lessons into this repo only when they affect dashboard behavior. Example: "Coolify env rows can drift from generated app env and running container env" is canonical in SloaneVault, but infra-dashboard should encode the dashboard-specific consequence: collectors and health UI must distinguish stored config, generated `.env`, and runtime container state instead of displaying one layer as proof of rollout.
- Rocket.Chat UI lessons stay canonical in SloaneVault, but dashboard checks should model surface-specific verification when implemented. Web custom-script health, authenticated HTTPS GUI health, mobile-visible room/topic/message state, and backup/storage health are different signals and should not collapse into one generic "Rocket.Chat OK" badge.
- For service inventory, prefer backlinks to SloaneVault runbooks over duplicating ownership facts here. If a dashboard fixture needs a service host, port, or health route, include the minimal test fixture and cite the canonical vault note in the implementation or task artifact.

## 2026-04-24
- Do not treat aggregate Hermes fleet health or `/api/health` as proof that all dashboard-backed remediation paths are healthy. When the dashboard shows something down, inspect the specific source behind the issue row: AutoHEAL heartbeat/status, worker supervisor, Alertmanager, site health, Postgres/PgBouncer container probes, and the relevant host service logs.
- AutoHEAL health depends on three separate runtime facts: the systemd timer/service, the Coolify API URL/token, and Redis heartbeat writes. A worker can exit successfully after fixing the Coolify URL while still failing to update dashboard-visible state if Redis credentials or the deployed worker script are stale.
- Site health intentionally reads Coolify DB rows with non-empty FQDNs, so retired or internal-only Coolify applications can show as "down" even when no public app should be restored. Before restarting anything, check the app row `status`, DNS resolution, and whether a container exists; stale apps should be excluded or retired rather than auto-redeployed.
- Worker health has two separate dashboard counters: BullMQ queues without `stalled-check` heartbeats and the host worker-supervisor status key. Debug both sources separately before saying workers are down, and keep the supervisor script tolerant of PM2 non-JSON startup output so one bad collector does not erase the whole status report.

## 2026-02-09
- When a deploy log shows "GitHub API call failed: This endpoint is temporarily being throttled" while `X-RateLimit-Remaining` is high, treat it as a GitHub secondary/abuse throttle, not core rate-limit exhaustion.
- Make it explicit that GitHub REST API throttling can happen independently of `git clone/ls-remote` succeeding, so "other apps deploying" does not disprove the cause.
- When debugging Coolify deploy failures, distinguish REST calls (Coolify `githubApi(...)`) from git operations; if possible, point to the exact stack trace line so the explanation is falsifiable.

## 2026-03-28
- When implementing tracked GitHub issues in this repo, treat issue closure as a separate follow-through step after verification; do not stop at local code changes if the user expects the GitHub issue state updated too.

## 2026-04-09
- For cross-host Coolify builds, a successful remote build on the build server is not enough; if rollout happens on a different host, plan the image transport path explicitly and validate registry push/pull credentials before treating the deploy path as complete.
- When onboarding a remote Coolify build server that connects as `root`, ensure `/root/.docker/config.json` exists on that host before testing build-server bootstrap behavior.
- When a build/deploy issue first shows up on one app, confirm whether the intended fix is app-specific or a new platform default; for Coolify build-server work here, treat `homelinux` as shared infrastructure for all apps unless the user explicitly scopes it narrower.
- In the current Coolify version here, multiple reachable build servers are load-balanced with `random()`, not primary/backup ordered. To make one server primary and the deployment host the backup, keep only the intended primary in the build-server pool and rely on the deployment server fallback when no build server is available.
- Coolify `dockercompose` applications do not go through the same build-server image push/pull path as `dockerfile` and `nixpacks` applications in this version. Validate compose behavior separately before claiming fleet-wide build-server coverage.
- Do not assume a staging app is an acceptable validation target for platform changes. Confirm whether the intended production policy is `production-only` first; if staging should be retired, validate against production configuration without keeping a live staging app around.
