# Vehicle Forge 2 — Pass 94 evidence

Scope: presentation-only procedural vehicle art on the `vehicle-forge-2` lane.
The authored vehicle boxes, baked centres, colliders, shot surfaces and the
0.150 m placement offset were not moved.

## Claim-state ledger

| Claim | State | Evidence |
| --- | --- | --- |
| Coach, box truck and bubble saloon are procedural loft/dressing code. | VERIFIED | `src/vehicle-forge/**`; TypeScript and vehicle-forge tests pass. |
| Existing one-draw-per-material merge survives. | VERIFIED | Arena audit remains 11 merged vehicle draws; the explicit pipeline-metrics gate passes. |
| Paint colours share one graph shape and carry colour in a uniform. | VERIFIED | `nuketown2-pipeline-budget.test.ts`; navy uniform retains the exact sRGB-to-linear value. |
| Dark navy no longer receives the old channel lift. | VERIFIED | `createForgePaintMaterial` uses the unlifted linear swatch in a uniform. |
| Bumpers and saloon whitewalls use the existing chrome role; no purple bumper role exists. | VERIFIED | Forge assembly and budget tests inspect `userData.forgeRole === 'chrome'`. |
| Existing fidelity/mirror and collider parity remain valid. | VERIFIED | `nuketown2-fidelity.test.ts` and `collider-visual-parity-gate.test.ts` pass. |
| Reference capture visually confirms aerodynamic silhouettes and colour read. | OPEN | No browser, preview, headed runtime or GPU work was permitted in this lane. |

## Measured local bounds and triangle budgets

Bounds are measured from the complete local presentation group, including
trim, wheels and detail. The truck's retained authored cargo envelope is
11.700 m long; the forge cab package includes the panel-seam run under that
same vehicle placement and measures 10.707 m.

| Vehicle | Dressed bounds (W × H × L) | Triangles | Budget | Materials/roles |
| --- | ---: | ---: | ---: | --- |
| Tour coach | 2.628 × 3.225 × 9.140 m | 9,476 | 10,000 | cream paint, maroon clipped upper band, chrome trim/grille/hubcaps, glass, lining, tyre, lamps |
| Box truck | 2.660 × 2.845 × 10.707 m | 5,164 | 6,000 | dark truck paint on retained cargo panels, groove seams, chrome grille/mirrors/bumper/steel faces, glass, lining, tyre, lamps |
| Bubble saloon | 1.900 × 1.809 × 4.440 m | 8,516 | 9,000 | dark navy paint, chrome bumpers/faces/whitewalls, glass, lining, tyre, lamps |

The silhouette gate allows the previous collider envelope plus 0.150 m. The
coach is derived from 2.600 × 3.300 × 9.100 m, the cab/cargo truck from
2.600 × 2.900 × 11.700 m, and the saloon from 1.900 × 1.880 × 4.400 m.

## Acceptance commands and results

`npx tsc --noEmit` — **VERIFIED**, exit 0.

`npx vitest run src/vehicle-forge/vehicle-forge.test.ts
src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts
src/nuketown2-pipeline-budget.test.ts src/pipeline-metrics.test.ts
src/legacy-main-size-ratchet.test.ts` — **VERIFIED**, 6 files / 65 tests
passed.

The requested wildcard form was also exercised; Vitest ignores the absent
wildcard matches on this branch, so the explicit equivalent above includes the
restored 54-graph budget gate rather than treating an absent file as proof.

## What a permitted capture must confirm

1. Coach reads as a streamlined cream lower body with a maroon upper shell,
   continuous dark glazing, a thin chrome separator, rounded roof, arches,
   retro grille and hubcaps.
2. Truck reads as a dark rounded-hood cab joined to the retained dark box,
   with visible panel seams, mirrors, grille and wheels; its three gameplay
   openings remain open.
3. Saloon reads as a rounded 1950s bubble body in dark blue, with chrome
   bumpers and visibly whitewall tyres rather than purple trim.
4. A before/after draw census still reports 11 merged vehicle draws, and no
   forged mesh registers as a collider or ballistic surface.

TODO (F2 watch item, larger than this review fix): make the accent material
optional when no dressing emits an accent at `src/vehicle-forge/build.ts:82-95`
and remove the unused truck/saloon accent instances at
`src/nuketown2-arena.ts:2277-2282`.
