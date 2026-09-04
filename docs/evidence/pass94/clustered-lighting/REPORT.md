# HF-490 — Nuke Town clustered practical lighting

## Outcome

The Nuke Town presentation now owns a fixed catalog of 30 unshadowed local
`PointLight`s. They are created once during scene boot when the registry switch
is enabled. The existing time-of-day resolver remains the authority for the
selected hour; the rendering hook writes only each light's intensity, using a
monotone dusk fade. The sun remains the only shadow-casting light.

This lane uses Three r185's public `ClusteredLighting` addon. r185.1 contains
the addon and `ClusteredLightsNode`, but the installed renderer source still
constructs the default `Lighting` manager, so the manager is assigned before
`WebGPURenderer.init()` in `render-runtime.ts`. No upstream source is copied or
vendored.

## Catalog

All paired records use the same `(x, y, z) -> (-x, y, -z)` construction as the
arena's `pair()` helper. The source strings point back to the existing body or
layout data that owns the anchor.

| Kind | Count | Palette | Arena source |
| --- | ---: | --- | --- |
| Interior/window | 8 | warm window amber `0xffbd72` | `NUKETOWN2_WINDOWS` openings |
| Porch | 2 | warm porch `0xffa44d` | paired `yard porch` / back doorway |
| Garage | 2 | cool fluorescent `0x9bc7ff` | paired garage tube fixture |
| Street | 4 | sodium orange `0xff813d` | `NUKETOWN2_LAMP_POST_LAYOUT`, paired verge posts |
| Appliance | 4 | cyan/magenta neon | paired kitchen counter and living shelf banks |
| Vehicle | 10 | headlamp white `0xfff0c2` | truck, coach, head car and paired driveway cars |
| **Total** | **30** |  |  |

## Budget and cost model

The configured limits are 48 lights per arena, 24 lights per screen tile,
32-pixel XY tiles, and 24 exponential Z slices. The catalog therefore leaves
18 slots for other visible point lights already owned by an arena. The fixed
catalog is below both the arena limit and the per-tile list capacity; local
lights never enter a shadow map.

The clustered node's work is bounded by the configured grid and list size:

* compute dispatch: `ceil(width / 32) * ceil(height / 32) * 24` cluster work
  items, with reusable light/index buffers;
* fragment lighting: at most 24 point-light evaluations for a populated tile;
* light upload: one bounded position/color data update for the visible light
  list, with no per-frame object or array allocation in this lane;
* pipeline reservation: one clustered update compute pipeline, within the
  Nuke Town budget ceiling of 54. Material families remain the existing scene
  vocabulary and do not gain one graph literal per light.

At 2560x1440 this is 80 x 45 x 24 = 86,400 cluster work items and 86,400 x 48
cluster-build candidate slots before depth/list rejection; the per-fragment loop
is bounded at 24 point-light evaluations. That is a shader
operation estimate, not an FPS or millisecond claim. No GPU measurement was
performed because the owner's GPU is reserved for ComfyUI.

The renderer manager is installed before init and the existing exact
`precompileExactScenePass(scene)` path remains the cold/in-transition reach.
Consequently, a local-light manager is never swapped into a live combat
renderer. The registry uses `pipeline-rebuild`; the existing settings flow
stages a changed value for the next renderer construction. With the switch
off, no Nuke Town point lights are created and the previous global-light path
is unchanged.

## What a night capture must show

The required human capture is a Nuke Town dusk/night view on both rotational
halves, with `late`/golden-hour conditions transitioning toward night:

1. warm interior light is visible through the ground and upper windows;
2. porch doors and both garages have visibly different warm/cool practicals;
3. sodium street lamps read along the verge, including their paired posts;
4. appliance banks provide small cyan/magenta accents without washing out
   sightlines;
5. the truck, coach, head car and driveway vehicles carry visible headlamps;
6. the two halves match in placement, the sun is the only shadow source, and
   no local light toggles or pipeline creation occur during combat.

Capture and GPU timing are intentionally not claimed by this report.

## Claim states

| Claim | State | Evidence or remaining proof |
| --- | --- | --- |
| r185 public clustered addon is available and used before renderer init | **VERIFIED** | Installed `three@0.185.1` source/types; TypeScript and source-order test |
| Catalog has 30 derived, mirrored entries within 48/24 limits | **VERIFIED** | `src/rendering/clustered-lights.test.ts` |
| Dusk fade is monotone and local lights are unshadowed | **VERIFIED** | Unit assertions over the full hour range and rig object graph |
| Registry switch stages a cold renderer choice | **VERIFIED** | Registry, preset normalization, and settings staging tests |
| New clustered work is on the cold exact ScenePass reach | **VERIFIED** | Manager-before-init assertion plus existing exact precompile call |
| Nuke Town pipeline reservation is one and farcrysis source is unchanged | **VERIFIED** | `src/nuketown2-pipeline-budget.test.ts` and farcrysis budget gate |
| Fixed frame time is within the shader estimate | **CLAIMED** | Bounded loop arithmetic above; no GPU timing available |
| Visual night appearance and symmetry in a real capture | **OPEN** | Browser/GPU capture was prohibited for this lane |
| Mandated preflight command is green under this identity | **OPEN** | Contract rejects `Codex` as uppercase and rejects the mandated Claude branch for lowercase `codex`; branch was preserved exactly |
