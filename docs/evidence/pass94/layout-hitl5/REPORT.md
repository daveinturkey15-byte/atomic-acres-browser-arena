# PASS 94 / HITL 5 - nuketown2 street corridor and declutter

Lane: Claude Opus 5, branch contrib/dave-gaming-pc/claude/layout-hitl5, branched from
contrib/dave-gaming-pc/claude/nuketown2-bo2-accuracy @ a1219fe8 (the accuracy-2 head
carrying the derived third-house nearX and the unified NUKETOWN2_APPLIANCE_BLUE).
Worktree C:/Users/david/projects/aa-claude-layout. Time box 55 min.

Owner verdict driving it - ledger HF-491, 2026-09-04 17:20, after playing HITL 4:
"the shape of the map hasnt changed but the assets have - it needs to be WIDER IN THE
MIDDLE, have BITS EITHER SIDE OF THE ROAD like it does in the game; its busy,
cluttered; thin out the clutter, streamline it, reform it, refactor it".

Claim-states: **OBSERVED** = I opened the file/image and read it. **MEASURED** = I ran a
measurement reproducible from the script named. **DERIVED** = arithmetic over
OBSERVED/MEASURED values. **INFERRED** = judgement. **OPEN** = not settled, falsifier stated.

---

## 1. The corridor - MEASURED, and the headline finding is a negative

**Our corridor is already at the BO2 reference width. Widening it would make the map LESS
accurate, not more.** This is the one part of the owner verdict the references contradict,
so it is reported rather than acted on.

| Quantity | BO2-2025 reference | Ours (src/nuketown2-layout.ts) | Delta |
|---|---|---|---|
| Street length L (along-street playable extent) | anchor | 36.0 m | - |
| Corridor: house front face to house front face | 0.553 L = **19.91 m** | 2 x 10.0 = **20.00 m** | +0.5 % |
| House width along the street | 0.303 L = **10.91 m** | **11.00 m** | +0.8 % |
| Carriageway (kerb to kerb) | 0.290 L = **10.44 m** | 2 x 5.3 = **10.60 m** | +1.5 % |
| Front verge (kerb to house front), each side | 0.131 L = **4.72 m** | **4.70 m** | -0.4 % |
| **Corridor : house width** | **1.825** | **1.818** | **-0.4 %** |
| Corridor : carriageway | 1.907 | 1.887 | -1.1 % |
| Playable aspect (across : along) | 2.360 | 84/36 = 2.333 | -1.1 % |

Reference figures are the minimap measurements already recorded in the headers of
NUKETOWN2_FRONT_VERGE_DEPTH, NUKETOWN2_STREET_HALF_WIDTH and HOUSE_WIDTH (0.553 L =
221 px of 400 and 0.303 L = 121 px of 400 on nt2025-minimap-bo7.png; carriageway
cross-checked at 0.331 L drawn on nt2025-minimap-boii.png less the 0.038 L stroke
correction). [OBSERVED - source comments]

**Independent check this lane ran.** nt2025-minimap-boii.png (BO2-2025, the PRIMARY
carrier) was de-rotated by PCA on its content mask and its drawn playable polygon measured
at **183 px along-street x 426 px across-street**, aspect **2.328**, against the file
recorded 181 x 427 = 2.359 and our authored 2.333. Two independent scale anchors agree to
0.3 % (183 px = 36 m gives 0.1967 m/px; 426 px = 84 m gives 0.1972 m/px), so the frame is
sound. [MEASURED - scratchpad measure.py, PIL + numpy, CPU only, no GPU]

I did **not** get a defensible sub-metre corridor number off the BO2 minimap itself: it is
a glow render on a hatched background, its house outlines bleed over about 4 px, and my
by-eye read of the two front faces came out at 18.4 m +/- 0.8 m - consistent with 19.9 m
but far too loose to move a constant on. **OPEN.** *Falsifier: a BO2-2025 orthographic
overhead that is not a stylised minimap, or the owner own top-down capture. The
docs/references/nuketown-2025/owner-captures/ directory did not exist at 17:20.* [OBSERVED]

**So why does it play narrow?** Because the width is not the fill. The corridor 20 m is
10.6 m of carriageway plus two 4.7 m verges, and both verges carried a body roughly every
2.5 m of their 36 m run - a continuous waist-high parade that closes the strip at eye level
while every authored number stays correct. The Muse audit reaches the same reconciliation
independently: "the 4.7 m verges are filled ... so the *usable* empty middle is ~4-5 m,
roughly half the BO2 empty middle". [OBSERVED - hitl4-clutter-AUDIT.md corridor section;
INFERRED - the causal claim]

That is what this lane acted on, and a **two-sided** band now pins it: the new corridor
test fails if a later pass narrows the corridor OR widens it past the reference.

---

