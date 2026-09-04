# PASS 95 — skyline-ground-projected-env REPORT (HF-479 technique #4)

Branch: `contrib/dave-gaming-pc/claude/skyline-ground-projected-env`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273`
Lane: ground-projected environment backdrop for horizon arenas (nuketown2, skyline-terminal).

## What landed

Our own TSL node projecting the arena's admitted equirect sky onto a virtual
ground plane (per-arena radius/height uniforms), drawn by one `BackSide` sphere
behind the aerial-perspective composite. No new render target; exactly ONE new
pipeline (`pass64.ground-projected-env.tsl.v1`), registered in the migration
ledger so the cold-session exact-ScenePass precompile reaches it with no fence
change. Off switch: `groundProjectedEnv` registry toggle (atmosphere, live)
plus per-arena enable. Re-implemented in our likeness per HF-472 — upstream
`GroundedSkybox.js` was read, never vendored.

Files: `src/rendering/ground-projected-env.ts` (+`.test.ts`),
`src/rendering/tsl-migration-inventory.ts`, `src/rendering/pass64-tsl-scene.ts`,
`src/graphics-settings-registry.ts`, `src/pass65-settings.ts`,
`src/legacy-main.ts` (+2 lines: 37231 → 37233, ceiling 37396 holds),
`docs/threejs-knowledge/r185/ground-projected-env-ours.md`.

## Claim states

- VERIFIED — `npx tsc --noEmit` clean (empty output, exit 0).
- VERIFIED — brief gates + affected suites, one run:
  `Test Files 12 passed (12) / Tests 170 passed (170)`
  (ground-projected-env, arena-environment-ibl, environment-kit,
  graphics-profile-contract, cold-session-precompile-reach, pipeline-metrics,
  legacy-main-size-ratchet, graphics-settings-registry, pass64-tsl-scene,
  render-runtime, pass65-settings, pass65-settings-inventory).
- VERIFIED — dependent sweep: `Test Files 22 passed (22) / Tests 265 passed (265)`.
- VERIFIED — three 0.185.1 (`node -e` print); upstream source read from the
  installed `node_modules/three/examples/jsm/tsl/utils/GroundedSkybox.js`.
- VERIFIED — new-pipeline ledger: `pass64.ground-projected-env.tsl.v1`
  descriptor `5daccb811996f9c5ef5bb929d606022ae536ec9ee10ec52362cedba7ce0f072b`;
  all seven pre-existing descriptor hashes byte-identical (no drift).
- VERIFIED — control-set re-fingerprint (PASS 89 precedent, one new control on
  every rung): `performance 5c415dec, balanced 3954f3cc, high 6197b09d,
  max a259ea68`; audit doc rows updated.
- VERIFIED — bootstrap: `powercfg` reports High performance
  (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`); AKP pull-only `Sync complete`;
  adoption guard `PASS: OMP on dave-gaming-pc trust=trusted`.
- DESIGNED (needs a capture) — horizon read on nuketown2/skyline-terminal at
  the authored review cameras. No headed capture exists in this session: no
  browser/GPU work per lane rules (owner running ComfyUI). Request: exact-SHA
  WebGPU review-camera captures before publish.
- DESIGNED (needs a measurement) — frame cost. Budgeted at one draw + one
  equirect fetch on background pixels (<0.15 ms p95 by construction, no target,
  no MRT change); no representative-hardware probe in this session.
- OPEN — clean full-suite row. Four full runs on this tree: the first found
  only the renderer-feature-inventory gap (2 tests — fixed by design: feature
  entry + regenerated JSON/MD, second commit). The three runs since show
  6078–6080 passed with 1–3 failures confined to real-clock audio suites
  (`audio-music-rotation-runtime`, `sound-event-inventory`, once
  `player-profile-main-integration`), a varying set per run; all three files
  pass in isolation on this tree (`3 passed (3) / 124 passed (124)`). No test
  uses fake timers; per-test durations of 20–28 s under a 600-file parallel
  suite on a ComfyUI-loaded machine. Read: load flake, not a regression —
  but the clean-row proof still wants a quiet-machine (or owner CI) run.

## Fences kept

`src/legacy-main.ts` untouched except the two options-threading lines (no
ceiling move); every per-arena value a uniform (graph object pinned identical
across arena switches by test); PMREM ownership untouched (bind-after-admit);
aerial-perspective stage order untouched; no verifier weakened — the 7→8
pipeline counts and re-fingerprinted hashes are cutover entries with tripwire
notes, per the HF-418/PASS 89 precedents.

## Luna review TODOs

- TODO: run the named gates from a stable install after the concurrent `npm ci`
  in this worktree has exited: `npx tsc --noEmit` and the twelve-file Vitest
  gate plus `src/legacy-main-size-ratchet.test.ts` and
  `src/collider-visual-parity-gate.test.ts`; run
  `npx tsx scripts/qa/find-coplanar-pairs.ts` as well.
- TODO: capture the exact-SHA WebGPU review cameras and representative frame
  cost on the owner's approved hardware; this review intentionally ran no
  browser, build, or GPU work.
