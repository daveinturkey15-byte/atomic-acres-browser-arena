# Pass 82 — cross-browser freeze removal, 2026-09-01 (OMP overnight)

Owner report driving this pass (verbatim, 2026-08-31): "it just freezes every
few seconds in firefox, mega unstable! same issue with edge, unplayable."

## Root cause (measured, not inferred)

`WeaponPresentation.setPresentationVisible(false)` drove `this.root.visible =
false`. The root carries the two structural lights (`first-person-muzzle-light`,
`first-person-viewmodel-fill`), so every hide — player death above all — removed
them from Three's WebGPU light set. `LightsNode.customCacheKey()` hashes the
light set, so **every material program in the scene invalidated at once**, and
the next frames rebuilt hundreds of render pipelines inside combat while Dawn
compiled WGSL and built D3D12 PSOs (GPU-process work; the page main thread sits
idle and the compositor produces nothing).

Probe evidence (`scripts/qa/probe-pipeline-compile-stalls-cdp.mjs`):
251 in-combat pipeline creations in a 75 s window, **99.2% inside stalls**,
7.08x enrichment over chance; the probe's cache-key diffs name exactly the two
structural lights toggling on each `alive:false -> alive:true` transition.
This is the same light-set constraint documented in the handoff section 3
(dynamic lighting design note).

## Fix

`setPresentationVisible` now keeps the root (and both structural lights) in the
graph and expresses "hidden" as `FULLSCREEN_PRESENTATION_SUPPRESSED_SCALE` with
zero light intensities — the same retained-structural-lights contract the
fullscreen-suppression path has shipped since Pass 69-3. Uniform writes, never
a light-set change. Asset-only menu staging keeps its direct
`root.visible = false` (no live scene exists yet, nothing to invalidate).

## Before / after — `scripts/qa/measure-cross-engine-stalls.mjs`, 180 s windows

| Lane | Live pass 81 (before) | Fixed build (after) |
|---|---|---|
| Chrome | 8 stalls · **8.49% frozen** · median 1.40 s / max 5.96 s | **0 stalls · 0% frozen** |
| Edge | 20 stalls · **21.77% frozen** · median 1.63 s / max 8.04 s | 1 stall (239 ms, presentation-backpressure) · **0.13% frozen** |
| Firefox | 10 stalls · **11.49% frozen** · median 0.71 s / max 9.70 s | **0 stalls · 0% frozen** |

Pipeline probe, 75 s combat window: 251 -> **0** in-combat pipeline creations;
268 -> **0** in-combat shader modules; frozen fraction 14.01% -> **0.49%**.

Local artifacts (git-ignored, this worktree):
`artifacts/qa/cross-engine-stalls/before-live-pass81.json`,
`after-light-contract-3lane.json`, `artifacts/qa/pipeline-compile/before-local-pass81.json`,
`after-light-contract.json`.

## Also in this pass

- `package-lock.json` regenerated: `verify-npm10-lockfile.mjs` (preflight gate)
  rejected the committed lockfile — pinned npm@10.9.8 `ci --dry-run` failed with
  `Missing: @emnapi/runtime@1.11.3 from lock file`. Regenerated with the
  verifier's own documented command.
