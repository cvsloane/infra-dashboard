# apps-vps container review — 2026-09-12

## Completed recovery

- Started the existing Prometheus container. Readiness passes; 20/21 targets up, 62 rules healthy, no firing alerts at verification. The separate `local-ai-gpu-lease` target at `100.77.0.113:9102` refuses connections; not repaired in this task.
- Deleted the stopped September 8 HOS rehearsal container and its 45 GiB bind-mounted directory, plus 11 HOS migration backup folders dated September 9–11 (about 54 GiB). The September 12 daily backup remains; manifest HOS file size matched the on-disk file. This was not a new restore test.
- db-vps now 58% used, 165 GiB free; PostgreSQL accepts connections and replication has zero lag.
- No application retirement performed.

## Assessment

There are 92 running containers after restoring Prometheus, representing applications plus their workers, databases, caches, proxies, and monitoring. Resource samples are instantaneous and do not establish business usage or prove a service is unused. Stopping a service frees its working memory but does not automatically reclaim retained images or data volumes.

| Group | Containers |
|---|---:|
| HeavisideOS | 3 |
| Other products, tools, and supporting services | 31 |
| Shared infrastructure and monitoring | 14 |
| Standalone HG applications and dependencies | 23 |
| Postiz social publishing | 7 |
| Public WordPress demos | 4 |
| Langfuse AI observability | 6 |
| Nextcloud | 4 |

## Retirement shortlist

| Candidate | Reason to review | Required check before stopping |
|---|---|---|
| FreeScout database (1) | No FreeScout application container is present | Confirm no remote clients or remaining mailbox workflow; preserve database |
| Documenso | Keep: Chris confirmed HG Websites uses Documenso | Do not retire; staging dependencies require separate verification |
| Generic WordPress pair (2) | wp.heavisidetechnology.com instance is separate from the public demos | Confirm site purpose, content owner, and use |
| Public Foundations demos (4) | Two WordPress sites plus two MySQL instances, about 1 GiB RAM combined | Business decision: demo.pavingmarketers.com and demo.garagedoormarketers.com are public sales demos |
| Nextcloud (4) | About 350 MiB RAM; potential overlap with other file services | Confirm users, sync clients, shared links, and retained files |
| Langfuse (6) | About 14.7 GiB RAM in the later sample; MinIO alone about 11.8 GiB | Documented Hermes trace-export/observability dependency. Verify current consumption and whether to keep, tune, or retire the whole integration |
| OpenSEO (1) | Standalone tool, about 739 MiB RAM | Confirm whether the recent deployment is in use |

## Applications that need a cutover review

- HOS API and workers have `HG_SEO_COMMANDER_API_URL` configured for `hgseocommander.com`. Do not retire SEO Commander merely because HOS is deployed.
- HG Websites, DAGA, and Outbound web/worker are configured to call `hgmarketreport.com`.
- Content frontend points to CPM, IM, and SMM; Content external API also points to CPM. Review as one service family.
- Agency Financials, PPC, Reporting, Comms, Content, Outbound, and Citations are running standalone. Determine accepted HOS replacement workflows, remaining jobs, inbound callbacks, and reporting routes before retirement.
- Postiz has seven containers supporting social publishing; six Langfuse containers support AI observability. Container count alone is not duplication.
- Hindsight and Langfuse have documented Hermes integrations. Rocket.Chat proxy purpose and external consumers remain unverified.

## Complete inventory

Domains are extracted from Docker routing labels; empty cells do not imply no consumers. `${APP_DOMAIN}` / `${API_DOMAIN}` are literal label values, not verified public endpoints. Memory and CPU are from one Docker stats sample; CPU is percent of one core.

