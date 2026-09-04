# HF-491 - "the bots not in there" (nuketown2, Solo)

Lane: Claude Opus 5, `dave-gaming-pc`, PASS 94 HITL 5.
Base: `7733d37b` (`contrib/dave-gaming-pc/claude/pass93-candidate`).
Branch: `contrib/dave-gaming-pc/claude/bots-hitl5`. Change impact: **runtime**.

Owner, 2026-09-04 17:20, after playing HITL 4 on nuketown2 in Solo: *"the bots not
in there"*. Earlier, HF-456: *"bot spawns seem to just spawn in 1 or two places"*.
This lane treats both as one defect, because they are.

## 1. Cause

**Not the spawn tables, and not the bot count.** Both were checked first, and both
are correct:

- `src/spawn-layout-quality.test.ts` already pins eight well-spread authored points
  per team on nuketown2 (sixteen total), and `measureSpawnLayout` reports 0
  failures / 0 unreachable / 0 without floor for them.
- `NUKETOWN2_SPAWN_LAYOUT` (`src/nuketown2-arena.ts:820-822`) is converted through
  `nuketown2HandedX` **at authoring time**, so the HF-473 handedness change did not
  leave spawns on the un-mirrored side. No authored point on any bot arena
  intersects a collider - now gated, see section 3. That hypothesis was tested and
  rejected.
- `soloBotCount` for nuketown2 is `SOLO_BOT_COUNT = 1` (`src/bot-ai.ts:43`,
  `src/map-selection.ts:443`), which is what AGENTS.md Pass 66 routing requires:
  "Solo skirmish starts with exactly one enemy bot on every bot-enabled arena."
  The count was not raised; that would be a contract change, not a fix.

**The cause is the selection rule, in two places.**

### 1a. `src/spawn-selection.ts:122` (base) - the distance reward was unbounded

```ts
const score = nearestThreatDistanceSq
  - visibleThreats * 1_000_000 * modePressure
  - ...
```

`nearestThreatDistanceSq` is monotone and unbounded, and every other term is a
*penalty*. So once the hard clauses (no line of sight, no recent death, no recent
use, occupant separation) have removed the unsafe points, the survivor with the
highest score is always **the point farthest from the player on the map** -
deterministically, every deployment and every respawn.

In Solo that is decisive rather than cosmetic. Solo fields exactly **one** bot, so
the single opponent is placed at the far extreme of an 84 m map behind two houses,
and the whole of the owner's half of the arena contains nobody. The bot is present
in the snapshot and absent from the game. That is the literal reading of "the bots
not in there".

It is invisible to every existing selector assertion because
`src/spawn-selection.test.ts` runs its per-arena coverage sweep with `threats: []`
- the only condition under which an unbounded distance reward is harmless.

### 1b. `src/legacy-main.ts:16743` (base) - the spawn-use memory was shorter than a respawn

```ts
while (recentSpawnUses.length > 0 && now - recentSpawnUses[0]!.at > 12_000) recentSpawnUses.shift();
```

A fresh point is a **hard** preference in the selector, so how widely spawns spread
is decided entirely by how long a use is remembered. That was one flat 12 s for
every arena, regardless of how many points the arena authors. A solo respawn cycle
is longer than 12 s, so by the time the same actor spawned again the window had
emptied and the deterministic argmax of 1a returned the *same* point. Sixteen
authored points, one used. That is the mechanism behind HF-456's "1 or two places"
- not a bad table, a memory shorter than the thing it is meant to remember.

## 2. Fix

Both halves are generic (all maps) and derive every number from the arena's own
data. No arena id, roster or metre count is introduced anywhere.

**`src/spawn-selection.ts`**

- `spawnEngagementDistance(distances, minimum)` - an engagement distance derived
  from a low quantile (`SPAWN_ENGAGEMENT_QUANTILE = 0.25`) of the
  candidate-to-threat distances actually available at the moment of the choice,
  floored at the arena's existing `MAP_TRAP_RADIUS`, which already widens with
  population. A big map yields a big band; a 1v1 rig yields a small one.
- `spawnDistanceReward(distance, engagement)` - rises exactly as the old raw term
  did up to the engagement distance, then decays at half weight beyond it. The
  score's first term is now this instead of the raw square. Units stay squared
  metres, so **every other weight in the score is untouched**.
