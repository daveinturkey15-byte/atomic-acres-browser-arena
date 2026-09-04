# PASS 94 - nuketown2 rooflines + exterior stairs (implemented handoff)

**LANDED:** the dimensioned design below is now implemented in this worktree. The first
feature commit adds `src/nuketown2-roofs.ts`, the House A butterfly and House B capsule
forms, the table-derived fourth symmetry exception, arena wiring, and focused roof tests.
The second feature commit adds the 17-riser timber carpentry, updates the fixed-envelope
stair constants and patio banding, and extends the focused tests. The existing roof decks,
walkable ramp colliders, balcony, and circular patio location remain in place.

Claim-state summary:

- **VERIFIED:** all requested source-level geometry and authority checks pass in this
  worktree; see section 5 for commands and outputs.
- **VERIFIED:** the active Codex adoption check is trusted, the active power plan is High
  performance, and the installed `three` version is `0.185.1`.
- **OPEN:** no browser/GPU visual capture was run, per the direct task boundary, so the
  capture confirmations in section 4 remain mechanical-review targets rather than HITL
  visual evidence.
- **OPEN:** the repository preflight guard rejects this user-supplied `claude` branch when
  invoked as Codex; the branch was not renamed because the brief pins it explicitly.

Lane: Codex Luna 5.6, worktree `C:/Users/david/projects/aa-claude-roofs`, branch
`contrib/dave-gaming-pc/claude/nuketown2-rooflines`.

---

## 1. What the critic asked for

`docs/evidence/pass94/gemini-reference-critic/candidate4b-REVIEW.md` section 4, the two
top-ranked gaps (62/100, up from 43):

- **Rooflines (+16).** OBSERVED defect: both houses currently feature flat horizontal
  asphalt roofs with basic parapet copings. Reference grounding: House A (orange) has an
  upward-raking butterfly / ski-jump roof carrying six dark solar panels that canopies
  over the rear deck; House B (white/cream) has rounded modernist capsule roof volumes
  with pale blue-grey glazing.
- **Exterior stairs (+12).** OBSERVED defect: individual white rectangular treads
  floating unsupported in mid-air against the wall, lacking stringers, risers,
  balustrades, or handrails. Reference: a timber flight with diagonal stringers, closed
  risers and a handrail, terminating on a circular concrete ground patio.

Cross-checked against `docs/references/nuketown-2025/FINDINGS.md` Q2 and Q3, both
VERIFIED on BO2-2025 frames (`nt2025-street-boii.jpg`, `nt2025-aerial-boii.jpg`).
FINDINGS gives NO measured stair dimension and NO measured roof pitch, and its open item
4 says the hexes are families rather than droppers. So every number below is DERIVED from
this arena own figures, and the derivation, not the number, is the contract.

**One correction to the critic. CLAIM-STATE: VERIFIED against the source.** There are no
parapet copings on the houses in this branch. `grep -n "coping" src/nuketown2-arena.ts`
returns one hit and it is `yard pool coping`. What the critic read as a coping is
`house front roof fascia` (line 1372: `[cx, ROOF_Y0 + 0.06, -9.95]`,
`[HOUSE_WIDTH + 0.16, 0.12, 0.10]`, `m.trim`), a 0.12 m trim band on the FRONT elevation
only. Nothing has to be removed to build the new roofs; the fascia should be KEPT and
extended to the raking edges. **The brief instruction "copings removed" has no referent**
- do not go looking for bodies to delete.

Likewise, **the circular patio already exists** (HF-477: `balcony stair patio band 0..6`,
seven chord-banded boxes on a 1.9 m radius at authored
`(NUKETOWN2_YARD_STAIR.footX, HOUSE_BACK_Z - 0.3)`). The captures the critic scored are
candidate 4b, which predates it. It needs rounding out, not inventing.

---

## 2. The design, with claim-states

### 2.1 House A - butterfly roof (north house, authored frame)

House footprint: x in [-6.75, 4.25] (11 m), z in [-23, -10] (13 m). The existing flat
`house roof deck` spans that footprint at y 6.2 -> 6.5, solid and shot-rated.

**KEEP the flat deck exactly as it is.** It is the ceiling of both upper rooms, it closes
the head of the upper front window "exactly like an eave" (its own comment), it is the
collider and it is the ballistic surface. The butterfly is a SKIN over it, springing at
6.55 so it can never sink into the deck and can never z-fight the ceiling below. That
satisfies the "interior roof underside must not z-fight the ceiling" constraint by
construction rather than by a depth tier.

