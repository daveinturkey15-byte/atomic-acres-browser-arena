# Black Ops 2 Nuketown 2025 — reference schematic (HF-426 / Lane AU)

> **Directive (owner, 2026-09-03 07:00 BST):**
> *"the nuketown rebuild is not right, its based on an old layout we had here, not the actual layout of black ops 2 nuketown, you need to do some proper research and adjust the layout of the map and assets, then layer in all the visual styles we had aimed for and approved in our older layout, prioritise that ahead of other things and be careful with compute. I hope it wont take long?"*

**Nothing in this document is copied.** No image, text, texture or asset from any
source is reproduced here. What is recorded is *measurement*: bounding boxes read
off publicly published overhead images with a threshold-and-connected-components
script, converted to ratios, and described in this lane's own words.

**Everything is a ratio to street length**, $L$ = the playable extent of the road
along its own axis. The arena sets $L = 36\ \text{m}$; see §6 for why that number
and not another.

---

## 0. Provenance, and what happened to the previous version of this file

The first version of this document (commit `1aea567f`) was written by a Gemini
3.8 Flash worker. It was checked source by source and **rejected**. Two classes
of problem:

**Its citations do not resolve.** Checked 2026-09-03 with `curl`:

| Cited as | Result |
|---|---|
| *"Nuketown Level Analysis: Space, Sightlines, and Flow"*, Matthew Menke, Medium 2022 — `medium.com/@matthewmenke/nuketown-level-analysis` | HTTP 200 but the body is Medium's generic **page-not-found** shell (`<title>Medium</title>`, "PAGE NOT FOUND"). The article does not exist. |
| *"How Big is Nuketown? ..."*, Games Learning Society / VintageIsTheNewOld — `vintageisthenewold.com` | HTTP 403, bare domain, no such article or publisher pairing. |
| Games Atlas BO2 map database — `gamesatlas.com/cod-black-ops-2/maps/nuketown-2025` | HTTP 404. |
| Activision official guide — `callofduty.com` | Bare domain, no page. |

Only the Fandom wiki URL resolved. Every dimension in that document was
therefore an unsourced recollection presented with a citation marker beside it.

**Its structure was our old map's, which is what the owner rejected.** It
asserted a long street with the two houses either side and a cul-de-sac at each
end — i.e. exactly the 2026-08-29 redesign — and then attached ratios to it. The
measurements below say the opposite: see §5.1, which is the single load-bearing
correction in this pass.

### Sources actually used here

| # | Source | What it is | How it was obtained |
|---|---|---|---|
| S1 | `https://callofduty.fandom.com/wiki/Nuketown_2025` | Call of Duty Wiki article | MediaWiki API (`action=parse`), 2026-09-03 |
| S2 | `https://static.wikia.nocookie.net/callofduty/images/e/eb/Nuketown_2025_Minimap_BOII.png` | **The in-game BO2 minimap**, 512 × 512 — first-party Treyarch art | direct download |
| S3 | `https://static.wikia.nocookie.net/callofduty/images/6/6c/Nuketown_2025_MiniMap_BO7.png` | **The in-game BO7 minimap**, 4096 × 4096 — the BO7 remake of the same map | direct download |
| S4 | `https://www.gamesatlas.com/cod-black-ops-7/maps/nuketown/` | Map guide; republishes S3 as a 1024-px "map layout" | direct download of `…nuketown-black-ops-7-map-layout.avif`; **all pixel figures below are measured on this 1024-px rendition** |
| S5 | `https://static.wikia.nocookie.net/callofduty/images/6/6f/Nuketown_2025_Aerial_View_BOII.jpg` | 1920 × 1080 top-down still of the map | direct download |
| S6 | `https://static.wikia.nocookie.net/callofduty/images/9/99/Nuketown_2025_review_photo_BOII.jpg` | First-party preview still, street level | direct download |
| S7 | Activision's own Nuketown 2025 map guide, `callofduty.com/guides/blackops7/multiplayer-maps/nuketown-2025` | Official area-by-area guide | **Indirect.** Direct fetch returned `ECONNRESET`; its wording reached this lane only through a web-search summary. Treated as *reported*, never as measured — every S7 claim below is corroborated by S2/S3/S5 before it is used. |

