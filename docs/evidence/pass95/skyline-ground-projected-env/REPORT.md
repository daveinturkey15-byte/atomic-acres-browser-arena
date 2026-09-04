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
- OPEN — full unit suite was still running at report time; see handoff for the
  row. Brief gates and all dependent suites above are green.

## Fences kept

`src/legacy-main.ts` untouched except the two options-threading lines (no
ceiling move); every per-arena value a uniform (graph object pinned identical
across arena switches by test); PMREM ownership untouched (bind-after-admit);
aerial-perspective stage order untouched; no verifier weakened — the 7→8
pipeline counts and re-fingerprinted hashes are cutover entries with tripwire
notes, per the HF-418/PASS 89 precedents.
