# HeavisideLinux Disk Recovery and `/dev` Cleanup — Plan and Execution Record

## Approval

- Human Owner: Chris Sloane
- Status: capacity objective achieved; deeper portfolio cleanup remains optional
- Prepared: 2026-07-30
- Execution authority: approved Restic, obvious Docker, and reproducible user-cache batches completed; no further destructive batch is authorized

No further deletion, service restart, GitHub archive, production mutation, or credential change is authorized by this plan.

## Outcome

Return the `heavisidelinux` root filesystem from critical pressure to sustained operating headroom without losing uncommitted work, local-only history, runtime data, recovery evidence, or GitHub lineage.

Target steady state:

- `df -h /` at or below 60% use; 75% is an emergency checkpoint, not the desired baseline;
- at least 1.4 TB user-available space after cleanup;
- all active development, Hermes, local GPU, and database paths still functional;
- every removed checkout reproducible from a recorded GitHub repository and ref;
- ongoing worktree, Docker, artifact, cache, and backup growth bounded by explicit retention.

The measured completion state is 55% root usage with 1.686 TB user-available. Approximately 1.405 TB was reclaimed from the incident baseline while retaining active services, scoped backups, completed models, source work, and all non-approved Docker volumes.

## Non-Goals

- Do not archive or delete GitHub repositories as part of local disk cleanup.
- Do not shut down production or failover services merely because their local development checkout is removed.
- Do not delete any additional Docker volumes, database evidence, Restic packs, dirty worktrees, stashes, or unpushed commits without a separate approval gate.
- Do not force HeavisideOS consolidation or source-repository retirement ahead of its existing acceptance gates.
- Moving data elsewhere on the same root filesystem does not count as reclaimed capacity.

## Current Evidence

### Filesystem

- `/dev/nvme0n1p2`: 3.94 TB decimal total, 3.45 TB used by files, and 285 GB available to normal users; `df` reports 93% use.
- The filesystem has another 200 GB reserved for root and approximately 485 GB physically free. The reserve explains the difference between 88% physical occupancy and the 93% user-visible `df` figure; it does not explain the 3.45 TB of file data.
- Inodes: 12% used; capacity pressure is large files and directories, not inode exhaustion.
- `/home/cvsloane`: 1.466 TB, led by `/dev` at 641 GB, `.cache` at 187 GB, `data` at 148 GB, `backups` at 134 GB, and `SloaneFiles` at 98 GB.
- `/backup/restic-repo`: 1.062 TB (990 GiB) on the root filesystem. This is a backup of data from the same machine stored on the same physical capacity pool.
- Thirteen legacy snapshots from 2025-12-31 through 2026-07-17 protect the former broad path set (`/home/cvsloane`, `/etc`, `/opt`, and `/usr/local/bin`) and require 959.3 GiB of raw repository data.
- Fourteen current scoped snapshots protect approximately 20 GB of selected configuration, Hermes state, critical repositories, SloaneVault, and final media; together they require only 6.35 GiB of raw repository data.
- A read-only `restic forget --dry-run --prune` for only the legacy snapshots estimates 982.1 GiB reclaim and a 6.68 GiB repository remaining. No snapshot was removed during inspection.
- Phase 1 execution completed at 2026-07-30 10:23 ET: the 13 approved legacy snapshots and 982.075 GiB of obsolete packs were pruned. All 14 scoped snapshots remain, the physical repository is approximately 6.7 GiB, and root usage fell from 93% to 65% with 1.336 TB user-available.
- The approved conservative follow-up completed the same day: unused Docker cache/images, three proven anonymous volumes, incomplete downloads, package caches, and Trash reclaimed another 349.9 GB by `df`. Final root usage is 55% with 1.686 TB user-available.
- Docker reports approximately 754 GB across volumes, images, build cache, and containers. A direct on-disk scan is retained as the final reconciliation check.
- These three main buckets already explain approximately 3.28 TB: 1.466 TB home data, 1.062 TB root-local Restic, and 0.754 TB Docker. Operating-system data and accounting differences explain most of the remainder.

### `/dev` portfolio

- Top-level git paths observed: 95 canonical/long-lived paths and about 381 temporary/worktree-style paths.
- Temporary worktree population includes about 304 `hos-*` / `heaviside-os-*` paths, 47 market-report paths, 19 SEO paths, and 10 websites paths.
- Temporary-path safety states at inspection time:
  - 34 dirty paths: hold;
  - 7 paths referenced by live processes or tmux: hold;
  - 93 clean, inactive paths whose HEAD is contained in the current GitHub default branch: first removal pool;
  - 28 of those 93 also exactly match a live GitHub branch tip;
  - all other detached, mismatched, or branchless paths: hold until preservation proof exists.
