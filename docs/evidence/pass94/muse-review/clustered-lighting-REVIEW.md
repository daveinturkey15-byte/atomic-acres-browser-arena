# Muse review — clustered lighting lane (HF-490)

Scope: `C:/Users/david/projects/aa-claude-clustered`, branch
`contrib/dave-gaming-pc/claude/clustered-lighting`.
Range `origin/contrib/dave-gaming-pc/claude/nuketown2-lighting..HEAD` =
2 commits (`0a948302` lane, `357998ef` evidence doc).
Full `src/` diff read (9 files, +489/−19), plus
`docs/evidence/pass94/clustered-lighting/REPORT.md` and
`docs/threejs-knowledge/r185/clustered-lighting-ours.md`.
No builds, browsers, or tests run; all claims below are source-level.
Reviewer did not write the lane.

## Claim-states (the five asked)

### (1) Native renderer path vs re-implementation — VERIFIED, not vendored

The lane installs three r185's public addon and writes no shader/cluster code
of its own.

- `src/rendering/clustered-lights.ts:2` imports
  `ClusteredLighting` from `three/addons/lighting/ClusteredLighting.js`;
  `src/rendering/clustered-lights.ts:242-249` constructs
  `new ClusteredLighting(48, 32, 24, 24)` — arena limit, tile px, Z slices,
  per-tile cap, in that order.
- `src/rendering/render-runtime.ts:1349-1352` assigns
  `renderer.lighting = createNuketown2ClusteredLighting()` strictly before
  `await renderer.init()` (comment at `:1347-1348` states the cold-topology
  reason). Installed `three@0.185.1` ships both
  `examples/jsm/lighting/ClusteredLighting.js` and
  `examples/jsm/tsl/lighting/ClusteredLightsNode.js` (confirmed on disk).
- `src/nuketown2-pipeline-budget.test.ts:24-30` pins the negative:
  lane source contains the addon import + `new ClusteredLighting(`,
  contains no `renderer.compute`, and `farcrysis.ts` contains no
  `clustered-lights`. `git diff` shows zero changes under
  `node_modules/` (not vendored because there is nothing to vendor).

### (2) Pipelines added; cold precompile reach; budget tests — VERIFIED with one gap (F3)

- Exactly one pipeline reserved:
  `src/rendering/clustered-lights.ts:27-28`
  (`pipelineCount: 1, pipelineBudgetCeiling: 54`), asserted in
  `src/nuketown2-pipeline-budget.test.ts:9-14` (value, `<=`, ceiling `54`).
  Fixed limits asserted at `:16-21` (catalog `<= 48`, per-tile `24`,
  tile `32`, slices `24`).
- Cold reach is by construction: rig lights are created once in
  `buildSky()` (`src/legacy-main.ts:3358`) and the manager is fixed before
  `init()`; the existing exact pass
  (`src/legacy-main.ts:29997`
  `await exactScenePass.precompileExactScenePass(scene)`) then compiles the
  scene that already contains them. Reach const
  `src/rendering/clustered-lights.ts:31-35` names the owner
  `pass64-exact-scene-pass`, `beforeCombat: true`.
- Gap: the test at `src/rendering/clustered-lights.test.ts:73-81` proves
  reach only by string order (`indexOf(assign) < indexOf(init)`) plus
  "legacy contains precompile". No test counts in-combat pipeline creations
  for this lane (contrast the weapon-presentation `251 → 0` probe cited in
  `src/weapon-presentation.ts:3962-3967` and the match-bound rehearsal guard
  in `src/arena-special-weapon-reach.test.ts:118-119`). See F3.

### (3) Per-light data as uniforms/buffers, zero per-frame allocation — VERIFIED

- Lane allocates once: `src/rendering/clustered-lights.ts:277-289`
  builds `lights[]` + frozen `bindings[]` (`{light, baseIntensity}`) at boot.
  Per update, `:292` does only
  `binding.light.intensity = binding.baseIntensity * fade` — no object/array
  allocation inside the loop. `OFF_RIG` (`:259-270`) is a frozen singleton
  with a no-op apply.
- Caller is double-gated so steady state never reaches the loop:
  `src/legacy-main.ts:4256-4290` returns early on unchanged
  resolve inputs (4 comparisons) and again on writes-equality; `:4311`
  `rig?.applyLighting(...)` runs only after both gates pass. The old
  "ONE place" doc comment was shortened (`:4255`) but the surviving sentence
  ("writes existing … data and never changes topology") is accurate: no
  create/destroy/parent/unparent on this path, and the test at
  `src/rendering/clustered-lights.test.ts:53-55` pins
  `binding.light.intensity = …` present, `light.visible =` absent,
  `light.castShadow = true` absent.
