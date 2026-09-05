# FARCRYSIS layout rebuild — PASS 95

This report records the layout-stage implementation on the owned worktree
`contrib/dave-gaming-pc/claude/v9-farcrysis`. The selector remains parked:
`farcrysis` is still a registered arena with `selectable: false` and
`multiplayer: false`. No original-game mesh, texture, frame grab, or downloaded
asset was added.

## Exact build and measured receipt

The deterministic layout receipt is
`layout-after-layout-final.json`, measured at commit `9548775d` by
`scripts/qa/measure-farcrysis-layout.ts` in the canvas-stub/no-browser
environment. It records 215 solid collider-audit rows, 64 physical-cover rows,
479 shot surfaces, 149 material objects, 93.99 m maximum open sample,
17.00 m p50, 45.30 m p90, 391/1008 samples over the 22 m target, 20/64 open
cross-team spawn pairs, and 45 middle masses with zero unjustified rows.

Fresh runtime evidence is in `captures/manifest.json` and `route-probe.json`:
installed Chrome headless on 127.0.0.1:4267, stock `--mute-audio`,
`PASS73_NATIVE_WEBGPU=1`, WebGPU/NVIDIA Blackwell, six of six station shots
with zero errors, and 32 of 32 route checks attempted with zero invisible
walls. The route run measured 30 walked edges and two named surface-cover
stops (`farcrysis-enhanced-palm-trunk-collider-35` and `-37`), so those stops
remain visible in the receipt rather than being treated as fully unobstructed
travel.

## Spec-to-build traceability

| Spec line / acceptance | Implementation | State |
|---|---|---|
| §4 Subject: flooded equatorial island, lagoon beach, jungle band, concrete research core | `buildFarcrysis()` terrain, lagoon, beach/jungle plates, landmark groves, core shell and procedural props | [VERIFIED] by source and unit arena construction |
| §5.2 bounds: `FARCRYSIS_BOUNDS` ±64 m | `src/farcrysis-constants.ts`; terrain plates, bound walls, routes and layout receipt derive from it | [VERIFIED] by `farcrysis-layout.test.ts` |
| §5.2 terrain authority and playable ground | `farcrysisTerrainHeight`, physics plates, safety floor, `FARCRYSIS_TERRAIN_WATER` | [VERIFIED] by terrain/proxy/spawn tests |
| §5.2 water/shore: one water body, rectangular dry mask, progressive shore | `FARCRYSIS_WATER` (`presentationOwner: arena-builder`), `farcrysis-lagoon-water`, `FARCRYSIS_SHORE`, water-level seating | [VERIFIED] by water-authoring and terrain tests |
| §R3 / §7 layout rhythm: beach ring, jungle band, core loop | `FARCRYSIS_LOOPS` with authored widths and sprint lap times | [VERIFIED] by layout tests |
| §R3 cardinal access: four lanes from beach to core | `FARCRYSIS_CROSS_LANES` and 28-edge `FARCRYSIS_ROUTE_SEGMENTS` | [VERIFIED] by layout tests and 32/32 browser route coverage; [MEASURED] 30 walked, 2 named cover stops, 0 invisible walls |
| §R3 verticality: one vertical crossing at the core | `FARCRYSIS_VERTICAL_CROSSING`; factory `verticalNavigation` route/ramp plus catwalk platform | [VERIFIED] by layout contract and builder tests |
| §5.2 cover minimum and cover placement rhythm | `FARCRYSIS_COVER_RHYTHM`; `farcrysis-physics.ts` collision-backed skiffs, rocks, trunks, crates, sandbags and core cover | [MEASURED] 64 physical-cover entries; [VERIFIED] collider and walkable parity gates |
| §5.2 spawn fairness bands | `FARCRYSIS_SPAWNS_XZ` remains the sole table; derived `FARCRYSIS_SPAWN_ZONES` publishes team bands, 6 m cover reach and 30 m visible-enemy floor | [VERIFIED] by spawn, registry and fresh runtime route tests; [MEASURED] 20/64 open cross-team pairs |
| §5.2 sightlines: 22 m engagement target and real occlusion | `measureFarcrysisSightlines()` traces eye-to-eye against named colliders and terrain ridges; no vacuous `>= 0` assertion | [MEASURED] 93.99 m max, p50 17 m, p90 45.3 m, 391/1008 over target; 22 m target [OPEN] |
| §5.2 scale anchors | `FARCRYSIS_SCALE`: 1.70 m eye, 0.42 m autostep, 5.20 m/s sprint, 0.70/1.80 m cover/view bands, 6 m spawn reach, 22 m engagement, 90/110/220 m trace caps and 18 m flamethrower | [VERIFIED] by source-linked unit assertions |
| §7 L2 middle clear-out | `FARCRYSIS_MIDDLE_EXEMPT`, named landmark composition and `measureFarcrysisMidMapMasses()` | [MEASURED] 45 masses, 0 unjustified |
| §7 L4 factory pattern | `box()` is the sole authority stamp; centred core slab and `pair()`-emitted symmetric core fixtures; collider, shot and cover arrays are authored together | [VERIFIED] by factory tests, coplanar checker and collider/walkable parity gates |
| §7 review stations | `FARCRYSIS_REVIEW_STATIONS` is the single source mapped into the visual definition; six stable IDs are consumed by the stock capture catalog | [VERIFIED] statically and by fresh 6/6 captures |
| §7 pipeline budget | `FARCRYSIS_PIPELINE_BUDGET` derives its foliage graph ceiling from `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS` and supplies the 460-draw/1.1M-triangle definition ceilings | [VERIFIED] by budget tests and the full requested suite |
| §7 hidden channel flag | `src/map-selection.ts` retains `selectable: false`, `prototype: true`, and `multiplayer: false`; registry builder remains present | [VERIFIED] by registry/selectability tests |
| §7 G1/G2/G3/G4/G9/G10/G11/G12 | TypeScript, 29 FARCRYSIS/legacy/pipeline test files, pipeline metrics, stock boot, solo/runtime and ground contracts | [VERIFIED] 194/194 tests; registry/roster adds 34/34 checks |
| §7 G11 route traversal | `probe-farcrysis-routes-stock.mjs` reads the canonical 28 route edges and retains the prior midpoint lane probes; it reports named surfaces, terrain, edges and invisible-wall class | [VERIFIED] 32/32 attempted, 0 skipped, 0 invisible walls; [MEASURED] 30 walked and 2 named cover stops |
| §7 coplanar/parity | `box()` stamps movement/shot authority beside each solid; `find-coplanar-pairs.ts`, collider-visual parity and walkable-surface parity remain unchanged | [VERIFIED] 0 coplanar findings, 0 invisible colliders, 0 walk-through meshes, 0 fall-through floors |
| §7 machine rule | Evidence scripts use installed Chrome, headless mode, `PASS73_NATIVE_WEBGPU=1`, `--mute-audio`, and base URL port 4267 only | [VERIFIED] by source and fresh runtime manifest |

