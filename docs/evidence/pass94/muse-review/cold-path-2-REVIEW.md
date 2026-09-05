# Cold-path-2 review (Muse Spark 1.3, skeptical)

Scope: `contrib/dave-gaming-pc/claude/cold-path-2` HEAD `30f92d2a`
vs `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Read: `AGENTS.md`, `docs/evidence/pass95/cold-path-2/REPORT.md`, full diff
(`--stat`: 18 files; only runtime source deltas are `src/legacy-main.ts`,
`src/rendering/pass64-tsl-scene.ts`, plus the two lane reapplications and
their tests). No builds, no browsers, no GPU; source-only review.

## (1) Water placeholder: empty BufferGeometry -> PlaneGeometry

`src/rendering/pass64-tsl-scene.ts:910`:
`new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new MeshStandardNodeMaterial())`,
`placeholder.visible = false` (`:912`), water pipeline tag retained (`:913`).

- Rendered ever? No live draw: `visible = false` keeps it out of every draw,
  and the comment (`:904-:909`) states this. But it IS still compiled: the
  report's attribution (bare `BufferGeometry` has no `position`, r185
  `AttributeNode` fails the material build during exact ScenePass compilation)
  is consistent with the cold path calling `precompileExactScenePass` over the
  admitted root / whole scene, which traverses invisible nodes. The fix targets
  compilation, not rasterization. Correct layer.
- Vertex contract complete? Yes. `PlaneGeometry` sets all three standard
  attributes (three r185 `node_modules/three/src/geometries/PlaneGeometry.js:102-104`):
  `setAttribute('position', ...)`, `setAttribute('normal', ...)`,
  `setAttribute('uv', ...)`. A `MeshStandardNodeMaterial` PBR graph reads
  `position` (required — the reported `AttributeNode` failure), `normal`, and
  `uv` (when any map is bound; unbound today, supplied anyway). A 1x1 quad
  therefore satisfies every TSL node on that material regardless of future map
  additions. No lane geometry was patched to hide it — candidate-side fix, as
  claimed.
- Test `src/rendering/pass64-tsl-scene.test.ts:479-480` asserts `position`
  defined and `count > 0`. Tightening, not loosening.

FINDING 1 (minor, hardening): test pins `position` only, but the claim is a
full vertex contract. Smallest fix: also assert `normal` and `uv`:
`expect(placeholder.geometry.getAttribute('normal')!.count).toBeGreaterThan(0)`
and the same for `'uv'`. One-line-each addition in the same `it` block.

## (2) Static batching hoisted before the first warm frame

Net diff `src/legacy-main.ts`: one line added at `:30040`
(`profileArenaTransition('presentation-batching'); if (selectedArena.id !== 'gun-range') batchSelectedArenaPresentation();`),
two lines removed at old `:30167-:` (`profile...`, `setBootstrapStage(...)`);
the late idempotent `batchSelectedArenaPresentation()` (`:30171`) plus
`freezeStaticArenaMatrices` (`:30172`) remain.

- Dynamic safety: `batchStaticMeshes` (`src/art-kit.ts:118-132`) skips any mesh
  with a `userData.dynamic === true` self-or-ancestor, plus invisible,
  `targetRoot`, collision-visual-owner, material-array, and InstancedMesh
  (`:133-139`). Breakable panes get `dynamic = true` at authoring
  (`src/additional-maps.ts:149-151`; also `:1974-1975`, `:2038-2039`,
  `:3388-3389`). Nuketown2 glass routes through the same `box()` helper, so its
  `breakableWindowId` panes (`src/nuketown2-arena.ts:1470-1472,1551-1552`)
  inherit the flag. Interactive-world runtime root is `dynamic = true`
  (`src/interactive-world-runtime.ts:502`) and is never passed to the batcher
  (batcher takes `arena.root`, `arenaArtRoot`, `neighbourhoodLifeRoot` only).
  Nuketown2 doors are holes, not leaves (`NUKETOWN2_DOORWAYS`,
  `src/nuketown2-arena.ts:766-779`; garage leaf parked in head `:2291` is
  static dressing); vehicles are static cover (no dynamic flag anywhere on the
  nuketown2 street/garage/driveway cars — correct, they never move). Gun Range
  keeps its post-rack boundary via the `!== 'gun-range'` guard. Nothing
  dynamic is frozen into a static batch by this hoist. `freezeStaticArenaMatrices`
  still runs once, late (`:30172`), after quality presentation — early-batched
  meshes are merged early but frozen late, so no premature matrix freeze.
- Measured effect per report (receipts, unverified here): fenced draws 713 -> 190,
  transition 27.4 s -> 23.7 s, still red on the unchanged 12 s fence. Direction
  right, magnitude insufficient. Plausible: batching removes draw fan-out from
  the first submission but `visual-definition` (15.6 s) is TSL graph/compile
  cost, not draw count.

FINDING 2 (real, observability): the hoist orphaned the
`batching-static-meshes` bootstrap stage. Before: late call did
`profileArenaTransition('presentation-batching')` + `setBootstrapStage(...)`.
After: early call at `:30040` profiles but never sets the stage; late call at
`:30171` batches with neither profile nor stage. `deployment-loading-progress.ts:63`
still advertises `'batching-static-meshes'` (95%). So the stage is never set,
and for `gun-range` the `presentation-batching` phase is profiled while
skipped (empty timing). Smallest fix: `setBootstrapStage('batching-static-meshes')`
on the early path (before the `if`), i.e.
`profileArenaTransition('presentation-batching'); setBootstrapStage('batching-static-meshes'); if (...) batch...`.
Optionally skip profiling when skipping the batch; not load-bearing either way.

## (3) Async cold precompile vs the in-combat tripwire

Final state `src/rendering/cold-session-precompile-reach.ts:87`:
`['farcrysis']` — the interim `4522c877` (`+ 'nuketown2'`) was reverted by
`7ae131c9`. Test `cold-session-precompile-reach.test.ts:20-21` pins
`farcrysis -> true`, `nuketown2 -> false`, plus whole-table exclusion. Net diff
vs pass93 base on both files: zero. The `d3585665`/`79a0e6b0` material-mode
excursion likewise nets to zero (`batchSelectedArenaPresentation()` takes no
mode argument; `staticMaterialMode` used throughout).

Tripwire comparison (`src/presentation-prewarm-contract.test.ts:658-694`):
in-session switches (`hadPreparedArena`) get unconditional whole-scene
`precompileExactScenePass(scene)`; cold sessions get it only via
`arenaNeedsColdSessionPrecompile(selectedArena)` with zero `id ===` branches
in the region, exactly 2 `precompileExactScenePass(` call sites (scene vs
`arena.root`), precompile strictly before `requestStaticShadowRefresh(true)` /
`submitForegroundWebGpuFrame(true)` / `flushWebGpuFrames(12_000)`, fence pinned
at exactly `12_000`. Final tree satisfies all of it: `:30137-30149` keeps the
guard, the cold root stays `arena.root`, ordering and fence literal unchanged.
The content authority (`farcrysis`-only) matches its own test, and the module
doc (`:71-76`, candidate-6 remeasurement) argues nuketown2's coverage compile
behind the loading surface already owns the vocabulary, so retaining the
off-fence copy would compile the same arena twice. No precompile coverage was
widened or narrowed relative to the pass93 base; the exploration happened and
was cleanly backed out. Whether the candidate-6 "no double pay" argument holds
on hardware is measurement, not source — the smoke staying red (below) is
consistent with either "coverage suffices but workload too big" or "relief
still needed"; nothing in the diff resolves that, and nothing in the diff
claims to.

No finding on coverage. Observation: the report is honest that the fence loss
signature that admitted nuketown2 in candidate 4b (568 fenced draws,
submission-1 `>12000 ms`) has not been re-proven absent on a cold boot without
the relief — the evidence cited is the coverage-compile identity argument plus
a still-red smoke. An integrator cherry-picking should know the revert rests on
that argument, not on a new green cold receipt.

## (4) Tests, fences, budgets, timeouts loosened?

None found in the net diff:

- `flushWebGpuFrames(12_000)` intact; `MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS = 4_000`,
  `assertWebGpuAdmissionCompletionLatency`, 3-sample loop, retirement-dispose
  guard all still pinned by the contract test (which itself is unmodified).
- 10 s cold-transition budget and 12 s queue fence: report states preserved;
  no source change widens either. Smoke still fails against them (red kept red).
- `legacy-main-size-ratchet`: net diff is +1/-2 lines (one added, two removed);
  file shrinks. Ceiling untouched (report: 37,395 < 37,396, 5 tests pass).
- TSL scene test: +2 assertions (tightened). Fidelity/interiors tests: added
  bodies and probes for the lanes; `6762076e` removes one unused import and
  restores a comment block — no threshold touched. Coplanar gate per report:
  HOUSE-INTERIOR/STREET/SAME-MATERIAL 0, pairs<=0.03 m 288 pre-existing,
  `find-coplanar-pairs` green.
- Interim loosenings (`4522c877` list widening, `d3585665` palette-lit shortcut,
  `f7796fa5`/`bd7fabe2` menu IBL prewarm add/remove) all net to zero in the
  final tree; `f7ce7dff` additionally deletes the whole `prepareMenuArenaEnvironment`
  path vs the interim, leaving `bootstrapMenuPreview` background-only. Final
  `bootstrapMenuPreview` vs pass93 base: extremely small behavioral delta
  (menu reports ready immediately, deployment assets in background) — no gate,
  fence, or budget moved by it.

No finding; this is the cleanest part of the branch.

## (5) Separability of the two reproduction commits

- `dd0cb7af` (accuracy-3): `nuketown2-fidelity.test.ts`, `nuketown2-layout.ts`,
  plus accuracy-3 evidence/reference docs. No touch of `nuketown2-arena.ts`.
- `8a70a3b6` (interiors): `nuketown2-arena.ts`, `nuketown2-interiors.test.ts`,
  plus interiors evidence docs. No touch of `nuketown2-layout.ts` or the
  fidelity test.
- File sets are disjoint. Cherry-pickable independently with one caveat:
  `6762076e` ("repair accuracy lane fidelity test merge") edits
  `nuketown2-fidelity.test.ts` on top of `dd0cb7af` (drops the unused
  `NUKETOWN2_STREET_CARS` import, restores the vehicles comment block). It
  belongs to the accuracy-3 lane: integrator takes `dd0cb7af + 6762076e` as a
  unit, `8a70a3b6` standalone.

## Verdict: DO-NOT-SHIP (as a green Pass 95 fix; safe to hold as a reproduction branch)

Three reasons:

1. Cold admission still red on the preserved fence: 23,651.4 ms transition,
   `visual-definition` 15,619.8 ms, `WebGPU queue completion exceeded 12000 ms`.
   The branch reduces draws (713 -> 190) without moving the workload that fails.
2. Still over the preserved 10 s cold-transition budget with no new green
   receipt: no stock-boot run after the smoke failures (report OPEN, two-hour
   hard stop, single browser chain) and no preflight green (branch-name/slug
   contract block noted in the report). Integration as a fix needs at least one
   green cold receipt, not a smaller red.
3. One real (minor) regression ships in the hoist: the orphaned
   `batching-static-meshes` bootstrap stage (Finding 2). Trivial to fix, but it
   is a live observability regression in the deployment surface and should not
   enter a candidate unfixed.

## UNFINISHED

- Green cold-admission receipt on real-hardware WebGPU for nuketown2 (cold
  session, `PASS73_NATIVE_WEBGPU=1`, candidate smoke): still red; the remaining
  work is the `visual-definition` / `coverage-submit-fence` GPU submission cost
  per the report.
- `PASS73_NATIVE_WEBGPU=1 npm run qa:stock-boot` after the final tree: not run
  (time-box + single browser chain). No stock-boot coverage claimed.
- `pipeline:preflight --machine dave-gaming-pc --harness codex` (lowercase):
  blocked by branch-name contract; needs integrator/owner decision, not a
  quieter flag.
- Finding 1 (assert `normal`+`uv` on the placeholder) and Finding 2 (restore
  `setBootstrapStage('batching-static-meshes')` on the early path).
- Original `AttributeNode` browser error stack never captured in a receipt
  (report OPEN): attribution is source-verified + regression-tested, but the
  fatal-first stack remains unrecorded.
- Candidate-6 "coverage owns it, precompile would double-pay" argument for
  dropping nuketown2 from the cold list has no new green cold receipt behind
  it; a future cold fence loss on nuketown2 reopens `7ae131c9`.