## 2. Decision table - every verge dressing class, verified against the references

The Muse audit per-station verdicts were re-checked against FINDINGS.md before acting. The
falsifier used for every REMOVE is FINDINGS Q4 own native-resolution census of the
reference verge on nt2025-aerial-boii.jpg: *"kerbs, pavements, the appliance banks,
ornamental plants, chain-and-post edging and a manhole cover - no mailbox posts."* Each
class below is either in that census or absent from it. [OBSERVED - FINDINGS Q4]

| Class (emitter id) | Pairs | Bodies | Reference support | Muse verdict | Mine | Done |
|---|---|---|---|---|---|---|
| verge mailbox post/box/flag | 3 | 6 | Q4 grades mailboxes **OPEN**, not absent | THIN | **KEEP one per drive** | kept |
| verge parcel mailbox pedestal/box | 2 | 4 | none; a second mailbox on the same 36 m | (implied by THIN) | **REMOVE** | done |
| verge wheelie bin 0/1 + lids | 4 | 8 | none in the 6 layout-carrying BO2-2025 images | THIN verge fill | **REMOVE** | done |
| verge street bin + lid | 2 | 4 | none in those 6 | THIN verge fill | **REMOVE** | done |
| verge hydrant body/cap/nozzles | 3 | 6 | none in those 6 | THIN verge fill | **REMOVE** | done |
| verge street sign post / name blade / speed limit | 3 | 6 | Q4 census has no signage; no BO2-2025 image frames the front verge at signage-resolving resolution (street-boii.jpg is a rear-yard viewpoint) | THIN to pylon + one coach board | **REMOVE** | done |
| verge entry planter urn/shrub | 2 | 4 | none as a distinct mass | THIN, >=3 m gaps | **REMOVE** | done |
| verge front planter + soil | 2 | 4 | none as a distinct mass | THIN, >=3 m gaps | **REMOVE** | done |
| verge low wall (HF-437) | 1 | 2 | cover, not dressing | THIN | **KEEP - load-bearing** | kept |
| verge kerb planter (HF-437) | 1 | 2 | cover, not dressing | THIN | **KEEP - load-bearing** | kept |
| verge front hedge | 1 | 2 | first rung of the front climb chain | KEEP | **KEEP** | kept |
| verge planter (outer, past the garage) | 1 | 2 | "ornamental plants" in the census | KEEP | **KEEP** | kept |
| verge appliance cabinet + tops + dials | 7 | 14 | **Q4 VERIFIED**, colour-coded RED/BLUE - the chirality anchor | KEEP | **KEEP** | kept |
| verge sign post x2 + sign board (town pylon) | 3 | 6 | loadscreen pylon, "Discover the City of the Future" | KEEP | **KEEP** | kept |
| verge drive edge | 1 | 2 | kerb / edging in the census | KEEP | **KEEP** | kept |
| lawn + frontage decals (verge lawn *) | - | 19 | cross-mown lawn, chain-and-post edging | KEEP | **KEEP** | kept |

**Totals: 18 paired emitters deleted = 36 bodies. Verge bodies 79 -> 43 (-45.6 %).
pair(builder, ...) call sites in nuketown2-arena.ts 215 -> 197. Coplanar scan boxes 757.**
[MEASURED - grep -c, the new ceiling test own dump, and the coplanar instrument boxes= line]

Every "none" above is scoped, not universal: it means absent from the 6 layout-carrying
BO2-2025 images in the FINDINGS image list, which is the whole reference corpus this lane
has - and the 43-body verge-furniture ceiling forces any class those 6 images missed to
argue its way back in a diff rather than to reappear silently.

Deleted, never hidden - a hidden emitter still costs geometry, a collider, a draw call and
a line in the size ratchet, and the owner word was "thin out", not "turn off".

### Audit items I did NOT act on, and why

- **"Mannequins mid-carriageway = REMOVE"** - a case-insensitive grep for mannequin over
  src/nuketown2-arena.ts returns nothing. This arena emits no mannequins; the audit
  inferred them from a candidate PNG. No action needed. [OBSERVED]
- **"Fences too tall / unbroken = THIN to BO2 lower fences with gaps"** - the fence gaps
  already exist and are load-bearing. The yard() header records that symmetric gaps opened
  an 82.0 m spawn-to-spawn sniper lane straight through both fences at x = -10, and the
  four spans are chosen so no x is in a north gap AND a south gap at once. Lowering or
  re-gapping them is a sightline change needing its own parity and fairness run, not a
  55-minute lane. **HANDED OVER.** [OBSERVED - nuketown2-arena.ts yard()]
- **"Roadside furniture crowding parked bodies - pull >=2 m off"** - the three bodies that
  crowded the coach and truck (hydrant, street bin, sign post) are now deleted, so the
  clearance is satisfied by subtraction rather than by moving anything. [DERIVED]
