# Muse review — bots-hitl5 lane (HF-491)

Scope: `7733d37b` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`) → worktree at `d549f60d` **plus** the uncommitted ladder follow-on (`src/bot-ai.ts`, `src/map-selection.ts`, `src/map-selection.test.ts`, `src/legacy-main.ts`, `src/bot-spawn-presence.test.ts` extensions). REPORT: `docs/evidence/pass94/bots-hitl5/REPORT.md`. No builds, browsers, or test runs per lane brief; all claims below are code-inspection claims against the worktree, with claim-states.

## 1. Fairness — can the banded reward spawn in LOS or inside the trap? (VERIFIED: no, when an alternative exists)

There are **no hard pre-score LOS/trap filters inside the selector**. Safety is two layers, and the REPORT's "hard clauses" wording overstates the inner one:

- Hard layer (callers, unchanged): `src/legacy-main.ts` `spawnPoint`/`selectSafeBotSpawn` pre-filter with `validArenaSpawnPoint(point, arena.bounds, activeWorldColliders())`, then `unoccupied` separation pre-filter (`minimumSeparationSq`, FFA 8² else 20–25) with fallback to `valid` rather than starving. Collider-intersection and OOB are hard; LOS and trap are not.
- Soft layer (selector, dominant weights — `src/spawn-selection.ts:229-240`):
  ```
  const score = spawnDistanceReward(Math.sqrt(nearestThreatDistanceSq), engagementDistance)
    - visibleThreats * 1_000_000 * modePressure
    - recentDeathPressure * 250_000
    - recentUsePressure * 175_000
    - proximityPenalty - sidePenalty - (repeated ? 125_000 : 0);
  ```
  with the only hard in-selector preference being the fresh pool (`src/spawn-selection.ts:242`: `fresh = scored.filter(recentUsePressure === 0)`, fallback to `scored` when empty).

Why the new reward cannot outbid safety: band differences are O(10³) (map-scale squared metres; nuketown2 84 m → max ~7 k) while one visible threat costs 900 k in solo (`modePressure` 0.9), one recent death 250 k, one recent use 175 k. The band only reorders **among already-safe points**. `spawnDistanceReward` (`src/spawn-selection.ts:140-143`) rises as the old term below the band and decays at half weight above (`engagement² − 0.5·(d−e)²`), so beyond-band ordering is nearer-wins, never inverted. `engagementDistance == null` with no threats keeps the exact old 10 000 constant, preserving the `spawn-selection.test.ts` coverage gate. The band floor is the caller trap radius (`src/spawn-selection.ts:207`, `trapRadius` at `:192-194` widening with population), so the reward rises at least to trap distance — points deep inside the trap are still outbid by the 250 k death penalty, not by the band.

Residual (correct, not a bug): if **every** candidate is visible or inside the trap, the selector still picks the least-bad one (no starvation). That matches the old behavior and the `lastPlayerSpawnAudit.minimumVisibleThreats` instrumentation.

## 2. Determinism in multiplayer (VERIFIED host-only execution; INFERRED no guest divergence)

- Bots are host-simulated, guests consume snapshots: `spawnBots`/`respawnBot`/`activateDormantBot` run on the host path and publish via `broadcastHostedBotState`; guests apply `message.bots` gated by `lastHostedBotStateSeq` (`src/legacy-main.ts:20367`). Solo runs `role: 'offline'` (`:6700`). No evidence any guest executes `selectSafeBotSpawn`.
- Tie-break is seeded per actor: `stableSpawnTieBreakSeed(actorId)` at both call sites (`src/legacy-main.ts:16848`, `:20016`; FNV-1a + integer hash at `src/spawn-selection.ts:158-173`, final order `:250-251`). Deterministic given the same pool.
- The shuffle bag (`recentSpawnUses`, `recentDeathPositions`, `lastBotSpawnIndices`, `spawnFlipHysteresis`) is host-local and keyed partly off wall-clock `performance.now()` (`src/legacy-main.ts:16742-16749`, `selectSafeBotSpawn` `:19953-19956`). Peers need no bag sync because they never run the selector; the host's own sequence is order-deterministic via the depth count, timing-deterministic only given identical cadence. No cross-peer claim is made by the lane, and none is needed. OPEN: guest-side respawn/prediction paths were not exhaustively audited; if one ever calls the selector locally, wall-clock bags would diverge — currently no such caller was found.

## 3. The new gate's floors (VERIFIED derived; paired assertions defeat vacuous pass)

- Arena set derived, not rostered: `src/bot-spawn-presence.test.ts:31` filters `arenaFieldsBots(id) && soloBotCount > 0`. Coverage floor `requiredRegions = ceil(n/2)` (`:41-43`), far-quartile from the arena's own distance distribution (`:163-167`), collider check against real built geometry (`:133-142`), respawn cadence 20 s × 200 deployments (`:34-35`) wider than the old 12 s window. Population passed is the arena's own `initialSoloBotCount + 1` (`:68`).
- Vacuous pass would need an arena where both assertions are trivially satisfiable. Down to n = 2 they are not: the always-farthest policy fails the strict `medianSelected < farQuartile` (`:171`) since median == max. n = 1 would be unsatisfiable under strict `<`, but no bot arena authors one point (layout gate pins ≥8/team; nuketown2 16). FINDING 1 below is the only filter gap (latent, no live instance).

## 4. Ladder vs Pass 66 pins (VERIFIED rewritten, not deleted; no max exceeded)

- Base pin `bounds Atomic ten-defeat reinforcements and never reinforces sibling modes` (`src/map-selection.test.ts:245-254` at base) is **rewritten** with its rationale quoted in-comment, not silently deleted. Atomic ladder `[1,1,2,2,3,3,4,4,5,6]` kept byte-identical; rustworks-1v1→1, gun-range→0, map3→0 (new explicit pin), farcrysis/high-seas/test1/test2→2 kept; **raid2→2 added** (base had no raid2 line — new coverage, not a deletion); skyline-terminal `→1` honestly changed to ladder `[1,1,2,6,6]` with a comment that it honours its pre-existing `maximumSoloBots: 6`.
- Launch-label array: only the nuketown2 row changed (`1 BOT SKIRMISH` → `4 BOTS SKIRMISH`), with the HF-491 comment; raid2 `2 BOTS SKIRMISH` untouched.
- No arena exceeds its max: `initialSoloBotCount` clamps `min(max, …)` (`src/map-selection.ts:561-565`), `activeSoloBotTarget` clamps `min(max, …)` (`:587`), `soloBotTargetForDeaths` clamps `min(ceiling, …)` (`src/bot-ai.ts:85-93`); the new `never lets any arena start above…` test asserts `initial ≤ max`, `target ≤ max`, and monotonicity over `[0,1,9,10,25,100,10000]` for **every** catalog row. Contract note (owner decision, not code defect): `soloBotCount` stays 1 everywhere so the Pass 66 literal is preserved in the catalog, but nuketown2 opens at 4 via `initialSoloBots` and skyline-terminal now ladders to 6 — both are deliberate amendments of "exactly one bot" behavior and should be minuted as such at integration.

## 5. Per-frame cost with 6 bots (VERIFIED by inspection: none; spawn-time only)

The lane touches spawn-time paths only (match start, respawn, reinforcement, OOB correction). Per selection with C candidates, T threats: one extra O(C·T) distance pass + O(C log C) sort + one ≤C Set (`src/spawn-selection.ts:199-209`); C ≤ ~16, T ≤ ~7 — negligible at spawn cadence, zero per-frame. The per-frame bot tick is untouched; `soloBotTargetForDeaths` gains two defaulted scalars, no allocation. Two nits below are spawn-cadence waste, not frame cost.

## Findings

1. `src/bot-spawn-presence.test.ts:31` — gate filter uses `selection.soloBotCount > 0` but the sim seats `initialSoloBotCount(selection)` (`:68`, `:184-185`). A future arena with `soloBotCount: 0` + `initialSoloBots: N` would deploy N bots at runtime ungated. Smallest fix: filter on `initialSoloBotCount(selection) > 0` (keep the `soloBotCount` agreement assertion as-is). Latent — no such arena exists today.
2. `src/legacy-main.ts:16743` — `spawnUseWindow(…)` constructed **twice per while-condition check** (two short-lived objects per iteration), plus again at `:16749`, `:16844`, `:20012`. Pure function so no correctness bug, just waste and a re-read hazard. Smallest fix: `const window = spawnUseWindow(arena.spawns[0].length + arena.spawns[1].length);` hoisted per function and reused.
3. `src/spawn-selection.ts:199-207` — `nearestThreatDistance` closure recomputes `Math.min(...threats.map(…))` per candidate (O(C·T) with spread). Pre-existing pattern, unchanged scale; new engagement pass doubles the constant. No fix required; if touched later, compute the threat array once outside the map. Not per-frame either way.

## Verdict: SHIP-WITH-FIXES

1. Fairness is preserved: dominant LOS/death/use penalties plus caller-side collider/bounds and unoccupied filters still decide safety; the band only reorders safe points, with the no-threat constant path byte-identical.
2. Determinism is host-contained: seeded tie-break, host-only selector execution with snapshot replication, and a bag that needs no peer sync; wall-clock dependence is local to the host.
3. Contracts are honestly rewritten with stronger coverage (raid2 pin, max-clamp + monotonicity sweep, paired anti-vacuous assertions) — but Finding 1 leaves a latent ungated configuration, Finding 2 litters the hot-spawn path, and the 1→4 opening plus terminal-to-6 escalation amend Pass 66 behavior and need owner minuting at integration. Apply the two one-line fixes, minute the amendment, ship.
