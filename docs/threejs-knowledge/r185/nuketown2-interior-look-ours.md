# Recipe (ours): nuketown2 interior lighting look

Upstream: skill `threejs-webgpu-interior-lighting-look` (emissive fixtures
above the bloom threshold, value composition, fog falloff, decal grime);
three.js r185 `webgpu_lights_clustered`
(`https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_clustered.html`)
for why real lights belong to the clustered lane, not this one;
three.js docs (`threejs.org/docs/llms.txt`) for the `uniform()` TSL contract.
Project pins three `0.185.1`.

## Pattern

1. One shared TSL `uniform(1)` scales every fixture `emissiveNode`
   (`vec3(...).mul(INTENSITY)`); tag the material
   (`userData.nuketown2FixtureIntensity`) so a test can prove no per-instance
   value exists. Cold/warm stay two graphs — the uniform changes their shape,
   not their count.
2. Lamps stand on furniture that already exists (tops are supports, not new
   colliders); shades reuse the lens material so lamp intensity follows the
   same uniform for free.
3. Junction grime reuses the vertical-grime family and its offset tier; keep
   strip tops >0.03 m from EVERY nearby top (slab 0.08, baseboards 0.14) and
   below the family top rule (3.17), or the coplanar instrument counts them as
   HOUSE-INTERIOR findings with offsets ignored.
4. New family count is pinned (6) — put interior films in `wall-grime`, never
   a new family; ground-footprint tests skip that family, which is exactly
   what interior films need.
5. Merging is the draw-call budget: `solid:false, shots:false` boxes sharing a
   material fold into the existing presentation batch — +20 boxes, +0 draws.

## Fences hit

- Bloom threshold may only move up (`MINIMUM_COMPOSED_BLOOM_THRESHOLD` 1.02):
  drive emissive colour, not the threshold.
- Vignette capped (0.24/0.5): falloff comes from unlit corners, not the grade.
- 54-graph pipeline ceiling: this lane adds zero graphs by reusing materials.
