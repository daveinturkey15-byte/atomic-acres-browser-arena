# HF-399 Lane A — tracked evidence

Everything Lane A measured lives under `artifacts/`, which **this repo
gitignores** (`.gitignore:16`). A skeptic pass on 2026-09-02 flagged that as a
silent single point of failure: 142 measurement files and the ready patch for
Lane B existed only as untracked files in one worktree
(`C:/Users/david/projects/aa-claude-hf399`), so a `git clean`, a worktree
removal, or a review performed anywhere else would have lost them without a
trace. This directory is the durable copy of the load-bearing subset.

Claim-state: every file here is a byte copy of an artifact this lane produced
(VERIFIED). The prose below is the index, not new evidence.

## The patch Lane B needs

`lane-b-weapon-presentation-perf.patch` — 33 insertions / 11 deletions against
`src/weapon-presentation.ts`, which Lane A does **not** own. It removes
redundant matrix walks only: no clip semantics and no pose maths change. See
the Lane A report's `outsideOwnershipPatches` for the full description and for
the gates Lane B must run before landing it (Lane A did not run them).

Applies clean to `contrib/dave-gaming-pc/claude/hf399-fps-regression`
(`git apply --check` passes) and `npx tsc --noEmit` exits 0 with it applied
(both VERIFIED 2026-09-02, patch reverted afterwards).

## Measurements

All from headless real Chrome (`channel:'chrome'`), WebGPU, 2560x1440,
uncapped (`--disable-frame-rate-limit --disable-gpu-vsync`), Quality selected
through the real `#graphics-profile` select + save, bots frozen.

| File | What it is |
|---|---|
| `ab-round4.log` | The interleaved B,A,A,B A/B round the headline delta comes from |
| `r4a-before-atomic-acres.json`, `r4b-before-atomic-acres.json` | Base `ac0bc5f2` dist, rounds a and b |
| `r4a-lane-a-atomic-acres.json`, `r4b-lane-a-atomic-acres.json` | Lane A dist rebuilt from `db101988`, rounds a and b |
| `before-local-atomic-acres.json` | Base build, atomic-acres, all five phases |
| `before-local-test1.json` | Base build, control arena test1 — the cross-arena comparison |
| `before-local-atomic-acres-anatomy-lawn-idle.json` | Frame anatomy + call census + CPU profile summary. **Read `cpu.frameMsP50` (42.2 ms) against the unprofiled p50 (26.1 ms) before quoting any ms figure from the profile.** |
| `before-local-test1-anatomy-lawn-idle.json` | Same, control arena |
| `pass72-atomic-acres.json`, `pass81-atomic-acres.json`, `pass83-atomic-acres.json` | Live gh-pages channels on the same route — the bisect |
| `tripwire-hf399-before-base.json`, `tripwire-hf399-after-lane-a-rebuilt.json` | Paired in-combat pipeline-compile tripwire, 75 s combat window |

The `.cpuprofile` files, the 120 phase screenshots and the earlier rounds
(ab2/ab3, whose dist provenance could not be confirmed and which are therefore
not headline evidence) stay in `artifacts/qa/hf399/` in that worktree only.

## Reading the profiles

`node scripts/qa/hf399-cpuprofile-inclusive.mjs <file>.cpuprofile --frames N --frame-ms <unprofiled p50>`

Without `--frame-ms` the tool prints profiled-frame ms, which on this machine
runs about 1.87x a real frame. Only the inclusive **share** is comparable
across runs.

---

## Correction round, 2026-09-02 13:00-14:20 BST (repair pass)

The skeptic pass accepted the code and rejected three claims in the report. The
repair pass re-measured, and the headline changed. Everything below is
VERIFIED unless marked otherwise.

### The fps A/B instrument is only trustworthy on a quiet machine

Four independent interleaved sandwiches, same two dists, same probe, same
route, run over 80 minutes as other lanes came and went:

| round | order | machine (chrome procs) | mean delta |
|---|---|---|---|
| r4 (db101988 dist) | B A A B | ~50 | **+5.28 fps** |
| r5 | B A A B | 58, CPU 100% | **-6.80 fps** |
| r6 | A B B A | ~55 | **-0.17 fps** |
| r8 | B A A B | ~50 | **-1.75 fps** |
| r10 | B A A B | **19-20** | **+3.29 fps** |

Within one build and one phase, six runs of the SAME `dist-hf399-before`
spanned 54.7-70.9 fps on deployed-idle and 60.3-75.6 on near-wall. A 16 fps
spread on an unchanged binary is larger than the effect being measured, which
is why r5/r6/r8 disagree with each other as well as with r4.

**r10, the only round measured on a quiet machine, is the number to quote:**
base `ac0bc5f2` 74.45 fps -> HEAD 77.74 fps, **+3.29 (+4.4%)**, p50 12.93 ->
12.45 ms (-0.48 ms/frame), all five phases positive, 95% CI +1.2 to +5.4 fps
(paired by phase, n=5). Files: `r10a/r10b-{before,head}-atomic-acres.json`.

The earlier "+5.28 fps / +10.1% / p50 -1.89 ms" is withdrawn.

### The load-independent evidence (this is the strong part)

The frame-anatomy probe's call census counts calls, not time, so machine load
cannot move it. Paired back-to-back runs, identical scenes:

| arena | metric | base | HEAD |
|---|---|---|---|
| atomic-acres | getObjectByProperty / frame | 9,293.6 | **1,567.7** |
| atomic-acres | distinct callers of it | 5 | **1** |
| test1 (control) | getObjectByProperty / frame | 3,588.7 | **1,704.9** |
| test1 (control) | distinct callers of it | 4 | **1** |

Files: `r7-{before,repair}-atomic-acres-anatomy-lawn-idle.json`,
`r11-{before,head}-test1-anatomy-lawn-idle.json`. Scene sizes match across each
pair (10,280 vs 10,280 nodes; 9,299 vs 9,304). The four dressing-root lookups
are gone on BOTH arenas; the single survivor is the weapon-presentation socket
lookup, which belongs to Lane B.

### The repair commits are not a regression

`dist-hf399-db101988` (rebuilt from db101988, the commit round 4 measured)
against HEAD's dist, interleaved: **+3.04 fps in HEAD's favour** (r9). The
rebuild reproduced the exact chunk name `legacy-main-ClNUkZo6.js` the round-4
dist carried, which independently confirms both the round-4 provenance and this
rebuild.

Bundle fingerprint chain (grep counts in the emitted `legacy-main-*.js`):

| dist | DOMPoint | getTransform |
|---|---|---|
| `dist-hf399-before` (ac0bc5f2) | 2 | 2 |
| `dist-hf399-db101988` | 1 | 1 |
| `dist` (HEAD) | **0** | **0** |

36 of 39 emitted chunks are byte-identical between `dist-hf399-before` and the
HEAD `dist`, so the mid-session npm repair did not change the toolchain.

### Control arena, fps

`r10a/r10b-{before,head}-test1.json` are INCONCLUSIVE and are kept only so the
attempt is on the record: test1's own triangle count varied 82,461-107,090
between runs of the same build, a 28% content difference that swamps a
sub-millisecond CPU saving. The deterministic census above is the cross-arena
evidence instead.
