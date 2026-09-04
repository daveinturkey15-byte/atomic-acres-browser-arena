# Nuke Town accuracy, round 3 - vehicle seating in the cul-de-sac

**Lane:** `contrib/dave-gaming-pc/claude/nuketown2-accuracy-3`, Opus, 2026-09-04.
**Target:** Black Ops 2 **Nuketown 2025** (`BO2-2025`) only.
**Reference:** `aa-claude-research/docs/references/nuketown-2025/FINDINGS.md` + `manifest.json`;
critics at `aa-claude-research/docs/evidence/pass94/gemini-reference-critic/`.

## Claim-state key

| State | Means |
|---|---|
| **VERIFIED** | A named gate ran and is quoted below, or a script printed the number. |
| **DESIGNED** | Built and type-checked, but only a capture can confirm how it reads. |
| **OPEN** | Not settled. The falsifier is written down. |

---

## 0. What this branch is

`origin/contrib/dave-gaming-pc/claude/nuketown2-geometry-2` was believed not to exist, so this
lane took the brief's fallback and merged the two named lanes itself:

> **CORRECTED BY THE VERIFY PASS (Opus, 2026-09-04). THE BRANCH DOES EXIST.**
> `git ls-remote origin 'refs/heads/*nuketown2*'` lists it at `daf398ba`, pushed 22:33:43, and
> its reconcile commit `e3e6a8be feat(nuketown2): geometry 2 - reconcile turning head, rooflines
> and z-fight into one line` is dated 22:25:23 - both BEFORE this lane's own `8de62756`
> (22:39:46). The lane was working from a stale fetch. `git merge-base --is-ancestor` confirms
> geometry-2 is **NOT** an ancestor of this HEAD, and the two diverge by 379 files (it carries
> the pass93 candidate line, the z-fight sweep `e46ca6c9` and a great deal more). This branch is
> therefore NOT on the base the brief intended. See TODO 1.

- `origin/contrib/dave-gaming-pc/claude/nuketown2-turning-head` - **MERGED**
- `origin/contrib/dave-gaming-pc/claude/nuketown2-rooflines` - **MERGED**

VERIFIED by `git merge-base --is-ancestor <branch> HEAD` for each, which printed
`TURNING-HEAD MERGED` and `ROOFLINES MERGED`.

So the circular kerbed bulb, the rebuilt timber exterior flights and the roofline/rake work are
already inside every measurement below. The Gemini critics' two loudest P0s - *"the street
remains a straight rectangular asphalt corridor ... completely omitting the circular lollipop
cul-de-sac"* and *"floating white rectangular block treads ... with ZERO stringers, risers,
balustrades, or handrails"* - are answered by those lanes, not by this one. This lane's job was
what is left after them.

---

## 1. The whole plan, re-measured against the aerial anchors

Measured by running `npx tsx` against `src/nuketown2-layout.ts` and printing, not from memory.
`L` = `NUKETOWN2_STREET_LENGTH` = 36 m. The reference column is FINDINGS Q4 and the schematic's
first-party minimap pixel ratios.

| Anchor | Reference (L) | Ours before (L) | Ours after (L) | Delta | State |
|---|---|---|---|---|---|
| House width along the street | 0.303 | 0.3056 | 0.3056 | +0.9 % | VERIFIED, untouched |
| Street corridor, front wall to front wall | 0.553 | 0.5556 | 0.5556 | +0.5 % | VERIFIED, untouched |
| House depth | 0.363 | 0.3611 | 0.3611 | -0.5 % | VERIFIED, untouched |
| Garage street frontage | 0.125-0.145 | 0.1389 | 0.1389 | in band | VERIFIED, untouched |
| Bulb diameter | *unmeasured* | 0.4444 | 0.4444 | - | **OPEN** (FINDINGS open item 5) |
| Stem width / bulb diameter | 0.675 | 0.6625 | 0.6625 | -1.9 % | VERIFIED, untouched |
| Coach offset along the street | 0.178 | 0.1778 | 0.1778 | -0.1 % | VERIFIED, untouched |
| Coach offset across the street | 0.150 | 0.1500 | 0.1500 | 0 | VERIFIED, untouched |
| Truck length, box + cab | 0.325 | 0.3250 | 0.3250 | 0 | VERIFIED, untouched |
| Truck z south of the centre-line | 0.076 | 0.0764 | 0.0764 | +0.5 % | VERIFIED, untouched |

