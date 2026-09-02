# Nuke Town Rebuild — reference study and build record (HF-407, 2026-09-02)

Lane U, PASS 85. Owner statement 2026-09-02 ~16:10 BST: *"I don't think it's very
true in layout or style to the original nuketown map from black ops 2 … totally
remake the layout and feel to be much more similar in terms of size and how the
buildings and vehicle are … still keeping things like the 2x damage, the rare gun
spawn, the sheds … the bus can probably be made with code instead of blender …
do they even have a bus in nuketown and if not maybe we don't need it? just
mirror what it has and the way the closed/open vehicles work as cover."*

This document is written **before any geometry** and is the authority the build
is measured against. Nothing here is copied: no mesh, no texture, no image, no
font, no LUT, no map file and no prose. Every figure below is either a published
number, or a proportion **derived** by this lane from published descriptions,
and each row carries its claim-state.

---

## 0. The bus question, answered

**The reference has BOTH a bus and a truck.** Published descriptions of the
Black Ops 2 map say the road carries "numerous vehicles that provide additional
cover, such as a school bus and a moving van", and separately that the central
lane is "littered with a school bus, a tractor-trailer, and a couple of cars".
The moving truck is described as "an island of cover in the otherwise open Cul
De Sac", and is identified as a 1950 Peterbilt COE with a WMD grille badge.

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
| R6 | The **garage** is a more secluded area with views on the **cul-de-sac** and the **rear yard**. | VERIFIED |
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
| moving truck ×2 | one in each cul-de-sac, 7.4 m long, cargo box open at the rear | **OPEN** — the cargo box is enterable, the cab is solid | R9 ("island of cover in the … Cul De Sac") |
| parked car ×2 | one on each driveway apron | **CLOSED** — solid body, 1.45 m tall, waist-to-chest cover you cannot enter | R9 ("a couple of cars") |

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

See `artifacts/nuketown2-measurements.json` in the lane worktree and the table in
the lane report. Every row is measured on the arena **as built** by
`buildNuketown2()`, not on the authored constants.

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
