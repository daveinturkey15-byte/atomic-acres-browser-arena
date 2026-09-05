# Technique-to-Nuke-Town map (PASS 95, visual-polish-from-skills, HF-509)

Owner (HF-509): "it still doesn't feel like the game has had eight to ten hours
of computer on it ... it still doesn't feel like you're really using the
methods of graphical and asset creation that I've provided with all the skills
you have ... make it a really nice experience."

This map answers the second half of that sentence mechanically: for every
method the skill store and the technique register actually carry, where it
would show at the twelve authored Nuke Town review stations, what it costs
against the three budgets this candidate is fenced by, and which skill or
register row carries it. Sources read for this map (all in the canonical
store `C:/Users/david/AppData/Local/hermes/skills`, the register
`.akephalos/references/ai-3d-technique-register.md`, and the repo's
`docs/threejs-knowledge/`):

| Source | What it carries for this map |
|---|---|
| `game-development/threejs-webgpu-interior-lighting-look` (register row 48) | emissive fixtures above the bloom threshold, value composition, decal grime, mote field, one exposure event; the two fences (bloom threshold only moves up, vignette capped) |
| `game-development/photoreal-procedural-scene-forge` (register rows 7/35, morning-diner method) | wear at three scales in millimetres, albedo carries the wear (10-30% steps), derived exposure, the competitive-FPS inversion of the bound |
| `game-development/open-world-city-art-loop` (register row 47) | where a street look lives, in order of screen area: road surface first, pavement/kerb second, facade bays third, furniture fourth; the flat-overcast trap |
| `game-development/webgpu-tsl-arena-forging` | the NodeMaterial/TSL-only contract, one `ArenaVisualDefinition`, WebGPU proof, no GLSL |
| `game-development/atomic-acres-procedural-art-authoring` | additive, deterministic, presentation-only modules; no per-frame allocation; budget accounting |
| `software-development/threejs-procedural-vegetation` (register row 18) | instanced blades, layered wind, distance LOD |
| `software-development/threejs-frame-loop-audit` (register row 9) | per-frame cost ranking, disposal audit, the "measure, never eyeball" rule |
| `software-development/additive-module-authoring` | build/animate pairs, uniform-only animation |
| `game-development/threejs-rtx-runtime-route`, `procedural-sdf-raymarched-worlds`, `threejs-webgpu-water`, `img2threejs`, `ai-3d-asset-generation-loop`, `comfyui-3d-native-pipeline` | read; none applies inside this candidate's fences without a new pipeline or an imported asset (recorded below as NOT ELIGIBLE) |
| register rows 17 and 22 (Cadle, Revo Realms - comparators only) | quality targets, not techniques: dense ground cover, readable distance, stable frame rate |
| `docs/threejs-knowledge/r185/clustered-lighting-ours.md` | 48-light clustered rig, 30 fixed practicals, one pipeline reservation already on the precompile path |
| `docs/threejs-knowledge/recipes/nuke-event-raymarch.md` | the two-pipeline ceiling idiom for a bounded TSL volume |

## The twelve authored stations

`scripts/qa/viewpoint-catalog.mjs` (`nuketown2`): overhead, north-yard,
south-yard, street-centre, north-upper-window, south-upper-window,
into-sun-street, north-interior, south-interior, garage, north-balcony,
front-porch. Fixed golden hour (`estate-golden-hour`, exposure 1.08,
capture time 63,000 ms).

## Budgets every row is scored against

- **Pipelines**: in-combat creations 0 (tripwire); distinct nuketown2 node
  graphs <= 54 (`NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS`, measured 52 + 2).
- **Cold**: the 10 s cold-admission budgets and the 12 s WebGPU queue fence are
  preserved; this lane's addition must be < 500 ms measured.
- **Frame**: < 1.5 ms at QUALITY, 2560x1440, measured by the perf rung.

## The map

Status legend: SHIPPED = already in the candidate; IMPLEMENTED = this lane;
ELIGIBLE = fits the fences, not taken in this time box; NOT ELIGIBLE = cannot
fit without moving a fence or importing an asset.

