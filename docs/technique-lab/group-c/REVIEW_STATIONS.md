# Group-C review stations — capture notes for root's serialized visual pass

Written by the owning lane for the lane that owns pixels. Nothing here is a visual claim: every
factory in this group is at **rendered acceptance OPEN**. These are the angles and the exact clock
values at which the two upgraded exhibits are legible, so a capture pass does not have to guess.

Host contract assumed unchanged: the host owns the renderer, camera, resize and loop; every factory
is `createDemo({ THREE, seed })`, synchronous root, `update(time, dt)`, idempotent `dispose`.

## Determinism and the time seed

Both upgraded demos are deterministic functions of the accumulated `dt` sequence, not of wall clock.
Drive them with a **fixed step of 1/60** and capture at a whole number of steps, or two captures of
the "same" moment will differ.

- **Row 46** additionally performs a fixed 120-step (2.0 s) warm-up inside `createDemo`, because its
  foam field is state and an exhibit that opened with an empty field would show nothing. So the
  first rendered frame is already at t = 2.0 s. Capture times below are stated as **steps after
  construction**, i.e. `update(n/60, 1/60)` called n times.
- **Row 36** has no state: `update` only rotates the three pivots at 0.35 rad/s about Y. Any step
  count reproduces exactly.
- `seed` is unused by both of these two rows; they are fully determined by the frozen band table and
  the committed Blender artefact respectively. Pass the group's usual seed anyway.
- **Row 38** reads the `time` argument itself, not accumulated `dt`: the authored curve holds each
  pose for 0.6 s, so the pose on screen is `floor(time / 0.6) % 3`. It rebuilds only on a pose
  change, so a capture taken mid-hold is identical to one taken at the start of that hold. Its
  `seed` **is** used — it is the placement stream, so captures must pass the same seed to compare.

## Row 46 — absorption, backscatter, breaking

Two panels, centre-to-centre 3.0 units on X. Left (`tint-after-absorption`) is the failure mode;
right (`scatter-before-absorption`) is the method. The patch is a 1:20 model of 48 m of surf zone;
the shelf shoals from 0.4 m at −Z to 3.4 m at +Z.

| Station | Camera | Looking at | What must be legible |
|---|---|---|---|
| A. Pair, three-quarter | ~(0, 2.2, 4.2) | origin | Right panel green-shifted and brighter in the deep half; left panel pale grey at the same depth. This is the whole exhibit in one frame. |
| B. Deep end, low | ~(0, 0.55, 2.6) looking −Z | +Z edge | The absorption ramp: red gone first, green surviving. Grazing angle, so the foam streaks read. |
| C. Right panel only, top-down | ~(1.5, 3.4, 0) looking straight down | right panel | Foam as *streaks trailing behind* crests, not a per-frame speckle. Compare with station C at a later step. |
| D. Shallow end | ~(0, 0.9, −2.4) looking +Z | −Z edge | Shallow water should look barely tinted in BOTH panels — the models agree where there is no path length, which is the control. |

**Capture steps: 0, 90, 180, 270** (i.e. 0, 1.5, 3.0, 4.5 s after the warm-up). Station C at steps 0
and 90 is the persistence check: foam present at 0 must still be visible, fainter and displaced, at
90. If it is identical or absent, the field is not decaying — report it, do not re-tune.

**Known and expected, not defects:** displayed height is exaggerated ×3; the lateral displacement is
not, so vertex crowding is true. The surface is visibly choppy because Q is deliberately past the
fold bound. Both panels are the same water and must have identical silhouettes — if they differ,
that is a real bug.

## Row 36 — Blender voxel remesh and normal bake

Three panels at X = −2.75, 0, +2.75: highpoly / lowpoly own normals / lowpoly baked normals. All
three rotate together at 0.35 rad/s.

| Station | Camera | Looking at | What must be legible |
|---|---|---|---|
| A. All three, level | ~(0, 0.6, 7.5) | origin | Left silhouette is finer than the middle and right ones, which must be **identical to each other** — they are the same 924 triangles. |
| B. Middle vs right, close | ~(1.4, 0.5, 3.6) | between middle and right | The only difference: the middle reads faceted, the right reads like the left. If they look the same, the normal attribute is not reaching the material. |
| C. Silhouette against sky | ~(0, 2.6, 3.0) looking down | right panel | The bake must NOT restore silhouette. If the right panel's outline looks smoother than the middle's, something is wrong — a normal bake cannot change an outline. |
| D. Grazing | ~(3.4, 0.15, 3.4) | right panel | Terminator behaviour at glancing light; where a flipped normal would show as a black vertex. Measured flips are zero, so a black speck is a finding. |

**Capture steps: 0 and 135** (0 and 2.25 s ⇒ about 47° of rotation, enough to bring a different face
family forward while keeping the same reading).

## Row 38 — spline-field forest on sculpted terrain

