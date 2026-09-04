# PASS 94 / Nuke Town Rebuild - circular turning head

## Scope

HF-472 / layout lane correction for the BO2-2025 cul-de-sac. The former square
16 m bulb is replaced by a circular 20-segment paved head at the authored
`NUKETOWN2_CUL_DE_SAC` centre. The stem, third-house placement, truck, coach,
saloon, classic car, and the 0.150 L truck/coach relationship are not re-seated.

## Dimensions and construction

| Item | Authored value | State |
|---|---:|---|
| Bulb centre | `x = -8.5`, `z = 0` | VERIFIED by fidelity test |
| Paved bulb radius / diameter | `8.0 m` / `16.0 m` | VERIFIED by footprint, cylinder parameters, and world bounds |
| Paved polygon resolution | `20` radial segments | VERIFIED by geometry parameters |
| Kerb ring width | `0.15 m` | VERIFIED from shared layout constant |
| Kerb segment count | `20`, closed around the head | VERIFIED by ring-count, angular-gap, and z-mirror tests |
| Kerb height | `0.24 m` | VERIFIED; remains below the `0.30 m` carriageway ceiling and `0.42 m` autostep |
| Stem half-width | `5.3 m` | VERIFIED unchanged |
| Front verge depth / corridor | `4.7 m` / `20.0 m` | VERIFIED unchanged |

The turning-head footprint is now circle-aware. The outdoor ground tiler rejects
cells intersecting the authored disc, while the lawn field receives the disc as
an explicit circular keep-out in addition to the builder's collider keep-outs.
The four corner pockets outside the disc remain ground/verge rather than being
silently paved by the old square cut.

## Claim states

- **VERIFIED** - `npx tsc --noEmit` is clean.
- **VERIFIED** - the focused suite is green: 6 files, 72 tests, including the
  circle/kerb test, vehicle-centre checks, exact z-mirror checks, ground/lawn
  cut checks, corridor ratio, and verge ceilings.
- **VERIFIED** - `npx tsx scripts/qa/find-coplanar-pairs.ts` reports
  `HOUSE-INTERIOR 0`, `STREET 0`, and `FINDINGS 0`.
- **VERIFIED** - the circular-head lawn population is exactly `8,910` blades
  in the deterministic field; the lower count is the measured cost of the new
  real kerb keep-out, ratcheted exactly rather than given a lower-bound escape.
- **DERIVED** - the disc is the authored 16 m diameter at the layout centre;
  its twenty straight kerb segments are derived from the shared radius and
  segment count, with the existing stem kerbs providing the tangent approach.
- **OPEN** - browser/HITL capture of the head at daylight, including the coach,
  box truck, saloon, third-house-beyond, circular kerb silhouette, and corner
  verge read. No browser, preview server, or GPU was used in this lane.
- **OPEN** - subjective confirmation that the segmented ring reads as a
  continuous kerbed turning head in WebGPU/TSL and WebGL2 presentation routes.

## What a capture must confirm

1. From an overhead daylight review camera, the asphalt reads as a circular
   16 m turning disc centred on the cul-de-sac, with no rectangular asphalt
   corners and a visibly closed short-segment kerb ring.
2. From a low stem-facing camera, the stem joins the disc cleanly at the mouth;
   the ring's two low end segments read as kerb fillets, not walls.
3. The coach, box truck and saloon remain at their measured existing centres;
   the truck remains on its authored across-street offset and the coach remains
   in the opposite bulb half.
4. The third house beyond the closed end remains visible and out of play, while
   lawn/verge stays outside the disc and no grass blade root appears on the
   paved head or kerb ring.
5. The head is identical across the z=0 team axis in both Performance and
   Quality presentations, with no depth race or runtime warning.

TODO (F4, larger than a code-only fix): confirm the square-minus-disc corner
interpretation in a daylight HITL capture before release. The exact checks are
the overhead and low stem-facing views at `docs/evidence/pass94/nuketown2-turning-head/REPORT.md:51-55`:
the disc must have no pale rectangular apron, its kerb must read as a ring, and
the corner pockets must intentionally remain ground/verge in both profiles.

## Validation commands

```text
npx tsc --noEmit
npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts src/legacy-main-size-ratchet.test.ts src/nuketown-lawn-field.test.ts src/grass-placement.test.ts
npx tsx scripts/qa/find-coplanar-pairs.ts
```