- **Yard / interior / garage / coach / window clutter (audit ranks 4, 7, 8, 9, 10)** - all
  real, each in a different function. Outside this lane time box. **HANDED OVER.**

---

## 3. Roadside bays - designed, measured, NOT landed

This is the half of HF-491 ("bits either side of the road") that did not fit the box. It is
written down here so HITL 6 starts from numbers rather than from the brief.

The reference (FINDINGS Q4, VERIFIED on the aerial) does not park its vehicles in the
running lane: the coach stands on the orange house side of the head, the box truck and a
dark saloon on the white house side, and only the green classic sits out in the stem.
Ours puts the coach at authored z = -2.65, its 2.6 m body spanning z in [-3.95, -1.35] -
the middle of the north lane, 1.35 m off the centre-line. That single body is the largest
contributor to "no empty middle" after the verge fill. [DERIVED from
NUKETOWN2_STREET_COACH and NUKETOWN2_CENTRAL_TRUCK]

Design that fits every gate, ready to author in nuketown2-layout.ts:

- **Bay depth 2.2 m** into the verge from the kerb line at |z| = 5.3, so a bay spans
  z in [-7.5, -5.3] authored and its pair() partner spans [5.3, 7.5] - **one authored
  rectangle produces both sides, mirrored, by construction.** No hand-written second copy,
  so the 180-degree symmetry gate cannot drift.
- **Clearance behind the bay is already proved:** the furniture line lives at
  VERGE_FURNITURE_Z = -8.55 with a 0.8 m depth budget, so its near face is at -8.15, which
  is 0.65 m clear of a bay outer edge at -7.5.
- **The trap:** a bay at |z| in [5.3, 7.5] is outside the bulb |z| <= 8 square in z only,
  NOT in x. A bay must be confined to x > mouthX (the stem), or the documented verge()
  failure fires and the bay pair() partner lands in the middle of the cul-de-sac - the way
  six verge bodies did on the HF-477 first build. That is why it is not a five-minute
  change. [DERIVED - verge() header, NUKETOWN2_CUL_DE_SAC]
- **Bay lengths** from the bodies they hold: coach 9.1 m -> 11.0 m bay; saloon 4.4 m ->
  6.5 m bay. The 11.7 m truck stays in the bulb, where the aerial has it.
- **Land them through NUKETOWN2_CARRIAGEWAY_FOOTPRINTS**, not as loose slabs: that array is
  the plan union the ground builder cuts before emitting road slabs, so visual geometry and
  the coplanar instrument keep one source of truth and the new asphalt cannot become a
  FINDING pair. [OBSERVED - the array own header]
- Effect: paved width at a bay becomes 10.6 + 2 x 2.2 = **15.0 m locally**, while the
  house-front-to-house-front corridor stays at the reference 20.0 m. That is "wider in the
  middle" without moving a single reference-correct constant.

**OPEN.** *Falsifier for the 2.2 m bay depth: any BO2-2025 overhead in which a kerb pocket
depth can be measured against the carriageway. The aerial shows the wide concrete kerb
aprons at the head but not a scaleable lay-by.*

---

## 4. Gates

All run in this worktree on its own real npm ci install.

    npx tsc --noEmit                                 clean (exit 0)

    npx vitest run src/nuketown2-fidelity.test.ts
      src/collider-visual-parity-gate.test.ts
      src/graphics-profile-contract.test.ts
      src/legacy-main-size-ratchet.test.ts           4 files, 55 tests, all passed

    npx tsx scripts/qa/find-coplanar-pairs.ts        boxes=757, pairs<=0.03m: 95
                                                     FINDINGS (different materials,
                                                       no offset): 0
                                                     FENCED: 69, SAME-MATERIAL: 26
                                                     HOUSE-INTERIOR: 0, STREET: 0

No gate was weakened. No band was moved. Two assertions were **added**:

1. **Corridor two-sided band** - corridor / houseWidth must stay within 3 % of the
   reference 1.825, and both absolute figures within 5 % of the measured reference. New
   coverage, and it is what will stop a future "make it wider" pass from overshooting BO2.
2. **Verge ceiling at 43 bodies** - set AT the post-cut count, i.e. with zero headroom. A
   ratchet at the current value cannot be satisfied by adding anything, so it is the
   non-weakening form: a later pass wanting one more verge emitter must argue for it in a
   diff. The same test asserts the nine deleted classes stay DELETED rather than hidden,
   and that the five load-bearing pieces (HF-437 low wall + kerb planter, climb-chain front
   hedge, colour-coded appliance bank, the retained letterbox) survive any later declutter.