Two panels, centre-to-centre 3.6 units on X. Left (`before`) is uniform scatter with no mask at a
constant Y = 0; right (`after`) is the method. Each panel is a 3 × 3 m patch with about ±0.3 m of
relief. Landmarks, in patch-local coordinates, identical in both panels because they share one
ground geometry: a **stream** running near +Z along `z ≈ 1.0 − 0.35·sin(1.3x)`, carved 0.26 m below
its banks, and a **level glade** centred (0.7, 0.5) with radius 0.55.

| Station | Camera (patch-local, add the panel's ±1.8 X offset) | Looking at | What must be legible |
|---|---|---|---|
| A. Pair, three-quarter | ~(0, 2.6, 4.6) | origin | The whole exhibit: right panel has a forest that follows a visible amber ribbon and leaves the glade and the stream empty; left panel is evenly speckled everywhere, including across both. |
| B. Left panel, low and close | ~(−1.8, 0.35, 2.2) looking +X/−Z | left panel's near slope | The failure being replaced: plants half-buried on high ground and floating over the stream bed, because a constant Y never asked the terrain. `uniformOffGround` counts them. |
| C. Right panel, same height | ~(+1.8, 0.35, 2.2) | right panel's near slope | Every trunk meets the ground; plants on slopes lean with the surface by species — shrubs noticeably, firs barely. |
| D. Stream bank, top-down-ish | ~(+1.8, 1.6, 1.9) looking −Z at the channel | right panel, +Z third | Species zoning: willows **only** on the damp banks, firs absent there, grass tufts running right to the water's edge but not into it. A fir on the bank is a real defect. |
| E. Glade, three-quarter | ~(+2.6, 1.1, 1.6) looking at (0.7, ·, 0.5) | right panel's glade | The mask beating density: on pose 1 the ribbon runs **through** the glade at full density and the glade still holds no trees — only ground cover. |
| F. Floor blend, straight down | ~(±1.8, 3.2, 0) looking straight down, both panels in turn | each floor | The only difference between the two floors: the right one is darker under canopy and warmer/littered around trunks; the left is the same base soil with no scatter written into it. |

**Capture steps (fixed 1/60): 0 → pose 0, 40 → pose 1, 76 → pose 2, 108 → pose 0 again.** Station A
at all four is the control demonstration: the forest, the ground cover and the floor shading must
all move with the ribbon, and step 108 must be pixel-identical to step 0 under the same rig.

**Known and expected, not defects:** the amber ribbon is an authoring overlay drawn with an unlit
basic material — it is meant to look like a tool, not like scenery, and it does not respond to the
host's lights. The floor blend is a 64 × 64 baked map over 3 m (≈ 4.7 cm per texel), so it is soft by
construction; it carries large-scale canopy shading, not micro-detail, and has no normal map. Left
and right panels must have **identical ground silhouettes** — it is one geometry — so a difference
there is a real bug. Ground cover thinning under dense canopy is the rule working, not a hole.

## What a capture cannot settle

No exhibit here has its own lights; all rely on the host rig, so brightness comparisons are only
valid **within one frame**, never between this pass and an earlier one taken under a different rig.
Row 46's colour is computed per vertex on the CPU; at 41×41 it will band slightly under a strong
key, which is a known cost of keeping the term assertable without a GPU and is not a shading bug.
Row 38's blade material is a `MeshPhysicalMaterial` with sheen: sheen is a grazing-angle term, so it
reads only under a key light roughly opposite the camera and will simply be invisible under a flat
fill. If the grass looks matte, the rig is the first thing to check, not the material.

## The visual acceptance that is missing, stated exactly

Every factory in group C is at **rendered acceptance OPEN**, and this lane has never seen a pixel of
any of them. Nothing in this document, in any commit message, or in any metadata field is a visual
claim. What is missing, precisely:

1. **No frame has been rendered** from rows 36, 38 or 46 by this lane — no renderer, no browser, no
   headless capture. Every number quoted anywhere in group C is CPU-computed from geometry, typed
   data or counters.
2. **Nothing has confirmed the materials reach a device.** Vertex colours, `instanceColor`, the
   `DataTexture` floor maps and the sheen term are asserted as scene-graph state only. A capture is
   the first thing that can show they survive compilation on a real WebGPU/WebGL backend.
3. **No draw-call or frame-time measurement exists.** `counters.triangles` (row 38: measured from the
   scene, under 200k for both panels together) and `counters.instancedMeshes` (9) are geometry
   accounting, not GPU cost.
4. **Scale and readability at the host's default camera are unverified.** These stations assume a
   camera can be placed freely; if the lab frames every exhibit identically, row 38's 3 m patch may
   need a different framing than row 36's three panels, and only a capture will show it.

Root owns all four. This lane's request is only that a failure at any station be reported as a
finding against the named assertion above rather than fixed silently.
