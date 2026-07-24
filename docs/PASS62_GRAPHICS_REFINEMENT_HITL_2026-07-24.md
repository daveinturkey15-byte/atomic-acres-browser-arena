# Pass 62 Graphics Refinement — local HITL candidate

Status: local inspection build only. Do not push, merge, publish, deploy, or edit `release-channels.json` from this worktree.

Base source: Pass 61 production source `11f6141a463d0994c2fa22fd0addb55b55c9288a`.

## Runtime changes

- A procedural `RoomEnvironment` is converted once through PMREM and assigned as neutral image-based lighting. Its adaptive budget is multiplied by an arena scale of 0.10-0.24 so it supports reflections without replacing the authored key/fill hierarchy. Compatibility and software renderers skip it.
- Atomic Signal keeps its existing linear half-float scene target and adds a depth texture plus a downsampled selective-bloom target. Only objects placed on the Pass 62 emissive layer can contribute bloom; the composite rejects bloom samples hidden behind nearer world depth.
- Quality adds restrained four-neighbour depth contact shading and reconstructed-world-position low-altitude fog. These are presentation-only and never feed raycasts, collision, movement, hit admission, or networking.
- Every arena has a fitted directional-shadow projection. The shadow target follows the selected arena centre and the projection is refreshed on map changes.
- Ambient, hemisphere and fill levels are reduced per arena while the sun/moon key is strengthened. Atomic and Skyline add two bounded practical spotlights and one focused 256px moving-caster shadow; Rustworks and Gun Range rely on their existing authored industrial, ceiling, neon and armory practicals so dark zones remain intact.
- Skyline's formerly unlit soffits now use a lightly emissive PBR material, so the terminal remains readable while accepting real light, contact shading and shadows.
- PBR materials receive the PMREM response, bounded roughness/metalness handling, profile-capped anisotropy and Quality dithering.
- Pooled impact sparks and marks use deterministic generated soft masks, avoiding square particles and rectangular decals without adding external art.
- Adaptive quality now controls contact shading, selective bloom strength/resolution, depth fog, environment intensity, atmosphere density, decal capacity/lifetime, DPR, and shadows as separate costs.
- Quality GLBs are requested only when Atomic Acres or Rustworks is selected. Shader variants are compiled after a streamed arena is refined, avoiding first-combat material hitches.

## Lighting regression diagnosis

Observation: the first Pass 62 preview layered full-strength neutral PMREM over already-high ambient, hemisphere and fill values. That acted as broad studio fill and removed the deep form shadows visible in Pass 60/61. Startup load could then lower the adaptive DPR below 0.85, which also disabled all Quality shadows even after frame rate recovered.

Correction: image-based light is now subordinate per arena, the direct-key ratio is explicit, and Quality shadows remain enabled throughout the Quality DPR ladder. No map or texture rebuild was required: the compressed assets were intact and the regression was in lighting composition and adaptive shadow policy.

Matched Pass 61/62 captures then exposed a second regression in Rustworks and Gun Range: the generic Pass 62 contrast rig added two long-range spotlights to maps that already had dense authored practical lighting. Rustworks lost the black central-tower silhouette and isolated sodium pools; Gun Range lost separation between its ceiling, neon and armory zones. Those two maps now bypass the generic rig and use PMREM scales of 0.14 and 0.10 respectively. Atomic's accepted lighting is unchanged.

## Asset compression

The checked-in runtime GLBs use lossless WebP textures, Meshopt geometry compression and quantized vertex streams. Semantic nodes and extras remain present, and TypeScript remains the sole collision/ballistic authority.

| Runtime asset | Pass 61 bytes | Pass 62 bytes | Reduction |
|---|---:|---:|---:|
| Atomic Acres Quality GLB | 7,136,084 | 3,503,636 | 50.9% |
| Rustworks Quality GLB | 9,413,732 | 6,584,716 | 30.1% |
| Combined | 16,549,816 | 10,088,352 | 39.0% |

Rebuild the compressed derivatives with `npm run assets:compress:quality`. The pinned compressor validates both outputs before it replaces the runtime files.

## Adaptive effect ladder

Quality starts with an arena-scaled PMREM contribution of 0.10-0.24, contact shading 0.16, selective bloom 0.16 at half resolution, depth fog 0.085, full atmosphere density and full decal lifetime. Sustained overload progressively lowers or removes those effects independently. Performance never enables contact shading and uses at most 0.055 selective bloom at quarter resolution. Compatibility retains the direct, zero-post path.

## Authority and verification boundary

Observation: only renderer, presentation, asset-loading, metadata, tests and compression/provenance paths changed. Core gameplay, physics, collision, ballistics, networking, authoritative shots and lag compensation have no diff.

Inference: profile physics remains identical because both profiles still bind the same `ArenaMap.physicsColliders`, and the existing cross-profile collision test passes.

Assumption: the local NVIDIA/ANGLE driver supports half-float render targets, depth textures, Meshopt and WebP as advertised by WebGL2 and the Three loaders. Automatic fallbacks still protect software/Compatibility paths.

Unknown: human preference for bloom radius, contact shading strength and each arena's fog balance cannot be resolved by automated screenshots alone.

Falsifiers: any profile-dependent movement/shot result; bloom visible through a solid wall; black or missing compressed-GLB material; shader compile error; visible rectangular impact decal; first selection of an arena fetching the other arena's Quality GLB; or a sustained frame regression after the adaptive controller settles.

## HITL route

Use the local preview with Quality first. Inspect Atomic Acres metal, windows and close-contact shading; Rustworks emissives, flag and distant fog; Gun Range neon and white/silver shell; and Skyline terminal materials/atmosphere. Repeat in Performance and confirm geometry/physics stays identical while effects reduce cleanly.
