# PASS 96 TAA resolve review (Muse Spark skeptic) — HF-472

Branch: `contrib/dave-gaming-pc/claude/taa-resolve`
Range: `origin/contrib/dave-gaming-pc/claude/blind-ab-critic..HEAD` (9 commits, src: 17 files, +1037/−74)
Lane report: `docs/evidence/pass96/taa-resolve/REPORT.md` (Pass 2 ACCEPTED for QUALITY/MAX opt-in; Pass 1 rejection retained as history)
Knowledge note: `docs/threejs-knowledge/r185/taa-ours.md` (Luna, 2026-09-05)
Claim-states: VERIFIED (saw it in diff/evidence JSON), CLAIMED (lane says so, not independently re-run — no builds/browsers per brief), OPEN (needs runtime receipt/test).

No src/ modified by this review. No builds, browsers, npm install, or test suites run. Perf/stability numbers below are re-derived from the checked-in evidence JSONs, not re-measured.

## (1) Mechanical wiring — VERIFIED, no scope creep

- One pipeline admitted: `TSL_MIGRATION_INVENTORY` 7→8 with `pass96.taa-temporal-resolve.tsl.v1` exactly once (`src/rendering/tsl-migration-inventory.ts`, `src/rendering/pass64-tsl-scene.test.ts` pins its SHA `85040fce…`). Descriptor is honest (in-repo graph, not vendored TRAA).
- `TaaResolveNode` owns two distinct RGBA16F targets (`TAA ours.history.RGBA16F`, `TAA ours.resolve.RGBA16F`) + one `TAA ours.resolve NodeMaterial` (`src/rendering/taa-resolve.ts:1449-1466`). Strength uniform clamped 0..1 at construction (`:1448`) and driven live in `applyRuntime` (`src/rendering/screen-space-post.ts:1044`).
- TAA is first linear stage: `LINEAR_SOURCE_STAGE_ORDER` gains `taa-temporal-resolve` before `motion-blur-velocity-smear` (`src/rendering/grade-profile.ts:590`), assembler pushes it conditionally (`src/rendering/pass64-tsl-scene.ts:682`), motion blur/SSGI/SSR/bloom all consume the resolved `sceneColor` (`src/rendering/screen-space-post.ts:1001,1010,1036`; `pass64-tsl-scene.ts:724`).
- MSAA mutual exclusion is real: `resolveGraphicsRuntime` zeroes `antialiasSamples` iff `screenSpace.taaResolve.enabled` (`src/pass65-settings.ts:437`), and that value feeds renderer construction and the ScenePass principal target. Saved selector intact.
- Velocity MRT on QUALITY only: `screenSpaceMrtRequirement().velocity = motionBlur.enabled || taaResolve.enabled` (`screen-space-post.ts:934`). BALANCED (both false) stays off; QUALITY/MAX on.
- GTAO/SSGI temporal filtering tied to resolved topology, not request: `gtaoPass.useTemporalFiltering = screenSpaceRuntime.taaResolve.enabled` (`pass64-tsl-scene.ts:715`); `node.useTemporalFiltering = runtime.taaResolve.enabled` (`screen-space-post.ts:1027`).
- Review determinism: `setReviewCamera(true)` freezes Halton index AND forces history reseed (`taa-resolve.ts:1474-1480`); `clearReviewCamera` unfreezes without reseed (one-frame station-to-gameplay ghost risk; depth rejection should kill it — note only).
- Control surface is minimal: one `taaResolve` toggle, `pipeline-rebuild`, `temporal-anti-aliasing` consumer (`graphics-settings-registry.ts:124-128`); pins re-measured from live objects (`e38ede29/9d461537/2f8b5453/b71a9c4e`), enforced by `graphics-profile-contract.test.ts`.

## (2) Resolve math — CPU/GPU consistent; two findings

