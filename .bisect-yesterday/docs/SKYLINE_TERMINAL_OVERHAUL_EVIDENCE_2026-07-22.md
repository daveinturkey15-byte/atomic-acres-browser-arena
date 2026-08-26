# Skyline Terminal overhaul evidence

**Date:** 2026-07-22  
**Branch:** `agent/skyline-terminal-overhaul-20260722`  
**Base:** `6b0495dae308878bb969916e4f5d80539f90157e`  
**Publication:** local isolated worktree only; no push, merge, deploy, or production publication.

## Result

Skyline Terminal now has an original airport-specific material family, a curved Quality aircraft presentation, a framed boarding door, a 1.56 m cabin aisle, lit jetbridge and cabin routes, open facade-line Aqua spawns, deliberate concourse cover, queue furniture, planters, and modeled service equipment. Collision, shot, and lower-tier placeholder authority is retained.

The broad inspiration is airport-terminal combat pacing and spatial contrast only. No protected map geometry, branding, textures, audio, or extracted assets were used.

## Clearance evidence

| Contract | Before | After | Verification |
| --- | ---: | ---: | --- |
| Cabin seat-edge aisle | 0.80 m | 1.56 m | named `skylineCabinClearance` telemetry and unit assertion >= 1.15 m |
| Physics capsule diameter | 0.76 m | 0.76 m | current `CHARACTER_PHYSICS_CONFIG.playerRadius` is 0.38 m |
| Conservative map probe diameter | 0.88 m | 0.88 m | route/spawn checks use a 0.44 m radius |
| Aisle margin over conservative probe | -0.08 m | +0.68 m | calculated seat-edge clearance |
| Visible aircraft-door aperture | unframed 3.6 m wall gap | 2.68 m framed opening | named jamb/header/leaf/seal/sign assertion |
| Spawns | 6 + 6 | 6 + 6 | all 12 valid at 0.44 m radius |

Rapier-backed traversal passes in both directions for the cabin aisle, jetbridge chain, both vertical-route families, and the fuselage-to-tarmac airstair. Centre and left/right concourse lane samples remain clear at 0.44 m radius. This branch is based before the concurrent prone/collision contribution; the same adaptive clearance and route checks must be rerun after cherry-pick integration.

## Asset inventory and provenance

No new binary files, network downloads, eager loaders, `public/` assets, third-party textures, or cross-map startup loads were added.

All new visual assets are authored at runtime in `src/additional-maps.ts` and carry `assetOwner = "skyline-terminal"` on generated materials or presentation meshes:

- deterministic CanvasTexture surfaces: terrazzo, panel, rubber, fabric, aircraft skin, cargo ribbing, and asphalt;
- curved half-cylinder fuselage shell, ellipsoid nose, extruded tail fin, tapered port/starboard wings;
- chamfered ULD cargo shells, fuel-tank/chassis/wheels/hose cabinet details;
- framed aircraft door, jetbridge panels/lights, concourse seating islands, charging planters, queue posts/belts, coffers, and practical lights.

The Quality profile suppresses only the visual color/depth writes of box placeholders. Their collision, navigation, ballistics, and low-tier fallback authority remains present.

## Controlled performance

`qa:pass33:maps` at 1280x720 with `render=performance`, signal/grass/mist/clouds/rays disabled, seed 3311:

| Map | Baseline calls / triangles | After calls / triangles | Delta |
| --- | ---: | ---: | ---: |
| Atomic Acres | 48 / 107,340 | 48 / 107,340 | unchanged |
| Rustworks | 14 / 25,498 | 14 / 25,498 | unchanged |
| Gun Range | 46 / 7,288 | 46 / 7,288 | unchanged |
| Skyline Terminal | 75 / 5,802 | 104 / 7,214 | +29 / +1,412 |

All maps remain under the existing 147-call and 158,000-triangle smoke thresholds. Each run had exactly one active root, no browser errors, and no WebGL context loss. The unchanged non-Terminal metrics are evidence that the overhaul introduced no eager cross-map presentation load.

## Verification

- `npm run lint` - pass.
- `npm test -- --run` - 82 files, 432 tests passed.
- `npx vitest run src/additional-maps.test.ts src/rustworks-quality.test.ts` - 2 files, 20 tests passed after final ownership/clearance metadata edits.
- `npm run build` - pass; existing >500 kB chunk advisory only.
- `npm run verify:gameplay-contract` - pass.
- `npm run verify:provenance` - pass, 24 digests.
- `npm run qa:asset-provenance` - pass, 106/106 public assets covered.
- `npm run qa:pass33:maps` - pass for all four maps.
- `git diff --check` - pass.
- In-app desktop browser - menu selection/root parity, initial spawn, concourse, framed boarding door, cabin aisle, apron, live 6+6 spawn safety, and context lifecycle inspected; no browser error was observed.

Task artifacts outside the repository contain the before/after PNG captures and `skyline-terminal-browser-diagnostics.json`.

## Shared-file integration notes

- `src/main.ts`: Skyline-only menu camera plus two Skyline debug telemetry fields. This is the likely conflict surface with concurrent renderer/gameplay changes.
- `src/rustworks-quality.ts` and `src/rustworks-quality.test.ts`: Skyline-only lighting tint despite the legacy shared filename.
- `src/additional-maps.ts` and test: map-local geometry, materials, collision layout, spawns, cover, ownership metadata, and routes.
- No loader, asset-manifest, network, audio, worker, CSS, or deployment file changed.

## Remaining assumptions and unknowns

- The branch uses the current 0.38 m physics radius and the stricter 0.44 m map-clearance probe. If the concurrent gameplay contribution changes either radius or stance handling, rerun all Skyline route/spawn/cover tests after integration.
- Quality remains intentionally procedural rather than imported photoreal geometry; this keeps provenance explicit and preserves fast loading, but close-up prop fidelity remains below bespoke Blender assets.
- The controlled performance increase is within project gates, but integrated browser telemetry should be rechecked if shared renderer batching changes land concurrently.