- `spawnUseMemoryMs(count)` / `spawnUseWindow(count)` and a new `recentUseDepth`
  (defaulting to one short of the pool) make the fresh-point preference a
  **shuffle bag** over the authored points. A wall clock cannot guarantee a
  rotation when the respawn cadence is unknown; a count can. If every point does
  fall inside the window the selector still degrades to the full scored pool
  rather than starving - that fallback is unchanged.

**`src/legacy-main.ts`** - both horizons are derived from
`arena.spawns[0].length + arena.spawns[1].length` and passed to both call sites
(`spawnPoint` and `selectSafeBotSpawn`). Retention now retires a record only once
the shuffle-bag depth no longer needs it. Written to add **zero net lines**, so
`src/legacy-main-size-ratchet.test.ts` holds at its recorded 37371-line ceiling
rather than being raised.

**Nothing was weakened.** No threshold, timeout, assertion or hard safety clause
was relaxed. Line-of-sight avoidance, recent-death pressure, occupant separation,
FFA separation, team-side preference and the collider validity filter are all
byte-identical.

## 3. Before / after

New gate `src/bot-spawn-presence.test.ts`, over every bot-fielding arena
(`arenaFieldsBots` and `soloBotCount > 0` - derived, not a roster), against each
arena's **real built geometry**, with a live player standing on his own first
authored spawn, 200 deployments at a 20 000 ms respawn cadence.

