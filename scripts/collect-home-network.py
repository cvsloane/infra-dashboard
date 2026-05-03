#!/usr/bin/env python3
"""Collect a sanitized Flint/OpenWrt home-network snapshot from homelinux."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any


ROUTERS = [
    {"role": "main", "hostname": "flint-cabinet", "ip": "192.168.8.1"},
    {"role": "office", "hostname": "flint-office", "ip": "192.168.8.113"},
    {"role": "school", "hostname": "flint-school", "ip": "192.168.8.246"},
]

REMOTE_SCRIPT = r"""
echo __SECTION__:hostname
cat /proc/sys/kernel/hostname 2>/dev/null || true
echo __SECTION__:uptime
cat /proc/uptime 2>/dev/null || true
echo __SECTION__:loadavg
cat /proc/loadavg 2>/dev/null || true
echo __SECTION__:board
ubus call system board 2>/dev/null || true
echo __SECTION__:ip_addr
ip -4 addr 2>/dev/null || true
echo __SECTION__:route
ip route 2>/dev/null || true
for iface in wan lan kids; do
  echo __SECTION__:ifstatus_$iface
  ifstatus "$iface" 2>/dev/null || true
done
echo __SECTION__:nextdns_status
nextdns status 2>/dev/null || true
echo __SECTION__:nextdns_config
nextdns config 2>/dev/null || true
echo __SECTION__:dhcp_leases
cat /tmp/dhcp.leases 2>/dev/null || true
echo __SECTION__:iwinfo
iwinfo 2>/dev/null || true
for dev in $(iwinfo 2>/dev/null | awk '/ESSID:/ {print $1}'); do
  echo __SECTION__:iwinfo_iface_$dev
  iwinfo "$dev" info 2>/dev/null || true
  echo __SECTION__:assoc_$dev
  iwinfo "$dev" assoclist 2>/dev/null || true
done
echo __SECTION__:internet_ping
ping -c 3 -W 2 1.1.1.1 2>/dev/null || true
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="collect one snapshot")
    parser.add_argument("--output", default="/var/lib/home-network-monitor/latest.json")
    parser.add_argument("--post-url", default=os.environ.get("HOME_NETWORK_INGEST_URL"))
    parser.add_argument("--token", default=os.environ.get("HOME_NETWORK_INGEST_TOKEN"))
    parser.add_argument("--router-config", default=os.environ.get("HOME_NETWORK_ROUTERS"))
    args = parser.parse_args()

    routers = load_routers(args.router_config)
    snapshot = collect_snapshot(routers)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.post_url:
      post_snapshot(args.post_url, args.token, snapshot)

    print(json.dumps({"status": snapshot["status"], "routers": len(snapshot["routers"]), "clients": len(snapshot["clients"])}))
    return 0 if snapshot["status"] in {"ok", "warning"} else 2


def load_routers(raw: str | None) -> list[dict[str, str]]:
    if not raw:
        return ROUTERS
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError("HOME_NETWORK_ROUTERS must be a JSON array")
    return parsed


def collect_snapshot(routers: list[dict[str, str]]) -> dict[str, Any]:
    collected_at = dt.datetime.now(dt.timezone.utc).astimezone().isoformat()
    router_rows: list[dict[str, Any]] = []
    clients: list[dict[str, Any]] = []
    dns_rows: list[dict[str, Any]] = []
    warnings: list[str] = []

    for router in routers:
        row, router_clients, dns = collect_router(router)
        router_rows.append(row)
        clients.extend(router_clients)
        dns_rows.append(dns)
        warnings.extend(row.get("warnings", []))

    status = "error" if any(not r["reachable"] for r in router_rows) else "warning" if warnings else "ok"
    if any((r.get("nextdns") or {}).get("running") is False for r in router_rows):
        status = "error"

    return {
        "schema_version": 1,
        "collected_at": collected_at,
        "collector_host": os.uname().nodename,
        "status": status,
        "routers": router_rows,
        "clients": clients,
        "dns": {
            "baseline_profile": "23b61e",
            "kids_profile": "43d9e6",
            "routers": dns_rows,
        },
        "warnings": sorted(set(warnings)),
    }


