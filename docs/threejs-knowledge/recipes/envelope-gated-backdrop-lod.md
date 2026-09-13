# Envelope-gated backdrop detail with fog-wall LOD

Technique: ship one procedural backdrop/forest module for two maps (or two
quality tiers) by threading an **envelope object with optional tuning fields**
through the builders. The shipped/default envelope sets none of them and
builds bit-identical geometry (pinned by tests); the detail envelope carries
its own ceilings, bands, palettes and prototype detail. No caller changes, no
forked module, no retuned shared constants.

## Numbers that make it work (nuketown2, three r185)

- Mountain rings share one outer radius (132 m, married to the 135 m plain
  edge) and widen **inward only** as they grow: foothills 72–132 m at 8–20 m,
  ridge 96–132 m at 24–46 m, far 104–132 m at 40–64 m. A 62 m crest on an 8 m
  band is a plate; on a 28 m band it is a peak.
- Cross-section rows 5 → 9 by resampling the same five keyframes
  (foot/shoulder/crest/shoulder/foot); interpolated flank rows take a
  ±1.2% radial / ±2% vertical sine spur offset. Crest keyframes land exactly,
  so the 5-row path is untouched bit for bit.
- Crest function: ridged `1-|sin|` stack 4 → 6 octaves (x37, x61 added,
  weights rescaled to sum 1), sharpen exponent 1.4 → 1.75.
- Forest: high-detail prototypes (conifer 100 → 248 tris, canopy 144 → 288)
  **in front of the fog wall only** (44.5–58 m vs fog near 58); the fogged
  far band keeps the cheap prototypes. +2 draws (7 total), ~159k/200k tris.
- Chroma is authored, not hoped for: the fog washes everything past 58 m
  toward grey, so near-band tones are stepped up in saturation at the same
  median luma (conifer belt 0.326 → target 0.420+ mean-pixel saturation).

## Failure modes it avoids

- **Shared-constant trap**: the obvious taller-mountain edit (raise the one
  `MAX_HEIGHT` constant) silently retunes the shipped map sharing it. Give
  each envelope its own `NUKETOWN2_`-prefixed ceilings; freeze both; pin with
  tests asserting the shipped values AND the new geometry in one file.
- **Module-eval TDZ**: a frozen envelope referencing detail constants
  declared later in the same module throws at import. Declare detail
  constants (or use literals + equality tests) before the envelope.
- **Alpha-test fill**: count card quads per prototype × built instances and
  pin ≤ 3× baseline in a test; LOD the cards, not just the triangles.
- **Anti-gaming the exposure metric**: pin treeline elevation p50 (≥ 10.5°)
  so detail can never be "won" by shrinking the forest.

## Cost model (measured, offline probe, no GPU)

- Backdrop: 3 draws, 3,680 → 18,528 tris (budget 5 / 60,000).
- Forest: 7 draws, 81,320 → 159,373 tris (budget 8 / 200,000).
- Skyline from street eye: crest max 13.41° → 25.39°, hidden bearings
  96/120 → 3/120, exposed p50 −1.93° → +8.42°.

Upstream: three.js docs first (InstancedMesh, fog, vertex colors), then
`node_modules/three` r185 source. Skills that drove it: threejs-procedural-
vegetation (Multi-component trees, Merged multi-part geometries, Density
gradient), procedural-sdf-raymarched-worlds §1 (route decision: rasterise —
background ring at 3 draws, raymarch would cost fill rate), threejs-frame-
loop-audit (counts before milliseconds; alpha-test fill as first cost).
