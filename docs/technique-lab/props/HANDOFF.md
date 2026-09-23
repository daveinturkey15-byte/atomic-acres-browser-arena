# HANDOFF: props wave 1 (garden set first, 2026-09-12 ~21:00 UTC)

Owner: OMP muse-spark, worktree C:/Users/david/projects/worktrees/aa-props-night-20260912,
branch contrib/dave-gaming-pc/omp/props-night-20260912, base 6e9b2cafd318ca2b2f67f9eedcf8d624fee30453.
No commits/pushes; scoped diff left for root integration.

## Finished inspectable asset (curator rank 1, reason in catalog.json)

Garden table + 4 armchairs + red parasol, one composed GLB:

- scripts/blender/world-studio/props/build_garden_set.py (deterministic script)
- source-assets/world-studio/props/garden-set.blend (1.3 MB reconstructable source)
- public/assets/world-studio/blender/props/garden-set.glb (324,652 B,
  sha256 a135003ca97f68f4692684fa10a94421818046ce633b775612b2e71a3e2f9c25)
- public/assets/world-studio/blender/props/garden-set-thumb.png (243,553 B actual
  CPU Cycles render, inspected: canopy/chairs/table read correctly)
- public/assets/world-studio/blender/props/textures/ (4 PNGs: parasol weave
  basecolor + roughness, chair weave roughness, brushed-bronze roughness)
- public/assets/world-studio/blender/props/catalog.json (schemaVersion 1, 1 asset)
- src/world-studio/prop-assets/garden-set.ts (loader helper, mirrors
  blender-assets/index.ts disposal/presentation pattern incl. texture disposal)
- src/world-studio/prop-assets/garden-set.test.ts (5/5 pass)
- docs/technique-lab/props/garden-set-placement.md, skill-receipt.md, HANDOFF.md

Census (Blender 5.1.2, --background --threads 4, seed 20260912): 61 objects,
4202 verts, 8148 tris, 3 Principled PBR materials, true vertex bounds
x/y +/-1.446 m, z 0.0–2.405 m, ground contact exact.

## Tests actually run

- Blender 5.1.2 background build + export + 512x384 Cycles CPU thumbnail
  (threads FIXED 4, 48 samples + denoise): exit 0, BUILD_REPORT recorded above.
- npx vitest run src/world-studio/prop-assets/garden-set.test.ts: 5 passed.
- npx tsc --noEmit: zero errors in prop-assets files (out-of-scope errors ignored
  per brief, untouched).
- npm run pipeline:preflight (contribute, lane props-night-20260912): ok clean.
- AKP check: OMP/dave-gaming-pc PASS trusted. Audit AMBER rows are other
  harnesses' stale receipts, not this lane.

## Defects found and fixed in-wave (evidence above)

- Script nested one level deeper than bus precedent: REPO parents[3] wrote outputs
  under scripts/; fixed to parents[4], strays deleted.
- Seat pads missing parts.append sat at origin (census caught min-z -0.035); fixed.
- Census used bbox corners (reported phantom +/-1.72 on rotated canopy); now true
  vertex bounds (+/-1.446).
- Valance was a capped disc (would read as ceiling); opened via bmesh cap delete.

## Unresolved falsifiers / needed root wiring

- Runtime load + deck captures pending (root owns arena.ts, manifest, release).
- Weave legibility at gameplay distance unproven; 48-sample thumbnail is small.
- Collision proxy is arena-owner work (cylinder advice in placement note).
- catalog.json covers garden set only; fence/gate, AC unit, clothesline not started.

## Next best improvement (wave 2)

Weathered wood fence/gate section reusing the weave/fBm texture technique with a
wood-grain variant, same export/census/thumbnail pipeline; then retro AC unit.

# WAVE 2 — quality pass + fence/gate + utility AC (2026-09-12 ~21:55 UTC)

Call 2 of at most 3. Branch contrib/dave-gaming-pc/omp/props-night-20260912,
base 6e9b2cafd318ca2b2f67f9eedcf8d624fee30453. No commits/pushes/merges;
wave-1 receipt above preserved verbatim. Garden set untouched (garden-set.glb
still 324,652 B, sha256 a135003c…3e2f9c25).

## New finished inspectable assets

Fence/gate run (props-fence-gate-r1) and retro AC condenser
(props-utility-ac-r1), same deterministic pipeline as wave 1:

- scripts/blender/world-studio/props/build_fence_gate.py (53 objects, 5300
  tris, bounds x +-2.761 m, y -0.989/+0.075 m, z 0-1.97 m, ground exact)
- scripts/blender/world-studio/props/build_utility_ac.py (40 objects, 5980
  tris, bounds x +-0.6 m, y +-0.5 m, z 0-0.9245 m, ground exact)
- source-assets/world-studio/props/fence-gate.blend (1,071,146 B)
- source-assets/world-studio/props/utility-ac.blend (1,158,301 B)
- public/assets/world-studio/blender/props/fence-gate.glb (299,976 B, sha256
  071c7e5192544d723272905701caf991f5c90c437dbab12c955ef96a30653f1d)
- public/assets/world-studio/blender/props/utility-ac.glb (288,564 B, sha256
  8efd63ecb9fbf9c2240c2de56ab9acafe3d102b2761f07994ad705043d0bf9df)