VERIFIED consistent:
- `reprojectHistoryUv([0.5,0.5],[0.2,-0.4]) = [0.4,0.3]` and GPU `historyUv = uv − vel·(0.5,−0.5)` (`taa-resolve.ts:1381` vs `:1674`) agree symbol-for-symbol. Upstream NDC/UV sign convention itself is OPEN (TRAANode.js not re-fetched per brief), but internal consistency is exact.
- YCoCg round-trip and clamp check out by hand: `[1,0,0]` → YCoCg `[0.25,0.5,−0.25]` → clamped to box → `[0.35,0.2,0.25]`, matching the unit expectation. Sharpen-free blend with invalid-history identity return (`:1394-1403,1685-1686`) matches the documented policy.
- Velocity cutoff `TAA_MAX_VELOCITY_PIXELS = 96` scales history weight to 0 at large reprojection (`:1683-1685`) — fast motion falls back to current frame rather than smearing.
- Closest-depth velocity fetch (`velocityNode.load(closestPositionTexel)`, `:1673`) with 3×3 closest/farthest sampling (`:1613-1631`) is the correct foreground-edge choice.

FINDING F1 (major, conditional — one boolean settles it): asymmetric reversed-depth handling. `sampleCurrentDepth` applies `oneMinus()` when `builder.renderer.reversedDepthBuffer` (`:1621`); `samplePreviousDepth` has NO reversed branch (`:1632-1641`, logarithmic only). Both sample the same encoding (history depth is a raw `copyTextureToTexture`). IF the live WebGPU backend runs reversed (three r185 WebGPU default), then `|closest − previous|` is systematically large, i.e. history is rejected on every non-edge pixel and TAA degrades to an expensive current-frame passthrough. The setup code acknowledges reversed depth (`:1606` flips the history depth texture type), so the omission reads as a bug, not a convention. Required: record `reversedDepthBuffer` in the browser receipt and either add the missing `oneMinus()` or document why previous depth needs none.

FINDING F2 (minor, needs justification): edge bypass. `validHistory = validUv AND (edge OR NOT depthRejected)` (`:1677-1679`) accepts history at silhouettes even when depth mismatches — the opposite of the usual disocclusion rule, with no comment. Closest-depth fetch may justify it; write the one-line rationale or flip the condition, plus a unit case with `edge=true, depthRejected=true`.

## (3) Admission reach — VERIFIED, genuinely census-derived

- Resolve precompile compiles BOTH ping-pong directions with swapped bindings (`taa-resolve.ts:1565-1581`), restoring originals in `finally`. Live path writes directly into the next history target and swaps (`:1526-1544`); only first-frame seed + depth-history copy remain. Unit gate pins `compileAsync(QUAD…)` + `setMRT(null)` and the absence of the old per-frame copy (`taa-resolve.test.ts:1196-1203`). VERIFIED in code.
- Velocity census is derived, not a roster: `enumerateTaaVelocityMrtPrecompileCandidates` keys on geometry layout + material identity (`cold-session-precompile-reach.ts:521-538`), includes hidden objects and non-selected LOD levels, restores `visible`/`frustumCulled` in `finally` (`:554-564`) with a unit test asserting restoration. Receipt `taa2-quality-on-v6-final-nuketown2.json:runtimeReceipt.taaPrecompileReach` contains 85 `velocityMrtMaterialVariants` (re-counted from the JSON). Vocabulary matches the recipe.
- In-combat fence re-derived from evidence JSONs: TAA-on `deployed-idle` created 0, `move` created 0 (`renderPipelinesTotal: 523`, empty label lists); matched TAA-off control 0/0 (total 425). Pass 1's +6 idle failure honestly retained in REPORT. VERIFIED.
- Note: `geometryVariant` includes `geometry.uuid`, so candidate keys are per-instance (conservative over-compile, correct for reach); only persisted material variants collapse. +98 total pipelines (523 vs 425) is the admission-time price — exactly the contract.

## (4) Perf falsifier — arithmetic VERIFIED; p95 regresses silently

From the checked-in JSONs (2560×1440, same scripted route):

