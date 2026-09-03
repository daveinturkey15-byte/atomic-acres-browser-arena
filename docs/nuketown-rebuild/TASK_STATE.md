# Lane AU — task state (HF-426)

## Overview
- **Branch**: `contrib/dave-gaming-pc/claude/nuketown2-accurate`
- **Goal**: make the Nuke Town rebuild (`nuketown2`) accurate to Black Ops 2
  Nuketown 2025, then layer on the approved visual style from the shipped map.
- **Dates**: Jobs 1–2 first cut 2026-09-03 (Gemini 3.8 Flash); Jobs 1–2 verified
  and rebuilt 2026-09-03 (Claude Opus 5.1).

## Job 1 — reference research
- **State**: REDONE. The first cut was rejected on verification: three of its
  five cited URLs do not resolve (one is Medium's page-not-found shell, one a
  404, one a bare domain), and its structure reproduced this repository's own
  2026-08-29 redesign rather than the reference. See
  `REFERENCE_SCHEMATIC.md` §0.
- **Deliverable**: `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`, measured in
  pixels off the two first-party Treyarch minimaps of Nuketown 2025 (BO2 and
  BO7), which agree to ~1 % on every shared ratio.
- **The finding that mattered**: the map's long axis runs ACROSS the street at
  2.36 : 1, and the road is a short stub opening into a cul-de-sac turning head.
  The previous cut had 0.90 : 1 with the street as the long axis.

## Job 2 — layout and props
- **State**: REDONE, gates green.
- `src/nuketown2-layout.ts`, `src/nuketown2-arena.ts` re-proportioned to
  36 m of street by 84 m across it at constant playable area (3,016 → 3,024 m²).
- Truck is now the OPEN body in the turning head and carries the 2x core; the
  coach is CLOSED. A car in the head is the coach's fairness counterweight.
- Garages set back 6 m and given a link door that is a real hole in BOTH leaves
  (the previous cut cut one leaf and left the house wall solid behind it).
- Yard fence gaps taken off-axis from their own rotational partners; two flank
  props moved onto the perimeter wall's inner face. Worst standing lane
  82.0 → 46.0 m.
- Shed registry rows moved from x = ±24 (now outside the map) into the yards.
- `src/nuketown2-fidelity.test.ts` re-derived from the schematic, with the
  previous cut's `.filter(name.startsWith('truck'))` escape hatch replaced by an
  exact enumerated exception plus two new properties.
- Footprint-derived visual numbers re-derived in
  `src/rendering/arenas/nuketown2.ts` and `src/graphics-refinement.ts`.

## Job 3 — approved visual style
- **State**: DONE 2026-09-03 (Claude Opus 5.1), gates green.
- **Materials.** `nuketown2Materials()` is the shipped map's palette, MEASURED
  rather than eyeballed: the mean albedo of each PBR texture set `atomic-acres`
  streams, at that set's authored roughness/metalness, plus its flat-authored
  `white` / `mustard` / `chrome` and art-kit's `MAT.rubber` / `MAT.cream`.
  Nothing is imported. Three reference overrides: houses BLUE / YELLOW /
  ORANGE (§5.3 — green+yellow are the ORIGINAL Nuketown's), a cream-and-red
  coach, and a plain box van. `pair()` now takes `[north, south]` materials so
  the two houses differ by paint alone; geometry, and therefore the symmetry
  gate, is untouched.
- **Lawn.** `buildNuketownRebuildLawnField` grows the shipped map's field on
  regions DERIVED from `NUKETOWN2_GROUND_DRESSING`'s `material: 'lawn'`
  rectangles plus their rotational partners, with `builder.colliders` as the
  keep-out truth, so neither extents nor keep-outs can drift. 9,953 tufts,
  149,295 triangles, 8 draws.
- **Surrounds.** The forest ring and mountain ring take an ENVELOPE each; the
  shipped map's envelope holds its authored numbers exactly (its own tests stay
  green) and the rebuild's is fitted to 36 × 84: forest 44.5–70 m, massif from
  66 m, no ground skirt (this arena authors its own ground, now 270 m so the
  massif is not standing half on nothing).
