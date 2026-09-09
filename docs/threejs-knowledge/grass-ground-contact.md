# Grass ground-contact tier (thatch + litter under the blades)

For someone building a different level next month. Standing rule HF-481.

## What it is

Grass seen from 1.7 m is a texture problem; grass seen from 0.6 m grazing
along the ground is a **contact** problem. Cheap turf comes apart at the
grazing angle: you see the plate between the blades, roots standing on a flat
lit surface with no occlusion, and the lawn reads as decals on lino. The fix
is a separate instanced tier in the bottom 0–0.08 m **under** the blade
field — splayed near-horizontal thatch (lodged growth/litter) plus flat
procedural litter quads — carrying a vertical occlusion ramp from near-black
at the plate to the plate value at the band top.

Reference frames: a crouch-height meadow (near blades crossing, dark mass
between, silhouettes resolving against bright background) and a moonlit TSL
path (pale tips, near-black bases, black trough where banks meet). Both do
the same thing: per-blade tonal **range**, not blade count.

## The numbers that make it work

Implementation: `src/vegetation/grass-contact-layer.ts` (arena-agnostic —
regions, placement filter, ground-height lookup, eye list in; nothing
spelled per-arena).

- **Band 0–0.08 m.** Constructed top must land in **[0.05, 0.08]**: below
  0.05 is the decals-on-lino failure again; above 0.08 breaks the combat
  readability ceiling (blades cap at 0.22 under the 0.25 art ceiling).
- **Root ratio 0.22 × plate, exponent 1.6** (`grassContactRamp`): the blade
  root sits at 0.55, so the tier steps a full stop darker and puts pixels
  into the shade band. Tip returns to exactly the plate — derive it from the
  tint the caller already passes so tiers can't drift.
- **Patch field, non-negotiable**: low-frequency spatial sin/cos blended
  50/50 with a per-instance hash, shade multiplier 0.45–1.0. A uniform dark
  tier reads as a stain and trips flat-frame gates.
- **Cell 0.36 m thatch / 0.95 m litter**; thatch = 3 strips crossing at 60°
  (6 tris, 0.24 × 0.05 m, one end pinned, one lodged up); litter = one flat
  clipped-corner quad (3 tris, ~1/6 dry pale leaves). ~1 thatch cell in 6
  carries a lodged pale straw strand — same mesh, per-instance tint, no new
  draw call.
- **Smooth distance LOD**: `1 − smoothstep(near, far, distance)`, 6 m → 14 m
  (4 m → 8 m on reduced, cell doubled; tier absent on WebGL2). Instances
  shrink out; the CPU does nothing per frame. Write it in the well-defined
  operand order — WGSL `smoothstep` with edge0 > edge1 is **undefined
  behaviour**, so spell it as one-minus, not `smoothstep(far, near, d)`.
- **One shared TSL material, 1–2 draws, 0 samplers/textures.** A texture
  here risks the silent-arena-rollback device-limit gotcha (arena vanishes
  with no error). No compute pass; no per-frame allocation (a static tier
  needs no time uniform at all).

## The failure mode it avoids

Plate visible at grazing angles + uniformly bright turf (no shade-band
pixels). Measure it headless before/after with
`scripts/qa/estimate-ground-contact-coverage.mjs --arena <id> --eye <m>`:
directional frame fan (yaw window on the lawn, grazing pitches), raycast
against the built instance matrices, pooled plate-visible fraction plus
per-tier occlusion share. **Frame, not surround**: a 360° yaw fan scores
surround density and dilutes every lawn glance with fence/path stares.

## Honest limits (measured 2026-09-09, Nuke Town rebuild lawns)

With a 0.25 m art ceiling, steep fan rays (−20°/−30°) bound the plate under
2 m and only plants within ~1 m can block them — no in-budget tier reaches a
forest-floor occlusion number on a mown lawn. Prone moved 0.706 → 0.554
(movement floor passed), standing held 0.831 → 0.685 (in band, lawn still a
lawn). Calibrate occlusion bands to the ceiling, not to the reference biome.

## Upstream links actually used

- three.js r185 TSL nodes (`three/tsl`: `smoothstep`, `instanceIndex`,
  `positionWorld`, `cameraPosition`) and `MeshStandardNodeMaterial` from
  `three/webgpu` — same graph shape as the repo's blade field.
- WGSL `smoothstep` defined-behaviour requirement (edge0 < edge1) — the
  reason for the one-minus LOD spelling.
- Vegetation skill: `InstancedMesh` + `Matrix4.compose` + mulberry32
  deterministic placement; frame-loop skill: zero per-frame allocation,
  GPU-side LOD; photoreal-forge §6: presentation geometry never derives
  collision, readability caps hold.
