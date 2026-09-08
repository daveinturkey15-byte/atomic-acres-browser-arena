# Steal the corridor's own sun: live-sun shafts, axial grade, arrival thresholds

Technique: a map whose best room already solved light (colosseum: shafts not
wash, one sun object everything reads) gets coherent by PORTING that room's
answers, not by inventing new ones. Three moves, all multiplicative (the
standing complaint is uniform brightness — nothing here lifts exposure):

1. One live sun object. The sky owns `sunDirection`/`sunColor` as mutated
   `THREE.Vector3`/`Color`s; the directional light, foliage transmission and
   — new — the shaft hall's local sun all read the same objects. A corridor
   stores the world vector by reference once (`setSunDirection`) and per frame
   transforms it to local with an elevation floor. No per-frame allocation.
2. Axial grade along the walk. Mouth bright, end wall ~0.45, smoothstep curve,
   applied in albedo (floor, hall shell) and per raymarch sample (beams), so
   a long corridor reads as long and the player always has somewhere brighter
   to move toward.
3. Arrival thresholds in one formal language (twin pylons + blown lintel +
   halo/pool), tinted per corridor. The lintel is a flat bar driven to 2.5×
   above the bloom threshold; the halo is post bloom, not geometry.

## Numbers that make it work (map3, three r185)

- Sun elevation floor 0.12 in local space (the colosseum's rule): below it
  the slits see nothing and a 48-step march burns on black air.
- Axial curve: smoothstep `t = clamp(z / -len)`, `grade = 1 - 0.55·s(t)`;
  floor 0.55 dip, shell 0.45, beams 0.50 per sample. Endpoints pinned in
  `src/map3/signature.test.ts` (mouth 1, wall 0.45); monotonicity pinned, so
  a retune keeps green and an inversion fails.
- Lintel drive 2.5 (the `headlightMat` precedent in `corridors.ts`); bloom
  threshold may only move UP (`assertArtDirectionSafety`), so drive the
  emissive, never the threshold. Halo/pool opacity capped 0.55 additive.
- Pylons at ±2.9 m (outside a 2.5 m half-walk), lintel at 4.4 m (the eye is
  nailed to 1.7 m in `main.ts`). Threshold = 3 draw calls; cirrus layer = 1.
- Cirrus: ~12:1 wide:high billboards at 160–240 m, opacity from
  `cirrusDensity` × (1 − shared `skyDarken`) — storms thin the veil with
  nothing extra to drive. Overcast palette sets cirrus 0.

## Failure modes it avoids

- A second sun source of truth drifting out of sync (the sky comment block
  calls this out: mutate, don't copy).
- Exposure lifts that grow the highlight census (1.5–2× too many pixels
  already). Every term here multiplies ≤ 1 except the lintel, which is 3
  small quads of intentional blow-out.
- A duplicated weather seam: the dome consumes `map3WeatherShared.skyTint`
  (multiplicative, white = identity, applied before dither) and
  `.fogDensityScale` directly. A same-named local uniform with different
  semantics (additive black-neutral) was built first and removed — the test
  `'does not duplicate the weather seam'` pins its absence.
- `smoothstep` with reversed edges (exists elsewhere in this directory):
  the grade uses `clamp(z / -len)` into a standard 0→1 smoothstep.

## Upstream links

- Three.js docs: `MeshBasicNodeMaterial` emissive-style blow-out via
  `colorNode = rgb(hex, 2.5)`; instanced billboards from `cameraPosition`
  (the sky header documents why `THREE.Points` silently fails on WebGPU:
  `PointsNodeMaterial` size is dead on the `point-list` topology).
- Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026) via the
  `photoreal-procedural-scene-forge` skill §4 rule 2 (derive, don't tune) and
  §6 (presentation never derives collision); look structure from
  `threejs-webgpu-interior-lighting-look` §3 (emissive above threshold).