- GPU buffers belong to upstream: test `:56-57` pins the installed
  `ClusteredLightsNode.js` containing `new DataTexture(` and
  `Loop( this.maxLightsPerCluster`. `telemetry()` (`:299-304`, `:264-269`)
  freezes a fresh object per call, but it is only read from the
  `lightingConditionsTelemetry()` path (`src/legacy-main.ts:4337`), not the
  frame loop.

### (4) Catalog derived through pair() with palette colours — VERIFIED, fragile in two spots (F1, F2)

- Count is exact: 30 = 8 window (4 `NUKETOWN2_WINDOWS` × `pair()`) + 2 porch
  + 2 garage + 4 street (2 `NUKETOWN2_LAMP_POST_LAYOUT` × `pair()`)
  + 4 appliance (2 × `pair()`) + 10 vehicle (6 centerline `single()` +
  2 driveway pairs). Test pins `30` and the six-kind set at
  `src/rendering/clustered-lights.test.ts:17-32`, including the mirror
  assertion `x → −x, y → y, z → −z` per `pairId`.
- `pair()` at `src/rendering/clustered-lights.ts:67-80` is the same
  involution the arena builder uses. Anchors are read, not restated:
  windows (`:97-109`, `NUKETOWN2_WINDOWS:<id>` sources), porch/garage from
  `NUKETOWN2_HOUSE_LAYOUT[0]` + `NUKETOWN2_SECTION` (`:111-116`),
  lamps (`:137-147`), truck/coach/head-car/driveway (`:170-224`).
  Palette matches REPORT §Catalog verbatim:
  `0xffbd72` window, `0xffa44d` porch, `0x9bc7ff` garage, `0xff813d` street,
  `0x39e7ff`/`0xff267d` appliance, `0xfff0c2` vehicle.
- Centerline vehicle `single()` use is correct (a mirrored headlamp pair is
  two lamps on one bumper, not an arena involution); driveway pairs do use
  `pair()`. Fragilities: window `interiorZ` branch and `frontZ`/`backZ`
  indexing are positional (F1, F2).

### (5) Off switch + defended cost estimate — VERIFIED (switch) / CLAIMED, honestly labelled (cost)

- Switch: registry toggle `src/graphics-settings-registry.ts:288-291`
  (`kind: toggle, applyMode: pipeline-rebuild`,
  `runtimeConsumer: arena-lighting`); construction snapshot at
  `src/legacy-main.ts:1902`, pass-through at `:1949`,
  `createNuketown2LocalLights(scene, enabled)` at `:3358`,
  staging at `:28615` (`staged.push('clusteredLighting')`).
  Disabled returns the frozen `OFF_RIG`: 0 lights, no-op apply, and the
  test at `src/rendering/clustered-lights.test.ts:60-70` proves no
  `PointLight` is added and a pre-existing `AmbientLight` is untouched.
  Manager is never swapped live — install-or-not happens only in `create()`.
- Cost: REPORT §Budget and `clustered-lighting-ours.md:27-31` give
  80×45×24 = 86,400 cluster items at 2560×1440, ≤24 evaluations per
  populated-tile fragment, ~4.1M candidate checks, one bounded upload, one
  compute pipeline, no shadow maps for locals. Both docs label this a
  **source-level estimate, not FPS/ms**, with no GPU timing ("owner's GPU
  reserved for ComfyUI") and capture explicitly OPEN with a six-item
  must-show list (REPORT §What a night capture must show). The arithmetic
  checks out; the 4,147,200 figure is 86,400 × 48 (arena max), i.e. the
  cluster-build bound, while the fragment bound is 24/tile — the doc mixes
  the two multipliers in one sentence (F4, wording only).
- Note: all four presets default `clusteredLighting: true`, including
  `performance` (`src/graphics-settings-registry.ts:748,858,897,950`).
  Hashes were re-fingerprinted honestly
  (`src/graphics-profile-contract.test.ts:48-57` +
  `docs/GRAPHICS_PROFILES_2026-09-03.md:232-235`) — tripwire honoured, not
  weakened. But enabling the lane on the lowest tier without a measured
  cold-compile figure is an unargued default (F5).

## Findings (file:line, why, smallest fix)

- F1 — `src/rendering/clustered-lights.ts:98` (+`:112-113`).
  Why: `interiorZ` branches on `window.wallZ === NUKETOWN2_WINDOWS[0].wallZ`
  and `frontZ`/`backZ` read indexes `[0]`/`[3]`. True today (3× front, 1×
  back) but a future side/gable window silently lands on the wrong side of
  its wall. Smallest fix: derive per-window inset from a named lookup
  (e.g. `find` front/back constants or a `wall: 'front'|'back'` field) and
  replace `[0]`/`[3]` with `NUKETOWN2_WINDOWS.find(...)!`.
- F2 — `src/rendering/clustered-lights.ts:212-213`.
  Why: `drivewayCarX/Z` re-derive the garage centre with magic offsets
  (`+0.5`, `+4.6`, `+2.22`) that duplicate the arena's paired-civilian-car
  placement. Drift between the two tables puts headlamps inside bumpers.
  Smallest fix: import the arena's driveway-car anchor (as was done for
  `NUKETOWN2_HEAD_CAR` at `src/nuketown2-arena.ts:1626`) or extend
  `assertNuketown2ClusteredLightCatalog()` (`:308-318`) with a distance
  check against the built car bounds.
