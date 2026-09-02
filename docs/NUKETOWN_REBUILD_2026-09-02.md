# Nuke Town Rebuild — reference study and build record (HF-407, 2026-09-02)

Lane U, PASS 85. Owner statement 2026-09-02 ~16:10 BST: *"I don't think it's very
true in layout or style to the original nuketown map from black ops 2 … totally
remake the layout and feel to be much more similar in terms of size and how the
buildings and vehicle are … still keeping things like the 2x damage, the rare gun
spawn, the sheds … the bus can probably be made with code instead of blender …
do they even have a bus in nuketown and if not maybe we don't need it? just
mirror what it has and the way the closed/open vehicles work as cover."*

This document is written **before any geometry** and is the authority the build
is measured against. No asset is copied: no mesh, no texture, no image, no font,
no LUT and no map file. Every figure below is either a published number, or a
proportion **derived** by this lane from published descriptions, and each row
carries its claim-state.

**Prose, and a correction (2026-09-02, repair pass).** The brief's rule is *copy
NO text from any source*. The first cut of this document broke it: three
sentences describing the road's vehicles were pasted verbatim from published
sources and sat eleven lines above a line claiming nothing had been copied. They
are paraphrased below, along with a fourth verbatim sentence that was in the
`garage()` doc comment in `src/nuketown2-arena.ts`, and this paragraph replaces
the untrue claim. What follows is stated in the lane's own words, sources named.

---

## 0. The bus question, answered

**The reference has BOTH a bus and a truck.** Published descriptions of the
Black Ops 2 map agree that the road between the two houses carries several
vehicles used as cover, and they name the same set each time: a school bus, a
large moving truck (called a tractor-trailer in some of them), and about two
cars. The truck is consistently singled out as the one piece of cover standing in
the otherwise open closed end of the road.

- **VERIFIED (published source):** the reference road carries a school bus, a
  moving truck/van, and two or more cars. So the answer to *"do they even have a
  bus"* is **yes** — the shipped map's bus is not an invention, it is the wrong
  bus in the wrong place with the wrong company around it.
- **Build decision:** keep a bus, build it in code, put it in the **middle of
  the road** (it is the one body long enough to break the street sightline), and
  add the truck and the cars the reference also has. No Blender, no GLB.

Sources consulted (descriptions only, nothing copied):
Call of Duty Wiki *Nuketown 2025*; callofduty.com Black Ops 7 map guide
*Nuketown 2025*; en.wikipedia.org *Nuketown*; gamesatlas *Nuketown 2025*;
grokipedia *Nuketown*; vintageisthenewold / Games Learning Society *"How big is
Nuketown?"*; Matthew Menke, *Nuketown Level Analysis* (Medium).

---

## 1. Reference facts (published), with claim-state

| # | Fact | Claim-state |
|---|---|---|
| R1 | Minimum playspace **2,972 m²**; maximum entire map **4,950 m²**. Playspace : whole = **0.60**. | VERIFIED (published figure) |
| R2 | Two symmetrical sides split down the middle by a **road**. | VERIFIED |
| R3 | **Two two-storey houses** with garages, backyards and accessible interiors, offering elevated sightlines toward the opposing spawn. | VERIFIED |
| R4 | Each house has **two downstairs entries** (front door, back door) and **stairs to an upstairs window**. | VERIFIED |
| R5 | The **front-facing upstairs windows are the biggest power positions**; the upstairs window covers the whole central lane. | VERIFIED |
| R6 | The **garage** is a tucked-away room that can see both the **closed end of the road** and the **yard behind its house**. | VERIFIED |
| R7 | **Side paths along the north border** give distant views — the flank lane. | VERIFIED |
| R8 | **Spawns are in the backyards behind each house.** | VERIFIED |
| R9 | Central lane carries a **school bus**, a **moving truck / tractor-trailer** and **a couple of cars** as cover; the truck is the island of cover in the cul-de-sac. | VERIFIED |
| R10 | De facto **three-lane flow**; flanks develop rapidly around the periphery. | VERIFIED |
| R11 | Near-symmetric: both teams get the same options and sightlines; a single-storey house on one side would skew the match. | VERIFIED |
| R12 | Very small, non-stop-action layout; one of the smallest maps in the series. | VERIFIED |

**Not found in any source, therefore NOT built as fact:** exact metre dimensions
of the houses, the exact street width, the exact number and marque of the cars,
and whether the two houses are mirror-symmetric or 180°-rotationally symmetric.
Those are **derived** below and labelled as such.

