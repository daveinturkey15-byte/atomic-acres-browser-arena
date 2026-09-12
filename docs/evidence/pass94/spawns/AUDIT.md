# PASS 94 spawn distribution audit

Status: VERIFIED for the source tables, registry rows, built-map measurements and focused QA run recorded below. The optional live browser observation is intentionally not claimed here; it is gated separately in `REPORT.md`.

## Scope and registry

The roster is `src/map-selection.ts`'s `ARENA_SELECTIONS`, joined to the exhaustive `ARENA_BUILDERS` record in `src/spawn-layout-constraints.ts`. It contains 11 rows: 10 offered arenas and parked `farcrysis`. The `kind` column below is the registry declaration; `map3` is `explore` and has no bot population by contract.

Metrics are plan-space measurements of each authored table: `count`, bounding-box span `(x × z)` in metres, and mean nearest-neighbour distance in metres. The before column is the audit run against the branch before this change; the after column is the corrected authored data.

| Arena | Registry | Before team 0 / team 1 | After team 0 / team 1 |
|---|---|---:|---:|
| atomic-acres | offered, team | 12; 2.0×43.0; 4.25 / 12; 2.0×43.0; 4.25 | 12; 2.0×43.0; 4.25 / 12; 2.0×43.0; 4.25 |
| skyline-terminal | offered, team | 6; 54.0×0.0; 10.00 / 6; 48.0×0.0; 8.00 | 8; 54.0×0.0; 6.75 / 8; 48.0×0.0; 5.00 |
| rustworks-1v1 | offered, team | 6; 32.0×19.0; 9.33 / 6; 32.0×19.0; 9.33 | 8; 48.0×24.0; 9.52 / 8; 46.0×24.0; 9.52 |
| gun-range | offered, team; runtime-forced FFA | 6; 24.0×4.0; 4.00 / 6; 24.0×0.0; 4.00 | 8; 24.0×4.0; 4.00 / 8; 24.0×4.0; 4.00 |
| farcrysis | parked, team | 6; 28.0×26.0; 11.33 / 6; 42.0×44.0; 15.70 | 8; 28.0×26.0; 9.26 / 8; 42.0×44.0; 12.02 |
| high-seas | offered, team | 6; 18.0×6.2; 6.00 / 6; 18.0×6.2; 6.00 | 8; 18.0×13.2; 6.50 / 8; 18.0×13.2; 6.50 |
| test1 | offered, team | 6; 40.0×0.8; 7.40 / 6; 40.0×0.8; 7.40 | 8; 40.0×0.8; 5.37 / 8; 40.0×0.8; 5.37 |
| test2 | offered, team | 6; 16.0×53.0; 14.12 / 6; 8.0×46.0; 10.68 | 8; 16.0×53.0; 11.20 / 8; 8.0×46.0; 7.08 |
| map3 | offered, explore/no bots | 5; 36.8×7.6; 10.14 / 5; 36.8×7.6; 10.14 | unchanged: 5; 36.8×7.6; 10.14 / 5; 36.8×7.6; 10.14 |
| nuketown2 | offered, team | 6; 24.0×7.0; 6.26 / 6; 24.0×7.0; 6.26 | 8; 30.0×16.0; 8.14 / 8; 30.0×16.0; 8.14 |
| raid2 | offered, team | 6; 16.0×20.0; 7.33 / 6; 16.0×20.0; 7.33 | 8; 16.0×37.0; 9.24 / 8; 18.0×46.0; 9.01 |

The after count floor is 8 per team for every `team` row, including parked `farcrysis` and the runtime-FFA `gun-range`. The explore/no-bots exception is 5 for `map3`. The executable floor table is in `src/spawn-layout-quality.test.ts`: every row pins count, at least 18% of the longer arena axis, and a per-arena mean-nearest-neighbour floor.

## Existing runtime selection

Before this change, both runtime paths built a side-local list and then called `scoreSpawnCandidates` from `src/spawn-safety.ts`:

