#!/usr/bin/env python3
"""Publish the Pass 94 candidate as its own gh-pages channel and retire every other tree.

NOTE ON THE FARCRYSIS GUARD (HF-423, edited 2026-09-03): this pass is ALREADY PUBLISHED
and this script will not be run again for it. The farcrysis guard below is edited here only
because roll_pass.py copies THIS file to make the NEXT pass's publish script at the cut, so
the template is the only place a guard can be changed before the script that needs it
exists. Everything in that guard is pass-number-derived and rolls with the copy - the
receipt path is built from LIVE_TREE, so it names the cut pass's own
docs/evidence/pass<N>/lane-r/ directory with no literal to forget to update.

Sibling of publish_pass93.py, with one policy change from the owner (HF-400).

Owner, 2026-09-02 06:58 BST, verbatim: "also when you push the next pass, pin this version
and remove all past versions, this can be the safe backup"

So after this script runs, gh-pages carries EXACTLY two channel trees:

    channels/pass94   the live default (this cut)
    channels/pass93   the pinned safe backup (what was live when he said it)

Every other tree under channels/ (pass81, pass82, pass72-retained, the-big-one,
recent-stable, and anything else that turns up) is deleted from gh-pages and from the
chooser. The retirement list is ENUMERATED AT RUN TIME from what is actually on gh-pages,
never hardcoded - a hardcoded list is how a tree survives a retirement it was meant for -
and the post-state is asserted to be exactly {pass94, pass93} before anything is committed.

Gated BEFORE this runs, never after: tsc 0, full vitest floor, the arenas verified through
the REAL player path, and a COLD visitor with an empty profile launching on the first click.

Guards kept from publish_pass93.py, unchanged in strictness: the build freshness guard
(refuses a stale hand-copied dist), the farcrysis-admission guard (receipt-backed; the
parked case still passes, and it keeps its own red test), the content-addressed root chooser with
its inline-escape self-test, and the in-build fallback guard - which is now STRICTER: it
must resolve to the PASS 93 backup, not merely to something that exists.

`--dry-run` prints the complete plan (trees to delete, files to write, the chooser that
would be inlined, the fallback the in-build chooser would draw, and every guard's verdict)
and touches nothing. Pass `--gh-pages-dir <path>` to plan against a local clone or worktree
of gh-pages without running git at all; `--plan-json <path>` writes the plan as JSON for
the contract test (scripts/orchestration/publish_pass<N>_plan.test.mjs, where <N> is
this script's own pass; roll_pass.py's number roll cannot reach a name with an underscore
after the digits, so a literal here goes stale silently - it pointed two passes back until
the Lane AD release-CI fix).
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

SRC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(SRC, "dist-pass94")
WORKTREE = os.path.join(SRC, ".gh-pages-publish")
CHANNEL = "channels/pass94"
LIVE_TREE = "pass94"
BACKUP_TREE = "pass93"
BACKUP_CHANNEL = f"channels/{BACKUP_TREE}"
POLICY = "HF-400"

# HF-423: farcrysis ships as a selectable PREVIEW card. The receipt below replaces the
# selectable:false flag check that used to stand here. A flag is flipped in one line; a
# receipt has to be earned by running the arena, so this is the strictly harder gate.
#
# The path is derived from LIVE_TREE, never written out, because roll_pass.py rolls
# `pass{N}` tokens when it copies this file: a literal would name the wrong pass in the
# rolled script, and a receipt read from the wrong directory is not evidence at all.
#
# 1.60 is a RATIO ceiling against an atomic-acres control measured in the same machine
# window, never an absolute millisecond budget: an absolute budget is a fence that has to
# be widened whenever the owner's ComfyUI is busy, and a fence that gets widened is not a
# fence. A busy machine slows the control too, so the ratio is immune to it. The committed
# evidence measures a worst pair ratio of 1.2833; the ceiling exists so a REGRESSION cannot
# ship, not to be moved when one does.
FARCRYSIS_ADMISSION_RECEIPT = os.path.join(
    SRC, "docs", "evidence", LIVE_TREE, "lane-r", "farcrysis-admission.json")
FARCRYSIS_ADMISSION_RATIO_CEILING = 1.60
FARCRYSIS_ADMISSION_MIN_RUNS = 3

# HF-400. The ONLY tree the owner asked to keep beside the new pass. Everything else under
# channels/ is retired by enumeration below. A publish that would drop this one is a bug;
# a publish that would keep anything else is a policy violation.
KEEP_AT_LEAST = {"pass93"}

# HF-400. What channels/ must contain, exactly, when this script commits. Asserted against
# the directory listing after retirement, not against a list of what was meant to happen.
EXPECTED_POST_STATE = {LIVE_TREE, BACKUP_TREE}

DESCRIPTION = (
    "Nuke Town Rebuild leads the map chooser with old Raid retired; Pass 94 carries the approved candidate 5, killstreak tuning, Chrome 153 WebGPU hardening and validated map/menu polish."
)

# HF-400. The chooser now carries exactly two cards. Keys are load-bearing for the release
# shell's alias table (release-shell/release-shell.js): `latest`, `normal` and every room
# invite route to `experimental`; `previous`, `stable`, `rollback` and `pass72` route to
# `previous`. So the live cut is keyed `experimental` and the safe backup is keyed
# `previous` - which is exactly the alias the owner's policy needs: ?release=previous -> PASS 93.
BACKUP_COPY = {
    "label": "PASS 93 · SAFE BACKUP",
    "description": (
        "The build that was live before this one, pinned as the single safe backup "
        "(owner, 2026-09-02). Pick this if the newest pass misbehaves."
    ),
}


def build_channels(rollback=False):
    """The two-card chooser HF-400 asks for. Pure: no disk, no git.

    With rollback=True the SAME two trees stay published but the default flips: the shell
    routes `latest`, `normal` and every room invite to `experimental`, so the PASS 93 backup
    takes that key and PASS 94 moves to `previous` for investigation. No tree is deleted by
    a rollback; nothing has to be rebuilt; the only thing that changes is which card is
    the default.
    """
    if rollback:
        return {
            "experimental": {
                "label": "PASS 93 · SAFE BACKUP · DEFAULT AFTER ROLLBACK",
                "description": (
                    "PASS 94 was rolled back; this is the pinned PASS 93 safe backup "
                    "(owner, 2026-09-02), now the default again."
                ),
                "pass": "PASS 93",
                "path": BACKUP_CHANNEL,
                "deploymentState": "live",
            },
            "previous": {
                "label": "PASS 94 · ROLLED BACK",
                "description": (
                    "The PASS 94 cut, rolled back from the default. Still published here "
                    "for investigation; not recommended until it is re-promoted."
                ),
                "pass": "PASS 94",
                "path": CHANNEL,
            },
        }
    return {
        "experimental": {
            "label": "PASS 94",
            "description": DESCRIPTION,
            "pass": "PASS 94",
            "path": CHANNEL,
            "deploymentState": "live",
        },
        "previous": {
            "label": BACKUP_COPY["label"],
            "description": BACKUP_COPY["description"],
            "pass": "PASS 93",
            "path": BACKUP_CHANNEL,
        },
    }


COMMIT_MESSAGE = """publish: PASS 94 - owner list of 2026-09-02, PASS 93 pinned as the single safe backup

