#!/usr/bin/env python3
"""Regression gate: the swarm may only move the numbers UP.

The owner's standing rule for this pass: "it should not regress, only get better."
A large parallel swarm cannot be trusted to self-police that, and agents are strongly
incentivised to report success, so the floor is enforced mechanically here instead.

    python scripts/orchestration/regression_gate.py capture   # write the floor
    python scripts/orchestration/regression_gate.py check     # compare against it

`check` exits non-zero if ANY tracked measure went backwards. It deliberately does not
"fix" anything and never edits a test - a regression is a report, not a negotiation.

Tracked measures:
  tsc_clean            bool   typecheck must stay clean once clean
  tests_passed         int    must never decrease
  tests_failed         int    must never increase
  test_files_passed    int    must never decrease

Known-flaky tests are listed in FLAKY and excluded from the failure count, because a
5s-timeout under full-suite parallel load that passes in isolation is not a regression.
Adding to that list is a deliberate, reviewable act - never do it to silence a real
failure.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FLOOR = os.path.join(REPO, "artifacts", "regression-floor.json")

# Proven flaky under full-suite parallel load; each passes repeatedly in isolation.
FLAKY = {
    "src/sound-event-inventory.test.ts",
    "src/killstreak-demo-media-finalizer.test.ts",
}


def _run(cmd, timeout):
    """Run a command, tolerating failure - a broken tree must still produce a report."""
    try:
        p = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True,
                           timeout=timeout, encoding="utf-8", errors="replace",
                           shell=(os.name == "nt"))
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as exc:  # noqa: BLE001
        return -1, f"EXCEPTION: {exc}"


def measure():
    rc, _ = _run("npx tsc --noEmit", 900)
    tsc_clean = rc == 0

    rc, out = _run("npx vitest run --reporter dot", 2400)
    # vitest summary lines, e.g. "Tests  4023 passed | 1 failed (4026)"
    passed = failed = files_passed = 0
    m = re.search(r"Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed", out)
    if m:
        failed = int(m.group(1) or 0)
        passed = int(m.group(2))
    m = re.search(r"Test Files\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed", out)
    if m:
        files_passed = int(m.group(2))

    # Discount only the named flakes, and only when they are the failing FILE.
    failing_files = set(re.findall(r"FAIL\s+(\S+\.test\.ts)", out))
    discounted = sorted(f for f in failing_files if f in FLAKY)
    real_failing = sorted(f for f in failing_files if f not in FLAKY)

    return {
        "tsc_clean": tsc_clean,
        "tests_passed": passed,
        "tests_failed": failed,
        "test_files_passed": files_passed,
        "failing_files": real_failing,
        "discounted_flaky": discounted,
    }


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    now = measure()

    if mode == "capture":
        os.makedirs(os.path.dirname(FLOOR), exist_ok=True)
        with open(FLOOR, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(now, fh, indent=2)
        print(json.dumps(now, indent=2))
        print(f"\nfloor written to {FLOOR}")
        return 0

    if not os.path.exists(FLOOR):
        print("NO FLOOR RECORDED - run 'capture' first.", file=sys.stderr)
        return 2

    with open(FLOOR, encoding="utf-8") as fh:
        floor = json.load(fh)

    regressions = []
    if floor["tsc_clean"] and not now["tsc_clean"]:
        regressions.append("tsc was clean and is now BROKEN")
    if now["tests_passed"] < floor["tests_passed"]:
        regressions.append(
            f"tests passing fell {floor['tests_passed']} -> {now['tests_passed']}")
    if now["tests_failed"] > floor["tests_failed"]:
        regressions.append(
            f"tests failing rose {floor['tests_failed']} -> {now['tests_failed']}")
    if now["test_files_passed"] < floor["test_files_passed"]:
        regressions.append(
            f"test files passing fell {floor['test_files_passed']} -> {now['test_files_passed']}")

    new_failures = sorted(set(now["failing_files"]) - set(floor.get("failing_files", [])))
    if new_failures:
        regressions.append("newly failing: " + ", ".join(new_failures))

    gained = now["tests_passed"] - floor["tests_passed"]
    print(json.dumps({
        "verdict": "REGRESSED" if regressions else "OK",
        "regressions": regressions,
        "tests_passed": now["tests_passed"],
        "delta_tests_passed": gained,
        "tsc_clean": now["tsc_clean"],
        "failing_files": now["failing_files"],
        "discounted_flaky": now["discounted_flaky"],
    }, indent=2))

    if regressions:
        print("\nREGRESSION. Do NOT weaken a test to clear this - fix the code, or "
              "revert the change that caused it.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
