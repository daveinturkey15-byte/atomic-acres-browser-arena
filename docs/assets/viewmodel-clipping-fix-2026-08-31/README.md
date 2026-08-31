# Viewmodel contact fold — measured fix, 2026-08-31

Owner, repeatedly across several passes and again this morning: **"the gun clipping is
still happening everywhere."** Previous fixes went green and did not work.

The number that matters, and the only one this bundle grades on:

```
penetrationM = dot(muzzleWorld - eye, cameraForward) - distanceToSurface
```

Acceptance: `penetrationM <= 0`.

All runs: **installed Chrome** (`channel: 'chrome'`, `--mute-audio`), WebGPU backend
confirmed (`document.documentElement.dataset.renderBackend === 'webgpu'`), arenas
`atomic-acres` and `test2`, weapons carbine / sniper / explosive-crossbow / flamethrower,
stances stand / crouch / prone, bots frozen.

## Result

| | before | after |
|---|---|---|
| graded contact rows | 68 | 68 |
| worst muzzle penetration | **+1.087 m** | **-0.041 m** |
| rows with the muzzle past the surface | 68 | **0** |
| open-ground control (atomic-acres) | muzzle 1.958 m | muzzle 1.958 m — unchanged |
| dressing boxes the fold can see on atomic-acres | 0 | 88 |
| contact path cost, atomic-acres | — | 0.084 ms per full diagnostics call |

The open-ground control is compared against the pre-fix open-space muzzle distance
rather than a paired row: the level open-ground site was added to the harness after the
before-run. The pre-fix figure is `muzzleFwd: 1.957985411076919` for the carbine in
`docs/assets/gun-clipping-2026-08-31/breadth-test2.json`, measured at HEAD during the
diagnosis; the after-run reports 1.958 m, with `contactFold.engaged === false`, root z at
exactly `HIP_VIEWMODEL_POSITION.z - VIEWMODEL_NEAR_PLANE_CLEARANCE` and zero contact
pitch. The open pose is untouched.

Cost: `probe-cost.mjs` times the page's full contact diagnostics call, which does roughly
four sweeps' worth of work (authored fire-gate sweep, plus the pose resolve's authored
sweep, measured-envelope sweep and fold solve). It measured 0.81 ms before an exact
broadphase was added and 0.084 ms after, with 88 dressing boxes live. The broadphase
culls boxes no probe in the lattice can reach and changes no result — the full matrix
re-ran to identical numbers with it in place.

Representative rows, eye 0.40 m from a wall:

| arena | site | weapon | stance | surface | muzzle before | muzzle after | penetration before | penetration after |
|---|---|---|---|---|---|---|---|---|
| atomic-acres | flat-wall | carbine | stand | 0.400 | 1.289 | 0.351 | **+0.889** | **-0.049** |
| atomic-acres | flat-wall | sniper | stand | 0.400 | 1.337 | 0.359 | **+0.937** | **-0.041** |
| atomic-acres | post | crossbow | prone | 0.400 | 1.337 | 0.359 | +0.937 | -0.041 |
| atomic-acres | corner | flamethrower | crouch | 0.400 | 1.334 | 0.350 | +0.934 | -0.050 |
| atomic-acres | floor-down | carbine | prone | 0.805 | 1.319 | 0.594 | +0.514 | -0.210 |
| test2 | flat-wall | carbine | stand | 0.400 | 1.289 | 0.351 | +0.889 | -0.049 |
| test2 | floor-down | sniper | prone | 0.805 | 0.876 | 0.598 | +0.222 | -0.166 |
| atomic-acres | open | carbine | stand | — | 1.958 | 1.958 | n/a | n/a |

Full data: `summary-before-after.json` (72 paired rows; 68 graded, see below),
`measurements-before.json`,
`measurements-after.json`, `measurements-after-standoff-corrected.json`.

Frames: `before-<arena>-<site>-<weapon>-<stance>.png` and `after-…` for every row.
The clearest pair is `*-atomic-acres-floor-down-carbine-prone.png` — before, the carbine
lies half a metre inside the grass; after, it is folded clear of it.

### Four rows are excluded from grading, honestly

