# Nuketown 2025 - visual reference findings

**Lane:** R4 reference-gathering, 2026-09-04. **Target:** Black Ops 2 `Nuketown 2025`
(tag **BO2-2025**). Companion to `docs/research/2026-09-04/R4-bo2-nuketown-accuracy.md`,
which had **no images at all** - this pass downloads 20 and looks at them.

Black Ops 2 is not installed on this machine, so nothing here comes from the game
itself. Everything below is read off published images. **No image, texture or geometry
is copied into the project** - the files under `img/` are reference only, not shipped.

## Claim-state key

| State | Means |
|---|---|
| **VERIFIED** | I opened the image with the Read tool and saw the thing. The file is named. |
| **CLAIMED** | A page or caption says it, or it is inferred from a secondary version. |
| **OPEN** | Not settled. The falsifier that would settle it is written down. |

## Version discipline (owner instruction, 2026-09-04 12:58)

Only **BO2-2025** images are primary. `BO7-2025` (the Black Ops 7 re-release), `BO1`
(the original Nuketown), `CW-84` (Nuketown 84) and `BO6` are **secondary**: used only to
corroborate something a BO2-2025 image already shows, and always labelled. Every
evidence line below carries its version tag. Where a finding rests on a secondary image
alone, it says so and is graded down.

**BO2-2025 images that carry real layout information (6 of the 20):**
`nt2025-aerial-boii.jpg`, `nt2025-street-boii.jpg`, `nt2025-minimap-boii.png`,
`nt2025-sniper-boii.jpg`, `nt2025-loadscreen-boii.png`, `nt2025-explosion-boii.png`.

---

## Q1. Standing at your backyard spawn looking at your own house - which side is the garage?

### ANSWER: the garage is on your RIGHT. VERIFIED. True for BOTH teams.

- **VERIFIED - `nt2025-street-boii.jpg` (BO2-2025).** This image *is* the owner's
  viewpoint: an elevated shot from inside a team back yard, looking at that team's own
  house, with the road and the coach visible beyond it. In that frame the **garage wing
  (three dark barrel-vault bays over a cream box, with a service door and a red car on
  the apron just past it) is on the RIGHT**, and the **wooden exterior stair up to the
  railed rear deck is on the LEFT**. It is a small file (640x345) but the two ends of
  the house are unmistakable at that framing.
- **VERIFIED - `nt2025-aerial-boii.jpg` (BO2-2025).** Independent check on the same
  house from directly above. Its back yard (glasshouse, cold frames with red flowers,
  white curved-roof carport, circular patio) is on one flank and the road on the other;
  the ribbed garage wing sits at the end of the house that falls to your right when you
  stand in that yard and face the house. Same answer.
- **VERIFIED - `nt2025-minimap-bo7.png` (BO7-2025, secondary, footprint shape only).**
  Both houses read as *main block + attached wing*, and the two wings are on **opposite**
  ends - a 180-degree rotational pair, **not** a mirror pair. The BO2-2025 aerial agrees
  with this shape, which is why the secondary image is admitted here.

**Why this is the whole chirality bit, and a better falsifier than R4 section 3.3.**
Because the map is a 180-degree rotational pair, "garage on your right from your own
back yard" is **the same answer for both teams** - one house cannot have it right and
the other left. Under a *global mirror* both flip to "left" at once. So this single
sentence is exactly one bit, it is the bit `NUKETOWN2_HANDEDNESS` encodes, and it is now
**VERIFIED against a BO2-2025 image**. R4 section 3.3's phrasing ("is the sign house's
garage towards the cul-de-sac or away from it?") is *not* symmetric - it is true for one
house and false for the other - so it cannot be asked until you already know which house
is which. **Use the right/left form instead.**

**Gate to add:** for each house take the spawn-side yard centroid, the house centroid and
the garage centroid; the sign of `cross(house - yard, garage - house)` about the up axis
must be the same for both houses **and** must equal the constant. That assertion catches
a half-mirror and does not depend on any colour or naming decision.

---

## Q2. Which house is which colour, seen from each spawn?

