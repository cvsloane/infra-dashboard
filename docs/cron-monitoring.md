# Cron Job Monitoring

Unified visibility into every scheduled job across the fleet — Hermes-managed jobs, raw user/system crontabs, and systemd timers.

## Why a separate page?

The Hermes sidecar already covers ~65 LLM-driven jobs at `/hermes`. Outside Hermes, the fleet runs another ~35+ scheduled tasks (user crontabs, `cron.d`, systemd timers, anacron) that have no observability surface. The `/crons` page covers everything.

## Data sources

| Source            | Discovered by                                 | Notes                                                |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| User crontab      | `crontab -l`                                  | Per-user; collector runs as the cron owner          |
| System crontab    | `/etc/crontab`, `/etc/cron.d/*`               | Captures schedule + user fields                      |
| Run-parts         | `/etc/cron.{hourly,daily,weekly,monthly}/`    | Each script is a job; schedule from parent dir       |
| Systemd timers    | `systemctl list-timers --all --no-pager`      | NextElapse + LastTrigger from `systemctl show`      |
| Anacron           | `/etc/anacrontab`                             | Period + delay parsed                                |
| Hermes-managed    | Pass-through from `/fleet/jobs` sidecar       | Already covered by `/hermes` — surfaced here for unification |

## Storage (Redis)

Mirrors the existing `agent:*` pattern from `shared/src/agent-store.ts`:

| Key                                      | Type   | Purpose                                    |
| ---------------------------------------- | ------ | ------------------------------------------ |
| `cron:hosts`                             | SET    | Set of host IDs reporting cron data        |
| `cron:jobs:<host>`                       | SET    | Set of job IDs on a given host             |
| `cron:job:<host>:<jobId>`                | STRING | Inventory record (JSON)                    |
| `cron:run:<host>:<jobId>:<runId>`        | STRING | Run record (JSON), 30-day TTL              |
| `cron:history:<host>:<jobId>`            | LIST   | Run IDs (LPUSH new, capped at 200)         |

## Retention

- Run records: 30-day Redis TTL.
- History list: capped at 200 entries via `LTRIM` after each push.
- Inventory records: rewritten on every collector run; jobs no longer present get a `last_seen_at` and after 14 days are removed.

## Inventory enrichment

Curated metadata (descriptions, owners, runbook URLs, severity-if-missing) lives in `config/cron-inventory.json` in this repo. The reader merges enrichment into discovered records by matching schedule + command substring.

## Collector

`@open-agents/cron-collector` (in `/home/cvsloane/dev/open-agents/agents/cron-collector/`). Deterministic — no LLM. Run from cron or a Hermes job, every 5 minutes per host. Writes directly to the shared Redis instance via `cron-store.ts` in the shared package.

## Deployment

The collector lives in `open-agents/agents/cron-collector/`. Build and run from the
`open-agents` workspace root:

```bash
cd ~/dev/open-agents
npm run build -w @open-agents/cron-collector

# One-shot dry run (does not write to Redis):
node agents/cron-collector/dist/index.js --dry-run
```

To install the every-5-minutes cron entry:

```bash
bash ~/dev/open-agents/agents/cron-collector/install.sh
```

The installer is idempotent and tags its line with `# cron-collector (open-agents)`
so it can be re-run safely. Uninstall with `--uninstall`.

For remote hosts (apps-vps, homelinux, db-vps), publish the same script and run
it from the host's own cron or a Hermes fleet manifest entry. Each host writes
to the shared Redis instance, scoped by `host` field — there is no central
coordination required.

## Stale-run alerting

Each job's "stale" threshold is computed from its schedule cadence (see
`src/lib/crons/cadence.ts`):

- `*/5 * * * *` → 30 minutes (cadence × 4, with a 30-minute floor)
- `@hourly` → 4 hours
- `@daily` (or `0 3 * * *`) → 4 days
- `@weekly` → 14-day cap (also the upper bound for any schedule)
- Unknowable → 7-day flat default

`GET /api/crons/alerts` returns just the alerting subset, filtered by
`min_severity` and an optional `include_unknown=true` flag. A future Hermes job
or Discord webhook can poll this endpoint to ship alerts off the dashboard.

## Hermes pass-through

The `/api/crons` endpoint also fetches the Hermes sidecar's `/fleet/summary`
and merges those jobs into the same response, mapped through
`src/lib/crons/hermes-passthrough.ts`. Hermes rows in the table deep-link to
`/hermes/jobs/[id]` rather than `/crons/[host]/[jobId]`, since the rich detail
already lives at `/hermes`. If the sidecar is unavailable the page renders the
raw cron data plus a yellow banner.

## Management actions

Read-only:
- `GET /api/crons/[host]/[jobId]/log?bytes=65536` — last N bytes of the job's
  log file (when one is configured). No env flag required.

Write actions, all gated by `CRON_MANAGEMENT_ACTIONS=true` and only act on the
local host:
- `POST /api/crons/[host]/[jobId]/actions` body `{"action":"run-now"}` —
  triggers the timer's underlying service via `systemctl start <unit>`. Only
  supported for `systemd-timer` sources; arbitrary user-crontab `/bin/sh -c`
  execution is intentionally not exposed.
- `POST .../actions` body `{"action":"pause"}` / `{"action":"enable"}` —
  comments / uncomments a user-crontab line in place by prefixing with
  `# [cron-monitor:paused] `. Idempotent.

Every attempted action (allowed or denied) is appended to
`~/.hermes/cron-management-actions.jsonl` for audit. The detail-page UI
exposes these as buttons but disables them when the source isn't supported.

## Deployment

The collector lives in `open-agents/agents/cron-collector/`. Build and run from the
`open-agents` workspace root:

```bash
cd ~/dev/open-agents
npm run build -w @open-agents/cron-collector

# One-shot dry run (does not write to Redis):
node agents/cron-collector/dist/index.js --dry-run
```

Before installing, create the env file at
`~/.config/open-agents/cron-collector.env` with `chmod 600`:

```
REDIS_HOST=100.77.226.26
REDIS_PORT=6379
REDIS_PASSWORD=<value from infra-dashboard/.env.local>
```

Then install the every-5-minutes cron entry:

```bash
bash ~/dev/open-agents/agents/cron-collector/install.sh
```

The installer is idempotent and tags its line with `# cron-collector (open-agents)`
so it can be re-run safely. Uninstall with `--uninstall`.

For remote hosts (apps-vps, homelinux, db-vps), publish the same script and
env file, then run the installer there. Each host writes to the shared Redis
instance, scoped by `host` field — there is no central coordination.

## Phase 3 (future)

- Cross-host management actions — route pause/run-now through the collector
  on the remote host (right now actions only run locally).
- Overlap detection (two jobs scheduled at the same minute on the same host).
- Discord/Slack delivery for the alerts endpoint via a Hermes job.
- Per-job override of `stale_threshold_minutes` in the curated inventory
  (currently always derived from the schedule).