- **Light and grade.** Key, fill, fog curve, atmosphere and exposure are the
  shipped map's. Sky is `estate-golden-hour` — the shipped `sunset-farmland`
  resolves to an ASSET this arena may not have. Shadow normal bias stays 0.044
  (derived from this footprint's own 44 × 92 m volume). The art-direction CDL
  is left EXACTLY as searched; only its brief prose changed.
- **Three corrections the first capture round measured**, not predicted: the
  road rendered as a hole at a texture-mean albedo on an untextured box; the
  perimeter was a concrete compound wall in both yard frames; and the overhead
  review camera stood inside the new forest ring.

## Evidence from Job 3 (2026-09-03)
- tsc clean; 97 targeted gate tests green (nuketown2 fidelity 16, nuketown
  fidelity, art direction, arena visual definition, map selection, menu preview
  video, lawn field, forest surround, mountain backdrop).
- Collider/visual parity **0** invisible colliders, **0** walk-through meshes.
  Walkable-surface parity **0** fall-through floors.
- Art-direction distinctiveness, the test's own instrument: floor 0.02157,
  `atomic-acres` vs `nuketown2` **0.02446**, unchanged by this pass and still
  above the shipped catalog's own weakest pair (0.02262).
- Review-camera capture 7/7 on hardware WebGPU, three rounds:
  `artifacts/viewpoint-regression/hf426-job3`, `-v2`, `-v3` (final).
- Arena boot smoke: `nuketown2` boots a clean visible solo match, 29.7 s.
- 60 s headless solo run on `nuketown2`: 0 page errors, 0 console errors,
  **100 mean FPS**, p95 14 ms, still active at the end
  (`artifacts/qa/nuketown2-job3-solo-60s.json`).
- Menu preview + loading backdrop re-captured through the sanctioned
  generators. `qa:pass77:menu-previews` verified; generator lineage 6/6 after
  the additive repair described below.

### Open, and not this lane's
- `qa:pass65:menu-previews` reports 11 digest-mismatch / drift lines against
  PASS 65's frozen expectations of the shared capture generator. Verified
  PRE-EXISTING on this head (identical output with Job 3's changes stashed).
- The shared generator lineage was stale for the same reason and HAS been
  repaired here, additively, with `write-capture-generator-lineage.mjs` — the
  tool the failure names. No recorded digest was edited in place.

## Evidence from the rebuild pass
- tsc clean; 270 targeted gate tests green (16 fidelity, spawn quality,
  selectability, map selection, parity, walkable, art direction, shed registry,
  overdrive LoS, railgun authority, killstreak nav, menu preview, proxy
  coverage, visual definition).
- Collider/visual parity **0** invisible colliders, **0** walk-through meshes.
  Walkable-surface parity **0** fall-through floors.
- Arena boot smoke: 13/13 arenas, real WebGPU, own preview on 127.0.0.1:4243.
- 60 s headless solo run on `nuketown2`: 0 page errors, 0 console errors,
  99.4 mean FPS, still active at the end
  (`artifacts/qa/nuketown2-solo-60s.json`).
- Review-camera capture 7/7 on hardware WebGPU
  (`artifacts/viewpoint-regression/hf426-candidate/`).

---

# Lane AU2 — task state (HF-432 refinement + HF-433 crouch speed)

## Overview
- **Branch**: `contrib/dave-gaming-pc/claude/nuketown2-refine`
- **Date**: 2026-09-03, Claude Opus 5.1, one pass.
- **Source**: the owner after playing PASS 90 — *"new nuketown starting to shape
  up, still some issues with where stairs are, the cover and size/shape of the
  side areas of the map and spawns, needs refinement. Doors are too small
  shouldn't have to crouch, vehicles in mid street need more accurate layout to
  original. Also when I go prone now it dropshots nicely but going crouched I
  still move fast, sort it out in the same way?"*

## The one thing to read first
**The lane brief said the stair footprints are drawn on the minimaps. They are
not.** Both first-party assets were re-fetched on 2026-09-03 to check:

| Source | Result |
|---|---|
| S3 `Nuketown_2025_MiniMap_BO7.png` | HTTP 200, 2,761,702 bytes, served `image/webp`, 4096 × 4096. Oval-cropped, rotated, red-tinted presentation. The two house fills resolve as grey blocks with **no interior linework**. |
| S2 `Nuketown_2025_Minimap_BOII.png` | HTTP 200, 46,120 bytes, served `image/webp`. Same oval crop, 253 × 498 px of playable art. |

So the stair is **derived, not measured**, and the derivation is written into
`NUKETOWN2_HOUSE_STAIR` as the contract. Everything else in this pass is a
measurement.

## Item 1 — stairs
- Moved from the FRONT room's east wall to the BACK room's **west (blind)**
  wall, climbing to a **landing** at the internal partition, whose upper leaf
  stops at the flight so the head of the stair opens straight into the front
  upper room: a landing **and** an upper hallway.
- Why not the east wall: it is the party wall the garage shares, and the garage
  overlaps only 7 m of the house's 13 m depth — a 5.1 m flight there leaves no
  run long enough for the 1.8 m link door.
- Three defects fixed with it: the old flight ran treads 9 and 10 **through**
  the ground-floor partition; it holed the upper FRONT room (the map's power
  position, and where the rare-gun site stands) with 6.05 × 1.95 m of void; and
  the upper crate floated 0.15 m over its own slab.
- **The number a probe corrected rather than confirmed.** Rapier's autostep
  casts the capsule UP by `autostepHeight` *before* it casts forward, so a step
  taken under a ceiling needs `feet + 1.82 + 0.42 ≤ 3.0`, not `feet + 1.82 ≤ 3.0`.
  Authored the obvious way the new flight stalled with the player wedged on
  tread 2's nosing — grounded, blocked, for as long as the probe walked it.
  `STAIRWELL_Z0` carries that derivation.
- **Evidence**: a new probe walks a STANDING capsule on the real
  `CharacterPhysics`, with gravity and **no jump**, in off the back-room floor,
  up the flight, onto the landing, into the FRONT upper room and back through
  the internal door into the BACK upper room — for **both** houses.

## Item 2 — side areas
Diff table against this document's §2/§3/§7, measured before anything moved:

| Element | Reference | Arena before | Verdict |
|---|---|---|---|
| back-lot depth | 0.503–0.583 L (mid 0.543) | 19 m = 0.528 L | OK |
| yard, open + fenced | S3 outer lots, S1 prose | 468 m² per half | OK |
| fence holes | two per fence, path beyond | two, off-axis | OK |
| shed | registry (±14, ±24.5) | in the yard | OK |
| **flank props on BOTH long boundaries** | S3 hatched props both sides | ONE per half | **FAIL** |
| **border / side path** | the path the holes lead round on | 36 × 6 m, no cover | **FAIL** |
| bunker / shelter | **not in the reference** | absent | OK |

`pair()` negates x **and** z, so the single authored side store and its partner
both landed on the WEST flank of one half and the EAST flank of the other: each
team had a dressed flank and a bare one, and the bare one was 114 m² of empty
ground carrying the map's worst standing lane. Three paired additions: a second
side store on the far flank, one waist-high crate in the bare half of the yard,
two hard bodies on each border path.

- worst standing eye-line on the map **46.0 m → 39.4 m** (band 30 … 50.3)
- longest clear line from a spawn **71.0 → 29.4 m** at (12, −30)

## Item 3 — spawns
Two things were wrong and the shipped spawn gate reported neither, because its
bands are floors rather than targets:

- four of ten spawns held a clear standing line 68–71 m long on an 84 m map, and
  nothing capped that at all;
- t0 (12, −30) held a clear line to t1 (6, 32) at 62.3 m, and
  `minimumVisibleEnemySpawnDistanceM` is 30, so a 62.3 m spawn-to-spawn
  sightline **passed**.

Re-solved over every yard cell passing the full `spawnPointFailures` set and
clearing both sheds by > 5.5 m, scored on zero spawn-to-spawn sightlines
(hard), ≥ 24 m x-spread and ≥ 6 m z-spread (hard), ≥ 4.5 m spacing (hard), then
lowest worst exposure, then shallowest mean depth.

| | before | after |
|---|---|---|
| worst clear line from a spawn | 71.0 m | **31.6 m** |
| spawn-to-spawn sightlines | 1 | **0** |
| `nearestVisibleEnemyPairM` | 62.29 | **null** |
| `maxCoverDistanceM` | 3.73 | 2.91 |
| mean distance from the road | 31.5 m | 26.5 m |
| points per team | 5 | 6 |
| `crossTeamMinFraction` | 0.714 | 0.591 (floor 0.33) |

Both properties are now **gated** in `nuketown2-fidelity.test.ts`: no spawn sees
a spawn, and spawn exposure is banded at [0.5 L, L].

## Item 4 — doors
**The owner's words and the measurement disagree, and the measurement wins.**
Measured on the built colliders before anything moved:

| door | head before | width before | after |
|---|---|---|---|
| house front | 2.20 m | **1.38 m** | 2.40 / 1.78 |
| house back | 2.20 | 1.58 | 2.40 / 1.79 |
| house internal | 3.00 | 1.58 | 3.00 / 1.78 |
| house ↔ garage link | 2.60 | 1.80 | 2.60 / 1.78 |
| garage vehicle | 2.60 | 3.48 | 2.60 / 3.48 |
| garage rear | 2.60 | 1.58 | 2.60 / 1.79 |

A map-wide sweep of every ground cell at 0.20 m, testing the STANDING capsule
(1.82 m) against the CROUCHED one (1.16 m) **at the same radius** so only height
differences count, found **20 crouch-only cells on the whole arena — all 20
under the two verge letterbox lids**. No door ever required a crouch. The fault
was WIDTH: 1.38 m leaves 0.62 m of free width for a 0.76 m capsule.

Bands, derived: width 1.8 m = four capsule radii plus 0.2 m of slack; head
2.4 m = capsule 1.82 + the autostep up-cast 0.42 + 0.16. Every opening is now
authored once in the exported `NUKETOWN2_DOORWAYS` table.

**Two obstructions the walk-through probe found, not reading**: the garage
workbench lay across the rear door's own threshold, and the parked car stood
1.05 m off the garage door's reveal (0.29 m of centring for a 0.76 m capsule).

## Item 5 — mid-street vehicles, and a per-arena 2x core
HF-426 recorded three deviations with **one** cause: `OVERDRIVE_POSITION` was a
single global `{0, 3.75, 0}`, so the truck had to stand on the world origin and
the coach's two measured offsets had to be pulled in to keep its flank off the
kerb. The orchestrator authorised the weapons change, so the cause is gone.

| | reference | arena now | Δ |
|---|---|---|---|
| truck offset across the street | 0.076 L | 2.75 m = 0.0764 L | 0.0004 L |
| coach offset along the street | 0.178 L | 6.4 m = 0.1778 L | 0.0002 L |
| coach offset across the street | 0.150 L | 5.4 m = 0.1500 L | 0.0000 L |

- `overdrivePositionForArena(arenaId)` plus a `home` seat on `OverdriveState`
  so a death drop still returns to the arena's own seat. The rebuild's seat is
  **derived from `NUKETOWN2_CENTRAL_TRUCK`**, not transcribed — the failure
  `src/railgun-authority.ts`' header records against the shipped map.
- **The shipped Nuke Town is untouched**: `OVERDRIVE_POSITION` is still
  `{0, 3.75, 0}` and `overdrivePositionForArena('atomic-acres')` returns that
  exact object.
- Two consequences handled rather than absorbed: the head car is parked across
  the road centre-line (the reference's own offsets leave 2.8 m of open
  carriageway there, and with the truck off that line the derived
  `MAX_STREET_CENTRE_RUN_METRES` band would have broken — measured **20.0 m**
  against the unchanged 21.2 m band), and the roof treads moved to the truck's
  NORTH flank so the climb to the core is contested.
- Asymmetric street-vehicle set re-enumerated at **26** with the reason:
  127.0 m² of a 181.4 m² cap, halves 73.1 / 53.9 / 64.5 / 62.5 m² against a
  20 m² floor — better balanced than the 89.3 m² the centred truck produced.

## HF-433 — crouch speed
Crouched movement **already had its own speed and it was already slower than the
reference's**: 3.15 / 6.15 = **0.512** of the walk, against BO2's ≈ 0.6. Raising
it toward 0.6 would have made a crouched player *faster*, so the number is kept
and recorded (`CROUCH_SPEED_FACTOR`, `MOVEMENT_SPEED_M_S`).

What was wrong was in `updatePhysics`: holding sprint while crouched **stood the
player up** and sprinted, so the crouch profile applied for exactly one frame.
Fixed where it lives — `stepSprintLatch` now requires the standing stance (not
merely "not prone"), crouching clears the sprint latch exactly as the drop shot
does, and the two lines that did the auto-stand are deleted. The drop-shot
timing constants are untouched and pinned as such.

## Evidence (2026-09-03)
- `tsc` clean.
- 14 focused gate files, **301 tests** green: nuketown2 fidelity 19, spawn
  layout quality, shed registry, arena selectability, both parity gates,
  overdrive, overdrive line-of-sight on **both** arenas, the shipped Nuke Town
  core gate, railgun authority, prone transition 39 (six new HF-433 cases),
  gameplay, the legacy-main size ratchet, map selection.
- Collider/visual parity **0** invisible colliders, **0** walk-through meshes
  (190 colliders, 213 visible meshes). Walkable-surface parity **0**
  fall-through floors (44/44 supported).
- `tests/e2e/pass85-drop-shot.spec.ts` **5/5** headless on installed Chrome
  against an owned vite preview at 127.0.0.1:4261 from a fresh build, including
  the new HF-433 crouch sequence and the HF-431 drop-shot case.
- `src/legacy-main.ts` LF preserved; size ratchet raised 37,087 → 37,095 →
  37,100 through the file's own `CEILING_HISTORY` procedure, each entry saying
  what needed the lines.
