#!/usr/bin/env python3
"""Publish the Pass 81 candidate as its own gh-pages channel.

Sibling of publish_pass80.py. Adds `channels/pass81` beside the existing channels rather
than over any of them, so the owner can compare, and refuses if any channel he asked to
keep would disappear.

Gated BEFORE this runs, never after: tsc 0, 499 files / 4,495 tests, five arenas verified
through the REAL player path (callsign field, map card, deploy button, canvas sized), and a
COLD visitor with an empty profile launching on the first click with nothing typed.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys

SRC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(SRC, "dist-pass81")
WORKTREE = os.path.join(SRC, ".gh-pages-publish")
CHANNEL = "channels/pass81"

# Every channel the owner has asked to keep. A publish that would drop one is a bug.
KEEP_AT_LEAST = {"experimental", "previous", "pass81"}

# Owner, 2026-08-28: "hide pass 80 ... stick this as pass 81". Retired from the chooser
# and removed from gh-pages; recoverable from branch history if ever needed.
RETIRE = {"pass80": "channels/pass80"}

DESCRIPTION = (
    "Pass 81: Nuke Town rebaked to match its colliders, deleted authored props restored, "
    "HUD bob normalised per map, arms carry real motion, cold visitors deploy first click. "
    "If this browser's WebGPU compiler fails, the game retries and then switches itself "
    "to the compatibility renderer. Farcrysis hidden until ready."
)

COMMIT_MESSAGE = """publish: PASS 81 - correct identity, Chrome 153 self-healing, pass80 retired

The owner clicked PASS 81 and the game introduced itself as PASS 80: the identity module
was hand-stamped and left behind by the build, the third instance of that defect class.
Stamped PASS 81 and re-pinned.