| Group | Application | Container | Routed domains | CPU | Memory |
|---|---|---|---|---:|---|
| HeavisideOS | heaviside-os-workers | `hgs84o44okws0c4wckkgsswk-142311544241` | — | 0.52% | 267.3MiB |
| Other products, tools, and supporting services | hg-websites | `cocowcc04ockwkg8w408goso-044534533788` | electricianmarketingagency.com, garagedoormarketers.com, heaviside.agency, heaviside.digital, heavisidegroup.com, pavingmarketers.com, www.electricianmarketingagency.com, www.garagedoormarketers.com, www.heaviside.agency, www.heaviside.digital, www.heavisidegroup.com, www.pavingmarketers.com | 4.79% | 241.3MiB |
| Shared infrastructure and monitoring | coolify-sentinel | `coolify-sentinel` | — | 0.00% | 35.21MiB |
| HeavisideOS | heaviside-os-web | `lsso00cww480swgsw4s4co4o-025146691998` | app.heavisideos.com | 0.00% | 172.7MiB |
| HeavisideOS | heaviside-os-api | `ggk4osocsk0s4kk8g44o4ckg-232033620732` | api.heavisideos.com | 0.82% | 257.6MiB |
| Standalone HG applications and dependencies | hg-market-report-workers | `qccw80804g0wkc0kkk4kggko-150810301900` | — | 0.01% | 122.9MiB |
| Standalone HG applications and dependencies | hg-market-report | `vw0kkw0s8wccwk4sck00cswo-150810219139` | hgmarketreport.com, reports.electricianmarketingagency.com, reports.garagedoormarketers.com, reports.heaviside.digital, reports.pavingmarketers.com, www.hgmarketreport.com | 0.88% | 112MiB |
| Standalone HG applications and dependencies | hg-emails-production | `qgsow0ckwkcgsck0cgg4sko0-125841972152` | hg-emails.com | 16.01% | 227.9MiB |
| Standalone HG applications and dependencies | hg-seo-commander-production | `tkgw884gcooo0s8og8g4kgkc-234749323161` | hgseocommander.com, reports.hgseocommander.com | 2.26% | 140.6MiB |
| Standalone HG applications and dependencies | hg-seo-commander-worker | `accos884800o8wkks004s08g-234749416187` | — | 1.09% | 137MiB |
| Other products, tools, and supporting services | x-accel-production | `iows4ksckggw8kso0g0c8owc` | — | 2.62% | 267.8MiB |
| Standalone HG applications and dependencies | hg-ppc-worker | `b4owcscsccos40kwgwokc8s0-133326409812` | — | 0.37% | 388.2MiB |
| Standalone HG applications and dependencies | hg-ppc-web-worker | `ls80w4s44cso4wwsc0gg0ssc-133032470828` | — | 0.00% | 74.2MiB |
| Standalone HG applications and dependencies | hg-ppc-web | `dwk0o0s4go8g0w8gs0ss8ks0-133032347853` | heavisideppc.com | 0.89% | 78.72MiB |
| Standalone HG applications and dependencies | agency-financials-production | `e42dc2d1-9bfe-4e98-9cf0-9995e1ee4a2e-230620266979` | agencycommander.co | 1.28% | 190.3MiB |
| Standalone HG applications and dependencies | hg-citations | `fww8cc80wo0sok4444s480wk-224254205618` | hgcitations.com, www.hgcitations.com | 1.59% | 117.7MiB |
| Other products, tools, and supporting services | pasco-frontend | `hswwg0cscs0c8w4cs8wwg8so-180818700716` | pasco-frontend.app.heavisidetechnology.com, pascoml.com, www.pascoml.com | 0.00% | 16.05MiB |
| Postiz social publishing | postiz | `postiz` | hgsocial.com, social.heavisidetechnology.com, www.hgsocial.com | 27.87% | 2.541GiB |
| Other products, tools, and supporting services | open-seo | `q10b1qtr143hu5dfebt9fo2u-192336225385` | — | 3.82% | 740.2MiB |
| Standalone HG applications and dependencies | hg-comms | `kcscfw35tnstmgoffjvpwc9i-191745406810` | comms.heavisideos.com | 0.05% | 108.9MiB |
| Other products, tools, and supporting services | health-tracker | `i8o4c0gkc8ocwwcgwkggwssg-164016542409` | health.heavisidetechnology.com | 0.00% | 48.97MiB |
| Other products, tools, and supporting services | heaviside-agents-sales | `argjo79mjx77tud68gp59du5-160339182374` | sales-agent.heavisidetechnology.com | 0.00% | 122.5MiB |
| Other products, tools, and supporting services | daga-production | `zckk4sw488o04kkskw8o8sow-154421088024` | digitalagencygrowthacademy.com, www.digitalagencygrowthacademy.com | 0.06% | 137.4MiB |
| Other products, tools, and supporting services | heaviside-prospector | `q0wsw48cws8cgk8okg08wg4o-152126146685` | prospector.heaviside.agency | 0.00% | 92.64MiB |
| Standalone HG applications and dependencies | hg-outbound-web | `qook0ook8k4s4wss8wskc4ss-152011688084` | hgoutbound.com | 0.88% | 114.4MiB |
| Standalone HG applications and dependencies | hg-outbound-worker | `lg0kgsgow40w00k0cgso8848-151915423582` | — | 0.06% | 58.77MiB |
| Other products, tools, and supporting services | cvsloanecom-autodeploy | `mow8ccgoc04848wg8k4scosg-150836229624` | csloane.com, cvsloane.com, www.csloane.com, www.cvsloane.com | 0.03% | 83.04MiB |
| Standalone HG applications and dependencies | hg-reporting | `v13zkttq8ablhivfmpllkczb-144748590555` | app.hgreporting.com, hgreporting.com, reports.hgreporting.com | 0.00% | 57.79MiB |
| Other products, tools, and supporting services | against-reformation | `ncok8w0cw888cw88oswssook-143351399684` | againstreformation.com, www.againstreformation.com | 0.00% | 122.8MiB |
| Other products, tools, and supporting services | cvsloanerevenue-commandermaster-uc8kg040w44sscwgoskw8sco | `xkggskwgs0csk84sc4o8skgs-142001131458` | revenuecommander.com, www.revenuecommander.com | 0.00% | 70.09MiB |
| Standalone HG applications and dependencies | hg-web-commander | `su9pqgf1usd3okxqlt8kbmta-134956343726` | hg-web-commander.app.heavisidetechnology.com, web.heavisidetechnology.com | 0.00% | 109.4MiB |
| Other products, tools, and supporting services | hg-directory | `ccgwk0o80w8gsg4owwo4wwgw-134009044975` | cincinnatilist.com, cincylist.com, electricianslist.com, garagedoorlist.com, pavinglist.com, www.cincinnatilist.com, www.cincylist.com, www.electricianslist.com, www.garagedoorlist.com, www.pavinglist.com | 7.06% | 108.3MiB |
| Other products, tools, and supporting services | surfaceiq-production | `sgo8sg8gs40okkk80c4kcg00-130156428765` | surfaceiq.io, www.surfaceiq.io | 1.20% | 169.1MiB |
| Other products, tools, and supporting services | surfaceiq-docs | `3f032ded-c004-4de8-bda9-de4b78e2f2b8-130156375622` | docs.surfaceiq.io | 0.00% | 55.6MiB |
| Other products, tools, and supporting services | ai-videogen | `app-qks0gwks0wwcwsooow8w4sso-120513458423` | video.heavisidetechnology.com | 0.96% | 214.9MiB |
| Other products, tools, and supporting services | ai-videogen | `studio-qks0gwks0wwcwsooow8w4sso-120513574129` | studio.heavisidetechnology.com | 6.63% | 570.3MiB |
| Other products, tools, and supporting services | agent-console | `dashboard-dcgs4ccgkco44w4gkkg0kks8-095114703845` | ${APP_DOMAIN} | 0.00% | 40.76MiB |
| Other products, tools, and supporting services | agent-console | `control-plane-dcgs4ccgkco44w4gkkg0kks8-095114649517` | ${API_DOMAIN} | 7.52% | 87.16MiB |
| Standalone HG applications and dependencies | hg-citations-scraper | `hg-citations-scraper` | — | 0.29% | 287.9MiB |
| Standalone HG applications and dependencies | hg-citations-worker | `koss484k08g0kkcgwwwog00c-064634699743` | — | 0.00% | 42.5MiB |
| Shared infrastructure and monitoring | infra-dashboard | `lsksccso4c8skw0040wog8w0-060619334056` | ops.heavisidetechnology.com | 3.50% | 50.78MiB |
| Other products, tools, and supporting services | family-devotion | `739bf9afc3454709b1893ea46ea699be-055302978172` | catholicfamilydevotions.com | 0.00% | 183.4MiB |
| Standalone HG applications and dependencies | hg-content-frontend | `g0k4ck4ocg84skc4o4w8skwg-051237530528` | content.heavisideos.com, hgcontent.com | 0.00% | 59.62MiB |
| Standalone HG applications and dependencies | hg-content-smm | `y0g4gks08wcw44sw8k80ocog-051209827116` | smm.hgcontent.com | 2.05% | 150.8MiB |
| Standalone HG applications and dependencies | hg-content-cpm | `iw800848oco0wkg840ws0k44-050824509263` | cpm.hgcontent.com | 0.85% | 322.5MiB |
| Standalone HG applications and dependencies | hg-content-im | `pg48goko0kko4cwscsc8cso0-050824619698` | im.hgcontent.com | 0.99% | 174.8MiB |
| Other products, tools, and supporting services | pasco-backend | `f0sc4o08os4cks4ww48c48o4-165411627350` | api.pascoml.com, pasco-backend.app.heavisidetechnology.com | 4.65% | 569.1MiB |
| Public WordPress demos | foundations-pvm-demo-public-wp-1 | `foundations-pvm-demo-public-wp-1` | demo.pavingmarketers.com | 0.01% | 142.6MiB |
| Public WordPress demos | foundations-gdm-demo-public-wp-1 | `foundations-gdm-demo-public-wp-1` | demo.garagedoormarketers.com | 0.01% | 114.1MiB |
| Public WordPress demos | foundations-gdm-demo-public-db-1 | `foundations-gdm-demo-public-db-1` | — | 1.84% | 374.9MiB |
| Public WordPress demos | foundations-pvm-demo-public-db-1 | `foundations-pvm-demo-public-db-1` | — | 1.78% | 403.2MiB |
| Postiz social publishing | postiz-workspace-admin | `postiz-workspace-admin` | — | 0.00% | 81.91MiB |
| Shared infrastructure and monitoring | coolify-proxy | `coolify-proxy` | — | 27.47% | 179.5MiB |
| Postiz social publishing | postiz-temporal-ui | `postiz-temporal-ui` | — | 0.00% | 19.12MiB |
| Other products, tools, and supporting services | rocketchat_app | `rocketchat_app` | — | 2.76% | 878MiB |
| Shared infrastructure and monitoring | monitoring-prometheus-1 | `monitoring-prometheus-1` | — | 0.32% | 282.7MiB |
| Shared infrastructure and monitoring | monitoring-alertmanager-1 | `monitoring-alertmanager-1` | — | 0.16% | 34.92MiB |
| Other products, tools, and supporting services | hindsight | `hindsight` | — | 1.06% | 906.2MiB |
| Other products, tools, and supporting services | documenso-prod | `documenso-prod` | contracts.heavisidetechnology.com | 0.05% | 276.3MiB |
| Other products, tools, and supporting services | documenso-staging | `documenso-staging` | sign-staging.heavisidetechnology.com | 0.00% | 260.6MiB |
| Postiz social publishing | postiz-temporal-admin-tools | `postiz-temporal-admin-tools` | — | 0.00% | 1.332MiB |
| Postiz social publishing | postiz-temporal | `postiz-temporal` | — | 23.47% | 259.8MiB |
| Postiz social publishing | postiz-temporal-elasticsearch | `postiz-temporal-elasticsearch` | — | 0.77% | 587.4MiB |
| Postiz social publishing | postiz-temporal-postgresql | `postiz-temporal-postgresql` | — | 4.16% | 98.24MiB |
| Shared infrastructure and monitoring | coolify | `coolify` | — | 1.68% | 356.4MiB |
| Shared infrastructure and monitoring | coolify-build-registry | `coolify-build-registry` | — | 0.00% | 48.54MiB |
| Langfuse AI observability | langfuse-redis-1 | `langfuse-redis-1` | — | 4.27% | 22.33MiB |
| Langfuse AI observability | langfuse-langfuse-worker-1 | `langfuse-langfuse-worker-1` | — | 2.98% | 540.2MiB |
| Langfuse AI observability | langfuse-langfuse-web-1 | `langfuse-langfuse-web-1` | — | 2.78% | 864.3MiB |
| Langfuse AI observability | langfuse-clickhouse-1 | `langfuse-clickhouse-1` | — | 21.79% | 1.501GiB |
| Langfuse AI observability | langfuse-minio-1 | `langfuse-minio-1` | — | 40.24% | 11.8GiB |
| Langfuse AI observability | langfuse-postgres-1 | `langfuse-postgres-1` | — | 0.00% | 75.17MiB |
| Standalone HG applications and dependencies | hg-content-external | `hg-content-external` | api.hgcontent.com | 1.25% | 83.14MiB |
| Other products, tools, and supporting services | divinum-officium | `divinum-officium` | — | 0.01% | 43.73MiB |
| Other products, tools, and supporting services | rocketchat_stage_proxy | `rocketchat_stage_proxy` | — | 0.00% | 12.65MiB |
| Shared infrastructure and monitoring | redis-broker | `redis-broker` | — | 1.22% | 104.9MiB |
| Shared infrastructure and monitoring | coolify-realtime | `coolify-realtime` | — | 4.74% | 99.69MiB |
| Shared infrastructure and monitoring | coolify-redis | `coolify-redis` | — | 1.62% | 17.36MiB |
| Shared infrastructure and monitoring | coolify-db | `coolify-db` | — | 2.65% | 173.9MiB |
| Other products, tools, and supporting services | app | `app` | community.digitalagencygrowthacademy.com | 8.39% | 1.634GiB |
| Shared infrastructure and monitoring | monitoring-uptime-kuma-1 | `monitoring-uptime-kuma-1` | — | 1.77% | 170.8MiB |
| Standalone HG applications and dependencies | hg-wp-mysql | `hg-wp-mysql` | — | 1.80% | 438.3MiB |
| Nextcloud | nextcloud-app | `nextcloud-app` | cloud.heavisidetechnology.com | 2.94% | 176.4MiB |
| Nextcloud | nextcloud-cron | `nextcloud-cron` | — | 0.00% | 22.04MiB |
| Nextcloud | nextcloud-db | `nextcloud-db` | — | 0.61% | 142.8MiB |
| Nextcloud | nextcloud-redis | `nextcloud-redis` | — | 0.95% | 8.078MiB |
| Shared infrastructure and monitoring | health-check-app | `health-check-app` | app.heavisidetechnology.com | 0.75% | 17.77MiB |
| Other products, tools, and supporting services | wordpress-with-mysql-g0o040wk8gw0g0gwooccw0cc | `wordpress-g0o040wk8gw0g0gwooccw0cc` | wp.heavisidetechnology.com | 0.00% | 166.5MiB |
| Other products, tools, and supporting services | wordpress-with-mysql-g0o040wk8gw0g0gwooccw0cc | `mysql-g0o040wk8gw0g0gwooccw0cc` | — | 1.59% | 481.1MiB |
| Other products, tools, and supporting services | freescout-db | `freescout-db` | — | 0.01% | 93.14MiB |
| Other products, tools, and supporting services | pasco-mlflow | `wwo08w84oow0go4ksgsswo4k-183619196497` | mlflow.pascoml.com | 1.53% | 772.5MiB |
| Shared infrastructure and monitoring | maintenance-sidecar | `maintenance-sidecar` | — | 0.00% | 16.61MiB |

