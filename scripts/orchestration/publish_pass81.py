#!/usr/bin/env python3
"""Publish the Pass 81 candidate as its own gh-pages channel.

Sibling of publish_pass80.py. Adds `channels/pass81` beside the existing channels rather
than over any of them, so the owner can compare, and refuses if any channel he asked to
keep would disappear.

Gated BEFORE this runs, never after: tsc 0, 499 files / 4,495 tests, five arenas verified
through the REAL player path (callsign field, map card, deploy button, canvas sized), and a
COLD visitor with an empty profile launching on the first click with nothing typed.

2026-08-31 - the root chooser is now published CONTENT-ADDRESSED. See publish_root_shell()
for the measurements that forced it; the short version is that GitHub Pages pins every root
file at `Cache-Control: max-age=600`, ignores request-side no-cache, and strips the query
string from its CDN cache key, so the only reliable freshness primitive on this host is a
filename nobody has requested before.
"""
from __future__ import annotations

import glob
import hashlib
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
#
# 2026-08-30, owner: "i dont want pass 63, stable webgl, i want the previous 1/2 versions
# we had, 73 and 71 I think? i forgot, unhide those on next publish please." The two real
# predecessors on gh-pages are PASS 73 (channels/the-big-one, key `experimental`) and
# PASS 72 (channels/pass72-retained, key `previous`) - 71 was never given its own retained
# tree. Both are pinned here so no future publish can quietly drop them the way pass80's
# retirement nearly took `previous` with it.
KEEP_AT_LEAST = {"experimental", "previous", "pass81"}

# Owner, 2026-08-28: "hide pass 80 ... stick this as pass 81". Retired from the chooser
# and removed from gh-pages; recoverable from branch history if ever needed.
RETIRE = {"pass80": "channels/pass80"}

# The two predecessors, restated so their ROLE is unmistakable on the card.
#
# The owner's complaint was not that 73 and 72 were absent from the config - they were
# there. It was that what he was OFFERED was PASS 81 and PASS 63 STABLE WEBGL, with the
# recent passes nowhere in sight. Two separate mechanisms did that (both fixed/reported in
# this pass), and copy that says plainly "the version before this one" is the cheap half of
# not doing it again: a card labelled only "PASS 73" does not tell you it is the previous
# build, and a card labelled "STABLE WEBGL" reads like the safe default when it is in fact
# eighteen passes old.
PREDECESSOR_COPY = {
    "experimental": {
        "label": "PASS 73 · PREVIOUS VERSION",
        "description": (
            "The build that was live before this one. Approved Pass 73 first-person, "
            "gameplay, world-integrity and renderer-correction work. Pick this if the "
            "newest pass misbehaves."
        ),
    },
    "previous": {
        "label": "PASS 72 · THE ONE BEFORE THAT",
        "description": (
            "Two versions back. The exact Pass 72 Pages runtime, retained byte-for-byte "
            "for comparison and immediate rollback testing."
        ),
    },
}

DESCRIPTION = (
    "Pass 81: Nuke Town rebaked to match its colliders, deleted authored props restored, "
    "HUD bob normalised per map, arms carry real motion, cold visitors deploy first click. "
    "If this browser's WebGPU compiler fails, the game retries and then switches itself "
    "to the compatibility renderer. Farcrysis hidden until ready."
)

