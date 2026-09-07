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

# Owner, 2026-08-28: "overwriting any old pass 80 and keeping historical selectable passes
# on that available". Both halves are already how this script works - `channels/pass80` is
# rmtree'd and rewritten while every sibling channel directory is untouched, and the config
# is edited by REPLACING one key with a hard refusal if any existing key would vanish.
#
# What was stale was the PROSE. The live channel card still advertised the 2026-08-26 11:03
# build - thirteen commits ago - so a player reading the chooser was told about work that
# had been superseded. The card is data about a specific build, so it lives up here next to
# the other build constants rather than buried inline at the point of use.
DESCRIPTION = (
    "Operator archetypes that read at distance (braid, thigh rigs, talons, cranial crest), "
    "locally generated Kimodo motion retargeted onto the 62-joint rig, per-instance grass "
    "tint across 87,280 blades, farcrysis frame-loop leaks closed, chopper gunner controls "
    "and killstreak selector, RAY TRACED reflective coverage gated. Earlier passes remain "
    "live and selectable."
)

COMMIT_MESSAGE = """publish: PASS 80 refreshed - thirteen commits the live channel never had

Replaces channels/pass80 in place. Every sibling channel (the-big-one, pass72/70/69
-retained, recent-stable, pass63-rollback) is left byte-untouched on disk, and the
config edit refuses to run if any existing channel key would disappear - so the
owner's historical passes stay selectable.

The live pass80 channel was built at 2026-08-26 11:03 and never moved. Landed since:
operator silhouette accessories that carry the archetype read at distance, the Kimodo
text-to-motion lane end to end (licence cleared, built on MSVC with no installs,
retargeted and measured on our own rig rather than on the tool's demo body), farcrysis
animation-registry leaks that doubled the frame loop on every arena rebuild,
releaseHudSway wired to the four states its own contract names, per-instance grass tint
across 87,280 blades that were one flat green, chopper gunner controls, killstreak
selector readability, low-health audio muted per owner request, and a RAY TRACED
per-arena reflective-coverage gate with a hard never-zero floor.

Verified before publishing, not after: regression gate OK, production bundle builds, and
all six arenas boot on a real WebGPU device from that exact bundle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"""


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

    # FETCH FIRST, and branch from ORIGIN - not the local ref.
    #
    # The local gh-pages was 23 commits behind origin and its config listed TWO channels
    # while origin listed FIVE (PASS 73, 72, 70, 69, 63). Publishing from the stale ref
    # would have written a config containing three, silently deleting four of the owner's
    # retained builds - the exact thing he asked not to happen. The "abort if a channel key
    # disappears" guard passed, because it compared against the stale baseline. A guard is
    # only as good as what it measures against.
    rc, out = sh("git fetch origin gh-pages")
    if rc != 0:
        return False, f"could not fetch gh-pages: {out[-300:]}"
    rc, out = sh(f'git worktree add --detach "{WORKTREE}" FETCH_HEAD')
    if rc != 0:
        return False, f"could not check out origin/gh-pages: {out[-300:]}"

    target = os.path.join(WORKTREE, *CHANNEL.split("/"))
    # Replace only THIS channel's directory; the sibling channels are never touched.
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(DIST, target)

    # Refresh the ROOT chooser shell from the repo, every publish.
    #
    # The root shell is written by the release workflow's staging step and nothing else ever
    # touched it, so a fix in `release-shell/` could sit unpublished indefinitely while the
    # live root kept serving the old file. That is exactly how a chooser that iterated a
    # hardcoded four keys survived two Pass 80 publishes and hid the build it had just
    # deployed. These three files are the chooser and nothing else - no channel bytes, no
    # release-channel-config.js, which is edited separately below.
    for name in ("index.html", "release-shell.js", "release-shell.css"):
        source = os.path.join(REPO, "release-shell", name)
        if not os.path.isfile(source):
            return False, f"release-shell/{name} is missing from the repo"
        shutil.copyfile(source, os.path.join(WORKTREE, name))

    cfg_path = os.path.join(WORKTREE, "release-channel-config.js")
    cfg = open(cfg_path, encoding="utf-8").read()
    m = re.search(r"=\s*(\{.*\})\s*;?\s*$", cfg.strip(), re.S)
    if not m:
        return False, "release-channel-config.js is not in the shape this script understands"
    channels = json.loads(m.group(1))
    before = set(channels)
    channels["pass80"] = {
        "label": "PASS 80",
        "description": DESCRIPTION,
        "pass": "PASS 80",
        "path": CHANNEL,
    }
    lost = before - set(channels)
    if lost:
        return False, f"REFUSING: this would have dropped existing channels {sorted(lost)}"
    # Every channel the chooser will now DRAW must exist on disk. This mattered less when the
    # chooser only ever drew four hardcoded keys; now that it renders whatever the config
    # carries, a stale key here becomes a card that 404s in front of the owner.
    for key, channel in channels.items():
        path = channel.get("path")
        if not path:
            return False, f"REFUSING: channel {key} has no path"
        if not os.path.isdir(os.path.join(WORKTREE, *path.split("/"))):
            return False, f"REFUSING: channel {key} points at {path}, which is not on gh-pages"

    open(cfg_path, "w", encoding="utf-8", newline="\n").write(
        "window.__ATOMIC_ACRES_RELEASE_CHANNELS__=" + json.dumps(channels, separators=(",", ":")) + ";\n")

    sh("git add -A", cwd=WORKTREE)
    rc, out = sh(['git', 'commit', '-m', COMMIT_MESSAGE], cwd=WORKTREE)
    if rc != 0 and "nothing to commit" not in out:
        return False, f"commit failed: {out[-300:]}"
    rc, out = sh("git push origin HEAD:gh-pages", cwd=WORKTREE, timeout=3600)
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