## Langfuse assessment — follow-up September 12

Langfuse is active, healthy, and used as an observability destination. Its six containers consume approximately 14.9 GiB RAM in the follow-up sample, including 11.85 GiB in MinIO. No Langfuse service was changed.

- The live Hermes exporter is enabled and last succeeded at 14:31 UTC. Local export bookkeeping contains 3,686,605 exported envelopes. These are events, not distinct users or LLM calls.
- ClickHouse has two projects: Hermes (about 559,041 stored trace rows) and Local AI (793). In the preceding 24 hours there were 5,205 Hermes trace rows and seven Local AI trace rows. ClickHouse physical rows may include versions; these are not deduplicated request counts.
- About 72% of the recent Hermes trace rows are coding-dispatch-heartbeat (1,302), coding-dispatch-discord-ingest (1,283), and coding-program-controller (1,180). Routine automation dominates volume.
- Local AI data was received as recently as 13:10 UTC. The specific currently emitting client was not established. Inspected HomeLinux LiteLLM config/callback files contained no literal Langfuse reference, so do not assume that is the current sender.
- The deployed Hermes dashboard sidecar adds trace links and exposes Langfuse health and export counts. The infra-dashboard Hermes and costs pages link to Langfuse. Hermes exports local trace events after job execution; the documented export is optional, rather than the job execution engine.
- The Langfuse Backup job is enabled and last reported success today. Turning off the stack alone would leave an exporter, backup job, dashboard links, and potentially external senders pointing at a stopped service.
- ClickHouse active parts occupy approximately 1.44 GiB across observations, traces, and blob metadata. MinIO disk usage was not measured in this follow-up. Its high RAM use has not been diagnosed; no claim is made that it is a leak.
- Human UI use, evaluation/score usage, and a complete caller census remain unverified. Automated ingestion proves collection, not business value.

