"""Regression tests for DNS-cap notices; no network calls or real notifications."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("collect-home-network.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


def snapshot(stamp="2026-10-30T20:04:55+00:00", counter=426):
    events = [] if stamp is None else [{
        "address": "192.168.88.188", "device_name": "HG-OFFICE", "observed_at": stamp,
    }]
    return {"collected_at": "2026-10-30T21:00:00+00:00", "routers": [{
        "hostname": "flint-cabinet", "reachable": True, "nextdns": {"running": True},
        "dns_guard": {"guard_mode": "enforce", "over_cap_packets": counter,
                      "over_cap_devices": ["192.168.88.188"], "cap_events": events,
                      "fallback": {"mode": "nextdns", "dry_run": False}},
    }], "dns_guard_hosts": []}


class DnsCapNotices(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / "state.json"
        self.helper = Path(self.temp.name) / "monitoring-alert"
        self.helper.touch()
        self.env = patch.dict(os.environ, {"HOME_NETWORK_ALERTS": "1"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.paths = patch.multiple(collector, DNS_CAP_STATE=self.state, MONITORING_ALERT=self.helper)
        self.paths.start()
        self.addCleanup(self.paths.stop)
        self.sender = patch.object(collector.subprocess, "run", return_value=subprocess.CompletedProcess([], 0))
        self.sent = self.sender.start()
        self.addCleanup(self.sender.stop)

    def state_device(self):
        return json.loads(self.state.read_text())["routers"]["flint-cabinet"]["devices"]["192.168.88.188"]

    def test_parser_uses_actual_time_and_dhcp_name(self):
        lines = "\n".join([
            "Fri Oct 30 20:04:55 2026 kern.warn kernel: [103415.1] dns-guard over cap: SRC=192.168.88.188 DST=192.168.88.1",
            "Fri Oct 30 20:04:56 2026 kern.warn kernel: [103416.1] dns-guard over cap: SRC=192.168.88.188 DST=192.168.88.1",
            "Thu Oct 29 16:47:41 2026 kern.warn kernel: [19582.1] dns-guard over cap: SRC=192.168.8.239",
            "not a timestamp dns-guard over cap: SRC=192.168.88.188",
        ])
        events = collector.parse_dns_cap_events(lines, ["192.168.88.188"], {
            "mac": {"ip": "192.168.88.188", "hostname": "HG-OFFICE"},
        })
        self.assertEqual(events, [{"address": "192.168.88.188", "device_name": "HG-OFFICE",
                                   "observed_at": "2026-10-30T20:04:56+00:00"}])

    def test_ipv6_and_unknown_hostname_are_preserved(self):
        events = collector.parse_dns_cap_events(
            "Fri Oct 30 20:04:55 2026 kern.warn kernel: [1] dns-guard over cap: SRC=fd00:0000:0000:0000:0000:0000:0000:1234",
            ["fd00::1234"], {},
        )
        self.assertEqual(events[0]["device_name"], "fd00::1234")

    def test_repeated_dst_hour_uses_native_utc_events(self):
        lines = "\n".join([
            "Sun Nov 01 05:50:00 2026 kern.warn kernel: [100] dns-guard over cap: SRC=192.168.88.188",
            "Sun Nov 01 06:10:00 2026 kern.warn kernel: [1300] dns-guard over cap: SRC=192.168.88.188",
        ])
        event = collector.parse_dns_cap_events(lines, ["192.168.88.188"], {})[0]
        self.assertEqual(event["observed_at"], "2026-11-01T06:10:00+00:00")
        _, message = collector.dns_cap_message(snapshot()["routers"][0], event)
        self.assertIn("01:10:00 AM EST", message)

    def test_router_collection_requests_utc_log_timestamps(self):
        self.assertIn("TZ=UTC0 logread -e 'dns-guard over cap:'", collector.REMOTE_SCRIPT)

    def test_notice_has_device_observed_time_and_no_failure_label(self):
        collector.send_dns_cap_notices(snapshot())
        args = self.sent.call_args.args[0]
        self.assertEqual(args[1:3], ["DNS burst contained", "notice"])
        self.assertIn("HG-OFFICE", args[3])
        self.assertIn("04:04:55 PM EDT", args[3])
        self.assertIn("blocked", args[3])
        self.assertNotIn("FAILED", args[3])

    def test_unchanged_event_stays_quiet_across_days_and_restart(self):
        data = snapshot()
        collector.send_dns_cap_notices(data)
        data["collected_at"] = "2026-11-02T21:00:00+00:00"
        collector.send_dns_cap_notices(copy.deepcopy(data))
        collector.send_dns_cap_notices(copy.deepcopy(data))
        self.assertEqual(self.sent.call_count, 1)

    def test_continuous_events_are_one_episode_then_new_burst_posts(self):
        collector.send_dns_cap_notices(snapshot())
        second = snapshot("2026-10-30T20:05:55+00:00", 430)
        collector.send_dns_cap_notices(second)
        collector.send_dns_cap_notices(snapshot("2026-10-30T20:06:55+00:00", 435))
        self.assertEqual(self.sent.call_count, 1)
        collector.send_dns_cap_notices(snapshot("2026-10-30T20:06:55+00:00", 435))
        collector.send_dns_cap_notices(snapshot("2026-10-30T21:04:55+00:00", 440))
        self.assertEqual(self.sent.call_count, 2)

    def test_increasing_counter_extends_episode_even_without_log_sample(self):
        collector.send_dns_cap_notices(snapshot())
        collector.send_dns_cap_notices(snapshot(None, 430))
        collector.send_dns_cap_notices(snapshot("2026-10-30T20:06:55+00:00", 435))
        self.assertEqual(self.sent.call_count, 1)

    def test_missing_counter_does_not_prove_quiet(self):
        collector.send_dns_cap_notices(snapshot())
        collector.send_dns_cap_notices(snapshot(None, None))
        collector.send_dns_cap_notices(snapshot("2026-10-30T20:06:55+00:00", 435))
        self.assertEqual(self.sent.call_count, 1)

    def test_failed_collection_does_not_close_episode(self):
        collector.send_dns_cap_notices(snapshot())
        failed = snapshot(None, 426)
        failed["routers"][0]["reachable"] = False
        collector.send_dns_cap_notices(failed)
        collector.send_dns_cap_notices(snapshot("2026-10-30T20:05:55+00:00", 430))
        self.assertEqual(self.sent.call_count, 1)

    def test_old_missing_or_reordered_logs_do_not_replay(self):
        collector.send_dns_cap_notices(snapshot())
        collector.send_dns_cap_notices(snapshot(None))
        collector.send_dns_cap_notices(snapshot("2026-10-29T20:04:55+00:00"))
        collector.send_dns_cap_notices(snapshot())
        self.assertEqual(self.sent.call_count, 1)

    def test_failed_send_retains_original_notice_until_confirmed(self):
        self.sent.return_value = subprocess.CompletedProcess([], 1)
        collector.send_dns_cap_notices(snapshot())
        self.assertIn("pending", self.state_device())
        self.assertNotIn("delivered_at", self.state_device())
        first = self.sent.call_args.args[0]
        self.sent.return_value = subprocess.CompletedProcess([], 0)
        collector.send_dns_cap_notices(snapshot("2026-10-30T20:05:55+00:00", 430))
        self.assertEqual(self.sent.call_args.args[0], first)
        self.assertNotIn("pending", self.state_device())
        self.assertEqual(self.state_device()["delivered_at"], "2026-10-30T20:04:55+00:00")

    def test_interrupted_send_preserves_pending_state(self):
        self.sent.side_effect = subprocess.TimeoutExpired("monitoring-alert", 30)
        with self.assertRaises(subprocess.TimeoutExpired):
            collector.send_dns_cap_notices(snapshot())
        self.assertIn("pending", self.state_device())

    def test_seed_records_history_without_posting(self):
        collector.send_dns_cap_notices(snapshot(), seed=True)
        collector.send_dns_cap_notices(snapshot())
        self.sent.assert_not_called()
        collector.send_dns_cap_notices(snapshot("2026-10-30T21:04:55+00:00", 440))
        self.assertEqual(self.sent.call_count, 1)

    def test_history_without_log_time_does_not_invent_an_event(self):
        collector.send_dns_cap_notices(snapshot(None))
        collector.send_dns_cap_notices(snapshot(None, 430))
        self.sent.assert_not_called()

    def test_log_mode_does_not_claim_traffic_was_blocked(self):
        data = snapshot()
        data["routers"][0]["dns_guard"]["guard_mode"] = "log"
        collector.send_dns_cap_notices(data)
        args = self.sent.call_args.args[0]
        self.assertEqual(args[1], "DNS burst observed")
        self.assertIn("log-only", args[3])
        self.assertNotIn("was blocked", args[3])

    def test_fallback_and_host_failure_paths_are_preserved(self):
        data = snapshot(None)
        data["routers"][0]["dns_guard"]["fallback"] = {
            "mode": "fallback", "dry_run": False, "since": "2026-10-30T16:00:00-0400",
        }
        data["dns_guard_hosts"] = [{"hostname": "homelinux", "checked": True, "over_cap_events": 3}]
        collector.send_dns_alerts(data)
        calls = [call.args[0] for call in self.sent.call_args_list]
        self.assertEqual([(args[1], args[2]) for args in calls], [
            ("dns-fallback-flint-cabinet", "fail"), ("dns-guard-host-homelinux", "fail"),
        ])

    def test_fallback_recovery_is_preserved_but_router_cap_recovery_is_not_sent(self):
        collector.send_dns_alerts(snapshot(None))
        self.assertEqual(self.sent.call_args.args[0][1:3], ["dns-fallback-flint-cabinet", "ok"])
        self.assertEqual(self.sent.call_count, 1)

    def test_historical_cap_membership_does_not_degrade_router_health(self):
        fixture = """__SECTION__:hostname
