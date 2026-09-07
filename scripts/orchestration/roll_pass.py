"""Roll the release stamp and publish ritual from PASS N-1 to PASS N (HF-400 policy).

One deterministic edit set so a cut is a command, not a checklist:

  python scripts/orchestration/roll_pass.py --pass 85 \
      --title "Pass 85 · Arms, Drop Shots & Firing Range Roof" \
      --areas FIRST-PERSON,MOVEMENT,ARENAS \
      --summary "..." --highlight "..." --highlight "..." \
      --previous-released-at 2026-09-02T15:14:00+01:00

What it does (every step asserts the exact string it edits was found once):
  1. scripts/orchestration/publish_pass{N-1}.py  -> publish_pass{N}.py, pass numbers rolled
     (live = pass{N}, backup = pass{N-1}); the freshness-guard exclusion list keeps every
     older dist-pass* entry so src/release-topology.test.ts's "pass{N-1} set plus
     dist-pass{N}" pin still holds; DESCRIPTION replaced by --summary.
  2. its contract test publish_pass{N-1}_plan.test.mjs -> publish_pass{N}_plan.test.mjs.
  3. src/release-identity.ts stamped PASS N / channels/pass{N}.
  4. release-channels.json: latest + experimental -> PASS N; the safe-backup key
     pass{N-2}Backup -> pass{N-1}Backup pointing at channels/pass{N-1}.
  5. src/bootstrap.ts + src/release-channel.ts read the new backup key.
  6. src/release-topology.test.ts re-pinned (route, script path, LIVE_TREE, backup key,
     dist-pass set).
  7. src/changelog.ts: the previous pass's pending releasedAt becomes the real receipt
     time (--previous-released-at), and a new top entry for PASS N is inserted;
     src/changelog.test.ts re-pinned to the new id/label.
Nothing is committed. Run tsc, the release tests and the plan test afterwards.
"""
from __future__ import annotations

import argparse
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def read(p: str) -> str:
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p: str, s: str) -> None:
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def replace_once(s: str, old: str, new: str, where: str) -> str:
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{where}: expected exactly one occurrence of {old!r}, found {n}")
    return s.replace(old, new)


