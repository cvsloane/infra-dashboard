# DNS-cap notices

The router's 24-hour over-cap address sets are history, not proof that DNS is down.
The collector keeps that history under dns_guard but does not raise network-health
warnings just because an address remains in a set.

A new observed burst sends “DNS burst contained” in enforce mode, or
“DNS burst observed” in log-only mode. The notice includes the DHCP device name
(or address when unknown), router, and the original sampled packet-log time in
America/New_York. The dedicated native logread call renders stored timestamps in
UTC, avoiding the repeated daylight-saving hour; old local-time log files are not
used for new event identity. IPv6 addresses are canonicalized before matching. Packet logs are sampled, so this is an **observed** time, not an
exact count or the last dropped packet. No timestamp is invented when logs are missing.

The existing minute collector groups successive active polls into one episode.
New packet logs or increasing drop counters extend it silently. A successful poll
with an unchanged counter and no new log event ends the episode internally.
There is no cap-recovery message, daily reminder, or new DNS limit. Failed
collections and missing counters do not prove that traffic has stopped.
The global router counter conservatively keeps existing episodes open while any
device on that router continues generating excess traffic.

State file: /var/lib/home-network-monitor/dns-cap-notices.json.
Pending content is saved before delivery and is retried unchanged by the next
ordinary poll. Delivery is marked complete only when the existing
monitoring-alert notice helper returns success. State writes are atomic; the
native oneshot timer serializes collection. HOME_NETWORK_DNS_CAP_STATE and
MONITORING_ALERT_BIN allow isolated tests without real messages.

For the initial cutover, seed this state from a fresh, notifications-disabled
snapshot using send_dns_cap_notices(snapshot, seed=True), so old history does not
become a new batch of notices. Archive only the three legacy
dns-guard-flint-{cabinet,office,school}.json helper states without calling “ok”.
Retain backups of the installed collector and these states for rollback.

DNS fallback failure/recovery alerts, Linux host-cap alerts, router reachability,
NextDNS service checks, router limits and fallback configuration are unchanged.
The repository also captures the previously installed 20 October DNS collection
and alert code so deploying the tracked source preserves those existing features.

Verification: python3 -m unittest discover -s scripts -p test_collect_home_network.py -v
Tests use isolated files and a mocked notification helper. No DNS bursts or test
Discord messages are needed.
