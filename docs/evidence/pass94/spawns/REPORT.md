# PASS 94 spawn distribution report

## Outcome

The shared player/bot spawn selector now uses the complete valid candidate pool,
farthest-nearest-threat scoring, recent death and recent-use pressure, summed
occupancy pressure, deterministic repeat avoidance and team-side preference. New
points were added only where the audit found the authored table below its floor.

The source candidate is mechanically verified but is not release-accepted: no
immutable preview is bound and Dave has not yet performed PASS 94 owner HITL.

## Claim states

- VERIFIED: branch is `contrib/dave-gaming-pc/claude/spawn-distribution`, at the
  live PASS 93 head `399d05b1be6a2b87e7d8d3b788accb162ebd7907`; `origin/main`
  `506d6142ce09b8317279a8c705d2de25fa2ab84b` is its ancestor.
- VERIFIED: all 11 registry rows were audited, including parked `farcrysis`;
  the offered roster is 10 arenas and `map3` remains explore/no-bots.
- VERIFIED: focused TypeScript and Vitest gates passed: 7 files, 244 tests.
- VERIFIED: the built-map spawn audit reports 100% envelope, floor and route
  coverage for every registered row.
- VERIFIED: one permitted headless runtime probe on `nuketown2` passed with no
  page/console errors, two player landings and six bot spawn selections, all
  matching gate-passing authored points.
- OPEN: the broader walkable-surface parity audit still reports pre-existing
  fall-through visuals: atomic-acres 15, skyline-terminal 8, rustworks 1,
  gun-range 1, farcrysis 1 and high-seas 3. Test1, test2, map3, nuketown2 and
  raid2 report zero. This is outside the spawn-system scope and was not weakened
  or edited.
- OPEN: immutable preview binding, Dave's PASS 94 owner HITL and publication.

## Before/after audit

Metrics are per authored team table: count; X-by-Z bounding-box span in metres;
mean nearest-neighbour distance in metres. `farcrysis` is registered but parked.

| Arena | Registry | Before team 0 / team 1 | After team 0 / team 1 |
|---|---|---|---|
| atomic-acres | offered, team | 12; 2.0x43.0; 4.25 / 12; 2.0x43.0; 4.25 | unchanged |
| skyline-terminal | offered, team | 6; 54.0x0.0; 10.00 / 6; 48.0x0.0; 8.00 | 8; 54.0x0.0; 6.75 / 8; 48.0x0.0; 5.00 |
| rustworks-1v1 | offered, team | 6; 32.0x19.0; 9.33 / 6; 32.0x19.0; 9.33 | 8; 48.0x24.0; 9.52 / 8; 46.0x24.0; 9.52 |
| gun-range | offered, team; runtime-forced FFA | 6; 24.0x4.0; 4.00 / 6; 24.0x0.0; 4.00 | 8; 24.0x4.0; 4.00 / 8; 24.0x4.0; 4.00 |
| farcrysis | parked, team | 6; 28.0x26.0; 11.33 / 6; 42.0x44.0; 15.70 | 8; 28.0x26.0; 9.26 / 8; 42.0x44.0; 12.02 |
| high-seas | offered, team | 6; 18.0x6.2; 6.00 / 6; 18.0x6.2; 6.00 | 8; 18.0x13.2; 6.50 / 8; 18.0x13.2; 6.50 |
| test1 | offered, team | 6; 40.0x0.8; 7.40 / 6; 40.0x0.8; 7.40 | 8; 40.0x0.8; 5.37 / 8; 40.0x0.8; 5.37 |
| test2 | offered, team | 6; 16.0x53.0; 14.12 / 6; 8.0x46.0; 10.68 | 8; 16.0x53.0; 11.20 / 8; 8.0x46.0; 7.08 |
| map3 | offered, explore/no bots | 5; 36.8x7.6; 10.14 / 5; 36.8x7.6; 10.14 | unchanged |
| nuketown2 | offered, team | 6; 24.0x7.0; 6.26 / 6; 24.0x7.0; 6.26 | 8; 30.0x16.0; 8.14 / 8; 30.0x16.0; 8.14 |
| raid2 | offered, team | 6; 16.0x20.0; 7.33 / 6; 16.0x20.0; 7.33 | 8; 16.0x37.0; 9.24 / 8; 18.0x46.0; 9.01 |

