# Pass 29 — Dawnfield Environment and Reactive Vegetation

Date: 2026-07-18
Status: superseded pre-implementation study; production remains Pass 28

> Superseded by the anchored implementation and acceptance contract in
> `PASS29_EARLY_MORNING_LIVING_GROUND_SPEC_2026-07-18.md`. This file is retained
> only for its measured Pass 28 luminance baseline and early design history.

## Purpose

Pass 29 turns Atomic Acres into a readable early-morning arena: warm low sun, cool open-sky fill, restrained sun shafts, real practical-light coverage, and cosmetic vegetation that responds to wind and the local player. The target is bright dawn readability, not night lighting with raised exposure and not a flattened overcast scene.

Atomic Acres remains an original agritech/civil-defence arena. This pass does not copy protected maps, assets, branding, interface, audio, characters, or other expression from another shooter.

## Frozen authority

Pass 29 may not change:

- arena bounds, house/garage/cover/spawn/patrol layout;
- collision or raycast authority;
- movement, weapons, bots, score, match timing, spawn selection, networking, or replay data;
- Pass 28's scene-linear render target, local ACES operator, single output transfer, encoded-space dithering, software-renderer bypass, or context-restoration validation;
- the top-right FPS safe area;
- `?signal=on`, `?signal=off`, and `?render=compat` escape routes.

Grass, wind, player bending, god rays, pollen/dew and practical-light presentation are cosmetic local render state. None are networked, replayed, collidable, or allowed to block shots.

## Measured pre-pass baseline

Source revision: `18cbe5791a6fd6bef3fe30a3518dbe4e5e66f512`

Deterministic Blender Render captures live under `artifacts/pass29/before/` and are produced by `scripts/qa/capture-pass29-environment.mjs`.

The central gameplay crop excludes the minimap, score bar, weapon HUD and FPS badge.

| View | Mean linear luminance | Median | Pixels below 0.03 | Pixels below 0.08 |
|---|---:|---:|---:|---:|
| central transit west | 0.1440 | 0.0389 | 47.7% | 60.2% |
| Aqua ground front room | 0.0147 | 0.0040 | 79.8% | 99.1% |
| Aqua upper rear room | 0.0058 | 0.0029 | 97.7% | 99.0% |

Current Blender telemetry at the center viewpoint is approximately 32 draw calls and 25,692 triangles. The existing Blender sun-to-hemisphere ratio is `3.25 / 0.90 = 3.61`, streetlamp lenses are emissive-only, and houses have no active practical-light rig.

## Acceptance direction

The exact final thresholds must be validated against representative screenshots rather than optimized blindly, but Pass 29 must meet all of the following:

1. Both house floors retain visible wall, floor, opening and furnishing separation without looking self-luminous.
2. Central asphalt and the unlit sides of lane cover retain texture/material information.
3. Exterior shadows remain visibly directional and warmer than the cool ambient fill.
4. The sky reads as early morning, not night, noon, orange apocalypse, or grey fog.
5. Sun shafts are visible only in suitable sun-facing views and never obscure combat silhouettes.
6. Every authored streetlamp has a glowing fixture; bounded real-light coverage supplements global fill.
7. Every declared house room has a visible ceiling fixture; a capped floor/room light rig prevents black interiors.
8. Grass occupies authored soil/lawn only, never road, sidewalks, house floors, garages, cover footprints, route structures or outside arena bounds.
9. Grass wind is visible while stationary. Nearby blades bend away from the local player and recover after the player leaves.
10. Grass stays below tactical-cover height and never becomes false cover.

## Bounded architecture

### Early-morning foundation

`arenaLightingProfile()` remains the sole profile contract for sky, fog, exposure, hemisphere, ambient, sun and route-light values. Pass 29 will lower sun-to-fill contrast, use a lower warm sun direction, brighten sky/horizon colors and retain one scene-linear lighting path.

No second tone mapper, output encoding, bloom chain, SSAO, SSR, depth of field, motion blur, chromatic aberration or volumetric ray marcher is permitted.

### Practical light rig

A presentation-only rig will create:

- four streetlamp glow fixtures at the existing authored lamp positions;
- capped non-shadowing street practical lights;
- eight ceiling fixture panels matching the two houses × four declared rooms;
- capped non-shadowing interior fill lights, with profile-specific counts/intensities;
- deterministic telemetry for fixture and real-light counts.

Compatibility may retain fixture emission and global fill while omitting expensive local lights.

### God-ray approximation

God rays use one bounded, non-ray-marched presentation mesh or one integration into the existing single Atomic Signal pass. The chosen implementation must add no more than one draw and no unbounded screen-space samples. It must be transparent, depth-safe, subtle, deterministic and disabled in Compatibility.

### Reactive grass

Grass uses one deterministic instanced/custom-shader mesh per enabled profile. Placement is generated once from a fixed seed and authored inclusion/exclusion masks. Per-frame work is limited to updating time, local-player position and optional velocity uniforms; there is no per-blade CPU loop.

The shader operates in scene-linear space and uses the existing fog contract. Wind combines a low-frequency prevailing direction with a small deterministic phase per blade. Player interaction is a smooth bounded radial bend calculated in the vertex shader.

Compatibility uses zero grass. Performance and Blender use explicit instance/triangle budgets established by specialist synthesis and measured QA.

### Additional realism

Only a small coherent set is allowed: restrained dew/specular variation on grass, bounded pollen or dust already compatible with the atmosphere, warmer fixture emissives, and subtle depth variation. Any effect without a measurable role or a clear profile budget is excluded.

## Telemetry and deterministic controls

The debug snapshot will expose a `dawnfield` block containing at least:

- pass identity and profile;
- street fixtures / real street lights;
- interior fixtures / real interior lights;
- god-ray draws / geometry count;
- grass instances, triangles, draw calls, wind time, interaction radius and player influence;
- placement-mask validity and out-of-bounds/exclusion violations;
- total bounded presentation counts.

The capture runner stages the same three pre-pass viewpoints after implementation. Focused tests will validate pure profile data, deterministic placement, exclusion masks, no authoritative-state mutation, shader symbols, scene object counts and Compatibility disablement.

## Performance budgets

Final specialist synthesis must freeze exact numbers, but the hard ceilings are:

- no more than two additional scene draw calls for grass plus god rays;
- no grass CPU iteration during the frame loop;
- no shadow-casting practical lights;
- no more than one player-interaction influence;
- no post-process texture-sample increase unless the chosen ray method is proven cheaper than geometry and remains inside the existing pass;
- preserve the established 60 FPS floor and adaptive pixel-ratio controller;
- preserve direct/software render paths.

## Verification gate

Before owner review:

- TypeScript and all Vitest tests pass;
- gameplay contract and golden replay check pass unchanged except approved rendering profile values;
- production build, release-tree and dependency audit pass;
- focused Pass 29 browser tests pass in Performance, Blender and Compatibility;
- forced Atomic Signal and direct paths remain healthy;
- context loss/restoration remains healthy;
- before/after captures and luminance metrics are recorded from the same viewpoints;
- FPS oracle, multiplayer functional QA and lifecycle QA pass;
- final screenshots receive visual inspection for readability, dawn identity, false cover, clipping, overexposure and banding.

No production promotion occurs in this pass without an owner review decision. Existing `review/*` archives remain protected.