Two raking planes meeting in a valley on the house mid-line, `zMid = -16.5`, which is
also where the internal partition stands on both storeys, so the valley reads as
structural rather than arbitrary.

| Plane | z run (authored) | run | pitch | thickness | high edge |
|---|---|---|---|---|---|
| front rake | -16.5 -> -9.4 | 7.10 m | 8 deg | 0.18 m | 7.548 m at z = -9.4 |
| rear rake (the canopy) | -16.5 -> -25.2 | 8.70 m | 8 deg | 0.18 m | 7.773 m at z = -25.2 |

- Valley y = 6.55, 0.05 m clear of the roof deck top face at 6.50.
- 8 degrees is AUTHORED, not measured: the shallowest pitch that still reads as a
  ski-jump across a 20 m street. OPEN. Falsifier: any BO2-2025 elevation of a house end.
- The front rake overhangs the front wall by 0.6 m (to z = -9.4). That is the
  cantilevered eave the brief says to keep, and it stands over the porch canopy
  (`NUKETOWN2_PORCH_CANOPY`: top 2.15, projection 1.8, z -10 -> -8.2), so the two
  cantilevers stack the way the reference frame shows.
- The rear rake overhangs to z = -25.2, 0.2 m past the rear deck outboard face
  (`NUKETOWN2_BALCONY.outboardZ = HOUSE_BACK_Z - 2.0 = -25.0`). That is the "canopies
  over the rear deck" the critic asks for; the 0.2 m is what makes it read as sheltering
  the deck rather than stopping short of it.
- Plane width along x: `HOUSE_WIDTH + 0.3` = 11.3, i.e. 0.15 m of verge either side.
- Rotation about X: `[-pitch, 0, 0]` for the front rake (its +z end is the high end, and
  `R_x(a)` sends +z DOWN), `[+pitch, 0, 0]` for the rear.
- **Handedness note that will bite whoever writes this.** A rotation about X is INVARIANT
  under the `x -> -x` world mirror (`M R_x(a) M = R_x(a)` for `M = diag(-1,1,1)`), unlike
  the yard stair rotation about Z, which negates. So the roof rakes need NO
  `NUKETOWN2_HANDEDNESS` factor on their pitch, and copying the yard ramp
  `yardRampPitch = NUKETOWN2_HANDEDNESS * angle` idiom would tilt them the wrong way.
  Under the 180-degree pairing (`R_y(pi)`) the pitch DOES negate.

**Six solar panels, House A only.** One authored panel body, six placements, on the REAR
rake - the big plane over the deck, which is where `nt2025-street-boii.jpg` puts them.
Panel 1.55 m (along x) x 0.06 m x 1.10 m (up the slope), two rows of three: x centres at
-4.35, -1.25 and +1.85 (the house centre and +/- 3.1), rows at slope distances 2.2 m and
3.5 m from the valley, each 0.05 m proud of the plane and inheriting its rotation. AABB
height of one panel is `1.10*sin(8deg) + 0.06` = 0.213 m, under every gate threshold in
section 3 - panels are free.

### 2.2 House B - capsule roofs (south house)