### ANSWER: the premise does not hold for BO2-2025. The two houses are ORANGE and WHITE/CREAM - neither is yellow, and neither is blue or green.

- **VERIFIED - `nt2025-street-boii.jpg` (BO2-2025).** House A: **terracotta / burnt
  orange** upper-storey walls with a band of tall windows, over a **cream** ground floor,
  under a pale swooping butterfly roof carrying dark solar panels. The garage wing is
  cream with dark barrel-vault roofs.
- **VERIFIED - `nt2025-aerial-boii.jpg` (BO2-2025).** House B is a **white / cream**
  rounded-modernist pair of capsule volumes with pale blue-grey roof glazing and a dark
  rooftop cylinder. Its yard carries a **garden pod**, a **sand pit** and a
  **shuffleboard court**.
- **CLAIMED (BO7-2025, secondary) - `nt2025-promo3-bo7.png`** shows a back yard with the
  **same** garden pod and sand pit, and the house behind it is **white/cream with blue
  trim**. That ties the yard dressing seen in the BO2 aerial to a white house and
  corroborates House B's colour across versions.
- **CLAIMED (BO7-2025, secondary) - `nt2025-menuscreen-bo7.jpg`** shows an **orange**
  house frontage with two garage doors at grade and a red car in the open bay, with a
  tour coach parked in front of it - House A, restyled, in the re-release.
- **VERIFIED negative control - `nuketown-birdseye-bo.png` (BO1).** The *original*
  Nuketown is a desert test township of small 1950s tract houses in **yellow, teal /
  green, pink and pale blue**, with a **yellow school bus** and an orange fire truck in
  the road. **This is where the "yellow house / green-or-blue house" pairing comes from -
  it is BO1, not BO2-2025.** BO2's Nuketown 2025 is a retro-futurist show-town
  (`nt2025-loadscreen-boii.png`, BO2-2025: pylon sign reading *Discover the City of the
  Future*, geodesic dome, saucer house, tour coach), and its two homes are modernist
  show homes, not tract houses.

**So, per spawn:** from the orange team's back yard you are looking at **your own orange
house**, and the house across the street is the **white/cream** one. From the white
team's back yard, the reverse. There is no yellow and no blue team house in BO2-2025.

**Consequence for R4 section 6.** R4's **C1** (south house yellow -> orange) is
**confirmed** - one house really is orange. R4's **C2** (neutral garage wing) is
**confirmed** - the BO2-2025 garage wing is cream, not the house colour. But R4 assumed
the *other* house stays **blue** (`0x46809f`); the images say it should be **off-white /
cream** with pale blue-grey glazing and blue trim accents. A saturated blue house is a
BO7-era read at best and is not what BO2-2025 shows.

**OPEN:** exact hex values. Nothing here is a colour-calibrated capture - these are
compressed JPEG/PNG at unknown gamma. Treat "terracotta orange" and "off-white cream" as
families to pick within, not as droppers to sample.

---

## Q3. Rear balcony / deck, exterior stair, front ledge, porch canopy

### ANSWER: the rear deck and its exterior stair are REAL and VERIFIED on both houses in BO2-2025. The porch canopy is VERIFIED. The under-window front ledge is OPEN.

- **Rear deck + exterior stair, house A - VERIFIED, `nt2025-street-boii.jpg`
  (BO2-2025).** A **wooden exterior staircase** climbs from the back lawn to a **railed
  deck at upper-floor level**, tucked under the roof sweep and over a recessed
  ground-floor undercroft. It sits at the **end of the house opposite the garage**, on
  the **back-yard side**. A **circular concrete patio** sits at the foot of the flight.
- **Rear deck + exterior stair, house B - VERIFIED, `nt2025-aerial-boii.jpg`
  (BO2-2025).** From directly above, the white house has a **railed landing/deck** on its
  yard flank with a **stair flight descending to the lawn**, plus a bench or planter on
  the deck. Same feature, 180 degrees around, as the symmetry requires.
