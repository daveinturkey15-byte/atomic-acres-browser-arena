# Raid Rebuild (`raid2`) — spatial plan

**Lane AQ · HF-408 · 2026-09-02 · base 49f5ff6b (PASS 85 + Lane W)**

> Owner, 2026-09-02 ~16:10 BST: *"Raid just feels like loads of walls, need to
> ensure the layout and artstyle is more similar to the original."*

This is a **layout** rethink. The art is a clean, readable first pass; the art
lane comes after.

---

## 0. Originality boundary

Same boundary as `docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md` section 0, restated
so this document stands alone:

- Nothing is copied. No geometry, no texture, no mesh, no sound, no font, no UI
  element, no callout string, and **no prose** from any source. What is
  recovered is topology and proportion: how many lanes, what connects to what,
  where the vantages are, how long the lines are.
- Every surface in `src/raid2-arena.ts` is authored by TypeScript at runtime
  (`authoring: 'code'`). No asset is downloaded for this arena.
- The arena's own name is **Raid Rebuild**, id `raid2`, route `raid-rebuild`.
  Area names below (pool terrace, sport court, circular drive, gallery, laundry
  block) are generic descriptions of function and are not in-game strings.

---

## 1. Why a rebuild, measured

The shipped Raid (`test2`) was itself a careful rebuild, against a reference
study this repo already owns. It is not a lazy map. So before drawing anything,
the complaint was turned into an instrument:
`scripts/qa/raid2-layout-metrics.ts` builds an arena through the same factory
table the collider/visual parity audit uses, rasterises the **authoritative
colliders** onto a 0.5 m grid, and casts 16 rays at the 1.70 m standing eye from
every accessible cell.

Measured 2026-09-02 on base 49f5ff6b (VERIFIED — `artifacts/raid2/before-metrics.txt`):

| arena | box m² | fill % | wall m² per 100 m² floor | mean open line | long-axis median | ≥45 m cells | roofed | eye clusters | mean cluster |
|---|---|---|---|---|---|---|---|---|---|
| **test2 (Raid)** | **7600** | 67.1 | 13.0 | **9.97 m** | **17.10 m** | **10.6 %** | **36.7 %** | **59** | **11.0 m²** |
| atomic-acres | 4440 | 85.6 | 16.8 | 13.84 m | 26.55 m | 33.5 % | 13.0 % | 33 | 17.2 m² |
| skyline-terminal | 4900 | 87.1 | 14.9 | 19.75 m | 33.30 m | 88.9 % | 30.8 % | 20 | 19.8 m² |
| high-seas | 2112 | 94.3 | 6.1 | 13.91 m | 10.35 m | 78.7 % | 86.4 % | 3 | 28.3 m² |
| rustworks-1v1 | 3132 | 89.8 | 11.4 | 12.16 m | 19.35 m | 38.6 % | 5.9 % | 25 | 11.1 m² |
| test1 (Firing Range) | 2944 | 77.6 | 28.8 | 8.36 m | 14.85 m | 8.4 % | 27.4 % | 40 | 16.1 m² |
| map3 | 28224 | 96.0 | 4.1 | 33.72 m | 60.75 m | 98.4 % | 1.3 % | 157 | 3.9 m² |

**The finding, in one line:** Raid is the largest playable arena in the game and
has the shortest sightlines of every real combat arena in it.

Three specifics, and each one is a build instruction:

1. **It is not carrying more wall than the others.** 13.0 m² of blocking
   footprint per 100 m² of floor is mid-table — less than Nuke Town's 16.8 and
   far less than the Firing Range's 28.8. So "loads of walls" is not a quantity
   complaint and cannot be fixed by deleting cover.
2. **It is carrying the wall in the wrong shape.** 59 separate eye-blocking
   clusters averaging 11.0 m² — nearly twice Nuke Town's 33 masses, on a map
   only 1.7× the size, and half the average mass. Nuke Town spends its wall on a
   few buildings; Raid spends it on dozens of partitions, and every partition
   ends a sightline. That is what a player experiences as walls.
3. **Over a third of its accessible ground is under a roof** (36.7 %, against
   13.0 % for Nuke Town). The mansion's ground floor became a warren of small
   roofed rooms and covered walks rather than a few big rooms around an open
   courtyard.

