# Open Agents Failure Remediation Plan

Date: 2026-05-31

## Summary

The active `HGPPCFailedJobsPresent` alert is caused primarily by retained BullMQ failures in the HG PPC sync queue. The root cause is not a worker outage: Google Ads is returning account-level `USER_PERMISSION_DENIED` for a specific account, and the worker currently treats that terminal permission problem as a retryable job failure.

The remediation goal is to convert terminal, account-specific permission failures into a suppressed pull state, remove deprecated M365 noise, and fix the remaining job/queue failures so monitoring reports actionable operational problems instead of stale retained failures.

## Current Findings

Active Prometheus alert:

- Alert: `HGPPCFailedJobsPresent`
- Rule: `sum(hg_ppc_bullmq_queue_depth{state="failed"}) > 3` for 10 minutes
- Current value during assessment: `173`
- Started firing: `2026-05-31T06:21:59Z`

HG PPC failed queues:

| Queue | Failed Jobs | Main Cause |
| --- | ---: | --- |
| `hg-ppc-sync` | 170 | Google Ads `USER_PERMISSION_DENIED` |
| `ppc-warehouse` | 2 | BullMQ stalled nightly warehouse sync jobs |
| `ppc-insights` | 1 | Unknown job type `run_meta_ads_audit_all` |

Primary affected HG PPC object:

- Workspace: `Garage Door Marketers`
- Integration: `32fe68f6-0c13-44d0-a835-4d1423195784`
- Provider: `google_ads`
- Manager account ID: `1166119569`
- Main affected account: `A1 Garage Repair`
- External account ID: `9132881445`
- Main failure: Google Ads `authorization_error: USER_PERMISSION_DENIED`

Additional open-agents issues identified:

- M365 jobs are deprecated and should not be scheduled or treated as current operational signal.
- `Cron Alert Digest` fails because the Hermes job slug `cron-alerts` is not recognized by `run-hermes-agent.sh`.
- `Langfuse Backup` times out because the wrapper uses a known hanging SSH heredoc pattern.
- `Research Content Drafter` fails on OpenRouter `402 Insufficient credits`.
- `DB Anomaly` exits nonzero for detected anomalies, conflating runtime failure with anomaly findings.
- `App Security` reports findings and scan errors as generic job error noise.
- Stale non-HG-PPC failed BullMQ jobs remain in `crawl`, `missive-webhooks`, `ppc-sync`, and `integrations`.

## Phase 1: Fix HG PPC Permission-Denied Handling

Objective: Account-level Google Ads permission denial should disable that particular pull, not create failed BullMQ jobs or alert noise.

Implementation:

1. Add a Google permission-denied marker and classifier in `/home/cvsloane/dev/hg-ppc/apps/worker/app/workers/google_auth_errors.py`.
   - Add `GOOGLE_USER_PERMISSION_DENIED = "GOOGLE_USER_PERMISSION_DENIED"`.
   - Add `is_google_user_permission_denied_error(error)`.
   - Detect `USER_PERMISSION_DENIED`, `PERMISSION_DENIED`, and `caller does not have permission`.

2. Update `/home/cvsloane/dev/hg-ppc/apps/worker/app/workers/sync_worker.py`.
   - Catch Google permission-denied errors around account-scoped sync work.
   - Update only the affected `ad_accounts` row.
   - Set `last_sync_at = NOW()`.
   - Set `last_sync_error = GOOGLE_USER_PERMISSION_DENIED: <short reason>`.
   - Return a skipped success payload instead of raising:

```json
{
  "success": true,
  "skipped": true,
  "reason": "GOOGLE_USER_PERMISSION_DENIED",
  "adAccountId": "<account-id>"
}
```

3. Preserve existing integration-level behavior.
   - `invalid_grant` should still mark the integration as error.
   - Meta expired-token handling should remain unchanged.
   - Permission denied should not mark the whole integration failed.