- The 93 first-pool paths have about 100 GB of summed logical size. Actual reclaimed blocks may be lower because worktrees can share hardlinks; `df` before/after is authoritative.

### Local clones suitable for a GitHub-only posture

The following paths were clean, inactive, absent from current process/systemd/Docker references, had no stashes, and had every local branch represented by the GitHub remote at inspection time:

| Local checkout | Approx. size | Portfolio posture |
| --- | ---: | --- |
| `blog-starter-app` | 0.63 GB | Generic template / archive candidate |
| `browser-commander` | 0.15 GB | Superseded utility; source remains on GitHub |
| `daga-mcp` | 0.07 GB | Thin client; retain GitHub while DAGA runtime is resolved |
| `freightrail-pulse` | 0.87 GB | Owner-decision project; reversible local eviction only |
| `gpu-model-hub` | 1.71 GB | Dormant support repo; local GPU runtime does not reference this path |
| `health-sync-android` | 0.10 GB | Clean Android source; no current local runtime reference |
| `heaviside-agents` | 0.15 GB | Clean support repo; no current local runtime reference |
| `heaviside-platform` | 2.27 GB | Operator-confirmed inactive / extraction candidate |
| `heaviside-prospector` | 1.97 GB | Development-retired but deployed elsewhere; local clone is not the runtime |
| `heaviside-tasks` | 2.29 GB | Operator-confirmed dead project |
| `hg-clean-browser` | 0.28 GB | Superseded browser utility |
| `m365-skill` | negligible | Retired M365 workstream |
| `revenue-commander` | 0.57 GB | Public-root replacement still required; local clone is not the runtime |
| `surfaceiq` | 1.65 GB | Runtime/install checks still matter; local clone is not referenced locally |
| `web-tools` | negligible | Idea-only utility |
| `outscraper-ghl` | 1.03 GB | Clean source also represented inside the outbound consolidation work |

Total candidate local checkout footprint: approximately 15.7 GB.

Holds discovered during the same check:

- `daga` is clean but has one local stash; preserve or explicitly discard the stash before considering local removal.
- `csloane.com` has 19 unresolved local branches and two stashes; keep locally until reconciled.
- `dfs-service` does not match the current GitHub branch tip; keep until its commit relationship is resolved.
- `agent-command` is currently open in tmux and its local origin is `agent-commander`; do not treat it as the old superseded checkout without a separate identity review.

### Large retained source and generated data

- `ai-videogen`: 93 GB, including 68 GB of ComfyUI models and multiple Python environments; referenced by a user service.
- `.artifacts`: 56 GB, led by Phase-C and foundation rehearsal evidence.
- `ml.school`: 15 GB, including a 9 GB virtual environment, 1.8 GB Metaflow state, and a 2.4 GB git directory; currently dirty/recent.
- `hg-web-commander`: 13 GB, including 8.9 GB `.next` and 2.6 GB `node_modules`.
- canonical `heaviside-os`: 15 GB, including 8.5 GB web `.next`, 2.3 GB worker storage, 2.1 GB `tmp`, and 0.9 GB `node_modules`.
- `.worktrees/heaviside-os-modules-ppc-web-outbound`: dirty and approximately 9.4 GB, mostly an 8.2 GB `.next`; preserve WIP but treat generated build output separately.
- `hg-market-report`: 7.1 GB, including 3.6 GB `.next`, 1.5 GB logs, 1.2 GB `node_modules`, and 0.6 GB backups; dirty and active.
- `agent-command`: 6.6 GB, including 4.6 GB Turbo cache and 1.4 GB `node_modules`; active.
- `hos-lane-logs`: 2 GB and still receiving writes on 2026-07-30.
- `fd-wt`: 4.3 GB and currently mounted into running PostgreSQL containers; hold.

### Docker and non-`/dev` pressure

