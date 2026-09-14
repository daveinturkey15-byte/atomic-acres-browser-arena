# Skill-use receipt: props wave 1 (garden set)

Lane: props-night-20260912. Worktree aa-props-night-20260912 @ 6e9b2cafd318ca2b2f67f9eedcf8d624fee30453.

## Resolved skills (sha256 of the SKILL.md actually read)

- atomic-acres-asset-authoring: 57c1bb9e333ad99cd428f5cd03090d997ed0647d7b1be24581cd01b38dfd79c4
- ai-3d-asset-generation-loop: c411b9d7d50a1dcc4c5e5b41e1f7f9a99558f6f75b208287182b73aaa8c22bc0
- threejs-source-prop-ingestion: c98a730f53327ff7c7ea0e9f9a0d70b5c1915381a26fc4fee7fbe

## Original sources inspected (not just mentioned)

- scripts/blender/world-studio/build_hero_bus.py (repo, bus precedent):
  extracted Builder/chamfer discipline, metric units, shade_smooth_by_angle 34 deg,
  numpy CPU texture synthesis (make_body_maps), identical GLB export kwargs,
  BUILD_REPORT census pattern. Changed output: garden-set script reuses the export
  kwargs, smooth angle, weave/fBm texture approach and report shape; geometry is
  original (table/chairs/parasol), primitives + applied bevels instead of the
  Builder accumulator.
- src/world-studio/blender-assets/index.ts (repo loader pattern): extracted
  base-aware URL resolution, additive root + ready/dispose with dispose-race guard,
  presentation contract, texture-aware disposeSubtree. Changed output:
  src/world-studio/prop-assets/garden-set.ts mirrors it for the single garden set.
- threejs.org/docs/llms.txt: not re-fetched this wave; no new Three.js API used
  beyond GLTFLoader, already pinned by the repo at three 0.185.1 (verified via
  node_modules, matches the skill's reviewed peer >= 0.185.0).
- Concept images inspected as pixels: codex-clipboard-b6a7a535 (yellow backyard:
  table/chairs/red parasol target) and codex-clipboard-37cd28a5 (teal backyard:
  fence/AC/clothesline references for later waves).

## Independent validation pending

- Root must boot the runtime, load garden-set.glb through createGardenSet, and
  capture it on the yellow-house deck (front/side/three-quarter/closest-player).
- Falsifiers left open: weave visibility at gameplay distance, canopy underside
  read against bright sky, chair comfort silhouette vs concept (curator call).
- No GPU rendering, no browser QA, no Vite build performed in this lane per brief.

# Wave 2 appendix (2026-09-12 ~21:55 UTC): fence/gate + utility AC

Skills re-read in full this wave; hashes unchanged from wave 1 (verified by
sha256sum after the run):

- atomic-acres-asset-authoring: 57c1bb9e333ad99cd428f5cd03090d997ed0647d7b1be24581cd01b38dfd79c4
- ai-3d-asset-generation-loop: c411b9d7d50a1dcc4c5e5b41e1f7f9a99558f6f75b208287182b73aaa8c22bc0
- threejs-source-prop-ingestion: c98a730f53327ff7c7ea0e9f9a9be5da0bc9a0d70b5c1915381a26fc4fee7fbe

## Original sources inspected (not just mentioned)

- scripts/blender/world-studio/props/build_garden_set.py (this lane, wave 1):
  extracted helper contracts (box/cylinder/bevel/smooth/assign), texture
  synthesis shape, export kwargs, census shape, thumbnail rig, BUILD_REPORT.
  Changed output: fence script adds a directional wood-grain variant and a
  hinge-empty swing baked with parent_clear CLEAR_KEEP_TRANSFORM; AC script
  adds brushed-paint maps, torus/spoke grille, tilted louver/fan placement.
  Geometry is original in both.
- Concept pixels: codex-clipboard-37cd28a5 (teal yard: fence/AC/clothesline
  targets) and codex-clipboard-b6a7a535 (yellow yard: fence language cross-check).
- Blender 5.1.2 runtime behaviour (measured, not quoted): transform_apply
  defaults location=True/rotation=True; direct loc/rot assignment needs
  view_layer.update() before matrix_world reads. Evidence: wave-2 HANDOFF
  defect log with DNA-vs-matrix-vs-verts separation.
- threejs-source-prop-ingestion: no registry import used this wave (original
  artwork route per ai-3d-asset-generation-loop: hard-surface props favour
  code-only procedural for determinism/colliders). three 0.185.1 unchanged.

## Independent validation done (not pending)

- Throwaway stdlib GLB/catalog validator (deleted after use): ALL_VALID for
  both new GLBs against their BUILD_REPORT censuses (<5 mm, exact tris/mats,
  SHA-256 rebound to catalog rows).
- 512x384 Cycles CPU thumbnails vision-inspected for both assets; fence
  magenta-miss caught and fixed through this check.
- 16/16 vitest across the three prop-asset helpers; tsc clean on the lane
  namespace.
- Still pending (root-owned): runtime boot, in-yard captures, gameplay-distance
  legibility, collision proxies.