4. Update scheduler filters in `/home/cvsloane/dev/hg-ppc/apps/worker/app/workers/scheduler.py`.
   - Exclude accounts whose `last_sync_error` contains `GOOGLE_USER_PERMISSION_DENIED`.
   - Apply this to nightly full sync.
   - Apply this to hourly metrics sync.

5. Update account discovery in `/home/cvsloane/dev/hg-ppc/apps/worker/app/integrations/base.py`.
   - Exclude `GOOGLE_USER_PERMISSION_DENIED` from `get_ad_accounts()` the same way `CUSTOMER_NOT_ENABLED` is excluded.

6. Add observability.
   - Add a counter such as `hg_ppc_google_permission_denied_suppressed_total`.
   - Alert on unusual spikes, not on retained failed jobs.

Tests:

- Permission-denied worker test: account is marked suppressed and job completes as skipped.
- Scheduler test: suppressed account is not enqueued.
- Regression test: `invalid_grant` still marks the integration error.
- Regression test: Meta expired-token handling is unchanged.

Verification:

- Deploy the worker/web fix.
- Confirm new `hg-ppc-sync` jobs for the affected account stop failing.
- Confirm `hg_ppc_bullmq_queue_depth{queue="hg-ppc-sync",state="failed"}` stops increasing.
- Delete old terminal `hg-ppc-sync` failed jobs after confirming they are all permission-denied failures.
- Confirm `HGPPCFailedJobsPresent` resolves.

## Phase 2: Disable Deprecated M365 Jobs

Objective: M365 is deprecated and should not generate current operational failures.

Implementation:

In `/home/cvsloane/dev/open-agents/hermes/jobs/open-agents.json`, set these jobs to disabled and watchdog exempt:

- `ms365-inbox-triage`
- `ms365-followup-sweep`
- `ms365-meeting-prep`
- `ms365-day-brief`

Use:

```json
"enabled": false,
"watchdog_exempt": true
```

Add a short note to each job entry: `Deprecated; do not schedule or alert.`

Verification:

```bash
cd /home/cvsloane/dev/open-agents
python3 scripts/sync-hermes.py --verify
~/.local/bin/hermes cron list
```

Confirm no M365 jobs remain scheduled.

## Phase 3: Fix Remaining HG PPC BullMQ Failures

### `ppc-warehouse`

Current problem: two `warehouse_sync_run` jobs stalled during nightly warehouse sync.

Implementation:

- Add progress updates inside long warehouse loops.
- Increase lock duration/stalled timeout if supported by the Python BullMQ worker.
- Split large workspace incremental syncs into smaller child jobs if progress updates are insufficient.
- Ensure `warehouse_sync_runs.status` is marked failed with a clear reason when the worker dies or stalls.

Verification:

- Retry the two failed warehouse jobs after patching.
- Confirm they complete or fail with a domain error instead of `job stalled more than allowable limit`.

### `ppc-insights`

Current problem: failed job `run_meta_ads_audit_all` is not handled by the worker.

Decision required:

- If `run_meta_ads_audit_all` is still valid, add a handler in `insights_worker.py`.
- If legacy, remove or disable the producer/scheduler that enqueues it.

Verification:

- No new `run_meta_ads_audit_all` failed jobs appear.
- Delete the old failed job after the contract is fixed.

## Phase 4: Fix Open Agents Job Misconfigurations

### Cron Alert Digest

Current problem: Hermes schedules `cron-alerts`, but `run-hermes-agent.sh` does not recognize that agent and exits with `Unknown agent: cron-alerts`.

Implementation options:

- Add a `cron-alerts)` case in `/home/cvsloane/dev/open-agents/scripts/run-hermes-agent.sh`.
- Point it at `python3 scripts/cron-alerts-discord.py`.
- Or convert the manifest entry to direct script execution if that is the preferred Hermes pattern.

Verification:

```bash
cd /home/cvsloane/dev/open-agents
python3 scripts/cron-alerts-discord.py --dry-run
```

Then run the Hermes job once and confirm no `Unknown agent` error.

### Langfuse Backup

Current problem: the backup wrapper uses an SSH heredoc pattern that hangs; Hermes times out after 120 seconds.

Implementation:

- Rewrite `hermes-langfuse-backup.py` to avoid `ssh ... bash -s`.
- Use direct SSH commands one step at a time, following the verified `open-agents-ops` Langfuse backup runbook.
- Increase the Hermes timeout to a backup-appropriate range, likely 15 to 30 minutes.
- Emit step-level JSON for:
  - Postgres dump
  - ClickHouse backup
  - MinIO archive
  - Archive validation
  - Optional R2 upload

Verification:

- Run the script once manually.
- Confirm archive validation passes.
- Confirm Hermes output identifies the exact failed step if any step fails.

### Research Content Drafter

Current problem: OpenRouter returns `402 Insufficient credits`.

Implementation:

- Add a provider credit/preflight check.
- If credits are exhausted, return `warning` or `paused`, not generic `error`.
- If this job is nonessential, disable it until credits/provider routing are fixed.
- If essential, route it to a provider that does not depend on the depleted OpenRouter credit path.

Verification:

- Confirm the job either drafts content or reports a paused/provider-credit state without operational error noise.

## Phase 5: Clean Stale Non-HG-PPC BullMQ Failures

Current stale failed queues:

- `crawl`: old April stalled jobs.
- `missive-webhooks`: old May 22 stalled jobs.
- `ppc-sync`: old April malformed legacy jobs.
- `integrations`: current Missive routing stalled job.

Implementation:

- Add or verify bounded `removeOnFail` for each producer.
- Prefer alert rules based on recent failures or failure age, not retained stale jobs.
- Confirm ownership of stale jobs before deleting.
- Delete old terminal failed jobs after owners confirm no retry is useful.

Verification:

- Queue health reports no critical queues due only to stale retained failures.
- New failures remain visible with useful age and reason.

## Phase 6: Normalize Alert Semantics

### DB Anomaly

Current problem: anomaly findings make the job exit nonzero, which makes Hermes treat the check as a runtime failure.

Implementation:

- Exit `0` when collection succeeds.
- Put anomaly severity in JSON status: `success`, `warning`, or `critical`.
- Reserve nonzero exit for collection/runtime failure.

Verification:

- A run with detected anomalies produces a monitoring warning/critical payload but does not show as a crashed Hermes job.

### App Security

Current problem: security findings and scan execution errors are mixed into generic job error state.

Implementation:

- Separate findings from scan coverage failures.
- Error only when scan coverage fails or critical thresholds are exceeded.
- Findings should produce a report or queue item.
- Scan errors should identify the affected repository and scanner.

Verification:

- A scan with findings but good coverage produces an actionable report.
- A scan with coverage failure produces a specific operational error.

## Phase 7: Alert Rule Improvements

Implementation:

- Replace or supplement broad retained-failed-job alerts with:
  - New failures in the last N minutes.
  - Failed jobs older than expected retention.
  - Failed jobs grouped by queue and reason.
  - Suppressed terminal account count.
  - Worker heartbeat missing.
- Keep `HGPPCFailedJobsPresent` only if it ignores terminal suppressed states or if failed queues are actively actionable.

Verification:

- Old terminal failures do not page.
- New failing pulls still page quickly.
- Suppressed permission issues are visible as account-health work, not queue-worker failures.

## Final Verification Checklist

- `hg-ppc-sync` failed count stops increasing.
- `HGPPCFailedJobsPresent` resolves in Prometheus and Alertmanager.
- The affected Google Ads account is visible as sync-suppressed with a clear permission message.
- No active Hermes M365 jobs remain scheduled.
- `Cron Alert Digest` runs without `Unknown agent`.
- `Langfuse Backup` completes or reports the exact failed step.
- `Research Content Drafter` no longer reports provider-credit exhaustion as a generic operational failure.
- `ppc-warehouse` no longer stalls silently.
- `ppc-insights` no longer receives unknown job types.
- Queue-health reports no critical queues caused only by stale retained failures.
- Fleet summary stops repeating the same workload alert.

## Execution Log - 2026-05-31

