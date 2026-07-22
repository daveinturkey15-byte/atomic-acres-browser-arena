# Atomic Acres Aesthetic Overhaul — 2026-07-22

Status: implementation branch; central integration candidate only

Base: `origin/main` at `6b0495dae308878bb969916e4f5d80539f90157e`

## Overview

Refine the released Atomic Acres arena into a cohesive original retro-future model suburb. The target is the immediate visual hierarchy and playful, immaculate test-town theatre associated with Black Ops II-era small-map design: two unmistakable homes, a civic vehicle showcase, clean lawns, bright team-readable colour blocks, and controlled near/mid/far landmarks. Exact Nuketown geometry, assets, textures, branding, signage, mannequins, prop placement, and floor plans remain prohibited.

## Evidence and claim states

### Observed

- Quality Graphics loads one self-contained Blender arena with 33 meshes, 27 materials, 34,336 triangles, two transit vehicles, four large cover assets, two house furnishing sets, and six semantic windows.
- Fixed player-height captures show dense waist-readable grass tufts across most green space, a dark fortress-like perimeter, faceted tree crowns, competing route hardware, and two houses whose broad box silhouettes do not dominate the arena.
- Both homes contain large blank wall/floor fields. Furniture exists but does not create convincing room identity or player-scale composition.
- Exterior texture families are technically PBR-complete, but several reused brick/plaster surfaces collapse to the same warm treatment and weaken team/room identity.
- The central vehicle composition is readable hard cover and should remain aligned to its current presentation footprint.

### Inferences

- The main problem is hierarchy and art direction rather than asset count.
- A narrower, cleaner prop vocabulary will improve resemblance to an immaculate retro-future test suburb more than adding further agricultural machinery.
- Reducing grass complexity can fund smoother trees and richer house/interior geometry while lowering visible triangle cost.

### Assumptions

- Current `origin/main` is the integration baseline for this isolated contribution.
- This branch does not edit gameplay collision, spawn locations, breakable windows, route anchors, or cover bounds. Collision and clearance must nevertheless be revalidated after rebasing the concurrent prone-capsule/collision-authority contribution; Pass 57 is not assumed to remain authoritative.
- “Match Black Ops II Nuketown” means match high-level qualities—clarity, colour blocking, model-home theatre, compact civic focal point—not protected expression.

### Unknowns and falsifiers

- Unknown: whether revised silhouettes remain clear from every spawn. Falsifier: representative captures show either home hidden behind secondary route clutter.
- Unknown: whether new interior dressing obstructs perceived routes despite remaining non-colliding. Falsifier: player-height captures show a doorway, ramp, or firing lane visually closed.
- Unknown: final representative GPU cost. Falsifier: Quality exceeds the existing stable draw-call budget or visible triangle count rises above baseline without a justified trade.

## Requirements

1. Preserve presentation geometry aligned to the current layout, spawns, windows, routes, and cover footprints. Treat collision authority as external and revalidate alignment after integration.
2. Reframe Aqua and Coral as distinct original “model homes of tomorrow” with stronger rooflines, facade depth, team colour, and readable entrances.
3. Replace blank interiors with coherent room kits placed against walls and outside traversal envelopes.
4. Keep both central transit assets but refine their silhouette and civic-showcase presentation; do not reproduce Nuketown vehicles.
5. Convert the ground treatment from wild tuft field to manicured lawn with sparse edge growth.
6. Replace the prison-like dark perimeter/post rhythm with a lighter test-campus boundary and a distant arid ridge silhouette.
7. Smooth ornamental vegetation and remove or subordinate oversized route hardware that competes with the homes.
8. Use deterministic project-authored materials and update GLB, `.blend`, manifest/provenance, tests, and contact evidence together.
9. Do not push, merge, deploy, or modify `gh-pages`.

## Acceptance criteria

1. Gameplay contract comparator is unchanged.
2. Six semantic windows, three route landmarks, two buses, four large cover assets, and two furnishing-set markers remain present.
3. Unit/type/provenance/build gates pass.
4. Representative before/after captures cover both home fronts, both interiors, central transit, Verdant, Helio, and a boundary/horizon view.
5. Quality visual telemetry reports no overlapping procedural root, no missing textures, no page/WebGL errors, and bounded draw calls/triangles.
6. Final worktree is clean after one intentional commit and the handoff reports base/head SHA, paths, generated files, evidence, assumptions, unknowns, and shared-code conflicts.

## Out of scope

- Weapon, operator, HUD, game-mode, multiplayer, collision, navigation, spawn, or balance changes.
- Exact recreation of any Call of Duty map or use of proprietary assets.
- Publishing or production promotion.
