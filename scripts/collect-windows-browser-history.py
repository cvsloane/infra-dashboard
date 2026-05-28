#!/usr/bin/env python3
"""Collect Chrome/Edge browser history from Windows laptops over SSH.

This is intentionally log/file based. It does not automate web portals, inspect
TLS traffic, or require a browser extension. The collector copies browser
History SQLite files to a temporary directory on the Windows host, downloads the
copies, parses visit rows locally, posts normalized events to infra-dashboard,
and then removes the remote temporary files.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import pathlib
import shutil
import ssl
import sqlite3
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

REMOTE_DIR = "C:/ProgramData/HomeActivityCollector"
WINDOWS_EPOCH_OFFSET_SECONDS = 11644473600


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect Windows browser history over SSH and ingest activity events.")
    parser.add_argument("--target", action="append", default=[], help="Target as LABEL=USER@HOST. Can be repeated.")
    parser.add_argument("--api-url", default=os.getenv("HOME_ACTIVITY_API_URL"), help="POST endpoint URL.")
    parser.add_argument("--host-header", default=os.getenv("HOME_ACTIVITY_HOST_HEADER"), help="Optional Host header for internal reverse-proxy routes.")
    parser.add_argument("--insecure-tls", action="store_true", default=os.getenv("HOME_ACTIVITY_INSECURE_TLS") == "1", help="Disable TLS verification for internal Tailnet collector posts.")
    parser.add_argument("--token", default=os.getenv("HOME_ACTIVITY_INGEST_TOKEN") or os.getenv("HOME_NETWORK_INGEST_TOKEN"))
    parser.add_argument("--since-minutes", type=int, default=int(os.getenv("HOME_ACTIVITY_LOOKBACK_MINUTES", "1440")))
    parser.add_argument("--work-dir", default=None, help="Local work directory. Defaults to a temp directory.")
    parser.add_argument("--sshpass", action="store_true", help="Use sshpass with SSHPASS from the environment.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print events without posting.")
    parser.add_argument("--keep-work-dir", action="store_true")
    args = parser.parse_args()

    if not args.target:
        parser.error("At least one --target LABEL=USER@HOST is required")
    if not args.dry_run and not args.api_url:
        parser.error("--api-url or HOME_ACTIVITY_API_URL is required unless --dry-run is set")
    if not args.dry_run and not args.token:
        parser.error("--token, HOME_ACTIVITY_INGEST_TOKEN, or HOME_NETWORK_INGEST_TOKEN is required unless --dry-run is set")

    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=max(args.since_minutes, 1))
    work_root = pathlib.Path(args.work_dir) if args.work_dir else pathlib.Path(tempfile.mkdtemp(prefix="home-activity-"))
    work_root.mkdir(parents=True, exist_ok=True)

    all_events: list[dict[str, Any]] = []
    errors: list[str] = []

    try:
        for target_spec in args.target:
            try:
                label, target = parse_target(target_spec)
                target_dir = work_root / safe_name(label)
                target_dir.mkdir(parents=True, exist_ok=True)
                snapshots = collect_target(label, target, target_dir, args.sshpass)
                all_events.extend(parse_snapshots(label, target, snapshots, since))
            except Exception as exc:  # noqa: BLE001 - collector should continue across devices
                errors.append(f"{target_spec}: {exc}")

        if args.dry_run:
            print(json.dumps({"events": all_events, "errors": errors}, indent=2, sort_keys=True))
        else:
            post_events(args.api_url, args.token, all_events, args.host_header, args.insecure_tls)
            print(json.dumps({"ok": True, "events": len(all_events), "errors": errors}, sort_keys=True))
    finally:
        if not args.keep_work_dir and not args.work_dir:
            shutil.rmtree(work_root, ignore_errors=True)

    return 1 if errors and not all_events else 0


def collect_target(label: str, target: str, local_dir: pathlib.Path, use_sshpass: bool) -> list[dict[str, str]]:
    script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$remoteDir = 'C:\ProgramData\HomeActivityCollector'
Remove-Item -Recurse -Force $remoteDir
New-Item -ItemType Directory -Force -Path $remoteDir | Out-Null
$patterns = @(
  @{Browser='Chrome'; Pattern='AppData\Local\Google\Chrome\User Data\*\History'},
  @{Browser='Edge'; Pattern='AppData\Local\Microsoft\Edge\User Data\*\History'}
)
$results = @()
foreach ($user in Get-ChildItem 'C:\Users' -Directory) {
  if ($user.Name -in @('Default','Default User','Public','All Users','defaultuser100000')) { continue }
  foreach ($item in $patterns) {
    foreach ($file in Get-ChildItem (Join-Path $user.FullName $item.Pattern) -File) {
      $profile = Split-Path $file.DirectoryName -Leaf
      $destName = (($user.Name + '__' + $item.Browser + '__' + $profile + '.sqlite') -replace '[^A-Za-z0-9_.-]', '_')
      $dest = Join-Path $remoteDir $destName
      Copy-Item $file.FullName $dest -Force
      $results += [pscustomobject]@{
        User=$user.Name
        Browser=$item.Browser
        Profile=$profile
        RemotePath=($dest -replace '\\','/')
        FileName=$destName
        SourcePath=$file.FullName
        LastWriteTime=$file.LastWriteTime.ToString('o')
      }
    }
  }
}
$results | ConvertTo-Json -Depth 4 -Compress
"""
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    output = run_ssh(target, [f"powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand {encoded}"], use_sshpass)
    inventory = parse_powershell_json(output)
    if isinstance(inventory, dict):
        inventory = [inventory]
    if not isinstance(inventory, list):
        raise RuntimeError("Windows history inventory was not a JSON array")

    snapshots: list[dict[str, str]] = []
    for item in inventory:
        if not isinstance(item, dict):
            continue
        remote_path = str(item.get("RemotePath") or "")
        file_name = str(item.get("FileName") or pathlib.PureWindowsPath(remote_path).name)
        if not remote_path or not file_name:
            continue
        local_path = local_dir / file_name
        run_scp(f"{target}:{remote_path}", str(local_path), use_sshpass)
        snapshots.append({
            "label": label,
            "target": target,
            "windows_user": str(item.get("User") or ""),
            "browser": str(item.get("Browser") or ""),
            "profile": str(item.get("Profile") or ""),
            "source_path": str(item.get("SourcePath") or ""),
            "local_path": str(local_path),
        })

    cleanup = "powershell.exe -NoProfile -Command \"Remove-Item -Recurse -Force C:\\ProgramData\\HomeActivityCollector\""
    subprocess.run(
        ssh_command(target, [cleanup], use_sshpass),
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=20,
    )
    return snapshots


