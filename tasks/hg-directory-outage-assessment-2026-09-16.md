# HG Directory outage assessment — September 16, 2026

Read-only checks at approximately 18:08–18:13 EDT.

| Site | Public apex result | Origin result with certificate validation bypassed | Origin certificate expired/expires (EDT) |
|---|---|---|---|
| garagedoorlist.com | 526 | 200 | August 27, 12:04:12 |
| pavinglist.com | 526 | 200 | August 27, 12:31:28 |
| electricianslist.com | 526 | 200 | August 27, 12:31:29 |
| cincinnatilist.com | 200 | 200 | October 16, 10:32:39 |

cincylist.com redirects to working cincinnatilist.com; it is an alias, not a fifth directory. The three affected www origin certificates also expired August 27, five seconds after their apex certificates.

The live application container ccgwk0o80w8gsg4owwo4wwgw-134009044975 is healthy, running image67b24e678d72d0e69eafadad2199f547161f5b50. Direct SNI requests to apps-vps serve the correct but expired certificates; origin HTTP requests with verification bypassed succeed. Public Cloudflare responses return526. This local bypass was diagnostic only; no production TLS setting changed.

Likely outage onset is certificate expiry on August27, approximately20days before this assessment. This is an inference, not a measured first failure: no directory monitors exist in the current Uptime Kuma inventory and no corresponding Prometheus probe targets were found. Retained proxy logs show repeated Let's Encrypt HTTP-01 renewal failures with Cloudflare403, including August18 and daily September12–16 attempts.

Existing hg-directory/docs/PROD_CUTOVER_PLAN.md records the same three-domain526 incident repaired May29 with temporary DNS-only validation, and explicitly warns that future HTTP-01 renewals will fail behind the proxy unless the challenge configuration changes. The certificates currently served were issued May29. CincinnatiList was issuedJuly18 and remains valid untilOctober16.

Recommended repair: renew the affected origin certificates and correct automatic renewal using a supported challenge configuration; retain strict origin verification. Add public-domain checks for all four sites so healthy containers cannot hide public failures. Assessment only: no DNS, certificate, application, or monitoring configuration changed.

## Repair completed September 16

The user confirmed Cloudflare CLI access and the repair proceeded with the existing Infrastructure/CLOUDFLARE_DNS_API_TOKEN. Wrangler was installed but not logged in; the canonical account-owned DNS token verified active and had zone/DNS access to all five zones. No new token was minted, no token was rotated, and no Cloudflare proxy or SSL-mode setting was changed.

Added the native Traefik `directory-dns` ACME resolver using Cloudflare DNS-01. The token is read from root-owned0600 `/data/coolify/proxy/secrets/cloudflare-dns-token` via `CF_DNS_API_TOKEN_FILE`. Static configuration is persisted through the Coolify proxy configuration API on server0 (`lwcwwg8o0wgs4co4kosoks4s`), which manages the shared proxy. Server1 is the application's alias to the same machine, not the proxy configuration owner.

Migrated exactly10 directory certificate entries and the existing ACME account into `/data/coolify/proxy/acme-directory-dns.json` while the proxy was stopped;103 other certificate entries remained in the original store. This matters because simply changing router resolver labels leaves the existing certificates owned by the old renewal configuration. Both stores and the credential file are root-owned0600.

Persisted the10 changed directory router labels in Coolify and disabled automatic label regeneration for this app so future domain edits do not silently revert the resolver. Recreated the shared proxy and the existing directory compose service with `--no-build --pull never`. The directory image remains67b24e678d72d0e69eafadad2199f547161f5b50. No application code, customer data, or other application's routing changed. Independent review of the semantic configuration diff and certificate migration found no blocking findings.

All10 origin certificates renewed successfully and now expire December15,2026. Direct origin requests pass normal certificate verification (no bypass); all10 public apex/www hostnames return200 after expected redirects. Page titles match the correct directory. Both containers are healthy.

Added existing Uptime Kuma monitors6–9 for the four canonical public HTTPS homepages:60-second checks, two30-second retries, normal TLS validation, HTTP200–299 required, existing Email(SES) and Discord(#monitoring) notifications. All four recorded healthy real requests. No synthetic alert or message was sent. These checks observe Cloudflare-to-origin failures such as526; the edge-certificate expiry check alone is not proof of origin-certificate freshness.

Rollback references are in `/data/coolify/proxy/backups/hg-directory-tls-20260916/`: original proxy/application compose, original full ACME store, staged app compose, and migration script. For any rollback, preserve the newly renewed certificates; restoring only the original ACME backup would restore expired certificates. Restore matching resolver labels/configuration and retain the new certificate material under the selected resolver. Custom labels must be updated when directory domains change. Refresh the root-only token file from BWS if the canonical DNS token changes.

DNS-01 reference: https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/ . Real verification evidence is in the running proxy stores, normal public/SNI requests and Kuma heartbeat history; local command results `/tmp/hg-directory-tls-repair/public-proof.json`.