- **CLAIMED (BO7-2025, secondary) - `nt2025-promo2-bo7.png`** puts a character
  **standing on** such a deck (timber boards, orange top rail on white balusters),
  looking down over the back yard. Useful for one thing only: it shows the deck is a real
  standing and firing position at upper-floor height, not a Juliet balcony. It does
  **not** license BO7's rail colour or plan for the BO2 rebuild.

  **This closes HF-465's "does it even exist in 2025?" falsifier** (R4 section 8 row 2),
  which R4 could only answer from Nuketown 84 / Nukehouse prose. It exists in BO2-2025,
  on both houses.

- **Porch canopy / deep front eave - VERIFIED, `nt2025-sniper-boii.jpg` (BO2-2025).**
  The player is standing under a **deep flat overhanging eave** projecting over a
  concrete deck at a house entry. That is R4 section 5.3's `porch canopy` - but it reads
  as a **wide cantilevered roof plane**, not the 4.0 m x 1.8 m canopy on two posts R4
  specified. Build it as a cantilever off the house and keep posts only if the
  floating-geometry gate needs them.
- **Under-window front ledge - OPEN.** No image in this set shows a ledge under the upper
  front window. R4 section 5.3 derives it from A1 prose only. **Falsifier:** any BO2-2025
  capture of a house *street* elevation at eye level. None of the 20 files is one - every
  BO2-2025 frame here is a yard, an overhead, or the entrance plaza.
- **Climb chain (verge -> low wall -> canopy -> ledge -> sill) - OPEN.** Cannot be
  checked from these images at all. Keep R4 section 5.3's arithmetic derivation and gate
  it on the constants, as R4 already says.

---

## Q4. Overhead orientation - cul-de-sac end, vehicles, mailboxes, shelter

- **Long axis runs across the street, spawn to spawn - VERIFIED,
  `nt2025-minimap-boii.png` (BO2-2025)**, corroborated by `nt2025-minimap-bo7.png`
  (BO7-2025). Two house footprints at opposite ends of the long axis, street between
  them, back yards outboard. **R4 section 2 and the HF-426 aspect stand.**
- **The road is a LOLLIPOP CUL-DE-SAC - VERIFIED, `nt2025-aerial-boii.jpg`
  (BO2-2025).** A **circular kerbed turning head** with a straight **stem** running away
  from it and off the map. The BO2 minimap shows the same circle mid-street with a
  narrower arm off one side. **This is not what we build:** R4 section 3 records a
  *centred* 16 m turning head with two identical blank ends. It is one head at one end,
  with a road leaving at the other.
- **Beyond the head: a THIRD HOUSE - VERIFIED, `nt2025-aerial-boii.jpg` (BO2-2025).**
  A dark pitched-roof house with big white window bands, its own driveway and a **red
  car** on it, sitting past the fence at the head end. This is the single best chirality
  landmark the reference actually has, and it matches R4 section 3.1's A1 prose.
- **Vehicles on the head - VERIFIED, `nt2025-aerial-boii.jpg` (BO2-2025).** The
  **cream-and-maroon Nuketown tour coach** stands on the *orange* house's side of the
  head, nose pointed down the stem. The **box moving truck** (white body, dark cab)
  stands on the *white* house's side, nose down the stem, with a **dark blue saloon**
  tucked right beside it. A **green/teal classic car** sits out in the stem. Note it is a
  *tour coach*, not BO1's yellow school bus (`nuketown-birdseye-bo.png`, BO1).
- **Front-lawn appliance banks are COLOUR-CODED - VERIFIED, `nt2025-aerial-boii.jpg`
  (BO2-2025).** Each front lawn carries a three-unit cooker/appliance bank on a white
  cabinet: **RED tops on the orange house's lawn, BLUE tops on the white house's lawn.**
  Both lawns also have fan-shaped ornamental plants and chain-and-post edging. **This is
  the cheapest chirality anchor in the whole reference** - two small props, instantly
  readable from either spawn, and far cheaper than relocating the turning head
  (R4 section 7 item 1).
