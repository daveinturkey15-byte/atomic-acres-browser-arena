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
| verge wheelie bin 0/1 + lids | 4 | 8 | none in any BO2-2025 image | THIN verge fill | **REMOVE** | done |
| verge street bin + lid | 2 | 4 | none | THIN verge fill | **REMOVE** | done |
| verge hydrant body/cap/nozzles | 3 | 6 | none | THIN verge fill | **REMOVE** | done |
| verge street sign post / name blade / speed limit | 3 | 6 | Q4 census has no signage; no BO2-2025 street-elevation image exists at all | THIN to pylon + one coach board | **REMOVE** | done |
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

