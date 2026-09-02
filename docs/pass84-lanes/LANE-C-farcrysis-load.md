# Lane C — Farcrysis load failure, load path only (pass 84)

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`.

Worktree: `C:\Users\david\projects\aa-farcrysis-load`
Branch: `contrib/dave-gaming-pc/claude/farcrysis-load-fix` (base e046c130 =
live PASS 83 head; the pass84 line ac0bc5f2 is 5 small commits ahead and
merges cleanly later — do not rebase yourself).

## Owner intent (2026-09-02 07:05 BST)
"ensure that in parallel we have someone working on and fixing/integrating
the Farcrysis map" and "farcrysis ... last updates may have been on older
passes or branches etc, so ensure they are cleanly merged and we don't
accidentally regress nice features".

## The defect (investigated before, not fixed)
Farcrysis (`src/rendering/arenas/farcrysis.ts`, `selectable: false` in
`src/map-selection.ts`, hidden by the publish guard) takes ~279 s to cold
load and then the tab dies. Cold-admission cost measures 7-50x every other
arena against the fixed 12 s fence (`flushWebGpuFrames(12_000)`, three call
sites in the arena transition in `src/legacy-main.ts`). The arena stays
HIDDEN until it loads fast. Your job is the LOAD PATH ONLY, not art.

Known history to respect:
- A NaN crash on farcrysis was root-caused earlier to a bad index buffer
  (palm crown index off-by-three -> `toNonIndexed` NaN); an index-bounds
  test exists. Do not reintroduce it.
- Farcrysis water is the ocean system (`src/water/*`); crest foam and slope
  roughness are numerically unreachable by authored constants — not your
  problem, do not touch the water constants.
- The eight-arena boot smoke (`tests/e2e/pass74-arena-boot-smoke.spec.ts`)
  passed all 8 on 2026-08-31 with a long timeout; that is not "fast".
- Repo contract: no ShaderMaterial, no RawShaderMaterial, no
  onBeforeCompile — `three/webgpu` NodeMaterial + TSL only. Everything
  procedural stays procedural.

## Job, in order
1. `npm run build` (one build at a time on this machine). Serve `dist` on
   port 41943 (pattern: `scripts/qa/run-with-preview-server.mjs`).
2. BEFORE: write a timed boot probe modelled on
   `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` — headless real Chrome
   (`channel: 'chrome'`, policy flags from
   `scripts/qa/lib/browser-launch-flags.mjs`), boot the farcrysis route the
   way the game would if it were selectable (find how the boot smoke selects
   a hidden arena; use the same mechanism, not a new backdoor), and sample:
   elapsed time to match admission, pipeline and shader-module creation
   counts, unique material count, geometry build time on the main thread
   (long tasks), heap. Save to `artifacts/qa/farcrysis-load/before.json`.
   Use a 400 s timeout; do not let it hang the machine.
3. ATTRIBUTE. Candidates: unbounded unique materials/permutations in the
   farcrysis visual module; huge synchronous geometry builds (terrain,
   vegetation, palms) on the critical path; asset decode; the vegetation
   density (farcrysis is known to have poor, dense-but-cheap-looking
   vegetation). Name the dominant cost in numbers before changing anything.
4. FIX by compiling and building LESS: share materials, collapse pipeline
   states, instance repeated props, defer or stream non-critical props
   behind admission, move geometry builds off the critical path. Never by
   weakening the fence, never by changing other arenas.
5. AFTER: identical probe. Target: admission inside the existing 12 s fence
   on this machine, zero in-combat pipeline creations after admission
   (`probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`).
6. Keep `selectable: false`. Note in the report what would still be needed
   before unhiding (art quality, collision, spawns) — do not do that work.
7. `npx tsc --noEmit`; focused vitest for files you touched (never the full
   suite). Commit to your branch with explicit paths, one commit per item.

## Boundaries (hard)
- You may edit `src/rendering/arenas/farcrysis*` and, if strictly needed,
  MINIMAL clearly-commented changes in `src/legacy-main.ts` ONLY inside the
  farcrysis / arena-load region, each marked `// FARCRYSIS-LOAD:`. Other
  lanes own other regions of that file; keep the diff tight and disjoint.
  `legacy-main.ts` is LF — preserve it.
- Do not touch weapon, viewmodel, thermal, lobby, netcode, water constants,
  spawn layouts, `baselines/`, or any other arena.

## Machine rules
Headless only, `--mute-audio`, never a visible window. One browser at a
time, one build at a time. Never kill a process you did not start.
`nvidia-smi` before GPU-heavy runs.

## Report (final message = raw data for the orchestrator)
BEFORE/AFTER admission timings, pipeline/shader/material counts, the named
root cause, changed files with one-line reasons, commit hashes, what is
still needed before unhiding, what you could not verify. Claim-state every
line: VERIFIED / CLAIMED / OPEN.
