# PASS 95 - HF-510 minimap declutter (structural-only, every arena)

Lane worktree: `C:\Users\david\projects\aa-p-minimap-simplify`
Branch: `contrib/dave-gaming-pc/claude/v8-minimap-simplify`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba` (candidate 7)
Assigned browser port: 4260

Claim states: **[VERIFIED]** = I ran it and read the output. **[MEASURED]** =
numbers produced by an instrument I ran. **[OPEN]** = not proven here.

---

## 1. Owner request

> HF-510 (repeat of HF-491): "The mini map also still feels very cluttered on
> Nuke Town ... and the same on all levels. We shouldn't have this crazy busy
> mini map. It should be very simple. Just mainly showing where the walls are,
> not all the tiny components within, like cover."

Required outcome: the minimap draws only building footprints/walls, the
road/street surface and major boundaries, plus player/bot/objective markers.
Cover, props, furniture, scenery vehicles, vegetation, small colliders and
interior fixtures are excluded - on **every** arena.

## 2. Root cause of the repeat

**[VERIFIED]** HF-491 (PASS 94, `docs/evidence/pass94/minimap/REPORT.md`) added
a name-based semantic classifier in `src/minimap.ts`
(`buildMinimapStructuralElements`, `MINIMAP_CLASS_TABLE`,
`MINIMAP_ARENA_OVERRIDES`) **and never wired it into the renderer**. On this
base, `grep -rn "buildMinimapStructuralElements" --include=*.ts src/` matched
nothing outside `src/minimap*.ts` itself.

`src/legacy-main.ts` still drew, in `updateMinimap`:

- `atomic-acres`: a hardcoded road rectangle, the two house rectangles, and one
  `drawMinimapLandmark` path per authored physical-cover piece;
- **every other arena, Nuke Town included**: one `fillRect` + one `strokeRect`
  per entry of `activeWorldColliders()`, plus the cover landmark layer.

So the owner was still looking at one rectangle per collider. **[MEASURED]** On
`nuketown2` that is 359 collider rectangles.

**[VERIFIED]** A second defect in HF-491's design: its classifier keyed off
authored surface *names*, and its own report records `0` elements for
`rustworks-1v1`, `gun-range`, `farcrysis`, `high-seas`, `test1` and `map3` - six
of eleven arenas would have had a completely empty minimap had it been wired in.

## 3. What was implemented

### 3.1 Structural classification at the source (`src/minimap.ts`)

Three classes only - `building`, `wall`, `road` - and one geometric rule, not a
name roster:

- `MINIMAP_STRUCTURAL_MIN_HEIGHT_M = 1.6` - chest-high, so cover is below it.
- `MINIMAP_STRUCTURAL_MIN_SPAN_M = 4` - a room's width, so props are below it.
- `MINIMAP_STRUCTURAL_MERGE_EPSILON_M = 0.35`
- `MINIMAP_MIN_SEGMENT_PX = 2`
- `MINIMAP_ELEMENT_CEILING = 32`

`isMinimapStructuralCollider(bounds)` admits a blocker only when its authored
vertical extent is at least the height threshold AND the longer side of its
footprint is at least the span threshold.

- **Thresholds are world metres, not minimap pixels**, so a 192 m arena and a
  36 m arena classify the same physical wall identically. A pixel fence
  (`MINIMAP_MIN_SEGMENT_PX`) is applied separately, after merging, purely for
  readability at HUD size.
- **Cover is subtracted explicitly.** `arena.physicalCover` is the arena's own
  declaration that a piece exists to be hidden behind, so a blocker whose
  footprint sits inside an authored cover footprint is dropped whatever its
  size - that is what keeps a coach or a cargo stack off the map.
- **Road comes from the authored surface name**, because a flat carriageway
  cannot be told from a lawn geometrically: a road-name pattern
  (road, asphalt, tarmac, carriageway, turning head) minus a trim pattern
  (kerb, curb, dash, island, marking, line). **[MEASURED]** the trim exclusion
  alone removed 36 kerb slivers from Nuke Town's road set.
- **Merging is the readability pass.** Footprints that touch or overlap within
  0.35 m become one silhouette (union-find), so a house's wall boxes collapse to
  one building outline and a perimeter run to one boundary.

`arena.houses` are added directly as authored `building` footprints.

### 3.2 One layer, one palette, every arena (`src/minimap-static-layers.ts`)

`activeMinimapColliderLayer` + `activeMinimapCoverLayer` are replaced by a
single `activeMinimapStructureLayer`. The per-arena look fork is gone; the
palette is a module constant (`MINIMAP_STRUCTURE_STYLE`) so no map can drift
into its own style:

| class | fill | stroke | line width |
|---|---|---|---|
| `road` | `rgba(126,137,132,.30)` | - | 0 |
| `building` | `rgba(226,240,244,.16)` | `rgba(238,248,252,.95)` | 2.5 |
| `wall` | `rgba(226,240,244,.12)` | `rgba(226,240,244,.88)` | 2 |

Contrast against the minimap ground `rgba(7,15,18,.86)`. **[MEASURED]**
compositing each stroke over that ground and applying the WCAG relative
luminance formula gives the `building` stroke `(226,236,240)` at **16.3:1** and
the `wall` stroke `(200,212,217)` at **13.0:1**. Both are well clear of the
4.5:1 the HUD text rule uses. Line weight is 2-2.5 px on the 256 px backing -
the old collider outline was 1.5 px, and the extra weight is what survives the
player-up rotation without aliasing away.

The retained-canvas cache and its revision key are preserved, so the PASS 94
perf lane's measured win (`updateMinimap` 0.87 ms of self time per rendered
frame at the Nuke Town spawn pose, then out of the top-25 self-time list) is
not given back.

### 3.3 Marker set made consistent (`src/legacy-main.ts`)

Before, Domination zone markers and practice-target markers were drawn **only**
on the non-`atomic-acres` branch. Both branches are now one code path, so every
arena gets the same marker set: player arrow + cone, remote/bot circles (r=6),
Domination ringed letters, practice targets, rare-weapon ping, Overdrive ring,
scout sweep, north marker.

**[MEASURED]** `src/legacy-main.ts` 37,397 -> 37,202 lines (-195), under the
`LINE_CEILING` 37,396 ratchet. Dead code removed with it: `drawMinimapLandmark`
(108 lines), the atomic-only `activeMinimapStaticLayer`, the `landmarkLabels`
array that was populated every frame and never drawn, and the now-unreferenced
`MinimapLandmarkKind` / `minimapLandmarkLabel` / `physicalCoverMinimapKind` API
in `src/minimap.ts`. The two tests that covered those deleted functions were
deleted with them; no surviving assertion was weakened or widened.

## 4. Per-arena element counts, before and after

**[MEASURED]** `npx tsx scripts/qa/minimap-structural-audit.mts --out
docs/evidence/pass95/minimap-simplify` - roster derived from `ALL_ARENA_IDS`
(the arena catalog), never hand-listed. Full data:
`minimap-element-counts.json`.

`before` = what the old renderer drew: one rectangle per world collider plus one
landmark per cover piece that had a landmark identity.

| Arena | before | after | by class | reduction |
|---|---:|---:|---|---:|
| `nuketown2` | 359 | **13** | road 1, wall 12 | -96.4% |
| `raid2` | 212 | **14** | wall 14 | -93.4% |
| `atomic-acres` | 210 | **10** | road 1, building 2, wall 7 | -95.2% |
| `skyline-terminal` | 160 | **10** | road 1, wall 9 | -93.8% |
| `rustworks-1v1` | 63 | **24** | wall 24 | -61.9% |
| `gun-range` | 36 | **10** | wall 10 | -72.2% |
| `farcrysis` | 236 | **3** | wall 3 | -98.7% |
| `high-seas` | 213 | **18** | wall 18 | -91.5% |
| `test1` | 122 | **22** | wall 22 | -82.0% |
| `test2` | 307 | **27** | wall 27 | -91.2% |
| `map3` | 232 | **11** | wall 11 | -95.2% |

**Ceiling derivation.** The busiest arena is `test2` at 27 merged silhouettes,
so `MINIMAP_ELEMENT_CEILING = 32` - about 18% authoring headroom, and still an
order of magnitude below what these maps drew before (test2 307, Nuke Town 359).
No arena is empty; the minimum is `farcrysis` at 3, which is truthful for a
128 m jungle map whose blockers are almost all vegetation.

## 5. Visual before/after, per arena

**[MEASURED]** `<arena>-minimap-before.png` and `<arena>-minimap-after.png` in
this directory, 256x256, one pair per catalog arena.

These are deterministic offline rasterisations of the exact element sets, drawn
with the same footprint projection (`minimapLandmarkFootprint`) and the same
palette the runtime layer uses. `before` reconstructs the removed code's
geometry (one rect per collider, one per cover landmark); the reconstruction is
visible in the audit script and checkable against the deleted code in this
commit's diff. They are north-up, i.e. without the per-frame player-up rotation.

`nuketown2` is the owner's example: the before frame is a solid mesh of
overlapping outlines edge to edge; the after frame is a house with its garage
north, a house with its garage south, the street band across the middle, and
the perimeter runs - nothing else.

## 6. Gates

- **[VERIFIED]** `npx tsc --noEmit` - exit 0, no output.
- **[VERIFIED]** `npx vitest run src/minimap-semantic-layer.test.ts` - 1 file,
  26 tests passed. Covers: the rule's admit/reject boundary (exactly at each
  threshold and a hair under), road vs kerb trim, segment merging, and
  **every arena in `ALL_ARENA_IDS`** for (a) element count <=
  `MINIMAP_ELEMENT_CEILING`, (b) element count < before, (c) element count > 0,
  (d) only structural classes, (e) every element readable at >=
  `MINIMAP_MIN_SEGMENT_PX`, and (f) no authored cover piece drawn as an
  element. The roster equality assertion (measured keys vs `ALL_ARENA_IDS`) is
  what makes a newly registered arena fail rather than be silently skipped.
- **[VERIFIED]** `npx vitest run src/minimap.test.ts
  src/minimap-render-cadence.test.ts src/minimap-player-view-transform.test.ts
  src/legacy-main-size-ratchet.test.ts` - 4 files, 23 tests passed.
- **[VERIFIED]** `npm run build` (under the machine heavy lock) - built in
  5.05 s, exit 0.
- Full `npx vitest run` under the lock: see section 8.

## 7. What is deliberately still drawn

Markers, not structure: the player arrow and facing cone, revealed remotes and
bots, Domination zone letters, practice targets, the rare-weapon ping, the
Overdrive ring, the scout-sweep radar and the north marker. HF-510 names
players/bots/objectives as required, and these are now the same set on every
arena.

## 8. Open items

- **[OPEN]** Live headless browser clip of the HUD minimap on port 4260 was not
  captured within the time box; the machine heavy lock was held by the full
  vitest run for the remainder of the window. The per-arena PNGs in section 5
  are offline rasterisations of the same element sets and the same palette, not
  screenshots of the running HUD, so owner-visible confirmation in the game is
  still owed.
- **[OPEN]** A small number of large scenery colliders that are *not* declared
  in `arena.physicalCover` - e.g. the parked vans on `atomic-acres` - still pass
  the wall rule and appear as small blocks near the road. They are 2 of that
  arena's 10 elements. Removing them needs either an authoring change (declare
  them as cover) or a solid-box heuristic (minor span >= 1.5 m and
  major < 8 m), which risks dropping genuine small structures; it was not taken
  blind.
- **[OPEN]** `rustworks-1v1` merges nothing (24 isolated wall runs on a 54x58 m
  map). It is under the ceiling and reads correctly, but it is the least
  simplified arena at -61.9%.
- **[OPEN]** No owner HITL judgement. This is a lane candidate only; nothing was
  published.