def collect_router(router: dict[str, str]) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    role = router["role"]
    expected_hostname = router["hostname"]
    ip = router["ip"]
    warnings: list[str] = []
    result = run_ssh(ip, REMOTE_SCRIPT)
    sections = split_sections(result.stdout)
    reachable = result.returncode == 0 and bool(section_text(sections, "hostname"))
    hostname = section_text(sections, "hostname").strip() or expected_hostname

    if not reachable:
        warnings.append(f"{expected_hostname} unreachable over SSH")
        row = {
            "hostname": expected_hostname,
            "role": role,
            "management_ip": ip,
            "reachable": False,
            "warnings": warnings,
        }
        return row, [], {"router_hostname": expected_hostname, "running": False, "message": "SSH unreachable"}

    wan = parse_ifstatus(section_text(sections, "ifstatus_wan"), "wan")
    lan = parse_ifstatus(section_text(sections, "ifstatus_lan"), "lan")
    kids = parse_ifstatus(section_text(sections, "ifstatus_kids"), "kids")
    nextdns = parse_nextdns(hostname, section_text(sections, "nextdns_status"), section_text(sections, "nextdns_config"))
    ping = parse_ping(section_text(sections, "internet_ping"))
    radios, clients = parse_wifi_sections(hostname, role, sections)
    leases = parse_dhcp_leases(section_text(sections, "dhcp_leases"))
    merge_leases(clients, leases)

    if nextdns.get("running") is False:
        warnings.append(f"{hostname} NextDNS is down")
    if role in {"office", "school"} and wan.get("up") is False:
        warnings.append(f"{hostname} uplink is down")
    if ping.get("ok") is False:
        warnings.append(f"{hostname} internet ping failed")
    if role == "main" and not route_has_default(section_text(sections, "route")):
        warnings.append(f"{hostname} default route missing")
    ssids = {r.get("ssid") for r in radios}
    if radios and not {"Heaviside", "Home-K"}.issubset(ssids):
        warnings.append(f"{hostname} expected SSIDs missing")

    row = {
        "hostname": hostname,
        "role": role,
        "management_ip": ip,
        "reachable": True,
        "uptime_sec": parse_uptime(section_text(sections, "uptime")),
        "load": parse_load(section_text(sections, "loadavg")),
        "firmware": parse_firmware(section_text(sections, "board")),
        "wan": wan,
        "lan": lan,
        "kids": kids,
        "internet_ping": ping,
        "nextdns": nextdns,
        "radios": radios,
        "warnings": warnings,
    }
    return row, clients, nextdns


def run_ssh(host: str, script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", f"root@{host}", "sh -s"],
        input=script,
        text=True,
        capture_output=True,
        timeout=40,
        check=False,
    )


def split_sections(output: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current = "preamble"
    for line in output.splitlines():
        if line.startswith("__SECTION__:"):
            current = line.split(":", 1)[1]
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return {key: "\n".join(value).strip() for key, value in sections.items()}


def section_text(sections: dict[str, str], name: str) -> str:
    return sections.get(name, "")


def parse_ifstatus(raw: str, name: str) -> dict[str, Any]:
    if not raw:
        return {"name": name}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"name": name, "details": {"raw_parse": "failed"}}

    addresses = data.get("ipv4-address") or []
    routes = data.get("route") or []
    address = None
    subnet = None
    if addresses:
        first = addresses[0]
        address = first.get("address")
        mask = first.get("mask")
        subnet = f"{address}/{mask}" if address and mask else address
    gateway = next((r.get("nexthop") for r in routes if r.get("target") == "0.0.0.0"), None)
    return {
        "name": name,
        "up": bool(data.get("up")),
        "address": address,
        "gateway": gateway,
        "subnet": subnet,
        "dhcp_active": bool(address),
    }


def parse_nextdns(hostname: str, status_raw: str, config_raw: str) -> dict[str, Any]:
    combined = f"{status_raw}\n{config_raw}"
    running = "running" in status_raw.lower()
    if "not running" in status_raw.lower() or "stopped" in status_raw.lower():
        running = False
    ids = sorted(set(re.findall(r"\b[0-9a-f]{6}\b", combined, flags=re.I)))
    conditional = []
    for subnet, profile in re.findall(r"(\d+\.\d+\.\d+\.\d+/\d+).*?([0-9a-f]{6})", combined, flags=re.I):
        conditional.append({"subnet": subnet, "profile": profile})
    return {
        "router_hostname": hostname,
        "running": running,
        "baseline_profile": "23b61e" if "23b61e" in combined else (ids[0] if ids else None),
        "kids_profile": "43d9e6" if "43d9e6" in combined else None,
        "conditional_profiles": conditional,
        "test_ok": running,
        "message": first_nonempty_line(status_raw),
    }


def parse_ping(raw: str) -> dict[str, Any]:
    if not raw:
        return {"ok": False}
    loss_match = re.search(r"(\d+(?:\.\d+)?)% packet loss", raw)
    rtt_match = re.search(r"=\s*([\d.]+)/([\d.]+)/([\d.]+)/", raw)
    loss = float(loss_match.group(1)) if loss_match else 100.0
    out = {"ok": loss < 100, "loss_percent": loss}
    if rtt_match:
        out.update({"avg_ms": float(rtt_match.group(2)), "max_ms": float(rtt_match.group(3))})
    return out