| # | Technique | Visible at (of the 12) | Pipelines | Cold | Frame | Carried by | Status |
|---|---|---|---|---|---|---|---|
| 1 | Wear at three scales, albedo-carried (grain / scuff / traffic + soiling) on all 8 material families | all 12 | 0 new (8 family graphs, 52 distinct) | 0 (built at load, LUT-sampled) | in baseline | photoreal-procedural-scene-forge; spec.ts gates | SHIPPED (PASS 94 materials lane) |
| 2 | **Edge weathering**: chips, arrises and splinters within 18-35 mm of every box-face edge, derived per fragment from screen-space derivatives (`edgeWear`), gated per material by the `edgeChip` uniform | kerb nose along the whole street: street-centre, into-sun, overhead, front-porch; blockwork garden walls: north/south-yard, balcony; appliance banks + garage door: front-porch, street-centre, garage; fence pickets: both yards, balcony | **0 new** (term lives inside the concrete, painted-metal and timber shared graphs; `nuketown2-visual-polish.test.ts` asserts the colour node is the same object across chipped and clean roles) | 0 new materials | ~6 derivatives + 2x2 solve on 3 families; measured below | photoreal-procedural-scene-forge ("wear in millimetres, at the corners"); register row 47 (pavement/kerb second) | **IMPLEMENTED** |
| 3 | **Wet asphalt and puddles**: standing water in the kerb channel, wheel ruts and ~5 m relief hollows, hard water line, damp halo; roughness to 0.06 so the existing env/SSR term reflects the sky and the low sun | street-centre, into-sun-street (sun glint), overhead, front-porch, north/south-upper-window (road below) | **0 new** (shared asphalt graph, `asphaltWet` uniform; markings under water get wet too) | 0 | one LUT fetch + ~12 ALU on the road only | open-world-city-art-loop (road surface carries the look); interior-lighting-look ("wet patches read as wet with no reflection at all") | **IMPLEMENTED** |
| 4 | **Lit windows**: per-pane hashed warm emissive on the house panes, fading in from 5 m to 10 m so the interior side stays clear glass; halo bought by the shipped bloom, no light object | street-centre, front-porch, into-sun, overhead, north/south-yard (back windows), both upper-window stations (the opposite house), balcony | **0 new** (one `emissiveNode` on the existing `nuketown2-window-glass` material) | 0 | negligible (one hash + 3 smoothsteps on ~20 panes) | threejs-webgpu-interior-lighting-look (emissive fixtures above threshold, never a second light); register row 48 | **IMPLEMENTED** |
| 5 | Decal grime: tyre scuff, oil, slab cracks, court paint, wall grime (tier -3) | yards, aprons, porch, garage | 0 new (family-per-material, batched) | 0 | in baseline | `nuketown2-grime-decals.ts`; rows 47/48 | SHIPPED (PASS 94) |
| 6 | Emissive ceiling practicals + 30 clustered local lights (windows, porches, garages, street, appliances, vehicles), shadowless, `duskLocalLightFade` | interiors, garage, street at dusk | 1 clustered pipeline, already reserved and precompiled | on the precompile path already | in baseline | `docs/threejs-knowledge/r185/clustered-lighting-ours.md`; interior-lighting-look | SHIPPED |
| 7 | Particle dust motes + drifting seeds + up to 4 light shafts | all exterior stations; shafts into-sun | 0 new (shared particle-field materials) | 0 | in baseline | `particles/particle-catalog.ts` nuketown2 row; interior-lighting-look "sparse mote field" | SHIPPED |
| 8 | Vegetation wind: three-layer sway on hedges and trees, uniform-driven | yards, balcony, overhead, front-porch (hedge) | 0 new | 0 | in baseline | `nuketown2-vegetation.ts`; threejs-procedural-vegetation (row 18) | SHIPPED |
| 9 | Contact hardening / AO: baked-indirect probe add + SSGI at Quality, `damp` foot bands in concrete/timber/siding (analytic contact soiling) | interiors, garage, wall feet everywhere | 0 new | 0 | in baseline | `rendering/lighting/baked-indirect*.ts`, `screen-space-post-profile.ts`; concrete/timber/siding families | SHIPPED (screen-space AO buffer is deliberately discarded by the profile - see screen-space-post-profile.ts header) |
| 10 | SSR / puddle reflections through the existing tier (`reflectNonMetals: true` at the quality tier) | street-centre, into-sun | 0 new | 0 | in baseline (the tier is on already) | `screen-space-post.ts` SSR_STAGE; this lane's row 3 gives it a dielectric mirror to work on | SHIPPED, now exercised by row 3 |
| 11 | Volumetric shafts: godrays through the sun's shadow map, `GODRAY_MAXIMUM_ADDITIVE_GAIN` 0.22 | into-sun-street, overhead | 0 new | 0 | in baseline | `screen-space-post.ts` GODRAYS_STAGE; `blender-lighting.ts` godRayStrength | SHIPPED |
| 12 | Distance fog / aerial perspective (shipped curve 58..148 m, `AERIAL_PERSPECTIVE_STAGE`) | overhead, into-sun, street-centre | 0 | 0 | in baseline | `rendering/arenas/nuketown2.ts`, `rendering/atmosphere/aerial-perspective.ts` | SHIPPED |
| 13 | Colour grade / LUT: CDL + split tone + midtone contrast + vignette per arena | all 12 | 0 | 0 | in baseline | `rendering/art-direction.ts` nuketown2 row (SEARCHED against the distinctiveness metric, 0.02446 over the 0.02157 floor) | SHIPPED; **deliberately not re-tuned** - the row is pinned by an instrument, and re-felting it can only move the weakest pair toward the floor |
| 14 | Emissive night signage | street (the `sign` role) | 0 new (emissive on the painted-metal shared graph, gated by a uniform) | 0 | negligible | interior-lighting-look | ELIGIBLE - the capture time is fixed golden hour and the sign is unlit by day; a night station does not exist in the catalog (OPEN in candidate 7) |
| 15 | One exposure event (moving bright emissive that streaks the motes) | street-centre | 0 new if it reuses the headlight material | 0 | small | interior-lighting-look step 8 | ELIGIBLE - the nuke event already owns this arena's one exposure moment; a second would break the skill's "do not have two" rule |
| 16 | Roof moss / lichen streak bands on the shingle family | overhead, both upper-window stations | 0 new | 0 | negligible | photoreal-procedural-scene-forge | ELIGIBLE, not taken (time box) |
| 17 | Transmission glass windows | upper-window stations | +1-2 graphs and a transmission pass | measured elsewhere as a cold regression (candidate 7 left `transmission-glass-windows` out) | > 1 ms | threejs-webgpu-water / arena-forging | NOT ELIGIBLE inside the cold fence |
| 18 | SH-L2 irradiance volume, TAA resolve, SSR temporal denoise | all | new pipelines | cold regressions measured in candidate 7 | > 1 ms | `sh-l2-irradiance-volume`, `taa-resolve`, `ssr-temporal-denoise` lanes | NOT ELIGIBLE (candidate 7 excluded all three on integration failures) |
| 19 | Native RTX route, in-browser classic ray tracing | all | new renderer | n/a | n/a | threejs-rtx-runtime-route (rows 15/19) | NOT ELIGIBLE; the interior-lighting skill exists partly to show it is not needed |
| 20 | Image-to-3D hero assets (Trellis.2 / Pixal3D), img2threejs likeness models | vehicles, props | asset import | asset decode on the cold path | n/a | comfyui-3d-native-pipeline (row 45), img2threejs (row 6) | NOT ELIGIBLE: this arena declares `assetDependencies: []` and imports no mesh, image, font or LUT by contract |
| 21 | SDF raymarched volumes (beyond the nuke event) | skyline | +1 graph each | prewarm required | 32-48 steps per pixel | procedural-sdf-raymarched-worlds; `docs/threejs-knowledge/recipes/nuke-event-raymarch.md` | NOT ELIGIBLE beyond the shipped event (two-pipeline ceiling already used) |

## Why rows 2, 3 and 4

They are the three highest-screen-area surfaces the register says carry a
street look (row 47: road first, kerb second, facade bays third), they are
visible at every one of the twelve stations between them, and every one of
them is a change to a node graph the candidate already compiles - which is
the only class of change that can promise 0 new pipelines and 0 cold cost
before it is measured. Rows 1, 5-13 are already in the candidate; the
honest finding for HF-509 is that most of the register's methods ARE in
this build, and what the owner was not seeing was the road, the edges and
the windows.