The consequence is visible in the lane readings. The 2026-08-31 spec's headline
promise was a pool lane holding an unbroken ~48 m line as the map's identity.
Only **10.6 %** of the ground can hold a 45 m line at all, and a player looking
along the map's own long axis sees a median of **17.1 m**.

---

## 2. Reference study

Sources for topology (read for structure only; nothing quoted, nothing copied):

- This repo's own prior measurement pass, `docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md`,
  which measured a published tactical map at 1 m resolution after isolating the
  playable region by flood fill. Its **proportions are re-used and re-checked
  here**; its build rules are what this pass revises.
- Public map guides for the Black Ops 2 map, checked 2026-09-02 for the
  connectivity graph only (see Sources at the foot of this document).

### 2.1 What the reference is, as proportions

| Property | Reference value | Provenance |
|---|---|---|
| Aspect ratio of the playable bounding box | 1.311 : 1 | measured, prior pass |
| Playable region / bounding box (fill) | 62.4 % | measured, prior pass |
| Long axis, absolute | 85–92 m | inferred from four architectural anchors; **stated as an inference** — no official metre dimensions were ever published |
| Movement correction (our sprint 8.7 m/s vs the reference engine's derived 7.24 m/s) | ×1.20 | derived; the assumption 1 unit = 1 inch is flagged as an assumption |
| Corrected long axis | 102–110 m | 85–92 × 1.20 |
| Lanes | three, spawns at the two ends of the long axis | agreed by every guide read |
| Centre | an enclosed courtyard with four mouths; the map's chokepoint | agreed |
| One flank | pool terrace with a hot tub pavilion and, beyond it, an open hard court | agreed |
| Other flank | a circular drive around a sculpture/fountain island, with a gallery on one side and a service block on the other | agreed |
| Vantages | an upper bedroom over the pool flank (the most-cited power position) and an upper room over the drive | agreed |
| Spawns | a garage block at one end, an open garden apron at the other | agreed |

`TEST2_BOUNDS` (100 × 76 m) already encodes this: 100/76 = 1.316 against the
measured 1.311 (0.4 % error), and 100 m is the conservative bottom of the
corrected band. **The rebuild keeps those bounds.** The owner never said Raid was
the wrong size; he said it was walls.

### 2.2 The proportion the prior pass did not record — and should have

The prior study recorded lane lengths, objective anchors and elevations. It did
not record **how open the reference's connective ground is**, and that omission
is the whole defect. Reading the reference's own plan as areas:

- The pool terrace, the hard court, the circular drive and its approach are
  **outdoor rooms**, each an unbroken paved or planted surface tens of metres
  across, with cover at their edges and at one island in the middle. They are
  not corridors.
- The mansion's ground floor is a **small number of large rooms** around one
  open-to-sky courtyard, joined by wide openings, not a corridor network.
- Roofs cover the wings and the garage. The centre of the map is open to the sky.

Converted to targets a gate can hold (§4).

---

## 3. The plan

Coordinates: **x right (long axis, ±50), z forward (±38), origin at map centre.**
Team 0 holds −x, team 1 holds +x. Bounds `{ minX: -50, maxX: 50, minZ: -38, maxZ: 38 }`.

### 3.1 The footprint (blob)

Five rectangles, deliberately down from the shipped map's twelve. A simpler
outline is not a cosmetic choice: every jog in the outline is a corner a player
gets stuck in, and every jog is boundary mass that fragments the map's wall.

Read out of `RAID2_BLOB` in `src/raid2-arena.ts` — the code is the authority and
this table is generated from it, not maintained beside it. (It was maintained
beside it once: the apron row said `−14 … +6` after the apron had already been
extended north to `−20` in code, so the derived area below was wrong by 84 m².
The skeptic caught that; the numbers here are recomputed.)

| span x | z range | what it is |
|---|---|---|
| −50 … −36 | −20 … +6 | west spawn apron (extended north to z −20 so it is an apron, not a 10 m neck) |
| −36 … −20 | −36 … +16 | court and laundry flank |
| −20 … +16 | −38 … +38 | the map's full-depth middle |
| +16 … +34 | −36 … +32 | pool-wing and gallery flank |
| +34 … +50 | −16 … +12 | east garage wing |

Ground inside the outline: **5604 m² of a 7600 m² box = 73.7 %**; buildings
subtract to a target accessible fill of **60–70 %**, holding the reference's
62.4 %. Measured accessible fill on the build: **65.8 %**.

### 3.2 North lane — the pool terrace (the one long lane)

| id | area | extent | elev | cover |
|---|---|---|---|---|
| N1 | sport court | x −34…−20, z −34…−23 | −0.35 (one riser, walked) | deliberately bare; two 0.70 m kerbs at the corners, one 1.9 m equipment box outside its SW corner |
| N3 | pool | x −14…+14, z −33…−25 | basin −0.55, coping +0.30 | solid basin slab, presentation water sheet over it |
| N5 | hot tub pavilion | x −19…−15.5, z −33…−29.5 | 0, roof 3.4 | one 2 m mouth; roof not reachable |
| N4 | pool deck | x −20…+18, z −25…−21 | 0 | two 1.9 m cabana piers and a 0.70 m planter run — nothing else |
| N7 | pool wing, ground | x +18…+32, z −34…−28 | 0, soffit 3.16 | one room, two 4 m mouths |
| N6 | undercroft colonnade | x +18…+32, z −28…−22 | 0, soffit 3.16 | **three** piers, 4 m gaps — the lane's east end is a colonnade you can shoot through, not a wall |
| U1 | upper bedroom | over N7+N6 | +3.40 | the map's power position; window slots west and south |

**The defining line.** At z ≈ −28, from the court's west edge (x −34) east across
the court, the pool basin and the deck to the colonnade at x +18: **52 m**. The
reference's own defining line measures ~48 m at reference scale, which is 40 m
before our ×1.20 movement correction and 48 m after — so 52 m is 8 % long and is
accepted as the map's single long lane. Nothing may be added into it.

### 3.3 Centre lane — the house

One mass, x −26…+30, z −20…−4 (56 × 16 m). **Two interior partitions in the whole
building**, each with a 4 m mouth.

| id | area | extent | roof |
|---|---|---|---|
| C1 | living room | x −25.2…−11.2, z −19.2…−4.8 | roofed, soffit 3.16; U2 above its north half |
| C2 | **courtyard** | x −10.4…+11.6, z −19.2…−4.8 | **open to sky** — 22 × 14 m, four colonnade piers on a grid, one 0.70 m fountain kerb |
| C3 | kitchen / office | x +12.4…+29.2, z −19.2…−4.8 | roofed, soffit 3.16 |

Mouths: north face at x −22…−18, −2…+2, +20…+24; south face at x −14…−10,
+6…+10, +26…+30; west face z −14…−10; east face z −16…−12. **No north mouth is
aligned with a south mouth**, so no single line sees the pool lane and the drive
lane at once (the rule the prior spec set and this build keeps).

**The spine line.** Both partition mouths sit at z −14…−10 so the house reads as
one building end to end, and the line is then cut at each end by furniture rather
than by architecture: a 1.9 m chimney breast at x ≈ −20 in C1 and a 1.9 m counter
run at x ≈ +20 in C3. Measured spine: **≈ 39 m**, against the reference's ~34 m ×
1.20 = 40.8 m corrected. Under the 45 m single-long-lane rule by 6 m.

### 3.4 South lane — the circular drive

| id | area | extent | note |
|---|---|---|---|
| S1 | laundry block | x −26…−12, z −4…+9 | **attached to the house's south face**, so it is one architectural mass and not a second cluster; U3 above with a balcony over the drive |
| S4 | gallery | x +14…+28, z −4…+8 | attached likewise; U4 above with a balcony |
| S2 | circular drive | paving x −11…+11, z +5…+19 | the second contest point |
| S3 | drive island | fountain plinth 1.9 m at x −2…+2, z +10…+14, four 1.9 m planters around it | **circumnavigable** — five discrete pieces, never a solid block |
| S5 | drive approach | x −20…+16, z +19…+34 | open paving; its south rim is a 1.9 m parapet reading as a hillside drop |

Drive-lane line, laundry east face to gallery west face at z ≈ +12: **26 m**,
broken by the island from most angles. Balcony-to-balcony (U3 → U4): ~26 m.

### 3.5 The two ends

| id | area | extent | note |
|---|---|---|---|
| E1 | west spawn apron | x −50…−36, z −12…+4 | team 0. Open. Two 0.70 m garden walls, one 1.9 m screen wall run at x −34…−32 with a 4 m gap, so the apron has a screened mouth instead of a 24 m look straight into it |
| E2 | east garage | x +34…+50, z −16…+12 | team 1. Roof x +38…+50, z −12…+8 only. Three bay piers on 6 m centres along its west face (the shipped map used 4 m centres, which is what made it read as a wall), one 0.70 m kerb line |

### 3.6 Verticality

Unchanged in kind from the prior spec, because that part of it was right and the
controller has not moved:

| surface | height | reached by |
|---|---|---|
| pool basin floor | −0.55 | two 0.27 m steps in, 0.55 m mount out |
| sport court floor | −0.35 | one riser, walked (autostep 0.42 m) |
| kerbs, planters, sills, fountain kerb | +0.30 / +0.70 | walk / jump-mount (apex 0.82 m) |
| first floor: U1, U2, U3, U4 | +3.40 | **stairs only** — 9 risers × 0.3778 m, 0.45 m treads, 40° |
| balcony rails on U3 / U4 | +1.05 above the floor | not standable |
| roofs | 3.4 – 4.2 | not reachable, intentionally |

**Nothing is authored in the 0.9–1.8 m dead band** at ground level. The 1.05 m
balcony rail on a +3.40 m floor is the one deliberate exception and it is the
same exception, for the same reason, that the shipped map documents.

---

## 4. The gate bands, and the reason for each number

Held by `src/raid2-fidelity.test.ts`. Every band is either DERIVED — from a
measurement in this document or from the shipped roster — or an explicit
RATCHET pinned at what the build measures so that the next lane cannot make it
worse. Which of the two each band is, is stated in the table.

**One correction, on the record.** This section previously claimed that no band
came from the build. That was false for band 5 (eye-blocking clusters): its
written reason said "may not exceed Nuke Town's count", Nuke Town measures 33,
and the assertion said 34 — which is exactly what the build produces. The band
is now labelled a ratchet and says so, and band 5b was added as the DERIVED
form of the same claim.

| # | band | reason |
|---|---|---|
| 1 | bounds exactly 100 × 76 m | derived in §2.1; aspect 1.316 against the reference's measured 1.311 |
| 2 | accessible fill 0.58 – 0.72 | the reference's measured 62.4 %, ±0.07 for the flood fill's cell quantisation |
| 3 | mean open line ≥ 13.0 m | Nuke Town measures 13.84 m on a map 42 % smaller. A larger map that sees less than a smaller one is the defect being fixed; the floor is set just under Nuke Town so the gate fails a regression rather than pinning a lucky build |
| 4 | long-axis median ≥ 24.0 m | Nuke Town measures 26.55 m over a 74 m axis (36 %). 24 m over a 100 m axis is 24 % — deliberately below Nuke Town's ratio, because Raid's house band genuinely does interrupt its own long axis |
| 5 | **RATCHET:** eye-blocking clusters ≤ 34 | The build measures 34; Nuke Town measures 33. There is no reference number that says 34, so this band is pinned at the produced value with ZERO headroom, and its only job is that the next lane cannot add a mass silently. The 34th is accounted for: the house's mouth scheme (two interleaved openings per partition) necessarily strands four short wall segments between their own mouths — house west z −13.2…−10 (3.5 m²), partition west z −15.5…−13 (3.75 m²), partition east z −13…−10.3 (3.0 m²) and the house north-east return z −20…−19.2 (7.0 m²). Consolidating any of them means closing a mouth and breaking the no-line-crosses-both-partitions invariant, which is a real trade and is written down rather than smuggled into a band |
| 5b | **DERIVED:** eye-blocking masses per 100 m² of accessible ground ≤ 0.87 | The same claim in the form a bigger map can be held to — a player experiences the number of separate things that end a sightline *per step of floor he walks*. Measured on the shipped roster: shipped Raid 59/5098 = 1.157, rustworks-1v1 0.889, Nuke Town 33/3803 = **0.868**, Terminal 0.469. The band is Nuke Town's own density. The rebuild measures 0.679 — 22 % under the band and 41 % under the map it replaces |
| 6 | mean cluster ≥ 15.0 m² | fragmentation floor: the complement of #5. Shipped Raid 11.0 m², Nuke Town 17.2 m² |
| 7 | roofed accessible ground ≤ 0.24 | shipped Raid 36.7 %, Nuke Town 13.0 %, Terminal 30.8 %. A mansion earns more roof than a suburb and less than an airport |
| 8 | ≥45 m cells between 0.12 and 0.45 | the reference has exactly one long lane. Below 0.12 the long lane does not exist (shipped Raid is 0.106); above 0.45 the map is a field (Terminal is 0.889) |
| 9 | pocket cells ≤ 0.04 | a cell whose longest line dies inside 12 m is a place with no shot from it. Shipped Raid 3.6 %; the rebuild may not get worse |
| 10 | upper floor ≥ 500 m² | four upper rooms are the reference's identity. The shipped map has 2241 m² of first floor, which is more building than the reference has; the floor keeps the rooms without pinning the excess |
| 11 | wall footprint per 100 m² of floor ≤ 17.0 | Nuke Town's 16.8. Proves the openness was not bought by deleting cover |
| 12 | mountable cover ≥ 24 pieces | the same proof from the other side: the map must still be full of things to fight behind |
| 13 | x-mirror spawn fairness | every team-0 spawn has a team-1 partner within 2 m of its x-mirror, and no cross-team pair closer than 55 m |
| 14 | no ground cover in the 0.9–1.8 m dead band | the cover rule the shipped map documents, carried forward |
| 15 | **the traversal gate** — reachability pitch finer than one 0.45 m tread | `scripts/qa/raid2-reachability.ts` point-samples at 0.25 m. A 0.5 m lattice can miss a 0.45 m tread entirely and turn one 0.378 m riser into an apparent 0.756 m step, i.e. report a good stair as sealed and a sealed stair as good. A closed 0.45 m interval always contains a point of a 0.25 m lattice |
| 16 | every upper room ≥ 99 % reachable from the spawn table, and none vacuously empty | Bands 1–14 are measured by a 2D ground-level rasteriser and are structurally blind to whether anything above grade can be stood on. The first revision of this arena passed all fourteen with **three of its four upper rooms physically unreachable**. The gate is an optimistic autostep-connected flood fill (0.42 m step, 1.82 m standing capsule) from the SPAWN TABLE ONLY; it fails on the geometry as it was authored |
| 17 | zero unreachable patrol points | Bots do not climb and this arena authors no vertical navigation, so a patrol point not autostep-connected to a spawn is a node a bot walks at forever. Four of fifteen were, including one at grade inside the courtyard fountain kerb |
| 18 | no hard-cover material family darker than the paving | The arena's own material header states it: every vertical surface a player shoots at must sit above the paving in value so a silhouette reads against it at range. The arena shipped breaking it — `stone`, which carries every piece of hard cover on the map, measured 0.457 Rec.709 luminance against the paving's 0.565. Asserted through `raid2PaletteLuminance()` |

---

## 5. Fixed judgeset

Committed review cameras, used for every capture in the report so a reviewer
compares like with like. Defined in `src/rendering/arenas/raid2.ts`.

| # | camera | what it must show |
|---|---|---|
| 1 | overhead | the whole plan, both lanes readable |
| 2 | west apron, facing +x | team-0 spawn's three-way exit fan |
| 3 | garage, facing −x | team-1 spawn's exit fan, bay piers on 6 m centres |
| 4 | sport court, facing +x | the 52 m defining lane, unbroken to the colonnade |
| 5 | pool deck, facing −x | the same lane from the other end |
| 6 | courtyard centre | four mouths, four piers, open sky |
| 7 | living room, facing +x | the 39 m spine, cut at both ends by furniture |
| 8 | U1 upper bedroom | the pool lane from the power position; must NOT see the west apron |
| 9 | U3 balcony, facing +x | the drive lane and the island |
| 10 | drive approach, facing −z | the circle, the island, both balconies |

Three reading distances for every substantial object: silhouette at range,
structure at mid, joins up close. Critical-failure list: floating or intersecting
geometry, default materials, a zone that exists only as a label, darkness hiding
unfinished work, unfinished reverse angles.

---

## Sources

Consulted 2026-09-02 for connectivity only; no text, image or asset was taken
from any of them.

- [Raid — Call of Duty Wiki](https://callofduty.fandom.com/wiki/Raid)
- [Raid, Maps and Tactics — Gamer Guides](https://www.gamerguides.com/call-of-duty-black-ops-ii/guide/multiplayer-guide/maps-and-tactics/raid)
- [Raid — callofdutymaps.com](https://callofdutymaps.com/black-ops-2/raid/)