Untouched, therefore unaffected: garage-RIGHT from both spawns, pair() 180-degree symmetry,
the spawn fairness bands, the parity walk-through budget of 0, the coplanar classes and the
size ratchet. Nothing this lane changed moves a spawn, a collider band or a walkable
surface - all 36 deleted bodies were verge dressing outboard of the kerb line.

---

## 5. Open items handed to HITL 6

1. **Roadside bays** - designed and measured in section 3, not landed. The x > mouthX
   confinement is the trap to respect.
2. **Vehicle re-seat** - coach out of the running lane into the north bay. Touches
   NUKETOWN2_STREET_COACH.z, a MEASURED 0.150 L offset from the truck, and the truck
   carries the overdrive core derivation. Needs the fidelity suite plus
   overdrivePositionForArena re-run; do not eyeball it.
3. **Side alleys between each house and the perimeter fence** - the third roadside item in
   the brief. yard alley planter exists at authored (-15.6, -33.0); the alley itself is not
   authored as a space with cover.
4. **Audit ranks 4, 7, 8, 9, 10** - yard, garage, interior, coach-flank and sill clutter.
   Same method as section 2: census the emitters, check each class against FINDINGS, delete
   the unsupported ones.
5. **Corridor falsifier** - a non-stylised BO2-2025 overhead would let the section 1
   measurement close from the primary image instead of resting on the BO7 minimap.


---

## 6. Bays landed? NO - the handed-down design does not survive contact, and here is the one that does

Lane: Claude Opus 5 (HITL 5 continuation), same worktree and branch, 30-minute box
17:36-18:05. Head at entry 7ade1887. **The bays are NOT landed.** Three independent
blockers were found in section 3's design, none of which is a matter of time, and the
honest deliverable is the corrected specification below rather than a half-cut map.

### Blocker 1 - the bays cannot go through `pair()` AT ALL, and the trap is worse than stated

Section 3 records the trap as "confine the bay to x > mouthX". That is not sufficient; it
is not even close. `pair()` (nuketown2-arena.ts:851) emits at authored `(x, z)` **and
`(-x, -z)`**. The bulb occupies authored x in [-16.5, -0.5] at every |z| <= 8, and a bay
at |z| in [5.3, 7.5] is inside that z band by construction. So a bay at x in [a, b] is
clear only if BOTH `a > mouthX` and `-b > mouthX`, i.e. a > -0.5 AND b < 0.5. The stem is
x in [-0.5, 18]; the intersection of the stem with its own 180-degree image is
**x in [-0.5, 0.5] - one metre.** An 11.0 m bay, a 6.5 m bay, or any bay at all, cannot be
a `pair()` body. [DERIVED - pair() body, NUKETOWN2_CUL_DE_SAC; the same arithmetic
verge() states in its own header]

**The resolution already exists in the file.** `street()` emits every carriageway body
through `centred()` - ONCE, no 180-degree partner - under the enumerated
`EXPECTED_ASYMMETRIC_CARRIAGEWAY` exception, which is paid for by four properties, and
property (i) is *"every road body has an EXACT z-MIRROR partner"*. That is precisely the
"one authored rectangle, both sides, mirrored, by construction" the design wanted - it is
just a z-mirror in `street()`, not a 180-degree `pair()`. A bay pair authored this way
satisfies (i) by construction, (ii) top <= 0.30 m, (iii) |z| <= 10.0 corridor half, and
(iv) the road-plus-verge region stays 180-symmetric, because the bay replaces lawn with
asphalt without changing which square metres are covered. **No gate has to move.**
[OBSERVED - nuketown2-fidelity.test.ts:1719-1905]

### Blocker 2 - the driveway apron eats the bay lengths

The north verge is crossed by `street driveway north` at x in [4.25, 9.25]
(GARAGE_X0..GARAGE_X1), running from the garage door out to the kerb at KERB_Z = -5.3. It
occupies the exact band a bay wants. That leaves two free runs on the north verge:
**x in [-0.5, 4.25] = 4.75 m** and **x in [9.25, 18.0] = 8.75 m**.

- The 11.0 m coach bay **does not fit anywhere on the north verge.** The longest possible
  run is 8.75 m; the coach body alone is 9.1 m.
- The 6.5 m saloon bay fits only in the outer run, not the mouth run (4.75 m gross).

