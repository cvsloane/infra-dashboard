# Backup and model-drift assessment — 2026-09-12

## Verdict

Weekly Restic alert: valid missed server-file backup, caused by a reboot collision. Daily main-cluster PostgreSQL backups remain current and have recent limited restore evidence. Keep the backup alert until a new Restic run completes.

Model-manifest alert: stale monitoring baseline after the documented August18 production cutover. Reconcile the approved deployment record and expected fingerprint; preserve the model and future drift detection.

This assessment made no production configuration changes, ran no backup/retention/prune operation, and interrupted no inference. Remote reads were snapshot metadata/object listing only.

## Weekly Restic backup

- Actual repository latest snapshots: August16 `0ab636e3`, August23 `eca59b8c`, August30 `ea7adfcf`. No completed September6 snapshot.
- Scheduled Sundays03:30 Europe/Berlin plus0–10minutes jitter. September6 started03:38:39 and was killed06:00:01 withSIGTERM during system reboot. Last reboot history and systemd reboot messages corroborate the interruption.
- `/etc/apt/apt.conf.d/52autoreboot` enables automatic security-update reboots at06:00 server time. Backup has an8hour timeout, so its possible execution window overlaps the reboot window. The observed interrupted run lasted2h21m; the prior successful run lasted1h21m.
- This is not evidence of bad repository credentials: read-only `restic snapshots` succeeded.
- Existing includes are `/etc`, `/opt`, `/root`; configured `/var/lib/postgresql` and `/data` do not exist and are skipped. PostgreSQL primary storage is a Docker volume outside those roots, so Restic is not a complete raw database-volume backup. Its `/opt` coverage includes logical dumps and server configuration. Other Docker volumes require their own confirmed backup coverage.
- Reboot reason is consistent with configured unattended-upgrade behavior; direct initiator attribution beyond the system reboot was not established.

Recommended correction: schedule the weekly job after the06:00 reboot window (e.g.07:00 server time), then run the existing backup once and verify the new repository snapshot and success metric. Do not disable security reboots or the backup alert. Reassess broad `/opt` backup contents against migration/rehearsal retention so unused scratch data cannot lengthen backups again. Existing script also prunes remote retention after success; no run/prune was triggered during assessment.

## Current PostgreSQL protection

- September12 snapshot `20260912_020015`:37databases, globals, manifest;19,548,734,577bytes (~18.2GiB). Includes AF, PPC, HOS, HG Websites and Documenso in the main postgres_db cluster.
- Stored status: upload2026-09-12T01:02:39Z, verification01:02:40Z, successful completion01:02:40Z.
- Independently listed the remote R2 snapshot during this assessment:39objects, all expected names match the local manifest. Existing verification checks the object-name list and downloads/compares the manifest; it does not restore every dump or validate all dump contents.
- Actual September10 restore-check logs show remote snapshot `20260910_020139` downloaded into an isolated scratch PostgreSQL container; globals and `agency_financials` restored successfully, verification query counted236tables. Cleanup completed. This is concrete restore evidence for one database from that snapshot, not every database or today's snapshot.
- Existing approved policy: one local logical snapshot; R2 retains7daily/4weekly/3monthly. Earlier WAL/base-backup policy was changed September10 with accepted daily-snapshot recovery tradeoff. Do not re-enable it casually or add storage cost to repair the separate Restic alert.

Practical assessment: the main-cluster database recovery point is current to the latest daily snapshot, not August30. Server-file/offsite Restic coverage is the overdue layer. A whole-host/all-database restore was not performed here.

## Model drift

- Exporter is an exact file-SHA256 check; it does not measure generated answer quality, benchmark regressions, or independently hash weights.
- Expected `59c59eaeda4b7f102c958e54ffa5a094ad16ef08e0d95d4063a4ff91f4890665` matches precisely the preserved pre-cutover `/etc/local-ai/backups/qwen38-cutover-20260818T201300Z/model-manifest.json`.
- That old approved manifest contains local-fast(Qwen3 14B/16K), local-code(Qwen3.5 35B/32K), local-reasoning(Qwen3.5 27B/32K).
- Current manifest SHA256 `4cadd535c2ae2568408e136d282164a147750afcec70f1035ad60c74e1c29cf0`, mtimeAugust18, describes single local-qwen/Qwen3.8 27B AD at128K, llama.cpp b10454. The deployed llama-swap configuration agrees on model artifact, runtime path, context, caches, temperature/seed and MTP settings.
- Canonical `Local LLM Setup - homelinux` documents the intentional August18 single-model production cutover and128K acceptance proofs. The live manifest nevertheless says `status:candidate`, `signed_off_at:null`; editable repository manifest still describes the old three-model setup. Those records and the exporter pin were not reconciled with the accepted cutover.
- Current Caddy, LiteLLM and llama-swap service checks all1; WAN and ACE-Step health all1. No fresh inference benchmark was run. This alert alone is not evidence of a serving failure.

Recommended correction: update the canonical source/live deployment metadata to reflect the documented approved cutover, set the exporter expected digest to that reconciled manifest, restart only the health exporter and verify `local_ai_model_manifest_matches=1` and alert resolution. Preserve the old copies. Do not replace model weights, restart inference or remove the drift rule merely to silence this false positive.

## Alert visibility

Both are generic `Alertmanager incident` embeds in Discord #monitoring:

- Weekly backup: https://discord.com/channels/1458589528334794813/1475969677976014980/1548082528618020905
- Model drift: https://discord.com/channels/1458589528334794813/1475969677976014980/1548100074142179449

Use distinct descriptive alert titles in a later notification clarity change; no message sending or routing changes were made for this assessment.

## Approved corrections — 2026-09-12

Weekly timer changed to Sundays07:00 Europe/Berlin, retaining10minute jitter and Persistent=true. Original unit preserved as `.pre-20260912`. Unit verification passed, timer reloaded, existing Restic backup started23:33:03CEST. Completion details follow.

Model baseline reconciled with approved single-model Qwen3.8 configuration. Live manifest/source and exporter pin now SHA256 `f527b46825babed33fd94c289279de25b1f21d592ba568d6598448eaf450eed3`. Independent review passed, monitoring exporter restarted only, live and scraped manifest metric1. Inference service startup times unchanged.


## Completion — September 12 EDT / September 13 CEST

- Initial backup saved snapshot `e8b8cf0a`: 91,089 files, 54.127 GiB processed, zero read errors, 1h52m54s. Its retention step found a stale September 6 repository lock from the interrupted run.
- Confirmed no Restic process remained and lock-owner PID 3325428 was absent. Inspected full lock record, then used ordinary `restic unlock` (not remove-all); exactly one stale lock removed.
- Reran the existing systemd job, including its existing 7-daily/4-weekly/6-monthly retention. Latest snapshot `541ab5b1` created September 13 01:29:30 CEST. Backup and prune completed; service inactive with Result=success and ExecMainStatus=0. Cleanup reported 21.543 GiB pruned.
- Exporter last_run_success=1, last_success_timestamp_seconds=1789255905. Recovered `/etc/systemd/system/db-vps-restic-backup.timer` directly from latest snapshot with `restic dump`: verified Sunday 07:00 schedule, Persistent=true, 10-minute jitter. Next scheduled run September 13 07:07:46 CEST.
- This proves a new server-file snapshot and small-file recovery, not a full host/database restore. Separate daily PostgreSQL protection remains as assessed above.

- Final Prometheus evaluation: `ResticBackupLastRunFailed`, `ResticWeeklyBackupStale`, and `LocalAIModelManifestDrift` all absent. Separate `LocalAIGPULeaseStaleOwner` remains firing and was not changed in this repair.
