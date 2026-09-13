"""Compares two build-report.json snapshots file-by-file, so 'deterministic' is a measured
claim rather than an assertion about the seed.

    python docs/technique-lab/interiors/renders/compare_runs.py run-a.json run-b.json
"""

from __future__ import annotations

import hashlib
import json
import os
import sys


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    return {e["id"]: e for e in report["exports"]}


def main() -> int:
    a, b = load(sys.argv[1]), load(sys.argv[2])
    out_dir = os.path.dirname(os.path.abspath(sys.argv[2])) if len(sys.argv) > 2 else "."
    stable = differing = 0
    for asset_id in sorted(set(a) | set(b)):
        left, right = a.get(asset_id), b.get(asset_id)
        if left is None or right is None:
            print(f"ONLY-IN-ONE {asset_id}")
            differing += 1
            continue
        same = left["sha256"] == right["sha256"]
        stable += same
        differing += not same
        print(
            f"{'SAME    ' if same else 'DIFFERS '} {asset_id}  {left['sha256'][:16]} "
            f"{'==' if same else '!='} {right['sha256'][:16]}  "
            f"tris={left['triangles']}/{right['triangles']}"
        )
    print(f"stable={stable} differing={differing}")
    return 0 if differing == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