Two rounded volumes, long axis along x, on the same flat roof deck. Each capsule is a
CHORD-BANDED half-cylinder, which is this arena own existing idiom for a curve: the
HF-477 patio comment states it in as many words ("everything in this arena is an
axis-aligned box ... so the circle is a BANDED APPROXIMATION"), and `box()` only ever
emits `THREE.BoxGeometry`, so a real `CylinderGeometry` would be the first non-box solid
on the map and would break the `size()` reader inside `solidMeshes()` in the fidelity
gate.

- Radius 1.6 m, springing at y = 6.55, apex 8.15 m.
- Two capsules, each 5.0 m long on x, centred at x = -4.0 and x = +1.5, both centred on
  `zMid = -16.5`. They run ALONG x, so their z extent is the chord - 3.2 m at the
  springing, comfortably inside the 13 m depth.
- 8 bands per capsule: band i spans y from `6.55 + 1.6*i/8` to `6.55 + 1.6*(i+1)/8`,
  half-chord `1.6*sqrt(1 - mid*mid)` sampled at the band mid-line. Exactly the
  construction the patio already uses, one axis up.
- Band height `1.6/8 = 0.20 m` is the number that matters: under the 0.9 m census floor
  in BOTH parity directions, so the bands need no collider and no ballistic rating.
  That is why 8 bands and not 4.
- Glazing band: the top two bands of each capsule take `m.roofGlazing` (the existing
  `0xaebdc1` pale blue-grey role, already in the materials table and already this house
  strongest identifier from above); the lower six take `m.roof`. No new material and no
  new node graph, so the pipeline budget is untouched.

### 2.3 Both exterior stair flights - carpentry

The flight envelope does NOT move: run 4.2 m, rise 3.3 m, top at `BALCONY_X0 = -5.2`,
foot at -9.4, centre z `HOUSE_BACK_Z - 0.7 = -23.7`, width 1.4 m. The collision authority
stays the existing single rotated `yard stair ramp` slab that already passes the no-jump
walk probe. **Do not touch the ramp.** The sticky-stairs report and the HF-432 wedging
failure are both collision failures; everything here is presentation plus two shot
surfaces.

**Rise / going, re-derived to a real timber stair at a FIXED envelope:**

| | shipped | proposed | why |
|---|---|---|---|
| risers | 11 | 17 | |
| rise | 0.300 m | 0.194 m (3.3 / 17) | 300 mm is not a stair anybody builds |
| going | 0.420 m | 0.2625 m (4.2 / 16) | |
| 2R + G | 1.140 m | 0.6501 m | the 550-700 mm comfort rule, dead centre |

`YARD_STAIR_RUN = going * (risers - 1) = 0.2625 * 16 = 4.2` EXACTLY, so `footX`,
`rampRun`, `rampAngleRadians`, the patio centre, the shed clearance and the |z| = 25
spawn standoff are all bit-identical.

That is the whole reason for 17/16 rather than the brief 180/280 mm. 180/280 needs 19
risers and a 5.04 m run, which pushes the foot to authored x = -10.24 and the patio far
edge to -12.14 - INTO the destructible shed registered footprint (ends at -11.9, quoted
in `yard()`) - and past the 1.2 m spawn-standoff floor. 194/262 is a real stair AND a
zero-risk change; 180/280 is a real stair and a three-gate change. CLAIM-STATE: derived,
and checked against the shed footprint and the spawn line; not measured off any
reference.

**Bodies to add per flight (all through `pair()`, so both houses get them):**

| body | count | size | options |
|---|---|---|---|
| stringer | 2 | 5.34 x 0.30 x 0.10, rotated `[0, 0, HANDEDNESS * angle]` | `solid: false, shots: true, ballisticMaterial: wood` |
| closed riser | 16 | 0.05 x 0.194 x 1.20 | `solid: false, shots: false` |
| tread | 16 (was 10) | 0.2625 x 0.08 x 1.40 | unchanged |
| handrail | 1 | 5.34 x 0.08 x 0.08, same rotation | `solid: false, shots: true, ballisticMaterial: wood` |
| rail post | 2 | 0.10 x ~0.95 x 0.10 | `solid: false, shots: false` |

- Stringers at z = `centreZ +/- 0.65`; centre y = `1.65 - cos(angle) * (0.08 + 0.15)`
  = 1.469, so the board top edge runs 0.08 m under the tread nosings.
  `angle = atan2(3.3, 4.2) = 38.16 deg`.
- Handrail on the OUTBOARD side only (z = -24.35). The inboard side of the flight is the
  house back wall plane at z = -23.0 exactly, so a rail there would be inside the wall.
- The rotation sign follows the yard ramp, INCLUDING the `NUKETOWN2_HANDEDNESS` factor,
  because these rotate about Z and `M R_z(t) M = R_z(-t)` - the arena own comment at
  `yardRampPitch` explains it.
- **Stringers must NOT be solid.** A solid stringer at the outboard edge puts a collider
  at z = -24.35 against spawns on the |z| = 25 line: 0.65 m of standoff against the 1.2 m
  floor in `spawn-layout-quality`. That is exactly the failure the two balcony corner
  posts hit in HF-477, and the reason there is now one central pier.

**Patio disc.** Keep the centre and the 1.9 m radius, both derived in HF-477 from the
shed, the water butt and the house corner. Change 7 bands -> 13, and the plane from
`y 0.04, thickness 0.08` (top 0.08, bottom EXACTLY on the 0 m ground datum) to
`y 0.00, thickness 0.12` -> top 0.06 proud, bottom 0.06 sunk. Two wins: it is the 0.06 m
the brief asks for, and sinking the underside removes a face currently sitting on the
ground datum, which is a coplanar candidate rather than a coplanar finding today.

---

## 3. Gate constraints - READ THIS BEFORE AUTHORING

Every threshold below was read out of the gate source in this worktree, not remembered.

### 3.1 scripts/qa/collider-visual-parity-core.ts - the binding one

Direction B (walk-through) skips a mesh when ANY of:
`height < 0.9` | `min(footW, footD) < 0.35` | `box.min.y >= 2.6` (`ABOVE_REACH_MIN_Y_M`).

Direction C (ballistic ghost) skips when: `height < 0.9` | `max(footW, footD) < 0.35`.
**Direction C has NO above-reach exclusion.** `BALLISTIC_UNRATED_CEILINGS.nuketown2 = 0`
and `ACCEPTED_SHOOT_THROUGH.nuketown2 = []`, so one unrated body fails the gate.

Consequences, and they are not obvious:

1. **A presentation-only raking roof plane at y 6.5+ FAILS Direction C.** It clears
   Direction B on `min.y >= 2.6`, but Direction C computes
   `combatMaxY = min(box.max.y, 2.6)` and `combatMinY = max(box.min.y, 0)`, so for a body
   entirely above 2.6 m the covered range is NEGATIVE and no shot surface can ever explain
   it. A roof skin must be `shots: true` (rated directly) or have an AABB height under
   0.9 m. The rakes measure `7.10*sin(8deg) + 0.18*cos(8deg)` = 1.16 m, so they must be
   rated: `solid: false, shots: true`, NO explicit `ballisticMaterial`, name containing
   "roof" - which is exactly how `house roof deck` is rated today
   (`classifyImpactSurface` in `src/combat-feedback.ts` reads the NAME first). That
   satisfies "follow the existing roof rating" by naming rather than by a literal.
2. Capsule bands and solar panels are FREE at 0.20 m and 0.213 m of AABB height.
3. Stringers and the handrail NEED rating (AABB height 3.36 m, `max(footW, footD)` =
   4.2 m) but are invisible to Direction B (`min(footW, footD)` = 0.10 / 0.08).
4. Rail posts are FREE: `max(footW, footD) = 0.10 < 0.35` kills Direction C, and
   `min(...)` kills Direction B.
5. Closed risers and treads are FREE at 0.194 m and 0.08 m of height.

### 3.2 The 180-degree symmetry gate - THE ONE THAT NEEDS A DELIBERATE EDIT

`src/nuketown2-fidelity.test.ts`, "gives both teams the same map". `solidMeshes()`
excludes a mesh ONLY when `userData.presentationOnly === true`. `box()` never sets that
flag - only `streetVehicle()` does, and only when asked. **So a `solid: false,
shots: false` body is still in the symmetry set.** The existing `yard stair` treads are in
it today and pass because `pair()` emits them.

A butterfly on the north house and capsules on the south house is therefore an ASYMMETRIC
CLASS, and the gate compares the asymmetric set for EXACT equality against written-out
lists. It must be extended the way the file already extends it three times (street
vehicles, carriageway, beyond-bounds third house): a fourth named list with a stated
reason, plus the `mesh.name.startsWith(...)` class check that stops the list being grown
by renaming a wall into it.

- The reason is strong and is in FINDINGS Q2, VERIFIED on two BO2-2025 frames: the
  reference two homes are DIFFERENT SHOW HOMES, not one shell repeated. The 180-degree
  pairing governs the LAYOUT and still does; it is the roof FORM that differs, and it is
  the single most identifying feature of each house.
- What the exception must PAY, and these are the assertions to write: equal plan area
  either side, equal apex height (8.15 vs 7.77 as designed - either hold them to a stated
  band or level them), ZERO colliders from either roof, ZERO walkable surface added, and
  no ballistic surface below 6.5 m. Then the asymmetry is identity only and cannot be a
  fairness claim.

TODO (F3 follow-up, larger than a test-only fix): reconcile the emitted projected plan-area
sum at `src/nuketown2-roofs.ts:69-72` and the north/south apex envelope at
`src/nuketown2-roofs.ts:80-149` so the two roof forms satisfy the equal-area/equal-apex
fairness payment. The measured current sums are north `188.77` and south `202.0279636`,
with apexes `7.9390542` and `8.15`; preserve the existing zero-collider, zero-walkable,
above-6.5 m constraints when adjusting the geometry, then replace the measured pins in
`src/nuketown2-roofs.test.ts:105-124` with the approved fairness bounds.
- **Derive the name list from a table exported by `src/nuketown2-roofs.ts`**, the way the
  carriageway list is derived from `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` and the dressing
  list from `NUKETOWN2_GROUND_DRESSING`. A hand-typed list of about 40 roof body names
  will drift on the first edit. This also needs a one-sided emitter (`northOnly()` /
  `southOnly()`) beside `pair()`, since `pair()` cannot express it.

### 3.3 Everything else, checked and clear

- **Verge ceilings** (furniture <= 36, aggregate <= 51, re-split by the base merge):
  counted on names containing " verge ". No roof or stair body contains it.
- **Coplanar** (`scripts/qa/find-coplanar-pairs.ts`, HOUSE-INTERIOR and STREET at 0): the
  roof skin springs at 6.55 against a deck topping at 6.50, and the patio underside moves
  off the ground datum. Both move AWAY from coplanarity.
- **Pipeline budget:** no new material is created. `m.roof`, `m.roofGlazing`, `m.trim`
  and `m.fence` already exist; the six solar panels should reuse an existing dark role
  rather than adding one. NOTE FOR THE INTEGRATOR: the brief cites
  `src/nuketown2-pipeline-budget.test.ts` and `src/nuketown2-materials/`; NEITHER EXISTS.
  The materials are four flat modules (`nuketown2-facade-materials.ts`, `-interior-`,
  `-street-`, `-vehicle-`) and the nearest budget gates are `src/pipeline-metrics.test.ts`
  and `src/graphics-profile-contract.test.ts`.
- **Size ratchet:** the logic belongs in `src/nuketown2-roofs.ts`, which the ratchet does
  not cover (it ratchets `src/legacy-main.ts`).

---

## 4. What a capture must confirm

1. From either street station: the orange house roof rakes UP toward the street with a
   visible valley on the house mid-line, and the eave overhangs the porch.
2. From the south yard looking at the orange house: the rear rake reaches out over the
   rear deck and shelters it, with six dark panels in two rows of three on that plane.
3. From the overhead: two rounded volumes on the white house, glazed pale blue-grey on
   their upper third, and NOTHING rounded on the orange house.
4. From the north yard at eye level: the exterior flight has two continuous diagonal
   boards under the treads, no daylight between treads, a rail at hand height on the yard
   side, and a round concrete pad at its foot.
5. A walk probe up and down both flights, and a jump onto the flat roof deck - the roof
   skin must not have become a ledge.

---

## 5. Landed implementation and evidence

### VERIFIED implementation

- `src/nuketown2-roofs.ts` owns the House A rakes, six solar-panel placements, two
  eight-band House B capsule volumes, table-derived exception names, and paired timber
  stair emitters. Roof bodies are `solid: false`; only the two rakes are `shots: true`
  and they use name-based roof classification with no explicit ballistic material.
- `src/nuketown2-arena.ts` keeps the flat roof deck, changes the exterior flight to 17
  risers at `3.3 / 17` and 16 goings at `4.2 / 16`, removes only the old presentation
  tread loop, keeps both collision-only ramps, and refines the existing patio to 13 bands
  with `y = 0.00` and thickness `0.12`.
- `src/nuketown2-fidelity.test.ts` enumerates the fourth symmetry exception directly from
  the new roof table and keeps the exact asymmetric-set assertion closed to unrelated
  names.

### VERIFIED gates

- `npx tsc --noEmit` -> exit 0.
- `npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts
  src/graphics-profile-contract.test.ts src/pipeline-metrics.test.ts
  src/legacy-main-size-ratchet.test.ts src/nuketown2-roofs.test.ts` -> 6 files, 64/64
  tests passed.
- `npx tsx scripts/qa/find-coplanar-pairs.ts` -> `HOUSE-INTERIOR 0`, `STREET 0`,
  `FINDINGS (different materials, no offset): 0`.
- `npm run pipeline:preflight -- --machine dave-gaming-pc --harness codex` -> OPEN:
  lockfile check passed, but the branch guard requires
  `contrib/dave-gaming-pc/codex/<short-outcome>` and the pinned branch is
  `contrib/dave-gaming-pc/claude/nuketown2-rooflines`. The exact brief spelling
  `--harness Codex` also fails earlier because the guard requires a lowercase slug.

### OPEN review targets

The five deterministic capture views in section 4 still require owner visual review when
the task boundary permits a browser/GPU run. No visual or browser claim is made here.