flint-cabinet
__SECTION__:nextdns_status
running
__SECTION__:nextdns_config
profile 23b61e
profile 192.168.108.0/24=43d9e6
__SECTION__:route
default via 192.168.8.1
__SECTION__:internet_ping
3 packets transmitted, 3 packets received, 0% packet loss
__SECTION__:dns_fallback
{"mode":"nextdns","dry_run":false}
__SECTION__:dns_guard
Mode enforce
packets 426
elements = { 192.168.88.188 timeout 1d expires 22h }
"""
        with patch.object(collector, "run_ssh", return_value=subprocess.CompletedProcess([], 0, fixture)), \
             patch.object(collector, "persist_router_log_tail"), \
             patch.object(collector, "read_recent_lines", return_value=[]):
            row, _, _, _ = collector.collect_router(collector.ROUTERS[0])
        self.assertEqual(row["warnings"], [])
        self.assertEqual(row["dns_guard"]["over_cap_devices"], ["192.168.88.188"])

    def test_counter_reset_without_new_event_does_not_post(self):
        collector.send_dns_cap_notices(snapshot())
        collector.send_dns_cap_notices(snapshot(None, 0))
        self.assertEqual(self.sent.call_count, 1)
        collector.send_dns_cap_notices(snapshot("2026-10-30T21:04:55+00:00", 4))
        self.assertEqual(self.sent.call_count, 2)

    def test_disabled_alerts_write_no_delivery_state(self):
        with patch.dict(os.environ, {"HOME_NETWORK_ALERTS": "0"}):
            collector.send_dns_alerts(snapshot())
        self.sent.assert_not_called()
        self.assertFalse(self.state.exists())


if __name__ == "__main__":
    unittest.main()