COMMIT_MESSAGE = """publish: PASS 81 - previous passes unhidden, chooser made cache-proof

Two complaints, one publish.

1. "i dont want pass 63, stable webgl, i want the previous 1/2 versions we had". PASS 73
and PASS 72 are now pinned into the chooser with copy that says what they are - PREVIOUS
VERSION and THE ONE BEFORE THAT - instead of bare pass numbers a reader has to rank
himself. PASS 63 is not offered by this chooser: its tree is not on gh-pages at all.

2. "I just opened it in a new chrome I ran as admin and now I see pass 73 and 72 lol,
before I only saw 81 and 63". The root chooser loaded its shell and its channel list from
two separately cached URLs with nothing tying a generation of one to a generation of the
other, and GitHub Pages pins every root file at Cache-Control: max-age=600 with no way to
override it. A browser could therefore hold index.html, release-shell.js and
release-channel-config.js from three different publishes and draw a build list that had
never existed. Measured on the live host: request-side no-cache does not defeat the Fastly
edge (Age: 109 came back), and the query string is stripped from the CDN cache key
(?ts=random returned Age: 82), so cache-busting by query is theatre there. A path never
requested before is always an edge miss (Age: 0).

So the shell is published content-addressed - release-shell.<generation>.js/.css - and the
channel list is inlined into index.html rather than fetched from a second URL. The
impossible-to-assemble mixture is now actually impossible. On top of that the shell
re-asks on every load over release-manifest.<generation>.json, a path that exists only for
that generation, and redraws itself if the page it is running from was cached. The HARD
RESET button remains, but a button the owner has to find was never a fix.

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


def canonical_channel_bytes(channels):
    """The exact bytes whose digest names a generation. Sorted, so key order cannot move it."""
    return json.dumps(channels, sort_keys=True, separators=(",", ":")).encode("utf-8")


def read_shell_sources():
    """The three root-shell files, read once, as bytes."""
    sources = {}
    for name in ("index.html", "release-shell.js", "release-shell.css"):
        path = os.path.join(SRC, "release-shell", name)
        if not os.path.isfile(path):
            sys.exit(f"release-shell/{name} missing from the repo")
        with open(path, "rb") as fh:
            sources[name] = fh.read()
    return sources


def generation_id(channels, sources):
    """Content address for one published chooser: its channel list AND its code.

    Both halves matter. A generation that only hashed the channels would keep serving the
    old script filename after a shell fix, and the old script is exactly the thing that
    cannot be evicted from a browser inside its ten-minute freshness window.
    """
    digest = hashlib.sha256()
    digest.update(canonical_channel_bytes(channels))
    for name in sorted(sources):
        digest.update(name.encode("utf-8"))
        digest.update(sources[name])
    return digest.hexdigest()[:12]


def publish_root_shell(worktree, channels, sources):
    """Write the chooser so no client can assemble a channel list that never existed.

    Measured against https://daveinturkey15-byte.github.io on 2026-08-31 rather than
    assumed, because every plausible assumption here turned out to be wrong:

      * every root file is served `Cache-Control: max-age=600`. GitHub Pages provides no
        way to change that - it has no _headers support and no per-file directives - so
        "serve the manifest no-store" is not available at the origin;
      * a request-side `Cache-Control: no-cache` does NOT force revalidation at the Fastly
        edge: the same object came back with `Age: 109`;
      * the query string is STRIPPED from the edge cache key. `?ts=<random>` returned
        `Age: 82` - the byte-identical cached object. Query cache-busting works on the
        browser cache and does nothing at the CDN;
      * a path never requested before is always an edge miss (`Age: 0`);
      * four consecutive requests were served by four different Fastly nodes
        (cache-lhr-...068 / ...097 / ...027 / ...047), so two clients can legitimately sit
        on different generations of the same URL for up to the full 600 s.

    Therefore: a NEW PATH is the only reliable freshness primitive on this host, and the
    publish uses it three ways.

      1. index.html carries the channel list INLINE. There is no longer a second cacheable
         URL whose generation can disagree with the document's. This alone kills the
         unbounded failure - the one where a browser mixes a shell from publish A with a
         channel list from publish B and draws a set that was never published.
      2. release-shell.<generation>.js/.css are content-addressed. A given index.html can
         only ever execute the code it shipped with, at either cache layer.
      3. release-manifest.<generation>.json is written at a fresh path every generation and
         named by a small stable pointer, release-index.json. The shell fetches the pointer
         no-store on every load; if it names a generation this document does not carry, it
         fetches that manifest - over a path no cache has ever seen - and redraws. So even
         a client holding a stale index.html converges to the true set without touching a
         button, and the only remaining staleness is the pointer's own <=600 s, which
         expires on its own.

    The legacy unhashed release-shell.js / release-shell.css / release-channel-config.js
    are still written, unchanged in name, because index.html generations cached before this
    change still request them. Dropping them would 404 those clients into a blank chooser -
    a worse failure than the one being fixed.
    """
    generation = generation_id(channels, sources)
    manifest_name = f"release-manifest.{generation}.json"
    shell_js = f"release-shell.{generation}.js"
    shell_css = f"release-shell.{generation}.css"

    # Which generation is currently live? Its assets have to survive this publish: a client
    # that loaded the previous index.html seconds ago must still be able to fetch its
    # script. Anything older than that is unreachable and gets swept.
    keep_generations = {generation}
    pointer_path = os.path.join(worktree, "release-index.json")
    if os.path.isfile(pointer_path):
        try:
            previous = json.load(open(pointer_path, encoding="utf-8")).get("generation")
            if isinstance(previous, str) and re.fullmatch(r"[0-9a-f]{6,64}", previous):
                keep_generations.add(previous)
        except (ValueError, OSError):
            pass

    html = sources["index.html"].decode("utf-8")
    # Inlining puts authored channel strings inside a <script> block, which is an HTML sink
    # the separate config file never was. json.dumps with ensure_ascii already escapes every
    # non-ASCII codepoint (so U+2028/U+2029 are safe), but it does NOT escape '<' - and a
    # description containing "</script>" would close the block and spill the rest of the
    # channel list into the document as markup. A backslash-u escape is the standard
    # defence and reads back as a plain '<' once the JS string is parsed. The r"" prefix
    # is load-bearing: a plain Python "\\u003c" literal IS the '<' character, so the
    # first draft of this was a silent no-op.
    def script_safe(text):
        return text.replace("<", r"\u003c")

    # Self-test, because the first draft of script_safe was a no-op that nothing noticed.
    if script_safe("</script>") != r"\u003c/script>":
        sys.exit("REFUSING: script_safe is not escaping - it shipped as a silent no-op once")

    emitted = script_safe(json.dumps(channels, separators=(",", ":")))
    # Round-trip the BYTES that will be written, not the object they came from: the escaped
    # form must still parse back to exactly this channel list, and must not contain anything
    # that could close the script block it is about to sit inside.
    if "</script" in emitted.lower() or json.loads(emitted) != channels:
        sys.exit("REFUSING: the inline channel list did not survive script-safe escaping")

    inline = (
        "/*__RELEASE_GENERATION__*/"
        f"window.__ATOMIC_ACRES_RELEASE_GENERATION__={json.dumps(generation)};"
        "window.__ATOMIC_ACRES_RELEASE_CHANNELS__=" + emitted + ";"
    )
    html, inline_hits = re.subn(
        r"/\*__RELEASE_GENERATION__\*/[^\n]*?(?=</script>)", lambda _: inline, html, count=1)
    html, css_hits = re.subn(r'(?<=href=")\./release-shell\.css(?=")', lambda _: f"./{shell_css}", html, count=1)
    html, js_hits = re.subn(r'(?<=src=")\./release-shell\.js(?=")', lambda _: f"./{shell_js}", html, count=1)
    # Drop the legacy config script tag. It has to exist in the TEMPLATE, because
    # scripts/release/stage-release-topology.mjs publishes that file verbatim and supplies
    # the channel list through it - but on this path it is the second separately cached URL
    # whose generation could disagree with the document's, which is the defect itself. It is
    # also a deferred script, so it would run AFTER the inline list and overwrite it.
    html, tag_hits = re.subn(
        r'\n\s*<script defer src="\./release-channel-config\.js"></script>', lambda _: "", html, count=1)
    if not (inline_hits and css_hits and js_hits and tag_hits):
        sys.exit("REFUSING: release-shell/index.html no longer carries the four publish "
                 "substitution points (/*__RELEASE_GENERATION__*/, ./release-shell.css, "
                 "./release-shell.js, the legacy release-channel-config.js tag). Publishing "
                 "it unsubstituted would ship a chooser with no channels at all.")
    # Prove the substitution landed against the BYTES, not against the return of re.subn.
    # A chooser that ships with an empty channel list throws before it draws anything, and
    # the owner would see a blank page - which is how this class of defect always presents.
    for key, channel in channels.items():
        if script_safe(json.dumps(channel["label"], separators=(",", ":"))[1:-1]) not in html:
            sys.exit(f"REFUSING: channel '{key}' did not survive inlining into index.html")
    if f"./{shell_js}" not in html or f"./{shell_css}" not in html:
        sys.exit("REFUSING: index.html does not reference this generation's shell assets")

    def write(name, data):
        mode, encoding, newline = ("w", "utf-8", "\n") if isinstance(data, str) else ("wb", None, None)
        with open(os.path.join(worktree, name), mode, encoding=encoding, newline=newline) as fh:
            fh.write(data)

    write("index.html", html)
    write(shell_js, sources["release-shell.js"])
    write(shell_css, sources["release-shell.css"])
    write(manifest_name, json.dumps(
        {"generation": generation, "channels": channels}, separators=(",", ":")) + "\n")
    write("release-index.json", json.dumps(
        {"generation": generation, "manifest": manifest_name}, separators=(",", ":")) + "\n")

    # Legacy names, for index.html generations cached before this change.
    write("release-shell.js", sources["release-shell.js"])
    write("release-shell.css", sources["release-shell.css"])
    write("release-channel-config.js",
          "window.__ATOMIC_ACRES_RELEASE_CHANNELS__="
          + json.dumps(channels, separators=(",", ":")) + ";\n")

    swept = 0
    for path in glob.glob(os.path.join(worktree, "release-shell.*.js")) \
            + glob.glob(os.path.join(worktree, "release-shell.*.css")) \
            + glob.glob(os.path.join(worktree, "release-manifest.*.json")):
        stamp = os.path.basename(path).split(".")[1]
        if stamp not in keep_generations:
            os.remove(path)
            swept += 1

    print(f"  root chooser published as generation {generation}"
          f" ({len(channels)} channels inlined, {swept} superseded asset(s) swept,"
          f" keeping {sorted(keep_generations)})")
    return generation


def assert_predecessors_offered(channels):
    """The newest pass must not be the only recent thing on offer.

    Owner, 2026-08-30: "i dont want pass 63, stable webgl, i want the previous 1/2 versions
    we had". The failure mode this blocks is a chooser that carries the newest pass plus
    one ancient fallback, which is what he was looking at. Pinned at two predecessors
    because that is the number he asked for ("the previous 1/2 versions").
    """
    def number(channel):
        match = re.search(r"\d+(?:\.\d+)?", str(channel.get("pass", "")))
        return float(match.group()) if match else float("-inf")

    ranked = sorted(channels.values(), key=number, reverse=True)
    if not ranked:
        sys.exit("REFUSING: no channels at all")
    newest = number(ranked[0])
    predecessors = [c for c in ranked[1:] if number(c) > newest - 12]
    if len(predecessors) < 2:
        sys.exit(
            "REFUSING: this chooser would offer PASS "
            f"{newest:g} and no recent predecessor. The owner asked for the previous two "
            "versions to stay visible; publishing the newest pass beside nothing but an "
            "ancient fallback is the exact complaint of 2026-08-30. Present: "
            + ", ".join(str(c.get("pass")) for c in ranked))
    print("  predecessor guard: OK (offering "
          + ", ".join(str(c.get("pass")) for c in ranked[:3]) + ")")


def assert_in_game_fallback_exists(worktree):
    """The chooser INSIDE each build links a fallback too, and it currently 404s.

    src/bootstrap.ts renders its own two-card chooser from release-channels.json whenever a
    visitor lands on a channel URL with no ?release= - a direct link, or a bookmark. Its
    second card is `releaseChannels.rollback ?? releaseChannels.stable`, which today is
    PASS 63 at channels/pass63-rollback. That directory is NOT on gh-pages: the live URL
    returns 404 (measured 2026-08-31). So a visitor who opens a channel directly is shown
    "PASS 81" and "PASS 63 - STABLE WEBGL", and the second one is a dead link.

    That is the other half of "before I only saw 81 and 63". This guard refuses rather than
    warns, because a warning at the end of a publish is a line of scrollback nobody reads,
    and shipping a chooser with a dead card is precisely the failure being fixed. The fix
    is one key: delete `rollback` from release-channels.json so the fallback resolves to
    `stable` (PASS 67.1 at channels/recent-stable, which IS published), or restore the
    pass63-rollback tree to gh-pages.
    """
    config_path = os.path.join(SRC, "release-channels.json")
    config = json.load(open(config_path, encoding="utf-8"))
    fallback = config.get("rollback") or config.get("stable")
    if not fallback:
        sys.exit("REFUSING: release-channels.json has neither rollback nor stable, so the "
                 "in-build chooser has no fallback card to draw")
    key = "rollback" if config.get("rollback") else "stable"
    path = fallback.get("path", "")
    if not path or not os.path.isdir(os.path.join(worktree, *path.split("/"))):
        sys.exit(
            f"REFUSING: the in-build chooser (src/bootstrap.ts) draws its fallback card from "
            f"release-channels.json '{key}' -> {path}, which is NOT on gh-pages. Every visitor "
            f"opening a channel URL directly would be offered {fallback.get('pass')} and get a "
            "404. Fix release-channels.json (drop 'rollback' so the fallback resolves to "
            "'stable' -> channels/recent-stable) or republish that tree.")
    print(f"  in-build fallback guard: OK ({key} -> {path} is on gh-pages)")


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

    # Same treatment for the predecessor guard: a gate that has never been seen red is a
    # gate nobody has checked can fail.
    fired = False
    try:
        assert_predecessors_offered({
            "pass81": {"pass": "PASS 81", "path": "channels/pass81"},
            "stable": {"pass": "PASS 63", "path": "channels/pass63-rollback"},
        })
    except SystemExit:
        fired = True
    if not fired:
        sys.exit("REFUSING: the predecessor guard failed its own red test - it cannot fire")

    sources = read_shell_sources()

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

    # Unhide the two real predecessors with copy that names their role. Only the strings
    # move; the paths and pass codes are untouched, so no retained tree is re-pointed.
    for key, copy in PREDECESSOR_COPY.items():
        if key not in channels:
            sys.exit(f"REFUSING: predecessor channel '{key}' is missing from the config; "
                     "the owner asked for the previous two versions to stay offered")
        channels[key] = {**channels[key], **copy}
        print(f"  {key}: {copy['label']}")

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

    assert_predecessors_offered(channels)
    assert_in_game_fallback_exists(WORKTREE)
    publish_root_shell(WORKTREE, channels, sources)
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