- Docker total: about 754 GB.
- Docker reports about 385 GB reclaimable: 74.4 GB images, 65.2 GB build cache, 4.1 GB stopped-container layers, and 240.9 GB unreferenced volumes.
- Three anonymous, unreferenced volumes created 2026-07-28 are about 40.5 GB each, or 121.6 GB total.
- Completed HeavisideOS rehearsal volumes include a 70.9 GB dangling Phase-C volume and roughly 238 GB attached only to exited rehearsal containers.
- Hugging Face cache: 138 GB, including 12.3 GB of incomplete downloads.
- `uv` plus `pip` caches: about 35 GB.
- User Trash: about 5.1 GB.
- Local VPS Restic repositories: 126 GB; healthy and intentional.
- `/backup/restic-repo`: 1.062 TB; weekly retention/prune is healthy but `--group-by host,paths` treats the legacy full-home and current scoped snapshots as separate lineages. The configured six monthly and two yearly points therefore preserve the obsolete bulk lineage indefinitely.
- `/home/cvsloane/data/training-videos`: 148 GB, in addition to approximately 76 GB of training sources under `SloaneFiles`; media authority and duplication need review.
- `/home/cvsloane/.npm`: 24 GB, mostly reproducible cache and transient `npx` installs.
- `/home/cvsloane/logs`: 16 GB, mostly retained health-mirror snapshots.

## Workstreams and Gates

### Phase 0 — freeze, snapshot, and manifest

1. Schedule a maintenance window with the active HeavisideOS/creative/PVM lanes paused from creating new worktrees.
2. Capture `df`, Docker usage, current tmux pane paths, process working directories, Docker bind mounts, git worktree lists, dirty counts, stashes, local branches, and current GitHub refs.
3. Create a deletion manifest with one row per target: path, bytes, kind, repository, branch, HEAD, GitHub preservation proof, active-reference result, dirty/stash result, decision, and post-action receipt.
4. Re-run the checks immediately before each batch; a stale inventory does not authorize removal.

Exit gate: every target is classified, active paths are excluded, and the Human Owner approves the first batch.

### Phase 1 — right-size local Restic and separate disaster recovery

Status: completed 2026-07-30 for legacy retirement, scoped retention correction, integrity verification, and representative restore proof. Independent long-horizon disaster recovery remains a separate future storage decision.

1. Treat the local repository as short-horizon file/version recovery, not disk-failure protection; it resides on the disk it protects.
2. Approval gate: either retire all 13 legacy full-home snapshots (recommended), or copy an explicitly selected legacy recovery point to independent storage before retiring the local legacy lineage.
3. After approval, remove only the 13 named legacy snapshot IDs through `restic forget ... --prune`; never delete repository packs manually.
4. Run the existing repository check plus representative restores of current Hermes state, SloaneVault, one critical repository, and `/etc` before accepting the result.
5. Change local retention from `7 daily / 4 weekly / 6 monthly / 2 yearly` to `7 daily / 4 weekly`, with no local monthly or yearly archive. That provides approximately one month of short-horizon recovery; put longer history in an independently protected repository.
6. Apply retention only to `--tag scoped` snapshots and group by host rather than paths. The current `--group-by host,paths` silently creates another retention lineage whenever the include-path set changes.
7. Target less than 25 GB for the steady repository, warn at 30 GB, and treat 50 GB as critical scope/churn drift. Alert when one daily snapshot adds more than 2 GB versus the current observed maximum of 0.79 GB. A literal hard ceiling can be set near 75 GB with a dedicated filesystem or project quota; a 200 GB local allowance is not justified by this working set.
8. Keep the scoped include/exclude manifest under review; generated caches, models, training media, worktrees, and backup repositories remain excluded from this local recovery set.

Expected result from the already-proven legacy-only prune: approximately 982.1 GiB reclaimed and approximately 6.7 GiB retained for all current scoped snapshots. The retained snapshots are deduplicated restore points, not complete copies; 14 current snapshots consume 6.35 GiB of referenced raw data in total.

Actual result: 982.075 GiB pruned; root usage changed from 93% to 65%; all 438 retained packs passed `restic check --read-data`; representative restored files matched live `/etc`, Hermes, SloaneVault, and `open-agents` files. The installed maintenance script has a rollback copy at `/usr/local/sbin/restic-maintenance.pre-capacity-20260730`.

### Phase 2 — Docker reclaim and retention

Status: obvious cleanup completed 2026-07-30. Deeper stopped-container and named rehearsal-volume review was intentionally deferred.

1. Confirm no Docker build or database rehearsal is active.
2. Prune unused BuildKit cache, unused images, and stopped containers as separate measured actions.
3. Inspect and, after explicit approval, remove only the three known July 28 anonymous dangling volumes.
4. Review the 70.9 GB Phase-C volume and the exited-container rehearsal volumes against the committed receipts and retention need.
5. Never run blanket volume pruning before the named-volume review is complete.
6. Cap BuildKit cache and assign expiry/ownership to rehearsal volumes so Docker cannot silently return to a 750 GB footprint.

