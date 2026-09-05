# FARCRYSIS layout rebuild — PASS 95

This report records the layout-stage implementation on the owned worktree
`contrib/dave-gaming-pc/claude/v9-farcrysis`. The selector remains parked:
`farcrysis` is still a registered arena with `selectable: false` and
`multiplayer: false`. No original-game mesh, texture, frame grab, or downloaded
asset was added.

## Exact build and measured receipt

The deterministic layout receipt is
`layout-after-layout-contract.json`, measured at commit `44dadc25` by
`scripts/qa/measure-farcrysis-layout.ts` in the canvas-stub/no-browser
environment. It records 214 solid collider-audit rows, 64 physical-cover rows,
478 shot surfaces, 149 material objects, 93.99 m maximum open sample,
17.00 m p50, 45.30 m p90, 391/1008 samples over the 22 m target, 20/64 open
cross-team spawn pairs, and 45 middle masses with zero unjustified rows.

The current runtime evidence is intentionally not inferred from those unit
numbers: the previous route receipt was a refused-server attempt and remains
OPEN until a fresh stock-flags browser run completes.

## Spec-to-build traceability

| Spec line / acceptance | Implementation | State |
|---|---|---|
| §4 Subject: flooded equatorial island, lagoon beach, jungle band, concrete research core | `buildFarcrysis()` terrain, lagoon, beach/jungle plates, landmark groves, core shell and procedural props | [VERIFIED] by source and unit arena construction |
| §5.2 bounds: `FARCRYSIS_BOUNDS` ±64 m | `src/farcrysis-constants.ts`; terrain plates, bound walls, routes and layout receipt derive from it | [VERIFIED] by `farcrysis-layout.test.ts` |
| §5.2 terrain authority and playable ground | `farcrysisTerrainHeight`, physics plates, safety floor, `FARCRYSIS_TERRAIN_WATER` | [VERIFIED] by terrain/proxy/spawn tests |
| §5.2 water/shore: one water body, rectangular dry mask, progressive shore | `FARCRYSIS_WATER` (`presentationOwner: arena-builder`), `farcrysis-lagoon-water`, `FARCRYSIS_SHORE`, water-level seating | [VERIFIED] by water-authoring and terrain tests |
| §R3 / §7 layout rhythm: beach ring, jungle band, core loop | `FARCRYSIS_LOOPS` with authored widths and sprint lap times | [VERIFIED] by layout tests |
| §R3 cardinal access: four lanes from beach to core | `FARCRYSIS_CROSS_LANES` and 28-edge `FARCRYSIS_ROUTE_SEGMENTS` | [VERIFIED] by layout tests; browser traversal [OPEN] |
| §R3 verticality: one vertical crossing at the core | `FARCRYSIS_VERTICAL_CROSSING`; factory `verticalNavigation` route/ramp plus catwalk platform | [VERIFIED] by layout contract and builder tests |
| §5.2 cover minimum and cover placement rhythm | `FARCRYSIS_COVER_RHYTHM`; `farcrysis-physics.ts` collision-backed skiffs, rocks, trunks, crates, sandbags and core cover | [MEASURED] 64 physical-cover entries; parity walkthrough [OPEN] |
| §5.2 spawn fairness bands | `FARCRYSIS_SPAWNS_XZ` remains the sole table; derived `FARCRYSIS_SPAWN_ZONES` publishes team bands, 6 m cover reach and 30 m visible-enemy floor | [VERIFIED] by spawn tests; live runtime [OPEN] |
| §5.2 sightlines: 22 m engagement target and real occlusion | `measureFarcrysisSightlines()` traces eye-to-eye against named colliders and terrain ridges; no vacuous `>= 0` assertion | [MEASURED] 93.99 m max, p50 17 m, p90 45.3 m, 391/1008 over target; 22 m target [OPEN] |
| §5.2 scale anchors | `FARCRYSIS_SCALE`: 1.70 m eye, 0.42 m autostep, 5.20 m/s sprint, 0.70/1.80 m cover/view bands, 6 m spawn reach, 22 m engagement, 90/110/220 m trace caps and 18 m flamethrower | [VERIFIED] by source-linked unit assertions |
| §7 L2 middle clear-out | `FARCRYSIS_MIDDLE_EXEMPT`, named landmark composition and `measureFarcrysisMidMapMasses()` | [MEASURED] 45 masses, 0 unjustified |
| §7 L4 factory pattern | `box()` is the sole authority stamp; centred core slab and `pair()`-emitted symmetric core fixtures; collider, shot and cover arrays are authored together | [VERIFIED] by factory tests; coplanar/parity gate [OPEN] |
| §7 review stations | `FARCRYSIS_REVIEW_STATIONS` is the single source mapped into the visual definition; six stable IDs are consumed by the stock capture catalog | [VERIFIED] statically; fresh captures [OPEN] |
| §7 pipeline budget | `FARCRYSIS_PIPELINE_BUDGET` derives its foliage graph ceiling from `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS` and supplies the 460-draw/1.1M-triangle definition ceilings | [VERIFIED] by focused budget tests; full gate [OPEN] |
| §7 hidden channel flag | `src/map-selection.ts` retains `selectable: false`, `prototype: true`, and `multiplayer: false`; registry builder remains present | [VERIFIED] by registry/selectability tests |
| §7 G1/G2/G3/G4/G9/G10/G11/G12 | TypeScript, 25 arena suites, pipeline metrics, stock boot, solo/runtime and ground contracts | [OPEN] pending final bounded gate block |
| §7 G11 route traversal | `probe-farcrysis-routes-stock.mjs` now reads the canonical 28 route edges and retains the prior midpoint lane probes; it reports named surfaces, terrain, edges and invisible-wall class | [OPEN] previous receipt was `ERR_CONNECTION_REFUSED`; fresh port-4267 run pending |
| §7 coplanar/parity | `box()` stamps movement/shot authority beside each solid; `find-coplanar-pairs.ts`, collider-visual parity and walkable-surface parity remain unchanged | [OPEN] pending locked checks |
| §7 machine rule | Evidence scripts use installed Chrome, headless mode, `PASS73_NATIVE_WEBGPU=1`, `--mute-audio`, and base URL port 4267 only | [VERIFIED] by script source; runtime result [OPEN] |

## Gate ledger

| Gate | Result |
|---|---|
| Focused layout / pipeline / spawn / geometry suites | [VERIFIED] 25 tests passed before the final gate block |
| `npx tsc --noEmit` | [VERIFIED] passed after layout contract wiring |
| `npx tsx scripts/qa/find-coplanar-pairs.ts` | [OPEN] lock was occupied; not run in this receipt |
| Full requested vitest set | [OPEN] pending lock |
| Locked stock-flags browser: overhead/stations + every route | [OPEN] pending lock; prior refused-server artifact retained as failed evidence |
| `npm run build` under lock | [OPEN] pending lock |
| Contribution preflight | [OPEN] Codex identity is accepted by the adoption guard, but the user-required existing branch is named `.../claude/v9-farcrysis`; the Codex slug guard refuses that branch. No branch rename was performed. |
| Live-channel unhide / publish / merge / deploy | [OPEN] intentionally not performed; outside this feature-worktree task |

## Pushed implementation commits

- `b6543410` — retain the paused route/capture evidence.
- `fbfc22bb` — close the authored layout contract and route probe integration.
- `44dadc25` — bind terrain and cover rhythm to the layout contract.

The next evidence-only commit will update this report and the exact-SHA receipt
after the lock-protected checks. No selector flag is changed by that work.
