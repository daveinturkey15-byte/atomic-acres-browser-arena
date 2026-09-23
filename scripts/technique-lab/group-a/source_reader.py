#!/usr/bin/env python3
"""Primary-source reader for technique-lab group A (stable source IDs 1-17).

Fetches PUBLIC primary-source pages and repository file bodies over HTTP so that
each register row can be backed by content that was actually read, rather than by
URL metadata. Every attempt is recorded with a timestamp, an outcome, the HTTP
status, the byte length and a sha256 of the exact body received.

Deliberate constraints:
  * stdlib urllib only, bounded timeout, no credentials, no cookies, no auth
    headers, no connection pools, no retries beyond a single redirect chain;
  * bodies are cached OUTSIDE the repository (OS temp) so the worktree stays
    clean and no third-party code is vendored into this repository;
  * nothing downloaded is ever executed, imported, or installed.

Usage:
  python source_reader.py plan       # fetch packet URLs + repo metadata/licences
  python source_reader.py files      # fetch the specific implementation files
  python source_reader.py report     # write the attempt ledger into owned docs
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

PACKET = r"C:\Users\david\Documents\Codex\2026-09-11\p-le\work\technique-lab-20260912\sources-group-a.json"
CACHE = os.path.join(os.environ.get("TEMP", "/tmp"), "technique-lab-group-a")
LEDGER = os.path.join(CACHE, "attempts.json")
TIMEOUT = 25
UA = "atomic-acres-technique-lab/1.0 (primary-source review; contact repo owner)"

# Repository pins recorded in the register. Treated as historical claims until the
# commit endpoint confirms the SHA resolves.
REPOS = {
    1: ("squall01337/mixamo-llm-mocap", "00dfd5385506022d533c84f6737a09f5f4392623"),
    2: ("squall01337/abyssal-ocean", "142265f5013b6f27bea4f4f819b832dec75c7bad"),
    6: ("img2threejs/img2threejs", "d6673386f89673a58736f8d398dd16ece67874f5"),
    7: ("StarKnightt/night-street", "333f064778105640588a95d2c2d150780044e7bf"),
    8: ("StarKnightt/jungle-trail", "c15640d3a2b6f08ca68e4df98fdfc953ea8a070a"),
    9: ("millionco/react-doctor", "e183c3519010599d929ed14d99a18bf1f8f8a44c"),
    10: ("vibe-stack/vibe3d", "fb3ba78a5a21dd69db86018e74d279895501df33"),
    1010: ("keysforthewin/thaikit", "92095c48ae8792132b60dfb4052c9d7b2ad795f2"),
    13: ("mshumer/Claude-of-Duty", "d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853"),
    15: ("SamG-Coder/threepp", "367ec39da837224f076711b5d24d68be8280cc5a"),
    16: ("localai-org/kimodo.cpp", "92341f31940d54d4f0a44aa5975e470b78b2ab5c"),
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slug(url: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", url)[:150]


def load_ledger() -> list:
    if os.path.exists(LEDGER):
        with open(LEDGER, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return []


def save_ledger(rows: list) -> None:
    os.makedirs(CACHE, exist_ok=True)
    with open(LEDGER, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=2)


def fetch(url: str, kind: str, source_ids, ledger: list) -> dict:
    os.makedirs(CACHE, exist_ok=True)
    record = {
        "url": url,
        "kind": kind,
        "sourceIds": source_ids,
        "attemptedAt": now(),
        "outcome": None,
        "httpStatus": None,
        "bytes": None,
        "sha256": None,
        "localPath": None,
        "error": None,
    }
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read()
            record["httpStatus"] = resp.status
            record["finalUrl"] = resp.geturl()
            record["contentType"] = resp.headers.get("Content-Type")
    except urllib.error.HTTPError as exc:
        body = b""
        try:
            body = exc.read()
        except Exception:  # noqa: BLE001 - body is optional diagnostic detail
            pass
        record["httpStatus"] = exc.code
        record["outcome"] = "blocked"
        record["error"] = f"HTTPError {exc.code} {exc.reason}"
    except Exception as exc:  # noqa: BLE001 - network failures are data, not crashes
        record["outcome"] = "error"
        record["error"] = f"{type(exc).__name__}: {exc}"
        ledger.append(record)
        return record

    if body:
        path = os.path.join(CACHE, slug(url))
        with open(path, "wb") as fh:
            fh.write(body)
        record["bytes"] = len(body)
        record["sha256"] = hashlib.sha256(body).hexdigest()
        record["localPath"] = path
    if record["outcome"] is None:
        record["outcome"] = "ok" if body else "empty"
    ledger.append(record)
    return record


def api(repo: str, suffix: str) -> str:
    return f"https://api.github.com/repos/{repo}{suffix}"


def raw(repo: str, sha: str, path: str) -> str:
    return f"https://raw.githubusercontent.com/{repo}/{sha}/{path}"


def cmd_plan() -> None:
    with open(PACKET, "r", encoding="utf-8") as fh:
        packet = json.load(fh)
    ledger = load_ledger()
    seen = {r["url"] for r in ledger if r.get("outcome") == "ok"}

    for row in packet["rows"]:
        for url in row["urls"]:
            if url in seen:
                continue
            rec = fetch(url, "owner-shared-url", [row["id"]], ledger)
            print(f"[{row['id']}] {url} -> {rec['outcome']} {rec['httpStatus']} {rec['bytes']}")
            save_ledger(ledger)

    for key, (repo, sha) in REPOS.items():
        sid = 10 if key == 1010 else key
        for url, kind in (
            (api(repo, f"/commits/{sha}"), "github-commit"),
            (api(repo, f"/git/trees/{sha}?recursive=1"), "github-tree"),
        ):
            if url in seen:
                continue
            rec = fetch(url, kind, [sid], ledger)
            print(f"[{sid}] {kind} {repo} -> {rec['outcome']} {rec['httpStatus']} {rec['bytes']}")
            save_ledger(ledger)
        for name in ("LICENSE", "LICENSE.md", "LICENCE", "COPYING", "README.md"):
            url = raw(repo, sha, name)
            if url in seen:
                continue
            rec = fetch(url, "licence-or-readme", [sid], ledger)
            print(f"[{sid}] {name} {repo} -> {rec['outcome']} {rec['httpStatus']} {rec['bytes']}")
            save_ledger(ledger)
            if name.startswith("LICEN") and rec["outcome"] == "ok":
                break
    save_ledger(ledger)


def cmd_files() -> None:
    """Fetch the specific implementation files named in files.json."""
    spec_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "files.json")
    with open(spec_path, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    ledger = load_ledger()
    seen = {r["url"] for r in ledger if r.get("outcome") == "ok"}
    for item in spec:
        key = item["repoKey"]
        repo, sha = REPOS[int(key)]
        for path in item["paths"]:
            url = raw(repo, sha, path)
            if url in seen:
                print(f"[{item['sourceId']}] cached {path}")
                continue
            rec = fetch(url, "implementation-file", [item["sourceId"]], ledger)
            print(f"[{item['sourceId']}] {path} -> {rec['outcome']} {rec['httpStatus']} {rec['bytes']} {rec['localPath']}")
            save_ledger(ledger)
    save_ledger(ledger)


def cmd_report() -> None:
    ledger = load_ledger()
    out = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
        "docs", "technique-lab", "group-a", "fetch-attempts.json",
    )
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "generatedAt": now(),
                "tool": "scripts/technique-lab/group-a/source_reader.py",
                "note": "Bodies are cached outside the repository; only hashes and outcomes are committed.",
                "cacheRoot": CACHE,
                "attempts": ledger,
            },
            fh,
            indent=2,
        )
    print(f"wrote {out} ({len(ledger)} attempts)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "plan"
    {"plan": cmd_plan, "files": cmd_files, "report": cmd_report}[cmd]()