def parse_snapshots(label: str, target: str, snapshots: list[dict[str, str]], since: dt.datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    hostname = target.split("@", 1)[-1]
    for snapshot in snapshots:
        path = snapshot["local_path"]
        if not pathlib.Path(path).exists():
            continue
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            rows = con.execute(
                """
                SELECT
                  visits.id,
                  visits.url,
                  visits.visit_time,
                  visits.from_visit,
                  visits.transition,
                  urls.url,
                  urls.title
                FROM visits
                JOIN urls ON urls.id = visits.url
                WHERE visits.visit_time >= ?
                ORDER BY visits.visit_time ASC
                """,
                [chrome_time_from_datetime(since)],
            ).fetchall()
        finally:
            con.close()

        for visit_id, url_id, visit_time, from_visit, transition, url, title in rows:
            timestamp = datetime_from_chrome_time(int(visit_time))
            event = build_event(
                label=label,
                hostname=hostname,
                snapshot=snapshot,
                visit_id=int(visit_id),
                url_id=int(url_id),
                timestamp=timestamp,
                url=str(url or ""),
                title=str(title or ""),
                from_visit=int(from_visit or 0),
                transition=int(transition or 0),
            )
            events.append(event)
    return events


def build_event(
    *,
    label: str,
    hostname: str,
    snapshot: dict[str, str],
    visit_id: int,
    url_id: int,
    timestamp: dt.datetime,
    url: str,
    title: str,
    from_visit: int,
    transition: int,
) -> dict[str, Any]:
    parsed = urllib.parse.urlparse(url)
    domain = parsed.netloc.lower()
    query = urllib.parse.parse_qs(parsed.query)
    event_type = "web_visit"
    search_query = extract_search_query(domain, query)
    video_id = extract_youtube_video_id(domain, parsed, query)
    place_id = extract_roblox_place_id(domain, parsed)
    ai_service = extract_ai_service(domain)

    if video_id:
        event_type = "youtube_video"
    elif search_query:
        event_type = "search"
    elif place_id:
        event_type = "roblox_game"
    elif ai_service:
        event_type = "ai_usage"

    source_key = "|".join([
        label,
        snapshot.get("windows_user", ""),
        snapshot.get("browser", ""),
        snapshot.get("profile", ""),
        str(visit_id),
        str(url_id),
        str(chrome_time_from_datetime(timestamp)),
        url,
    ])
    source_event_id = "browser-history:" + hashlib.sha256(source_key.encode("utf-8")).hexdigest()

    return {
        "source_event_id": source_event_id,
        "event_timestamp": timestamp.isoformat().replace("+00:00", "Z"),
        "child": label,
        "device_id": label,
        "hostname": hostname,
        "windows_user": snapshot.get("windows_user") or None,
        "source": "browser_history",
        "event_type": event_type,
        "app": snapshot.get("browser") or None,
        "browser": snapshot.get("browser") or None,
        "profile": snapshot.get("profile") or None,
        "url": url,
        "domain": domain,
        "title": title,
        "search_query": search_query,
        "video_id": video_id,
        "place_id": place_id,
        "ai_service": ai_service,
        "confidence": 0.95,
        "metadata": {
            "visit_id": visit_id,
            "url_id": url_id,
            "from_visit": from_visit,
            "transition": transition,
            "source_path": snapshot.get("source_path"),
        },
    }


def extract_search_query(domain: str, query: dict[str, list[str]]) -> str | None:
    search_param_domains = {
        "www.google.com": "q",
        "google.com": "q",
        "www.bing.com": "q",
        "bing.com": "q",
        "search.yahoo.com": "p",
        "duckduckgo.com": "q",
        "www.youtube.com": "search_query",
        "youtube.com": "search_query",
    }
    param = search_param_domains.get(domain)
    if not param:
        return None
    value = query.get(param, [""])[0].strip()
    return value or None


def extract_youtube_video_id(domain: str, parsed: urllib.parse.ParseResult, query: dict[str, list[str]]) -> str | None:
    if domain not in {"www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"}:
        return None
    if domain == "youtu.be":
        return parsed.path.strip("/") or None
    if parsed.path == "/watch":
        return query.get("v", [""])[0].strip() or None
    if parsed.path.startswith("/shorts/"):
        return parsed.path.split("/", 2)[2].split("/", 1)[0] or None
    return None


def extract_roblox_place_id(domain: str, parsed: urllib.parse.ParseResult) -> str | None:
    if domain not in {"www.roblox.com", "roblox.com"}:
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) >= 2 and parts[0].lower() in {"games", "experiences"} and parts[1].isdigit():
        return parts[1]
    return None


