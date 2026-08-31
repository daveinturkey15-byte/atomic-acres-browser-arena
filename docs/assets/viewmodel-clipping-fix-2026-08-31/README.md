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

---

# Correction, same day: the metric was wrong, so the fix was too

Everything above is retained and still true. It is also the wrong grade.

The criterion above is `dot(muzzleWorld - eye, forward) - distanceToSurface <= 0`. That
closed — worst muzzle penetration went **+1.087 m to -0.041 m** across 68 rows — and the
owner still saw the gun through the wall, because **the muzzle socket is one authored
point and the player sees the silhouette**. The data in `measurements-after.json` said so
at the time: with the surface at 0.400 m the carbine's *magazine* finished at 0.572 m and
its *arms* at 0.791 m.

## The corrected criterion

```
penetration = max(over every VISIBLE viewmodel mesh:
                  furthest-forward VERTEX along cameraForward)
            - distanceToSurface
accept when penetration <= 0
```

Harness: `measure-viewmodel-penetration.mjs`. Data: `measurements-extent-before.json`,
`measurements-extent-after.json`, `summary-full-extent-before-after.json`. Frames:
`extent-after-<arena>-<site>-<weapon>-<stance>.png`, captured at **2560x1440**. The
matching *before* frames are the `after-*.png` files from the run above — that build is
this pass's before.

Three measurement defects were fixed before anything was graded:

1. **Vertices, not bounding-box corners.** The arms are `SkinnedMesh`es, so
   `geometry.boundingBox` is the BIND-POSE box. Open-ground, the sleeve's box corner reads
   **2.93 m** while its furthest real vertex is **1.72 m**. It is not conservative either:
   in the folded wall pose the box corner reads 0.79 m while the real vertices reach
   **0.86 m**, so the old number *under*-reported the failure by 7 cm.
2. **The mounted model's muzzle socket.** `traverse` returns whichever weapon was added to
   the root first, and hidden models keep matrices frozen at load. Every weapon except the
   first one measured was reporting a stale socket. (`probe-extent.mjs` shows it: at the
   wall the stale socket reads `-20.5 m`.)
3. **Frame-loop liveness.** A stalled renderer is silent — `snapshot()` keeps answering
   and the run fills with identical, plausible rows. The harness now blocks on real
   `requestAnimationFrame` ticks and drops the row loudly instead.

## Result, 2 arenas x 5+3 sites x 4 weapons x 3 stances

| | before | after |
|---|---|---|
| rows measured / graded | 96 / **68** | 96 / **68** |
| **rows with VISIBLE geometry past the surface** | **60** | **0** |
| worst penetration | **+0.549 m** | **-0.020 m** |
| worst *weapon-body* penetration | +0.174 m | +0.161 m |
| worst *arms* penetration | +0.549 m | +0.469 m |
| worst muzzle penetration (the old grade) | -0.049 m | -0.030 m |
| open-ground control rows with the fold engaged | 0 | **0** |
| open-ground control root pitch | 0 | **0** |
| dressing boxes the fold can see on atomic-acres | 88 | **88** |

Representative rows, eye 0.40 m off the wall, atomic-acres / flat-wall / stand:

| weapon | surface | muzzle | weaponFwdMax | armsFwdMax | visible | penetration |
|---|---|---|---|---|---|---|
| carbine | 0.400 | 0.351 to 0.342 | 0.571 to 0.561 | 0.861 to 0.853 | 0.861 to **0.380** | +0.461 to **-0.020** |
| sniper | 0.400 | 0.340 to 0.320 | 0.574 to 0.555 | 0.853 to 0.838 | 0.853 to **0.380** | +0.452 to **-0.020** |
| explosive-crossbow | 0.400 | 0.340 to 0.234 | 0.462 to 0.433 | 0.949 to 0.869 | 0.949 to **0.380** | +0.549 to **-0.020** |
| flamethrower | 0.400 | 0.340 to 0.298 | 0.485 to 0.464 | 0.816 to 0.782 | 0.816 to **0.380** | +0.416 to **-0.020** |

`extent-after-atomic-acres-flat-wall-explosive-crossbow-stand.png` is the worst arms case,
hugging the wall with the crossbow.

## What changed, and the honest split between the two halves

**1. The fold solves against the silhouette.** `rigDepthSpan().front` — the forward-most
point of the whole weapon — is the target, not `span.muzzle`. The comment that justified
targeting the muzzle described a whole-rig AABB and stopped being true when `hullYZ`
became a hull of real geometry.

**2. `hullYZ` is built from real vertices.** Per-mesh box corners were the last
authored-ish guess in the measurement path, and they are wrong in both directions: on the
flamethrower a corner sits 8.4 cm in front of any vertex.

**3. When no fold closes it, the solve now finds the LEAST-REACHING fold** instead of
assuming maximum pitch is it.

