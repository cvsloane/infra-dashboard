# Discord overnight review — September 13, 2026

Reviewed from September12 16:00EDT through September13 approximately07:29EDT using paginated Discord REST reads. Bot-accessible inventory: one server (HeavisideBot), all21text channels, one voice-channel text history, active threads, and public/private/joined-private archived thread listings. No read errors; no active/recent archived threads. Seven messages in window: six monitoring and one earlier careers notification. No attachments. Bot access does not provide Chris's personal DMs or other servers.

## Newly identified overnight alerts

- 00:26:08EDT Coolify Smart Intake failure, message1548550325324218452. HG Websites application cocowcc04ockwkg8w408goso, task m1rrszq14ybfmad59jzjg3i4. HTTP500. Live app logs through06:24EDT show PostgreSQL22P02, `invalid input syntax for type uuid: ""`, stack includes `/api/cron/smart-intake`. This is an unresolved application/database-query error, not a false notification. Exact source of empty UUID still requires code investigation.
- 01:31:12EDT db-vps Restic failure, message1548566700910190644. Scheduled backup started01:04:18EDT (07:04CEST), exited1 at01:25:28EDT. HeavisideLinux apt history shows upgrade starting01:24:54, including Tailscale1.102.3 to1.102.4. Tailscaled received SIGTERM01:25:27 and explicitly terminated the SSH session from db-vps100.82.152.103, established01:04:19. Restic logs connection closed by remote host and fatal unable to save snapshot/SSH255. This is a second interruption cause, distinct from the earlier db-vps06:00reboot collision. Prior successfully verified snapshot remains; failed overnight run did not save a new snapshot. Current Prometheus confirms only db-vps Restic failure firing.

## Other activity checked

Five earlier messages in wider window were already investigated: Sept12 18:04 Smart Intake failure,18:57 db-vps backup failure,20:01 infrastructure error,21:07 apps-vps backup failure, plus16:52 careers notification. No new candidate/outbound Discord messages overnight.

Routing audit since22:00EDT:19infra-health runs and19queue-health runs remained local/success;38outbound-report-fulfillment records local only (not Discord digest messages). Coolify14duplicate failures suppressed plus1sent; Alertmanager1sent plus1suppressed. Repaired infra warning/webhook and apps-vps backup are not the overnight alerts.

## Next corrections

1. Coordinate backup with maintenance on its receiving host, then rerun the existing db-vps backup and verify snapshot/success. Moving only the db-vps reboot window did not protect against receiver-side Tailscale upgrades.
2. Trace and fix the empty UUID in Smart Intake; preserve failure notifications until actual processing succeeds.

Read-only investigation; no production changes or messages sent during this review.

## Authorized repairs in progress

User requested resolution. A follow-up read through07:54EDT found one additional07:32:10EDT Smart Intake failure (message1548657542488391681), same HTTP500 incident.

Smart Intake root cause confirmed: worker queried tenant-protected tables without transaction-local tenant identity. Fresh connections silently saw no work; reused connections with an empty custom setting raised22P02. Per-tenant bootstrap enumeration, atomic delivery claims, and delivery outcome updates now use the existing tenant transaction helper. One real pending signed Starter agreement also exposed a named-package projection bug; its validated month-to-month/no-waiver configuration now governs the projection without editing signed data. Independent review passed.

Repair77a2552181c5fdd6148a1079eff4372fca224353 pushed after integration with concurrently merged marketing57964075. Two stale marketing assertions were aligned to that approved copy after independent diagnosis. Local lint,385test files/2,613tests,208revenue tests,282browser tests on four tenants, production build, npm high/critical audit and Trivy scan passed. Existing skips:15unit and26browser; npm reports two moderate production dependencies. A temporary local process ceiling was restored after the build. Coolify automatically started deploymentlp285t5335w6uq6sgiowtof6 at07:56:35EDT. Live scheduled processing proof pending; no manual cron/email invocation.

Backup timer correction is installed and the full native recovery backup is running; final snapshot/retention and alert-clear verification pending. See tasks/backup-maintenance-repair-2026-09-13.md.

## Live Smart Intake result and remaining HOS hold

Coolify finished deploying77a25521 at08:03:55EDT; exact image is running healthy. The normal08:04scheduledrun repaired the September2 signed Starter agreement: bootstrapjob movedfailed→ready, attempt2; one intake email sent at08:04:09EDT. No manual message or combinedcron call was used. That same run returned503 because newly actionable HOS onboarding reached a legitimate source hold. Subsequent08:08and08:10scheduledruns returned200 with zero further sends.

HOS outbox remains source_held/HOS_SOURCE_STRIPE_IDENTITY_REQUIRED. Runtime billing namespaces are correctlypvm/gdm; initial missing-config hypothesis was disproved. Source getter incorrectly retrieves Foundations payment identity only from setup_fee_waivers; this no-waiver package has no such row. Existingbilling_events contains exactlyone Stripe/checkout_completed/paid event with one customer/subscription pair. Read-only Stripe checkout lookup independently confirms live/complete/paid subscription,USD2,490total,customer/subscription present. Do not replay the waiver handler: legacy three-month metadata would conflict with the signed no-waiver package.

Independent code review confirms that correcting identity would then reachHOS_SOURCE_PPC_CHANNELS_REQUIRED: Starter includesPPC but its signed configuration contains no channel elections. No channel may be inferred, and no signed/payment data was edited. Chris was asked which channels were actuallysold for Jeff Bennett's September2GarageDoorStarter purchase and where that is recorded. Handoff remainsheld; no HOS case created by this recovery. Smallest future identity correction is exacttenant+checkout paidStripebilling evidence with one complete, unambiguous customer/subscriptionpair; no migration/newexternallookup needed. No further source correction deployed while the contract-evidence wall remains.

Follow-up audit through approximately 08:14 EDT: no new Discord messages after the pre-deployment 07:32 Smart Intake notification, and no channel/thread read errors. The 08:12 scheduled worker succeeded. Current disk headroom: db-vps 160 GB, apps-vps 311 GB, receiver approximately 1.2 TB. Backup completion is still pending; its dedicated repair owner continues supervision and will record snapshot, retention, and alert verification.

## 08:18 EDT receipt follow-up

Chris explicitly directed keeping the HOS handoff held. Verified source_held unchanged since 08:04:11; no requeue or source edits. Exact deployed image77a2552181c5fdd6148a1079eff4372fca224353 remains healthy. All seven scheduled runs08:06–08:18 succeeded. Fresh full accessible Discord read has no errors and latest Smart Intake message remains07:32:10EDT (1548657542488391681), before deployment08:03:55. Chris reported a newly received notification; its displayed timestamp is requested rather than assuming delayed delivery.