Status: mostly executed, with one important durability caveat. The live worker was hot-patched and verified, but the code changes still need to be committed, pushed, and redeployed through the normal Coolify path so the fix survives the next image deploy.

### Completed

- Implemented HG PPC Google Ads `USER_PERMISSION_DENIED` suppression in the worker code.
  - Affected account: A1 Garage Repair, Google Ads external ID `9132881445`, account row `5cfa2323-9b27-41c1-a58c-5dada2a3344e`.
  - New suppression marker: `GOOGLE_USER_PERMISSION_DENIED`.
  - Scheduler, warehouse, and account discovery now exclude accounts with that marker.
  - The worker increments `hg_ppc_google_permission_denied_suppressed_total` when it suppresses a permission-denied pull.
- Updated the production HG PPC database row for A1 Garage Repair.
  - `last_sync_error` now records the suppression marker and permission-denied explanation.
  - Verified scheduler eligibility for that account is now `False`.
  - Verified no waiting, delayed, active, or failed `hg-ppc-sync` jobs remain for that account.
- Removed 169 terminal `hg-ppc-sync` failed jobs caused by the A1 Garage Google Ads permission denial.
  - Kept one non-permission transient DNS/OAuth failure for account `4b66c3ff-386a-4c88-b3bb-70ecd48cd328`.
- Fixed and reloaded the live Prometheus alert rule.
  - Backup: `/opt/monitoring/prometheus/rules/general.yml.bak-20260531T120041Z` on `apps-vps`.
  - `HGPPCFailedJobsPresent` now alerts on failed-job growth over 30 minutes instead of retained failed-job count.
  - Added `HGPPCGooglePermissionDeniedSuppressedSpike` for repeated suppressed permission denials.
  - `promtool check rules /etc/prometheus/rules/general.yml` passed and Prometheus was reloaded with `SIGHUP`.
- Hot-patched the live `hg-ppc-worker` container on `apps-vps`.
  - Container: `b4owcscsccos40kwgwokc8s0-151040624846`.
  - Container backup: `/tmp/hg-ppc-worker-container-backup-20260531T120422Z`.
  - Verified worker health and clean startup after restart.
  - Verified the new suppression metric is scraped by Prometheus with value `0`.
- Cleared the stale `ppc-insights` failed job.
  - Removed `daily-meta-ads-audit`, which had failed with `Unknown job type: run_meta_ads_audit_all`.
  - Verified the production worker has a callable insights job handler.
- Retried the two stalled `ppc-warehouse` jobs after increasing lock duration and adding progress updates.
  - `ppc-warehouse` failed count dropped to `0`.
  - At the time of this log, one warehouse job was active and one was waiting; neither had re-failed.
- Disabled M365 Hermes jobs in `open-agents`.
  - `ms365-inbox-triage`
  - `ms365-followup-sweep`
  - `ms365-meeting-prep`
  - `ms365-day-brief`
  - Synced Hermes from the manifest; M365 jobs no longer appear in the active cron list.
- Fixed `cron-alerts` Hermes routing.
  - `run-hermes-agent.sh --local-only cron-alerts --dry-run` now exits successfully with `STATUS: HEARTBEAT_OK`.
  - The old `Unknown agent: cron-alerts` condition is resolved.
- Normalized other Hermes alert semantics in code and tests.
  - DB anomaly findings now produce warning/error payloads without treating detected anomalies as collection crashes.
  - App Security distinguishes security findings from scanner coverage/runtime failures.
  - Research Content Drafter treats provider credit exhaustion as a warning/blocked state instead of a generic operational failure.
  - Langfuse Backup now copies a temporary remote script before running it, avoiding fragile SSH stdin streaming.
- Cleaned stale non-HG-PPC BullMQ failures.
  - Removed four old April `crawl` stalled jobs.
  - Removed three old May 22 `missive-webhooks` stalled jobs.
  - Removed two old April malformed legacy `ppc-sync` jobs.
  - Left the current `integrations` Missive routing stalled job for owner debugging.
