# HF-410 — viewmodel rework: fit the rig inside the body that carries it

Owner, 2026-09-02 ~16:35 BST, after playing PASS 84 on Firing Range, with two
screenshots: *"gun clipping through walls and floor aswell as holding it up
when near floor or prone or walls is super bad, needs a re work and fix"*.

Lane W. Base: `75a4e508` (the PASS 84 head that shipped at 15:14).

## What was measured, and with what

| file | what it is |
|---|---|
| `body-fit-before.json` | the shipped PASS 84 rig, 60/60 valid rows, 10 weapons x 3 stances x hip/ADS, atomic-acres, installed Chrome, WebGPU, 2560x1440 |
| `body-fit-after.json` | the same 60 rows with the body fit in force |
| `body-fit-fit-disabled.json` | the SAME build with `VIEWMODEL_BODY_FIT_SCALE = 1`, 4 weapons — the A/B that isolates the fit from every other change in the lane |
| `penetration-after-summary.json`, `penetration-after-rows.json` | `scripts/qa/measure-viewmodel-penetration-cdp.mjs --weapons carbine --ratchet`, 327 rows / 303 graded, atomic-acres + test2 |
| `pipeline-compile-after.json` | `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75` |
| `frames/` | headless 1280x720 captures, `fitted-*` against `fit-disabled-*` at the same poses, halved to stay under the evidence size cap |

The BEFORE penetration table is the checked-in ratchet,
`scripts/qa/viewmodel-penetration-ratchet.json`, recorded from the shipped
build by Lane B on 2026-09-02. This run was graded against it and it held.

## The number the lane exists for

`capsuleRadialMaxM` is the horizontal distance from the player's own axis to
the furthest visible viewmodel vertex. `CHARACTER_PHYSICS_CONFIG.playerRadius`
is 0.38 m.

| | worst capsule margin | max forward from eye | min floor clearance | rig entirely clipped away |
|---|---|---|---|---|
| before | **-1.593 m** (carbine, crouch, hip) | 1.795 m | **-0.776 m** | 1.000 of the rig, at bus/van gap |
| after | **+0.123 m** (carbine, stand, ADS) | 0.257 m | **+0.559 m** | 0.000 — the clip planes remove nothing |

Every one of the 60 before rows was negative: the rig lived 1.2–1.6 m outside
the collision body that carries it, so every wall the capsule may stand next to
contained the weapon. Every one of the 60 after rows is positive.

## The finding underneath the owner's second complaint

The A/B (`body-fit-fit-disabled.json` vs `body-fit-after.json`) carries pose
telemetry. On **flat open ground, standing, nothing within reach in any
direction**, the shipped build reports:

    m4a1     stand hip   foldPitchRadians 1.058   (60.6 degrees)
    carbine  stand hip   foldPitchRadians 0.978   (56.0 degrees)

The measured contact fold — the near-vertical high-ready pose in the owner's
first screenshot — was engaged permanently, on open ground, because the rig's
1.8 m reach found geometry inside its own probe envelope wherever the player
stood. "Holding it up" was not a near-wall behaviour; it was the resting pose.

With the fit, `foldPitchRadians` is **0.000 across all 60 rows**, and the
contact-response pitch is capped at 0.05 rad.

## Framing

The fit is a uniform scale about the eye, and a perspective projection is
invariant under exactly that, so the rig's normalised-device bounding box is
recorded per row (`ndcMinX/MaxX/MinY/MaxY`) rather than compared by eye. The
one real framing change is the removal of the permanent 1.0 rad fold above:
the m4a1's top edge moves from NDC y +0.274 (a folded rig filling the frame)
to -0.097, which is the authored hip pose. That change is the owner's request,
and it is the one line in this lane that is his taste to accept.

## The near plane, and the one shared cost this lane spends

`atomicSignal` is hardcoded null in `legacy-main.ts`, so the depth-cleared
first-person overlay does not run on the shipped WebGPU route: the rig is drawn
with the gameplay camera. Fitting the rig inside the body therefore moves it
inside the camera's near plane.

MEASURED (`body-fit-after.json`, field `viewportForwardMinM`): the nearest
ON-SCREEN rig vertex under the fit is 0.0293 m (slug-shotgun, prone, hip). At
the old 0.08 m plane, 42 of the 60 graded poses had WEAPON geometry clipped
inside the viewport — a new visible defect. At 0.02 m, `nearPlaneCutVertices` is
zero on all 60 rows.