Expected reclaim:

- lower-risk image/cache/container batch: up to 144 GB;
- July 28 anonymous volumes: about 122 GB;
- deeper rehearsal-volume retirement: potentially another 300+ GB.

Actual result: BuildKit reported 125.3 GB removed, image pruning reported 88.1 GB removed, and the three anonymous volumes represented approximately 121.6 GB. Because Docker layers share blocks, authoritative `df` recovery for the entire Docker batch was 295.4 GB. All 21 running containers remained up with zero unhealthy or restarting containers. Stopped containers and every other volume were retained; Docker now reports zero build cache, zero unused-image bytes, and 119.3 GB of unreviewed reclaimable volume data.

### Phase 3 — remove proven redundant worktrees

Batch 1A:

1. Start with the 28 clean, inactive worktrees whose HEAD exactly matches a current GitHub branch tip.
2. Remove registered worktrees with `git worktree remove` without `--force`.
3. Treat standalone scratch clones separately; remove only after all local refs, stashes, and untracked files pass the same preservation gate.
4. Process 10–20 paths at a time, then record `df`, `git worktree list`, and unexpected failures.

Batch 1B:

1. Process the remaining clean, inactive paths whose HEAD is an ancestor of the current GitHub default branch.
2. Preserve a manifest of each deleted branch name and commit even though the commit is merged.
3. Leave all dirty, detached-unproven, remote-mismatched, active, or locally-originated paths untouched.

Expected scope: up to 93 worktrees and about 100 GB logical size. Actual reclaim is measured, not assumed.

### Phase 4 — move dormant clones to GitHub-only

1. Revalidate the 16 candidate clones against current GitHub heads.
2. Confirm there are no local-only branches, tags, stashes, untracked files, tmux panes, process CWDs, systemd references, Docker bind mounts, or repo-local data stores.
3. Split approval into:
   - high-confidence inactive/scaffold/support paths;
   - deployed-but-development-retired products whose local clone is not the runtime;
   - owner-decision projects such as `freightrail-pulse`.
4. Record clone URL, default branch, and verified HEAD before removing the local directory.
5. Do not archive the GitHub repository.

Expected reclaim: about 15.7 GB.

### Phase 5 — generated build and dependency caches

1. Recheck active processes per repository.
2. Remove only reproducible outputs whose current caller can regenerate them: `.next`, `.turbo`, package-manager build caches, inactive `node_modules`, and disposable virtual environments.
3. Keep logs, backups, model data, worker storage, and research datasets out of this batch unless classified separately.
4. Prioritize the largest known caches:
   - `hg-web-commander`: approximately 11.5 GB;
   - canonical HOS generated web/dependency output: approximately 9.4 GB;
   - dirty HOS modules worktree generated output: approximately 9.1 GB without deleting its WIP;
   - `agent-command`: approximately 6 GB;
   - `hg-market-report`: approximately 4.8 GB excluding logs/backups;
   - `hg-websites`: approximately 3.4 GB;
   - `hg-seo-commander`: approximately 2.9 GB;
   - `ml.school`: up to 10.8 GB, but only after its active environment/state requirements are decided.

Exit gate: source trees remain intact and each affected project can reinstall/rebuild through its existing path when next needed.

### Phase 6 — user caches, models, media, and artifacts

Status: obvious reproducible-cache subset completed 2026-07-30; models, media, artifacts, logs, and installed environments were retained.

1. Remove incomplete Hugging Face downloads, then clear reproducible `uv`/`pip` caches and reviewed Trash.
2. Keep actively used models, but move the durable Hugging Face and ComfyUI model stores to a dedicated data disk if local GPU service is strategic.
3. For `.artifacts` and `hos-lane-logs`, preserve the accepted receipt/checksum subset, move durable evidence off-host or to dedicated storage, and remove local bulk only after reference and restore checks.
4. Consolidate the duplicate machine-specific training-video sets; retain one authoritative copy plus backup, not two convenience copies on the same root disk.

Expected immediate cache reclaim: about 52 GB. Model/media/artifact reclaim depends on the storage decision.

Actual result: 54.4 GB of physical space reclaimed across eight incomplete Hugging Face downloads, unused `uv` entries, pip/npm caches, transient `npx` installs, and Trash. Completed Hugging Face models remain approximately 138 GB; the pruned `uv` cache still retains approximately 21.6 GB needed by current cache semantics.

### Phase 7 — recurrence prevention