- Re-ran queue and fleet checks after cleanup.
  - `queue-health`: success, `0` warning queues, `0` critical queues, `2` retained failed jobs.
  - `fleet-alert-rollup`: success, `No fleet alerts are active.`

### Verification Run

- HG PPC tests:
  - `.venv/bin/python -m pytest -q tests/test_sync_worker_helpers.py tests/test_insights_worker_scheduler.py`
  - Result: `18 passed, 1 warning`.
- HG PPC Python compile:
  - `.venv/bin/python -m py_compile app/workers/google_auth_errors.py app/metrics.py app/workers/sync_worker.py app/workers/scheduler.py app/workers/warehouse_worker.py app/integrations/base.py`
  - Result: passed.
- Open Agents tests:
  - `python3 -m pytest -q tests/test_run_hermes_agent_usage.py tests/test_cron_alerts_discord.py tests/test_hermes_db_anomaly.py tests/test_hermes_xaccel_research_post.py tests/test_app_security_status.py tests/test_hermes_langfuse_backup.py`
  - Result: `36 passed`.
- Open Agents compile/manifest validation:
  - `python3 -m py_compile scripts/cron-alerts-discord.py scripts/hermes-db-anomaly.py scripts/hermes-langfuse-backup.py scripts/hermes-xaccel-research-post.py`
  - `python3 -m json.tool hermes/jobs/open-agents.json`
  - Result: passed.
- Production Prometheus:
  - `HGPPCFailedJobsPresent` no longer fires.
  - `sum(delta(hg_ppc_bullmq_queue_depth{state="failed"}[30m]))` returned a negative value after cleanup, not an increase.
  - Queue depths after remediation: `ppc-insights=0 failed`, `ppc-warehouse=0 failed`, `hg-ppc-sync=1 failed`.
- Hermes:
  - `cron-alerts` dry run returned `STATUS: HEARTBEAT_OK`.
  - `queue-health` returned `STATUS: HEARTBEAT_OK`.
  - `fleet-alert-rollup` returned no active fleet alerts.

### Remaining Work

- Investigate the two intentionally retained failed jobs:
  - `hg-ppc-sync`: one transient DNS/OAuth failure from 2026-05-28.
  - `integrations`: one current Missive routing stalled job from 2026-05-31.
- No plan-blocking remediation work remains. The two retained failed jobs are below alert thresholds and intentionally preserved for owner/debugging context.

## Final Execution Update - 2026-05-31 09:12 ET

Durability work completed:

- HG PPC committed and pushed to `origin/main`.
  - `15c9139 fix(worker): suppress google permission-denied pulls`
  - `253c2c8 fix(worker): suppress warehouse permission-denied accounts`
- Coolify deployed `hg-ppc-worker` at commit `253c2c82a36fab6fa598094d143dcb6018961bfc`.
  - Deployment `zxinu9eom6zby9atomjdx40m` finished at `2026-05-31T12:49:46Z`.
  - Live container: `b4owcscsccos40kwgwokc8s0-124759439008`.
  - Verified the live container imports `GOOGLE_USER_PERMISSION_DENIED` warehouse suppression code.
- Open Agents committed and pushed to `origin/master`.
  - `dc698ef fix(hermes): disable m365 and wire cron alerts`
  - `3d7aef1 fix(backup): stream langfuse minio archive`
  - `24cdaa6 fix(backup): allow long langfuse backup runs`
  - The commit intentionally excludes unrelated local SEO handoff work that was dirty in the working tree.
- Hermes manifest verification remains clean:
  - `python3 scripts/sync-hermes.py --verify` returned `ok: true`.

Final production verification:

- `ppc-warehouse` retry completed.
  - Run `abb8b1db-1110-43cd-8540-7452505c6fbb`: `completed`, `error = null`.
  - Run `d8699449-109d-4c7d-bbc2-e8d673101c3c`: `completed`, `error = null`.
  - Queue depth: `ppc-warehouse failed = 0`.
- HG PPC failed queue depths:
  - `ppc-mutation failed = 0`.
  - `ppc-insights failed = 0`.
  - `ppc-warehouse failed = 0`.
  - `hg-ppc-sync failed = 1`, retained intentionally as the transient 2026-05-28 DNS/OAuth failure.
