#!/usr/bin/env python3
"""Read the locally cached primary-source bodies and print the parts that matter.

Separate from source_reader.py on purpose: fetching and interpreting are different
claims. This script only reads bytes already on disk. It never fetches and never
executes anything it reads.
"""

from __future__ import annotations

import html
import json
import os
import re
import sys

CACHE = os.path.join(os.environ.get("TEMP", "/tmp"), "technique-lab-group-a")

# Windows consoles default to cp1252 and these sources contain arrows and emoji.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def meta(doc: str, prop: str) -> str | None:
    m = re.search(
        r'<meta[^>]+(?:property|name)=["\']' + re.escape(prop) + r'["\'][^>]*content=["\'](.*?)["\']',
        doc,
        re.S | re.I,
    )
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\'](.*?)["\'][^>]*(?:property|name)=["\']' + re.escape(prop) + r'["\']',
            doc,
            re.S | re.I,
        )
    return html.unescape(m.group(1)) if m else None


def cmd_posts() -> None:
    for name in sorted(os.listdir(CACHE)):
        if not name.startswith("https___x.com"):
            continue
        doc = read(os.path.join(CACHE, name))
        print("=" * 78)
        print(name)
        for prop in ("og:title", "og:description", "description"):
            v = meta(doc, prop)
            if v:
                print(f"  {prop}: {v[:900]}")
        if "JavaScript is not available" in doc:
            print("  NOTE: server returned the no-JavaScript shell (login/JS wall)")


def cmd_tree() -> None:
    """Print a repository tree listing, optionally filtered by a regex."""
    key = sys.argv[2]
    pat = re.compile(sys.argv[3], re.I) if len(sys.argv) > 3 else None
    for name in sorted(os.listdir(CACHE)):
        if "git_trees" in name and key.lower() in name.lower():
            data = json.loads(read(os.path.join(CACHE, name)))
            rows = [t for t in data.get("tree", []) if t["type"] == "blob"]
            if pat:
                rows = [t for t in rows if pat.search(t["path"])]
            print(f"# {name}  ({len(rows)} blobs shown)")
            for t in sorted(rows, key=lambda r: -r.get("size", 0))[:120]:
                print(f"  {t.get('size', 0):>9}  {t['path']}")


def cmd_commit() -> None:
    for name in sorted(os.listdir(CACHE)):
        if "commits" in name:
            data = json.loads(read(os.path.join(CACHE, name)))
            c = data.get("commit", {})
            print(f"{name.split('_repos_')[-1][:60]}")
            print(f"  sha={data.get('sha')}")
            print(f"  date={c.get('author', {}).get('date')}  msg={(c.get('message') or '')[:90]!r}")
            print(f"  files={len(data.get('files', []) or [])}")


def cmd_head() -> None:
    """Print a byte range of a cached file, with line numbers."""
    needle = sys.argv[2]
    start = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 80
    hits = [n for n in sorted(os.listdir(CACHE)) if needle.lower() in n.lower()]
    if not hits:
        print(f"no cached file matching {needle!r}")
        return
    for name in hits[:1]:
        lines = read(os.path.join(CACHE, name)).splitlines()
        print(f"# {name}  ({len(lines)} lines)")
        for i in range(start - 1, min(start - 1 + count, len(lines))):
            print(f"{i + 1:>5}  {lines[i]}")


def cmd_grep() -> None:
    needle, pattern = sys.argv[2], re.compile(sys.argv[3], re.I)
    ctx = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    for name in sorted(os.listdir(CACHE)):
        if needle.lower() not in name.lower():
            continue
        lines = read(os.path.join(CACHE, name)).splitlines()
        hits = [i for i, line in enumerate(lines) if pattern.search(line)]
        if not hits:
            continue
        print(f"# {name}")
        for i in hits[:60]:
            for j in range(max(0, i - ctx), min(len(lines), i + ctx + 1)):
                print(f"{j + 1:>5}  {lines[j][:200]}")
            if ctx:
                print("  --")


if __name__ == "__main__":
    {"posts": cmd_posts, "tree": cmd_tree, "commit": cmd_commit, "head": cmd_head, "grep": cmd_grep}[
        sys.argv[1]
    ]()