S2 and S3 are the same map fifteen years apart and they agree to about 1 % on
every ratio taken from both. That agreement is what makes the numbers here
trustworthy in a way a single published scalar never was.

---

## 1. Grid schematic of the whole map

World frame used throughout: **x runs along the street, z runs across it**, the
origin is the middle of the cul-de-sac turning head, and the north house is at
negative z. Cells are 1.5 m along x by 3 m across z.

```
   z -42 <-- team 0 back fence            road             team 1 back fence --> +42
        |<-- border path -->|<-- back yard -->|<- house ->|<- verge ->|<- road ->|  ...
 x  +18 +-------------------------------------------------------------------------+
        |  o                       o          .           |=======|         o     |   o  flank prop
        |  o          o            o          .           |=======|   o     o     |
        |  o          o        G G G G G      .           |=======|   o     o     |   G  garage (team 0)
     +8 |  o     o    o        G G G G G  ====|==T T==|====   .        o     o     |
        |  o     o    o        G G G G G  ====|==T T==| H H H H H      o  s  o     |   T  moving truck (OPEN)
        |  o     o    o    H H H H H H H  ====|==T T==| H H H H H      o     o     |
      0 |  o     o    o    H H H H H H H  ====|==T T==| H H H H H  s   o     o     |   H  house
        |  o     o    o    H H H H H H H  ==C C=T T==| H H H H H      o     o     |
        |  o          o    H H H H H H H  ==C C=======|   G G G G G   o     o     |   C  coach (CLOSED)
     -8 |  o     o    o    H H H H H H H  ==C C=======|   G G G G G   o     o     |
        |  o  s  o    o        o          .   |=======|   G G G G G   o     o  s  |   s  spawn
        |  o     o    o        o          .   |=======|         o     o     o     |
    -18 +-------------------------------------------------------------------------+
                                          ^ cul-de-sac turning head, 0.44 L across
```

The single thing to read off this: **the long axis of the map is the lot-to-lot
run, not the street.** You spawn in a back yard, cross your own house or its
garage, cross a short wide road, and you are in the enemy's front yard. The road
is 36 m of frontage and you are never more than about 20 m from crossing it.

---

## 2. Landmarks, and which cover is open

| Landmark | Where | Cover | Evidence |
|---|---|---|---|
| Two houses, two storeys | One per side of the road, offset along it by 0.065 L, **180-degree rotations of each other** — never mirrored | Hard building | S3 house-fill components (§3); S1 records a letterbox outside each of the two houses carrying a character name apiece |
| Garage, one per house | Attached to **one end** of its house, set back 0.168 L from the street frontage; opposite ends under the rotation | Single-storey room | S3: the left house's wing is a separate fill component at the rear of the lot; S5 shows the driveway apron in front of it |
| Upstairs front window | Centred on each house's street facade, second floor | 0.9 m sill opening | S7 (reported): the front-facing windows of both homes are the map's biggest power positions |
| **Moving truck** | In the cul-de-sac turning head, mid-map | **OPEN** — a walk-in cargo box with a solid cab | S3 draws the cargo box **hollow** and the cab **hatched**; S7 (reported) describes it as an island of cover in the cul-de-sac with room inside it; S5 shows it standing in the circle |
| **Coach** | Beside the truck, other side of the road centre-line | **CLOSED** — sealed body | S3 draws it hatched end to end; S6 shows a sealed streamlined coach with a fixed window band |
| Civilian cars | On the driveway aprons and standing in the turning head | **CLOSED**, waist/chest height | S5 (three visible: one on each driveway, one in the head) |
| Back yards | Behind each house, the map's deepest ground; team spawns live here | Open, fenced | S3 outer lots; S1's own description of the yards |
| Fence holes | In the yard fence, both sides, leading to a path that curves round to the opposite yard | Gap | S7 (reported, RC-XD route) — and S1 independently records that the out-of-map RC-XD passage from the original Nuketown is still present |
| Turning head | Middle of the road, ~0.44 L across | Open ground | S3 boundary bulge + S5's circle |

