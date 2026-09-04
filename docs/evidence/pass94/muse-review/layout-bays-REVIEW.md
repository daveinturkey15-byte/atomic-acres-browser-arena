# Muse review — roadside bays commit (HF-491)

Scope: commit `6d3e1ad8` only (`git show 6d3e1ad8 --stat`: 4 files,
`src/nuketown2-layout.ts`, `src/nuketown2-arena.ts`,
`src/nuketown2-fidelity.test.ts`, plus `docs/evidence/pass94/layout-hitl5/REPORT.md`),
read against REPORT §7. No `src/` touched, no builds/tests/browsers run.
Branch `contrib/dave-gaming-pc/claude/layout-hitl5` verified at review time.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. All five asked properties hold on the code as written: the split ceiling is
   provably tighter on furniture (43 → 36 effective, laundering closed), the
   1e-9 snap removes only float noise, grass keep-out walks every blade
   instance, spawn/LOS bands cannot see the 0.24 m lips, and the z-mirror is
   asserted twice for all 8 new bodies.
2. No production assertion was loosened: both gate deltas live in the test's
   own measurement helpers (`snapM`, id-table split) while every gate still
   demands exact equality at zero headroom.
3. The real costs are reported, not hidden (+46 ground tiles / +54 colliders,
   9,517 → 8,928 blades, 67 → 113 tiles), with the only OPEN item (tiler
   multiplication) falsifiable on GPU frame time this lane was told not to
   touch. The three fixes below are follow-ups, none blocks landing.

## (1) The two gate changes — claim-states

### (1a) Split verge ceiling is STRICTLY STRONGER on furniture [VERIFIED]

Arena table (`src/nuketown2-arena.ts:2408-2420`): stem verge 3 → 11 tiles
(+8); head end 1 + frontage north 1 + frontage south 2 = 4 unchanged.
Dressing ids containing `" verge "` after: 15 (1 + 1 + 6 + 2 + 5).
Test (`src/nuketown2-fidelity.test.ts:2553-2559`):

```ts
const vergeBodies = names.filter((n) => n.includes(' verge '));
const dressingIds = NUKETOWN2_GROUND_DRESSING.map((piece) => piece.id);
const vergeFurniture = vergeBodies.filter((n) => !dressingIds.some((id) => n.includes(id)));
expect(vergeFurniture.length).toBeLessThanOrEqual(36);
expect(vergeBodies.length).toBeLessThanOrEqual(51);
```