| Phase | Off p50/p95 | On p50/p95 | Delta p50/p95 |
|---|---|---|---|
| deployed-idle | 21.0 / 28.4 | 18.8 / 32.1 | −2.2 / +3.7 |
| move | 21.4 / 29.0 | 16.2 / 31.3 | **−5.2** / +2.3 |

- Moving p50 delta −5.2 ms vs the unchanged +1.0 ms falsifier: VERIFIED, passes with margin. Mechanism (dropping the 4× MSAA principal target) matches the wiring in §1.
- Un-gated regression (flag, not failure): p95 is WORSE on both rungs (+3.7 idle, +2.3 move). The lane gates p50 only, so this passes the letter of the contract — but a TAA that improves the median while fattening the tail deserves a p95 bound or an explicit out-of-scope line. Next pass should report p95/p99 deltas alongside p50.
- Memory row stays CLAIMED/OPEN as labelled (59 MB pair, 29.5 MB resolve+copy, 14.7 MB velocity, ~177 MB MSAA traffic removed). REPORT correctly states no GPU counter was treated as TAA-specific. Do not quote those numbers as measured.

## (5) Temporal stability — directionally positive, weak instrument

Re-derived from `pass2/temporal-stability-v3/taa2-temporal-stability.json` (3 frames/station, 3×3 high-pass luma delta):

- street-centre: 0.00108516 (0.00081435, 0.00135597) → 0.00066182 (0.00061443, 0.00070920). VERIFIED.
- north-yard: 0.00238282 (0.00232449, 0.00244116) → 0.00220968 (0.00224613, 0.00217323). VERIFIED — but ~7% on n=2 deltas.
- Caveats: frozen-jitter static frames are the easiest case for any history blend; high-pass energy also rewards mere blur, and the clamp biases toward the neighbourhood mean by construction. Two stations × two deltas cannot resolve shimmer under real camera motion. The lane does not overclaim beyond the numbers, and the 12-frame manifest with receipts is present. Keep as supporting evidence; the falsifier + fence carry the acceptance. If F1 confirms a mostly-rejecting TAA, revisit whether this delta survives the fix.

## (6) Test/evidence quality notes

- Good: math unit gates, two-target RGBA16F ownership, MSAA on/off matrix (0 vs 4), hidden/LOD inclusion with flag restoration, census vocabulary pins.
- Brittle but acknowledged: `taa-resolve.test.ts:1196-1203` asserts source-text presence/absence. Guards the exact regression it was written for; accept with a sunset note (replace with behaviour probe when the precompile mock tracks copies).
- Pass 2 gates section lists commands without pass-1-style counts. Minor: restore counts so the next reviewer can compare without rerunning.
- REPORT OPEN rows (preflight slug guard rejecting `.../claude/taa-resolve`, unrelated AKP audit rows) are honestly recorded and correctly scoped as not touching this lane. Agree.

## Verdict: SHIP-WITH-FIXES (opt-in QUALITY/MAX only; no release performed — concur)

1. Acceptance stands on the lane's own terms: 0/0 in-combat creations with a census-derived 85-variant admission, −5.2 ms moving p50 vs the unmoved +1.0 ms falsifier, shimmer delta directionally positive at both stations, pins re-measured not repinned, Pass 1 failure preserved as history.
2. Pre-release (not pre-merge — branch is opt-in, no release performed): F1 settle the reversed-depth boolean and fix or justify; F2 comment or correct the edge bypass; add a p95 line to the falsifier table (bound it or explicitly scope it out).
3. Do not quote the memory arithmetic as measured; REPORT already labels it correctly.

Findings index: F1 `src/rendering/taa-resolve.ts:1632-1641` vs `:1617-1622` (previous-depth missing `oneMinus`); F2 `:1677-1679` (edge bypasses depth rejection); p95 note `pass2/perf-on-v6-final/taa2-quality-on-v6-final-nuketown2.json` move p95 31.3 vs 29.0 off, idle 32.1 vs 28.4.