- fence-gate-thumb.png (248,792 B) and utility-ac-thumb.png (224,098 B):
  actual 512x384 Cycles CPU renders, vision-inspected (wood grain brown, gate
  ajar with straps, AC louvers/grille/lamp all read correctly, no magenta)
- textures/: 5 new PNGs (fence_wood_basecolor/roughness 101,160 B total,
  ac_paint_basecolor/roughness + ac_concrete_roughness 105,018 B total)
- catalog.json: 3 rows, ranks 1 garden / 2 fence / 3 AC. Ranks are documented
  curator judgment with per-row reasons, never a measured claim. sourceUrls is
  [] on all rows: original artwork, no external pin exists; inventing a public
  URL would be fabrication. Technique lineage lives in skill-receipt.md.
- src/world-studio/prop-assets/fence-gate.ts + .test.ts, utility-ac.ts +
  .test.ts: same additive loader/disposal/presentation contract as
  garden-set.ts (per-file self-containment matches the wave-1 convention; not
  refactored into a shared module to avoid touching frozen wave-1 files).
- fence-gate-placement.md, utility-ac-placement.md: origin/yaw/clearance/
  collision-proxy advice for the arena owner.

## Commands actually run (Blender 5.1.2, hash ec6e62d40fa9)

- "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background
  --factory-startup --threads 4 --python scripts/blender/world-studio/props/build_fence_gate.py
- same with build_utility_ac.py. Exit 0, BUILD_REPORT per asset (see above).
- npx vitest run src/world-studio/prop-assets/{garden-set,fence-gate,utility-ac}.test.ts:
  3 files, 16/16 pass.
- npx tsc --noEmit: zero error lines under src/world-studio/prop-assets/
  (out-of-scope errors elsewhere ignored per brief, untouched).
- Throwaway GLB/catalog validator (stdlib only, deleted after use): parsed both
  GLBs independently (magic, version, triangle-mode primitives, per-vertex world
  bounds via node transforms, material/image counts) and every catalog row
  (schema keys, deploy-relative URLs, export+thumb existence, SHA-256 rebind).
  Result ALL_VALID: GLB world bounds match the Blender census to <5 mm, tris
  5300/5980 and material counts 2/7 agree, SHAs match the catalog.
- npm run pipeline:preflight (contribute, lane props-night-20260912): REFUSES,
  worktree has 5 changed paths. Expected mid-lane state, not a defect: the 5
  paths are exactly this lane's allowed untracked outputs (docs, public,
  scripts, source-assets, src namespaces above). Wave 1 reported clean because
  it ran before outputs existed. Root integration commits these paths.

## Defects found and fixed in-wave (all with file evidence above)

- transform_apply(scale=True) bakes location+rotation: operator defaults are
  location=True, rotation=True. First wave-2 builds double-offset every part
  moved after creation (AC fan blades floated at 1.77 m, louvers buried in the
  cabinet, fence brace thrown off-frame). Fix: explicit
  transform_apply(location=False, rotation=False, scale=True) BEFORE bevel
  (scale must be applied first or bevel widths distort). GOTCHA candidate for
  AKP promotion (text below); the wave-1 garden set is affected only in table
  feet clocking (cardinal instead of 45-degree points, 4-fold symmetric under
  the 1.1 m top: invisible, preserved as-is; limitation recorded in catalog).
- Fence rendered all-magenta: an edit repair dropped `tex.image = base_img`,
  leaving a linked-but-empty texture node. Caught by thumbnail vision
  inspection, fixed, rebuilt, re-inspected clean. Lesson: Blender scripts do
  not prove Blender ran AND a green export does not prove materials bound;
  only the rendered thumbnail plus node audit counts.
- Stale matrix_world: direct loc/rot assignment is invisible to matrix_world
  until view_layer.update(); the first AC census reported a phantom 1.77 m
  bound while DNA was correct. Fix: update() at census head. (The 1.77 m
  number was doubly confusing because the transform_apply bug above was live
  at the same time; DNA-vs-matrix-vs-verts separation identified each.)
- Validator overestimation: transforming accessor AABB corners through rotated
  nodes inflates bounds (fence post caps: 2.82 vs true 2.76). Fixed by exact
  per-vertex world walk; GLB and census agree.
- Edit-repair fragility (process): two line-anchored repairs landed wrong
  (dead helper absorbed, census line dropped). Each was caught by py_compile +
  structural grep before any Blender run. No bad build shipped.

## Unresolved falsifiers / needed root wiring

- Runtime load + in-yard captures pending (root owns arena.ts, manifest,
  release). Validator proves file correctness, not in-game visibility.
- Grain/weave legibility at gameplay distance unproven for all three assets.
- Collision proxies are arena-owner work (advice in the three placement notes).
- Clothesline not attempted: 45-minute wave budget spent on two finished
  assets plus four real bug fixes. Best next improvement if a wave 3 runs.
- AKP check/audit: not re-run this wave (no control files changed, native
  bootstrap from wave 1 still current); preflight refusal documented above.

## Root wiring guidance

- Import createFenceGate/createUtilityAc where garden set is wired; URLs are
  deploy-relative, disposal/presentation contract identical.
- Keep catalog.json ranks as curator order; do not present them as measured.
- Suggested acceptance views: fence run at a teal-yard boundary with the leaf
  toward camera; AC beside a chimney proxy; both alongside the garden set for
  palette coherence (weathered brown + beige-grey against bronze/red accents).
