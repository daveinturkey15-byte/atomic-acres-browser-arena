# Muse review — v8-bot-behaviour (PASS 95 lane)

Reviewer: Meta Muse Spark 1.3 (skeptical second pair of eyes, OMP/dave-gaming-pc).
Date: 2026-09-05. Branch: `contrib/dave-gaming-pc/claude/v8-bot-behaviour`, head `29ca371e`.
Baseline: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Scope: 4 files — `src/bot-behaviour.ts` (+567, new), `src/bot-behaviour.test.ts` (+476, new),
`src/bot-haze.ts` (+30, new extract), `src/legacy-main.ts` (wiring, +89/−59 net).
Constraints: no builds, no browsers, no GPU; static review only — NO verifier was run by me.

Note: `docs/evidence/pass95/bot-behaviour/REPORT.md` does NOT exist. The build agent was
paused before writing it. The directory holds only untracked `probe-before.json`,
`probe-after.json`, and untracked `scripts/qa/pass95-bot-behaviour-probe.mjs`.
I reviewed the diff and the probe JSONs directly instead.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. The code core is sound and the tests are real (see checks 1–5 below). The fairness gate,
   the stuck ladder, the tier table, and the prone seam all verify against live wiring,
   not just against themselves. Nothing in the diff warrants a rewrite.
2. The live evidence is too thin to enter candidate 9 as-is: no REPORT, the probe script
   and both JSONs are untracked (not in the branch), the after-run predates the before-run
   by 32 minutes, and the cover path has zero live activations in the only 90 s run.
   Candidate entry needs committed evidence plus one green `bot-behaviour.test.ts` receipt,
   which nobody has produced yet (I was barred from running it).
3. All required fixes are evidence-hygiene and two one-line nits — no design changes.
   List is in Findings F1–F6. F5/F6 are optional polish; F1–F4 are the ship gate.

## The five checks

### (1) Walls + reaction delay — REAL, not vacuous. PASS.

- `src/bot-behaviour.ts:171-192` (`botFireDecision`): sight is the first branch, unconditional;
  `fire === true` implies `hasLineOfSight` and `now - lineOfSightSince >= reactionDelayMs`.
  Under-floor delays clamp up to `BOT_MINIMUM_REACTION_DELAY_MS` (200); NaN/Inf/unset
  (`<= 0`) sight timestamps fall into `no-line-of-sight`. Ordering is right: sight →
  reaction → suppressed → spawn-protection → range band → burst → cadence.
- Wiring is occlusion-backed, not distance-only: `legacy-main.ts:20457-20471` (`botHasLineOfSight`)
  feeds `solidLineOfSight` from `segmentIntersectsBox` over `activeWorldColliders()` plus smoke
  density into the pre-existing `bot-perception-authority.ts:106-109`
  (`canSeeTarget = solidLineOfSight && !blind && !blockingSmoke`), and the rising edge resets
  the reaction clock (`legacy-main.ts:21013-21018`). The gate cannot be bypassed by colliders,
  smoke, or flash — those clear sight upstream, which is exactly the correct layering.
- Tests sweep genuinely: `bot-behaviour.test.ts:123-147` runs 96 otherwise-perfect combinations
  (6 distances × 4 elapsed × 4 tiers) against `hasLineOfSight: false`; `:149-153` covers
  0/−1/NaN/+Inf timestamps; `:156-179` steps every tier's full reaction window in 20 ms
  increments and asserts the exact-boundary shot fires; `:192-199` covers sight-break restart.

### (2) Stuck threshold + 90 s match — unit-measured; live run consistent but weak. PASS WITH CAVEAT (F2–F4).

- Threshold `BOT_STUCK_SPEED_MPS = 0.35` (`bot-behaviour.ts:227`) is pinned below the slowest
  legitimate travelling stance by `bot-behaviour.test.ts:312-314`, which reads the SAME
  `movementProfile` source players use (`bot-stance.ts:105-113`) — one table, not two. The 3 s
  failure line with detour/repath/reverse rungs at 400/1200/2200 ms is asserted exactly
  (`:256-274`), including the four-action sequence and the `stuckEvents` counter.
- Live: after-run shows `totalUnstickActions: 12` with `totalStuckEvents: 0` — the ladder freed
  bots before the failure line every time. That is the intended shape, and travel distances
  (26–69 m) with zero page/console errors show healthy movement. Caveats in F2–F4.

### (3) Prone-cap hook — exists, additive, no duplication. PASS.

- `bot-behaviour.ts:532-567`: `BotProneCapHook` type, `ALLOW_ALL_BOT_PRONE` default, module-level
  install/restore (`setBotProneCapHook`), and `applyBotProneCap` (denied prone → crouch, hold
  timestamp preserved). Applied at exactly one call site (`legacy-main.ts:21099`) to the stance
  decision `resolveBotStance` already made. No other `setBotProneCapHook` caller exists in
  `src/` — the bot-anim lane has not landed, and this seam does not count, limit, or
  bookkeep anything that lane owns. Default grants everything, so current behaviour is unchanged.

### (4) Difficulty tiers — documented and deterministic. PASS.

- Contract table in `bot-behaviour.ts:40-62` (reaction/aim/burst/cover axes per tier);
  `regular` is pinned byte-for-byte to shipped behaviour (`BOT_REACTION_DELAY`, 650 ms, aim 1.0;
  test `:77-82`). No tier touches perception — the gate does not even take a tier input, only a
  millisecond delay, so difficulty can never buy wallhacks. Roster ladder
  (`botDifficultyTierForIndex`) is pure arithmetic opening on `regular`. The only randomness
  (cover chance) flows through seeded `gameplayRandom()` (`runtime-random.ts:11-13`), so
  host-authoritative determinism holds per match seed.

