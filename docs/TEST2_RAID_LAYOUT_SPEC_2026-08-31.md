# Test2 — layout + playability spec, hillside-mansion three-lane archetype

**Date** 2026-08-31 · **Status** SPEC ONLY — this pass built nothing.
**Owner ask, verbatim (2026-08-31):** *"the map is too small, test 1 and test 2, the new
maps, thats not the layout at all of RAID for example, please focus on test 2 to have the
actual layout and playability of Raid from blops 2?"*

Raw measurement log: `artifacts/test2-raid-research/measurements-2026-08-31.md`.

---

## 0. IP boundary — read this before building

This is a **layout and flow recreation only**. What is recovered here is topology:
how many lanes, what connects to what, where the elevated vantages are, how far apart
the spawns sit, where the centre contest is. Nothing else.

- **No asset of any kind is sourced from the original game.** No geometry, no texture,
  no mesh, no sound, no UI element, no logo, no font.
- **All geometry and all textures must be authored originally by this repo's procedural
  pipeline** (`test2Materials()` / `applyTest2Dressing()` in `src/test-maps-art.ts`),
  exactly as the current build already does.
- **The arena keeps its own name: `test2` / "Test2".** No branded name appears in an id,
  a label, a mesh name, a callout, a comment, a commit message or a doc title. This
  document uses the reference map's name only in prose, to say what was researched.
- The area names in section 2 are **generic descriptions of function** (pool terrace,
  sport court, gallery room, laundry block). Where the reference's own callout word is
  quoted, it is quoted as *research provenance*, never proposed as an in-game string.
- This restates `docs/TEST2_MAP_BRIEF.md` → *Inspiration boundary*: "ALL art is original
  and procedural — no ripped geometry, textures, names, or logos". Nothing in this spec
  relaxes that. If a step in the build cannot be done without copying, that step is cut.

---

## 1. Overall form

### 1.1 What the reference actually is

It is **not** a symmetric rectangle. Measured from the official published tactical map
(2048 px frame, playable region isolated by flood fill from the boundary stroke):

| Measured quantity | Value |
|---|---|
| Playable bounding box | 1500 x 1144 px |
| **Aspect ratio** | **1.311 : 1** |
| **Fill: playable area / bounding box** | **62.4 %** |
| Shape | an irregular blob — a wide west end, a long east garage wing, and a circular drive bulging off one corner |

62 % fill is the single most important number in this section. The current Test2 fills
essentially 100 % of a 76 x 58 rectangle: a walled slab with the fight spread evenly
across it. The reference is a *building footprint*, and roughly two fifths of its
bounding box is simply not map. That is where its corners, its dead ends and its
cover-by-architecture come from.

### 1.2 Three lanes, and what they actually are

The reference is a textbook three-lane map, and the guide sources agree on the same
three routes. Spawns sit at the **two ends of the long axis**; three parallel routes run
between them, and the centre house sits astride the middle one:

| Lane | Route | Character |
|---|---|---|
| **North lane (pool terrace)** | team-0 spawn → sport court → pool deck → covered walk under the upper room → team-1 approach | longest sightline on the map, almost no cover in the middle, one elevated room watching all of it |
| **Centre lane (the house)** | team-0 spawn → living room → **central courtyard** → kitchen/office rooms → team-1 approach | short range, four mouths, the contested heart |
| **South lane (circular drive)** | team-0 spawn → laundry block → **roundabout** → gallery → team-1 approach | medium range, a circular island of cover, two elevated rooms firing across it |

The exit fan from each spawn is the same on both ends, which is what makes it read as
fair despite being geometrically asymmetric: **left to the flank, straight to the house,
right to the other flank.**

### 1.3 Size — why 76 x 58 m is too small, and what it should be

The owner is right, and the reason is measurable.