def roll_numbers(s: str, n: int) -> str:
    """pass{n-1} -> pass{n}, pass{n-2} -> pass{n-1} in every spelling, simultaneously."""
    a, b = n - 1, n - 2

    def sub(m: re.Match) -> str:
        prefix, num = m.group(1), int(m.group(2))
        if num == a:
            return f"{prefix}{n}"
        if num == b:
            return f"{prefix}{a}"
        return m.group(0)

    return re.sub(r"(PASS |Pass |pass|dist-pass|publish_pass)(\d{2})\b", sub, s)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pass", dest="n", type=int, required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--areas", required=True, help="comma-separated")
    ap.add_argument("--summary", required=True)
    ap.add_argument("--highlight", action="append", required=True)
    ap.add_argument("--previous-released-at", required=True,
                    help="ISO time of the previous pass's gh-pages publish commit")
    args = ap.parse_args()
    n, a, b = args.n, args.n - 1, args.n - 2
    orch = os.path.join(ROOT, "scripts", "orchestration")

    # 1. publish script
    src_py = os.path.join(orch, f"publish_pass{a}.py")
    dst_py = os.path.join(orch, f"publish_pass{n}.py")
    py = roll_numbers(read(src_py), n)
    # the freshness-guard exclusion list names every dist-pass copy from 83 to this pass, once each
    pat = re.compile('(?:"dist-pass' + chr(92) + 'd{2}", )+')
    if not pat.search(py):
        raise SystemExit("publish script: dist-pass exclusion list not found")
    py = pat.sub("".join(f'"dist-pass{k}", ' for k in range(83, n + 1)), py, count=1)
    m = re.search(r'\nDESCRIPTION = \(\n(?:    "[^\n]*\n)+\)', py)
    if not m:
        raise SystemExit("publish script: DESCRIPTION block not found")
    desc = args.summary.replace('"', '\\"')
    py = py[:m.start()] + f'\nDESCRIPTION = (\n    "{desc}"\n)' + py[m.end():]
    write(dst_py, py)

    # 2. contract test
    src_t = os.path.join(orch, f"publish_pass{a}_plan.test.mjs")
    dst_t = os.path.join(orch, f"publish_pass{n}_plan.test.mjs")
    t = roll_numbers(read(src_t), n).replace(f"pass{b}Backup", f"pass{a}Backup")
    t = chr(10).join(l for l in t.split(chr(10)) if "SAFE BACKUP<" not in l)  # the pass84-only label change
    write(dst_t, t)

    # 3. identity
    p = os.path.join(ROOT, "src", "release-identity.ts")
    write(p, roll_numbers(read(p), n))

    # 4. release-channels.json
    p = os.path.join(ROOT, "release-channels.json")
    s = read(p)
    s = re.sub(r'"latest": \{\n    "label": "PASS \d+",\n    "description": "[^\n]*"\n  \}',
               f'"latest": {{\n    "label": "PASS {n}",\n    "description": "{desc}"\n  }}', s, count=1)
    s = re.sub(r'"experimental": \{\n    "pass": "PASS \d+",\n    "label": "PASS \d+",\n    "description": "[^\n]*",\n    "path": "channels/pass\d+"\n  \}',
               f'"experimental": {{\n    "pass": "PASS {n}",\n    "label": "PASS {n}",\n    "description": "{desc}",\n    "path": "channels/pass{n}"\n  }}', s, count=1)
    s = replace_once(s, f'"pass{b}Backup": {{', f'"pass{a}Backup": {{', "release-channels.json backup key")
    s = replace_once(s, f'"label": "PASS {b} · SAFE BACKUP"', f'"label": "PASS {a} · SAFE BACKUP"', "release-channels.json backup label")
    s = replace_once(s, f'"pass": "PASS {b}",\n    "path": "channels/pass{b}"', f'"pass": "PASS {a}",\n    "path": "channels/pass{a}"', "release-channels.json backup path")
    write(p, s)

    # 5. bootstrap + release-channel
    p = os.path.join(ROOT, "src", "bootstrap.ts")
    s = read(p)
    s = replace_once(s, f"releaseChannels.pass{b}Backup ??", f"releaseChannels.pass{a}Backup ??", "bootstrap.ts fallback key")
    write(p, roll_numbers(s, n))
    p = os.path.join(ROOT, "src", "release-channel.ts")
    s = read(p)
    s = replace_once(s, f"pass{b}Backup?: Readonly<", f"pass{a}Backup?: Readonly<", "release-channel.ts key type")
    write(p, roll_numbers(s, n))

    # 6. topology test
    p = os.path.join(ROOT, "src", "release-topology.test.ts")
    write(p, roll_numbers(read(p), n).replace(f"config.pass{b}Backup", f"config.pass{a}Backup"))

    # 7. changelog
    p = os.path.join(ROOT, "src", "changelog.ts")
    s = read(p)
    s = replace_once(s, f"const pass{a}ReleasedAt = resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE);",
                     f"const pass{n}ReleasedAt = resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE);\n"
                     f"/** gh-pages publish receipt for PASS {a}. */\n"
                     f"const pass{a}ReleasedAt = '{args.previous_released_at}';", "changelog.ts pending releasedAt")
    areas = ", ".join(f"'{x.strip()}'" for x in args.areas.split(","))
    hl = "\n".join(f"      {repr(h)}," for h in args.highlight)
    entry = (
        "  Object.freeze({\n"
        "    // HF-406: the current entry. `pass` is read from the release stamp so the badge\n"
        "    // cannot drift from the build. When the next pass is stamped, ADD ITS ENTRY HERE -\n"
        "    // the identity-surface test fails while the title still names the previous pass.\n"
        f"    id: 'pass{n}',\n"
        f"    pass: 'PASS {n}',\n"
        f"    title: {repr(args.title)},\n"
        f"    releasedAt: pass{n}ReleasedAt,\n"
        f"    areas: Object.freeze([{areas}]),\n"
        f"    summary: {repr(args.summary)},\n"
        "    highlights: Object.freeze([\n"
        f"{hl}\n"
        f"      'Pass {a} stays published as the single safe backup; every older channel is retired',\n"
        "    ]),\n"
        "  }),\n"
    )
    s = replace_once(s, "export const CHANGELOG: readonly ChangelogEntry[] = Object.freeze([\n",
                     "export const CHANGELOG: readonly ChangelogEntry[] = Object.freeze([\n" + entry, "changelog.ts CHANGELOG head")
    write(p, s)
    p = os.path.join(ROOT, "src", "changelog.test.ts")
    s = read(p)
    s = replace_once(s, f"expect(latest.id).toBe('pass{a}');", f"expect(latest.id).toBe('pass{n}');", "changelog.test.ts id pin")
    s = replace_once(s, f"toBe('PASS {a} · RELEASE CANDIDATE')", f"toBe('PASS {n} · RELEASE CANDIDATE')", "changelog.test.ts label pin")
    write(p, s)
    # 8. remaining pass pins in tests
    for rel in ("src/project-map.test.ts", "src/build-identity-handshake.test.ts"):
        p = os.path.join(ROOT, rel)
        write(p, roll_numbers(read(p), n))
    p = os.path.join(ROOT, "src", "changelog.test.ts")
    s = read(p)
    if s.count(f"'Pass {a}'") != 2:
        raise SystemExit("changelog.test.ts: expected two 'Pass N-1' pins")
    write(p, s.replace(f"'Pass {a}'", f"'Pass {n}'").replace(f"pending Pass {a} candidate", f"pending Pass {n} candidate"))

    # 9. the tracked outside-ownership patch the plan test checks (applies forward or reverse)
    import subprocess
    d = subprocess.run(["git", "diff", "HEAD", "--", "src/bootstrap.ts", "src/release-channel.ts"],
                       cwd=ROOT, capture_output=True, text=True).stdout
    if f"+const stableFallback = releaseChannels.pass{a}Backup" not in d:
        raise SystemExit("outside-ownership patch: bootstrap diff missing the new backup key")
    write(os.path.join(ROOT, "docs", f"pass{n}-outside-ownership.patch"), d)
    # 10. changelog.test.ts: the previous pass's highlight pin on `latest` moves onto its own entry,
    #     and `latest` gets one pin from this pass's first highlight.
    p = os.path.join(ROOT, "src", "changelog.test.ts")
    s = read(p)
    nl = chr(92) + "n"
    marker = "    expect(latest.highlights.join('" + nl + "')).toContain("
    first = s.find(marker)
    if first < 0:
        raise SystemExit("changelog.test.ts: no latest.highlights pin to move")
    head_pin = args.highlight[0][:40].replace("'", chr(92) + "'")
    s = s.replace(marker, f"    expect(pass{a}Highlights).toContain(")
    s = s[:first] + (marker + f"'{head_pin}');" + chr(10)
                     + f"    const pass{a}Highlights = CHANGELOG.find((entry) => entry.id === 'pass{a}')?.highlights.join('" + nl + "') ?? '';" + chr(10)) + s[first:]
    write(p, s)

    print(f"rolled to PASS {n}: publish_pass{n}.py, its contract test, identity, channels, fallback key pass{a}Backup, topology/handshake/project-map/changelog tests, changelog entry, docs/pass{n}-outside-ownership.patch")


if __name__ == "__main__":
    main()
