# Pass 95 forward-port review: fp-taa-resolve (Muse Spark skeptic)

Branch: `contrib/dave-gaming-pc/claude/fp-taa-resolve` @ `f1eabb57`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`
Range: `pass93-candidate...HEAD` (68 files, +3010/−111; src runtime+tests a small subset, rest evidence PNG/JSON)
Lane report: `docs/evidence/pass95/fp-taa-resolve/REPORT.md`
TAA source: `origin/contrib/dave-gaming-pc/claude/taa-resolve:docs/evidence/pass96/taa-resolve/REPORT.md` (Pass 2 ACCEPTED for QUALITY/MAX opt-in)
Prior review: `docs/evidence/pass94/muse-review/taa-resolve-REVIEW.md` (SHIP-WITH-FIXES, F1/F2 carried below)
Claim-states: VERIFIED (saw it in diff/source), CLAIMED (lane says so), OPEN (needs runtime receipt).

No src/ modified by this review. No builds, browsers, GPU, npm install, or test suites run per brief. No fingerprint command re-run (pure/fast but build-adjacent); check (1) done by generator-diff + source-symbol inspection instead.

## (1) Fingerprint/inventory regeneration — VERIFIED, no hand edits

- Generator script untouched: `git diff pass93-candidate...HEAD -- scripts/qa/generate-pass65-renderer-feature-inventory.ts` is empty. Mechanical-regen claim is structurally supported.
- Generated deltas are exactly what the source deltas justify, nothing more:
  - New `graphics.taaResolve` control row + `taa-resolve` feature row (JSON + MD), totals 37→38 / active 35→36 / adjustable 28→29, SHA `85a6de44…` → `ba4b8be8…` as claimed.
  - Four probe-symbol renames match live source verbatim: `ssr(sceneColor, …)` (`src/rendering/screen-space-post.ts:449`), `ssgi(sceneColor, …)` (`:405`), `motionBlur(sceneColor, …)` (`:377`), `bloom(screenSpace.sceneColor, …)` (`src/rendering/pass64-tsl-scene.ts:1062`). All four are the TAA `sceneColor`-local refactor, not hand-tuned evidence strings.
  - Profile pins `performance=72ad4b3c balanced=ee7d10b6 high=308b6810 max=467af549` agree across all three authorities: `src/ui/graphics-profile-descriptions.ts:196` (`graphicsControlSetHashes()` computes from live `GRAPHICS_PRESET_VALUES`), `src/graphics-profile-contract.test.ts:48-54`, `docs/GRAPHICS_PROFILES_2026-09-03.md:243-252` (with forward-port re-measurement note). Source of truth is the computed function; test+doc are synchronized copies.
- No other inventory row, budget, or threshold moved in the generated files.

## (2) Renderer-capability expectations — VERIFIED, exactly TAA-justified

- `src/pass65-settings.ts:408` renames to `requestedAntialiasSamples`; `:437` is the single gating line: `screenSpace.taaResolve.enabled ? 0 : requestedAntialiasSamples`. Saved selector intact; `forceCompatibility` still returns 0 (`:447`).
- Enablement is preset-scoped: `taaResolve: false/false/true/true` for performance/balanced/high/max (`src/graphics-settings-registry.ts`, preset values), resolved via `selection.taaResolve === true` (`src/rendering/screen-space-post-profile.ts:579-582`). BALANCED/PERFORMANCE runtimes cannot hit the zero branch; custom sets with `taaResolve: true` also zero — correct, TAA owns the principal resolve there too.
- `src/pass65-settings.test.ts:32-35` (high expects `antialiasSamples: 0`) and `src/pass65-raytraced-capability.test.ts:91-93` (trace-gated high/max expect `0`) both use high/max settings where TAA stays enabled while only the trace capability is gated — expecting 0 is the correct projection, not a loosened assertion. Comment lines state the reason.
- `src/rendering/render-runtime-device-features.test.ts:64-85` mock change (`vi.doMock` → `async (importOriginal)` + spread) preserves real `three/webgpu` exports so TAA's `QuadMesh` import survives the boundary mock. Narrowly scoped, commented, no feature assertion removed.
- Nothing else moved: ambientOcclusion/rayTracing/anisotropy rows untouched; device-feature assertions retain their feature checks.

## (3) Prewarm/precompile reach vs in-combat tripwire — VERIFIED, coverage superset

- `src/legacy-main.ts:30140,30146,30220` call sites are byte-identical to `pass93-candidate` (single-arg). The TAA lane's two-arg calls (`precompileExactScenePass(scene, arena.root)`, `(scene, presentationRoot)`) were collapsed by commit `aae13e83` back to the candidate's single-arg form — but the callee signature retains the optional parameter (`src/rendering/pass64-tsl-scene.ts:214,1435`: `precompileExactScenePass(root, velocityRoot?)`, `velocityRoot ?? precompileRoot`).
- Resulting candidate sets: in-session switch `precompileExactScenePass(scene)` → `[scene, root]`; cold `precompileExactScenePass(arena.root)` → `[arena.root, root]`; third site `(scene)` → `[scene, root]` — where `root` is the Pass 64 atmosphere/presentation group. Each is a superset-or-equal of the TAA lane's explicit velocity roots (`scene` contains `presentationRoot`; cold `[arena.root, root]` is identical). The candidate's cold-session scoping (compile only `arena.root`, not unrelated menu/support roots) and 12 s fence authority are retained, not weakened.
- TAA pipelines traced into the precompile, not around it: `hdr.precompile(renderer, scene)` compiles the unattached resolve quad both ping-pong directions (`src/rendering/taa-resolve.ts` precompile path), then `precompileTaaVelocityMrtCandidates` compiles every census-derived geometry/material identity from the submitted roots + atmosphere root when `taaResolve.enabled` (`pass64-tsl-scene.ts:1453-1469`), with census published as `taaPrecompileReach`. Enumeration includes hidden objects and non-selected LOD levels with `visible`/`frustumCulled` restore in `finally` (`src/rendering/cold-session-precompile-reach.ts`), pinned by the two new unit tests. No precompile assertion or fence was deleted.
- Note (not a finding): `velocityRoot?` is now unexercised by all three callers — dead-but-harmless lane compat. Smallest fix if it offends: leave it; removing it churns the TAA-lane signature for zero coverage gain.

## (4) Frame-cost claim (−5.2 ms QUALITY) — OPEN, prescription below

- The number is TAA-lane evidence, not forward-port evidence: lane Pass 2 measured QUALITY 2560×1440 `move` p50 16.2 ms on vs 21.4 ms off (delta −5.2, falsifier +1.0 ms) with 0/0 in-combat creations (523 total admitted). This branch re-applies that tree (`ab60409d`) onto candidate 7 without re-running any browser capture; the forward-port REPORT honestly marks frame time and pipeline count OPEN (no-browser rule). Do not quote −5.2 ms as a property of this branch.
- Required integrator measurement before candidate 9 release (not before entering candidate 9 as opt-in):
  1. `scripts/qa/hf399-fps-phase-probe-cdp.mjs --profile high --taa off` vs `--taa on`, 2560×1440, nuketown2 scripted route, same warmup/windows as lane (3 s warmup, `deployed-idle` + `move` phases). Report p50 AND p95 per phase with deltas vs the unchanged +1.0 ms moving-p50 falsifier; fail on any in-combat `renderPipelines` creation (both phases must be 0, label lists empty). The probe already emits `pipelineRecords`/`pipelineLabels` and `runtimeReceipt.taaPrecompileReach` — attach them.
  2. `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` combat-window run; attach `admissionPipelineCensus` and confirm every TAA-on pipeline is in the admission set.
  3. Confirm `taaPrecompileReach.velocityMrtMaterialVariants` count (≈85 in lane; re-derive, do not pin to 85) is census-complete for the candidate tree.
- Carried p95 warning (flag, not failure): lane TAA-on p95 regressed `move` 31.3 vs 29.0 (+2.3) and `idle` 32.1 vs 28.4 (+3.7) while p50 improved. The falsifier gates p50 only. Next measurement must print the p95/p99 line and either bound it or explicitly scope it out — same condition as the prior review.

## (5) Tests loosened / timeouts widened — VERIFIED, ratchet holds

- Test diffs only add or re-pin to the new contract: `pass64-tsl-scene.test.ts` 7→8 pipelines + TAA SHA `85040fce…`; `screen-space-post.test.ts` linear stages gain `taa-temporal-resolve`; `screen-space-topology-contract.test.ts` + `taaResolve: [false, true]`; `cold-session-precompile-reach.test.ts` + census/hidden-LOD tests; inventory tests + `taaResolve` pipeline-rebuild rows; `render-runtime.test.ts` + `taa-resolve` migration id. No threshold, fence, tripwire count, or assertion was weakened.
- No timeout widened. The only timeout-shaped lines in the diff belong to new/changed QA instrumentation, not existing gates: `measure-taa-temporal-stability.mjs` (new file, its own 180 s boot / 30 s commit waits), `hf399-fps-phase-probe-cdp.mjs` (`--taa` flag, `pipelineRecords` labels, `runtimeReceipt` read — no threshold change), `probe-pipeline-compile-stalls-cdp.mjs` (admission census aggregation — no stall definition change).
- Full-suite and build rows remain CLAIMED from the forward-port REPORT (6250 passed + rerun; `tsc`, `npm run build` passed) — not re-run here per brief, but no test file in the diff contradicts them.

## Carryover findings (still present verbatim — pre-release, not pre-entry)

- F1 — `src/rendering/taa-resolve.ts:388` vs `:377`: `samplePreviousDepth` has no `reversedDepthBuffer` branch while `sampleCurrentDepth` applies `oneMinus()` when reversed. History depth is a raw copy, same encoding both sides. IF the live WebGPU backend runs reversed (r185 default), `|closest − previous|` is systematically large and history rejects every non-edge pixel — TAA degrades to an expensive passthrough. Smallest fix: record `reversedDepthBuffer` in the TAA evidence receipt; if reversed, apply the symmetric `oneMinus()` in `samplePreviousDepth` (one branch) plus a unit case with reversed=true asserting `|closest − previous| ≈ 0` on identical depth.
- F2 — `src/rendering/taa-resolve.ts:435`: `validHistory = validUv AND (edge OR NOT depthRejected)` accepts history at silhouettes even when depth mismatches — inverted vs the usual disocclusion rule, uncommented. Smallest fix: one-line rationale comment if closest-depth fetch justifies it, or flip to `validUv AND NOT depthRejected`; plus a unit case with `edge=true, depthRejected=true`.

## Verdict: SHIP-WITH-FIXES (may enter candidate 9 as QUALITY/MAX opt-in; no release on this evidence)

1. Forward-port fidelity is exact where it matters: fingerprints/inventory mechanically regenerated (generator untouched, symbols verified in source), capability deltas limited to the TAA-justified MSAA zero, and prewarm coverage a superset of the lane's with the candidate's cold scope and fence intact — no weakened test, threshold, or timeout anywhere in the diff.
2. Pre-release conditions (not pre-entry — branch is opt-in, nothing auto-enables): run the §4 matched A/B on the candidate tree and close the 0-pipeline fence + p50 falsifier there; settle F1 with the reversed-depth boolean (fix or justify with receipt); close F2 with a comment or condition flip + unit case; print the p95 line.
3. Do not quote −5.2 ms, memory arithmetic (59 MB pair / 177 MB MSAA traffic removed), or shimmer deltas as properties of this branch until §4 is measured here; they are lane evidence correctly labelled OPEN by the forward-port REPORT.

Findings index: F1 `src/rendering/taa-resolve.ts:388` vs `:377` (previous-depth missing `oneMinus`); F2 `:435` (edge bypasses depth rejection); p95 note lane `pass2/perf-on-v6-final/taa2-quality-on-v6-final-nuketown2.json` (move p95 31.3 vs 29.0, idle 32.1 vs 28.4); prewarm `src/legacy-main.ts:30140,30146,30220` + `src/rendering/pass64-tsl-scene.ts:1435`; gating `src/pass65-settings.ts:437`; pins `src/ui/graphics-profile-descriptions.ts:196` / `src/graphics-profile-contract.test.ts:48-54`.