### (5) Loosened tests — none. PASS.

- The diff touches zero existing test files (`git diff --name-only` lists only the two new
  lane files, the haze extract, and `legacy-main.ts`). No threshold, timeout, tolerance, or
  assertion was weakened anywhere. `BOT_REACTION_DELAY` remains exported from `bot-ai.ts:47`
  with no dangling references in `legacy-main.ts`.

## Findings (file:line, why, smallest fix)

- F1 — `docs/evidence/pass95/bot-behaviour/REPORT.md` missing; `scripts/qa/pass95-bot-behaviour-probe.mjs`,
  `docs/evidence/pass95/bot-behaviour/probe-before.json`, `probe-after.json` untracked (`git status`).
  Why: none of the 90 s evidence is in the branch, so candidate 9 cannot cite it. Fix: commit the
  probe script + both JSONs, write REPORT.md covering F2–F4.
- F2 — `probe-after.json: "generatedAt": "2026-09-05T06:55:34Z"` predates
  `probe-before.json: "2026-09-05T07:27:08Z"` by 32 min. Why: the before/after narrative is
  unexplained (likely new-build run first, baseline second after a rebuild — functionally
  consistent since before-run tiers are all `null`, but unstated). Fix: one paragraph in REPORT.md
  stating run order and build SHAs.
- F3 — before-run `bot-1` has `kills: 1` with `shotsFired: 0`. Why: the pass93 snapshot has no
  per-bot shot counter (only player `roundShotsFired`), so the probe's `?? 0` coercion fabricates
  the zero — not a phantom kill. Consequence: shots-per-kill (4, 5 in the after-run) HAS NO
  BASELINE; do not claim accuracy improved, only that bursts are now measured. Fix: REPORT.md notes it.
- F4 — after-run `totalCoverBreaks: 0` across 90 s / 4 bots / 18 shots / 2 kills, although
  nuketown2 authors two `physicalCover` boxes (`src/nuketown2-arena.ts:3617-3640`) and veterans
  roll 0.88 cover chance. Why: the `shouldBotSeekCover → deriveBotCoverNodes → chooseBotCoverNode`
  wiring (`legacy-main.ts:21070-21079`) has zero live activations; only the pure functions are
  tested. Fix (pick one): a forced-damage probe asserting `coverNodeId` goes non-null, or an
  explicit candidate-9 note accepting unit-only evidence for cover.
- F5 (nit) — `bot.strafeSign` still flips every ~850 ms tactical tick (`legacy-main.ts:21025`),
  while the test comment (`bot-behaviour.test.ts:325-331`) says the commit window makes flipping
  "impossible". Why: true only for the blocked-escape direction (`legacy-main.ts:21127`, committed
  `nav.detourSign`); unblocked strafe intent still alternates. Fix: reword the comment to
  "the blocked-escape direction", not all flipping — or accept alternation as tactical variety.
- F6 (nit) — QA-only `bot.sightStartedAt = now - reactionDelayMs` (`legacy-main.ts:35209`,
  `stageHostedBotAgainstRemote`). Why: harmless today (`hasLineOfSight: false` beside it, and the
  rising edge at `:21015` resets the clock on real acquisition), but it reads as pre-granting the
  reaction delay. Fix: `bot.sightStartedAt = 0;`.

## UNFINISHED (brief requirements vs diff)

The lane brief itself is not in the repo (no `v8-bot-behaviour` brief found under `docs/`), so
mapping is against the commit message's five items plus the review brief's numbered requirements:

1. Stuck ladder — DONE in code + unit tests; live evidence consistent (12 unsticks, 0 stuck).
2. Fairness fire gate — DONE in code + wiring + strong tests.
3. Difficulty tiers — DONE, documented, deterministic, pinned to shipped feel.
4. Cover — pure functions DONE + tested; LIVE WIRING UNPROVEN (F4). No bot broke to cover in 90 s.
5. Prone-cap seam — DONE, additive, awaiting the bot-anim lane (nothing to duplicate yet).
6. HF-399 haze hoist (`src/bot-haze.ts`, WeakMap cache of the per-rig sprite) — DONE, behavior-preserving
   (same lookup, same invariant comment, single call site at `legacy-main.ts:20970`); streamline-cadence
   extra, harmless, but unmentioned in the lane summary — confirm it was in the brief or refile it.
7. REPORT.md — NOT WRITTEN (build agent paused). Probe script + JSONs — UNTRACKED, uncommitted.
8. Verifier — NOT RUN. `bot-behaviour.test.ts` has no green receipt from any harness; I ran none
   (review instructions forbid builds). Candidate 9 entry requires one.
9. No requirement in the brief asked for `Math.random` removal; the lane correctly used the seeded
   `gameplayRandom()` stream for cover — recorded here so the next lane does not "fix" it.

## Reproduction pointers (for the verifier)

- `git diff origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD --stat` → 4 files above.
- Sight chain: `legacy-main.ts:20457` → `bot-perception-authority.ts:106` → gate `bot-behaviour.ts:171`.
- Clock discipline: `sightStartedAt`/`now` share the `updateBots` `now` at `:21015` and `:21055`.
- Run: the review instructions forbade builds; ask the verifier for `npx vitest run
  src/bot-behaviour.test.ts` output before candidate-9 admission.
