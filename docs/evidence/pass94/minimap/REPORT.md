# Pass 94 minimap declutter evidence — HF-491

## Claim states

- **VERIFIED** — Work was performed in `C:\Users\david\projects\aa-claude-minimap` on `contrib/dave-gaming-pc/claude/minimap-declutter`, based on requested Pass 93 candidate `7733d37b12e9fcca4565c2974a481180b9106590`.
- **OPEN** — `HF-491` was not present in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` on this base. The direct owner statement supplied for this task is the authority used for the correction.
- **VERIFIED** — Minimap admission is data-driven: explicit `minimapClass`, narrow shared name rules, and per-arena overrides. Unknown surfaces and physical-cover props default hidden. Nuketown2 uses exclusive rules so unrelated authored surfaces cannot leak into the minimap.
- **VERIFIED** — Structural source pieces are grouped into macro silhouettes. The 256px projection drops groups whose largest projected dimension is below `MINIMAP_MIN_SEGMENT_PX = 2`; grouped source pieces produce one readable element.
- **VERIFIED** — Dynamic actors remain icon paths: remote players and bots are circles, domination objectives are ringed letter icons, and the existing overdrive/target objective icons remain separate from structural elements.
- **VERIFIED** — No browser, headed process, renderer, GPU, preview server, or ComfyUI-owned process was used.

## Before / after element sets

Before HF-491, the renderer admitted broad collider rectangles and named cover landmarks:

```text
COLLIDER  COLLIDER  COLLIDER  COLLIDER  COLLIDER  ...
  PROP / SIGN / FENCE / PLANTER / APPLIANCE / DEBRIS / DECAL landmarks
  ROAD + HOUSE + COVER + every other static collider rectangle
```

After HF-491, the static layer admits only semantic macro silhouettes; players, bots,
and objectives are painted later as icons:

```text
[HOUSE north] [GARAGE north] [PERIMETER]
       [ROAD]
[HOUSE south] [GARAGE south] [TRUCK] [COACH] [HEAD CAR] [N CAR] [S CAR]

dynamic:  player / bot / objective -> icon only
hidden:   signs, low fences, planters, appliances, debris, particles, decals, unknowns
```

## Mechanical counts

The test builds every catalog arena through the headless arena factories and compares
the semantic result with the former static admission baseline (`houses + physicalCover`
for Atomic Acres, colliders for the other arenas).

| Arena | Before baseline | After semantic elements | Result |
| --- | ---: | ---: | --- |
| `atomic-acres` | 9 | 4 | **VERIFIED**, lower |
| `skyline-terminal` | 154 | 11 | **VERIFIED**, lower |
| `rustworks-1v1` | 63 | 0 | **VERIFIED**, lower |
| `gun-range` | 36 | 0 | **VERIFIED**, lower |
| `farcrysis` | 236 | 0 | **VERIFIED**, lower |
| `high-seas` | 213 | 0 | **VERIFIED**, lower |
| `test1` | 122 | 0 | **VERIFIED**, lower |
| `test2` | 307 | 6 | **VERIFIED**, lower |
| `map3` | 232 | 0 | **VERIFIED**, lower |
| `raid2` | 212 | 1 | **VERIFIED**, lower |
| `nuketown2` | 300 | 11 | **VERIFIED**, below ceiling 11 |

Nuketown2's ceiling is derived from the authored macro set:

```text
2 houses + 2 garages + 1 perimeter + 1 road + 5 vehicles = 11 elements maximum
```

The class-table snapshot and these count assertions are in
`src/minimap-semantic-layer.test.ts`.

## Gates

- **VERIFIED** — `npx tsc --noEmit` passed.
- **VERIFIED** — `npx vitest run src/*minimap* src/nuketown2-fidelity.test.ts src/legacy-main-size-ratchet.test.ts` passed: 2 files, 36 tests.
- **OPEN** — `npm run pipeline:preflight -- --machine dave-gaming-pc --harness codex` passed its lockfile subcheck but the contribution guard rejected the explicitly requested `contrib/dave-gaming-pc/claude/minimap-declutter` branch; the guard requires the truthful Codex prefix `contrib/dave-gaming-pc/codex/<short-outcome>`. No other harness identity was substituted.
- **OPEN** — Owner HITL/browser visual confirmation was not performed because this task explicitly prohibited browsers and GPU use; the integrator owns that review.
