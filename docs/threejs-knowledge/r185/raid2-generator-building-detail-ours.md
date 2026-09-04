# raid2-generator-building-detail — ours (r185 technique #6 in our likeness)

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_generator_building.html
(`SkyscraperGenerator` + `createSkyscraperMaterial` + `pickBuildingColor`;
three 0.185.1, `examples/jsm/generators/city/SkyscraperGenerator.js`).
Recipe: `docs/threejs-knowledge/r185/webgpu_generator_building.md` §4
(`src/rendering/procedural-building-kit.ts` plan: seeded generator,
non-authoritative trim grouped by material role, arena owns footprint/collider).

## What we took

- Seeded, deterministic facade generation grouped by material role — ours:
  `generateRaid2FacadeDetail(builder, mats, level)` in
  `src/raid2-facade-detail.ts`, `mulberry32(hash(building))` seed, six detail
  classes, per-building ceilings.
- TRIM onto authored raid2 masses (the arena's wall tables are the footprint
  authority, not a seed + parameters): mouth arrays transcribed from
  `src/raid2-arena.ts`, solids as complement, every piece `solid: false`,
  `builder.colliders` untouched (tested).
- Deploy fence (generate at stream/precompile, never combat) — ours: called
  inside `buildRaid2` before `batchPresentationOnlyBoxes`; static meshes only,
  zero per-frame allocation, zero new pipelines.

## What we changed (likeness, not vendoring)

- No upstream code copied. Upstream emits whole buildings; we emit FACADE
  TRIM onto authored raid2 masses (the arena's wall tables are the
 -footprint authority, not a seed + parameters).
- Materials are the arena's forged families (`raid2-art.ts` via
  `raid2Materials()`), never new: palette color stays the uniform tint
  (fidelity band 22 subject unchanged), per-instance variation does not exist.
- Batching reuses the existing `batchPresentationOnlyBoxes` (one draw per
  presentation class) instead of upstream's grouped geometry; glazing stays
  individually `shots: true` / `ballisticMaterial: 'glass'` because a merged
  field cannot carry per-pane shot surfaces (shipped C3/hoop precedent).
- `InstancedMesh` deliberately NOT used: the parity census measures
  `Box3.setFromObject`, which ignores instance matrices.
- Parity/coplanar shaped by measurement, not hope: classes sized out of the
  walk-through census (thin/short) and the ballistic census (all but glass);
  tops kept > 0.03 m off every existing raid2 top and off each other where
  plans overlap (glass 2.22, mullion 2.26, AC 2.5, string 2.68, downpipe 3.1).
- Off switch reuses the canonical `geometryDetail` control
  (`raid2FacadeDetailLevelForGeometryDetail`), not a new registry row.

## Reuse checklist for the next generator lane

1. Transcribe mouths, complement to solids, never glaze an opening.
2. Keep every new top > 0.03 m off every arena top AND off sibling-class tops
   where plans overlap; same-material overlaps are benign.
3. Size trim out of the parity censuses (walk-through: h < 0.9 or min-plan
   < 0.35; ballistic: h < 0.9 or max-plan < 0.35) or rate it directly.
4. Half-sink skins in the wall face (≈0.03 proud): inside the 0.05 flush
   epsilon, 50% collider overlap for the walk-through share rule.
5. Pin per-building ceilings at measured actuals; they may only go down.