**Every anchor the reference actually measures is unchanged by this pass.** The one number that
moved - the truck's seat *along* the bulb - is one no reference measurement pins; HF-477
authored it, and authored it off the wrong end of the vehicle.

---

## 2. Item (1): the coach, re-seated into the turning head

### The deviation, in square metres

The brief asks for "coach re-seated into the turning head at the measured 0.150 L offset". The
0.150 L across-offset was already exact to four decimals. What was actually wrong is that
**the coach was not standing on the road.**

The bulb is a **circle** of radius 8 m centred at authored x = -8.5. The stem is a **rectangle**
that only begins at that circle's *bounding-square* edge, x = -0.5. Between the two, on each
side, sits an unpaved lune - 3.35 m2 per side - where the circle has already fallen away and the
rectangle has not yet begun. The coach was parked across the north one.

Nothing caught it, because the two assertions that look like they would do not: the coach's `z`
is checked against the **stem's** half width, and the truck's `x` against the bulb's **bounding
square**. A body standing on the lune passes both.

Sampled at 2000x2000 per body against `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS`:

| Body | Plan area | Off-carriageway BEFORE | Off-carriageway AFTER |
|---|---|---|---|
| **Coach** | 23.66 m2 | **1.2819 m2 (5.42 %)** | **0.8679 m2 (3.67 %)** |
| Truck cargo box | 16.90 m2 | 0.0000 m2 | 0.0000 m2 |
| Truck cab | 13.52 m2 | 0.0000 m2 | 0.0000 m2 |
| Dark saloon | 8.36 m2 | 0.0000 m2 | 0.0000 m2 |
| Green classic | 8.36 m2 | 0.0000 m2 | 0.0000 m2 |

**-32 % on the coach.** VERIFIED - script output quoted in section 5.

> **SCOPED BY THE VERIFY PASS (Opus, 2026-09-04), and the scope matters.** The table above
> measures each vehicle's **solid plan rectangle**. `coach()` also emits WHEELS at
> `width + 0.2` and chrome BUMPERS at `x +/- (length / 2 + 0.1)`, and those are precisely the
> parts a capture sees sitting on grass. Re-sampled at 3000x3000 over the full emitted envelope
> (body + 2 wheels + 2 bumpers, 25.21 m2 of plan):
>
> | Envelope | Off-carriageway BEFORE | Off-carriageway AFTER |
> |---|---|---|
> | Solid body only, 9.1 x 2.6 (what the gate measures) | 1.2819 m2 | 0.8679 m2 (**-32 %**) |
> | Body + wheels + bumpers (what a capture sees) | 1.3615 m2 | 1.3008 m2 (**-4.5 %**) |
>
> Per part, the seat TRADES one overhang for another: the front WHEEL comes off the lune
> (0.6634 -> 0.0000 m2) and the front chrome BUMPER goes onto it (0.0000 -> 0.4563 m2), because
> at `x = -0.5625` that bumper straddles the gap between the disc's edge and the stem mouth at
> `x = -0.5`. The move is still an improvement and the SOLID body - the cover, the thing that
> reads as the vehicle - genuinely improves 32 %; but **-32 % is not what capture station 1 will
> show**, and the lane's own open item ("this may now read worse in a capture than before") is
> closer to the truth than this headline. See TODO 3.

### Why the fix lands on the truck and not on the coach

