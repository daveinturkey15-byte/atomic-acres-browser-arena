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
coplanar instrument (raid2) → boxes=350 · pairs≤0.03 m: 145 · FINDINGS: 19 · FENCED: 0 · BENIGN: 126
  (all 19 pre-existing base-arena flush tops, none slice-2; slice-2 dressing contributes 0 — §7)
reachability → OK — every patrol point is reachable from the spawn table.
```

Slice-2 contract (`src/raid2-slice2.test.ts`, 5/5): ≥ 56 dressing meshes across
all four tested name-prefix families; every dressing material uuid ∈ base-arena set (zero new
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
## 6. LUNA review TODOs — disposition

All three BLOCKING items verified against the code and closed below; the
OPEN judgeset item remains OPEN (no browser/GPU in this session either).

## 7. Blocking findings fixed (fix pass, 2026-09-04)

**Claim-states.** `VERIFIED` = ran or read in the fix session, quoted.
`OPEN` = unknown, named as unknown.

1. **Gates re-run green — VERIFIED.** Luna's 180 s timeouts do not reproduce:
   `npx tsc --noEmit` → `TSC_EXIT=0` (69 s baseline, 73 s on the final tree
   with the new instrument included); the exact six-file vitest invocation →
   `Test Files 6 passed (6) / Tests 194 passed (194)` in 23.47 s; the named
   `npx tsx scripts/qa/find-coplanar-pairs.ts` (nuketown2) → exit 0,
   `FINDINGS: 0 · FENCED: 33 · BENIGN: 33`, 239 boxes. No test, threshold or
   gate was changed to get green.
2. **RAID2 coplanar instrument added — VERIFIED, and it found real work.**
   New `scripts/qa/find-coplanar-pairs-raid2.ts`: the HF-434 top-face method
   (0.03 m, FINDING/FENCED/BENIGN, exit 1 on any FINDING) scoped to
   `buildRaid2`, same batch-source-node handling, same exit contract (not
   weakened). Result: `boxes=350 · pairs≤0.03 m: 145 · FINDINGS: 19 ·
   FENCED: 0 · BENIGN: 126`. All 19 are pre-existing base-arena flush tops
   (drive plinth/planters at 1.90 m; pergola/wing/carport/pool-bar/pavilion
   wall/roof tops at 3.40 m) — zero rows name slice-2 dressing
   (`raid2 facade/deck/court stripe/court hoop`); court stripes sit 0.034 m
   proud of the floor (> 0.03 m), and stripe-vs-stripe pairs are same-material
   BENIGN. The old §2 "FINDINGS: 0" line (only ever true of nuketown2) is
   corrected above. Rotated circle segments stay covered by the slice-2
   contract test's rotation-safe lift assertion; non-box pieces by the parity
   CLI. HF-472 check: no roster or vendored HF-472 symbol in the slice diff —
   ownership stays OPEN, nothing claimed.
3. **Rebuild plan restored — VERIFIED.** `docs/research/2026-09-04/` (8 files,
   checked out from `da95b7d4` on
   `origin/contrib/dave-gaming-pc/claude/research-2026-09-04`, content
   unchanged) now grounds the citations: §5 estate-cell decomposition, §6.5
   geometric z-fighting rule, §7 gameplay contract, §8 gates; header lists
   ledger rows HF-408/HF-427 served by this slice.

**New TODO (larger item, not this slice):** the 19 base-arena flush-top pairs
are systematic (walls/roofs meeting at exactly 3.40 m, e.g.
`src/raid2-arena.ts:572` pavilion roof, `:666` pool-bar roof, `:726` wing
floor east). Whether each overlap is a visible depth race or buried contact
needs a renderer (no GPU here) — `OPEN`. Fix belongs to the lane that owns
raid2 base geometry: offset, step, or same-material the meeting tops, pair by
pair, with this instrument as the ratchet. Slice-2 dressing stays at 0.

**Still OPEN (unchanged):** 5 m + 40 m cell judgesets and MP arena-sync
re-measure before visual/HITL acceptance (§5 items 1, 3).