Recommendation: keep running while reviewing whether the trace UI is useful, then either reduce routine polling telemetry and investigate MinIO memory or retire the integration deliberately. Raw Hermes job logs and local trace files are separate, but removal of all downstream dependencies has not been tested.

## Langfuse usage investigation — second follow-up

Recommendation revised to coordinated retirement, subject to authorization. Active ingestion alone does not demonstrate useful consumption.

Observed database evidence:
- One user, created and last updated April 23 at installation. Zero database Session rows. This does not prove no browser use: token-based sessions need not create those rows, and user updates do not record every login.
- Zero prompts, datasets, dataset runs, evaluation job configurations, scores (ClickHouse), comments, annotation queues, batch exports, saved table views, or audit-log rows.
- Three dashboards have no project/creator and predate this installation: bundled latency, usage, and cost dashboards. Twenty evaluation templates likewise have no project and are defaults, not configured evaluations.
- No access-log evidence was obtained to prove absence of human reads. Sampled application logs do not expose a usable request history.
- Located Local AI sender: HomeLinux `local-ai-transcript-relay.timer` executes `/usr/local/lib/local-ai-transcript-relay/relay.py` approximately every minute. It sends completed local transcript journals to Langfuse after request completion. API-key note also identifies the HomeLinux transcript relay.
- Successful acknowledgements move journals from pending to acknowledged; local acknowledged journals expire after seven days. Stopping only Langfuse or its relay leaves new pending journals accumulating. Older Langfuse transcripts may no longer have their original local copy.
- Hermes dashboard costs are computed by `costs_payload()` from local `runs_payload()` data. Langfuse adds optional trace links, export counts, and readiness checks; it does not calculate that local cost view.