- **Back-yard identity - VERIFIED, `nt2025-aerial-boii.jpg` (BO2-2025).** Orange house
  yard: glasshouse and cold frames with planting, a white curved-roof carport, a crate
  store, stepping stones, a circular patio. White house yard: the **garden pod**, a
  **sand pit**, a **shuffleboard court**, stepping stones. The two yards are *not*
  interchangeable dressing - they are different, and that difference is also chirality.
  (R4 section 7 item 3 called this "pure dressing"; it is dressing that carries the
  answer.)
- **Fence holes - CLAIMED (BO7-2025, secondary), `nt2025-promo3-bo7.png`.** A clear hole
  punched through the timber back fence. Corroborates R4 row 18 / A5. Not independently
  visible in a BO2-2025 image in this set.
- **Mailboxes / letterboxes - OPEN.** I looked along both verges at native resolution in
  `nt2025-aerial-boii.jpg` (BO2-2025) and found kerbs, pavements, the appliance banks,
  ornamental plants, chain-and-post edging and a manhole cover - **no mailbox posts.**
  R4 row 16 has them as CORRECT from wiki prose (A4). Either they are outside the
  aerial's framing, or 2025 does not have them. **Falsifier:** a BO2-2025 capture looking
  along a front verge from the street.
- **Bomb / fallout shelter - CLAIMED absent for BO2-2025.** Nothing resembling a shelter
  hatch in any BO2-2025 image here. Consistent with R4 section 2: the shelter belongs to
  the **BO1** map's yellow-house yard, not to 2025. Leave it out.
- **Which end each garage is on - VERIFIED (medium confidence).** Projecting onto the
  street axis in `nt2025-aerial-boii.jpg` (BO2-2025), the **orange** house's garage wing
  sits at the end of that house **away from the third house / the far kerb of the turning
  head**, i.e. on the stem side; by the 180-degree pairing the **white** house's garage
  is therefore at the **head** end. Confidence is medium because the turning head is
  large enough that its near kerb still runs past the orange garage's apron.
  **Falsifier:** one BO2-2025 overhead in which the third house and both garage wings are
  visible in the same frame.

---

## The overhead, hand-drawn, with a stated frame

**Frame (adopt this in `src/nuketown2-layout.ts`).** Plan view of a y-up right-handed
world seen from above (looking down -y), so **+x is to the right of the page and +z is
down the page**. Then:

- **`+x` end of the street** = the **cul-de-sac**: turning head, fence, **third house**
  with its drive and red car beyond it.
- **`-x` end of the street** = the **open end**, where the road stem runs off the map.
- **`-z` house** = the **ORANGE** house (terracotta upper / cream lower). Its garage is
  at its **`-x`** end; its rear deck and exterior stair are at its **`+x`** end.
- **`+z` house** = the **WHITE / CREAM** house. Its garage is at its **`+x`** end; its
  rear deck and exterior stair are at its **`-x`** end.

This frame satisfies Q1 for both teams by construction: face your own house from your own
back yard and the garage falls to your right.

