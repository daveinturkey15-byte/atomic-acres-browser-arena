# Three.js r185 technique recipes

**Scope.** These are study notes from the r185 tagged examples fetched with `gh api`.
They are not vendored source and do not grant permission to copy expression. The project
is pinned to `three` `0.185.1`; the local shared r185 tree was checked for addon/core
symbols. The dated `docs/threejs-knowledge/` recipe/upstream tree requested by the brief was
absent on the base branch, so this directory is the first checked-in knowledge surface.

## Ranked by owner impact per unit cost

| Rank | Technique | Owner impact | Cost/risk | Best first arena | Recommendation |
|---:|---|---|---|---|---|
| 1 | Clustered point lights | Very high at night | Medium | Nuke Town | Do first; fixed-cost house/street lights |
| 2 | Procedural city backdrop | High | Low/medium | Farcrysis | Do second; background-only cells |
| 3 | SSR temporal denoise | High if current SSR is grainy | Medium | Nuke Town | Do third; preserves existing additive SSR |
| 4 | Ground-projected environment | Medium/high | Low | Terminal | Do fourth; skyline horizon polish |
| 5 | Individual skinning instancing | High in visible crowds | High | Farcrysis | Do after rig/perf proof |
| 6 | Procedural building detail | High | Medium | Raid | Do after backdrop; keep authored footprints |
| 7 | Loft geometry | Medium | Low | Nuke Town | Do for kerbs/cables after profiling |
| 8 | Volume fire | High for a few authored moments | High | Nuke Town | Do only as a bounded nuke/fire emitter |

## Explicitly not in the next eight

Compute rasterizer (+ IBL) is a research curiosity with a complete alternative visibility,
depth and shading contract; it is not a sensible arena optimization until a measured
bottleneck proves conventional WebGPU insufficient. Texture gather is a useful primitive,
not a player-visible feature. Furnace is a diagnostic gate, not runtime polish.

## Recommended lane order

1. Prototype clustered lighting against Nuke Town’s fixed authored light catalog.
2. Add the background-only procedural city cell generator for Farcrysis/Raid.
3. Add temporal SSR denoise and compare grain/disocclusion against the existing stage receipt.
4. Add grounded environment sampling to Terminal/Nuke Town.
5. Validate skinning instancing on a small canonical operator crowd.
6. Add building detail, then lofted roads/kerbs/cables where geometry profiling says it pays.
7. Add the nuke/fire volume last, with explicit device-capability and memory gates.

Every lane must use menu-time precompile, uniform/buffer-driven per-instance values,
arena-transition disposal, and a no-pipeline-creation-in-combat tripwire. Runtime work
must preserve Rapier, raycast, spawn, bot and multiplayer authority. The current closest
engine surfaces are `src/rendering/pass64-tsl-scene.ts:125-153`,
`src/rendering/screen-space-post.ts:317-437`, `src/rendering/arena-environment-ibl.ts:89-180`,
`src/graphics-settings-registry.ts:219-331`, and
`src/rendering/render-runtime.ts:1888-1969`.