**Consequence, stated plainly: the vehicle re-seat of section 5 item 2 is dead as
designed.** No bay that fits holds the 9.1 m coach, so `NUKETOWN2_STREET_COACH` and the
0.150 L measured offset from the truck that the overdrive core derives from are **left
untouched** - which is the branch the brief asked for ("otherwise leave the vehicles and
say so"). The bays are roadside widening pockets, which is what the owner asked for
("bits either side of the road", "wider in the middle"); they are not car parks.
[DERIVED - GARAGE_X0/GARAGE_X1 at nuketown2-arena.ts:264-265, NUKETOWN2_GROUND_DRESSING]

### Blocker 3 - the fast path grows grass through the paving

The tempting shortcut is to lay the bay as a `drive`-tier dressing piece ON TOP of the
lawn tile, using the integer polygonOffset tiers (lawn is -2, drive is -1) so the coplanar
instrument classes it as offset-separated rather than a FINDING, and split no lawn at all.
It passes the coplanar gate and it is wrong: `nuketownRebuildLawnRegions()` drives the
INSTANCED GRASS FIELD off the same dressing table, and a decal is not a solid, so the
grass keep-out does not fire. Grass would grow straight through the paving. **The bay must
be a real cut in the lawn table, not a stacked tier.** [OBSERVED - fidelity test :996-1002
lawn regions, :1016 keep-out]

### The corrected specification - complete, and it is what HITL 6 should type in

Authored frame throughout. Kerb line |z| = 5.3, bay depth **2.2 m** (section 3's number,
still OPEN on the same falsifier), so a bay is z in [-7.5, -5.3] and its exact z-mirror is
z in [5.3, 7.5]. Both x-runs clear the apron by a 0.2 m kerb margin and stop 0.3 m short
of the map edge.

| Bay | authored x0 | x1 | length | derivation |
|---|---|---|---|---|
| `bay mouth` | -0.2 | 4.05 | 4.25 m | mouthX + 0.3 .. GARAGE_X0 - 0.2 |
| `bay outer` | 9.45 | 17.7 | 8.25 m | GARAGE_X1 + 0.2 .. offMapX - 0.3 |

[DERIVED - all four numbers from NUKETOWN2_CUL_DE_SAC and the garage span. Author them as
expressions, never as literals: re-typing these is how the shipped map's rare-gun sites
came to describe a house that had moved.]

1. **Table.** Add the two rectangles (x-span authored once; the z-span is
   `[kerb, kerb + 2.2]` mirrored) to `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` as four entries
   generated from two authored rects by one z-mirror map, so the two sides cannot drift.
   They must live in the footprint table, not as loose slabs: it is the union
   `buildNuketown2Ground()` cuts and the union `scripts/qa/find-coplanar-pairs.ts`
   classifies STREET against, and the bays have to be in both. **This is exactly why bays
   are carriageway footprints and NOT verge bodies, so the 43-body verge ceiling holds
   untouched and no headroom is raised.**
2. **Geometry**, in `street()`, both emitted through `centred()` from one authored rect:
   `carriageway bay <id> <side>` asphalt at centre y -0.06, size [len, 0.12, 2.2] - the
   same slab section as `carriageway stem`, so the two abut at |z| = 5.3 with no plan
   overlap and cannot become a coplanar pair; and `carriageway bay kerb <id> <side>` at
   centre y 0.06, size [len, 0.24, 0.3] along the bay's OUTER edge - the same 0.24 m lip
   and 0.3 m tread as `carriageway stem kerb`, under the 0.42 m autostep, so it reads as
   a kerb and is never a wall, and it is a plain box collider the parity gate measures
   like any other. The `nuketown2 carriageway ` name prefix is load-bearing: it is what
   puts both bodies in the roadBodies half of the exception, where property (i) checks the
   z-mirror the construction already guarantees.
3. **Lawn cut - the actual work, 3 entries become 11.** The bays overlap
   `verge lawn stem north 0`, `verge lawn stem north 1` and `verge lawn stem south`, and
   the ground-cut gate (fidelity test :933) fails on any dressing overlapping a
   carriageway footprint. Replace with, north side (full depth = z in [-10, -5.3]):
   `[-0.5,-0.2]` full depth; `[-0.2,4.05]` z in [-10,-7.5]; `[4.05,4.25]` full depth;
   `[9.25,9.45]` full depth; `[9.45,17.7]` z in [-10,-7.5]; `[17.7,18]` full depth - and
   the exact z-mirror of all six on the south side, where the single current tile spans
   x in [-0.5, 18] (five pieces there, since the south verge carries no apron in the
   stem). Every new tile keeps `paired: false`, which is what auto-registers it in
   `EXPECTED_ASYMMETRIC_CARRIAGEWAY` - that list is derived from the table's own flag, so
   a tile added there cannot be missed and one deleted cannot be left behind.
4. **Low wall / planter at the bay ends** (BO2 shows masses at the pocket ends): these are
   the only pieces that would be verge bodies, and the ceiling is at 43 with zero
   headroom, so they cannot be added without an argued diff that raises it. Either author
   them as kerb-height carriageway islands at the bay ends (the `head kerb island`
   precedent - inside the exception, not verge bodies, and capped at 0.30 m by property
   (ii)), or hold them. **Held this lane.**
5. **Effect.** Paved width at a bay becomes 10.6 + 2 x 2.2 = **15.0 m locally**, the
   corridor stays 20.0 m and the ratio stays 1.818, and the new hard surface either side
   of the road is 2 x (4.25 + 8.25) x 2.2 = **55.0 m2**. That is "wider in the middle"
   with no reference-correct constant moved. [DERIVED]

### Tests to add with it

- Both bays present on both sides, derived from the footprint table (never a literal
  list), each an exact z-mirror of its partner.
- Every bay rect entirely at `x > NUKETOWN2_CUL_DE_SAC.mouthX` - the section 3 trap, kept
  as an assertion even though `centred()` makes the `pair()` failure impossible, because
  it is what stops a later pass re-authoring a bay through `pair()`.
- No bay rect overlaps the `street driveway north/south` apron rects (blocker 2,
  ratcheted so the apron collision cannot be rediscovered a third time).
- Corridor ratio band, verge ceiling of 43, coplanar STREET 0 and HOUSE-INTERIOR 0 - all
  unchanged, all already asserted, none touched.

### Gates at hand-off

Nothing but this file changed, so the gates are re-run rather than newly claimed.

    npx tsc --noEmit                                 clean (exit 0)
    npx vitest run src/nuketown2-fidelity.test.ts
      src/collider-visual-parity-gate.test.ts
      src/graphics-profile-contract.test.ts
      src/legacy-main-size-ratchet.test.ts           4 files, 55 tests, all passed
    npx tsx scripts/qa/find-coplanar-pairs.ts        boxes=757, pairs<=0.03m: 95,
                                                     FINDINGS: 0, FENCED: 69,
                                                     SAME-MATERIAL: 26,
                                                     HOUSE-INTERIOR: 0, STREET: 0

**HITL 6 owns the landing.** The specification above is buildable in one sitting by anyone
who starts from the table rather than from the brief; what cost this box was proving that
the previous table could not be built at all.
---

## 7. Bays landed - YES. What was built, what it measures, what it cost

Lane: Claude Opus 5 (HITL 6), same worktree and branch, 40-minute box 17:47-18:20. Head at
entry `04d2ef43`; `68d3a0d6` (the Muse review commit) landed underneath mid-lane from a
concurrent session in this worktree, so this commit sits on that. **The bays are landed,
exactly to section 6's corrected specification, with the four tests it names.** Section 6
stands as written: every number below is the number it derived, reached by building it.

### What was built

| | authored x0 | x1 | length | z (north) | z (south) | area |
|---|---|---|---|---|---|---|
| `bay mouth` | -0.2 | 4.05 | 4.25 m | [-7.5, -5.3] | [5.3, 7.5] | 2 x 9.35 m2 |
| `bay outer` | 9.45 | 17.7 | 8.25 m | [-7.5, -5.3] | [5.3, 7.5] | 2 x 18.15 m2 |

Every one of those eight numbers is an EXPRESSION, never a literal: `mouthX + 0.3`,
`GARAGE_SPAN.x0 - 0.2`, `GARAGE_SPAN.x1 + 0.2`, `offMapX - 0.3`, and `[KERB, KERB + 2.2]`
z-mirrored. Section 6 said to author them that way and it was load-bearing straight away -
the garage span lived in `nuketown2-arena.ts` as a private const, so landing it needed
`NUKETOWN2_HOUSE_WIDTH`, `NUKETOWN2_HOUSE_CENTRE_X`, `NUKETOWN2_GARAGE_WIDTH` and
`NUKETOWN2_GARAGE_SPAN` hoisted into `nuketown2-layout.ts`, where the bay runs and the
house layout now read one source instead of three copies of 11 / 5 / -1.25. [OBSERVED]

Five edits, and that is the whole change:

1. **`nuketown2-layout.ts`** - the garage span above; `NUKETOWN2_BAY_DEPTH = 2.2` and
   `NUKETOWN2_BAY_RUNS` (the two authored x-runs); `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` grown
   from 2 rectangles to 6 by **one z-mirror map over the two runs**, so the two sides
   cannot drift apart; and `isNuketown2BayFootprint()`, the one predicate all three
   consumers filter on.
2. **`street()`** - eight new bodies through `centred()`, derived from that same footprint
   table: `nuketown2 carriageway bay {mouth,outer} {north,south}` (asphalt, centre y -0.06,
   0.12 m section - the identical slab as `carriageway stem`, so the two abut at |z| = 5.3
   with no plan overlap) and `... kerb` (0.24 m lip on a 0.3 m tread along the bay's OUTER
   edge, the identical section as `carriageway stem kerb`, under the 0.42 m autostep).
3. **`NUKETOWN2_GROUND_DRESSING`** - the stem verge lawn re-tiled from **3 tiles to 11**
   (6 north, because the north verge also carries the driveway apron; 5 south, where the
   stem has no apron and three pieces merge into one). Complete cover, no overlaps, all
   `paired: false`, so they auto-register in `EXPECTED_ASYMMETRIC_CARRIAGEWAY` off the
   table's own flag.
4. **`nuketown2-fidelity.test.ts`** - the four ratchet tests, the bay names added to the
   asymmetric-carriageway list *derived from the footprint table*, the verge ceiling split
   (below), and one numerical-hygiene fix (below).
5. **`REPORT.md`** - this section, plus the two Muse SHIP-WITH-FIXES prose corrections
   (F1 signage scoping, F2 absence-claim scoping) in section 2.

### The measurements

| Quantity | Before | After | Note |
|---|---|---|---|
| Paved width at a bay | 10.60 m | **15.00 m** | +4.4 m local, exactly as derived |
| New hard surface either side of the road | - | **55.00 m2** | 2 x (4.25 + 8.25) x 2.2 |
| Corridor, front face to front face | 20.00 m | **20.00 m** | untouched |
| Corridor : house width | 1.818 | **1.818** | untouched, reference 1.825 |
| Carriageway footprint rectangles | 2 | 6 | 2 authored + 1 z-mirror map |
| Stem verge lawn tiles | 3 | 11 | the real cut, not a stacked decal |
| Verge FURNITURE bodies | 36 | **36** | bays are carriageway, not verge |
| Coplanar scan boxes | 757 | 819 | +8 bay bodies, +46 ground tiles, +8 lawn tiles |
| Colliders | 293 | 347 | +54, of which 46 are ground tiles |
| Lawn blades / draw calls | 9,517 / 9 | 8,928 / 11 | grass evicted from 55 m2 of new paving |

[MEASURED - `buildNuketown2()` under tsx, before/after on the same worktree via
`git stash`; the coplanar instrument's own `boxes=` line]

**Vehicles were NOT re-seated, exactly as section 6 branched.** The longest bay is 8.25 m
and the street coach is 9.1 m, so no bay holds it; `NUKETOWN2_STREET_COACH` and the 0.150 L
measured truck offset the overdrive core derives from are byte-identical. The bay-end low
walls stay **held** for the reason section 6 gave - they would be verge bodies against a
ceiling with zero headroom - and the four tests assert the kerb lip is 0.24 m so nobody can
grow one into a wall. [OBSERVED - diff]

### Three things section 6 did not predict, and what was done about them

**(a) The verge ceiling counts lawn decals, and the split fixes it by TIGHTENING.**
Section 6 said "the 43-body verge ceiling holds untouched" because bays are carriageway
bodies. True of the bays - and false of the lawn cut they require: the ceiling counts every
name containing `" verge "`, and 8 of the 11 new stem tiles are `verge lawn stem ...`. The
count was 36 furniture + 7 dressing decals = 43; it would have become 51.

Raising 43 to 51 would have handed the furniture line eight free props, which is the exact
failure mode the ceiling exists to prevent. Renaming the tiles to dodge the filter would be
gaming it. So the count is **split, and both halves ratcheted at their exact current value
with zero headroom**: furniture <= **36** (excluded by reading the arena's own
`NUKETOWN2_GROUND_DRESSING` ids, not by a name pattern, so nothing can be renamed into the
gap) and the aggregate <= **51**. That is strictly stronger than what it replaced on the
class the gate names - the effective furniture cap drops 43 -> 36 - and it closes a
laundering route the single count allowed (delete a lawn tile, add a prop, stay at 43).
**This is a ratchet refinement, not a relaxation, and it is the only gate number that
moved.** [DERIVED - the test's own dump, before and after]

**(b) The ground-cut gate was passing on floating-point luck.** It asserts an EXACT zero
overlap area between built tiles and authored rectangles, and reconstructs a tile edge as
`centre -/+ size / 2` - two float64 roundings. Every cut line in this arena before the bays
happened to round the harmless way; `4.05`, `9.45` and `17.7` do not, and the gate red-ed
on overlaps of 6.1e-17 m2 and 3.9e-15 m2. The fix is `snapM()`, which quantises that
reconstruction to a **nanometre** - eight orders of magnitude below the 1e-4 m plan epsilon
`nuketown2-arena.ts` itself uses, thirteen below anything a human authors. **No assertion
was loosened**: they all still demand exact equality, on a number that is now deterministic
rather than carrying two ulps of reconstruction noise. [MEASURED - both failures reproduced
and named in the test's own header]

**(c) The ground tiler multiplies, and it cost 46 tiles.** `buildNuketown2Ground()` emits
one tile per (x-cut, z-cut) cell, so 4 new x-cuts and 2 new z-cuts across a 36 x 84 m grid
turned 67 ground tiles into 113 and 293 colliders into 347. That is the cost
`NUKETOWN2_CARRIAGEWAY_FOOTPRINTS`' own header warns about for the bulb's disc, paid here
for the bays, and it is reported rather than hidden: no draw-call or collider budget in the
repository moved (`graphics-profile-contract` and `nuketown-lawn-field` both green), the
tiles are all one material, and merging same-material ground runs is a real optimisation
that belongs in its own pass. **OPEN.** *Falsifier: a frame-time or draw-call measurement
on this map showing the ground tiling in the top costs - which needs the GPU this lane was
told not to touch.* [MEASURED / OPEN]

### The four tests, and what each one ratchets

All in `src/nuketown2-fidelity.test.ts`, in the HF-491 describe block:

1. **`lands a roadside bay on both sides of the stem, each an exact z-mirror of its
   partner`** - the bay list is derived from the footprint table (never a literal), each
   rect has an exact z-mirror partner, and for each one the asphalt AND the kerb exist in
   the world at the authored rectangle, flush with the road surface, kerb 0.24 m and under
   the 0.30 m kerb ceiling on its outer edge. Then the three headline numbers: 15.0 m
   paved, +4.4 m local, 55.0 m2 new hard surface, corridor still 20.0 m.
2. **`keeps every bay clear of the cul-de-sac mouth, so none can be re-authored through
   pair()`** - every bay starts past `mouthX`, AND the falsifier is asserted positively:
   each bay's own 180-degree image lands inside the bulb's bounding square, which is *why*
   no bay of any length can be a `pair()` body. Blocker 1, ratcheted.
3. **`keeps every bay clear of the driveway aprons that cross the north verge`** - zero
   overlap against the arena's own apron rects, plus the 0.2 m garage margins and the
   4.25 / 8.25 m lengths asserted as expressions off `NUKETOWN2_GARAGE_SPAN`, so if the
   garage moves the bays move with it. Blocker 2, ratcheted so it cannot be rediscovered a
   third time.
4. **`cuts the bays out of the lawn table, so no instanced grass grows through the
   paving`** - three assertions in the order they would fail: no lawn REGION laps a bay; no
   grass BLADE root stands inside a bay (measured on all 8,928 instances, not inferred from
   the table); and the re-tiled stem verge still covers its band completely with no
   overlapping tiles, sampled on a 0.13 m lattice. Blocker 3, ratcheted - **this is the
   assertion the brief asked for, and it fires on the real instanced field.**

Everything else was kept and re-run, not re-claimed: two-sided corridor-ratio band, verge
ceiling (now two-sided, see (a)), `pair()`/`centred()` symmetry properties (i)-(iv),
garage-RIGHT handedness, spawn fairness bands, parity walk-through budget 0, coplanar
HOUSE-INTERIOR 0 and STREET 0, and the `legacy-main` size ratchet (untouched - this change
does not go near that file).

### Gates

    npx tsc --noEmit                                 clean (exit 0)
    npx vitest run src/nuketown2-fidelity.test.ts
      src/collider-visual-parity-gate.test.ts
      src/graphics-profile-contract.test.ts
      src/legacy-main-size-ratchet.test.ts           4 files, 59 tests, all passed
                                                     (was 55; the four new tests are the +4)
    npx vitest run src/nuketown-lawn-field.test.ts
      src/grass-placement.test.ts
      src/grass-system.test.ts                       3 files, 16 tests, all passed
    npx tsx scripts/qa/find-coplanar-pairs.ts        boxes=819, pairs<=0.03m: 141,
                                                     FINDINGS: 0, FENCED: 115,
                                                     SAME-MATERIAL: 26,
                                                     HOUSE-INTERIOR: 0, STREET: 0

Also re-run green, because the layout module's exports changed: the six other nuketown test
files (28 tests) and the four dependent suites - destructible shed registry, overdrive
line-of-sight, railgun authority, raytracing arena-proxy coverage (30 tests).

### Claim-states

- **MEASURED**: every number in the measurement table, both blocker-(b) overlap values, the
  before/after tile, collider and blade counts, and every gate line above.
- **DERIVED**: 55.0 m2, 15.0 m, +4.4 m, the 4.25 / 8.25 m bay lengths - all arithmetic over
  `NUKETOWN2_CUL_DE_SAC` and `NUKETOWN2_GARAGE_SPAN`, and all now asserted rather than
  written down.
- **OPEN**: the 2.2 m bay depth, on section 3's original falsifier (a BO2-2025 orthographic
  overhead that is not a stylised minimap); the +46 ground tiles, on the falsifier in (c);
  the bay-end low walls, HELD, and they need a diff that argues the verge ceiling up.
- **Not claimed**: nothing here was seen running. No browser, no GPU, no preview server was
  touched this lane - the owner is running ComfyUI. Every statement above comes from node
  builds of the arena and from the gates.