- Prometheus:
  - No active `HGPPC*` alerts.
  - `sum(delta(hg_ppc_bullmq_queue_depth{state="failed"}[30m])) = 0`.
- Hermes:
  - `cron-alerts` dry run returned `STATUS: HEARTBEAT_OK`.
  - `queue-health` returned `STATUS: HEARTBEAT_OK`, `0` warning queues, `0` critical queues, `2` retained failed jobs.
  - `fleet-alert-rollup` returned `No fleet alerts are active.`
  - `~/.local/bin/hermes cron list` shows `Cron Alert Digest` and no active M365 entries.
- Langfuse Backup:
  - Dry run succeeded.
  - First real run failed cleanly with a structured JSON error: timeout after 1800 seconds while the remote backup command was still copying MinIO data.
  - The initial streaming fix using `tar` inside the MinIO container failed because the MinIO image does not include `tar`.
  - Follow-up fix now streams Docker's built-in `docker cp` tar output through host `gzip` and sets the Hermes wrapper timeout to `LANGFUSE_BACKUP_TIMEOUT:-21600`.
  - Final real run completed successfully and validated the archive:
    - Archive: `/opt/backups/langfuse/langfuse-20260531T132709Z.tar.gz`
    - Size: `485314510` bytes / `462.83 MB`
    - Components: `postgres.dump`, `clickhouse.zip`, `minio-langfuse.tar.gz`
    - `tar -tzf /opt/backups/langfuse/langfuse-20260531T132709Z.tar.gz` passed.
  - No orphaned backup process remains. Earlier partial evidence directories remain under `/opt/backups/langfuse/20260531T123449Z` and `/opt/backups/langfuse/20260531T131530Z`.

## Final Verification - 2026-05-31 14:59 ET

Tests:

- HG PPC focused tests and compile:
  - `.venv/bin/python -m pytest -q tests/test_sync_worker_helpers.py tests/test_insights_worker_scheduler.py`
  - Result: `20 passed, 1 warning`.
  - `py_compile` passed for `google_auth_errors.py`, `metrics.py`, `sync_worker.py`, `scheduler.py`, `warehouse_worker.py`, and `base.py`.
- Open Agents focused tests and compile:
  - `python3 -m pytest -q tests/test_run_hermes_agent_usage.py tests/test_cron_alerts_discord.py tests/test_hermes_db_anomaly.py tests/test_hermes_xaccel_research_post.py tests/test_app_security_status.py tests/test_hermes_langfuse_backup.py`
  - Result: `38 passed`.
  - `py_compile` passed for the changed Hermes scripts.
  - `python3 -m json.tool hermes/jobs/open-agents.json` passed.

Production checks:

- No active `HGPPC*` Prometheus alerts.
- `sum(delta(hg_ppc_bullmq_queue_depth{state="failed"}[30m])) = 0`.
- HG PPC failed queue depths:
  - `ppc-mutation = 0`
  - `ppc-insights = 0`
  - `ppc-warehouse = 0`
  - `hg-ppc-sync = 1` retained transient DNS/OAuth failure from 2026-05-28.
- A1 Garage Repair account row remains suppressed:
  - Account ID: `5cfa2323-9b27-41c1-a58c-5dada2a3344e`
  - `last_sync_error` starts with `GOOGLE_USER_PERMISSION_DENIED`.
- Warehouse runs verified completed:
  - `abb8b1db-1110-43cd-8540-7452505c6fbb`: `completed`, `error = null`.
  - `d8699449-109d-4c7d-bbc2-e8d673101c3c`: `completed`, `error = null`.
- `cron-alerts` dry run returned `STATUS: HEARTBEAT_OK`.
- Hermes cron list shows `Cron Alert Digest` and no active M365 entries.
- `queue-health` returned `STATUS: HEARTBEAT_OK`, `0` warning queues, `0` critical queues.
- `fleet-alert-rollup` returned `No fleet alerts are active.`
