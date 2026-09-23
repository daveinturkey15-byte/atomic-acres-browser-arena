#!/usr/bin/env python3
"""Primary-source reader for technique-lab group B (stable source IDs 18-34).

Fetches PUBLIC primary-source HTTP content only: the original URLs recorded in the
source packet, plus author-owned repository content at the pinned revision. Records one
attempt record per URL so that "read" and "blocked" are separately provable.

Deliberate constraints, all of them load-bearing:
  * no credentials, no auth headers, no cookie jar, no netrc, no env token lookup;
  * one bounded attempt per URL (no pools, no unbounded retry storms);
  * downloaded bytes are written to a cache OUTSIDE the repository and are never
    executed, imported, or vendored -- they are read as evidence only.

Usage:
  python source_reader.py --jobs jobs-phase1.json --out <cache-dir>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

USER_AGENT = "atomic-acres-technique-lab-source-reader/1.0 (public primary-source reading)"
TIMEOUT_SECONDS = 25
MAX_BYTES = 6 * 1024 * 1024


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def cache_name(url: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", url.split("://", 1)[-1])[:110].strip("-")
    return f"{slug}.{digest}"


def fetch(url: str, out_dir: pathlib.Path) -> dict:
    record: dict = {"url": url, "timestamp": utc_now()}
    started = time.monotonic()
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
    })
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read(MAX_BYTES + 1)
            truncated = len(body) > MAX_BYTES
            body = body[:MAX_BYTES]
            record["outcome"] = "ok"
            record["httpStatus"] = response.status
            record["finalUrl"] = response.geturl()
            record["contentType"] = response.headers.get("Content-Type")
            record["lastModified"] = response.headers.get("Last-Modified")
            record["bytes"] = len(body)
            record["truncated"] = truncated
            record["sha256"] = hashlib.sha256(body).hexdigest()
            path = out_dir / cache_name(url)
            path.write_bytes(body)
            record["localPath"] = str(path)
    except urllib.error.HTTPError as exc:
        detail = b""
        try:
            detail = exc.read(2048)
        except Exception:  # noqa: BLE001 - diagnostic only
            pass
        record["outcome"] = "http-error"
        record["httpStatus"] = exc.code
        record["error"] = f"HTTPError {exc.code} {exc.reason}"
        record["errorBodyExcerpt"] = detail.decode("utf-8", "replace")[:400]
    except urllib.error.URLError as exc:
        record["outcome"] = "url-error"
        record["error"] = f"URLError {exc.reason}"
    except (socket.timeout, TimeoutError):
        record["outcome"] = "timeout"
        record["error"] = f"timeout after {TIMEOUT_SECONDS}s"
    except Exception as exc:  # noqa: BLE001 - recorded verbatim, never swallowed
        record["outcome"] = "error"
        record["error"] = f"{type(exc).__name__}: {exc}"
    record["elapsedMs"] = round((time.monotonic() - started) * 1000)
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    jobs = json.loads(pathlib.Path(args.jobs).read_text(encoding="utf-8"))
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for job in jobs:
        url = job["url"] if isinstance(job, dict) else job
        record = fetch(url, out_dir)
        if isinstance(job, dict):
            record["sourceId"] = job.get("sourceId")
            record["role"] = job.get("role")
        results.append(record)
        print(json.dumps({k: record.get(k) for k in
                          ("sourceId", "role", "url", "outcome", "httpStatus", "bytes", "error")}),
              flush=True)

    attempts_path = out_dir / f"attempts-{pathlib.Path(args.jobs).stem}.json"
    attempts_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"ATTEMPTS_WRITTEN {attempts_path}", flush=True)
    ok = sum(1 for r in results if r["outcome"] == "ok")
    print(f"SUMMARY ok={ok} failed={len(results) - ok} total={len(results)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