Concrete retirement scope:
1. Disable Hermes Langfuse exporter and backup schedules; reconcile associated job definitions so they are not re-enabled by sync. Remove or disable Langfuse-specific guards/readiness requirements where active.
2. Disable HomeLinux transcript relay timer and replace the acknowledgement-dependent local transcript retention with an explicitly chosen bounded local retention policy. Preserve local inference behavior.
3. Remove Langfuse dashboard links/status requirements and trace-export configuration; preserve Hermes local run and cost reporting.
4. Stop the six Langfuse containers and prevent restart, retaining data volumes initially. This frees roughly 15 GiB working memory, not all stored disk data.
5. Verify Hermes jobs, local cost reporting, and a real Local AI request/transcript path after the change. Review data deletion separately.

No Langfuse retirement, schedule change, configuration edit, or data deletion has been performed.

## Authorized Langfuse retirement — September 12

Chris authorized retirement ("kill it"). All six Langfuse containers were stopped and removed, retaining all five named data/log volumes and existing backups. Compose restart policies were changed to `no`. Final Docker inventory: 86 running containers; no Langfuse containers. One worker was externally restarted after the first stop despite restart policy `no`; container removal eliminated that instance. The source of that start was not established.

- Hermes exporter `277a69b55271` and backup `dd92adf2c7e8` are paused in live state. Source `open-agents/hermes/jobs/open-agents.json` now marks both disabled.
- HomeLinux transcript relay timer disabled/stopped. Local transcripts now have seven-day modification-time retention via `/etc/tmpfiles.d/local-ai-transcripts.conf`; cleanup is scheduled by the active systemd tmpfiles timer. No immediate transcript purge was run.
- Removed Langfuse URL/key settings from the dashboard sidecar env (root/user-protected rollback copy retained). Sidecar optional unconfigured status now reports local diagnostics success. Sidecar restarted; existing 11 tests pass.
- Local AI health no longer requires the retired relay timer; relay-lag alert removed and Prometheus rules checked/reloaded. Three existing exporter tests pass. LiteLLM liveliness responds, gateway/media/TLS probes are up, spool writable with zero parse errors. A pre-existing model-manifest mismatch still makes aggregate health degraded; not changed here. No full inference request was run, and inference services were not restarted.
- apps-vps has approximately 43 GiB available memory after removal. Data volumes are retained, so no Langfuse disk-recovery claim is made.