**4. What still cannot move is CUT at the contacting surface.** The viewmodel root is a
clipping group carrying one camera-facing plane, armed only while in contact.
`ClippingGroup` is exported only from `three/webgpu`, so the flag set is duck-typed rather
than importing a second three entry point into a module that also runs headless;
`Renderer.js` reads exactly those fields.

**This is the honest split, and it is not flattering to (1)-(3).** At the owner's 0.40 m
the fold was *already saturated* before this pass: the retarget moves the carbine's
silhouette from 0.571 m to 0.561 m. **The cut does nearly all the work at contact range.**
It has to, and the reason is arithmetic rather than tuning:

```
forwardReach  >=  nearPlane + depth(fold)
```

because the rearmost rig point may not cross the near plane. At 0.40 m that leaves
**0.23 m** of depth for a chain whose *shoulder entry alone* sits 0.69 m from the eye and
whose sleeve reaches 0.86 m. **The rig physically cannot fold that far.** More pitch makes
the arms worse, not better — measured, the offending vertex at full fold is skinned to
`UpperArmR`, and pitching the root about X swings low-hanging arm geometry *forward*.
Where the fold is not saturated the retarget does earn its keep: at `floor-down`/crouch the
sniper's silhouette goes 1.290 m to 1.191 m.

An **arms tuck** was built and removed on the evidence: pulling the shoulder entry in along
its own projection ray does shorten the chain (sleeve 0.86 m to 0.70 m), but the 2560x1440
frame showed a mint sleeve filling the lower third of the screen. It is not needed either —
the shoulder entry is below the frame by contract, so cutting that end costs nothing.

## The cost of the cut, stated plainly

The cut is placed at `contactDepthMeters`, which is the **minimum over the nine-probe
lattice** — a conservative scalar that can name something off to one side of the rig. A
plane perpendicular to camera-forward at that distance therefore removes more than the
wall itself would.

- **15 of 68 graded rows** cut nearer than 0.25 m.
- **In the tightest of those the weapon disappears entirely** — `atomic-acres/corner/*`
  (cut 0.169-0.204 m against an on-axis surface at 0.400 m) and `test2/flat-wall/*`
  (cut 0.169-0.204 m). See `extent-after-test2-flat-wall-carbine-stand.png`: an empty
  frame. That reads as a full stow, which is a normal shooter behaviour at that range,
  but it *is* more than the on-axis geometry requires.

The fix is one number this pass could not reach: an **on-axis** contact depth (the centre
probe alone) alongside the conservative lattice minimum. The fold should keep using the
minimum; the plane should use the axis value. `resolveViewmodelObstructionPose` can
compute it, but `WeaponPose.surfaceContactDepth` is filled by `src/legacy-main.ts`, which
this pass does not own.

## Two open-control rows to read with care

22 of the 24 open-ground rows match the before run exactly. Two — `test2/open/sniper/prone`
and `test2/open/explosive-crossbow/prone` — report the *standing* numbers in the after run,
because the stance change had not taken effect at the tail of that leg. That is a harness
artefact, not a pose change: `contactFold.engaged` is false and root pitch is exactly 0 in
all 24 open rows, and the fold cannot move a pose it is not engaged in.

## Gate

`src/viewmodel-contact-applied-transform.test.ts` grades on the full extent. Its argument —
assert on the applied transform, never on a reducer — is unchanged; the metric is
corrected. It now also pins the parts that could otherwise be faked:

- the silhouette, measured on real vertices with skinning applied, finishes behind the wall;
- the **fold closes at least 85%** of the distance on its own, so the cut cannot quietly
  become the whole fix;
- the solve is the **minimum of the fold family**, not an endpoint — checked against a
  256-sample sweep;
- the near plane is what binds (`rootZ == nearPlaneLimitZ` exactly), not laziness;
- `forwardReachMeters > muzzleForwardMeters` on the measured carbine bounds, which fails
  immediately if the target ever slips back to the socket;
- the cut is armed **only** in contact, at the surface, with the eye inside the kept
  half-space;
- the open pose is byte-identical: root z, pitch, scale, muzzle and full extent to 9 dp.

`residualMeters` is pinned `<= 0.2 m`, not `<= 0`. Pinning it at zero would be pinning a
physical impossibility, and the only way to pass it would be to weaken something else.

## Reproducing

```bash
npx vite --config docs/assets/viewmodel-clipping-fix-2026-08-31/vite.nohmr.config.ts \
  --host 127.0.0.1 --port 41988 --strictPort

node docs/assets/viewmodel-clipping-fix-2026-08-31/measure-viewmodel-penetration.mjs \
  --url http://127.0.0.1:41988 \
  --out docs/assets/viewmodel-clipping-fix-2026-08-31 --tag extent-after
```

`probe-extent.mjs` prints per-mesh bounding-box reach against true vertex reach — the
measurement defect that made the arms look unfoldable and then unmeasurable.
`probe-arm-joints.mjs` prints the arm chain in camera-forward metres and names the bone
that owns the offending vertex.