def extract_ai_service(domain: str) -> str | None:
    ai_domains = {
        "gemini.google.com": "gemini",
        "bard.google.com": "gemini",
        "copilot.microsoft.com": "copilot",
        "www.bing.com": "copilot",
        "chatgpt.com": "chatgpt",
        "claude.ai": "claude",
    }
    return ai_domains.get(domain)


def post_events(
    api_url: str,
    token: str,
    events: list[dict[str, Any]],
    host_header: str | None = None,
    insecure_tls: bool = False,
) -> None:
    context = ssl._create_unverified_context() if insecure_tls else None
    for start in range(0, len(events), 500):
        payload = json.dumps({"events": events[start:start + 500]}).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if host_header:
            headers["Host"] = host_header
        request = urllib.request.Request(
            api_url,
            data=payload,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30, context=context) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"ingest failed HTTP {exc.code}: {body}") from exc


def parse_target(value: str) -> tuple[str, str]:
    if "=" not in value:
        raise ValueError("target must be LABEL=USER@HOST")
    label, target = value.split("=", 1)
    if not label.strip() or not target.strip():
        raise ValueError("target must be LABEL=USER@HOST")
    return label.strip(), target.strip()


def run_ssh(target: str, remote_commands: list[str], use_sshpass: bool) -> str:
    result = subprocess.run(
        ssh_command(target, remote_commands, use_sshpass),
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=45,
    )
    return result.stdout


def run_scp(source: str, destination: str, use_sshpass: bool) -> None:
    subprocess.run(
        scp_command(source, destination, use_sshpass),
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=45,
    )


def ssh_command(target: str, remote_commands: list[str], use_sshpass: bool) -> list[str]:
    base = [
        "ssh",
        "-o", "BatchMode=no",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        target,
    ] + remote_commands
    if use_sshpass:
        return ["sshpass", "-e"] + base
    return base


def scp_command(source: str, destination: str, use_sshpass: bool) -> list[str]:
    base = [
        "scp",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        source,
        destination,
    ]
    if use_sshpass:
        return ["sshpass", "-e"] + base
    return base


def parse_powershell_json(output: str) -> Any:
    cleaned = output.strip()
    if cleaned.startswith("#< CLIXML"):
        lines = [line for line in cleaned.splitlines() if not line.startswith("#< CLIXML") and not line.startswith("<Objs ")]
        cleaned = "\n".join(lines).strip()
    start_candidates = [idx for idx in (cleaned.find("["), cleaned.find("{")) if idx >= 0]
    if not start_candidates:
        return []
    start = min(start_candidates)
    end = max(cleaned.rfind("]"), cleaned.rfind("}"))
    return json.loads(cleaned[start:end + 1])


def chrome_time_from_datetime(value: dt.datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    seconds = value.timestamp() + WINDOWS_EPOCH_OFFSET_SECONDS
    return int(seconds * 1_000_000)


def datetime_from_chrome_time(value: int) -> dt.datetime:
    seconds = (value / 1_000_000) - WINDOWS_EPOCH_OFFSET_SECONDS
    return dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc)


def safe_name(value: str) -> str:
    return "".join(char if char.isalnum() or char in "._-" else "_" for char in value)


if __name__ == "__main__":
    sys.exit(main())