Remaining persistence wall: attempting to update the installed release job manifest returned `PermissionError: [Errno 13] Permission denied` under `/home/cvsloane/.local/share/open-agents/releases/0b8dee41c9ee35225c56fb19f5e954c059d6f880/hermes/jobs/`. The protected installed release was left unchanged. Live pauses and editable source changes are in place, but an old-release sync could re-enable those jobs. The source changes must be incorporated into a supported automation release. Unrelated source changes were preserved; no commit or broad automation deployment was made.

## Continued optimization assessment

- Langfuse remains absent from Docker. An isolated two-file release candidate is prepared at `/tmp/open-agents-langfuse-retirement-20260912`, based exactly on installed commit `0b8dee41c9ee35225c56fb19f5e954c059d6f880`. It disables the two jobs and updates the existing scheduled-job expectation. All 16 sync tests pass; diff whitespace check passes. Commit and release authorization requested; no commit or activation performed yet.
- Nextcloud uses 104 GiB on the apps-vps root filesystem: 68 GiB admin trash, 34 GiB current admin files, 2.1 GiB file versions, and 38 MiB for the second user. Recorded last logins are admin April 9 and second user February 18, but these do not establish absence of sync-client use. Requested approval to empty only admin trash using `occ trashbin:cleanup admin`; current files and versions would be retained.
- FreeScout has no matching application container, zero other database connections during inspection, approximately 1 MiB of application tables and a 215 MiB database volume. Its container uses 93 MiB RAM. Possible orphan; no shutdown performed.
- Registry currently about 49 GiB. The September 12 retention job skipped because one deployment was active; prior September 9–11 runs succeeded and reduced it to 20–21 GiB. This is a missed maintenance opportunity, not evidence the retention rules are absent.
- Retained Langfuse storage: ClickHouse data 45 GiB, ClickHouse logs 1.4 GiB, PostgreSQL 194 MiB, and external backup archives 8.6 GiB; MinIO measurement pending. This host-filesystem figure includes all ClickHouse databases/system storage, unlike the earlier 1.44 GiB query scoped to active parts in the application database.
- Documenso remains protected as an HG Websites dependency. No additional applications or data retired in this assessment.

