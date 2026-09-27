# db-vps backup / receiving-host maintenance repair — 2026-09-13

Status: completed and verified. Full existing backup and retention rerun completed successfully at 08:40:51 EDT (14:40:51 Europe/Berlin). No receiver update or Tailscale restart performed.

## Confirmed cause

The scheduled db-vps backup began September 13 at 07:04:18 Europe/Berlin (01:04:18 EDT). HeavisideLinux's `auto-update.timer` runs Sunday 01:00 local America/New_York plus up to 30 minutes jitter. Its package-upgrade service ran 01:22:02–01:34:50 EDT; the Tailscale package restart interrupted the live SFTP connection at 01:25:28 EDT. Restic could not save a snapshot and exited 1. This was a receiving-host maintenance collision, not the previous source-host 06:00 reboot collision.

The receiver's weekly updater performs apt upgrade/dist-upgrade; its daily unattended upgrades permit Ubuntu/security origins, excluding the Tailscale third-party origin. Both update services have infinite start timeout. Recent weekly upgrade durations were 1m30, 3m03, and 12m48.

## Installed scheduling correction

Moved source `db-vps-restic-backup.timer` from Sunday 07:00 to Sunday 19:00 Europe/Berlin, retaining persistent scheduling and 10 minute jitter. Leave receiver updates unchanged. This puts the backup at 13:00 New York normally, 12:00 during Europe/US DST mismatch: at least 10.5 hours after the receiver's latest normal weekly maintenance start, and after its daily 06:00–07:00 unattended-upgrade window. Source reboot remains at 06:00. The backup's existing eight-hour limit ends before the receiver's daily 02:00 backup.

This removes the known deterministic schedule collision. Persistent catch-up, manual runs, or exceptionally long maintenance can still overlap; it does not implement distributed mutual exclusion.

Receiver noon rescheduling was initially reviewed, but root SSH and passwordless sudo are unavailable there. No privilege bypass attempted. Adjusting the source's existing timer addresses the same cause with established authorized access.

## Recovery execution

- Confirmed no active Restic process on db-vps.
- Repository lock `9d37802d2ff0b3fabcd9681d2261abfba72878a53bfa0b936d262bc637e6db6b` belonged to the failed run: PID 492797, timestamp 07:24:21 Europe/Berlin, hostname vmi2869169. `/proc/492797` absent.
- Supported `restic unlock` (without `--remove-all`) removed exactly one stale lock; subsequent lock listing empty.
- Started the existing service with `systemctl start --no-block db-vps-restic-backup.service` at 13:33:48 Europe/Berlin. Existing backup roots, excludes, and daily7/weekly4/monthly6 retention unchanged.
- Final service state: inactive/dead, Result=success, ExecMainStatus=0, exited 14:40:51 Europe/Berlin. Backup processed 91,093 files / 55.947 GiB in 1:06:07 with zero reported read errors, adding 7.957 GiB (7.865 GiB stored).

Independent review found no blocking findings. Installed reviewed timer root:root 0644; systemd-analyze verify passed, daemon reloaded, timer restarted. Backup service was not restarted by the timer change. Original timer: `/etc/systemd/system/db-vps-restic-backup.timer.pre-maintenance-20260913`; rollback by restoring that file, daemon-reload, and restarting only the timer.

## Final proof

- New repository snapshot: `69a3c09bec94807ad13e593b00fa2bafbaa3bb355a235d8e16a6067c928df265` (`69a3c09b`), started 2026-09-13T13:33:48.907658308+02:00, hostname vmi2869169, paths `/etc`, `/opt`, `/root`.
- Existing retention completed, removing one superseded same-day snapshot and pruning 23.317 MiB; final script exit 0. No backup roots or retention policy changed.
- Real recovery read: `restic dump 69a3c09b /etc/systemd/system/db-vps-restic-backup.service | sha256sum` matched the live service file SHA-256 `59975cfd37ffb6ecd3609307f273fb00373650b60cbc5649e60f171bb38318f2`. This proves recovery of that file, not a full database restore.
- Node-exporter textfile: `heaviside_restic_backup_last_run_success{backup_job="db-vps-restic",host="db-vps"}=1`; last-run and last-success timestamps both `1789303251` (2026-09-13 08:40:51 EDT).
- Central Prometheus `/api/v1/alerts` returned an empty list after completion: no firing or pending alerts at that verification point. This is Prometheus only, not every independent Discord producer.
- Installed timer verified `OnCalendar=Sun *-*-* 19:00:00`, enabled/active, next scheduled run today 19:00:35 Europe/Berlin. Ten-minute jitter and persistent behavior preserved.

The recovery run began before the schedule change, so the readback deliberately uses the unchanged service file; the active timer was verified directly through systemd. Receiving-host maintenance and security updates remain untouched. No commits made.
