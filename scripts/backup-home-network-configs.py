#!/usr/bin/env python3
"""Back up Flint `/etc/config/*` privately and write redacted summaries."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ROUTERS = [
    {"role": "main", "hostname": "flint-cabinet", "ip": "192.168.8.1"},
    {"role": "office", "hostname": "flint-office", "ip": "192.168.8.113"},
    {"role": "school", "hostname": "flint-school", "ip": "192.168.8.246"},
]

SENSITIVE_RE = re.compile(r"(key|password|passwd|secret|token|psk|macaddr)\b", re.I)
EXPECTED_SSIDS_BY_ROLE = {
    "main": {"Heaviside", "Home-K", "HG-CORP"},
    "office": {"Heaviside", "Home-K-Office"},
    "school": {"Heaviside", "Home-K-School"},
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup-root", default="/var/lib/home-network-monitor/router-config-backups")
    parser.add_argument("--summary-root", default="/var/lib/home-network-monitor/router-config-summaries")
    args = parser.parse_args()

    backup_root = Path(args.backup_root)
    summary_root = Path(args.summary_root)
    backup_root.mkdir(parents=True, exist_ok=True)
    summary_root.mkdir(parents=True, exist_ok=True)

    failures = 0
    for router in ROUTERS:
        try:
            backup_router(router, backup_root, summary_root)
        except Exception as exc:
            failures += 1
            print(f"{router['hostname']}: {exc}", file=sys.stderr)
    return 0 if failures == 0 else 2


def backup_router(router: dict[str, str], backup_root: Path, summary_root: Path) -> None:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    host_dir = backup_root / router["hostname"] / timestamp
    host_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(host_dir, 0o700)

    files = remote_list(router["ip"])
    hashes: dict[str, str] = {}
    ssids: set[str] = set()
    warnings: list[str] = []
    nextdns_running = False
    kids_bridge_ok = False

    for remote_path in files:
        name = Path(remote_path).name
        content = remote_cat(router["ip"], remote_path)
        (host_dir / name).write_bytes(content)
        os.chmod(host_dir / name, 0o600)
        hashes[name] = hashlib.sha256(content).hexdigest()
        text = content.decode("utf-8", errors="ignore")
        if name == "wireless":
            ssids.update(re.findall(r"option\s+ssid\s+'([^']+)'", text))
            ssids.update(re.findall(r'option\s+ssid\s+"([^"]+)"', text))
            if "option network 'kids'" in text or 'option network "kids"' in text:
                kids_bridge_ok = True
        if name == "nextdns" and "config" in text:
            nextdns_running = True

    expected_ssids = EXPECTED_SSIDS_BY_ROLE.get(router["role"], {"Heaviside"})
    if not expected_ssids.issubset(ssids):
        warnings.append("expected SSIDs missing")
    if not kids_bridge_ok:
        warnings.append("kids SSID mapping not proven from wireless config")

    summary: dict[str, Any] = {
        "router_hostname": router["hostname"],
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "backup_path": str(host_dir),
        "hashes": hashes,
        "ssids": sorted(ssids),
        "kids_bridge_ok": kids_bridge_ok,
        "nextdns_running": nextdns_running,
        "warnings": warnings,
    }
    summary_path = summary_root / f"{router['hostname']}.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(summary_path, 0o640)


def remote_list(host: str) -> list[str]:
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", f"root@{host}", "find /etc/config -maxdepth 1 -type f -print"],
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "failed to list /etc/config")
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def remote_cat(host: str, path: str) -> bytes:
    if SENSITIVE_RE.search(Path(path).name):
        raise RuntimeError(f"refusing unexpected sensitive file name: {path}")
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", f"root@{host}", "cat", path],
        capture_output=True,
        timeout=20,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore").strip() or f"failed to read {path}")
    return proc.stdout


if __name__ == "__main__":
    sys.exit(main())
