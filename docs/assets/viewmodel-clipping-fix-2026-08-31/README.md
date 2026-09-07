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

---

# Third correction, same day: the cut was the right idea placed by the wrong number

Everything above stands. The penetration grade it closed is still closed. What it
also did, and said so plainly in "The cost of the cut, stated plainly", was cut
**15 of 68 rows nearer than 0.25 m**, and in the tightest of those the frame came
back with no weapon in it at all. The owner noticed.

That section proposed the fix as "carry an on-axis contact depth from the centre
probe". The direction was right and the diagnosis underneath it was wrong, so this
pass states the corrected one first.

## What was actually happening

The previous pass wrote that the conservative minimum "can name a surface off to
one side of the rig". Measured at `atomic-acres/corner`, standing 0.400 m off the
west fence at a heading of 2.356 rad, every one of the nine probes named **the same
fence the crosshair was looking at** - `minX -37.6, maxX -37`, the box the ballistic
trace reports at 0.400 m. There was never a second surface.

```
probe        padded hit    box
0/centre       0.000       west fence  (-37.6 .. -37)
-1/centre      0.000       west fence
1/centre       0.000       west fence
...            0.000       west fence   (all nine)
```

The lattice is centred on the RIG, and the rig sits `centreRight = 0.329 m` to the
right of the eye with a half-width of 0.130 m. Facing a wall at 45 degrees, "camera
right" points at that wall: the centre probe stands 0.233 m nearer it than the eye
does and the outermost probe is 0.042 m **inside** it. Their answers - 0.000 to
0.188 m - were correct. A plane perpendicular to camera-forward simply cannot
express them, because the thing they measured is 0.4 m away *at the crosshair* and
0 m away *at the barrel*, and a perpendicular plane has one number for both.

So the defect was never a bad probe. It was a right answer read as the wrong kind
of quantity.

## The corrected rule

> A camera-perpendicular plane may only be placed at the depth where the
> contacting surface **crosses the view axis**.

`cutDepthFromFaceCrossing` in `src/systems/viewmodel-contact-probe.ts` computes it:
take the box FACE the probe entered through (slab entry, exact for an AABB), extend
it to its plane, and intersect that plane with the ray from the eye along camera
forward.

| situation | old cut | new cut | why |
|---|---|---|---|
| wall faced head-on at 0.400 m | 0.400 | 0.400 | unchanged, by construction |
| same wall met at 45 degrees | 0.189 | 0.400 | the crossing, not the barrel's distance |
| wall you are standing BESIDE | ~padding | **none** | it never crosses the axis; `forward . normal` is 0 |
| floor under a down-pitched camera | eyeHeight / -forwardY | same | the same formula with a normal of +Y |

The face plane of that fence crosses the view axis at **0.4000003 m**. The ballistic
trace, which knows nothing about the lattice, reports **0.4000003 m**.

## Why the whole lattice still votes, and why "the centre probe" would have been wrong

The obvious implementation is to take the centre probe alone, or an eye-centred ray.
It passes this matrix perfectly - and it passes it for a bad reason: the harness's
`surfaceDistanceM` **is** the eye-centred ray, so the grade cannot tell the two
designs apart. It would have quietly lost every camera-facing surface that misses
the middle of the rig: a pillar off to your right, a door reveal, a wall you face at
a shallow angle with the barrel already inside it. Those are genuine occluders, a
perpendicular plane represents them well, and the crossing computation keeps them.

## What the split does NOT fix, stated plainly

The fold keeps the conservative lattice minimum, and it should: a surface beside the
rig is a real reason to pull the weapon back, whichever side it is on. But at the
corner the right flank of the carbine is genuinely ~4 cm inside that fence, and a
camera-perpendicular plane at 0.400 m does not remove it. Whether that flank is
then visible through the wall is a question this pass could not close - see the
second defect below, where the same corner turns out to be occluding the whole
weapon by some route that is not this plane.

That is a smaller artefact than deleting the weapon, and it is the honest trade:
**a plane perpendicular to the view axis cannot clip a rig against a wall parallel
to it.** The complete fix is a second clipping plane carrying the surface's own
orientation - `ClippingGroup` takes an array and `clipIntersection = false` already
intersects the kept half-spaces, so the machinery is there. It is not in this pass
because the grade above (`visibleFwdMax <= surfaceDistance`) is itself a
perpendicular-plane model, and an oriented cut can leave geometry that is correct in
the world and fails that number. Re-pinning the grade to admit it is a change that
should be made deliberately, with the owner's eyes on the frames, not folded into a
bug fix.

## Result, one run, 96 rows / 72 graded

`measurements-extent-axis.json`. The "before" column is the previous
placement replayed against the same vertices in the same frame, not a second
browser run - see Harness below.

| | before | after |
|---|---|---|
| rows with VISIBLE geometry past the surface | **0** | **0** |
| worst penetration | -0.001 m | **-0.020 m** |
| graded rows cut nearer than 0.25 m | **16** | **0** |
| rows with an EMPTY frame while the on-axis surface is past 0.30 m | **5** | **0** |
| smallest share of the rig surviving the cut, any graded row | **1.4%** | **34.1%** |
| median share of the rig surviving, over 72 cut rows | 68.8% | **75.5%** |
| open-ground control rows with the fold engaged, atomic-acres | 0 | **0** |

The named cases, all four weapons:

| row | surface | cut before | cut after | rig kept before | rig kept after |
|---|---|---|---|---|---|
| atomic-acres/corner/carbine/stand | 0.400 | 0.169 | **0.380** | 1.4% | **58.1%** |
| atomic-acres/corner/sniper/prone | 0.400 | 0.204 | **0.380** | 8.4% | **49.1%** |
| atomic-acres/corner/flamethrower/prone | 0.400 | 0.175 | **0.380** | 5.5% | **75.3%** |
| test2/flat-wall/carbine/prone | 0.400 | 0.169 | **0.380** | 2.1% | **57.9%** |
| test2/flat-wall/sniper/crouch | 0.400 | 0.204 | **0.380** | 7.3% | **48.9%** |
| test2/flat-wall/flamethrower/prone | 0.400 | 0.175 | **0.380** | 5.5% | **75.5%** |

Frames: `extent-axis-<arena>-<site>-<weapon>-<stance>.png`, 2560x1440. The
matching before frames are the `extent-after-*.png` set.
`extent-after-test2-flat-wall-carbine-stand.png` - the empty frame the previous
pass named - against `extent-axis-test2-flat-wall-carbine-stand.png`, where the
folded carbine fills the lower right and is cut cleanly at the wall.

### The previous run's test2 leg was measuring atomic-acres

Stated because the before/after tables above would otherwise be read wrongly.
In `measurements-extent-after.json` every test2 row reports
`surfaceKind.id = "atomic-acres:219:north fence"` and `dressingBoxCount = 88` -
the arena switch had not taken effect, and that leg graded atomic-acres
geometry under test2 labels. This run's test2 rows report
`Test2 arena:22:test2 boundary west 1` and `dressingBoxCount = 218`. The
counterfactual columns are unaffected (they are the same frame, same vertices,
two plane placements), but the paired PNGs across the two runs are not the same
site for test2, and the row counts differ for the same reason - 68 graded then,
72 now, because test2's prone rows have a real surface this time.

## A SECOND defect at `atomic-acres/corner`, not fixed, isolated

`atomic-acres/corner` is the one named case whose frame is still empty, and the
cut is not why.

Measured after this change: the corner pose is byte-identical to
`atomic-acres/flat-wall` (root z, pitch 1.5, scale 0.528, forward reach 0.560,
plane at 0.380 m), 58% of the rig's vertices are camera-side of the plane, and
2496 of the WEAPON's own vertices project inside the frustum. The flat-wall
frame shows the folded carbine. The corner frame shows nothing, at any
contrast.

`probe-corner-yaw-sweep.mjs` isolates it. From the corner row's own eye
position, sweeping the camera through a full turn:

| yaw | contact depth | cut | weapon vertices on screen | weapon in frame |
|---|---|---|---|---|
| 0.785 | 0.520 | 0.380 | 2496 | **yes** |
| 2.356 | 0.189 | 0.380 | 2496 | **no** |
| 3.142 | 0.189 | none | 4921 | no |

Same position, same plane, same vertex count, 90 degrees apart, and the weapon
comes back. So it is not the fold, not the cut depth and not the plane: at
yaw 2.356 the camera looks into the inside corner and BOTH walls wrap the frame
0.28-0.40 m away - nearer, in the weapon's own screen region, than any part of
the weapon. The reading that fits every frame here is that the viewmodel is
being depth-tested against the world rather than composited over a cleared
depth buffer, and the wall is occluding it exactly as a wall should.

If that is right it is good news and a bigger correction than this pass:
the premise the cut was built on - "the viewmodel draws on a depth-cleared
overlay, so geometry past the wall is painted over it" - would be false on this
route, and the plane would be re-doing work the depth buffer already does. It
would also mean the flat-wall armed/disarmed frames looking identical is not a
failed experiment but the expected result.

It is stated as a reading and not a finding because it is not proven here: two
attempts to disarm the plane from the page (`enabled`, then `isClippingGroup`
and `clippingPlanes`) both left the frame unchanged, and neither can be
distinguished from the plane simply not mattering. Proving it needs a route
that does not go through the live clipping group - drive the viewmodel root
forward into a wall with the plane never armed and watch where it disappears.
That is the next thing to look at, and it should be looked at before any more
work goes into the plane.

## Gate

Six assertions in `src/viewmodel-contact-applied-transform.test.ts`, under
"the cut is placed by what a plane can represent". They pin the split in **both**
directions:

- the 45-degree wall: the fold's depth stays under 0.25 m *and* the cut's is 0.400 m
  - making the fold use the on-axis number fails here, and so does making the cut
  use the conservative one;
- the plane constant is taken from the box face, not from the padded hit point (the
  bug that emptied even the head-on frames while this was being built);
- a wall alongside the view axis folds the pose and places no cut;
- dressing geometry may cut, and still may not reach the fire gate;
- with a conservative depth of 0.189 m and an on-axis depth of 0.400 m, the nearest
  rig vertex is camera-side of the plane - a weapon is on the screen;
- an absent `contactCutDepthMeters` still means "use one depth for both", so every
  gate written before this pass grades the same build it always did.

## Harness

`measure-viewmodel-penetration.mjs` now measures what the previous run had to find
by eye:

- `keptVertexFraction` - the share of the rig's real vertices camera-side of the
  plane. `visibleFwdMaxM` alone reports the plane's own distance whether the cut
  trimmed the weapon back to the wall or removed it entirely.
- `keptVertexFractionConservative` / `clipConservativeM` - the SAME vertices replayed
  against the previous build's placement. This pass changed only where the plane
  goes; the pose is untouched, so that replay is the previous build's frame exactly,
  with none of the variance a second browser run would add. It is why there is one
  run below and not two, and `measurements-extent-after.json` is the check on the
  claim: the pose columns match.
- The window is launched at `--window-position=2560,0`, off the owner's primary
  screen. It was headed with no position before.