The coach has no free coordinate. `NUKETOWN2_STREET_COACH.x` is authored as
`NUKETOWN2_CENTRAL_TRUCK.x + 6.4`, where 6.4 m **is** the measured 0.178 L, and `z` is the
measured 0.150 L off the truck. Both are pinned by an existing gate, and re-typing either would
be moving a reference measurement to suit our geometry - the exact failure that file's header
exists to prevent. So the only lever is **where the truck sits in the bulb**, and that number
was authored.

HF-477 authored it off the wrong end:

> *"the only free parameter is how far the nose reaches. At -10.6 the front bumper lands at
> authored x = -2.03 ... so the nose stops 0.43 m short of the kerb line"*

The truck is nosed **down the stem**, so its nose points into the widest part of the road and
can never be the binding corner.

### The two real walls, both now written as inequalities in the source

**Wall 1 - the disc's own corners.** The cargo box's *rear* corners sit at
`(x - boxLength/2, z +/- width/2)`, i.e. at the truck's own |z| = 4.05, where the 16 m disc is
only 13.80 m across:

```
(x - boxLength/2 - centreX)^2 + (|z| + width/2)^2 <= radius^2
  => x >= centreX - sqrt(radius^2 - (|z| + width/2)^2) + boxLength/2 = -12.149
```

**Wall 2 - a player, and it binds 0.49 m earlier.** *Found by the gate, not by reasoning.*
HF-436 made the cargo box a real room enterable from three mouths, one of them the -x rear end,
and `nuketown2-fidelity.test.ts` probes a standing player 0.6 m behind that tail. At the pure
corner limit the truck backs its rear mouth into the bulb's own kerb ring and that probe fails -
correctly, because a truck you cannot walk into from behind has lost the route HF-436 built. So
the rear approach is a constraint of its own, measured on the truck's centre-line z (where the
probe stands) rather than at the box's outer flank:

```
x >= centreX - sqrt(radius^2 - z^2) + boxLength/2 + (0.6 + 0.5) = -11.6625
```

`TRUCK_DEEPEST_X = max(wall 1, wall 2)`, and `TRUCK_BULB_CLEARANCE = 0.05` holds the seat off
it: **x = -11.6125**, against -10.6 before. The truck sits **1.01 m deeper** in the bulb; the
coach follows to -5.2125.

### What was deliberately kept intact

- **The overdrive core's derivation.** `overdrivePositionForArena('nuketown2')` reads
  `NUKETOWN2_CENTRAL_TRUCK.x` through `nuketown2HandedX`, so the 2x-damage core moves with the
  truck **by construction** - nothing about the derivation changed, which is what the brief
  asked for. `deckY`, `roofY` and `coreHeightOverRoof` are untouched, so the "standing on the
  roof claims / standing in the cargo box does not" margin still holds;
  `src/nuketown-overdrive-core.test.ts` was run in the gate set to prove it.
- **Every measured offset**: `z`, the 0.325 L length split, the coach's 0.178 L / 0.150 L.

### One streamlining fix taken in passing

`cabX` had re-typed the box centre as a literal - `-10.6 + 6.5 / 2 + 5.2 / 2` - which is
precisely the transcription that file's header was written to stop, and it would have silently
left the cab behind the box on this edit. It is now
`TRUCK_X + TRUCK_BOX_LENGTH / 2 + TRUCK_CAB_LENGTH / 2`. The box/cab/width literals are now
named constants the frozen object reads.

### The new gate - strengthening, and nothing loosened

