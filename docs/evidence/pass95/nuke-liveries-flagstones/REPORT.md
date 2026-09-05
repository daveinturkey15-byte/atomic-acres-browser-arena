# Pass 95: nuke liveries + flagstones — evidence report

Lane: `contrib/dave-gaming-pc/muse/nuke-liveries-flagstones` (Muse Spark 1.3).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate @ 452d7aba`.
Scope: critic items 2 (+8) and 3 (+5) only. Rooflines are another lane's.

## Fix 1 — vehicle liveries (+8)

`src/nuketown2-arena.ts` (`forgedStreetVehicles`), `src/nuketown2-pipeline-budget.test.ts`.

- Coach: already the cream-and-maroon tour coach (`0xe7dec6` / `0xa8382c`) with chrome
  bumpers, grille and divider stripe via the shared paint/accent/chrome buckets. Kept;
  comment now cites FINDINGS Q4.
- Truck: was single-tone dark (`0x243139` paint + accent). Now two-tone white and dark:
  base `0xf2ede2`, dark accent `0x2b3138` as a procedural upper-cab surface band with a
  chrome divider (glass quads skipped by `surfaceBandAtHeights` construction). The authored
  cargo-box meshes take the same white forge paint, so box (white) + cab (white/dark)
  reads as one box-truck body. No collider, shot surface, box extent or name changed.
- Driveway cars: were navy forged sedans. Now vintage cherry-red (`0x9e1c1c`) classic
  coupes: same `SEDAN_SPEC` envelope the colliders own (parity untouched), dressing moves
  lamp heights/radii and bumper line down and adds a chrome side spear + upright grille
  from the shared chrome bucket. Street saloon/classic untouched.
- No new material family, no new pipeline: every new colour is a uniform value in the
  existing forge paint graph. Proof is the extended `keeps forge paint colours in one
  uniform-carried graph` test, which now also pins truck paint/accent and coupe paint to
  the coach graph key and their sRGB values.

Claim-states:
- [VERIFIED] truck/coupe/coach paints share one graph (pipeline-budget test, 26 passed
  with vehicle-forge suite).
- [VERIFIED] all five vehicle placements still dress a collider body < 0.20 m
  (fidelity forge-audit test); asymmetric vehicle name list untouched.
- [VERIFIED] the five vehicle review stations still resolve (review-camera suite green;
  minimap vehicle layer green).
- [OPEN] the on-screen read of the liveries (cream/maroon split height, red coupe tone).
  Falsifier: integrator WebGPU captures at `nuketown2-vehicle-near/mid/far`,
  `nuketown2-coach-elevation`, `nuketown2-truck-cab-near`. No GPU in this lane.

## Fix 2 — flagstone path (+5)

`src/nuketown2-grime-decals.ts` (`createStoneMaterial` only; plate, lift, family unchanged).

- The dense grid of white circular discs is gone. The same `yard stepping stones` decal
  plate now renders one meandering run per yard: 10 irregular polygonal flagstones
  (superellipse footprint, hashed axes/exponent/tone, 0.86 m pitch across the 9 m plate)
  on a gentle S-curve (`sin` centreline ±0.95 m + jitter).
- Symmetry: evaluated in the plate's folded frame (`qx = s·x + 1`, `qz = s·z + 29`,
  `s = −z/|z|`), identical on both yards, so `pair()`'s 180° rotation lands the same
  path on each. Count 10/yard ∈ [8, 14] by construction (pitch 0.86 over an 8.6 span).
- Stones sit at the documented decal offset: plate top = turf + 3 mm + stones lift
  (0.027 m), same as before; no face moved, so never coplanar.

Claim-states:
- [VERIFIED] verge ceilings unchanged: furniture 30/36 and aggregate 45/51 before AND
  after (same counter, full-arena build).
- [VERIFIED] coplanar checker: 0 FINDINGS before and after (274 FENCED / identical split;
  plate geometry untouched).
- [VERIFIED] six decal families intact, tiers intact, carriageway/footprint gates intact
  (grime suite green); full arena constructs (both builds exercised the new TSL graph).
- [OPEN] the on-screen read of the path (meander amplitude, stone gaps, tone).
  Falsifier: integrator WebGPU captures at `nuketown2-north-yard`, `nuketown2-south-yard`,
  `nuketown2-overhead`. No GPU in this lane.

## Verification quoted

- `src/nuketown2-pipeline-budget.test.ts` + `src/vehicle-forge/vehicle-forge.test.ts`:
  2 files, 26 tests passed.
- `src/nuketown2-grime-decals.test.ts` + `src/nuketown2-yard-props.test.ts` +
  pipeline-budget: 3 files, 25 tests passed.
- `src/nuketown2-fidelity.test.ts`: 39 passed (verge ceiling, forge audit, asymmetric
  list, climb, cover floors).
- `src/graphics-profile-contract.test.ts` + `src/pipeline-metrics.test.ts` +
  `src/nuketown2-review-camera.test.ts` + `src/legacy-main-size-ratchet.test.ts`:
  4 files, 21 passed (`src/legacy-main.ts` untouched).
- `src/minimap-semantic-layer.test.ts`: 4 passed.
- `npx tsx scripts/qa/find-coplanar-pairs.ts`: 0 FINDINGS (before and after).
- `npx tsc --noEmit`: exit 0.
- In-combat tripwire: no runtime material creation added; all liveries/path are
  build-time. Clustered budget still 1 pipeline inside the 54 ceiling (test-quoted).