Owner, 2026-09-02 06:58 BST: "also when you push the next pass, pin this version
and remove all past versions, this can be the safe backup" (HF-400). gh-pages now
carries exactly channels/pass94 (live) and channels/pass93 (safe backup); every
older tree was retired by run-time enumeration and the post-state was asserted
to be exactly those two before this commit.

Gated before publish: tsc 0, full vitest floor, real-player-path arena checks,
cold-visitor first-click launch, build freshness guard, farcrysis-admission
guard (receipt-backed; the parked case still passes), in-build fallback resolves
to channels/pass93.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"""

ROLLBACK_COMMIT_MESSAGE = """rollback: default re-pointed to PASS 93 safe backup, PASS 94 kept for investigation

HF-400 rollback path (scripts/orchestration/publish_pass94.py --rollback). No tree
was deleted and nothing was rebuilt: channels/pass94 and channels/pass93 are both
still published; the root chooser now routes latest, normal and room invites to
channels/pass93 and offers PASS 94 as the rolled-back previous card.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"""


def sh(cmd, cwd=SRC, check=True, timeout=3600):
    p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True,
                       text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if check and p.returncode != 0:
        sys.exit(f"FAILED: {cmd}\n{p.stdout}{p.stderr}")
    return p.stdout + p.stderr


def farcrysis_is_selectable_in_build(dist_dir):
    """Read the BYTES the minifier emits, exactly as the old guard did.

    The registry serializes as routeId:`farcrysis`,selectable:!1 (template quotes survive
    esbuild; !1 is false). An entry without selectable:!1 in its window is an entry the menu
    will offer. Kept byte-level for the reason the first version of the old guard existed to
    record: searching for data-arena-id="farcrysis" passed green on every bundle, including
    ones with farcrysis selectable, because the menu interpolates arena ids at runtime.
    """
    entry_rx = re.compile(rb"routeId:[`'\"]farcrysis[`'\"]")
    off_rx = re.compile(rb"selectable:(?:!1|false)")
    entries_seen = 0
    selectable_entries = 0
    for path in glob.glob(os.path.join(dist_dir, "assets", "*.js")):
        with open(path, "rb") as fh:
            data = fh.read()
        for match in entry_rx.finditer(data):
            entries_seen += 1
            window = data[max(0, match.start() - 100):match.end() + 200]
            if not off_rx.search(window):
                selectable_entries += 1
    return entries_seen, selectable_entries


def farcrysis_admission_bundle_digest(dist_dir):
    """sha256 over the built JS bundle, byte-identical to the collector's own digest.

    Same recipe as scripts/qa/collect-farcrysis-admission-evidence.mjs: every assets/*.js
    file, sorted by name, each contributing its NAME then its BYTES. The name is hashed too
    so that a rename alone cannot leave the digest equal.
    """
    digest = hashlib.sha256()
    for name in sorted(os.path.basename(p) for p in
                       glob.glob(os.path.join(dist_dir, "assets", "*.js"))):
        digest.update(name.encode("utf-8"))
        with open(os.path.join(dist_dir, "assets", name), "rb") as fh:
            digest.update(fh.read())
    return digest.hexdigest()


def assert_farcrysis_admission_evidence(dist_dir):
    """HF-423: farcrysis may enter the menu ONLY behind measured admission evidence.

    Owner, 2026-08-28: farcrysis stays out of the menu until it loads. That rule is not
    relaxed here, it is made checkable. The old guard asked whether a flag was off. This one
    asks the question the flag was standing in for: does the arena actually admit, on THIS
    tree, repeatably, on a quiet machine, without compiling pipelines in the match and
    without dying?

    A tree that still ships farcrysis unselectable passes trivially - the parked arena is
    still allowed, and no receipt is read.
    """
    entries_seen, selectable_entries = farcrysis_is_selectable_in_build(dist_dir)
    if selectable_entries == 0:
        print(f"  farcrysis-admission guard: OK (parked - {entries_seen} registry "
              f"entr{'y' if entries_seen == 1 else 'ies'}, none selectable)")
        return

    if not os.path.isfile(FARCRYSIS_ADMISSION_RECEIPT):
        sys.exit("REFUSING TO PUBLISH: the build offers farcrysis in the menu but there is no "
                 f"admission receipt at {FARCRYSIS_ADMISSION_RECEIPT}. Run "
                 "`node scripts/qa/collect-farcrysis-admission-evidence.mjs --runs 3` against "
                 "the dist about to be published.")
    with open(FARCRYSIS_ADMISSION_RECEIPT, encoding="utf-8") as fh:
        receipt = json.load(fh)

    if receipt.get("contract") != "farcrysis-admission-evidence-v1":
        sys.exit("REFUSING TO PUBLISH: the farcrysis admission receipt is not a "
                 f"farcrysis-admission-evidence-v1 document ({receipt.get('contract')!r}).")

    # The receipt must describe THIS build. Keyed on the bundle bytes, not on the git SHA:
    # committing the receipt changes HEAD, so a receipt pinned to HEAD could never match the
    # tree that contains it, and a guard that cannot be satisfied gets deleted. The bundle
    # digest has no such circularity - it is what the probe loaded and what gh-pages serves.
    built = farcrysis_admission_bundle_digest(dist_dir)
    claimed = (receipt.get("bundle") or {}).get("sha256")
    if claimed != built:
        sys.exit("REFUSING TO PUBLISH: the farcrysis admission receipt measured bundle "
                 f"{str(claimed)[:12]}..., but this dist is {built[:12]}.... Rebuild, then "
                 "re-run `node scripts/qa/collect-farcrysis-admission-evidence.mjs --runs 3`. "
                 "A receipt for other bytes is not evidence about these.")

    # A run taken while ComfyUI had work queued is void, and the collector says so itself
    # rather than making the reader guess. The ratio survives a busy machine better than an
    # absolute budget would, but "better" is not "immune", and the receipt already carries
    # the fact - so it is checked rather than trusted.
    if receipt.get("contended") is not False:
        sys.exit("REFUSING TO PUBLISH: the farcrysis admission receipt is marked "
                 f"contended={receipt.get('contended')!r} "
                 f"({receipt.get('contendedNote')}). Re-run the collector on a quiet GPU with "
                 "an empty ComfyUI queue; a contended measurement is not evidence.")

    summary = receipt.get("summary") or {}
    runs = receipt.get("runs") or 0
    if runs < FARCRYSIS_ADMISSION_MIN_RUNS:
        sys.exit(f"REFUSING TO PUBLISH: the farcrysis admission receipt has {runs} run(s); "
                 f"{FARCRYSIS_ADMISSION_MIN_RUNS} paired runs are required. One run is an "
                 "anecdote.")
    if not summary.get("allAdmitted"):
        sys.exit("REFUSING TO PUBLISH: not every farcrysis run in the admission receipt "
                 "reached 'admitted'.")
    if summary.get("anyCrashed") or summary.get("anyPageErrors"):
        sys.exit("REFUSING TO PUBLISH: a farcrysis admission run crashed or logged a page "
                 "error. That is the 279 s failure this guard exists for.")
    if (summary.get("maxMenuPipelines") or 0) != 0:
        sys.exit("REFUSING TO PUBLISH: farcrysis created "
                 f"{summary.get('maxMenuPipelines')} WebGPU pipeline(s) inside the match. "
                 "Lane C's load fix has regressed; fix it by compiling less, never by "
                 "widening the admission fence.")
    worst = summary.get("worstPairRatio")
    if worst is None or worst > FARCRYSIS_ADMISSION_RATIO_CEILING:
        sys.exit("REFUSING TO PUBLISH: farcrysis admits at "
                 f"{worst}x the atomic-acres control measured in the same window "
                 f"(ceiling {FARCRYSIS_ADMISSION_RATIO_CEILING}x).")
    print(f"  farcrysis-admission guard: OK ({runs} paired runs, uncontended, all admitted, "
          f"0 in-match pipelines, worst pair ratio {worst}x <= "
          f"{FARCRYSIS_ADMISSION_RATIO_CEILING}x)")


def assert_release_identity(dist_dir):
    """HF-406: does the tree about to be published call itself the pass it IS?

    This is the fourth time the class has been caught: PASS 80 and PASS 81 published
    under the previous pass number, PASS 82 did it again, and on 2026-09-02 the live
    PASS 93 channel served an eleven-pass-old badge and release notes out of its
    changelog chunk while index.html looked perfectly correct. The badge check must
    therefore read the built ASSET bytes, which is what
    scripts/qa/verify-built-release-identity.mjs does - it reads the expected pass out
    of src/release-identity.ts, so there is no argument here to get wrong.

    Added as a guard (never replacing one) so the check is enforced by the publish path
    rather than only described in the runbook.
    """
    result = subprocess.run(
        ["node", "scripts/qa/verify-built-release-identity.mjs", "--dist", dist_dir],
        cwd=SRC, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    output = (result.stdout + result.stderr).strip()
    if result.returncode != 0:
        sys.exit("REFUSING TO PUBLISH: the built tree does not carry the stamped release "
                 "identity, so the badge, the features panel and the release notes would "
                 "name the wrong pass:" + os.linesep + output)
    print(f"  release-identity guard: OK ({output.splitlines()[-1] if output else 'no output'})")


def release_identity_guard_red_test():
    """Prove the identity guard can fire before trusting its pass."""
    import tempfile
    with tempfile.TemporaryDirectory() as red_dir:
        os.makedirs(os.path.join(red_dir, "assets"))
        with open(os.path.join(red_dir, "assets", "release-identity-red.js"), "w",
                  encoding="utf-8") as fh:
            fh.write('const a="PASS 1";export{a};')
        fired = False
        try:
            assert_release_identity(red_dir)
        except SystemExit:
            fired = True
        if not fired:
            sys.exit("REFUSING: the release-identity guard failed its own red test - it cannot fire")


def farcrysis_guard_red_test():
    """Prove the admission guard can fire before trusting its pass.

    The old farcrysis guard shipped vacuous once, so its successor keeps a red test - and
    fires it on the axes that actually matter now. Four halves are proved: a selectable build
    whose receipt is over the ratio ceiling must refuse; a selectable build whose receipt is
    marked contended must refuse; a selectable build with NO receipt at all must refuse; and
    the parked build must still pass with no receipt present.
    """
    import tempfile
    global FARCRYSIS_ADMISSION_RECEIPT
    saved = FARCRYSIS_ADMISSION_RECEIPT

    def fires(dist_dir, label):
        try:
            assert_farcrysis_admission_evidence(dist_dir)
        except SystemExit:
            return
        sys.exit(f"REFUSING: the farcrysis admission guard failed its own red test - {label}")

    with tempfile.TemporaryDirectory() as red_dir:
        os.makedirs(os.path.join(red_dir, "assets"))
        with open(os.path.join(red_dir, "assets", "red-selectable.js"), "wb") as fh:
            fh.write(b"id:`farcrysis`,routeId:`farcrysis`,legacyAliases:[]")
        # The digest MATCHES on purpose in both bad receipts, so each refusal below can only
        # come from the field under test. A red test that fails for an incidental reason
        # proves nothing about the check it claims to exercise.
        digest = farcrysis_admission_bundle_digest(red_dir)

        def write_receipt(name, **overrides):
            body = {"contract": "farcrysis-admission-evidence-v1",
                    "bundle": {"sha256": digest},
                    "runs": 3,
                    "contended": False,
                    "contendedNote": "red test",
                    "summary": {"allAdmitted": True, "anyCrashed": False,
                                "anyPageErrors": False, "maxMenuPipelines": 0,
                                "worstPairRatio": 1.2833}}
            body.update(overrides)
            path = os.path.join(red_dir, name)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(body, fh)
            return path

        try:
            # (a) over the ratio ceiling
            FARCRYSIS_ADMISSION_RECEIPT = write_receipt(
                "red-ratio.json",
                summary={"allAdmitted": True, "anyCrashed": False, "anyPageErrors": False,
                         "maxMenuPipelines": 0, "worstPairRatio": 99.0})
            fires(red_dir, "it cannot fire on a receipt over the pair-ratio ceiling")
            # (b) measured on a contended machine
            FARCRYSIS_ADMISSION_RECEIPT = write_receipt("red-contended.json", contended=True)
            fires(red_dir, "it accepted a receipt measured on a contended machine")
            # (c) no receipt at all behind a selectable build
            FARCRYSIS_ADMISSION_RECEIPT = os.path.join(red_dir, "absent.json")
            fires(red_dir, "it accepted a selectable build with no receipt at all")
            # (d) the good receipt on the same bytes must PASS, or (a)-(c) prove nothing:
            #     a guard that refuses everything is not a guard, it is a wall.
            FARCRYSIS_ADMISSION_RECEIPT = write_receipt("green.json")
            assert_farcrysis_admission_evidence(red_dir)
        finally:
            FARCRYSIS_ADMISSION_RECEIPT = saved

        # The parked case must still pass with no receipt present.
        parked = os.path.join(red_dir, "parked")
        os.makedirs(os.path.join(parked, "assets"))
        with open(os.path.join(parked, "assets", "green.js"), "wb") as fh:
            fh.write(b"id:`farcrysis`,routeId:`farcrysis`,selectable:!1,legacyAliases:[]")
        assert_farcrysis_admission_evidence(parked)


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


def publish_root_shell(worktree, channels, sources, dry_run=False):
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

    With dry_run=True nothing is written or removed; the function returns the generation
    plus the list of files it WOULD write and the superseded assets it WOULD sweep.
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

    written = []

    def write(name, data):
        written.append(name)
        if dry_run:
            return
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

    swept = []
    for path in glob.glob(os.path.join(worktree, "release-shell.*.js")) \
            + glob.glob(os.path.join(worktree, "release-shell.*.css")) \
            + glob.glob(os.path.join(worktree, "release-manifest.*.json")):
        stamp = os.path.basename(path).split(".")[1]
        if stamp not in keep_generations:
            swept.append(os.path.basename(path))
            if not dry_run:
                os.remove(path)

    verb = "would be published" if dry_run else "published"
    print(f"  root chooser {verb} as generation {generation}"
          f" ({len(channels)} channels inlined, {len(swept)} superseded asset(s) swept,"
          f" keeping {sorted(keep_generations)})")
    return generation, written, sorted(swept), sorted(keep_generations)


def assert_predecessors_offered(channels):
    """The newest pass must not be the only recent thing on offer.

    Owner, 2026-08-30: "i dont want pass 63, stable webgl, i want the previous 1/2 versions
    we had". The failure mode this blocks is a chooser that carries the newest pass plus
    one ancient fallback, which is what he was looking at.

    HF-400, owner 2026-09-02 06:58 BST, verbatim:
    "also when you push the next pass, pin this version and remove all past versions, this can be the safe backup"
    That is a policy change by the owner, not a weakened gate: the chooser now carries the
    newest pass and EXACTLY ONE pinned recent predecessor, so the threshold moves from two
    predecessors to one. What the guard still refuses is the original complaint - the
    newest pass beside nothing but an ancient fallback.
    """
    def number(channel):
        match = re.search(r"\d+(?:\.\d+)?", str(channel.get("pass", "")))
        return float(match.group()) if match else float("-inf")

    ranked = sorted(channels.values(), key=number, reverse=True)
    if not ranked:
        sys.exit("REFUSING: no channels at all")
    newest = number(ranked[0])
    predecessors = [c for c in ranked[1:] if number(c) > newest - 12]
    if len(predecessors) < 1:
        sys.exit(
            "REFUSING: this chooser would offer PASS "
            f"{newest:g} and no recent predecessor. HF-400 pins exactly one safe backup "
            "(PASS 93) beside the newest pass; publishing the newest pass beside nothing "
            "but an ancient fallback is the exact complaint of 2026-08-30. Present: "
            + ", ".join(str(c.get("pass")) for c in ranked))
    print("  predecessor guard: OK (offering "
          + ", ".join(str(c.get("pass")) for c in ranked[:2]) + ")")


def predecessor_guard_red_test():
    """A gate that has never been seen red is a gate nobody has checked can fail."""
    fired = False
    try:
        assert_predecessors_offered({
            "pass94": {"pass": "PASS 94", "path": "channels/pass94"},
            "stable": {"pass": "PASS 63", "path": "channels/pass63-rollback"},
        })
    except SystemExit:
        fired = True
    if not fired:
        sys.exit("REFUSING: the predecessor guard failed its own red test - it cannot fire")


def resolve_in_game_fallback():
    """Which channel the in-build chooser (src/bootstrap.ts) draws as its second card.

    src/bootstrap.ts renders its own two-card chooser from release-channels.json whenever a
    visitor lands on a channel URL with no ?release= - a direct link, or a bookmark. Its
    second card is whatever `const stableFallback = a ?? b ?? ...` resolves to.

    2026-08-31: this used to ASSUME the fallback was `rollback ?? stable`. That is exactly
    the class of bug this repo has spent the week removing - a checker that hardcodes what
    it thinks the code does, and then passes or fails for the wrong reason when the code
    changes. So read the key list out of the source and resolve whichever one actually
    wins, as JS would.
    """
    config_path = os.path.join(SRC, "release-channels.json")
    config = json.load(open(config_path, encoding="utf-8"))
    bootstrap_src = open(os.path.join(SRC, "src", "bootstrap.ts"), encoding="utf-8").read()
    match = re.search(r"const stableFallback = ([^;]+);", bootstrap_src)
    if not match:
        sys.exit("REFUSING: cannot find `const stableFallback = ...` in src/bootstrap.ts, so "
                 "this guard can no longer tell which channel the in-build chooser offers. "
                 "Fix the guard rather than removing it.")
    candidates = re.findall(r"releaseChannels\.([A-Za-z0-9_]+)", match.group(1))
    if not candidates:
        sys.exit(f"REFUSING: could not read any channel key from `{match.group(1).strip()}`")
    for candidate in candidates:          # `a ?? b` - first one present wins, as in JS
        if config.get(candidate):
            return candidate, config[candidate], candidates
    sys.exit("REFUSING: release-channels.json has none of the channels the in-build "
             f"chooser would fall back to ({', '.join(candidates)}), so it has no "
             "second card to draw")


def assert_in_game_fallback_exists(worktree, post_state=None):
    """The chooser INSIDE each build must link the PASS 93 safe backup, and it must exist.

    HF-400 makes this guard stricter than its pass93 ancestor. It is no longer enough for
    the fallback to point at SOME tree on gh-pages: every tree except pass94 and pass93 is
    being retired by this very publish, so a fallback that resolves to the-big-one or
    recent-stable would exist while this guard ran and 404 the moment the commit landed.
    The fallback must resolve to channels/pass93 - the one backup the owner asked for.

    `post_state` is the set of channel trees that will exist AFTER retirement (used by the
    dry run, where nothing has been deleted yet); without it the tree is checked on disk.
    """
    key, fallback, candidates = resolve_in_game_fallback()
    path = fallback.get("path", "")
    if path != BACKUP_CHANNEL:
        sys.exit(
            f"REFUSING: the in-build chooser (src/bootstrap.ts) draws its fallback card from "
            f"release-channels.json '{key}' -> {path or '<no path>'}. HF-400 pins "
            f"{BACKUP_CHANNEL} as the ONLY backup and retires every other tree, so that card "
            "would 404 as soon as this publish landed. Re-pin src/bootstrap.ts "
            f"(`const stableFallback = ...`, candidates: {', '.join(candidates)}) and "
            f"release-channels.json so the fallback resolves to {BACKUP_CHANNEL}.")
    tree = path.split("/")[-1]
    present = (tree in post_state) if post_state is not None \
        else os.path.isdir(os.path.join(worktree, *path.split("/")))
    if not present:
        sys.exit(f"REFUSING: the in-build fallback {path} is NOT on gh-pages. Every visitor "
                 f"opening a channel URL directly would be offered {fallback.get('pass')} and "
                 "get a 404.")
    print(f"  in-build fallback guard: OK ({key} -> {path} is the HF-400 safe backup and is on gh-pages)")


def assert_build_is_not_stale():
    """The build being published must be newer than the sources it was built from.

    THE DEFECT THIS CLOSES. `dist-passNN` is not produced by any npm script - it is a
    directory someone populates by hand from `dist`. The only check here was
    `os.path.isdir`, so on 2026-08-31 a publish ran against a tree built BEFORE that
    session's changes, printed every guard OK, printed PUBLISHED, and put a stale bundle
    on the channel. The owner would have loaded a build with none of the fixes in it and
    reasonably concluded they were never made.

    Existence is not freshness. This compares the newest file in the build against the
    newest tracked source file and refuses a build that is older.

    Scope relative to publish_pass93.py (pinned by src/release-topology.test.ts): the
    directory-exclusion set is the pass93 set plus `dist-pass94` and a `dist-*` prefix
    skip (a hand-copied build is never source). Nothing else is excluded - in particular
    NOT `artifacts/`: it is gitignored, but the gate's scope stays exactly the pass93
    gate's. If a file there is newer than the build, rebuild and copy again.
    """
    newest_source = 0.0
    newest_source_path = None
    for root, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in {
            "node_modules", ".git", "dist", "dist-pass83", "dist-pass84", "dist-pass85", "dist-pass86", "dist-pass87", "dist-pass88", "dist-pass89", "dist-pass90", "dist-pass91", "dist-pass92", "dist-pass93", "dist-pass94", ".gh-pages-publish",
            ".qa-dist", "source-assets", "public", "docs", "baselines",
        } and not d.startswith(".") and not d.startswith("dist-")]
        for name in files:
            if not name.endswith((".ts", ".tsx", ".css", ".html", ".json")):
                continue
            path = os.path.join(root, name)
            try:
                stamp = os.path.getmtime(path)
            except OSError:
                continue
            if stamp > newest_source:
                newest_source, newest_source_path = stamp, path

    newest_build = 0.0
    for root, _dirs, files in os.walk(DIST):
        for name in files:
            try:
                newest_build = max(newest_build, os.path.getmtime(os.path.join(root, name)))
            except OSError:
                continue

    if newest_build < newest_source:
        import datetime
        fmt = lambda t: datetime.datetime.fromtimestamp(t).strftime("%H:%M:%S")
        sys.exit(
            f"STALE BUILD: {DIST} is older than the sources it should contain.\n"
            f"  newest build file:  {fmt(newest_build)}\n"
            f"  newest source file: {fmt(newest_source)}  ({newest_source_path})\n"
            f"Run `npm run build` and refresh {DIST} from dist/, then publish again.\n"
            f"Publishing anyway would ship a bundle without the changes just made.")
    print(f"  build freshness guard: OK (build newer than newest source)")


def read_live_config(gh_pages_dir):
    """The chooser config currently on gh-pages, or {} when there is none yet."""
    cfg_path = os.path.join(gh_pages_dir, "release-channel-config.js")
    if not os.path.isfile(cfg_path):
        return {}
    raw = open(cfg_path, encoding="utf-8").read()
    m = re.search(r"=\s*(\{.*\})\s*;?\s*$", raw.strip(), re.S)
    if not m:
        sys.exit("release-channel-config.js is not in the shape this script understands")
    return json.loads(m.group(1))


def enumerate_channel_trees(gh_pages_dir):
    """Every directory under channels/ on gh-pages, read from disk at run time."""
    channels_dir = os.path.join(gh_pages_dir, "channels")
    if not os.path.isdir(channels_dir):
        return []
    return sorted(name for name in os.listdir(channels_dir)
                  if os.path.isdir(os.path.join(channels_dir, name)))


def plan_retirements(gh_pages_dir):
    """HF-400: everything on gh-pages except {pass94, pass93} goes. Enumerated, not listed.

    Returns (present, to_delete). Refuses if the backup the owner asked to pin is not there
    to be pinned: retiring the rest and leaving pass94 alone would be the opposite of what
    he said.
    """
    present = enumerate_channel_trees(gh_pages_dir)
    missing = KEEP_AT_LEAST - set(present)
    if missing:
        sys.exit(f"REFUSING: gh-pages has no {sorted(missing)} tree to pin as the safe backup "
                 f"(present: {present}). HF-400 pins PASS 93 beside PASS 94; it cannot be "
                 "pinned if it is not there.")
    to_delete = [name for name in present if name not in EXPECTED_POST_STATE]
    return present, to_delete


def assert_post_state(gh_pages_dir):
    """After retirement, channels/ must be EXACTLY {pass94, pass93}. Read from disk."""
    actual = set(enumerate_channel_trees(gh_pages_dir))
    if actual != EXPECTED_POST_STATE:
        sys.exit(f"REFUSING: channels/ post-state is {sorted(actual)}, expected exactly "
                 f"{sorted(EXPECTED_POST_STATE)} ({POLICY}). Nothing was committed.")
    print(f"  post-state guard: OK (channels/ is exactly {sorted(actual)})")


def assert_chooser_matches_post_state(channels, post_state):
    """Every card the chooser will DRAW must be a tree that exists after retirement.

    The chooser now renders whatever the config carries, so a stale key is a card that
    404s in front of a player. And the inverse: every kept tree must be offered, or the
    owner's backup is published but unselectable (the pass80 failure).
    """
    offered = {}
    for key, channel in channels.items():
        path = channel.get("path")
        if not path:
            sys.exit(f"REFUSING: channel {key} has no path")
        offered[path.split("/")[-1]] = key
    if set(offered) != set(post_state):
        sys.exit(f"REFUSING: chooser offers trees {sorted(offered)} but gh-pages would carry "
                 f"{sorted(post_state)}; the two must be identical under {POLICY}")


def add_to_worktree(gh_pages_dir, dry_run):
    """Copy dist-pass94 into channels/pass94 (or say that it would)."""
    target = os.path.join(gh_pages_dir, *CHANNEL.split("/"))
    if dry_run:
        print(f"  would write {CHANNEL}/ <- {os.path.relpath(DIST, SRC)}/ (replacing any existing tree)")
        return
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(DIST, target)
    print(f"  {CHANNEL} <- {os.path.relpath(DIST, SRC)}")


def retire(gh_pages_dir, to_delete, dry_run):
    for name in to_delete:
        retired_dir = os.path.join(gh_pages_dir, "channels", name)
        if dry_run:
            print(f"  would delete channels/{name}/")
            continue
        shutil.rmtree(retired_dir)
        print(f"  retired channels/{name}/")


def checkout_gh_pages():
    """Fresh detached worktree of ORIGIN's gh-pages, never the local ref.

    The local gh-pages was once 23 commits behind, and publishing from it would have
    silently deleted four retained builds.
    """
    sh(f'git worktree remove --force "{WORKTREE}"', check=False)
    shutil.rmtree(WORKTREE, ignore_errors=True)
    sh("git fetch --no-tags origin gh-pages")
    sh(f'git worktree add --detach "{WORKTREE}" FETCH_HEAD')
    print("gh-pages at", sh("git rev-parse --short HEAD", cwd=WORKTREE).strip())
    return WORKTREE


def run_guard(name, verdicts, fn, *args, **kwargs):
    """Dry run only: record a guard's verdict instead of exiting on the first refusal."""
    try:
        fn(*args, **kwargs)
        verdicts[name] = {"ok": True, "detail": "OK"}
    except SystemExit as exc:
        detail = str(exc.code) if exc.code not in (None, 0) else "OK"
        verdicts[name] = {"ok": exc.code in (None, 0), "detail": detail}
        print(f"  {name}: WOULD REFUSE - {detail.splitlines()[0]}")


def dry_run(gh_pages_dir, plan_json, rollback=False):
    mode = "ROLLBACK" if rollback else "PUBLISH"
    print(f"DRY RUN {mode} ({POLICY}) against {gh_pages_dir} - nothing will be written, added, committed or pushed")
    verdicts = {}

    if rollback:
        # A rollback needs no build: both trees are already on gh-pages, or there is
        # nothing to roll back to / from.
        present = enumerate_channel_trees(gh_pages_dir)
        run_guard("rollback-state", verdicts, assert_post_state, gh_pages_dir)
        to_delete, kept = [], [name for name in present if name in EXPECTED_POST_STATE]
        post_state = sorted(present)
    else:
        # Build guards. Reported, not fatal, so a plan can be printed before dist-pass94 exists.
        if os.path.isdir(DIST):
            run_guard("build-freshness", verdicts, assert_build_is_not_stale)
            run_guard("farcrysis-red-test", verdicts, farcrysis_guard_red_test)
            run_guard("farcrysis-admission", verdicts, assert_farcrysis_admission_evidence, DIST)
            # HF-406: the tree must call itself the pass it is stamped as.
            run_guard("release-identity-red-test", verdicts, release_identity_guard_red_test)
            run_guard("release-identity", verdicts, assert_release_identity, DIST)
        else:
            verdicts["build-present"] = {"ok": False, "detail": f"no build at {DIST}"}
            print(f"  build-present: WOULD REFUSE - no build at {DIST}")
        present, to_delete = [], []
        run_guard("backup-present", verdicts, lambda: plan_retirements(gh_pages_dir))
        if verdicts["backup-present"]["ok"]:
            present, to_delete = plan_retirements(gh_pages_dir)
        post_state = sorted((set(present) - set(to_delete)) | {LIVE_TREE})
        kept = [name for name in present if name in EXPECTED_POST_STATE and name != LIVE_TREE]
    run_guard("predecessor-red-test", verdicts, predecessor_guard_red_test)
    live_config = read_live_config(gh_pages_dir)
    channels = build_channels(rollback=rollback)

    print("\nPLAN")
    print(f"  channel trees on gh-pages now: {present}")
    for name in to_delete:
        print(f"  would delete channels/{name}/")
    print(f"  would keep   {['channels/' + name + '/' for name in kept]}")
    if not rollback:
        add_to_worktree(gh_pages_dir, dry_run=True)
    print(f"  channels/ post-state would be: {post_state}")
    dropped_keys = [k for k in live_config if k not in channels or live_config[k].get("path") != channels[k].get("path")]
    print(f"  chooser keys live now: {list(live_config)}; would become: {list(channels)} "
          f"(dropped/re-keyed: {dropped_keys})")
    for key, channel in channels.items():
        print(f"    {key}: {channel['pass']} -> {channel['path']}  \"{channel['label']}\"")

    run_guard("predecessors-offered", verdicts, assert_predecessors_offered, channels)
    run_guard("chooser-matches-post-state", verdicts, assert_chooser_matches_post_state, channels, post_state)
    run_guard("post-state-exact", verdicts,
              lambda: None if set(post_state) == EXPECTED_POST_STATE else sys.exit(
                  f"post-state would be {post_state}, expected {sorted(EXPECTED_POST_STATE)}"))
    run_guard("in-build-fallback", verdicts, assert_in_game_fallback_exists, gh_pages_dir, set(post_state))
    fallback_key, fallback, _ = resolve_in_game_fallback()

    sources = read_shell_sources()
    generation, root_files, swept, keep_generations = publish_root_shell(
        gh_pages_dir, channels, sources, dry_run=True)
    for name in root_files:
        print(f"  would write {name}")
    for name in swept:
        print(f"  would sweep {name}")

    would_publish = all(v["ok"] for v in verdicts.values())
    plan = {
        "policy": POLICY,
        "mode": mode.lower(),
        "ghPagesDir": gh_pages_dir,
        "channel": CHANNEL,
        "backup": BACKUP_CHANNEL,
        "treesPresent": present,
        "treesToDelete": to_delete,
        "treesKept": kept,
        "treeAdded": None if rollback else LIVE_TREE,
        "postState": post_state,
        "chooser": {"keys": list(channels), "channels": channels, "droppedLiveKeys": dropped_keys},
        "fallback": {"key": fallback_key, "path": fallback.get("path"), "pass": fallback.get("pass"),
                     "ok": verdicts["in-build-fallback"]["ok"]},
        "generation": generation,
        "keepGenerations": keep_generations,
        "rootFilesToWrite": root_files,
        "rootAssetsToSweep": swept,
        "guards": verdicts,
        "wouldPublish": would_publish,
    }
    if plan_json:
        with open(plan_json, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(plan, fh, indent=2)
            fh.write("\n")
        print(f"  plan written to {plan_json}")

    refused = [name for name, v in verdicts.items() if not v["ok"]]
    if refused:
        print(f"\nDRY RUN: {mode.lower()} WOULD REFUSE ({len(refused)} guard(s) red: {', '.join(refused)})")
        return 2
    print(f"\nDRY RUN: every guard green; a real run would commit and push the {mode.lower()} plan above")
    return 0


def commit_and_push(worktree, message):
    sh("git add -A", cwd=worktree)
    out = sh(["git", "commit", "-m", message], cwd=worktree, check=False)
    if "nothing to commit" in out:
        print("nothing to commit")
        return 0
    sh("git push origin HEAD:gh-pages", cwd=worktree)
    print("\nPUBLISHED: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/")
    return 0


def rollback(worktree, sources):
    """Re-point the default at the PASS 93 safe backup. Deletes nothing, rebuilds nothing."""
    assert_post_state(worktree)
    channels = build_channels(rollback=True)
    assert_chooser_matches_post_state(channels, enumerate_channel_trees(worktree))
    assert_predecessors_offered(channels)
    assert_in_game_fallback_exists(worktree)
    publish_root_shell(worktree, channels, sources)
    print("  default now:", channels["experimental"]["pass"], "->", channels["experimental"]["path"])
    assert_post_state(worktree)
    return commit_and_push(worktree, ROLLBACK_COMMIT_MESSAGE)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true",
                        help="print the full plan and every guard verdict; touch nothing")
    parser.add_argument("--rollback", action="store_true",
                        help="re-point the chooser default at channels/pass93 (PASS 94 stays "
                             "published as the previous card); no tree is deleted, no build needed")
    parser.add_argument("--gh-pages-dir", default=None,
                        help="dry run only: plan against this local gh-pages checkout instead of "
                             "fetching origin/gh-pages into a temp worktree")
    parser.add_argument("--plan-json", default=None,
                        help="dry run only: also write the plan as JSON to this path")
    args = parser.parse_args(argv)
    if not args.dry_run and (args.gh_pages_dir or args.plan_json):
        parser.error("--gh-pages-dir and --plan-json are dry-run options")

    if args.dry_run:
        gh_pages_dir = args.gh_pages_dir
        if gh_pages_dir is None:
            gh_pages_dir = checkout_gh_pages()
        elif not os.path.isdir(gh_pages_dir):
            sys.exit(f"--gh-pages-dir {gh_pages_dir} is not a directory")
        return dry_run(os.path.abspath(gh_pages_dir), args.plan_json, rollback=args.rollback)

    if args.rollback:
        return rollback(checkout_gh_pages(), read_shell_sources())

    if not os.path.isdir(DIST):
        sys.exit(f"no build at {DIST}")
    assert_build_is_not_stale()
    farcrysis_guard_red_test()
    assert_farcrysis_admission_evidence(DIST)
    # HF-406: refuse a tree that does not call itself the pass src/release-identity.ts
    # stamped. Three prior publishes shipped under the previous pass number.
    release_identity_guard_red_test()
    assert_release_identity(DIST)
    predecessor_guard_red_test()
    sources = read_shell_sources()

    worktree = checkout_gh_pages()

    present, to_delete = plan_retirements(worktree)
    print(f"  channel trees on gh-pages: {present}")
    add_to_worktree(worktree, dry_run=False)
    retire(worktree, to_delete, dry_run=False)
    assert_post_state(worktree)

    channels = build_channels()
    live_config = read_live_config(worktree)
    dropped = sorted(set(live_config) - set(channels))
    if dropped:
        print(f"  chooser keys retired under {POLICY}: {dropped}")
    missing = KEEP_AT_LEAST - {c["path"].split("/")[-1] for c in channels.values()}
    if missing:
        sys.exit(f"REFUSING: would drop the tree the owner asked to keep: {sorted(missing)}")
    assert_chooser_matches_post_state(channels, enumerate_channel_trees(worktree))
    assert_predecessors_offered(channels)
    assert_in_game_fallback_exists(worktree)
    publish_root_shell(worktree, channels, sources)
    print("  channels now:", ", ".join(v["pass"] for v in channels.values()))

    # Last look before the commit: the tree on disk, not the plan, is what ships.
    assert_post_state(worktree)
    return commit_and_push(worktree, COMMIT_MESSAGE)


if __name__ == "__main__":
    sys.exit(main())