`test2 / flat-wall / {carbine, sniper, crossbow, flamethrower} / prone` report
`surfaceDistance = 0.000`: the surface for that site is discovered at standing eye
height, and at prone eye height the eye ends up **inside** that piece of geometry, so a
penetration figure against it is meaningless. The muzzle still moved from 1.289 m to
0.351 m there. `measurements-after-standoff-corrected.json` re-runs test2 with the eye
backed off until each stance genuinely stands 0.40 m off what it is looking at:
**36 rows, 0 with the muzzle past the surface.**

## What was wrong (measured at HEAD c2c184ad)

1. **The applied retreat was capped at 0.28 m while the weapon reached 2 m.**
   `pose.surfaceRetreat` was clamped to `VIEWMODEL_NEAR_PLANE_SAFE_RETREAT`, then the
   per-weapon `authoredNearPlaneContactRetreat` was *subtracted* on top. Measured
   camera-space root travel at full contact: carbine 0.280 m, sniper 0.140 m — the
   longer weapon retreated less. The reducers returned 0.78 / 0.98 at the same instant,
   and every unit test asserted on the reducers.
2. **No parameter inside that design could close the gap.** Even the full uncapped
   0.78 m leaves ~1.01 m of penetration: a rig whose muzzle sits 1.96 m in front of the
   eye needs ~1.6 m of pure translation to clear a wall 0.40 m away, which puts the
   whole weapon behind the camera.
3. **The probe envelope was shorter than the weapon.** `probeLengthMeters` 1.65 m
   (carbine) / 1.95 m (sniper) against measured muzzle distances of 1.958 / 2.157 m.
4. **The lattice probed the wrong volume.** Probes were offset from the EYE, covering
   camera-space X -0.386..+0.386, Y -0.426..+0.396; the rig occupies X +0.198..+0.459,
   Y -0.839..-0.111.
5. **The dressing fold was inert on the owner's main map.** `dressingBoxCount` 0 against
   2746 visible meshes — it was fed only `neighbourhoodLifeRoot` and roots named
   `test1-dressing` / `test2-dressing`, names that exist only in `src/test-maps-art.ts`.

## What was done

Option **(c)**, a hybrid, weighted to (a). See the source comments in
`src/weapon-presentation.ts` for the derivation.

- The rig's bounds and muzzle socket are **measured** off the mounted model once per
  weapon, in the viewmodel root's local frame, and reduced to a convex hull in the
  (y, z) plane — the plane the fold rotates in. One whole-rig AABB is not good enough:
  the carbine's box has a rear-top corner at (y 0.355, z 0.713), the height of the optic
  at the depth of the stock butt, where the weapon has no material at all.
- The contact lattice is re-centred and re-sized onto that envelope and reaches as far
  as the weapon reaches, for the **pose only**.
- The applied transform is **solved**, not authored: find the smallest fold that puts the
  muzzle at or behind the surface, spending fold before retreat, never letting the
  rearmost rig point cross the camera near plane. The 0.28 m clamp is gone.
- `collectPresentationObstructionBoxes` now also walks the arena and art roots, and no
  longer discards batched **source** meshes (batching hides them and draws a merge
  instead, which is why the entire batched art layer was invisible to the fold).

Fire admission and shot authority are untouched by construction: the camera-forward ray
remains the shot authority, `retreat` is still derived from the **authored** probe
profile with byte-identical numbers, and the fold rides in its own channel that
`viewmodelFireAdmissionFromResponse` never reads. There is a unit gate on exactly that.

## Reproducing

```bash
# dev server with HMR off - a concurrent edit in this shared worktree otherwise
# triggers a full reload mid-probe and Playwright reports "Execution context
# was destroyed", which reads exactly like a renderer crash.
npx vite --config docs/assets/viewmodel-clipping-fix-2026-08-31/vite.nohmr.config.ts \
  --host 127.0.0.1 --port 41988 --strictPort

node docs/assets/viewmodel-clipping-fix-2026-08-31/measure-muzzle-contact.mjs \
  --url http://127.0.0.1:41988 \
  --out docs/assets/viewmodel-clipping-fix-2026-08-31 --tag after
```

`probe-bounds.mjs` dumps the per-mesh root-local bounds that the unit gate pins.
`probe-dressing.mjs` reports how much dressing the fold can actually see.

## Gates

`src/viewmodel-contact-applied-transform.test.ts` is the new gate, and it asserts on the
**applied transform** — it builds a real `WeaponPresentation`, drives `update()` to
convergence, and measures the world position of the mounted model's own `muzzle-socket`
relative to the camera. Asserting on the reducers is what let five defects hide.
