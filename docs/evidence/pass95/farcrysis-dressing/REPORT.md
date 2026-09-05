# PASS 95 FARCRYSIS dressing stage

Date: 2026-09-05  
Candidate branch: `contrib/dave-gaming-pc/claude/v9-farcrysis-dressing`  
Layout base: `7197e427`  
Candidate art bundle: `bfdb90eb`

Claim states used here are `VERIFIED` (run and read in this worktree), `CLAIMED`
(reported by another artifact or reviewer), and `OPEN` (not accepted as done).

## Scope and authority

- VERIFIED: the dressing implementation is presentation-only. It adds no
  spawns, patrols, cover entries, shot surfaces, physics authority, or route
  segments. The two Muse-requested enhanced palms were re-seated through the
  existing shared placement function, retaining their named trunk colliders.
- VERIFIED: the arena remains parked in the selection registry with
  `selectable: false`; this pass did not unhide Farcrysis.
- VERIFIED: work stayed in the new worktree
  `C:\Users\david\projects\aa-m-farcrysis-dressing`. The owner publish worktree
  and the owner HITL server were not touched.
- VERIFIED: all new mesh construction and texture work is procedural and
  deterministic. The dressing module uses seeded geometry, seeded instance
  colours, the shared terrain-height authority, and already-admitted material
  families. The changed Farcrysis texture module has no original-image loader
  or external Farcrysis texture path.
- OPEN: the PASS 95 Muse brief's D0 real-photo reference set was not present in
  the repository. The blind review below is therefore a T2 directional review
  against four existing Farcrysis layout captures, not a photoreal acceptance.

## Dressing implementation

- VERIFIED: authored 28 mid-story placements, 56 understory whorls, and 3
  field-sign positions with deterministic route and spawn keep-outs. The
  foliage is instanced, shadow-capable, bounding-sphere fitted, and receives a
  distance LOD hook from the arena art loop.
- VERIFIED: the mesh families are procedural lobed canopies, trunks, leaf
  whorls, sign boards, and poles. No downloaded or copied game asset was added.
- VERIFIED: the palette and inline lighting were regraded to the 07:40
  post-rain daylight brief: restrained warm sun, blue sky lift, green bounce,
  readable gray rock, wet sand, bark, and foliage values. Existing clustered
  lighting and SH-L2-facing presentation hooks remain in place.
- VERIFIED: the existing procedural TSL/WebGPU water and shoreline path remains
  the single Farcrysis water owner. This pass adds no second ocean, water
  texture download, or water authority.

## Six-station before/after evidence

Both captures used installed Chrome headless, `PASS73_NATIVE_WEBGPU=1`, stock
flags plus `--mute-audio`, port `4268`, one browser, and the shared heavy lock.

| State | SHA | WebGPU adapter | Stations | Errors | select-to-active |
|---|---|---|---:|---:|---:|
| VERIFIED [before manifest](before-captures/manifest.json) | `e883f2d3` | NVIDIA / Blackwell | 6/6 | 0 | 60,484 ms |
| VERIFIED [after manifest](after-captures/manifest.json) | `bfdb90eb` | NVIDIA / Blackwell | 6/6 | 0 | 60,366 ms |

The six station images are retained in the two manifest-linked `farcrysis`
directories: beach, jungle dapple, core interior, seaplane, island top-down,
and west shoreline. VERIFIED cold-admission delta is **-118 ms** (after minus
before), so the dressing adds no cold-transition time and stays below the
500 ms limit. The post-pass runtime smoke also measured `59,690 ms` to active.

The captures show the intended added mid-story/understory dressing and improved
daylight/material separation. They also retain pre-existing low-poly and black
contact/shadow artifacts visible in the layout candidate. Those artifacts are
not hidden by this report; photoreal/deep-shade acceptance remains OPEN.

## Runtime budgets and disposal

The full receipt is [runtime.json](runtime.json). It is a stock WebGPU run on
port 4268 with zero page errors and zero console errors.

| Measure | VERIFIED result | Contract / interpretation |
|---|---:|---|
| In-combat sample | 60 s / 2,952 frames | sampled without app error |
| Frame p95 / p99 / worst | 27.9 / 44.5 / 99.8 ms | measurement, not a threshold change |
| In-combat pipeline additions | 0 | `pipelinesDuringSample: 0` |
| In-combat >1,000 ms gaps | 0 | tripwire clear |
| Peak presentation draw calls | 260 | below arena ceiling 460 |
| Peak submitted triangles | 790,701 | below arena ceiling 1,100,000 |
| Foliage node graphs | 16 | at asserted ceiling, no new graph class |
| Arena layout material census | 149 total / 130 standard | below current 166-material ceiling; Muse target 110 is OPEN |
| Runtime residency before combat | 0 retired roots | Farcrysis active |
| Runtime retirement after two switches | 1 root / 992 geometries / 166 materials / 1 shadow map | Farcrysis absent from `[atomic-acres, rustworks-1v1]`; disposal path exercised |