- F3 — `src/rendering/clustered-lights.test.ts:73-81`.
  Why: precompile reach is asserted by substring order, which passes even if
  the clustered compute pipeline compiles lazily in combat. The repo's own
  standard for this class of bug is a zero-in-combat counter (cf.
  weapon-presentation 251→0). Smallest fix: add one assertion that the rig
  exists before the `precompileExactScenePass` call site in the cold path
  (e.g. extend the existing source-order test to require
  `createNuketown2LocalLights(` above `precompileExactScenePass(scene)` in
  the boot sequence), or record the lane in the admission-fence test
  (`src/presentation-prewarm-contract.test.ts:676` still expects exactly 1
  precompile call — confirm it covers a scene with the 30 lights attached).
- F4 — `docs/evidence/pass94/clustered-lighting/REPORT.md:52-54`
  (mirrored in `docs/threejs-knowledge/r185/clustered-lighting-ours.md:29-30`).
  Why: "worst-case 4,147,200 candidate light checks" multiplies by 48 while
  the adjacent fragment bound is 24/tile; a reader cannot tell
  cluster-build work from per-fragment work. Smallest fix: one sentence —
  "86,400 × 48 cluster-build candidate slots; per-fragment loop bounded at
  24" — no code change.
- F5 — `src/graphics-settings-registry.ts:748`.
  Why: `performance` enables the lane with no measured cold-compile figure
  on record (REPORT marks timing OPEN). Every other costly control argues
  its tier; this one does not. Smallest fix: either keep `true` with a
  one-line rationale citing the fixed bound + precompile reach, or flip
  performance to `false` until the night capture + timing land, and
  re-fingerprint. Non-blocking either way — just argue it.

Non-findings (checked, no action): lamp-post meshes are
`presentationOnly, solid false, cast false`
(`src/nuketown2-arena.ts:1843-1850`) — no collision/authority change;
`farcrysis.ts` untouched (pinned by test); `NUKETOWN2_HEAD_CAR` dedup is
behaviour-preserving (`4.5, -0.8` → shared const); `assert…Catalog()`
bounds-checks street lights against `NUKETOWN2_BOUNDS`.

## Verdict: SHIP-WITH-FIXES

1. The risky decisions are the right ones and honestly labelled: native
   addon before `init()`, intensity-only dusk fade (never `visible`/shadow
   toggles — the exact pattern that once cost 251 in-combat pipelines),
   cold-only manager choice behind a `pipeline-rebuild` switch, cost given
   as bounded shader arithmetic with capture/timing marked OPEN, not
   claimed.
2. The five asked claims hold at source level (three VERIFIED, one
   VERIFIED-with-gap, cost CLAIMED-by-design), with unit + budget tests
   pinning catalog (30), mirror involution, monotone fade, unshadowed
   lights, off-switch emptiness, one-pipeline budget, and the install
   order.
3. Remaining work is small, words-and-assertions only: F1/F2 de-magic two
   anchor derivations, F3 harden the reach assertion toward the repo's
   zero-in-combat standard, F4 disambiguate the two multipliers, F5 argue
   the performance-tier default. None changes the topology; visual night
   capture + GPU timing stay OPEN by lane design (browsers/GPU prohibited)
   and must gate any perf claim, not this merge.