The executable floors are pinned in `src/spawn-layout-quality.test.ts`: eight
points per team for team arenas, five for the explore map, 18% minimum span of
the longer arena axis, and per-arena mean-nearest-neighbour floors.

## Selection audit and fix

Before, both paths reduced the candidate set to a side-local list in team modes
and called the scorer from `src/spawn-safety.ts`:

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

The old code did not retain recent-use history across actors. Nuke Town's six
points per side were therefore repeatedly scored from a small pool, which is
consistent with the owner's one-or-two-place observation. The exact live
frequency before the fix is not claimed because no pre-fix browser capture was
available.

`src/spawn-selection.ts` is now the runtime selector used by both the player and
bot paths. It retains every finite, safety-filtered candidate; fresh points are
preferred over points used within 12 seconds; TDM team arenas prefer the current
team side but borrow the opposite side when necessary; solo, explore and FFA
use the full map pool. The score combines visible-threat count, nearest-threat
distance, recent death pressure, summed occupant proximity, recent-use pressure
and repeat pressure, with a seeded deterministic tie-break.

## Nuke Town runtime evidence

The allowed single-browser run used the existing deployment driver after
`npm run build`, with GPU headroom verified and port 4297 owned by the run. The
receipt is `artifacts/qa/pass94-deploy/nuketown2.json` and records:

```text
player solo-deploy: 16,1.70,40
player solo-respawn: -1,1.70,40
bots (distinct X,Y,Z):
  1,1.70,-25   1,1.70,-40   -10,1.70,-29
  14,1.70,-31  -16,1.70,-40 -5,1.70,-25
bot watch: 90000 ms; deploy record: 1/1; errors: 0
```

Every listed position matched a committed spawn with `passesGate: true`. The
bot positions cover both house-side yard/street-end bands in the first solo
wave; the static audit also verifies all eight points per side.

## Quoted gates

```text
npx tsc --noEmit
EXIT 0

npm run build
  vite build passed; 511 modules transformed

npx vitest run src/spawn-selection.test.ts src/spawn-safety.test.ts src/spawn-layout-quality.test.ts src/farcrysis-spawns.test.ts src/arena-factory-registry.test.ts src/map-selection.test.ts src/legacy-main-size-ratchet.test.ts --reporter=dot
  7 files passed; 244 tests passed

npx tsx scripts/qa/measure-spawn-layouts.ts --out artifacts/qa/pass94-spawn-layouts-after.json
  all 11 rows: in-envelope 100% (floor 100%, reach 100%); verdict ok

npx tsx scripts/qa/solve-spawn-layouts.ts --all --wanted 8
  applied proposals: PASSES; rejected proposals remained rejected for RustRig
  team separation and test1's no-autostep route

npx tsx scripts/qa/solve-farcrysis-spawns.ts --wanted 8
  proposal: 16 spawns, in-envelope 100%, floor 100%, reach 100%; layout failures: none

npm run qa:eye-clearance:contract
  tests 36; pass 36; fail 0

node scripts/qa/verify-spawn-deploys.mjs ... --port 4297 ... --bot-watch-ms 90000
  1/1 deploy records matched a committed, gate-passing spawn for the player AND every bot
```

```text
npx tsx scripts/qa/audit-walkable-surface-parity.ts --json artifacts/qa/pass94-walkable-surface-parity.json
  exit 1: pre-existing fall-through findings on six non-Nuke/Town-zero arenas;
  this remains OPEN and is not a spawn table or selection assertion
```

The parity command was run as requested; no threshold was changed.

## Owner should notice

On Nuke Town Rebuild, bots should arrive in multiple distinct yard/street-end
locations instead of cycling through one or two rear-yard points. Across team
arenas, respawns should avoid the last-used point when alternatives exist and
stay on the team's side unless threat pressure makes the opposite side safer.
Solo/explore and FFA deployments should use the full authored map pool while
preserving the existing safety checks.

The manifest at `acceptance/pass-94.json` is deliberately a candidate manifest:
immutable preview binding and owner HITL are OPEN, so this branch must not be
described as published.
