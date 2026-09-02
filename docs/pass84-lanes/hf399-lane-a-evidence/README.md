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