| Assertion (per arena; floors derived from that arena's own spawn set) | Base 7733d37b | This branch |
| --- | --- | --- |
| configured solo bot count deployable at match start, table non-empty | pass 9/9 | pass 9/9 |
| no authored spawn point intersects a collider or leaves bounds | pass 9/9 | pass 9/9 |
| solo bot covers >= ceil(points/2) of its own authored points | **fail 0/9** | pass 9/9 |
| solo bot median spawn is nearer than the arena far quartile | **fail 0/9** | pass 9/9 |
| **total** | **18 failed / 18 passed** | **36 passed** |

nuketown2 specifically: **3 of 16 authored points used; >= 8 required, now met**,
and the median bot spawn moves out of the far quartile of the arena own distance
distribution into the player half. Terminal, RustRig, Farcrysis, High Seas,
Test1, Test2, Raid2 and Atomic Acres move the same way - the fix is generic and
each arena floor moves with its own table.

## 4. Gates

```
npx tsc --noEmit
npx vitest run src/*spawn* src/*bot* src/nuketown2-fidelity.test.ts \
  src/collider-visual-parity-gate.test.ts src/legacy-main-size-ratchet.test.ts
```

`tsc --noEmit` clean. Vitest: **19 files, 383 tests, 383 passed** - including
`src/spawn-selection.test.ts` ">= 80% of every authored point over 200 seeded
deployments" per arena and its monotonicity assertion, `nuketown2-fidelity`,
`collider-visual-parity-gate` and the legacy-main size ratchet.

## 5. Claim-states

**VERIFIED (mechanical, this worktree)**

- The base selector places a solo bot at the map far extreme, deterministically,
  whenever a live player is on the board. Falsifier: the "far extreme" test fails
  on all nine bot arenas at 7733d37b and passes here.
- The base spawn-use memory retains at most one respawn cycle, so a single bot
  reuses 3 of nuketown2's 16 authored points. Same falsifier.
- No authored spawn point on any bot arena intersects a collider or leaves bounds
  at either SHA.
- `tsc --noEmit` clean; 383/383 on the quoted gate set.

**INFERRED (strong, not directly observed)**

- That this is the whole of what the owner saw. The mechanism explains both his
  words and HF-456's, and no second defect was found in bot construction,
  navigation (`arena.patrolPoints` for nuketown2 covers the turning head, both
  front verges, both houses, both garages, both back yards and both border paths)
  or the deploy path. The owner's session was not instrumented.

**OPEN / NOT DONE - needs the integrator or a GPU-capable host**

- **No live headless boot was possible on this machine.** Both bundled Chromium and
  installed Chrome, headless, report *"WebGPU was required, but no GPU adapter was
  available at all"*; `navigator.gpu` is absent in headless Chrome here, with and
  without `--enable-unsafe-webgpu` / `--use-webgpu-adapter=swiftshader`. The runtime
  is WebGPU fail-closed and `?renderer=webgl2` is inert by contract
  (`src/renderer-fallback-copy.test.ts`), so there is no headless path to a booted
  match on dave-gaming-pc. The lane brief forbids a visible window, so this was
  **not run** rather than run wrong. The probe is committed and ready -
  `scripts/qa/pass94-bot-presence-probe.mjs` records requested-vs-alive bot count,
  each bot spawn point, distance travelled, idle/stuck/navigating/dead state and
  every console warning:

  ```
  BASE_URL=http://127.0.0.1:4189/ node scripts/qa/pass94-bot-presence-probe.mjs after nuketown2 skyline-terminal
  ```

  Its recorded no-adapter run against HITL 4 is in `probe-before.json`.
- Consequently "bots spawn within 10 s" and "they navigate the street and both
  houses" are **asserted structurally, not observed live**. `arena.patrolPoints`
  covers both houses and the street by construction; that is design evidence, not
  a measurement.
- **Separate finding, not fixed here, needs an owner decision.**
  `src/map-selection.ts:535-538`: `activeSoloBotTarget` escalates for
  `atomic-acres` **only**; every other arena is pinned at one bot forever
  regardless of deaths. Since HF-466 parked `atomic-acres` from the menu
  (`selectable: false`), the reinforcement ladder - "+1 / 10 DEFEATS, MAX 6" - is
  now **dead code for the entire selectable roster**. nuketown2 declares
  `maximumSoloBots: MAX_SOLO_BOTS` (6) and can never reach 2. That is plausibly
  part of what "the bots not in there" feels like over a five-minute match, but
  raising it touches the Pass 66 catalog contract and four pinned assertions in
  `src/map-selection.test.ts:245-254`, so it is reported, not changed.

## 6. HF-491 follow-on - the escalation ladder and the solo bot count

Owner direction (Fable orchestrator, 2026-09-04), on the finding left OPEN in
section 5: *the ladder applies to every selectable arena that declares a
maximum; an arena may declare a starting solo bot count; nuketown2 declares 4,
capped by its 6; arenas that declare nothing keep the Pass 66 default of 1.*

### 6.1 What was wrong

`activeSoloBotTarget` read an **arena id**:

```ts
if (selection.id !== 'atomic-acres') return selection.soloBotCount;
```

HF-466 had already parked `atomic-acres` (`selectable: false`), so the whole
"+1 / 10 DEFEATS · MAX 6" ladder was dead code for every arena the owner can
actually pick. Two arenas declare `maximumSoloBots: 6` - `nuketown2` and
`skyline-terminal` - and neither could ever reach 2. A second id test sat in the
same file's neighbour, `legacy-main.ts:34489`, gating `nextReinforcementAt` on
`selection.id === 'atomic-acres'`, so the HUD's next-reinforcement readout was
dead on every other arena for the same reason. Both are now derived.

### 6.2 What changed

- `src/bot-ai.ts` - `soloBotTargetForDeaths(deaths, initialBots?, maximumBots?)`.
  Both new parameters **default to the Pass 66 constants**, so the existing
  `bot-ai.test.ts` ladder pins (`soloBotTargetForDeaths(0..100)` and the NaN
  guard) hold byte-identical.
- `src/map-selection.ts` - new optional catalog field `initialSoloBots?: number`
  and `initialSoloBotCount(selection)`, which clamps a declaration by that
  arena's own `maximumSoloBots`. `activeSoloBotTarget` now runs the ladder for
  **every** arena from that start up to that maximum, with no id anywhere.
  Arenas that declare `max === start` (rustworks-1v1 1, gun-range and map3 0,
  farcrysis / high-seas / test1 / test2 / raid2 2) are pinned by the clamp, not
  by a special case - Pass 66's "exactly one enemy bot" still holds wherever the
  catalog still says so.
- `nuketown2` declares `initialSoloBots: 4`. `soloLaunchLabel` and `rulesLabel`
  now state the count the match **opens with** (`4 BOTS SKIRMISH`,
  `5 MIN · HOST UP TO 6 · 4 BOTS SOLO · +1 / 10 DEFEATS · MAX 6 · PREVIEW`). A
  card promising 1 while 4 deploy is the same dishonesty as the reverse.
- `src/legacy-main.ts` - the five runtime reads of `selectedArena.soloBotCount`
  that mean "how many bots now" (`spawnBots` active count, the dormant-prewarm
  loop bound, the deploy feed line, the `1V1 BOT` connection pill and the
  `botEscalation.initialBots` snapshot field) go through
  `initialSoloBotCount`. **Zero net lines**: the file is still exactly 37371
  lines, so `legacy-main-size-ratchet.test.ts` holds at its ceiling.

**Nothing was weakened.** No threshold, timeout or safety clause was relaxed, and
no assertion was deleted. The old test title "and never reinforces sibling
modes" was a promise the id test made and the catalog now makes; every arena it
protected is still pinned to its exact count, at 100 defeats, in the same test.

### 6.3 Perf: peak population is unchanged

`spawnBots` prewarms dormant bots from the active count up to
`maximumSoloBots`, so nuketown2 built **six** operators at match open before
this change (1 active + 5 dormant) and builds six after it (4 active + 2
dormant). The ceiling the perf budget was sized for is the maximum, and the
maximum did not move. There is **no** per-bot per-frame cost test in the suite
to hold at 6 - `frame-pacing`, `pass65-frame-pacing-gate` and
`pass69-3-frame-hitch-runner` contain no bot term at all. That is recorded as a
gap, not claimed as a pass.

### 6.4 New and changed gates

`src/map-selection.test.ts` - the ladder pin is rewritten to the derived rule
(and now also pins map3 and raid2, which it never covered), plus three new
tests: nuketown2 opens on 4 and reaches 6 by 20 defeats; every arena that
declares no `initialSoloBots` opens on its Pass 66 `soloBotCount`; and no arena
starts above or escalates past its own declared maximum, monotone in defeats,
swept over `ARENA_SELECTIONS` so a new arena is covered the day it registers.

`src/bot-spawn-presence.test.ts` - two changes, both because the sim was
measuring a rig that never ships:

- the selector was told `population: 2` on every arena regardless of its bot
  count. `MAP_TRAP_RADIUS` widens with population, so the coverage and
  far-extreme floors were being measured at the wrong population. It is now
  `initialSoloBotCount(selection) + 1`. **Both floors still pass on all nine bot
  arenas**, nuketown2 now at its real 4-bot population.
- new: *seats its opening / fully escalated solo squad on distinct authored
  points*. The whole squad is placed in one match-open pass, each bot with the
  previous ones already standing as occupants and recorded as recent uses, and
  every one must land on a distinct point that passes `validArenaSpawnPoint`.
  Run at both the opening count and the escalated maximum, so nuketown2 is
  covered at 4 **and** at 6. 18 new cases, all passing.

### 6.5 Gates

```
npx tsc --noEmit
npx vitest run src/map-selection*.test.ts src/*bot* src/*spawn* \
  src/nuketown2-fidelity.test.ts src/legacy-main-size-ratchet.test.ts
```

`tsc --noEmit` clean. Vitest: **19 files, 412 tests, 412 passed** (383 at
`d549f60d`; +29 assertions, none removed). `arena-selectability`,
`presentation-prewarm-contract` and `gameplay-contract` were run separately
because the rulesLabel and launch-label copy changed - 3 files, 33 passed.

### 6.6 Claim-states

**VERIFIED (mechanical, this worktree)** - the ladder was unreachable for the
entire selectable roster at `d549f60d` (falsifier: `activeSoloBotTarget` on
skyline-terminal at 100 defeats returned 1, now 6); nuketown2 opens on 4 and
reaches 6 at 20 defeats; every arena that declares nothing is unchanged at 0 and
100 defeats; no arena exceeds its declared maximum; four bots and six bots each
seat on distinct collider-free authored points on all nine bot arenas; the
coverage and far-extreme floors hold at the corrected population; `tsc` clean,
412/412.

**INFERRED (strong, not observed)** - that 4 is the right opening number for
this street. It is the owner's instruction, and 4 of 16 authored points is a
quarter of the table, but no live match has been played on it.

**OPEN** - unchanged from section 5: no headless boot is possible on this
machine (WebGPU fail-closed, no adapter), so bot presence remains asserted
structurally. `scripts/qa/pass94-bot-presence-probe.mjs` is ready for the
integrator and now has a sharper expectation to check: nuketown2 Solo should
report `initialBots: 4`, four alive bots within the deploy window, and a
non-null `nextReinforcementAt` of 10.