## Approved cleanup and permanent retirement — September 12

Chris approved all proposed actions. Nextcloud admin trash cleanup completed successfully; 34 GiB current files and 2.1 GiB versions remain, maintenance mode is false. Registry supported cleanup deleted 52 stale tags/54 revisions with no active deployments, reducing storage from 48.12 GiB to 21.10 GiB. FreeScout container stopped/removed and Compose service placed behind `retired` profile with restart disabled; its 215 MiB database volume remains.

Permanent Langfuse schedule retirement is now active in release `1ed2e421594711714d0a8f34175fbec2742b2b7e`, based directly on prior installed release `0b8dee41c9ee35225c56fb19f5e954c059d6f880`. Branch `ops/langfuse-retirement-20260912` preserves the commits locally. Default `npm run test:release` passed; activation capability measurements passed. Both jobs are disabled in the active immutable manifest and live scheduler, closing the earlier persistence issue. No remote Git push performed.

The full check exposed stale audit count expectations already failing against the original manifest: 91 actual jobs vs 90 expected, 68 static errors vs 66 expected, 56 warnings vs 55 expected. The prior installed commit added the managed account writer but omitted those audit baseline updates. The corrective commit updates exact expected counts, preserves all audit findings, and changes the capability test from 38 to 36 enabled jobs for the two retirements. No tests were skipped or gates bypassed.

Local Langfuse backup directory (8.6 GiB) deleted. Removal of its five unreferenced Docker data/log volumes is running; ClickHouse data/log volumes already removed, MinIO deletion is the remaining slow step. Remote object-store backups have not been deleted. Intermediate apps-vps root usage is 50% with 294 GiB free, compared with 76% and 141 GiB before this approved batch. Coolify health and Prometheus readiness pass.

## Consolidation study following Chris's service-status correction

User authority: AF and PPC are live and must remain. Reporting and Comms were never materially used and have already been fused into HOS. This is an assessment; no further shutdowns authorized or performed.

| Service / concern | Recommendation | Evidence and practical next step |
|---|---|---|
| Agency Financials and PPC | Keep | User-confirmed live. Preserve AF app and all three PPC containers/workers. |
| Documenso | Keep | User-confirmed HG Websites dependency. |
| SEO Commander / Market Report | Keep | Previously verified live consumers in HOS / Websites / DAGA / Outbound. |
| HG Reporting + HG Comms | Retire through routing cleanup | About 57 + 117 MiB RAM. Old containers still own hgreporting.com, app.hgreporting.com, reports.hgreporting.com, and comms.heavisideos.com. HOS deployed web routes manifest includes the host-specific Comms 302 to app.heavisideos.com/comms/inbox, but legacy app still owns that host. HOS runtime env retains reporting/comms settings; searches of deployed API source/packages and deployed web server JS found no named-variable consumers. Local checkout also has no application consumers of those env names. Remove stale settings and transfer legacy routes before stopping both apps; preserve data initially. Public probes returned 403, so public signed-in behavior is not verified. HG Reporting DB is about 10 MiB with one idle connection. |
| Hindsight | Retirement candidate with integration cleanup | Only 3 stored documents, all last updated April 20; 27 memory records, 10 observations; database about 11 MiB; container about 906 MiB RAM. No audit or LLM-request history rows, no recall/retain entries in sampled recent logs, and no queued work. This does not prove zero historical reads. Hindsight routing evaluation is disabled/unrun. Deployed EA inbox code still has recall/retain integration, so remove or explicitly disable that integration before retirement. |
| MainWP WordPress pair | Keep | Active MainWP plugin, title MainWP Dashboard, 47 rows in its registered-sites table. Not an empty generic site. Registration count does not establish all 47 connections are healthy. |
| Public Foundations demos | Keep pending explicit business retirement | Both demo.pavingmarketers.com and demo.garagedoormarketers.com return 200. Four containers use roughly 1 GiB RAM. They are public sales assets; no evidence establishes they are obsolete. |
| Nextcloud | Keep current files; set bounded retention | 34 GiB current admin files and 2.1 GiB versions retained. User login dates are old, but sync-client usage is unknown. No explicit trashbin_retention_obligation or versions_retention_obligation is configured. Cron last-run marker is current. Propose a 30-day trash maximum rather than another manual cleanup cycle; choose version retention separately. |
| Database migration backups | Fix lifecycle | Scheduled backup.sh defaults to one local daily snapshot and prunes timestamp-named directories at root depth one. The manual/ subtree is outside this selection. It therefore does not age out HOS migration dumps. Current daily snapshot is 19 GiB, manual subtree 723 MiB after authorized cleanup. Propose removing per-release migration backups after verified release completion and a short rollback window. |
| Registry retention | Keep existing mechanism; address skips | Daily cleanup works and preserves live images plus two recent tags. September 12 skipped active deployment; manual supported execution recovered about 27 GiB. Prefer scheduling away from deployments or a later scheduled recheck, not a new cleanup implementation. |