He also could not deploy at all in his own browser. Root cause measured live: default
Chrome 153 fails render-pipeline creation with Tint's "swizzle view instruction still has
usages after lowering" in ~8 of 10 plain runs - every harness gate passed because every
harness runs Chrome with --enable-unsafe-webgpu, which masks it. The deployed site had
never been driven by an un-flagged Chrome. This build retries the deploy twice on
renderer-class failures and then reloads itself onto the WebGL2 compatibility route
(?renderer=webgl2, the repo's own hard compat contract), where deploy verifies at 25-30 s.

pass80 retired from the chooser and gh-pages at the owner's instruction ("hide pass 80,
stick this as pass 81"). PASS 73 and 72 remain. Recoverable from branch history.

tsc 0, 500 files / 4,500 tests green.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"""


def sh(cmd, cwd=SRC, check=True, timeout=3600):
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if check and p.returncode != 0:
        sys.exit(f"FAILED: {cmd}\n{p.stdout}{p.stderr}")
    return p.stdout + p.stderr


def assert_farcrysis_not_selectable(dist_dir):
    """Owner, 2026-08-28: farcrysis stays unselectable in ANY live published version.

    Checked against the BYTES the minifier actually emits, not the bytes one imagines.
    The first version of this guard searched for data-arena-id="farcrysis" and passed
    green on every bundle - including ones with farcrysis selectable - because the menu
    interpolates arena ids at runtime and that byte sequence never exists. A guard is
    only as good as its red test; this one has one below in main().

    Real shape (verified in dist bytes): the arena registry serializes as
    routeId:`farcrysis`,selectable:!1 (template quotes survive esbuild; !1 is false).
    The rule: every farcrysis registry entry in every chunk must carry selectable:!1
    within its entry window; an entry without it means the menu will offer the arena.
    No farcrysis entry at all is also acceptable (arena fully removed).
    """
    import glob
    import re
    entry_rx = re.compile(rb"routeId:[`'\"]farcrysis[`'\"]")
    ok_rx = re.compile(rb"selectable:(?:!1|false)")
    entries_seen = 0
    for path in glob.glob(os.path.join(dist_dir, "assets", "*.js")):
        with open(path, "rb") as fh:
            data = fh.read()
        for match in entry_rx.finditer(data):
            entries_seen += 1
            window = data[max(0, match.start() - 100):match.end() + 200]
            if not ok_rx.search(window):
                sys.exit("REFUSING TO PUBLISH: a farcrysis registry entry in "
                         f"{os.path.basename(path)} does not carry selectable:false - "
                         "the menu would offer the parked arena. Fix src/map-selection.ts.")
    print(f"  farcrysis-unselectable guard: OK ({entries_seen} registry entr"
          f"{'y' if entries_seen == 1 else 'ies'} checked, all selectable:false)")


def main():
    if not os.path.isdir(DIST):
        sys.exit(f"no build at {DIST}")
    # Prove the guard can fire before trusting its pass (it shipped vacuous once).
    import tempfile
    with tempfile.TemporaryDirectory() as red_dir:
        os.makedirs(os.path.join(red_dir, "assets"))
        with open(os.path.join(red_dir, "assets", "red.js"), "wb") as fh:
            fh.write(b"id:`farcrysis`,routeId:`farcrysis`,legacyAliases:[]")
        fired = False
        try:
            assert_farcrysis_not_selectable(red_dir)
        except SystemExit:
            fired = True
        if not fired:
            sys.exit("REFUSING: the farcrysis guard failed its own red test - it cannot fire")
    assert_farcrysis_not_selectable(DIST)

    sh(f'git worktree remove --force "{WORKTREE}"', check=False)
    shutil.rmtree(WORKTREE, ignore_errors=True)

    # From ORIGIN, never the local ref. The local gh-pages was once 23 commits behind, and
    # publishing from it would have silently deleted four retained builds.
    sh("git fetch --no-tags origin gh-pages")
    sh(f'git worktree add --detach "{WORKTREE}" FETCH_HEAD')
    print("gh-pages at", sh("git rev-parse --short HEAD", cwd=WORKTREE).strip())

    target = os.path.join(WORKTREE, *CHANNEL.split("/"))
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(DIST, target)
    print(f"  {CHANNEL} <- dist-pass81")

    # Refresh the root chooser shell from source on every publish. Nothing else touches
    # these once the release workflow first writes them, which is how a chooser iterating a
    # hardcoded four keys survived two publishes while hiding the build it had deployed.
    for name in ("index.html", "release-shell.js", "release-shell.css"):
        source = os.path.join(SRC, "release-shell", name)
        if not os.path.isfile(source):
            sys.exit(f"release-shell/{name} missing from the repo")
        shutil.copyfile(source, os.path.join(WORKTREE, name))
    print("  root chooser shell refreshed")

    cfg_path = os.path.join(WORKTREE, "release-channel-config.js")
    raw = open(cfg_path, encoding="utf-8").read()
    m = re.search(r"=\s*(\{.*\})\s*;?\s*$", raw.strip(), re.S)
    if not m:
        sys.exit("release-channel-config.js is not in the shape this script understands")
    channels = json.loads(m.group(1))
    before = set(channels)

    for retired_key, retired_path in RETIRE.items():
        if retired_key in channels:
            if channels[retired_key].get("path") != retired_path:
                sys.exit(f"REFUSING: '{retired_key}' points at {channels[retired_key].get('path')}, expected {retired_path}")
            del channels[retired_key]
        retired_dir = os.path.join(WORKTREE, *retired_path.split("/"))
        if os.path.isdir(retired_dir):
            shutil.rmtree(retired_dir)
            print(f"  retired {retired_path}/")

    channels["pass81"] = {
        "label": "PASS 81",
        "description": DESCRIPTION,
        "pass": "PASS 81",
        "path": CHANNEL,
    }

    lost = (before - set(channels)) - set(RETIRE)
    if lost:
        sys.exit(f"REFUSING: this would drop existing channels {sorted(lost)}")
    missing = KEEP_AT_LEAST - set(channels)
    if missing:
        sys.exit(f"REFUSING: would drop channels the owner asked to keep: {sorted(missing)}")

    # Every channel the chooser will DRAW must exist on disk. The chooser now renders
    # whatever the config carries, so a stale key is a card that 404s in front of a player.
    for key, channel in channels.items():
        path = channel.get("path")
        if not path:
            sys.exit(f"REFUSING: channel {key} has no path")
        if not os.path.isdir(os.path.join(WORKTREE, *path.split("/"))):
            sys.exit(f"REFUSING: channel {key} points at {path}, which is not on gh-pages")

    open(cfg_path, "w", encoding="utf-8", newline="\n").write(
        "window.__ATOMIC_ACRES_RELEASE_CHANNELS__="
        + json.dumps(channels, separators=(",", ":")) + ";\n")
    print("  channels now:", ", ".join(v["pass"] for v in channels.values()))

    sh("git add -A", cwd=WORKTREE)
    out = sh(["git", "commit", "-m", COMMIT_MESSAGE], cwd=WORKTREE, check=False)
    if "nothing to commit" in out:
        print("nothing to commit")
        return 0
    sh("git push origin HEAD:gh-pages", cwd=WORKTREE)
    print("\nPUBLISHED: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
