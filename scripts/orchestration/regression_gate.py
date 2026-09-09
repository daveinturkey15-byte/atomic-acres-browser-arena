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

A file that fails in the full parallel suite is RE-RUN ALONE before it counts as a
regression. A 5s timeout under full-suite load that passes in isolation is not a
regression, and on 2026-08-25 exactly that ended an eight-hour autonomous run: three
consecutive REGRESSED verdicts stopped Pass 80 "for a human", and the human found the
tests passing. Load-induced flakes were previously excluded by a hardcoded FLAKY list,
which cannot know about a flake nobody has hit yet - so the list is now advisory and the
ISOLATION RE-RUN is authoritative.

That cuts both ways, and deliberately so: a FLAKY-listed file that fails ALONE is a real
failure and is reported. The list can no longer hide a test that has genuinely broken.
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
# Advisory only - a hint about which files have flaked before, NOT a licence to pass.
# Every failing file, listed or not, is judged by the isolation re-run below.
FLAKY = {
    "src/sound-event-inventory.test.ts",
    "src/killstreak-demo-media-finalizer.test.ts",
}


def passes_alone(test_file):
    """Re-run ONE test file by itself. Returns True only on a clean, parsed pass.

    This is the whole difference between 'a test is broken' and 'the machine was busy'.
    Anything ambiguous - a timeout, an exception, output we cannot parse - returns False,
    so an unreadable result is treated as a real failure rather than waved through.
    """
    rc, out = _run(f"npx vitest run {test_file} --reporter dot", 600)
    if rc != 0:
        return False
    m = re.search(r"Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed", out)
    return bool(m) and int(m.group(1) or 0) == 0 and int(m.group(2)) > 0


def _run(cmd, timeout):
    """Run a command, tolerating failure - a broken tree must still produce a report."""
    try:
        p = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True,
                           timeout=timeout, encoding="utf-8", errors="replace",
                           shell=(os.name == "nt"))
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as exc:  # noqa: BLE001
        return -1, f"EXCEPTION: {exc}"


TOOLCHAIN_BROKEN = re.compile(
    r"To get access to the TypeScript compiler|is not recognized as an internal|"
    r"Cannot find module|command not found|npm error|MODULE_NOT_FOUND", re.I)


def toolchain_ok():
    """Can the toolchain actually RUN? Distinct from whether the code is correct.

    On 2026-08-25 node_modules/.bin vanished, so npx could resolve neither tsc nor vitest.
    The gate reported REGRESSED in THREE SECONDS and the round committed anyway - it had no
    way to say "I could not measure". Four type errors went in unseen and the swarm built
    blind for two hours. A verifier that cannot distinguish 'the code is broken' from 'I am
    broken' will always blame the code.
    """
    for probe, tool in (("npx tsc --version", "tsc"), ("npx vitest --version", "vitest")):
        rc, out = _run(probe, 300)
        if rc != 0 or TOOLCHAIN_BROKEN.search(out):
            return False, f"{tool} cannot run: {out.strip().splitlines()[-1][:160] if out.strip() else 'no output'}"
    return True, ""


def heal_toolchain():
    """Rebuild node_modules/.bin. Returns True if the toolchain works afterwards.

    --ignore-scripts is REQUIRED: npm rebuild deadlocks because its own precompile step
    needs rimraf, which is itself one of the missing shims.
    """
    _run("npm install --ignore-scripts --no-audit --no-fund --prefer-offline", 1800)
    return toolchain_ok()[0]


def measure():
    ok, why = toolchain_ok()
    if not ok:
        # Try ONCE to repair before giving up. node_modules/.bin has vanished four times in
        # two days - cause still unknown, but a transient break should not be allowed to
        # block a publish when the repair takes four seconds and is verifiable.
        print(f"[gate] toolchain broken ({why}) - attempting one self-repair", file=sys.stderr)
        if heal_toolchain():
            print("[gate] self-repair succeeded; measuring", file=sys.stderr)
        else:
            return {"toolchain_broken": why + " (self-repair did not fix it)"}

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
    # Judge every failing file by re-running it ALONE, listed or not. The full-suite run
    # is 480 files in parallel; a single file on a quiet process is the honest test of
    # whether the code is broken.
    real_failing, discounted = [], []
    for f in sorted(failing_files):
        if passes_alone(f):
            discounted.append(f)
            print(f"[gate] {f} failed in the full suite but PASSES ALONE - "
                  f"load-induced, not a regression", file=sys.stderr)
        else:
            real_failing.append(f)
            if f in FLAKY:
                print(f"[gate] {f} is on the advisory FLAKY list but FAILS ALONE - "
                      f"reporting it as a real failure", file=sys.stderr)

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

    # UNMEASURABLE is not REGRESSED. Exit 3 so a caller can tell the two apart and STOP
    # rather than commit - the round that swept four type errors into the tree did so
    # because a 3-second toolchain failure looked exactly like a verdict.
    if now.get("toolchain_broken"):
        print(json.dumps({"verdict": "CANNOT_MEASURE",
                          "reason": now["toolchain_broken"],
                          "hint": "npm install --ignore-scripts restores node_modules/.bin; "
                                  "npm rebuild deadlocks because its precompile needs rimraf"},
                         indent=2))
        print("TOOLCHAIN BROKEN - this is NOT a regression verdict. Do not commit on it.",
              file=sys.stderr)
        return 3

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
    # The three count checks read the LOADED parallel run, so a file that was discounted
    # as load-induced still drags them down. Clearing the name but keeping the count would
    # report OK on the file and REGRESSED on the tally - the same false stop by another
    # route. Counts are only trusted when nothing had to be discounted.
    counts_trustworthy = not now["discounted_flaky"]
    if counts_trustworthy:
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
        "counts_trusted": counts_trustworthy,
    }, indent=2))

    if regressions:
        print("\nREGRESSION. Do NOT weaken a test to clear this - fix the code, or "
              "revert the change that caused it.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
