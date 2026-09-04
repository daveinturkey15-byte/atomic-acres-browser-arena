# RAID2 slice 2 — estate cells 1–3 (facade-bay, pool-terrace, court)

**Lane:** Raid art pass, slice 2 (builder). **Agent:** OMP / Muse Spark 1.3, 2026-09-04.
**Worktree:** `C:/Users/david/projects/aa-muse-raid` (isolated; nothing else touched).
**Branch:** `contrib/dave-gaming-pc/claude/raid2-slice-2`, based on
`origin/contrib/dave-gaming-pc/claude/raid2-rebuild` @ `76188e57` (per the task
override — the rebuild branch, not pass93-candidate).
**Plan:** `docs/research/2026-09-04/RAID-rebuild-plan.md` §5 (cells 1–3), §6.5, §7.
**Ledger rows served:** HF-408 (rebuild), HF-427 (detail parity / layout accuracy / look).

**Claim-state key.** `VERIFIED` = ran or read in this session, quoted below.
`DESIGNED` = needs a visual capture (headless session, no browser/GPU work per
task constraints). `OPEN` = unknown, named as unknown.

## 0. Headline

58 dressing meshes across the plan's first three estate cells, every one free
by measurement: no new eye-blocking mass (34, was 34), no dead-band cover, no
burial regression, parity 0/0, walkable 0, zero new materials, zero new render
pipelines. Two gate failures were met during the build (bands 8 and 25, then
direction C and band 8 again); each was fixed by changing the geometry, never
the gate — the failure log is §4, because the next slice will hit the same
shapes.

`DESIGNED`: how it LOOKS is unverified — no capture was taken (no browser/GPU
in this session; owner runs ComfyUI). The geometry, numbers and gates below are
VERIFIED; the visual read of cornice rhythm, umbrella/canopy proportion, court
paint weight and glass tint needs the cell judgesets (5 m eye-level + 40 m)
with a real renderer before HITL.

## 1. What was built

New module `src/raid2-dressing.ts` (`dressRaid2`, called from `buildRaid2`
before the presentation batch so members audit through source nodes), plus
contract test `src/raid2-slice2.test.ts`. Arena edits confined to a 2-line
import + 6-line call in `src/raid2-arena.ts`; `src/legacy-main.ts` untouched
(37100-line ceiling holds).

| Cell | Bodies (58 total) | Materials (all reused forged families) |
|---|---|---|
| 1 facade-bay | 2 cornice bands (above reach), 12 pilaster strips via `mirrorX` (±4, ±11, ±18 — wall-backed both faces) | stucco, solid + rated |
| 2 pool-terrace | 5 loungers + raised heads (mountable colliders ≤ 0.62 m), 3 round-pole umbrellas + cone canopies (2.7 m+), 1 towel stack | timber, stucco; poles/canopies non-box |
| 3 court | 11 line stripes + 8 ring-helper circle segments (34 mm proud, never coplanar), 2 hoop assemblies: round posts, mountable pads, rating-only glass, torus rims | limestone paint, glass, timber |

Deferred with reasons: pool ladders (rails stand inside the burial cut;
a 0.31 m stub is not a ladder; mouths already have walked steps), vehicles +
garage/garden cells (band-8/10 ratchet spends for the skeptic, not this slice).

## 2. Gates — VERIFIED, quoted

```
npx tsc --noEmit → exit 0 (TSC_EXIT=0)
```

```
npx vitest run src/raid2-fidelity.test.ts src/raid2-slice2.test.ts
  src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts
  src/legacy-main-size-ratchet.test.ts src/spawn-layout-quality.test.ts
→ Test Files 6 passed (6) / Tests 194 passed (194)
```

```
parity CLI → === raid2: 0 invisible collider(s), 0 walk-through mesh(es)
  [334 colliders (+27: 10 lounger + 1 towel + 2 pads + 12 pilasters + 2 cornices),
   0 boundary, 0 runtime-replaced statics, 351 visible meshes]
walkable CLI → === raid2: 0 fall-through floor(s)
  [42 walkable visuals censused, 42 fully supported, 668 colliders, 351 visible meshes]
```

```
layout metrics → eyeClusterCount: 34 (ratchet holds, zero headroom still zero spent)
  wallM2Per100M2Accessible: 15.56 (band 10 ceiling 17.0)
coplanar instrument → FINDINGS (different materials, no offset): 0
reachability → OK — every patrol point is reachable from the spawn table.
```

Slice-2 contract (`src/raid2-slice2.test.ts`, 5/5): ≥ 56 dressing meshes across
all five name families; every dressing material uuid ∈ base-arena set (zero new
materials); no solid in 0.9–1.8 m; stripes lift 0.034 m (> 0.03 threshold,
< 0.05 paint film); pilasters X-mirror symmetric.

## 3. Geometry families

`raid2` had exactly one (`BoxGeometry`). Slice 2 adds cylinder (poles, posts),
cone (canopies) and torus (rims) — 4 families toward the plan's ≥ 5 target,
all presentation-only, all parity-excluded on their own measurements.

## 4. Failure log (for the next slice)

1. **Band 25 burial:** ladder rails (top 0.7) stood inside the pool paving cut
   (< 0.31). Removed; deferred to slice 3. Lesson: the cut covers coping too —
   anything new near water must probe first.
2. **Band 8 ratchet +2:** (a) glass backboard colliders at 2.5 m — removed
   (rating-only; no body occupies 2.65 m+). (b) 0.12 m hoop posts piercing
   1.70 m — made round/pre­sentation; pads stay solid. (c) pilasters over door
   mouths — north wall is one cell thick (no row-share); moved to ±4/±11/±18,
   backed both faces. Lesson: the raster is collider-based; thin ≠ invisible.
3. **Direction C ballistic ghosts:** merged tall presentation batches
   (stucco 56 m blob, stone court blob) are census-visible under batch names
   with no exclusion. Fix: trim is SOLID (rated + excludable); tall pieces in
   open space are non-box (batcher skips them). Lesson: presentation boxes must
   merge flat/short/name-excluded, or be solid, or be non-box.

## 5. OPEN items

1. `OPEN` — visual read of all three cells (see §0 DESIGNED).
2. `OPEN` — vehicles, garage, garden-apron, interiors (slice 3+; ratchet spends).
3. `OPEN` — MP arena-sync re-measure (plan §8: dressing can only worsen it).
4. `OPEN` — hoop net (no box cognate; needs a later pass with its own pattern).