```ts
const valid = spawnMode === 'ffa' ? [...home, ...opposite] : flipped ? opposite : home;
const selectable = unoccupied.length > 0 ? unoccupied : valid;
const selection = scoreSpawnCandidates({
  candidates: selectable.map(({ candidate, index }) => ({ index, point: candidate })),
  threats, occupants: otherPlayers, recentDeaths: recentSpawnDeathPoints(),
  colliders: activeWorldColliders(), previousIndex: lastBotSpawnIndices.get(team) ?? -1,
  tieBreakSeed: stableSpawnTieBreakSeed(actorId),
});
```

The old scorer ranked visible-threat count, nearest-threat distance, recent death pressure, summed occupancy pressure and the previous index. It had no cross-actor recent-use history, and team-mode calls had already discarded the other side. In Nuke Town Rebuild, that meant a six-point table concentrated in one rear-yard band was repeatedly scored from a small, side-local pool. The source evidence supports the short-list and missing-history cause; the exact one-or-two live positions remains OPEN until a permitted live browser capture.

The corrected runtime call is deliberately small and shared by player and bot paths:

```ts
const selection = selectSpawnCandidates({
  arenaId: selectedArena.id, arenaKind: selectedArena.kind, mode: spawnMode,
  team: player.team, preferredSide: spawnMode === 'tdm' ? (flipped ? oppositeTeam : player.team) : undefined,
  candidates: selectable.map(({ index, point, side }) => ({ index, point, side })),
  threats, occupants: otherPlayers, recentDeaths: recentSpawnDeathPoints(spawnNow),
  recentUses: recentSpawnUseRecords(spawnNow), nowMs: spawnNow,
  colliders: activeWorldColliders(), previousIndex, tieBreakSeed: stableSpawnTieBreakSeed(player.id),
});
```

`src/spawn-selection.ts` first keeps all finite, already safety-filtered candidates; when a fresh point exists it excludes points used within 12,000 ms, then applies team-side preference only for TDM team arenas. It scores the remaining pool by visible threat count, farthest nearest threat, recent-death pressure, summed occupant pressure, recent-use pressure, repeat pressure and a seeded tie-break. Solo/explore and FFA remain full-map pools. The same module is used for both player and bot deployment.

## Nuke Town placement audit

`nuketown2` changed only `NUKETOWN2_SPAWN_LAYOUT` in `src/nuketown2-arena.ts`. The six original points remain in the two house back yards and span both sides of each house. The two additions per side are `[1,-40]` and `[-16,-40]`, with team 1's exact rotational partners `[-1,40]` and `[16,40]`; these extend selection into the border/street-end path without touching the truck or coach. The built-map audit reports 8/8 floor, autostep, cover, standoff, open-arc and enemy-LOS-valid points per side, cross-team minimum 49.65 m, and zero authored points inside geometry.

## QA assertions audited

- `src/spawn-safety.ts` keeps finite/bounds/collider validation unchanged and still provides the existing FFA reservation and safety tests.
- `src/spawn-layout-constraints.ts` measures floor, route, cover, wall standoff, open arc, enemy eye-LOS and cross-team separation from built colliders.
- `scripts/qa/measure-spawn-layouts.ts --out artifacts/qa/pass94-spawn-layouts-after.json` now audits all 11 registry rows, including parked `farcrysis`, and emits the count/bbox/mean-NN metrics above.
- `scripts/qa/solve-spawn-layouts.ts --all --wanted 8` and `scripts/qa/solve-farcrysis-spawns.ts --wanted 8` were run read-only against the built arenas. Candidate proposals were accepted only when the existing full constraint gate printed `PASSES`; the RustRig first proposal correctly printed `FAILS` for team separation and was not used.
- `src/spawn-layout-quality.test.ts` now runs the authored-layout and full constraint audits over `ARENA_SELECTIONS`, not only offered rows, and pins the per-arena count/spread floors.
- `src/spawn-selection.test.ts` pins 200-seed coverage, avoidance-window behavior, threat-distance monotonicity, deterministic ties and team-side preference.