The runtime scene census reported 250 visible draw objects, 237 visible meshes,
114 instanced meshes, 93,221 instances, and 869,109 static triangles while
Farcrysis was active. The budget comparison above uses the presentation
submission counters for draw/triangle ceilings; the static census is retained
as separate evidence.

## Layout, parity, and fidelity bands

The after-dressing layout receipt is [layout-after-dressing.json](layout-after-dressing.json).

- VERIFIED: 215 solid colliders, 64 physical cover pieces, 479 shot surfaces,
  981 meshes, 149 materials, and 44 middle-band masses with zero unjustified
  masses.
- VERIFIED: the procedural placement code derives its keep-outs from the
  existing route and spawn tables; no route, spawn, cover, or fidelity-band
  authority was added.
- OPEN: the existing sightline band remains outside acceptance: maximum open
  line `93.99 m`, p50 `17.03 m`, p90 `45.30 m`, `392/1008` samples over the
  22 m ceiling, and `21/64` spawn pairs open. This dressing stage does not
  claim to close that layout-lane issue.
- VERIFIED: `npx tsx scripts/qa/find-coplanar-pairs.ts` found 0 HOUSE-INTERIOR
  pairs, 0 STREET pairs, 0 same-material-visible findings, and 0 actionable
  different-material/no-offset findings. Its 4 CONTACT, 274 FENCED, 10
  BENIGN, and 4 collision-only slope classifications are non-finding classes.
- VERIFIED: collider visual parity and walkable-surface parity both pass after
  retiring the stale Farcrysis seaplane ledger row; the gates remain intact and
  no threshold or finding class was weakened (2 files, 16 tests).

## Muse blind A/B

The complete result is [blind-ab/results.json](blind-ab/results.json), with the
human-readable [blind-ab/WIN-RATE.md](blind-ab/WIN-RATE.md).

- VERIFIED: `node scripts/loop/blind-ab.mjs` completed with Muse liveness,
  6 valid stations, 0 invalid stations, 4 decisive comparisons, and 2 ties.
- VERIFIED: after-dressing candidate B won 3 comparisons and before-dressing
  candidate A won 1; B was 75% of decisive votes and 66.67% with half-ties.
  Mean confidence was `0.8167`.
- VERIFIED: station result was B / A / tie / B / B / tie for beach, core,
  top-down, jungle, seaplane, and west shoreline respectively.
- OPEN: the artifact correctly labels the aggregate
  `VERIFIED-UNDERPOWERED` and `separates: false`. The sample is useful
  directional evidence, not a conclusive visual-quality win. Muse specifically
  called out mixed value/shadow and frond-material differences, matching the
  capture caveat above.

## Requested gates

| Gate | State | Result |
|---|---|---|
| `npx tsc --noEmit` | VERIFIED | exit 0 |
| `npx tsx scripts/qa/find-coplanar-pairs.ts` | VERIFIED | exit 0; actionable findings 0 |
| bounded expansion of `src/farcrysis*.test.ts`, `src/pipeline-metrics*.test.ts`, `src/graphics-profile-contract.test.ts`, and `src/legacy-main-size-ratchet.test.ts` | OPEN | 29/30 files and 207/208 tests pass; the remaining failure is the unchanged layout assertion `spawnPairsOpen <= 20` receiving 21 |
| `npx vitest run src/collider-visual-parity-gate.test.ts src/walkable-surface-parity-gate.test.ts` | VERIFIED | 2/2 files, 16/16 tests |
| `npm run build` under the shared heavy lock | VERIFIED | lock acquired/released by this worktree; Vite transformed 571 modules and built successfully in 2.33 s |
| `npm run pipeline:preflight -- --machine dave-gaming-pc --harness codex` | OPEN | policy expects a `codex/<short-outcome>` branch, while the user-required branch is `claude/v9-farcrysis-dressing`; no branch rename was attempted |

## Reproduction and source-priority note

The implementation recipe is [farcrysis-procedural-dressing-r185.md](../../../threejs-knowledge/recipes/farcrysis-procedural-dressing-r185.md).
It records the current Three.js r185 procedural terrain/instancing/water
references used for this pass and the disposal/LOD constraints. The recipe is
documentation only; upstream APIs were checked before implementation.