```
        -x  <===================  STREET AXIS  ===================>  +x
   (road stem runs off-map,                              (CUL-DE-SAC end:
    open end)                                             turning head, fence,
                                                          THIRD HOUSE beyond)

  ~~~~~~~~~~~~~~~~~~~~~~~ out of bounds ~~~~~~~~~~~~~~~~~+--------------+
                                                         | THIRD HOUSE  |
                                                         | drive + red  |
  ========== back fence (holes) =========================|    car       |
   -z    TEAM A BACK YARD  =  SPAWN A                    +--------------+
         glasshouse . cold frames . crate store . curved-roof carport
         circular patio . stepping stones . hedges             |
                                                     rear deck |+ stair down
   +-----------+-------------------------------------------+---+
   |  GARAGE   |           ORANGE  HOUSE   ( -z )          |###|
   | 3 barrel  |   terracotta upper wall / cream lower     |   |
   | vault bays|   butterfly roof + solar panels           |   |
   +-----------+-------------------------------------------+---+
     apron           [RED 3-unit appliance bank]     porch canopy
  ------------------------ kerb / pavement ------------------------------
                                          [ COACH ]         _ - - - _
   ROAD   [green classic car]                              /  TURNING  \
                                          [ TRUCK ]       |    HEAD     |
                                          [dk saloon]      \ _ - - - _ /
  ------------------------ kerb / pavement ------------------------------
                   [BLUE 3-unit appliance bank]                  apron
   +---+-------------------------------------------+-----------+
   |###|        WHITE / CREAM  HOUSE   ( +z )       |  GARAGE   |
   |   |  rounded modernist capsules, blue trim     |           |
   +---+-------------------------------------------+-----------+
     |
   stair down + rear deck
        garden pod . sand pit . shuffleboard court . stepping stones
   +z    TEAM B BACK YARD  =  SPAWN B
  ========== back fence (holes) =========================================
  ~~~~~~~~~~~~~~~~~~~~~~~ out of bounds ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

**Handedness check, both teams.** Stand in Spawn A (`-z`, above the orange house) and
face the house: you face `+z`, down the page, so your right hand points to page-left,
which is `-x`, which is where the orange garage is. **Garage on the right.** Stand in
Spawn B (`+z`) and face the house: you face `-z`, up the page, right hand points to
page-right, `+x`, where the white garage is. **Garage on the right.** Both agree, as a
180-degree pair must.

**Setting `NUKETOWN2_HANDEDNESS`.** Do **not** copy a sign from this document - R4
section 3.2 defines the flag against "the `-z` house's garage", and the repo's colour
assignment may not match this document's. Derive it instead from the two facts that are
frame-free:

1. the **orange** house's garage is at the **non-cul-de-sac** end of the street, and the
   **white/cream** house's garage is at the **cul-de-sac** end; and
2. from either back yard, facing your own house, the garage is on your **right**.

Fact 2 is the assertion to gate on, because it is a single bit and it is the one the
owner can re-check in ten seconds in his own copy of the game.

---

## What is still OPEN after this pass

| # | Open item | Falsifier |
|---|---|---|
| 1 | The under-window **front ledge** on the street elevation | Any BO2-2025 capture of a house's *street* face at eye level. All six usable BO2-2025 images here are yards, overheads or the entrance plaza. |
| 2 | **Mailboxes** in BO2-2025 | A BO2-2025 frame looking along a front verge. Not visible at native resolution in the aerial. |
| 3 | Exact **garage-end vs turning-head** relation | One BO2-2025 overhead framing the third house and both garage wings together. Current read is medium-confidence from axis projection. |
| 4 | **Hex colours** | Nothing here is colour-calibrated. Colour families only. |
| 5 | Whether the head sits at the **end** or is offset inboard | The BO2 minimap shows the circle inboard of the street's extent with a narrower arm off one side; the aerial shows it terminating the road. Both can be true (a bulb inside the boundary, stem leaving) but the exact inset is unmeasured. |
| 6 | 5 of the 20 files were **not** inspected (`promo4-bo7`, `teaser2-bo7`, `minimap-bo6`, `minimap84-bocw`, and `birdseye-bo` beyond its control use) | Open them if a later lane needs them; `manifest.json` marks each honestly. |

## Corrections this pass makes to R4

1. **R4 section 3.3's falsifier is not symmetric and should be replaced** by the
   right/left form in Q1. R4's version cannot be asked before you know which house is
   which.
2. **R4 section 6 C1 is confirmed** (one house is orange) but **the other house is
   white/cream, not blue.**
3. **R4 section 8 row 2 closes:** the rear balcony and exterior stair exist in BO2-2025
   specifically, on both houses - not just in Nuketown 84 / Nukehouse prose.
4. **R4's "yellow house" framing** belongs to BO1 Nuketown, confirmed by
   `nuketown-birdseye-bo.png`. Keep it out of the 2025 arena.
5. **R4 section 7 item 3 undersells the yards.** The two back yards are visibly different
   (glasshouse/carport vs garden-pod/sand-pit/shuffleboard) and the front lawns carry
   red-vs-blue appliance banks. That is chirality you can build for the price of
   dressing, without touching the turning head.