Priority: (1) retire Reporting/Comms with legacy-domain routing cleanup, (2) retire Hindsight if its EA integration is not desired, (3) make migration-backup and Nextcloud trash retention explicit. No need to reduce active AF/PPC/MainWP services to chase container count. The previous Langfuse MinIO deletion remains running at the time of this study; apps-vps root 49%, about 297 GiB free, db-vps 58%, 165 GiB free.

## Approved retirements completed — 2026-09-12, 15:48 UTC

Chris authorized standalone Reporting/Comms, Hindsight, and public Foundations demo retirement, with 30-day Nextcloud trash retention. AF/PPC, Documenso, MainWP and HOS remain live.

- Reporting (`v13zkttq8ablhivfmpllkczb`) and Comms (`kcscfw35tnstmgoffjvpwc9i`) stopped through Coolify. Stored `is_auto_deploy_enabled=false` verified for both; description marks retired. Both absent from Docker running list. Coolify status cache still says running while Docker cleanup is pending; do not redeploy these apps.
- Legacy Reporting domains redirect to `https://app.heavisideos.com/hq/reporting`; Comms redirects to `https://app.heavisideos.com/comms/inbox`. All four origin HTTPS probes verified 302 with valid TLS; target HOS pages return auth redirects (307). Signed-in behavior was not tested.
- Public PVM/GDM demo WordPress and MySQL processes stopped (four runtime tasks absent). Restart policy persisted as `no`; all three services in each public compose file now use `profiles: [retired]`. Compose originals retained as `.yml.pre-retirement-20260912`. Docker stop calls remain pending and Docker lists these four as running despite containerd confirming no tasks, while the large Langfuse volume deletion continues. Do not restart Docker to clear this display.
- Both demo domains redirect to their respective main marketing websites. All six legacy domains handled by `/data/coolify/proxy/dynamic/retired-apps-20260912.yaml`, using temporary fixed-destination redirects that discard old paths/query strings. Data volumes retained.
- Hindsight verified `exited`, `restart=no`; endpoint no longer responds. PostgreSQL data retained. Inbox recall/retention removed, Hindsight excluded from the LLM handler list, save/remember rules use existing manual review. Reflection/evaluation jobs remain disabled. Removed Hindsight env entries from `~/.hermes/.env` with protected rollback copy.
- Reviewed Open Agents release `15fa98433464c4da0f7291fd2795244d78838893` activated via supported release manager. Full existing release suite and capability checks passed. Existing inbox dry-run fixture: 6 successful items, 1 save request for manual review, 0 errors. Retirement changes mirrored to development source, preserving other work. Local branch `ops/hindsight-retirement-20260912`; not pushed.
- Nextcloud `trashbin_retention_obligation` verified `auto, 30`: maximum 30 days, may remove sooner under storage pressure. Existing background jobs apply the setting.
- apps-vps root 48%, 303 GiB available; memory 18/62 GiB used, 44 GiB available. Docker count82 includes four exited demo runtime tasks whose daemon bookkeeping is pending, so it is not a reliable live-process count yet. db-vps root58%, 165 GiB available; `docker exec postgres_db pg_isready` accepts connections.

Pending follow-through: allow existing Langfuse MinIO deletion and demo Docker stop finalization to finish, then reconcile Docker/Coolify status and final container count. No additional shutdown approval needed. Do not claim these asynchronous housekeeping operations finished.

## Cleanup follow-through verified — 2026-09-12, evening

Langfuse volume removal has finished; removal process absent. Docker now reports78 running containers. Disk308GiB free,47% used at audit start; usage varies with ongoing active workloads. Discord notification audit is in `tasks/discord-notification-audit-2026-09-12.md`.