Proof against the arena table: REPORT §7(a) states the old 43 = 36
furniture + 7 dressing decals. New: 36 + 15 = 51. Old gate allowed furniture
up to 43 (delete all 7 dressing, add 7 props, stay at 43). New gate caps
furniture at 36 independently, both halves at zero headroom. Any +1 prop now
fails the furniture cap regardless of lawn-tile deletions — the laundering
route the single count allowed is closed. Aggregate 51 > 43 is not a
loosening: it counts a different population (+8 lawn tiles the bays require),
and the furniture sub-cap is what the gate's own header says the ceiling is
for ("the furniture line has a ceiling … waist-high props close the
corridor"; lawn decals close nothing). Dressing exclusion by id-table read
rather than name pattern also closes rename-into-the-gap for the dressing
side. Residual (pre-existing, not introduced): furniture membership is still
substring `" verge "` — a prop that avoids the substring dodges both caps.
Not this commit's hole, noted for completeness.

### (1b) `planFootprint()` 1e-9 snap is NOT a loosening in any case that mattered [VERIFIED]

Test helper (`src/nuketown2-fidelity.test.ts:340-350`): `SNAP_DECIMALS = 9`,
`centre ± size/2` reconstruction snapped to 1 nm. Production geometry
untouched — snap lives only in the test's ruler. Arena's own plan epsilon is
1e-4 m (`src/nuketown2-arena.ts:2436-2438` `planRectOverlaps`), so the snap
quantum sits 5 orders below the smallest overlap the builder itself
recognises and 13 below anything human-authored. Worst-case edge shift is
0.5 nm per edge; on an 18 m tile the overlap-area error is < 4e-8 m².
The two red values REPORT §7(b) names (6.1e-17, 3.9e-15 m²) are float64
reconstruction noise from garage-relative runs (4.05, 9.45, 17.7 — values
whose `x ± w/2` does not round-trip), 6–8 orders below the snap quantum.
Every exact-zero assertion (`:1019`, `:2406`, `:2712`, `:2749`) still demands
`toBe(0)` after the snap — a real lap (≥ µm, let alone mm) survives 1 nm
quantisation intact. Direction is correct: deterministic number, same
exact-equality bar.

## (2) Tile / collider growth [MEASURED per REPORT, OPEN per REPORT]

67 → 113 ground tiles (+46), 293 → 347 colliders (+54, of which 46 are ground
tiles), coplanar boxes 757 → 819. Mechanism confirmed in code: the tiler
(`src/nuketown2-arena.ts:2462-2488`) emits one tile per (x-cut, z-cut) cell
over the whole 36 × 84 m grid, so 4 new x-cuts (−0.2, 4.05, 9.45, 17.7) and 2
new z-cuts (±7.5) multiply across bands that never touch a bay. This is the
cost `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS`' own header warns about for the bulb
disc, paid again here.

No budget test in the repo would have caught it — checked, not assumed:

- `src/graphics-profile-contract.test.ts` pins graphics preset strings and
  control-set hashes, not arena mesh/collider counts.
- `src/legacy-main-size-ratchet.test.ts` pins `src/legacy-main.ts` line
  count, untouched by this lane.
- `src/collider-visual-parity-gate.test.ts` demands zero invisible colliders
  + per-arena ghost ceilings, not count caps; +54 explained colliders pass it
  by construction.
- `src/nuketown-lawn-field.test.ts` caps its own field at 4 instanced draws;
  the Nuketown-2 lawn is a different builder (`builder.colliders` keep-outs,
  `src/nuketown2-arena.ts:3006-3024`).

Cheapest cap (follow-up, own pass as REPORT says): post-pass merge in
`buildNuketown2Ground` of adjacent coplanar same-material ground cells that
share a full edge and identical z-span outside the bay/verge bands — or,
equivalently, scope the four bay x-cuts to the verge z-bands instead of the
full grid. Expected return to the low-70s tile count with zero visual or
collider change (all merged tiles are one material, `m.ground`, top at 0 m).
Do not hand-merge tile names: the asymmetry test classifies tiles by property
(`src/nuketown2-fidelity.test.ts:1832-1864`), not by name, precisely so a
re-cut renumbers freely.

## (3) Grass keep-out: ALL blades, not a sample [VERIFIED with one pin missing]

`src/nuketown2-fidelity.test.ts:2727-2738` loops `mesh.count` for every
`nuketown2-lawn-region-*` InstancedMesh, `getMatrixAt` → `localToWorld` →
strict-interior test against all four `WORLD_BAYS` (handedness-mapped at
`:366-369`). That is the real instanced field, every root, not an inference
from the region table (which is separately asserted exact-zero at `:2709-2713`
via `nuketownRebuildLawnRegions(WORLD_GROUND_DRESSING)`). Counters
`:2723`/`:2739` require regions > 0 and blades > 0, but do NOT pin 8,928 —
the REPORT table value (9,517 → 8,928, grass evicted from 55 m²) is MEASURED,
not ratcheted. A field that silently halved would still pass. Companion
cover check (`:2760-2769`) is a 0.13 m lattice sample over the stem band, not
an exhaustive proof: seam-offset (0.07/0.13 vs whole/half-metre seams) avoids
false holes but a sliver gap < 0.13 m could hide between samples. See F1/F2.

## (4) Spawn fairness: no band or LOS change [VERIFIED]

Spawns live in the back yards (`:1538-1624`): behind house back walls
(|z| = 23, `:1560`), inside the fence (|z| ≤ 36), ≥ 6 per team, team-1 table
the exact 180° negation. Bays sit at |z| ∈ [5.3, 7.5] (`NUKETOWN2_BAY_DEPTH =
2.2`, `src/nuketown2-layout.ts:240`; `KERB_Z = −5.3`,
`src/nuketown2-arena.ts:242`), ~16 m from the nearest spawn. Kerb lips are
0.24 m tall topping at ≤ 0.30 m (`:1917-1921`, `:2625-2626`), under the 0.42 m
autostep (`src/nuketown2-arena.ts:300-301`). Eye lines run at 1.65–1.7 m
(`clearLine(..., 1.65)` at `:1598`; `isBlocked(..., y = 1.7)` at `:1554`) —
a 0.3 m lip cannot intersect them, and spawn-to-spawn lines were already
house-blocked. Street centre-line `longestRun` probe (`:525`) runs at z = 0,
bays start 5.3 m away. Overdrive eye-to-core (`OVERDRIVE_POSITION` y 3.75,
sight offset +0.25) is orders above kerb height; street vehicles byte-identical
per REPORT so the 0.150 L truck offset is untouched. No spawn band reads the
verge (backWall/fence/`furthestLegalYardCorner = hypot(18, 36)` all derive
from house/yard geometry). New kerbs also satisfy the corridor-height bar that
keeps them out of cover: (ii) holds every carriageway body ≤ 0.30 m.

## (5) Z-mirror partner under EXPECTED_ASYMMETRIC_CARRIAGEWAY: asserted for the new bodies [VERIFIED]

Two independent assertions, both drift-proof:

- Footprint-table mirror (`:2595-2615` region): every bay rect has an exact
  partner with identical x0/x1 and z0 = −z1, z1 = −z0. Exact equality, not
  `toBeCloseTo`.
- Geometry property (i) (`:1907-1911`): loops ALL `roadBodies` — which
  includes the 8 bay bodies because names are derived from the footprint
  table (`:1773-1775` `filter(isNuketown2BayFootprint).flatMap(...)`), so a
  bay added in layout cannot be missed here. Each road body must have an
  exact z-mirror partner by `size|pos` key. Corridor containment (iii)
  (`:1928-1933`) and kerb ceiling (ii) likewise run over the bay bodies.
  Asphalt/kerb existence at the authored rectangle is measured in the world
  frame to 5 dp with flush top (y = 0) and outer-edge kerb placement
  (`:2617-2635`).

Minor strictness note: property (i)'s key quantises position to mm
(`at()` → `toFixed(3)`), looser than the footprint table's exact check —
but the bay-specific test is exact, so the combination covers it. No gap.

## Findings

- F1 — `src/nuketown2-fidelity.test.ts:2739` — blade count not pinned.
  Why: 8,928 is the eviction proof (grass left the 55 m²); `> 0` lets a
  halved field pass. Fix: `expect(blades).toBeGreaterThanOrEqual(8928)` (or
  exact with the determinism note from `nuketown-lawn-field.test.ts:102-109`
  if this field is deterministic). Non-blocking.
- F2 — `src/nuketown2-fidelity.test.ts:2760-2769` — stem-band cover is a
  0.13 m lattice sample. Why: sub-sample slivers hide. Fix: exact union-area
  arithmetic over `stemTiles + bays + aprons` vs band rect (areas already
  asserted individually at `:2746-2751`). Non-blocking.
- F3 — `src/nuketown2-arena.ts:2462-2488` — tiler multiplies full-grid cuts;
  no tile/collider budget ratchet exists (see §2). Why: next verge cut pays
  again. Fix (own pass): merge coplanar same-material ground runs post-cut
  and add a `groundTiles <= 113`-style ratchet at the new value. OPEN,
  needs GPU frame-time falsifier per REPORT §7(c). Non-blocking.
- F4 (nit) — `src/nuketown2-fidelity.test.ts:1773-1775` vs `:1907` — property
  (i) key is mm-quantised while the bay mirror test is exact. Why: two bars
  for one property. Fix: none required; optionally note the exact test as
  authoritative. Informational.

## Numbers re-derived (not transcribed)

mouthX = −0.5 → mouth run [−0.2, 4.05] = 4.25 m; garage span [4.25, 9.25]
(`HOUSE_CENTRE_X + WIDTH/2`, `src/nuketown2-layout.ts:202-209`) → outer run
[9.45, 17.7] = 8.25 m; depth 2.2 both sides; paved 2×5.3 + 2×2.2 = 15.0 m;
local widening 4.4 m; hard surface 2×(4.25+8.25)×2.2 = 55.0 m²; corridor
2×10.0 = 20.0 m; ratio 20/11 = 1.818 — all match REPORT §7 and the test's
`toBeCloseTo` pins. The garage/house constants move
(`NUKETOWN2_HOUSE_WIDTH`, `NUKETOWN2_HOUSE_CENTRE_X`,
`NUKETOWN2_GARAGE_WIDTH/SPAN`, `NUKETOWN2_HOUSE_LAYOUT` at
`src/nuketown2-layout.ts:202-209,375`) is a single-source rule application,
asserted round-trip by the 0.2 m margin pins (`:2684-2690`).

## Claim-states

- VERIFIED: split ceiling strictly tighter on furniture; snap removes only
  noise; grass loop covers every blade instance; spawn/LOS unaffected; z-mirror
  asserted for all 8 new bodies (table + geometry).
- MEASURED (REPORT §7, code-consistent): 15.0 m / +4.4 m / 55.0 m² / 20.0 m /
  1.818; 67→113 tiles; 293→347 colliders; 9,517→8,928 blades; boxes 757→819.
- OPEN: tiler multiplication cost (GPU falsifier outstanding); 2.2 m depth on
  the BO2-2025 overhead falsifier; bay-end low walls HELD.
- Not claimed: nothing seen running — no browser/GPU/preview touched, per
  lane constraints and REPORT §7 claim-states.