**Absolute scale of the reference is an inference, and is stated as one.** No official
metre dimensions have ever been published for it; this repo already established that
discipline for Nuketown (`artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md`: *"Exact BO2
metre dimensions were never officially published — none are invented here"*). Four
independent architectural anchors were measured off the tactical map:

| Anchor | Measured | Assumed real | Implied long axis |
|---|---|---|---|
| Pool water length | 440 px | 25 m | 85 m |
| Circular drive outer paving | ~390 px | 22 m | 85 m |
| Fountain island | ~96 px | 5.5 m | 86 m |
| Garage wing long side | 391 px | 24 m | 92 m |

→ **the original's long axis is 85–92 m.** The current Test2 is 76 m: already 10–18 %
short before any other correction.

**Then apply the movement correction.** Our player sprints at **8.7 m/s**
(`src/gameplay.ts` movementProfile, recorded in the Nuketown measurement artefact). The
reference engine's sprint derives as 285 units/s × 0.0254 m/unit ≈ **7.24 m/s** (1 unit
= 1 inch is that engine family's convention — a derived assumption, flagged as such).
Ratio **1.20**. A map rebuilt at the reference's own metres would be crossed 20 % faster
by our player and would therefore feel *smaller than the original does*, which is
precisely the complaint. 85–92 m × 1.20 = **102–110 m**.

### BUILD AT 100 m × 76 m

`TEST2_BOUNDS = { minX: -50, maxX: 50, minZ: -38, maxZ: 38 }`

Three reasons this exact number:

1. **Aspect.** 100 / 76 = 1.316 against the measured 1.311. Within 0.4 %.
2. **Grid.** At 100 m the measured tac-map raster is exactly **1 m per cell**
   (1500 px / 100 m = 15 px = 1 sample column). Every coordinate in sections 2–6 is a
   direct read of the reference at 1 m resolution, not a guess.
3. **Conservative.** It is the bottom of the 102–110 m corrected band, so it buys the
   size increase without gambling the frame budget on the top of it.

**Do not spend the extra metres on empty ground.** Hold the reference's 62 % fill:

| | Current Test2 | Reference proportions at 100 x 76 |
|---|---|---|
| Bounding box | 76 x 58 = 4408 m² | 100 x 76 = 7600 m² |
| Effective play rectangle | 76 x 52 = 3952 m² (villa wings are solid 56 m walls at z = ±26) | — |
| Accessible footprint | ~3550 m² (buildings subtracted; no interiors) | 7600 × 0.624 ≈ **4740 m² ground** |
| Upper floors | **none** | **+ ~700 m² of first-floor rooms** (§5) |
| Total accessible | ~3550 m² | **~5440 m²**, i.e. **+53 %**, and on two levels |

**Comparison with Atomic Acres** (`ARENA_BOUNDS`, `src/arena-layout.ts`): 74 x 60 m =
4440 m² bounding box, measured corner-to-corner walk 130.75 m / 15.03 s, perimeter lap
244 m / 27.36 s. Test2 today is 4408 m² — **the "big estate map" is currently the same
size as the small suburban street map.** That alone explains "too small". At 100 x 76 it
becomes 1.71× Atomic Acres by bounding box and roughly 1.5× by accessible floor, which
is the right relationship between a small map and a medium one.

### 1.4 Traffic flow

- Both teams break out of a **wide spawn apron** into a three-way fan.
- The centre lane is short-range and always contested; the two flanks are long and are
  each dominated by one elevated room per end.
- The map's total circulation is a **ring**: pool lane → east approach → drive lane →
  west approach → pool lane. A player can lap the map without crossing the house. That
  ring is what keeps spawns stable (§4.3): a flank push does not immediately flip the
  enemy behind you, because the ring keeps pressure directional.

---

## 2. Callout-by-callout inventory

Arena coordinate system: **x right, z forward, origin at map centre**, bounds ±50 / ±38.
Team 0 holds −x, team 1 holds +x. The long axis is X.
"Elev" is the floor height of the area in metres above grade.

Positions marked **(M)** are measured directly off the reference's published objective
overlays (see the measurement artefact). Everything else is read off the tactical-map
raster at 1 m resolution and carries roughly ±2 m.

### The two ends

| # | Area | Where | Elev | What it is / cover |
|---|---|---|---|---|
| E1 | **West spawn apron** (the reference's unpaved "garden" end) | x −50…−40, z −9…+3 | 0 | Team 0. Open unpaved apron pushed out past the general boundary — the map's deepest west point. Cover: two low garden walls (0.70 m, mountable), one planter run. Three marked exits: NW to the sport-court steps, E to the living room, SE to the laundry. |
| E2 | **East spawn / garage wing** | x +36…+50, z −14…+11 | 0 | Team 1. A long covered garage block, 12 × 24 m **(M)**, open along its west face. Cover: bay piers every 4 m (hard, 1.9 m+), one 0.70 m kerb line. Three exits mirroring E1: NW to the covered walk and pool, W to the kitchen rooms, SW to the gallery. |

### North lane — the pool terrace

| # | Area | Where | Elev | What it is / cover |
|---|---|---|---|---|
| N1 | **Sport court** | x −37…−19, z −33…−21 | −0.35 (sunken one step) | 18 × 12 m hard court — the reference's basketball point. Deliberately **bare**: this is the map's "cross it and pray" pocket. Cover only at its corners: two 0.70 m kerb walls, one 1.9 m equipment box. Objective zone measured 16.2 × 20.8 m **(M)**. |
| N2 | **Court steps** | x −20…−17, z −26…−20 | 0 → −0.35 | Two 0.35 m risers linking the court to the pool deck and to E1. The reference's "top of the stairs" flag anchor sits here. |
| N3 | **Pool** | water x −14…+16, z −35…−25 | −0.55 basin floor, 0.30 coping | 30 × 10 m water. Presentation-only water sheet over a **solid basin slab** — keep the current exception exactly as authored. Two exit-step pairs, SW and NE corners. |
| N4 | **Pool deck** | x −18…+20, z −25…−21 | 0 | The walk between the pool and the house's north face. Cover: a **long planter box** run (0.70 m, mountable, doubles as the ledge route's screen in §3.3), four loungers (presentation), two 1.9 m cabana piers. |
| N5 | **Hot tub / bar pavilion** | x −13…−5, z −33…−25 | 0, roof 3.4 | Small round-plan pavilion at the pool's west end. Enclosed, one 2 m mouth, hard cover at 1.9 m. Roof **not** reachable. |
| N6 | **Covered walk (under the upper room)** | x +16…+28, z −26…−20 | 0, soffit 3.2 | Colonnaded ground floor beneath U1. Six piers, 1.9 m+ hard cover. The pool lane's only broken ground. |
| N7 | **North-east wing** | x +16…+28, z −32…−20 | 0, first floor +3.4 | Two-storey mass closing the pool lane's east end. Ground: two rooms, one glazed. Above: **U1**. |

### Centre lane — the house

| # | Area | Where | Elev | What it is / cover |
|---|---|---|---|---|
| C1 | **Living room** | x −24…−8, z −6…+4 | 0, ceiling 3.0 | 15 × 12 m room **(M)**, team-0 side of the courtyard. Three mouths: W to E1, E to the courtyard, N to the house spine. Cover: a sofa run and a 1.9 m chimney breast. Vantage window on its east wall onto the drive lane. |
| C2 | **Central courtyard** | x −6…+10, z −6…+4 | 0 (open to sky) | **The heart.** 15 × 9 m **(M)**, enclosed on four sides, **four mouths** — north to the pool lane, south to the drive lane, west to C1, east to C3. Cover: four colonnade piers on a 4 m grid (hard, full height) and one 0.70 m fountain kerb at centre. Everything short-range. |
| C3 | **Kitchen / office rooms** | x +10…+28, z −6…+4 | 0, ceiling 3.0 | Team-1 side of the courtyard: two connected rooms. The office has a **window onto the pool lane** — the lane change the reference's own official tips call out. Cover: counter runs (1.9 m), one 0.70 m island. |
| C4 | **North house band** | x −24…+28, z −20…−6 | 0, first floor +3.4 | The mansion's north range. Ground floor is the corridor spine connecting C1↔C2↔C3 and feeding the pool lane through two door mouths. Above its west half: **U2**. |

### South lane — the circular drive

| # | Area | Where | Elev | What it is / cover |
|---|---|---|---|---|
| S1 | **Laundry block** | x −26…−5, z +5…+16 | 0, first floor +3.4 | Team-0 side service building. Ground: two rooms plus a passage from E1. Above: **U3** with a balcony over the drive. |
| S2 | **Circular drive** | x −5…+9, z +17…+31 | 0 | Objective zone measured 13.6 × 13.6 m **(M)**; the paved circle is ~22 m outer diameter. The map's second contest point. |
| S3 | **Drive island** | x −4…+8, z +21…+29 | kerb +0.30, fountain rim +0.70 | Statue/fountain island. Cover: the 0.30 m kerb, a ring of six 1.9 m planters, the fountain plinth at 1.9 m. The only cover in the middle of that lane; it **must** be circumnavigable. |
| S4 | **Gallery** | x +12…+28, z +4…+12 | 0, first floor +3.4 | Team-1 side room, opens both to C3 and to the drive. Ground: a display hall with one central sculpture (1.9 m hard cover). Above: **U4**. |
| S5 | **Drive approach** | x −18…+14, z +31…+38 | 0, falls away | The paving wedge south of the circle. Playable, low cover only (two 0.70 m kerbs); its far edge is the map boundary and should read as a hillside drop, not a wall. |

### Elevated rooms

| # | Area | Where | Floor | Overlooks |
|---|---|---|---|---|
| U1 | **Upper bedroom** | x +18…+28, z −31…−22 | +3.4 | The whole pool lane, west to the sport court. The reference's single most-cited power position. |
| U2 | **Upper landing / walkway** | x −20…−4, z −19…−12 | +3.4 | The pool deck through two window slots; connects toward U1 and down into the house. |
| U3 | **Laundry upper + balcony** | x −22…−8, z +7…+15 | +3.4, rail 1.05 | The circular drive from the team-0 side, and the west approach to it. |
| U4 | **Gallery upper** | x +14…+26, z +5…+12 | +3.4 | The circular drive from the team-1 side, and the passage from the courtyard. |

### Objective anchors (measured)

| Zone | Reference measurement | **Build at (symmetrised)** | Note |
|---|---|---|---|
| A | (−34.6, −0.1) **(M)** | **(−34, −0.5)** | west end, between E1 and the court steps |
| B | (+2.1, +13.8) **(M)** | **(0, +14)** | mouth of the drive lane, west of the circle — *not* at the map centre |
| C | (+33.1, −0.9) **(M)** | **(+34, −0.5)** | on the drive in front of the garage wing |

Hardpoint-equivalent rotation, all measured: sport court (−28.9, −22.9), living room
(−15.2, −1.6), courtyard (+2.1, −0.5), circular drive (+2.1, +24.0), garage (+44.4, −1.5).
A ready-made five-site rotation if that mode ever lands.

---

## 3. Lanes and sightlines

### 3.1 Connectivity graph

```
                    N1 sport court ── N2 steps ── N3/N4 pool ── N6 covered walk ── N7 wing
                          │                            │                              │
   E1 west spawn ─────────┼──── C1 living ── C2 COURTYARD ── C3 kitchen/office ───────┼──── E2 east spawn
                          │            (4 mouths)                                     │
                          └──── S1 laundry ──── S2 circular drive ──── S4 gallery ────┘
                                     │              │                      │
                                    U3 balcony   S3 island               U4 upper
```

Every lane touches the centre exactly once. There is no route from one spawn to the
other that avoids all three lanes — that is what makes lane control mean something.

### 3.2 The long sightlines (and where they break)

| Sightline | Length | Broken by |
|---|---|---|
| Pool lane, court corner → covered walk | **~48 m** | nothing until the last 10 m — the map's defining long lane; keep it unbroken |
| Drive lane, laundry balcony → gallery mouth | ~36 m | the drive island (S3) only, and only from some angles |
| House spine, C1 west mouth → C3 east wall | ~34 m | the courtyard piers, twice |
| West apron → living-room east window | ~28 m | the C1 chimney breast |
| Garage west face → courtyard east mouth | ~26 m | the C3 counter run |

Two rules that must survive the build:

- **Exactly one lane may hold a 45 m+ line.** In the current Test2 the *entire terrace*
  holds a ~76 m line, which is why it plays like an open field rather than an estate.
  Cut every other line to ≤36 m with architecture, not with prop clutter.
- **No sightline may see two lanes at once.** The house band (C4) and the wing masses
  exist to guarantee it. Test: from any point on the pool deck you must not be able to
  see any point on the circular drive.

### 3.3 Flank routes

1. **Pool → office window → kitchen.** Turns a north-lane push into a centre push
   without re-entering the courtyard mouths. One-way in feel: a 0.70 m sill in, a drop
   out.
2. **Laundry ground passage → west apron.** Puts a team-0 player behind anything holding
   the drive lane's west mouth.
3. **The garage ledge.** A 0.70 m ledge running from the garage's outer face north-west
   toward the pool, screened along its length by the N4 planter box run. Reaches the pool
   lane behind anyone watching the covered walk. This is a **route, not a room**: walkable
   end to end, visible only from the pool side. (Directly attested — the official tips
   describe exactly this ledge, "largely concealed by the long planter box".)
4. **Drive approach (S5) rear arc.** Around the far side of the circle, out of U3's and
   U4's cones. Slow, safe, and the reason the drive lane is not a pure crossfire.

### 3.4 Power positions

Ranked. Each must be **counterable from at least two directions** — the property the
reference has and a naive recreation loses:

1. **U1 upper bedroom** — owns the whole north lane. Countered by the back stairs behind
   it (the reference's own guide tells you to watch them) and by the office window in C3.
2. **The courtyard (C2)** — owns the centre and both mouths. Countered by grenades from
   all four mouths and from the U2 landing above.
3. **U3 / U4 balconies** — split the drive lane. Each is countered by the other and by
   the S3 island's blind arc.
4. **Garage west face (E2)** — a strong hold on the C anchor. Countered by the ledge
   (3.3) and by the gallery mouth.
5. **Court corners (N1)** — the reference's classic camp spot. Countered by U1 and by the
   pool steps.

### 3.5 Head-glitch and jump-up spots (controller-legal, see §5)

| Spot | Geometry | Why it is there |
|---|---|---|
| N4 planter box run | top 0.70 m | mount to shoot over the pool; the ledge route's screen |
| S3 island kerb | top 0.30 m; planters 1.9 m | the only cover in the middle of the drive |
| U3 / U4 balcony rails | 1.05 m above a +3.4 m floor | classic head-glitch: torso exposed, legs covered |
| Courtyard fountain kerb | 0.70 m | mount inside C2 to see over the piers' bases |
| Garage kerb line | 0.70 m | step up to clear the bay piers |
| C1 / C3 window sills | 0.70 m inside, 0.35 + 0.35 outside | the lane change |

**Nothing is authored in the 0.9–1.8 m dead band.** Keep the current file's rule
verbatim: a cover piece is either ≤0.75 m (mountable) or ≥1.9 m (clears the standing
eye line). The current build honours this and the rebuild must not lose it.

---

## 4. Spawns

### 4.1 Team 0 — west apron (E1)

- Zone x −50…−40, z −9…+3. Facing **+x**.
- Six points spread across 12 m of z so one grenade cannot cover them. Suggested:
  `[[-47,-7],[-47,0],[-47,6],[-45,-4],[-45,3],[-43,-8]]`.
- Exit fan: NW to the N2 court steps, E to C1, SE to S1.

### 4.2 Team 1 — garage wing (E2)

- Zone x +40…+50, z −8…+8. Facing **−x**. An exact x-mirror of E1 in *distance to every
  lane mouth*, though the enclosing architecture differs (open apron vs covered garage).
- `[[47,7],[47,0],[47,-6],[45,4],[45,-3],[43,8]]`.
- Exit fan: NW to N6, W to C3, SW to S4.

### 4.3 The centre contest, and spawn stability

**The natural centre contest is the courtyard (C2) at (+2, −0.5)** — measured, and the
reason the reference's centre hardpoint sits there.

But the objective anchors do **not** all sit on the centre line: B is at (0, +14), pulled
into the drive lane. That is deliberate and it is what keeps spawns stable in objective
modes: with A and C on the long axis at the two ends and B pulled to one flank, a team
that owns B is committed to one side of the map, so the losing team's spawn stays
anchored behind its own end instead of flipping through the middle. **Reproduce that
offset.** Moving B into the courtyard is the obvious "improvement" and it would break the
map.

Spawn-safety consequence for the build: the E1 and E2 aprons must have **no line of sight
into them from any lane mouth**, and no elevated room may see either apron. Check U1 in
particular — it must not see E1 down the pool lane's full 48 m.

---

## 5. Verticality, converted to this controller

### 5.1 The controller's actual limits (measured constants, this repo)

| Constant | Value | Source |
|---|---|---|
| Jump velocity / gravity | 6.35 / 24.5 → **apex 0.82 m** | `src/arena-layout.ts:131` |
| Proven mount rise | **0.75 m** | `src/test-maps.ts` cover rule |
| Autostep height | **0.42 m** | `CHARACTER_PHYSICS_CONFIG.autostepHeight`, `src/physics.ts:12` |
| Autostep minimum width | 0.22 m | same |
| Max slope climb | 50° | same |
| Standing capsule | 1.82 m tall, eye ≈ **1.70 m** | `STANCE_SHAPES`, `src/physics.ts` |
| Prone eye | ≈0.61 m | same |

Three bands follow, and every rise in the map must be in one of them:

- **≤ 0.42 m** — walk up, no jump. Steps, kerbs, sunken floors.
- **0.42 – 0.75 m** — jump-mount. Cover tops, planters, ledges, sills.
- **> 0.75 m** — needs a **route**: a stair run, or a documented multi-step ladder.

### 5.2 Every raised surface in the rebuild

| Surface | Height | How it is reached |
|---|---|---|
| Pool basin floor (N3) | **−0.55** | two 0.27/0.28 m steps in; 0.55 m jump-mount out (as built today) |
| Sport court floor (N1) | **−0.35** | one 0.35 m riser, walk (autostep) |
| Grade | 0.00 | — |
| Drive island kerb (S3) | **+0.30** | walk |
| Planter box run (N4), fountain / garage / court kerbs | **+0.70** | jump-mount |
| Window sills (C1, C3 office) | **+0.70** inside, 0.35 + 0.35 outside | walk out, mount in |
| **Ledge route** (garage → pool) | **+0.70** | jump-mount at the garage end; walks out at the pool end |
| **First floor: U1, U2, U3, U4** | **+3.40** | **stairs only** (§5.3) |
| Balcony rails on U3 / U4 | +1.05 above the floor (abs 4.45) | not standable |
| Roofs (N5, N7, S1, S4, E2) | 3.7 – 4.2 | **not reachable — intentionally** |

Total standable vertical range: **−0.55 m to +3.40 m = 3.95 m.**

Current Test2's range is **1.25 m** (−0.55 to +0.70) and its highest standable surface is
the 0.70 m veranda deck — enumerated from every `block()` call in `buildTest2()`, not
sampled. **This is the largest single reason the map does not feel like the reference:**
the reference's identity is four rooms firing down into three lanes, and the current
build has zero of them.

### 5.3 The canonical stair module (build once, reuse four times)

A 3.40 m floor cannot be jumped to, so it needs a real run:

- **9 risers of 0.378 m, treads of 0.45 m.** Rise 3.40 m, run 4.05 m, pitch 40°.
- Every riser is **below the 0.42 m autostep**, so the player *walks* up with no jump —
  no timing, no snag, and bots path it without needing a jump node.
- Tread 0.45 m clears the 0.22 m autostep minimum width with margin.
- Pitch 40° is inside the 50° slope-climb limit, so a smooth-ramp fallback also works if
  the stepped version ever fights the character controller.
- Landing width ≥ 1.6 m so two players pass.
- **Four stairs, one per upper room** (U1 back stair, U2 off the house spine, U3 inside
  the laundry, U4 inside the gallery). Two of them — U1's back stair and U3's — must be
  the *counter-route* named in §3.4, i.e. reachable from the opposite team's approach.

### 5.4 Where the reference had to be adapted

| Reference feature | Problem for this controller | Adaptation |
|---|---|---|
| Mantling onto waist-high ledges | we have no mantle; the proven mount rise is 0.75 m | every ledge and sill authored at exactly 0.70 m |
| Interior stairs at ~32° with 0.18 m risers | legal, but 19 steps of geometry per stair | 9 × 0.378 m risers; still autostep-legal, half the meshes |
| A hillside the whole map is cut into (real grade change end to end) | a sloped playfield fights every gate we own — collider parity, eye clearance, the ballistic census | **the playfield is flat at y = 0.** The "hillside" is presentation beyond the boundary. The only grade changes are the four in §5.2 |
| Reachable rooftops in a couple of corners | roof access multiplies the eye-clearance surface and the shadow volume | cut. Four upper rooms is the verticality budget |

---

## 6. Top-down diagram — arena coordinates

x right, z forward, origin at map centre. **One character = 2 m.**
`#` building mass · `~` water · `c` sport-court surface · `O` drive island ·
`.` open playable · `0`/`1` spawn aprons · `A`/`B`/`C` objective anchors ·
blank = out of bounds.

```
       x-50 |    -40   |    -30   |    -20   |    -10   |     0    |    10    |    20    |    30    |    40    |+50
z -37             ...............................
z -35       ..................................
z -33       .cccccccccc..~~~~~~~~~~~~~~~........
z -31       .cccccccccc..~~~~~~~~~~~~~~~######..
z -29       .cccccccccc..~~~~~~~~~~~~~~~######..
z -27       .cccccccccc..~~~~~~~~~~~~~~~######..
z -25       .cccccccccc.................######..
z -23       .cccccccccc.................######..
z -21       ............................######..
z -19       ........##########################.......
z -17       ........##########################.......
z -15       ........##########################.......
z -13      .........##########################....#######
z -11      .........##########################....#######
z  -9  00000........##########################....###1111
z  -7  00000........###########...############....###1111
z  -5  00000........########.........#########....###1111
z  -3  00000........########.........#########....###1111
z  -1  00000........#######............#######....###1111
z  +1  00000...A....#######............#######...C###1111
z  +3  .............########.........#########....###1111
z  +5      ...........................########....###1111
z  +7      ........##########.........########....###1111
z  +9      ........##########.........########....###1111
z +11        ......##########.........########.......
z +13        ......##########........................
z +15        ......##########...B....................
z +17          ..............................
z +19          ..............................
z +21          ..............................
z +23          ...............OOOOOO.........
z +25            .............OOOOOO.......
z +27            .............OOOOOO.......
z +29            .............OOOOOO.......
z +31                ...................
z +33                ...................
z +35                ...................
z +37                      ..........
```

Read it as: **north lane across the top** (sport court, pool, covered walk), **house band
through the middle** with the courtyard as the gap at x −6…+10, z −6…+4, **drive lane
below** (laundry left, circle centre, gallery right), **spawns at the two ends**.

The courtyard's four mouths are at (x −2…+4, z −8) north, (x −2…+4, z +4) south,
(x −10…−6, z −2…+2) west and (x +10…+14, z −2…+2) east — the diagram's 2 m cells swallow
two of them.

Upper floors (not shown, all at +3.40): U1 x +18…+28 z −31…−22 · U2 x −20…−4 z −19…−12 ·
U3 x −22…−8 z +7…+15 · U4 x +14…+26 z +5…+12.

---

## 7. What makes it play well — the properties a recreation must preserve

The owner asked for "layout **and playability**". Looking like the map is not the test;
these seven properties are, roughly in order of how badly a recreation misses without
them.

1. **Three-lane discipline, honoured strictly.** Three routes, spawn to spawn, no fourth.
   Each touches the centre once. A player who commits to a lane stays committed until a
   named flank route lets them out. The current Test2 has three *named* lanes, but they
   are all one open terrace — you can see and shoot across all three from most of the
   map, which collapses them into one.
2. **One long lane, two medium, one short.** Roughly 48 m / 36 m / 34 m / 26 m. That ratio
   is why every weapon class works. All-long is a sniper map; all-short is a shotgun map.
   The current build's uniform 76 m openness is neither.
3. **The centre house connects the lanes and nothing else does.** All three lanes are
   reachable from the courtyard within 10 m; the lanes are not reachable from each other
   except through the house or around the outside ring. That is what makes centre control
   worth fighting for — and what makes losing it recoverable.
4. **Elevation is information, not dominance.** Four upper rooms, each seeing exactly one
   lane, each with a stair an enemy can climb behind you. Nothing sees two lanes. Nothing
   is safe.
5. **Cover is architecture.** Piers, kerbs, planters, counters, a fountain island — all of
   it part of a building that would exist anyway. Almost no free-standing crate. That is
   why the map reads as a place rather than an arena.
6. **Spawn stability through the offset B.** Objectives on the long axis at the two ends
   plus one pulled into a flank (§4.3). Do not "fix" it.
7. **Deliberate bare pockets.** The sport court and the middle of the pool are almost
   coverless on purpose: they are the risk the map charges for taking the flank. Filling
   them with cover to be "fair" removes the map's tension. Leave them bare.

---

## 8. What is KEPT, what MOVES, what is DEMOLISHED

Read against `src/test-maps.ts` → `buildTest2()` (lines 349–525) and
`docs/TEST2_MAP_BRIEF.md`.

### 8.1 KEPT — do not re-litigate these

| Thing | Where | Why |
|---|---|---|
| Arena id / label `test2` / "Test2" | return object | IP rule (§0) |
| `test2Materials()` forge, `applyTest2Dressing()`, `worldTiled()` per-mesh UV scaling | `src/test-maps-art.ts`, the local `block()` helper | The art pipeline is correct and orthogonal to layout. Every new mesh goes through `block()`, never bare `box()` |
| **The cover rule** (≤0.75 m mountable or ≥1.9 m hard; nothing in 0.9–1.8 m) | `MOUNT_LOW` / `HARD_COVER` | Derived from this controller's measured apex; still exactly right |
| The presentation-water-over-solid-basin exception | pool water sheet | The arena's one authored visual/collider exception; reuse verbatim for the new pool |
| **Terrace band decomposition around cutouts** (ground authored as the complement, never one slab with holes) | `terraceSlabs` | The technique that fixed the buried water sheet. The new map has more cutouts, not fewer |
| Domination mode, capture rules, HUD pips, host-authoritative zone state | `docs/TEST2_MAP_BRIEF.md`, `src/legacy-main.ts` | Mode is unaffected by layout |
| Zone mesh naming `test2-zone-flag-pole-{id}` / `-banner-{id}`, one distinct material per zone | zone loop | The runtime recolours by name, and distinct materials keep them out of the merged presentation batch |
| `batchPresentationOnlyBoxes(root, 'test2-presentation')` | end of builder | Draw-call budget |
| `spawnRecord(...)` shape, 6 points per team | return object | Contract |
| Glazing recessed into its wall so the ballistic census sees it explained by the wall | villa glazing | Pattern needed again for every new window |

### 8.2 MOVES

| Thing | From | To |
|---|---|---|
| `TEST2_BOUNDS` | −38…38 / −29…29 (76 × 58) | **−50…50 / −38…38 (100 × 76)** |
| `TEST2_DOMINATION_ZONES` | A(−20,0,−12) B(0,0,0) C(20,0,12) | **A(−34,0,−0.5) B(0,0,14) C(34,0,−0.5)** |
| Zone-B plinth special case (`groundY = -0.35`, because B stood on the sunken court) | zone loop | B now sits on flat drive paving → `groundY = 0` for all three |
| Spawns | x ±36/34/31, z ±10…±4 | §4.1 / §4.2 |
| `patrolPoints` (12, all at grade) | current list | Re-seated — and **some must be on the +3.40 m floors**. The current comment deliberately avoided elevated anchors; with four upper rooms that decision is now wrong, and bots that never go upstairs will not defend the map's power positions |
| **The fairness involution** | 180° **rotation**, "honoured literally" (file header) | **X mirror `(x, z) → (−x, z)`.** See §8.4 — this is the load-bearing change |
| `physicsSafetyFloorY: -1.2` | −1.2 | still correct (lowest floor −0.55); re-derive if the pool deepens |

### 8.3 DEMOLISHED

Everything below exists only to serve the 76 × 58 rotationally-symmetric terrace and has
no counterpart in the reference:

- **The sunken parterre** (`side = +1` basin). It exists solely as the pool's 180°
  partner. Under an X mirror the pool needs no partner.
- **Both villa wings** (`test2 villa wing ±`): 56 m × 0.6 m solid walls at z = ±26. They
  are why the play rectangle is 76 × 52 and why nothing has an interior.
- **Both verandas** — deck, roof, 16 columns, 8 balustrade spans, grand steps, benches.
  The reference has no veranda; it has rooms.
- **The sunken sport court at the centre** and its four planters. The centre is an
  enclosed courtyard, not a pit. (The court itself survives — it moves to N1, on a flank.)
- **The four diagonal outbuildings**, the two gatehouses, the two motor walls, the two
  orangeries.
- **The symmetric quad loops**: `hedge block`, `balustrade`, `terrace step` at ±side/±end.
- The 3.4 m stucco perimeter as the *only* boundary treatment. Keep a boundary, but the
  south and west edges should read as a hillside drop (§5.4).

### 8.4 The involution finding — flag this to the owner before building

`src/test-maps.ts` currently asserts, in its header:

> *Test2 — teams separate along X and the Domination anchors A(−20, −12) and C(+20, +12)
> are already exact 180-degree images of one another, so this map's involution is the
> ROTATION (x, z) → (−x, −z), and it is honoured literally.*

**The reference's own objective anchors say otherwise.** Measured off the published
overlay: A at (−34.6, **−0.1**) and C at (+33.1, **−0.9**). Those are **x-mirrors**, not
180° images — a 180° image of A would sit at (+34.6, +0.1). Every other paired feature
agrees: the two service rooms flank the drive from the *same* side of the map; both upper
balconies look *into* the drive; the flank lanes differ in kind (a pool terrace and a
motor circle) and neither rotates into the other.

**Recommendation: change Test2's involution to the X mirror `(x, z) → (−x, z)`.**

This is not a weakening. It is exactly the argument `test-maps.ts` already makes for
Test1, in the same header:

> *the two lanes differ in kind by the brief … The team-swapping involution is therefore
> the Z MIRROR … A literal 180-degree rotation would additionally demand that the firing
> line EQUAL the container yard, which the brief's own lane programme forbids.*

Same situation, other axis. Under the X mirror the fairness obligations become:

- every spawn point maps to a spawn point of the other team;
- every lane mouth is the same distance from each spawn;
- each team has exactly one elevated room per flank lane;
- A ↔ C exactly; B sits on x = 0.

The two flank lanes are then allowed to differ in kind — which is what lets a pool lane
and a motor-drive lane coexist, and it is what the reference actually does.

---

## 9. Gate impact — what the builder will have to re-pin

Each row is a place where the rebuild **will** turn a gate red, and where the fix is
re-measurement, never loosening.

| # | Gate / table | Current pin | Impact |
|---|---|---|---|
| G1 | **Collider–visual parity** — `scripts/qa/collider-visual-parity-core.ts`; ceiling `test2: 0` pinned in `src/collider-visual-parity-gate.test.ts` | 0 walk-through meshes | Every new mesh needs solid/shots decided at authoring. Interiors are the risk: floors, stair treads, window sills and balcony rails all need registering |
| G2 | **Ballistic parity** — `ACCEPTED_SHOOT_THROUGH.test2 = []`, `BALLISTIC_UNRATED_CEILINGS.test2 = 0` (`scripts/qa/ballistic-parity-ledger.ts`, pinned twice in the gate test) | empty ledger, ceiling 0 | The strictest floor in the repo — owner rule, new arenas enter at 0. Every substantial visible mesh must be rated. Balcony rails and stair stringers are the classic offenders (thin, rotated, AABB-inflated). Budget triage time; **do not add ledger rows to get green** |
| G3 | **Eye clearance** — `docs/eye-clearance/ledger.json` `ceilings.test2 = 0`; last sweep `artifacts/qa/eye-clearance/test2-*.json` = **3665 spots, 0 violations** | 0 | Biggest risk in the rebuild. New hazards: upper floors (standing eye 5.10 m, so interior clear height ≥ 2.8 m puts the floor above at ≥ 6.2 m, or leave the room open to sky), stair soffits (prone eye 0.61 m — no crawl space under 1.0 m), balcony undersides, the covered walk. The spot count changes with bounds; regenerate all three stages |
| G4 | **Eye-clearance sweep contract** — `scripts/qa/eye-clearance-sweep-contract.test.mjs` | ledger must carry exactly one entry per selectable arena; test2 required in all three stages | No structural change, but the stale comments in `scripts/qa/sweep-eye-clearance-spots.ts` (≈ lines 68–73 and 159–160) name "76 x 58 m" and the 1176 rim-spot count. Update them or they become lies |
| G5 | **Shadow cascade** — `src/graphics-refinement.ts:37` `test2: { halfWidth: 40, halfHeight: 32, near: 4, far: 182 }` | covers 80 × 64 | **Fails immediately at 100 × 76.** Needs halfWidth ≥ 52, halfHeight ≥ 40. The `test-maps.ts` header currently boasts that both extents sit inside this volume "so no table this pass does not own had to move" — that claim dies with this pass, and the builder now owns the table. Also re-check `test2: 0.22` at line 53 |
| G6 | **Fog** — `src/rendering/arenas/test2.ts` `fog: { near: 98, far: 186 }` | tuned so near 98 clears the old 95.6 m diagonal | New diagonal is **125.7 m**. `near` must rise to ~128 or the far third of every long lane grades into haze — the exact chroma-collapse defect the current comment records as fixed. Re-measure, do not eyeball |
| G7 | **Shadow distance / budgets** — same file: `shadows.maximumDistance: 150`, `budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 })` | | 150 still covers 125.7 m, tightly. Four interiors plus four stairs will push draw calls; batch aggressively and re-measure before raising anything |
| G8 | **Review cameras** — same file, 4 cameras; the same names in `scripts/qa/viewpoint-catalog.mjs` | `test2-estate-overview`, `test2-pool-lane`, `test2-garden-occlusion`, `test2-into-sun-terrace` | Three of the four are aimed at demolished geometry *by coordinate* (the x = 13 balustrade, the motor-court car at x ≥ 21.55, the centre garden hedge). All four need re-authoring, plus fresh baseline captures |
| G9 | **Killstreak flight nav** — `src/killstreak-flight-navigation.ts` `definition('test2', 45, …)` | radius 45 | New half-diagonal is ~63 m. Raise and re-verify against `src/killstreak-flight-navigation.test.ts` |
| G10 | **Menu previews** — `source-assets/menu/pass79-test-arena-previews/choreography.json`, gated by `scripts/qa/verify-pass77-arena-menu-preview-production.mjs` | pinned bytes | The flythrough path runs through geometry that will not exist. Re-choreograph, re-render, re-pin |
| G11 | **MP repro matrix** — `scripts/qa/mp-core-repro-matrix.mjs` `{ arena: 'test2', mode: 'domination' }` | | Zone coordinates move (§8.2); host-authoritative zone replication must be re-verified against the new anchors |
| G12 | **Cross-browser gate** — `scripts/qa/cross-browser-gate-contract.test.mjs` requires test2 | | No contract change; re-run |
| G13 | **Boot smoke** (HEAD c2c184ad, all 8 arenas boot) | | Cheapest early signal — run it first after the bounds change, before any art |
| G14 | Ambient / audio profiles — `src/arena-ambient-events.ts` `'golden-hour-garden-estate'` zone list; `src/audio-immersion.ts` `'urban-yard'` | | Both reference the old layout's zones |

**Suggested build order**, so the gates fail early and cheaply: bounds + involution +
spawns (G13, G5, G6, G9 fire immediately) → ground plane and lane masses (G1, G2) →
interiors and stairs (G3 — the expensive one) → art and dressing → cameras, previews,
matrix (G8, G10, G11).

---

## 10. Confidence, and where sources disagree

| Claim | Confidence | Note |
|---|---|---|
| Three lanes, spawns at the two ends, centre courtyard with four mouths | **High** | Every source agrees, including the official guide's own "balanced three-lane map" framing and the spawn exit fan described independently in a long-form map guide |
| Named areas and their adjacency (sport court, pool, upper bedroom, living room, courtyard, laundry, circle drive, gallery, garage) | **High** | Two independent guides plus the wiki's screenshot captions agree |
| Measured proportions (1.311 : 1, 62.4 % fill) and all objective coordinates | **High** | Direct pixel measurement of the official tactical map; method recorded in the artefact |
| Absolute metre scale | **Medium** | An inference from four architectural anchors (85–92 m) plus a movement correction (×1.20). No official dimensions have ever been published. If it plays too big, shrink the long axis toward 92 m and hold the aspect |
| Upper-room count and their exact footprints | **Medium** | Four elevated vantages are named across sources; their footprints are read off the tac-map raster and carry ±2 m |
| Objective-A position | **Medium — sources disagree** | One guide places A "at the top of the stairs leading to the basketball court", adjacent to the court; the official overlay measures it at (−34.6, −0.1), mid-depth on the west end. Both are satisfied if the court steps run at x ≈ −34, z −5…0. Built at (−34, −0.5) |
| The "fountain" callout | **Low** | The official tips use "Fountain" for something on the pool-lane side, while a fountain also sits on the drive island. Either two fountains or one callout used loosely. This spec gives the island the big one and the pool deck a small basin |
| Interior room programme (kitchen / office / gallery contents) | **Low — and it does not matter** | Dressing choices. What is load-bearing is only that C3 has a window onto the pool lane and that S4 opens both to the house and to the drive |

---

## 11. Sources consulted

- Official Call of Duty map guide for the reference map (POI list, official advanced-map
  tips naming the upper-room view, the concealed ledge and the office-window lane change)
  and its published tactical-map graphics — measured, not copied:
  `Raid_Tac_Map_BLANK.webp`, `Raid_Tac_Map_DOM.webp`, `Raid_Tac_Map_HP.webp` (2048².)
- A long-form BO2 multiplayer map guide (Gamer Guides) — the only source that describes
  the spawn exit fans and every objective location for all six modes. This is where the
  area-adjacency graph in §3.1 comes from.
- The Call of Duty Wiki entry for the map — team names, screenshot captions confirming the
  garden spawn, the court, the covered walk and the garage spawn.
- A long community map-discussion thread (denkirson) — lane structure, thin-wall
  penetration, the elevated-window camping pattern, the under-used garage flank, and the
  criticism that the pool has "absolutely no cover" (§7.7 turns that criticism into a rule).
- This repo: `src/test-maps.ts`, `src/test-maps-art.ts`, `src/physics.ts`,
  `src/arena-layout.ts`, `src/graphics-refinement.ts`, `src/rendering/arenas/test2.ts`,
  `src/killstreak-flight-navigation.ts`, `scripts/qa/ballistic-parity-ledger.ts`,
  `scripts/qa/sweep-eye-clearance-spots.ts`, `docs/eye-clearance/ledger.json`,
  `artifacts/qa/eye-clearance/*`, `artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md`,
  `docs/TEST2_MAP_BRIEF.md`.