The cost is stated rather than hidden: depth resolution scales as 1/near, so
distant precision is 4x coarser — roughly 1 cm at 60 m and 3 cm at 100 m,
against 0.3 cm and 0.8 cm before. No z-fighting was visible in the captured
frames on atomic-acres. A wider long-range sweep across every arena is the
integrator's call, and the durable fix is to give the first-person layer its
own submission again, which is a render-runtime change this lane does not own.

## Frames

| pose | shipped (`fit-disabled-*`) | this lane (`fitted-*`) |
|---|---|---|
| open ground, prone, carbine | the rig held near-vertical, filling the centre of the frame | a compact, flat, low hold |
| wall corner, standing, LMG | the rig folded to the right edge, most of it off-frame | the LMG held normally, in front of the wall, whole |
| open ground, standing | a folded 60-degree high-ready | the authored hip pose |

---

# HF-410 REPAIR PASS (2026-09-02, 19:20-19:45 BST)

A skeptic review of the first pass returned ACCEPT_WITH_FIXES. Two VERIFIED
claims did not survive it and two behaviours were never measured at all. This
section is what the repair measured, on the repaired tree, with the machine
state each run was taken under.

| file | what it is |
|---|---|
| `body-fit-after-repair.json` | the 60 graded rows again on the repaired build, now carrying the 0.08 m COUNTERFACTUAL (`referenceNear*`) and the singularity-free framing box (`drawnNdc*`). installed Chrome, native WebGPU, headless, 2560x1440, atomic-acres, ComfyUI queue empty, 5.3 GB VRAM free |
| `penetration-after-repair-summary.json`, `penetration-after-repair-rows.json` | the penetration sweep re-run on the repaired tree, `--weapons carbine --ratchet`, 327 rows / 303 graded |
| `pipeline-compile-repair-run1..3.json` | three tripwire runs against the 19:16 `dist`, ComfyUI queue empty for all three |

## 1. The near-plane evidence that was missing

The first pass moved the on-foot camera near plane from 0.08 m to 0.02 m and
justified it with "at 0.08 m, 42 of 60 poses had WEAPON geometry clipped inside
the viewport". That number was NOT in the tree: the only two runs with
`cameraNearM` 0.08 predate the `nearPlaneCut*` fields entirely. The instrument
now computes the counterfactual exactly, in the same pass, from the same
vertices - a perspective matrix's x/y mapping does not depend on `near`, so the
vertices a 0.08 m plane discards and where they land on screen are both exact.

MEASURED, `body-fit-after-repair.json`, 60/60 valid rows:

| plane | poses with ON-SCREEN cut | poses with any cut | worst on-screen cut |
|---|---|---|---|
| 0.02 m (in force) | **0 / 60** | 0 / 60 | 0 vertices |
| 0.08 m (counterfactual) | **42 / 60** | 44 / 60 | 2152 vertices |

All 42 include WEAPON meshes, not only sleeve. Worst pose: flamethrower, prone,
hip - 2152 on-screen vertices cut, spanning NDC y -0.596 to +0.401, i.e. through
the middle of the frame, not below it. The original figure was right; it is now
evidence. Nearest ON-SCREEN rig vertex under the fit: 0.0293 m (min) to
0.1296 m (max), against the 0.02 m plane.

The COST is unchanged and still needs an integrator decision: depth resolution
scales as 1/near, so distant precision is 4x coarser (~1 cm at 60 m, ~3 cm at
100 m). The durable fix remains a first-person submission with its own camera
in `src/rendering/render-runtime.ts`, which this lane does not own.

## 2. The gates were graded against a plane that does not exist

`VIEWMODEL_OVERLAY_NEAR_METERS` is 0.002 m and belongs to
`renderSceneOverlayLayer`, which never runs on the shipped WebGPU route
(`atomicSignal` is hardcoded null) - this lane's own finding. The first pass
re-pinned the viewmodel's near-plane telemetry, its contact clip floor, its
aperture raycaster and its contact-fold admission to it. At the anatomy gate's
own prone-contact pose, 17 of 21 weapons reported an arm depth below the 0.02 m
plane really in force and `nearPlaneClear` still passed.

Both halves were wrong. The plane was wrong, and so was the measurement: the
shared `measureCameraFraming` grades the eight corners of a world AABB, and for
a diagonally posed skinned arm that corner is far nearer the eye than any
vertex. Measured on the headless catalog, all 21 weapons, two gate poses:

| | AABB corner | nearest real vertex | nearest real vertex ON SCREEN |
|---|---|---|---|
| m4a1, prone contact | 0.00308 m | 0.00695 m | 0.03492 m |
| mini-uzi, prone contact | 0.00695 m | 0.01151 m | 0.03394 m |
| worst on screen across the catalog | - | - | **0.02462 m** (m4a1, deep squeeze) |

`src/viewmodel-near-plane-framing.ts` now measures bone-deformed vertices and
splits them by whether they project inside the viewport - the same criterion the
browser instrument already used - and grades at
`FIRST_PERSON_CAMERA_NEAR_METERS`. Margin over the real plane: 1.23x on the
headless rig, 1.47x on the shipped GLB rig.

## 3. The fit put every muzzle inside the particle near-lens cull

`PARTICLE_READABILITY.nearCullM` is a hard 0.35 m "not drawn at all, in any
family, at any opacity". Under the fit the muzzle socket sits 0.216-0.376 m from
the eye, so **14 of 21 weapons** emitted HF-371 powder smoke - and the
flamethrower its stream origin - from inside it. Unmeasured and unreported by
the first pass.

`muzzleEffectWorldPosition()` undoes the uniform scale about the eye: same ray
(unit dot 1.000000000 for every weapon, so the same pixel), at the world
distance the socket had on 75a4e508 (1.6617-2.8948 m). `nearCullM` is untouched.
Gated per weapon by `src/viewmodel-muzzle-effect-anchor.test.ts`.

## 4. HF-399 residual (assigned to this lane, absent from the first pass)

Nine full `getObjectByName` subtree traversals per frame for nodes that cannot
change between frames. Cached per mounted model, revalidated by walking the
cached node's parent chain; misses deliberately never cached. Like-for-like
before/after on the same tree (`src/hf399-viewmodel-socket-cache.test.ts`):

| weapon | calls/frame | nodes visited/frame |
|---|---|---|
| carbine | 9.00 -> 2.03 | 1850.0 -> 126.1 |
| lmg | 9.00 -> 2.03 | 2025.0 -> 176.9 |
| sniper | 9.00 -> 3.03 | 2060.0 -> 279.1 |
| pistol | 9.00 -> 2.03 | 1619.0 -> 59.0 |

The other half of that assignment - the `updateWorldMatrix` subtree walks - is
NOT done and is handed back with a diagnosis, not silence: `deepFreezeSubtreeMatrices`
clears `matrixAutoUpdate` but not `matrixWorldAutoUpdate`, and the viewmodel's
own `this.root.updateMatrixWorld(true)` passes `force = true`, which makes three
recurse into every child regardless of either flag. Neither can be changed
safely from inside this lane's file alone.

## 5. Penetration, on the repaired tree

327 rows / 303 graded, carbine, atomic-acres + test2, 12 yaws per sweeping
scenario. stand 0/97, crouch 0/97, belowFloor 0/303, worstClippedFraction 0.
Residual 12 rows, all garage-door prone, worst 0.178 m (was 0.180 m on the first
pass, 0.323 m on the shipped build). Ratchet held, then **tightened**: the file
now records these numbers instead of the PASS 84 floor, so a regression back to
garage-door 0.323 m / 155 belowFloor rows / worstClippedFraction 1.0 fails.

The "unreachable in play" claim about those 12 rows is now derivable from
committed data rather than inferred. The garage-door scenario teleports the
player to x 17.7, z -6.2 (`scripts/qa/measure-viewmodel-penetration-cdp.mjs`
SCENARIOS); the door collider it penetrates measures x [17.660, 18.340],
z [-6.3234, -5.6766] (`worstBox` in the summary). The player's own axis is
inside that box in both dimensions, so the QA teleport places the capsule inside
the door slab - which the teleport allows and the character controller does not.

## 6. Tripwire, three runs, and the machine state

All three against the 19:16 `dist`, ComfyUI queue empty at each launch. The
GATE is "0 in-combat pipeline creations inside a stall", and it is green in all
three; the stall COUNT is reported as measured, unsmoothed.

| run | render pipelines during window | inside a stall | enrichment | stalls | frozen |
|---|---|---|---|---|---|
| 1 | 1 | 0 | 0x | 4 | 0.63% |
| 2 | 1 | 0 | 0x | 53 | 7.64% |
| 3 | 0 | 0 | n/a | 8 | 1.36% |

Run 2 is an outlier and is NOT presented as clean: `nvidia-smi` immediately
afterwards read 13.3 GB used and 99% GPU utilisation with the ComfyUI queue
empty, i.e. another GPU tenant on this shared workstation. The tripwire's own
subject - pipeline creation inside a stall - is 0 in every run regardless.
