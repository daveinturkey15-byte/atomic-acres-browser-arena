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

## What a capture cannot settle

Neither exhibit has its own lights; both rely on the host rig, so brightness comparisons are only
valid **within one frame**, never between this pass and an earlier one taken under a different rig.
Row 46's colour is computed per vertex on the CPU; at 41×41 it will band slightly under a strong
key, which is a known cost of keeping the term assertable without a GPU and is not a shading bug.