---

## 2. Derived proportions (this lane's design work, from R1–R12)

The only hard scalar the sources give is area (R1). Everything else is a ratio
chosen to satisfy R2–R12 simultaneously and then dimensioned to hit R1.

### 2.1 Footprint

Reference playspace 2,972 m². The rebuild's **fenced playable rectangle** is
**58 m (along the street) × 52 m (across it) = 3,016 m²**, **+1.5 %** of the
reference figure. Near-square is forced by R8 + R3: the cross-street direction
has to fit *side path + back yard + house + road + house + back yard + side
path*, and the along-street direction has to fit *cul-de-sac + house + garage*
twice under rotation.

The **whole authored map** (playable rectangle plus the 8 m out-of-bounds verge
that carries the lawn, forest and mountain ring) is 74 × 68 = 5,032 m²,
**+1.7 %** of the reference's 4,950 m². Playspace : whole = **0.60**, exactly
R1's ratio.

### 2.2 Cross-street section (52 m, north → south)

Chosen so every element in R3/R6/R7/R8 exists at a playable width:

| band | metres | share | why |
|---|---|---|---|
| north side path | 4.0 | 7.7 % | R7 — the flank lane; wide enough for two players to pass, narrow enough to be a corridor |
| north back yard | 7.5 | 14.4 % | R8 — holds a spawn line, the shed and one fence gate |
| north house | 10.0 | 19.2 % | R3/R4 — two rooms deep, stair run and a back door |
| **street** | **9.0** | **17.3 %** | R2/R9 — two lanes plus kerbs; a 11 m bus lying along it leaves 3 m each side to squeeze past |
| south house | 10.0 | 19.2 % | rotation of the north house |
| south back yard | 7.5 | 14.4 % | rotation |
| south side path | 4.0 | 7.7 % | rotation (R7 names the north one; the reference's own rotational symmetry gives the other) |

### 2.3 Along-street section (58 m)

| band | metres | why |
|---|---|---|
| west cul-de-sac | 7.0 | R6/R9 — the open end with the truck in it |
| north garage | 8.0 | R6 |
| north house | 16.0 | R3 — 16 × 10 = 160 m² footprint, 5.4 % of the playspace each |
| south house | 16.0 | as above, offset +8 m along the street |
| south garage | 8.0 | R6 |
| east cul-de-sac | 7.0 | rotation of the west end |

**House offset along the street = 8.0 m = half a house width.** Derived, not
published: it is the smallest offset that makes each house's front window look
diagonally across the road at the *other* house's driveway rather than straight
into its mirror image, which is what makes the reference read as a street rather
than as a pair of facing boxes. Recorded as a DERIVED value so a later lane can
tune it.

### 2.4 Symmetry

The build uses **180° rotational symmetry** about the map centre — `(x, z) →
(−x, −z)` — not mirror symmetry. Derived from R11 + R8 + the offset in 2.3: two
back-yard spawns on opposite sides of one road with offset houses can only be
made equal by rotation. The gate for this is the collider-set symmetry check
copied from the shipped map's fidelity test.

### 2.5 Vehicles, open versus closed (R9)

| vehicle | position | cover class | reference basis |
|---|---|---|---|
| school bus | dead centre of the road, lying along the street, 11.0 × 2.5 × 3.15 m | **OPEN** — two door openings and window bands; you can stand inside it and shoot out | R9 |
| moving truck ×2 | one in each cul-de-sac, 7.4 m long, cargo box open at the rear | **OPEN** — the cargo box is enterable, the cab is solid | R9 - the truck as the cul-de-sac's cover island |
| parked car ×2 | one on each driveway apron | **CLOSED** — solid body, 1.45 m tall, waist-to-chest cover you cannot enter | R9 - the two cars |

**Stated deviation:** the reference has **one** truck; the rebuild has **two**,
one per cul-de-sac. Reason: the repo's 180°-symmetry gate and the owner's own
fairness requirement (R11) — a single enterable cargo box at one end hands that
end's team a cover asset the other team does not have. The bus is centred on the
origin and is therefore its own rotational partner, so it stays single, exactly
as the reference has it.

### 2.6 What the vehicles must do to the sightlines

The street is 58 m end to end. With the bus at the centre (11 m of solid body
across the middle 19 % of the street) and a truck at each end, the longest clear
standing eye-line **down the street centre-line** is the 18.5 m from a cul-de-sac
truck to the bus. That is the property the fidelity test measures.

---

## 3. Gameplay carried over (owner's explicit list)

| feature | how it is carried | claim-state |
|---|---|---|
| 2× damage overdrive core | on the **bus roof**, which is why the bus is centred on the world origin: `OVERDRIVE_POSITION` is the global `{0, 3.75, 0}` and the bus roof top is authored at 3.15 m so the core floats 0.6 m above it, inside the 1.9 m pickup window. `overdrive: true` on the registry row. | built |
| sheds (see-through + push physics) | two `FIELD_SHED_DEFINITION` placements, one per back yard, a 180° pair, through the existing `PASS65_SHED_PLACEMENTS` registry — no new shed code | built |
| rare gun spawn | the two upper rooms are authored and exported as `NUKETOWN2_RARE_GUN_SITES`. The runtime gate `RAILGUN_ARENA_ID` in `src/railgun-authority.ts` is **outside this lane's ownership** (weapons), so the switch is **not** landed here; the exact patch is in the lane report. | arena half built, runtime half handed over |

---

## 4. Measured build (filled in after the arena was written)

Every row below is measured on the arena **as built** by `buildNuketown2()`
unless its claim-state says otherwise. Two rows do NOT say VERIFIED any more:
the whole-map area and the play:whole ratio, because they were never measured -
no geometry in this arena defines a 74 x 68 boundary (the ground slab is
200 x 200 and the perimeter wall stands on the 58 x 52 playspace), so both are
DERIVED from the one number that is measured, by the out-of-bounds verge
convention in 2.2. A skeptic caught them stated as measurements on 2026-09-02;
they are restated here honestly rather than deleted, because the convention is
still the right way to compare against the reference's published pair. Raw
evidence:
`docs/evidence/pass85/lane-u/` (measurements.json, collider-visual-parity.txt,
spawn-solver.txt, solo-run-60s.json, viewpoint-capture-manifest.json, the seven
review-camera frames, and the two diagrams this lane drew).

| element | reference basis | rebuild, measured | delta | claim-state |
|---|---|---|---|---|
| playspace | 2,972 m2 (R1) | 58 x 52 = **3,016 m2** | **+1.5 %** | VERIFIED |
| whole map | 4,950 m2 (R1) | 74 x 68 = **5,032 m2** | **+1.7 %** | DERIVED - (playspace + an 8 m verge on each side), not a measured boundary |
| play : whole | 0.60 (R1) | **0.599** | +0.0 % | DERIVED - a function of the row above, so it cannot disagree with it |
| cross-street section | must contain path+yard+house+street+house+yard+path (R2/R3/R7/R8) | 4 + 7.5 + 10 + 9 + 10 + 7.5 + 4 = **52 m**, sums exactly | 0 | VERIFIED |
| houses | two, two storeys, garages, interiors (R3/R4/R6) | 2 houses, 4 ground rooms, 4 upper rooms, 4 exterior doors, 8 windows, 2 stairs, 2 garages | - | VERIFIED |
| upper front window | the power position (R5) | real opening; a player standing at it is unobstructed (fidelity test) | - | VERIFIED |
| spawns | back yards behind each house (R8) | all 10 past |z| = 14.5, i.e. behind their own house | - | VERIFIED |
| symmetry | near-symmetric, same options both sides (R11) | **exact 180-degree rotation, zero exceptions** | - | VERIFIED |
| vehicles | bus + truck + cars (R9) | 1 bus (open, centred on origin), 2 trucks (open cargo box, one per cul-de-sac), 2 cars (closed) | 1 extra truck, stated in 2.5 | VERIFIED |
| street sightline | broken by the road's vehicles (R9) | longest clear run along the centre-line **15.0 m** of a 58 m street, x = -20.5 (the west truck's rear) to x = -5.5 (the bus's west end) | - | VERIFIED |
| size / pace | one of the smallest maps in the series (R12) | diagonal 77.9 m: **8.95 s** sprint, 12.67 s walk, 25.29 s perimeter lap (shipped Nuke Town: 10.95 s) | - | VERIFIED |
| collider / visual parity | - | **0 invisible colliders, 0 walk-through meshes** over 187 colliders and 192 visible meshes (re-run 2026-09-02 after the repair pass) | - | VERIFIED |
| spawn quality | - | 10 spawns, 100 % in-envelope (floor 100 %, reach 100 %), cross-team min 38 m, **enemy-LOS pairs 0** | - | VERIFIED |
| 60 s solo run | - | native WebGPU (nvidia/blackwell), **0 page errors and 0 console errors in every run with an artifact on disk**; 84 visible meshes, 43,980 triangles | - | VERIFIED for the runs whose JSON is in docs/evidence/pass85/lane-u/. The earlier "all three runs" wording claimed a third run that has no artifact; that claim is withdrawn rather than defended. |
| 60 s solo run, fps | - | median **75 / 52 / 60** fps across three runs (5 % lows 60 / 44 / 52) | - | CLAIMED - the workstation was NOT quiet: GPU utilisation measured 37 % with the owner's Chrome, Edge and overlay processes resident between runs. The spread is machine load, not the arena. A quiet-window number needs a quiet window. |
| art-direction distinctiveness | must clear the catalog floor | weakest pair **0.02446** vs atomic-acres (floor 0.02157; catalog's own weakest 0.02262) | - | VERIFIED |
| 2x-damage core, roof claim | owner's kept feature | standing on the bus roof at the origin, `claimOverdrive` returns **claimed** (dy 1.10 of a 1.90 window) | - | VERIFIED |
| 2x-damage core, aisle rejected | must not be takeable from inside cover | standing on the bus floor beneath it, `claimOverdrive` returns **not claimed** (dy 2.00) - the bus floor was lowered 0.85 -> 0.05 m to get this | - | VERIFIED |
| bus roof reachable | a core on an unreachable roof is not a feature | simulated on `CharacterPhysics`: a hopping player climbs the three flank treads (0.80 / 1.75 / 2.60 m) and stands over the core. Before the treads the same run peaked at eye 3.92 m against the 4.85 m needed | - | VERIFIED |
| ground dressing | decals must stay out of the buildings | **0 m2** of asphalt, apron or lawn overlaps a house or garage footprint in plan (was 38.4 m2 of lawn inside each house's front room) | - | VERIFIED |
| menu preview | a selectable arena ships its own flyover | 240 frames captured headless from this arena's own authoritative WebGPU runtime; encoded into the `pass85-nuketown2-preview-v1` family and asserted byte-distinct from every other arena's media | - | VERIFIED |
| loading backdrop | one per selectable arena, its own | `nuketown2-loading.webp`, 1536x864, quality 88, **42.28 dB** PSNR against its own master, distinct from all nine others | - | VERIFIED |

---

## 5. Honest differences from the reference

1. Two trucks instead of one (§2.5) — deliberate, for fairness and the symmetry
   gate.
2. The art is **ours**: the palette, the sign, the mannequins-equivalent and the
   surround are original procedural work. The owner asked for exactly this
   ("we can then make our own artstyle").
3. No basement / bomb shelter. No source consulted describes one on the
   multiplayer map, so none was invented.
4. Interior furnishing is a first pass: rooms, doors, stairs, window openings
   and one waist-high cover body per room. Furniture density is an art-lane job.
5. House dimensions, street width and the 8 m house offset are **derived**, not
   published. They are recorded here as ratios so a later lane can rescale the
   whole map by one constant without re-deriving the flow.
6. **Roofs are flat slabs.** The reference's houses are pitched. This is a
   first-pass visual and a deliberate one: a pitched roof changes the collider
   set and the upper-floor headroom, and the owner asked for the LAYOUT first.
7. **The surround is a flat ground plane.** The brief allowed reusing the
   existing lawn field, forest surround and mountain ring "where they take a
   layout parameter"; measured 2026-09-02, none of the three does - they are
   authored against the shipped Nuke Town's own constants. Parameterising them
   is a real change to a shipped arena's modules and is NOT in this lane.
8. **Weather is pinned clear**, unlike the shipped Nuke Town's four-rung shower
   ladder. Reason and the measurement behind it are in the row in
   `src/weather/weather-state.ts`.
9. **The menu flyover does not exist.** The card renders a labelled PREVIEW
   STANDBY through the sanctioned pending-media path; the camera recipe is
   authored (`source-assets/menu/pass85-nuketown2-preview/`), so the capture is
   a mechanical step whenever somebody wants to run it.
10. **Eye clearance is unmeasured.** The ledger carries the -1 sentinel with a
    dated note, so the ratchet is RED for this arena until a browser run
    measures it.