`src/nuketown2-fidelity.test.ts` -> **"parks every street vehicle on the carriageway, measured
against the paving table"**. It samples each vehicle's plan footprint against the **same**
`NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` table the paving, the lawn cut and
`scripts/qa/find-coplanar-pairs.ts` read, so a body cannot pass this gate and stand on grass in
the build. Truck box, truck cab and both cars are held at **exactly 0.0000**; the coach is
ratcheted at **0.868 m2** (tightened by the verify pass from 0.87, which still carried
0.0023 m2 of unspent headroom against the sampler's own 0.867731). No existing assertion was
relaxed, removed or widened, and the verge-furniture ceiling of 36 was not touched.

### The residue is the bulb radius, and it is OPEN

At the authored 16 m bulb the truck can go no deeper than -11.6125 and the coach would need
`x <= -12.49` to clear entirely. **The pair cannot both sit inside the disc; the shortfall is
0.88 m.** That is a property of the bulb radius, which FINDINGS open item 5 grades unmeasured,
and which our own stem:bulb ratio already reads 1.9 % away from the aerial.

**FALSIFIER:** a BO2-2025 orthographic overhead from which the bulb diameter can be measured
against the stem width to better than 2 %. If the real bulb is larger than 0.444 L, the residue
goes and the ratchet drops toward 0. The structurally right answer - paving the two lune pockets
as proper **kerb returns** so the bulb and the stem actually meet - was out of this lane's time
box and is the single highest-value next step here.

---

## 3. Items (2)-(5): not built, and why - all OPEN

Recorded honestly rather than half-built. Each of these costs **verge furniture** against a
ceiling the gate itself describes as having *"zero headroom"*:

```
expect(vergeFurniture.length, ...).toBeLessThanOrEqual(36);
```

The brief's own rule applies - a wall that is verge furniture must displace an equal number of
lower-value bodies **with a reference justification** - and none of those justifications could
be built and gated inside the box.

**Item 2 - bay-end low walls. OPEN.** Four bay-end walls = four paired emitters = **8 bodies**,
so 8 lower-value bodies must be named and deleted first. FINDINGS Q4's native-resolution verge
census (kerbs, pavements, appliance banks, ornamental plants, chain-and-post edging, a manhole
cover) is the list to cut against; the cheapest legitimate candidates are the three
`verge appliance dial` decals and the `verge mailbox flag`, all of which FINDINGS grades OPEN
rather than present. **The ceiling was not raised and must not be.**

**Item 3 - side alleys and their cover. PARTLY PRESENT, OPEN.** The alleys exist and their cover
is already load-bearing: `yard alley planter` at authored (-15.6, -33.0) and its rotational
partner exist precisely because the arena once *"measured a 76.2 m clear standing lane up the
west alley"*. Measured alley gaps: house/garage outer end to the +x bound **8.75 m**, house
outer end to the -x bound **11.25 m**. What is missing is cover between the house flank and the
perimeter fence on the **street** side. FALSIFIER: any BO2-2025 capture looking down a side
passage from the street; none of the six usable BO2-2025 frames is one.

**Item 4 - street-side balconies. OPEN, and the reference argues against building one.**
FINDINGS Q3 VERIFIES the **rear** deck and its exterior stair on both houses (built; rebuilt as
timber carpentry by the rooflines lane). It grades the front feature OPEN in terms:
*"Under-window front ledge - OPEN. No image in this set shows a ledge under the upper front
window,"* and records that every usable BO2-2025 frame is a yard, an overhead or the entrance
plaza - **not one street elevation at eye level**. Building a street-side balcony now would
invent geometry on the strength of a lane brief rather than a picture, which is the failure mode
this whole reference pass exists to stop. Held deliberately. FALSIFIER: any BO2-2025 capture of
a house *street* face at eye level.

**Item 5 - the BO2 dressing set. PARTLY PRESENT, OPEN.** Already present and reference-correct:
the colour-coded three-unit **appliance banks** (red on the orange lawn, blue on the white lawn -
FINDINGS Q4 VERIFIED, and the map's cheapest chirality anchor), and the **town sign** at the
closed end of the cul-de-sac. Missing: the sign is not authored as the *population* sign, there
is no **countdown clock**, and there are no **mannequins**. All three are new verge furniture and
hit the same ceiling as item 2. The brief's mannequin rule - *on verges, never mid-carriageway* -
is now mechanically checkable: the section 2 gate read the other way round is exactly that test.

---

## 4. What a capture must confirm

Everything in section 2 is geometry and arithmetic. **Nothing in it has been looked at.** A
headless capture pass (port 4210, `PASS73_NATIVE_WEBGPU=1`, off-screen) must confirm:

1. **The coach's near-side wheels are on asphalt.** Station: eye level, standing in the bulb on
   the truck's side, looking across at the coach's rear quarter. Before this change the grass
   wedge under it reached 1.04 m wide; it should now be under 0.6 m and confined to the outer
   rear corner. **VERIFY-PASS CORRECTION:** the wheels part of this is measured and true (front
   wheel 0.6634 -> 0.0000 m2 off-carriageway), but the capture must ALSO be read for the front
   **chrome bumper**, which this seat moves ONTO the lune (0.0000 -> 0.4563 m2) at authored
   `x = -0.5625`. Net visible overhang barely moves: 1.3615 -> 1.3008 m2.
2. **The truck's rear mouth is still walk-in-able and its bumper has not touched the kerb ring.**
   The rear now sits at authored x = -14.862 against a kerb-ring inner edge of -16.0125 at that
   z. The gate proves the probe; a capture must prove it *reads* as a truck standing in a
   cul-de-sac and not as a truck reversed into a kerb.
3. **The 2x core still reads as sitting over the cargo box**, having moved 1.01 m with it.
   Station: the overdrive core framed together with the truck.
4. **The two lune pockets do not read as bald patches.** Moving the coach off the north one
   exposes ground the coach used to cover. Station: overhead orthographic on the bulb mouth. If
   they read badly, paving them as kerb returns is the next lane's first job.

---

## 4b. TODOs raised by the adversarial verify pass (Opus, 2026-09-04)

Larger than a verify pass should fix on this branch. Recorded, not silently carried.

**TODO 1 - THIS BRANCH IS NOT ON THE BASE THE BRIEF ASKED FOR. ORCHESTRATOR DECISION.**
`origin/contrib/dave-gaming-pc/claude/nuketown2-geometry-2` exists (tip `daf398ba`, 22:33:43;
reconcile commit `e3e6a8be`, 22:25:23) and is **not** an ancestor of `c4d3bdb1`. The lane's
fallback was taken on a stale fetch. The divergence is 379 files, so rebasing or re-landing the
truck seat on geometry-2 is an integration job, not a verify-pass edit. The lane's own change is
two commits and touches two files, so re-landing it should be cheap - but it must be a decision,
not a default.

**TODO 2 - `src/walkable-surface-parity-gate.test.ts` IS RED ON THIS BRANCH, AND WAS NOT RUN.**
Reproduced: 3 failures, 24 nuketown2 fall-through floors / contiguous holes on
`north house A roof deck front|rear rake`, `north house A solar panel 0-*|1-*` and
`south house B capsule N band 0-6`.

```
AssertionError: nuketown2: new fall-through floors need a fix or a triaged ledger row: expected [ ...(24) ] to deeply equal []
AssertionError: nuketown2: fall-through floors: expected [ { ...(15) }, ...(22) ] to deeply equal []
AssertionError: nuketown2: contiguous unsupported patches on a walkable visual: expected [ ...(24) ] to deeply equal []
```

**NOT CAUSED BY `8de62756`.** Checking `src/nuketown2-layout.ts` and
`src/nuketown2-fidelity.test.ts` out at the merge commit `75fbaf59` and re-running reproduces
the identical 3 failures, so it arrived with the merged **rooflines** work. But this lane
performed that merge and its gate set does not include this file, so it went unreported. Either
fix the rakes/panels/bands or add triaged ledger rows; do not widen the gate.

**TODO 3 - THE NEW VEHICLE GATE MEASURES THE SOLID BODY, NOT THE EMITTED ENVELOPE.**
Widen `offCarriagewayArea` to the union of each vehicle's emitted parts (the coach's wheels at
`width + 0.2` and bumpers at `x +/- (length / 2 + 0.1)`, the truck's own dressing) so the number
the gate ratchets is the number a capture sees. Today they differ by 0.43 m2 on the coach and
they move in different directions. Doing this needs the residue owned first, i.e. TODO 4.

**TODO 4 - PAVE THE TWO LUNE POCKETS AS KERB RETURNS.** Unchanged from the lane's own open item
and still the highest-value next step: it is the only thing that takes the coach residue - solid
body AND bumper - to 0 rather than moving it around the bulb mouth.

**NOTE, NOT A DEFECT - WALL 2's UNITS.** `TRUCK_REAR_MOUTH_LIMIT_X` adds the standing body's
half-width (0.5) as an **x** offset to a **radial** solution, and uses 0.5 where the probing gate
uses `PLAYER_RADIUS = 0.44`. The two errors run opposite ways: solved properly,
`x >= centreX - sqrt((radius - 0.44)^2 - z^2) + boxLength/2 + 0.6 = -11.6921`, so the shipped
seat `-11.6125` is conservative by 0.0796 m rather than the 0.05 m `TRUCK_BULB_CLEARANCE`
advertises. Nothing to fix today; worth writing the inequality in one frame if it is touched.

---

## 5. Gates

All run on this branch, commands exactly as the brief names them. All GREEN.

`npx tsc --noEmit` - clean, no output.

`npx vitest run src/nuketown2-fidelity.test.ts src/nuketown2-roofs.test.ts
src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts
src/pipeline-metrics.test.ts src/nuketown-lawn-field.test.ts src/grass-placement.test.ts
src/legacy-main-size-ratchet.test.ts src/nuketown-overdrive-core.test.ts`

```
 Test Files  9 passed (9)
      Tests  80 passed (80)
```

`npx tsx scripts/qa/find-coplanar-pairs.ts`

```
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# boxes=880 - pairs<=0.03m: 173 - FINDINGS (different materials, no offset): 0
#   - FENCED (material offset): 115 - SAME-MATERIAL (benign): 58
```

~~Every SAME-MATERIAL pair is printed with `overlap=0.0m2`, i.e. touching edges with no visible
coplanar area. Visible same-material coplanar overlap: **0**.~~

> **REFUTED BY THE VERIFY PASS (Opus, 2026-09-04).** The instrument prints no row labelled
> `SAME-MATERIAL` at all - the verdict string is `BENIGN` - and of the 58 `BENIGN` rows,
> **18 carry a non-zero `overlap=`**, four of them at `dy=0.0000m`, i.e. exactly coplanar:
>
> ```
> BENIGN dy=0.0000m overlap=0.5m2 [north balcony rail outboard top=4.400] [north balcony rail cap top=4.400]
> BENIGN dy=0.0000m overlap=0.5m2 [north yard cover crate pad top=0.080] [north yard butt pad  top=0.080]
> BENIGN dy=0.0000m overlap=0.2m2 [north perimeter wall long  top=3.200] [north perimeter wall end top=3.200]
> (+ their south/mirror partners, and 14 more at dy = 0.005 - 0.030 m)
> ```
>
> The instrument's own classification is still defensible - two faces sharing one material
> instance at one height shade identically - but the sentence above is not: it asserts a
> row-level fact the output does not contain. NONE of these bodies is touched by this lane, so
> this is inherited, not caused. Note that `nuketown2-geometry-2` carries
> `e46ca6c9 fix(nuketown2): z-fight sweep - HF-497 same-material-visible coplanar class` -
> a sibling lane thought this exact class worth a sweep. See TODO 2.
>
> What DOES reproduce exactly, and is the load-bearing part of gate (3):
> `HOUSE-INTERIOR 0`, `STREET 0`, `boxes=880`, `pairs<=0.03m: 173`, `FINDINGS: 0`,
> `FENCED: 115`, `SAME-MATERIAL (benign): 58`.

Measurement script output (the source of the tables above):

```
truck.x      -11.6125  cabX -5.7625
coach.x,z    -5.2125 -2.6500
truck box off-asphalt m2 0.0000
truck cab off-asphalt m2 0.0000
coach     off-asphalt m2 0.8679
truck rear x -14.862 bulb closedX -16.5
BEFORE coach off-asphalt m2 1.2819
BEFORE truck box off m2    0.0000
BEFORE truck cab off m2    0.0000
```
