#!/usr/bin/env python3
"""Tiered verification: cheap and local per agent, expensive and shared per round.

    python scripts/orchestration/verify.py tier1 --id <task-id> --tests src/ui
    python scripts/orchestration/verify.py tier2
    python scripts/orchestration/verify.py tier3

WHY TIERS. Measured on this machine 2026-08-25:

    an ox-alpha agent                      0.35 GB
    npx tsc --noEmit           11.5 s      3.41 GB
    npx vitest run (all)       27.9 s      5.63 GB
    tsc --incremental (warm)    3.6 s      2.52 GB   <- tier 1
    vitest run <one dir>        2.6 s      1.89 GB   <- tier 1

Verification costs up to SIXTEEN TIMES the agent that runs it, so five agents each running
the full pair is ~28 GB and the machine dies. Tier 1 gives an agent the feedback it actually
needs for a fraction of that.

THE LIMIT, stated plainly because it decides the design: verification cannot simply be
DEFERRED, only TIERED. If five agents edit and a single gate then fails, nobody knows whose
change broke it and the answer is a bisect. Tier 1 exists to keep ATTRIBUTION cheap - it is
the smallest check that still points at one agent. Tier 2 and 3 catch what no local check
can: cross-file breakage, source-pinned contracts, and the production bundle.

TIER 1  per agent, after every meaningful edit. Incremental typecheck + that agent's own
        tests. Fast enough to run often, which is the point.
TIER 2  once per round, after agents quiesce. Full typecheck + full suite + regression gate.
TIER 3  before a build or a hand-off. Production bundle + all six arenas booted on real
        WebGPU. Catches the class the dev server structurally cannot.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
GOVERNOR = os.path.join(HERE, "governor.py")
GATE = os.path.join(HERE, "regression_gate.py")
BUILDINFO_DIR = os.path.join(REPO, "artifacts", "tsbuild")


def sh(cmd, timeout=2400):
    p = subprocess.run(cmd, cwd=REPO, shell=True, capture_output=True, text=True,
                       timeout=timeout, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def slot(action, ident):
    """Take/release a verify slot. Only tier 2 and 3 need one; tier 1 is deliberately cheap
    enough to run unguarded, which is what makes agents willing to run it often."""
    subprocess.run([sys.executable, GOVERNOR, f"verify-{action}", "--id", ident],
                   capture_output=True, timeout=1800)


def tier1(ident, tests):
    """Cheap, local, attributable. No slot needed."""
    os.makedirs(BUILDINFO_DIR, exist_ok=True)
    # A buildinfo cache PER AGENT. A shared one would be corrupted by concurrent writers,
    # and the whole speed-up depends on the cache surviving between an agent's own runs.
    info = os.path.join(BUILDINFO_DIR, f"{ident}.tsbuildinfo")
    t0 = time.time()
    rc, out = sh(f'npx tsc --noEmit --incremental --tsBuildInfoFile "{info}"', timeout=900)
    print(f"[tier1] tsc incremental: {'clean' if rc == 0 else 'FAILED'} ({time.time() - t0:.1f}s)")
    if rc != 0:
        print(out[:2500])
        return 1
    if tests:
        t0 = time.time()
        rc2, out2 = sh(f"npx vitest run {tests} --reporter dot", timeout=1200)
        tail = [l for l in out2.strip().splitlines() if "Tests" in l or "Test Files" in l]
        print(f"[tier1] vitest {tests}: {'pass' if rc2 == 0 else 'FAILED'} "
              f"({time.time() - t0:.1f}s) {' | '.join(t.strip() for t in tail)}")
        if rc2 != 0:
            print(out2[-2500:])
            return 1
    return 0


def tier2(ident):
    """Full typecheck, full suite, regression gate. Slot-guarded: this is the 5.63 GB one."""
    slot("acquire", ident)
    try:
        t0 = time.time()
        rc, out = sh("npx tsc --noEmit", timeout=900)
        print(f"[tier2] tsc: {'clean' if rc == 0 else 'FAILED'} ({time.time() - t0:.1f}s)")
        if rc != 0:
            print(out[:2500])
        t0 = time.time()
        rc2, out2 = sh("npx vitest run --reporter dot", timeout=2400)
        tail = [l for l in out2.strip().splitlines() if "Tests" in l or "Test Files" in l]
        print(f"[tier2] vitest full: ({time.time() - t0:.1f}s) {' | '.join(t.strip() for t in tail)}")
        rc3, out3 = sh(f'"{sys.executable}" "{GATE}" check', timeout=3600)
        print(f"[tier2] regression gate: {'OK' if rc3 == 0 else 'REGRESSED'}")
        if rc3 != 0:
            print(out3[-1500:])
        return 0 if (rc == 0 and rc2 == 0 and rc3 == 0) else 1
    finally:
        slot("release", ident)


def tier3(ident, port):
    """Production bundle + all six arenas on real WebGPU.

    The dev server is NOT the shipped artefact: a production bundle once crashed the GPU
    process with a TSL error the dev server never showed. Only this tier can catch that.
    """
    slot("acquire", ident)
    try:
        rc, out = sh("npx vite build --outDir dist-verify", timeout=1800)
        print(f"[tier3] build: {'ok' if rc == 0 else 'FAILED'}")
        if rc != 0:
            print(out[-2000:])
            return 1
        srv = subprocess.Popen(
            f"npx vite preview --outDir dist-verify --host 127.0.0.1 --port {port} --strictPort",
            cwd=REPO, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(8)
            arenas = "atomic-acres,skyline-terminal,rustworks-1v1,gun-range,high-seas,farcrysis"
            rc2, out2 = sh(f"node scripts/qa/verify-arena-boot-cdp.mjs "
                           f"--url http://127.0.0.1:{port} --arenas {arenas} --per-arena 180000",
                           timeout=3600)
            print(out2[-1800:])
            return rc2
        finally:
            srv.terminate()
    finally:
        slot("release", ident)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tier", choices=["tier1", "tier2", "tier3"])
    ap.add_argument("--id", default="anon")
    ap.add_argument("--tests", default="", help="tier1: your own test path, e.g. src/ui")
    ap.add_argument("--port", type=int, default=41915)
    a = ap.parse_args()
    if a.tier == "tier1":
        return tier1(a.id, a.tests)
    if a.tier == "tier2":
        return tier2(a.id)
    return tier3(a.id, a.port)


if __name__ == "__main__":
    sys.exit(main())