1. Make worktree cleanup part of the existing development-lane closeout: a lane is not closed until its branch is preserved, handoff accepted, processes stopped, worktree removed, and receipt recorded.
2. Add a read-only report for worktree count, dirty state, age, active references, and logical size. It may recommend; it must not auto-delete.
3. Cap local BuildKit cache and define a manual, receipt-backed volume review cadence.
4. Give `.artifacts`, lane logs, and database rehearsal volumes explicit owners and retention dates at creation time.
5. Put large AI models and backups on storage designed for durable bulk data rather than the root development filesystem.
6. Keep the existing 80% warning / 90% critical alert thresholds, but treat 60% as the normal post-remediation baseline and investigate sustained growth before it crosses 70%.

## Authority Lanes

| Action | Authority |
| --- | --- |
| Read-only inventory and revalidation | autonomous |
| Write/update the cleanup manifest and receipts | autonomous-with-receipt after plan approval |
| Remove generated caches | approval-required per batch |
| Remove worktrees or local clones | approval-required per batch |
| Remove Docker images, containers, or volumes | approval-required per batch |
| Move/delete backup or evidence data | approval-required per repository/artifact set |
| Stop/restart services | approval-required |
| Archive/delete GitHub repositories | forbidden in this project |
| Production/database/credential mutations | forbidden unless separately planned and approved |

## Stop Conditions

Hold an individual target immediately if any of these is found:

- dirty or untracked files;
- a stash;
- a local branch/tag/commit without durable remote preservation;
- a tmux pane, process CWD, Docker bind mount, systemd unit, scheduler, or active project plan referencing the path;
- database, model, backup, or evidence content that has not been classified;
- remote refs changed since the manifest was produced;
- removal requires `--force` or bypassing git-aware cleanup.

Stop the whole cleanup if free space falls unexpectedly, an active service loses its path, git preservation evidence is inconsistent, or three targets fail the same gate without new evidence.

## Verification and Acceptance

After every batch:

1. Record `df -hT /` and `df -ih /`.
2. Confirm active tmux/process paths still exist.
3. Confirm running Docker containers and user services use their original real paths.
4. Confirm each removed checkout's repository and preserved commit remain readable on GitHub.
5. Confirm git worktree registries contain no unintended missing/locked entries.
6. Record actual bytes reclaimed versus the batch estimate.

Final acceptance requires:

- root disk at or below 60% and at least 1.4 TB user-available;
- no loss of dirty work, stashes, local-only refs, database data, backup lineage, or accepted evidence;
- active Hermes, GPU, development, and locally hosted services healthy on their real paths;
- a completed deletion/retention manifest and per-batch receipts;
- recurrence controls assigned to real owners and existing workflows.

Capacity acceptance was achieved on 2026-07-30: root is at 55% with 1.686 TB user-available, the scoped backup repository is verified, and all running Docker workloads remained healthy. The broader worktree/portfolio and recurrence-control items remain follow-up work rather than incident blockers.

## Estimated Recovery

| Area | Estimated reclaim |
| --- | ---: |
| Retire 13 legacy full-home Restic snapshots | 982.075 GiB completed |
| Proven merged/pushed inactive worktrees | up to 100 GB logical |
| GitHub-only local clone batch | about 15.7 GB |
| Generated project caches | roughly 40–60 GB, excluding overlap with removed worktrees |
| Docker unused build cache and images | 213.4 GB reported; included in 295.4 GB measured Docker recovery |
| Three July 28 dangling volumes | about 121.6 GB completed; included in 295.4 GB measured Docker recovery |
| Reviewed older rehearsal volumes | potentially 300+ GB |
| Hugging Face/package/Trash immediate cache | 54.4 GB completed |
| Artifact/model/media/backup migration | decision-dependent; potentially hundreds of GB |

Completed incident recovery totals approximately 1.405 TB by authoritative filesystem accounting. The 55% final baseline is below the target without touching worktrees, dormant repositories, completed models, durable media, named evidence volumes, or stopped containers.

## Recommended Sequence

1. Completed: retire legacy Restic snapshots, verify the retained repository, and install scoped retention with size thresholds.
2. Completed: prune unused Docker cache/images, remove only the three proven anonymous volumes, and clear obvious reproducible user caches.
3. Stop active cleanup at the healthy 55% baseline unless a separate storage-management objective is approved.
4. As normal follow-up, implement BuildKit/volume lifecycle controls and decide the independent long-horizon disaster-recovery destination.
5. Treat worktree, dormant-repository, named rehearsal-volume, media, model, artifact, and log cleanup as separate reviewed batches rather than incident work.