## Gate ledger

| Gate | Result |
|---|---|
| Focused layout / pipeline / spawn / geometry suites | [VERIFIED] 44/44 focused tests passed after the route-probe repair; final full set also passed |
| Registry/selectability/roster + spawn fairness | [VERIFIED] 3 Vitest files / 26 tests and roster contract 8/8 passed |
| `npx tsc --noEmit` | [VERIFIED] passed at final source head |
| `npx tsx scripts/qa/find-coplanar-pairs.ts` | [VERIFIED] HOUSE-INTERIOR 0, STREET 0, HF-497 SAME-MATERIAL-VISIBLE 0, different-material findings 0 |
| Full requested vitest set | [VERIFIED] 29 test files, 194 tests passed |
| Locked stock-flags browser: overhead/stations + every route | [VERIFIED] one sequential lock-held evidence pass: 6/6 station shots, 32/32 route checks, 0 invisible walls |
| `npm run build` under lock | [VERIFIED] passed at final app source head |
| Contribution preflight | [OPEN] Codex identity is accepted by the adoption guard, but the user-required existing branch is named `.../claude/v9-farcrysis`; the Codex slug guard refuses that branch. No branch rename was performed. |
| Live-channel unhide / publish / merge / deploy | [OPEN] intentionally not performed; outside this feature-worktree task |

## Pushed implementation commits

- `b6543410` — retain the paused route/capture evidence.
- `fbfc22bb` — close the authored layout contract and route probe integration.
- `44dadc25` — bind terrain and cover rhythm to the layout contract.
- `a718759a` — record the initial layout contract receipt and traceability report.
- `f9672016` — keep review stations layout-owned.
- `508519a4` — bind the seaplane wing to collision authority.
- `5c182492` — probe closed route vertices instead of skipping them.
- `9cb75aea` — route the core loop around the shell.
- `9548775d` — register the elevated wing authority in the strict terrain test.

This report, the exact-SHA receipt, and the fresh captures are the layout
handoff. No selector flag is changed by this work; FARCRYSIS remains hidden
from the live channel.