---

## 3. Measured dimensions, as ratios to street length

Method, so it can be re-run rather than re-guessed: S4's 1024-px rendition of S3
was thresholded into three masks — playable interior (near-black inside the
white outline), building fill (RGB 86,86,86), and vehicle/prop fill — and
connected components were taken with an 8-neighbour flood fill. The playable
polygon came out at **x ∈ [35, 979] (944 px) by y ∈ [341, 741] (400 px)**, so
image-y is the street axis and **1 px = L / 400**.

| Metric | Measured (px) | **Ratio to L** | Cross-check on S2 (BO2) |
|---|---|---|---|
| **Street length $L$** (road's playable extent along its own axis) | 400 | **1.000** | 181 |
| Playable extent ACROSS the street | 944 | **2.360** | 427 → **2.359** |
| Playable area | — | 2.360 $L^2$ | — |
| Road tongue width (where the carriageway leaves the polygon) | 131 | **0.328** | 60 of 181 → **0.331** |
| Turning-head diameter | ~180 | **0.450** | — |
| House front wall to house front wall | 221 | **0.553** | — |
| House depth, front wall to back wall | 145 | **0.363** | — |
| House frontage along the street | 121 | **0.303** | — |
| House + garage frontage | 171 / 179 | **0.428 / 0.448** | — |
| Garage frontage | 50–58 | **0.125–0.145** | — |
| Garage set-back from the house's street frontage | 67 | **0.168** | — |
| Back lot: house back wall to the playable boundary | 233 / 201 | **0.583 / 0.503** | — |
| Along-street offset between the two house centres | 26 | **0.065** | — |
| Moving truck, cab + cargo box | 130 | **0.325** | — |
| — of which hollow cargo box | 72 | **0.180** | — |
| — of which solid cab | 58 | **0.145** | — |
| Coach length | 101 | **0.253** | — |
| Coach offset from the truck's box: along the street | 71 | **0.178** | — |
| Coach offset from the truck's box: across the street | 60 | **0.150** | — |

**Two honest caveats about this table.**

1. **Vehicle widths are not usable.** The minimap draws vehicle outlines with a
   thick stroke, so measured widths (0.105–0.110 L, i.e. 3.8–4.0 m) are inflated
   by roughly a stroke. The arena authors 2.6 m bodies and records the
   difference (0.038 L) as a stated deviation rather than pretending to a
   measurement it does not have.
2. **Absolute scale is NOT measured, and cannot be.** Nothing in any source ties
   these pixels to metres. §6 says what the arena anchors on instead.

---

## 4. The three lanes

1. **North flank** — border path outside the north fence, in through a fence
   hole, along the side of the north house past its side store, across the road
   at the west end of the turning head.
2. **Centre / turning head** — front door to front door across 0.553 L, with the
   truck and coach breaking it. The highest-lethality ground on the map, and the
   ground both upstairs power windows hold.
3. **South flank** — the 180-degree partner of lane 1: south border path, fence
   hole, driveway and garage of the south house.

Note that these are lanes ACROSS the map's long axis, not along it. That is the
consequence of §5.1 and it is the flow the owner is asking for.

---

## 5. Disagreements, and the decision taken

### 5.1 The aspect ratio — the load-bearing correction

* **Disagreement.** The previous cut (and the schematic that justified it) made
  the street the map's long axis: 58 m of road with 52 m across it, 0.90 : 1.
  Both first-party minimaps put the playable polygon at **2.36 : 1 with the long
  axis running ACROSS the road** (S2: 427 × 181; S3: 944 × 400). The two sources
  agree to 0.04 %.
* **Corroboration, so this does not rest on one reading.** The polygon has a
  single narrow **tongue** in the middle of one long side — 0.328 L wide on S3,
  0.331 L on S2 — and that is where the road leaves the map. A road leaves a map
  at the END of its length. Both minimaps put it in the same place, at the same
  fraction of the short axis. Independently, the two house-fill components are
  separated along the LONG axis with the vehicles standing in the gap between
  them, and vehicles park along a road.
* **Resolution.** The arena's playable rectangle is now 36 m of street by 84 m
  across it (2.333 : 1, 1.1 % under the measurement). The street is the SHORT
  axis. This is the change the owner's "not the actual layout" is about, and
  nothing else in this pass matters as much.

### 5.2 Which vehicle is open

* **Disagreement.** Both previous cuts made the bus the enterable body — a
  yellow school bus with a walk-through aisle, carrying the 2x core on its roof
  — and the truck a solid prop.
* **Evidence.** S3 draws the two street bodies with opposite fills: the coach is
  hatched (solid) from end to end, and the truck is a hollow-drawn cargo box
  with a hatched cab. S6, a first-party street-level still, shows a sealed
  streamlined coach — a 1960s intercity body with a fixed window band, not a
  school bus with a folding door. S7 (reported) says the same thing in words: the
  truck is an island of cover in the cul-de-sac with room inside it.
* **Resolution.** **Truck open, coach closed.** The 2x core moves to the truck's
  cargo-box roof and the climb is over the cab. This also fixes a smaller error:
  the yellow school bus belongs to the ORIGINAL Nuketown, not to 2025.

### 5.3 House colours

* The previous schematic called them the *green* and *yellow* houses. Green and
  yellow are the original Nuketown's colours. S1 names the playable-area houses
  **blue, yellow and orange** (numbers 11, 12, 13) and separately references the
  orange house's upstairs and, in BO7, the Blue House bedroom.
* **Resolution.** Recorded here for **Job 3**, which owns colour. This pass
  changes no material.

### 5.4 How much of the map is rotationally symmetric

* The reference is rotationally symmetric in its houses, garages, driveways,
  yards, fences and props, and **not** in its street vehicles: one coach and one
  truck, different objects, no rotation maps one onto the other.
* **Resolution.** Everything else is emitted through `pair()`. The street
  vehicles are an enumerated exception in `nuketown2-fidelity.test.ts` — an
  exact-equality list, not a name filter — and it is paid for with two new
  properties the old exact-symmetry assertion gave for free: the exception's
  total plan area is capped at 6 % of the playspace, and each half of the map
  must carry at least 20 m² of street-vehicle cover. The second of those is why
  the arena authors a car standing in the turning head: the coach is 23.7 m² of
  hard cover entirely on the north half, and the engine pins the truck to the
  centre-line, so without a counterweight the north team would own the head.

### 5.5 Deviations knowingly taken

| Deviation | Reference | Arena | Why |
|---|---|---|---|
| The road is a stub with one open end | tongue at one end of the street | carriageway runs the full 36 m, closed by the perimeter wall at both ends | The playable area is a fenced rectangle. A one-ended road would hand the closed end to whichever team is nearer it. |
| The houses sit ~0.08 L toward the road's closed end | house centres 32 px off the polygon's street-axis centre | houses centred on x = ±1.25 | Follows from the above: with the turning head centred, centred houses are what keeps the two teams equal. |
| Truck sits across the road centre-line | truck ~0.076 L south of it | truck box centred on z = 0 | `OVERDRIVE_POSITION` in `src/overdrive.ts` is a single global `{0, 3.75, 0}`, not a per-arena value. The 2x core is the owner's kept feature; moving it is weapons code, outside this lane. |
| Vehicle widths | 0.105–0.110 L as drawn | 2.6 m (0.072 L) | Minimap stroke inflation, §3 caveat 1. Deviation 0.038 L, inside the lane's 0.05 L tolerance. |

---

## 6. Absolute scale: what it is anchored on, and why

The reference gives **shape** reliably and **size** not at all. The previous cut
took one published area scalar (2,972 m² minimum playspace) and derived
everything from it — and that scalar is the part of the old study the owner
rejected, because a single number cannot tell you a map's shape and the shape is
what was wrong.

So the arena **holds the previous cut's playable area and changes only its
shape**: 58 × 52 = 3,016 m² becomes 36 × 84 = 3,024 m², +0.3 %. Two independent
checks land on the same scale:

* holding the AREA at 3,016 m² at 2.36 : 1 gives 35.7 × 84.4 m;
* holding the HOUSE FOOTPRINT at the previous cut's 140 m² and scaling the
  measured 121 × 145 px house by area gives 1 px = 0.0893 m, i.e. 35.7 × 84.3 m.

$L = 36\ \text{m}$ is the rounded result. Every ratio in §3 is applied at that
$L$, and the fidelity gate re-derives its bands the same way.

---

## 7. Element-by-element diff: reference vs the arena as it now builds

Ratios in the middle column are §3's; the right column is the arena, and every
row is inside the lane's 5 %-of-L (1.8 m) tolerance.

| Element | Reference | Arena (`src/nuketown2-layout.ts`, `src/nuketown2-arena.ts`) | Δ |
|---|---|---|---|
| Playable aspect | 2.360 | 84 / 36 = 2.333 | −1.1 % |
| Playable area | (unmeasurable) | 3,024 m² (anchor 3,016) | +0.3 % |
| Long axis runs | across the street | across the street (z) | ✔ corrected |
| Carriageway width | 0.328 L = 11.8 m | 11.8 m | 0.00 L |
| Road centre-line to house front | 0.2765 L = 9.95 m | 10.0 m | 0.001 L |
| House depth | 0.363 L = 13.07 m | 13.0 m | 0.002 L |
| House frontage | 0.303 L = 10.91 m | 11.0 m | 0.003 L |
| Garage frontage | 0.135 L = 4.86 m | 5.0 m | 0.004 L |
| Garage set-back | 0.168 L = 6.05 m | 6.0 m | 0.001 L |
| Back lot depth | 0.543 L = 19.5 m | 19.0 m (13 yard + 6 border path) | 0.014 L |
| House offset along the street | 0.065 L = 2.34 m | 2.5 m | 0.004 L |
| Turning head | 0.450 L = 16.2 m | 16.0 m | 0.006 L |
| Truck total length | 0.325 L = 11.70 m | 11.7 m | 0.000 L |
| — hollow cargo box | 0.180 L = 6.48 m | 6.5 m | 0.001 L |
| — solid cab | 0.145 L = 5.22 m | 5.2 m | 0.001 L |
| Coach length | 0.253 L = 9.11 m | 9.1 m | 0.000 L |
| Coach offset, along street | 0.178 L = 6.41 m | 5.0 m | 0.039 L |
| Coach offset, across street | 0.150 L = 5.40 m | 4.0 m | 0.039 L |
| Truck: open / coach: closed | truck open | truck open, coach solid | ✔ corrected |
| Spawns | back yards behind each house | z = ±30 / ±32, inside the fence | ✔ |
| Sheds (registry) | — | (±14, ±24.5), inside the yards | ✔ moved from ±24 x, which is now outside the map |
| Fence holes | both sides, to a path round to the far yard | two gaps per fence, deliberately off-axis from their own rotational partners | ✔ |

### What moved, in the old arena's terms

| Was | Now |
|---|---|
| bounds x ±29, z ±26 (58 × 52) | bounds x ±18, z ±42 (36 × 84) |
| street 58 m long, 9 m wide | street 36 m long, 11.8 m wide, with a 16 m turning head |
| houses 16 → 14 m wide × 10 deep, offset 7 m | 11 m wide × 13 deep, offset 2.5 m |
| garage 8 → 7 m, opening straight on the kerb | 5 m, set back 6 m, with a working link door into the house |
| bus open, at the origin, 2x core on its roof | truck open, at the origin, 2x core on its cargo-box roof; coach closed |
| two fictional cul-de-sac trucks (earlier cut) / one truck at z=+2.4 (later cut) | one truck in the head, one coach beside it, one car as the coach's counterweight |
| spawns z = ±19.5/20.5 | spawns z = ±30/32 |

---

## 8. Overhead vs schematic

Regenerate with `npx tsx artifacts/nuketown2-overlay.mts` (the reference panel is
drawn from §3's measured pixel boxes; the built panel from `buildNuketown2()`'s
own colliders; both in the same world frame at the same metres-per-cell).

```
H house   G garage   T moving truck (open)   C coach (closed)   = road   o prop   s spawn
cell = 1.5 m along the street (rows) x 3 m across it (columns)

REFERENCE (measured off the BO7/BO2 minimaps)      BUILT (buildNuketown2 colliders)
    z -42 ---------------- 42                          z -42 ---------------- 42
  17|............====............|                   17|..o.........====..o.....oo..|
  16|............====............|                   16|..o.........====o.o..oo.oo..|
  14|............====............|                   14|..o.......oo====o.o..oo.oo..|
  13|............====............|                   13|..o.s.....oo====o.o..oo.oo..|
  11|............CC==............|                   11|..o.......oo====..o..oo.....|
  10|............CC==............|                   10|..o...G.Gooo====......oo.o..|
   8|............CC..............|                    8|..o.o.GGGoo.=TT=......oo.o..|
   7|............CC..............|                    7|...so.GGGoo.=TT=oHHHHHooso..|
   5|.......GGG..CCTT.HHHHH......|                    5|....o.GGG...=TT=oHHHHH...o..|
   4|.......GGG..CCTT.HHHHH......|                    4|..o.o.HHHHH.=TT=oHHHHH...o..|
   2|.......GGG..CCTT.HHHHH......|                    2|..o.o.HHHHH.=TT=oHHHHHo..o..|
   1|......HHHHH...TT.HHHHH......|                    1|..o.s.HHHHH.=TT=.HHHHHo.so..|
  -1|......HHHHH...TT.HHHHH......|                   -1|..o..oHHHHH.CTT=.HHHHHo..o..|
  -2|......HHHHH...TT.HHHHH......|                   -2|..o..oHHHHH.CTT=.HHHHH.o.o..|
  -4|......HHHHH...TT.HHHHH......|                   -4|..o...HHHHH.CTT=.HHHHH.o.o..|
  -5|......HHHHH...TT.HHHHH......|                   -5|..os..HHHHH.CC==...GGG.os...|
  -7|......HHHHH......HHHHH......|                   -7|..o.ooHHHHH.CC==.ooGGG.o.o..|
  -8|......HHHHH......HHHHH......|                   -8|..o.oo......CC==.ooGGG.o.o..|
 -10|......HHHHH......HHHHH......|                  -10|..o.oo......C===oooGGG...o..|
 -11|............................|                  -11|....s...oo..====........so..|
 -13|............................|                  -13|..o..oo.oo.o====o........o..|
 -14|............................|                  -14|..oo.oo.oo.o====o........o..|
 -16|............................|                  -16|..oo.oo.oo.o====o........o..|
 -17|............................|                  -17|..oo....oo..====.........o..|
```

Reading the difference honestly: the two house bands, the two garages at
opposite ends, the truck on the centre-line and the coach beside it all land in
the same cells. The reference panel's houses sit about two rows lower — the
0.08 L set-back toward the road's closed end, §5.5 — and the reference panel
carries no props because only building and vehicle fills were segmented, not the
outer-lot clutter. The rendered overhead from the review camera is at
`artifacts/viewpoint-regression/hf426-candidate/nuketown2/nuketown2-overhead.png`.

---

## 9. What Job 3 inherits

This pass deliberately changed **no material, no light and no colour**. It did
re-derive the three numbers in `src/rendering/arenas/nuketown2.ts` and
`src/graphics-refinement.ts` that are functions of the footprint (review-camera
stations, fog near plane, shadow volume and normal bias), because they were
authored against a 58 × 52 map and two of the camera stations would now stand
inside a house. Everything else in the look is Job 3's, and §5.3 is the colour
note it should start from.
