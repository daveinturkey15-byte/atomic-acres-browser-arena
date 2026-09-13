#!/usr/bin/env python3
"""Primary-source reader for technique-lab group C (stable source IDs 35-50).

Fetches public HTTP primary sources named in the group-C source packet plus the
pinned repository files needed to inspect the code that actually implements each
method. Every attempt is recorded -- success or failure -- with a timestamp, the
HTTP outcome, the byte count, a sha256 of the body and the local cache path.

Boundaries this script keeps:
  - read-only public HTTP GET; no credentials, no auth headers, no cookie jar,
    no env/secret files, no connection pooling beyond urllib's default.
  - bounded timeout and bounded body size; a failure is recorded, never retried
    into a different URL and never replaced by a search substitute.
  - nothing fetched is executed, imported, installed or vendored into the repo.
    Bodies land in a scratch cache outside the committed tree; only the attempt
    records are committed.

Usage:
  python source-reader.py --targets targets.json --cache <dir> --out <file.json>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

USER_AGENT = (
    "atomic-acres-technique-lab/1.0 (source provenance reader; "
    "public primary-source retrieval only)"
)
MAX_BYTES = 4 * 1024 * 1024
TIMEOUT_SECONDS = 20


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def cache_name(url: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", url)[:110].strip("-")
    return f"{hashlib.sha256(url.encode('utf-8')).hexdigest()[:12]}-{slug}"


def fetch(url: str, cache_dir: pathlib.Path) -> dict:
    record: dict = {"url": url, "attemptedAt": utc_now()}
    started = time.time()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read(MAX_BYTES)
            record["outcome"] = "ok"
            record["httpStatus"] = response.status
            record["finalUrl"] = response.geturl()
            record["redirected"] = response.geturl() != url
            record["contentType"] = response.headers.get("Content-Type")
            record["bytes"] = len(body)
            record["sha256"] = hashlib.sha256(body).hexdigest()
            path = cache_dir / cache_name(url)
            path.write_bytes(body)
            record["localPath"] = str(path)
    except urllib.error.HTTPError as error:
        body = b""
        try:
            body = error.read(MAX_BYTES)
        except Exception:  # noqa: BLE001 - a body-less error is still a record
            pass
        record["outcome"] = "http-error"
        record["httpStatus"] = error.code
        record["error"] = f"HTTPError {error.code}: {error.reason}"
        record["bytes"] = len(body)
        if body:
            record["sha256"] = hashlib.sha256(body).hexdigest()
            path = cache_dir / (cache_name(url) + ".error")
            path.write_bytes(body)
            record["localPath"] = str(path)
    except Exception as error:  # noqa: BLE001 - record the exact failure text
        record["outcome"] = "error"
        record["error"] = f"{type(error).__name__}: {error}"
    record["elapsedMs"] = int((time.time() - started) * 1000)
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    targets = json.loads(pathlib.Path(args.targets).read_text(encoding="utf-8"))
    cache_dir = pathlib.Path(args.cache)
    cache_dir.mkdir(parents=True, exist_ok=True)

    attempts = []
    for target in targets:
        record = fetch(target["url"], cache_dir)
        record["sourceId"] = target["sourceId"]
        record["role"] = target.get("role", "primary-post")
        record["note"] = target.get("note")
        attempts.append(record)
        print(
            f"[{record['outcome']:>10}] {record.get('httpStatus', '-'):>4} "
            f"{record.get('bytes', 0):>8}B  id={record['sourceId']:<3} {target['url']}",
            flush=True,
        )
        time.sleep(0.4)

    pathlib.Path(args.out).write_text(
        json.dumps(
            {
                "generatedAt": utc_now(),
                "reader": "scripts/technique-lab/group-c/source-reader.py",
                "timeoutSeconds": TIMEOUT_SECONDS,
                "attemptCount": len(attempts),
                "attempts": attempts,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    ok = sum(1 for a in attempts if a["outcome"] == "ok")
    print(f"\n{ok}/{len(attempts)} retrieved; records written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
