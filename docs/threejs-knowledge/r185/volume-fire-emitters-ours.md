# Volume fire emitters — our recipe (r185 technique #8, HF-490)

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_volume_fire.html
(`three@0.185.1`; on-disk recipe read via
`git show origin/contrib/dave-gaming-pc/claude/r185-techniques:docs/threejs-knowledge/r185/webgpu_volume_fire.md`).
Local upstream snapshot: `docs/threejs-knowledge/upstream/llms-full.txt`.

## What upstream does

A GPU 3D fluid: `Storage3DTexture` dye/velocity fields, curl-noise
initialisation, semi-Lagrangian advection, divergence + Jacobi pressure
projection, then ray-march compositing through `VolumeNodeMaterial`. Seven
compute stages per frame plus a render pipeline.

## What we do instead (re-implemented in our likeness, HF-472)

A bounded emissive box, no fluid at all:

- One unit `BoxGeometry`, `MeshBasicNodeMaterial`, `BackSide` +
  `transparent` + `depthWrite: false` + `AdditiveBlending` + `fog: false`.
  BackSide is load-bearing: every fragment is the far wall, so the march
  starts at `cameraPosition` — the MAP3_HANDOFF lesson, same as
  `src/map3/corridor-colosseum.ts` (`createShaftMaterial`, 26 steps) and
  `src/map3/corridor-volume.ts` (48 steps).
- Local-space march via a per-emitter `uniform(Matrix4)` inverse-world matrix,
  copied once at pose time from `mesh.matrixWorld`.
- Fixed 20-step `Loop` (brief band is 16–24, cheapest end kept).
- Medium: two-octave sin-product churn advected upward + flicker, seeded per
  emitter — the colosseum `n1*n2*n3` dust idiom, not a texture.
- Flame body: `(1-h)^2` vertical profile (hot base, narrow tip), ember →
  blaze → white palette ramp by temperature.
- Per-emitter variance (seed, intensity, tint, half extents) is `uniform`
  only, so all five pool slots generate byte-identical WGSL and share ONE
  compiled pipeline (HF-477; proven by the graph-signature test in
  `src/volume-fire-presentation.test.ts`, ported from
  `src/nuketown2-pipeline-budget.test.ts`).
- One shared clock `uniform` mutated in place per frame; slot visibility
  toggles; zero per-frame allocation, zero lights, zero in-combat pipeline
  work. Menu-time rehearsal through `PresentationPrewarmRuntime`
  (same shape as `SupportExplosionPresentation`).

## What we deliberately omit

- Heat distortion (brief: optional). OPEN.
- The upstream fluid/compute path: no `Storage3DTexture`, no `textureStore`,
  no compute nodes, no Jacobi passes. A test asserts the module source
  contains none of these tokens.

## Budgets carried over

- ≤ 4 authored emitters per arena (2 on nuketown2 via `pair()` semantics,
  2 on skyline-terminal from the luggage-cart table); pool capacity 5 with
  one reserved nuke-fireball slot.
- `volumeFire` graphics control: off/low/high, `applyMode: live`
  (tier switches are uniform writes, never rebuilds), presets
  off/off/low/high — Balanced stays off because a 20-step raymarch is the
  per-frame structure that rung refuses.
- Defended estimate: ~20 steps × ~20 ALU over small-box coverage, well
  under 0.5 ms p95 at 1280x720; one pipeline; no transient GPU memory.
