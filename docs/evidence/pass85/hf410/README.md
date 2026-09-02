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