def parse_wifi_sections(hostname: str, role: str, sections: dict[str, str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    radios: list[dict[str, Any]] = []
    clients: list[dict[str, Any]] = []
    for key, raw in sections.items():
        if not key.startswith("iwinfo_iface_"):
            continue
        iface = key.removeprefix("iwinfo_iface_")
        radio = parse_radio(hostname, iface, raw)
        radios.append(radio)
        assoc_raw = section_text(sections, f"assoc_{iface}")
        assoc_clients = parse_assoc(hostname, role, radio, assoc_raw)
        clients.extend(assoc_clients)
        radio["association_count"] = len(assoc_clients)
    return radios, clients


def parse_radio(hostname: str, iface: str, raw: str) -> dict[str, Any]:
    ssid = match_text(r'ESSID: "([^"]+)"', raw)
    channel = match_text(r"Channel:\s*([^\s]+)", raw)
    bssid = match_text(r"Access Point:\s*([0-9A-Fa-f:]{17})", raw)
    tx_power = match_text(r"Tx-Power:\s*([\d.]+)", raw)
    return {
        "router_hostname": hostname,
        "interface": iface,
        "ssid": ssid,
        "band": band_from_channel(channel),
        "channel": channel,
        "bssid": bssid,
        "tx_power_dbm": float(tx_power) if tx_power else None,
    }


def parse_assoc(hostname: str, role: str, radio: dict[str, Any], raw: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in raw.splitlines():
        mac_match = re.match(r"^([0-9A-Fa-f:]{17})\s+(-?\d+)\s+dBm", line.strip())
        if not mac_match:
            continue
        rate_values = [float(v) for v in re.findall(r"([\d.]+)\s+MBit/s", line)]
        out.append({
            "mac": mac_match.group(1).lower(),
            "router_hostname": hostname,
            "router_role": role,
            "ssid": radio.get("ssid"),
            "band": radio.get("band"),
            "bssid": radio.get("bssid"),
            "signal_dbm": int(mac_match.group(2)),
            "rx_rate_mbps": rate_values[0] if rate_values else None,
            "tx_rate_mbps": rate_values[1] if len(rate_values) > 1 else (rate_values[0] if rate_values else None),
        })
    return out


def parse_dhcp_leases(raw: str) -> dict[str, dict[str, str]]:
    leases: dict[str, dict[str, str]] = {}
    now = dt.datetime.now(dt.timezone.utc)
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        expiry, mac, ip, hostname = parts[:4]
        expires_at = None
        if expiry.isdigit() and int(expiry) > 0:
            expires_at = dt.datetime.fromtimestamp(int(expiry), tz=dt.timezone.utc).isoformat()
        elif expiry == "0":
            expires_at = now.isoformat()
        leases[mac.lower()] = {"ip": ip, "hostname": hostname if hostname != "*" else "", "lease_expires_at": expires_at or ""}
    return leases


def merge_leases(clients: list[dict[str, Any]], leases: dict[str, dict[str, str]]) -> None:
    for client in clients:
        lease = leases.get(client["mac"].lower())
        if not lease:
            continue
        if lease.get("ip"):
            client["ip"] = lease["ip"]
        if lease.get("hostname"):
            client["hostname"] = lease["hostname"]
        if lease.get("lease_expires_at"):
            client["lease_expires_at"] = lease["lease_expires_at"]


def parse_uptime(raw: str) -> int | None:
    first = raw.split()[0] if raw.split() else None
    return int(float(first)) if first else None


def parse_load(raw: str) -> list[float] | None:
    parts = raw.split()[:3]
    return [float(p) for p in parts] if len(parts) == 3 else None


def parse_firmware(raw: str) -> str | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data.get("release", {}).get("description") or data.get("model")


def route_has_default(raw: str) -> bool:
    return any(line.startswith("default ") for line in raw.splitlines())


def first_nonempty_line(raw: str) -> str | None:
    return next((line.strip() for line in raw.splitlines() if line.strip()), None)


def match_text(pattern: str, raw: str) -> str | None:
    match = re.search(pattern, raw)
    return match.group(1) if match else None


def band_from_channel(channel: str | None) -> str | None:
    if not channel:
        return None
    try:
        value = int(channel)
    except ValueError:
        return None
    if value <= 14:
        return "2.4 GHz"
    if value < 200:
        return "5 GHz"
    return "6 GHz"


def post_snapshot(url: str, token: str | None, snapshot: dict[str, Any]) -> None:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url,
        data=json.dumps(snapshot).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        if response.status >= 300:
            raise RuntimeError(f"ingest failed: HTTP {response.status}")


if __name__ == "__main__":
    sys.exit(main())
