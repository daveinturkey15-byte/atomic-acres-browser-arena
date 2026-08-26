#!/usr/bin/env python3
"""Publish Pass 80 to GitHub Pages - but ONLY if it has earned it.

Owner, 2026-08-25 19:00: "Once you are confident in the new version publish it as pass 80
to gh pages but dont delete the older versions on there, and i will test it on gh pages to
provide feedback in the morning."

Two words matter there: CONFIDENT, and DON'T DELETE.

CONFIDENT is not a feeling, so this script refuses to publish unless it has proved:
  - the regression gate returns OK (not REGRESSED, and not CANNOT_MEASURE - a toolchain
    that cannot run is not a pass, and today it was mistaken for one for two hours)
  - a PRODUCTION bundle builds
  - all six arenas boot on a REAL WebGPU device from that bundle
Any failure means it publishes nothing and says exactly why. Shipping an unverified build
to a URL the owner will open in the morning is worse than shipping nothing.

DON'T DELETE is structural, not careful-handling: Pass 80 goes in as a THIRD channel
alongside the existing two, and the channel config is edited by parsing the existing map and
ADDING a key. Nothing is overwritten, so there is no path where an older release is lost.

    python scripts/orchestration/publish_pass80.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
GATE = os.path.join(HERE, "regression_gate.py")
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
DIST = os.path.join(REPO, "dist-pass80-publish")
WORKTREE = os.path.join(REPO, ".gh-pages-publish")
CHANNEL = "channels/pass80"
PORT = 41930
ARENAS = "atomic-acres,skyline-terminal,rustworks-1v1,gun-range,high-seas,farcrysis"


def log(m):
    line = f"[publish] {time.strftime('%H:%M:%S')} {m}"
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def sh(cmd, cwd=REPO, timeout=3600):
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True,
                       text=True, timeout=timeout, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def wait_for_quiet(max_wait_s=2700):
    """Do not measure a tree while a swarm is hammering it.

    Both overnight publish attempts were refused on a REGRESSED verdict in which every
    named file was then discounted as passing in isolation - sixteen of them on one run.
    That is not a broken tree, it is a full suite of 480 files timing out against 19 agents
    for the same CPU. The gate was right that it could not trust the counts; what nobody had
    told it was to wait. Measuring under load produces a verdict about the MACHINE, not the
    code, and it blocked a build that had probably earned publication twice.
    """
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        n = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "@(Get-Process -Name omp-windows-x64 -EA SilentlyContinue).Count"],
                           capture_output=True, text=True, timeout=240).stdout.strip()
        if (n or "0") == "0":
            time.sleep(20)   # let the last writes land before reading the tree
            return True
        log(f"{n} agents still working - holding the measurement until the machine is quiet")
        time.sleep(60)
    log("agents did not drain in time; measuring anyway and treating the result with suspicion")
    return False


def prove_it_is_worth_publishing():
    """Every check that stands between a build and the owner's browser."""
    wait_for_quiet()
    rc, out = sh([sys.executable, GATE, "check"])
    if rc == 3:
        return False, f"the gate could NOT RUN, so nothing verified this build: {out[-300:]}"
    if rc != 0:
        return False, f"regression gate says REGRESSED: {out[-400:]}"
    log("gate OK")

    if os.path.isdir(DIST):
        shutil.rmtree(DIST, ignore_errors=True)
    rc, out = sh(f'npx vite build --outDir "{os.path.basename(DIST)}" --logLevel error', timeout=2400)
    if rc != 0:
        return False, f"production build FAILED: {out[-400:]}"
    log("production bundle built")

    srv = subprocess.Popen(
        f'npx vite preview --outDir "{os.path.basename(DIST)}" --host 127.0.0.1 '
        f"--port {PORT} --strictPort",
        cwd=REPO, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(10)
        rc, out = sh(f"node scripts/qa/verify-arena-boot-cdp.mjs --url http://127.0.0.1:{PORT} "
                     f"--arenas {ARENAS} --per-arena 240000", timeout=5400)
        if rc != 0 or '"verdict": "PASS"' not in out:
            return False, f"six-arena WebGPU boot did NOT pass: {out[-600:]}"
        log("six arenas booted on real WebGPU")
    finally:
        srv.terminate()
    return True, ""


def publish():
    """Add Pass 80 as a THIRD channel. Nothing existing is touched."""
    sh(f'git worktree remove --force "{WORKTREE}"')
    shutil.rmtree(WORKTREE, ignore_errors=True)
    rc, out = sh(f'git worktree add "{WORKTREE}" gh-pages')
    if rc != 0:
        return False, f"could not check out gh-pages: {out[-300:]}"

    target = os.path.join(WORKTREE, *CHANNEL.split("/"))
    # Replace only THIS channel's directory; the sibling channels are never touched.
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(DIST, target)

    cfg_path = os.path.join(WORKTREE, "release-channel-config.js")
    cfg = open(cfg_path, encoding="utf-8").read()
    m = re.search(r"=\s*(\{.*\})\s*;?\s*$", cfg.strip(), re.S)
    if not m:
        return False, "release-channel-config.js is not in the shape this script understands"
    channels = json.loads(m.group(1))
    before = set(channels)
    channels["pass80"] = {
        "label": "PASS 80",
        "description": "Overnight refinement pass: invisible-geometry sweep, arena work and "
                       "the full owner-request backlog. Earlier passes remain live.",
        "pass": "PASS 80",
        "path": CHANNEL,
    }
    lost = before - set(channels)
    if lost:
        return False, f"REFUSING: this would have dropped existing channels {sorted(lost)}"
    open(cfg_path, "w", encoding="utf-8", newline="\n").write(
        "window.__ATOMIC_ACRES_RELEASE_CHANNELS__=" + json.dumps(channels, separators=(",", ":")) + ";\n")

    sh("git add -A", cwd=WORKTREE)
    rc, out = sh(['git', 'commit', '-m',
                  'publish: PASS 80 overnight refinement build as a third channel\n\n'
                  'Verified before publishing, not after: regression gate OK, production\n'
                  'bundle builds, and all six arenas boot on a real WebGPU device from that\n'
                  'bundle. Added as a NEW channel - recent-stable and the-big-one are\n'
                  'untouched, and the script refuses to run if any existing channel key\n'
                  'would disappear.\n\n'
                  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>'], cwd=WORKTREE)
    if rc != 0 and "nothing to commit" not in out:
        return False, f"commit failed: {out[-300:]}"
    rc, out = sh("git push origin gh-pages", cwd=WORKTREE, timeout=3600)
    if rc != 0:
        return False, f"push failed: {out[-400:]}"
    return True, ("https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/"
                  + CHANNEL + "/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="run every proof but do not touch gh-pages")
    a = ap.parse_args()

    ok, why = prove_it_is_worth_publishing()
    if not ok:
        log(f"NOT PUBLISHING - {why}")
        return 1
    if a.dry_run:
        log("dry run: everything verified, nothing published")
        return 0
    ok, result = publish()
    if not ok:
        log(f"NOT PUBLISHED - {result}")
        return 1
    log(f"PUBLISHED: {result}")
    print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
