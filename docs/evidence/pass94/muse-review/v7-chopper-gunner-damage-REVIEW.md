# Muse review — v7 chopper-gunner damage (HF-509, THIRD eyes)

Scope: `docs/evidence/pass95/chopper-gunner-damage/REPORT.md` + full diff
`origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD`
(7 files: report, `src/combat-damage-table.ts`, `src/hf509-chopper-gunner-damage.test.ts`,
`src/killstreak-support-catalog.ts`, `src/killstreak-tuning.ts`,
`src/killstreak-tuning.test.ts`, `src/killstreak-support-catalog.test.ts`).
Checked what the Opus verifier did NOT: (a) whole-codebase "everything else unchanged",
(b) profile-id rename persistence, (c) end-to-end victim loss vs admitted damage.
No builds, no browsers, no GPU; static reads + grep only. No thresholds touched.

## Verdict: SHIP

1. The halving is exact, minimal, and scoped: `25.5/16.5 → 12.75/8.25`
   (`src/killstreak-tuning.ts:76-101`, consumed at `src/killstreak-support-catalog.ts:123-126`);
   admitted shells `26 → 13` point-blank exact, `17 → 8` at max range by pre-existing
   `Math.round` (disclosed, `src/killstreak-support-catalog.ts:160-165`).
2. No silent rebalancing through shared constants and no persistence break:
   `damage`/`minimumDamage`/`damageMultiplierFromV2` have no second consumer (§1);
   the `v3-hf458 → v4-hf509` id string is pinned nowhere else (§2).
3. The exact 0.5 survives every victim-loss stage end-to-end (§3); the only
   gameplay-relative inversions (splash 16 > hit 13; missiles ≈ 18.5× a shell;
   swarm per-shell above chopper) are consequences of the owner's explicit
   do-not-change list, correct to the literal brief, surfaced as advisories — not gates.

## 1. Whole-codebase "everything else unchanged" — HOLDS (one gameplay-relative exception)

Direct readers of the changed values (grep `CHOPPER_GUN_PROFILE`, `damageMultiplierFromV2`):

- `src/killstreak-runtime.ts:2691` (AI autopilot admitted damage), `:2715` (possessed
  admitted damage), `:2711` (`maximumRangeM` only), `:2747` (`cadenceMs` only).
- `src/legacy-main.ts:24945` (`maximumRangeM` trace length only), `:24970-24972`
  (`cadenceMs` audio-report interval only).
- Tests deriving expectations from the oracle itself
  (`src/chopper-gunner-fire-ray.test.ts:160,231`; `src/hf509-chopper-gunner-damage.test.ts:289-320`;
  `src/killstreak-support-catalog.test.ts:82-94`; `src/killstreak-tuning.test.ts:65-72`).
- `damageMultiplierFromV2`: ZERO consumers outside the profile literal
  (`src/killstreak-support-catalog.ts:126`) and its two pins. Informational only; nothing rebalanced.

Downstream of the admitted `damageEvents` — all proportional or boolean, none tiered on the old 26:

- Score/XP: `recordAuthoritativeDamageScores` (`src/authoritative-death-outcome.ts:134`)
  via `recordAuthoritativeDamage` (`src/legacy-main.ts:10092`) takes
  `result.damageApplied` linearly; kill attribution `killCauseFromKillstreak('chopper')`
  (`src/kill-provenance.ts:24`) still `{ kind: 'killstreak', effect: 'chopper' }`,
  kill-feed classification unchanged. Smaller numbers, same ledger.
- Hitmarker tiers: `showHitmarker(headshot, wasElimination)` only
  (`src/legacy-main.ts:20606,21969,23386`); chopper profile has `criticalHits: false`
  and zone is always `'body'` on these paths — no damage threshold to cross.
- Owner feedback: `recordOwnerSupportDamage` (`src/legacy-main.ts:23819-23845`)
  renders `event.damage`, accumulates `supportDamageDealtByActivation`, HUD shows
  `Math.round(...)` — display-only. Audio `audio.hit(false)` fixed; gun report
  `supportGun('chopper')` (`src/audio.ts:3401`) fixed sweep/noise — no intensity curve by damage.
- Camera shake: `Math.min(1, appliedDamage / 45)` (`src/legacy-main.ts:15043`) —
  proportional (13 → 0.29 trauma vs 26 → 0.58; wallbanged 6.5 → 0.14). Still nonzero per hit; no tier.
- Bot threat/flee: no damage-value weighting exists — spawn `threats` are positions
  (`src/legacy-main.ts:16724,19951`); bot `applyBotDamage` (`src/legacy-main.ts:20567-20603`)
  is `min(hp, max(0, damage))`, and under-fire records only a timestamp (`bot.lastDamagedAt`).
- Challenge/achievement thresholds: no `damageThreshold`/`DAMAGE_THRESHOLD` keyed on
  chopper-gun damage found in `src/` (only generic weapon/challenge scaffolding; nothing
  references `CHOPPER_GUN_PROFILE` or the `26`/`25.5` constants).

EXCEPTION (gameplay-relative, not code-shared — confirms verifier issue 1):
`src/killstreak-runtime.ts:76` `CHOPPER_GUN_SPLASH_MAX_DAMAGE = 16` unchanged +
`src/killstreak-runtime.ts:2731-2742` near-miss `damageAround` fires ONLY when the
centre ray hits nobody, with integer `max(1, round(16·(1−range/2.6·0.75)))`
(`:3308`). A shell that MISSES by < 2.6 m now deals up to 16; a shell that HITS
deals 13. Smallest fix: surface to owner (splash was on the do-not-change list —
brief-correct as built); if the owner wants the burst to follow the gun,
`CHOPPER_GUN_SPLASH_MAX_DAMAGE` 16 → 8 plus snapshot row
`src/hf509-chopper-gunner-damage.test.ts:245` (`killstreak.chopperGunSplashMaxDamage`).

## 2. Profile-id rename — SAFE, nothing keys on the old id

- String `chopper-gun-standard-v3-hf458` appears NOWHERE in `src/`, `tests/`,
  `scripts/`, or `docs/` except the history row in REPORT.md:59. New id `v4-hf509`
  appears only at `src/killstreak-support-catalog.ts:123`.
- Chopper snapshots/protocol never carry a gun profile id: `gunProfileId` is
  `DroneGunProfileId | null`, `null` for chopper (`src/killstreak-runtime.ts:590,323-324,3446`);
  protocol validates `gunProfileId` only for `kind === 'drone'`
  (`src/killstreak-protocol.ts:318,324`). No replay fixture, committed snapshot,
  mp-audit row (`scripts/qa/mp-audit.mjs` diffs message traces/poses, never gun ids),
  sound/contract digest (`src/sound-event-inventory.ts`: `support.chopper-gun` event id —
  different namespace, untouched), analytics, or save-data key references the string.
- No lookup default to fall through: nothing looks this id up at all — it is a
  label, not a key. Smallest fix: none.

## 3. End-to-end victim loss — exact 0.5 survives every stage

Host admits integers (`supportGunDamageAtDistance` rounds): 13 point-blank / 8 max-range.
Wallbang halves the ADMITTED shell (`src/killstreak-runtime.ts:2718`): 13 → 6.5
(fractional by design, carried in `damageEvent.damage`).

- Remote guest (authoritative): `applyKillstreakDamageEvent`
  (`src/legacy-main.ts:24682-24701`) → `applyAuthoritativeRemoteDamage`
  (`src/remote-health-authority.ts:58-119`) with resolver `applyDhvIncomingDamage`
  (`src/handicap.ts:29-33`). No rounding/floor anywhere: `damageRequested =
  min(100, resolved)`, `hp = max(0, advanced.hp − requested)`, `applied = before − after`.
  13 → 13 (DHV 10), 6.5 → 6.5 exact. DHV incoming multipliers (`2 − v/10`) scale base
  and lane identically, so the ratio is preserved at every DHV; `X` is lethal either way.
  Regen (18 HP/s after 5 s) is time-based and orthogonal.
- Local victim (self-damage/guest-local): `applyDamage(event.damage, …, 1, true, cause)`
  (`src/legacy-main.ts:24660` → `:15004`): `applyDhvIncomingDamage` then
  `admittedPlayerDamage = min(100, max(minimumDamage, damage))`
  (`src/gameplay.ts:13`) — no floor/round of the fractional 6.5; `Math.round` at
  `:15031` is feed display only.
- Bot: `applyBotDamage` (`:20567-20603`): `min(hp, max(0, damage))` — fractional preserved.
- Practice dummy: `hitPracticeTarget` (`:23282`) → `applyPracticeTargetDamage`;
  `Math.round`/`Math.ceil` at `:23314` are display only.
- Out-of-range still 0 (`:2719` `admittedDamage > 0` gate; oracle returns 0 past 78 m).

Chopper-adjacent sources now out of proportion the way splash does (all on the
do-not-change list — advisories, not gates):

- Missiles: `CHOPPER_MISSILE_MAX_DAMAGE = 240`, blast 4.5 m
  (`src/killstreak-runtime.ts:67,77`) — unchanged, now ≈ 18.5× a direct shell (was ≈ 9.2×).
- Drone guns: baseline `12/8` (`src/killstreak-support-catalog.ts:41-44`),
  piloted 0.5×, swarm 2× — unchanged. Per-shell, the chopper (13/8 admitted) now sits
  roughly at 2× piloted and BELOW swarm max, where it previously matched-or-led swarm.
- Autopilot missile budget 6 of 12 (`src/killstreak-tuning.ts:56`), cadence/range/falloff —
  unchanged as ordered.

Smallest fix: none required for the 0.5 to hold; if the owner wants the whole
airframe re-proportioned, that is a new brief, not a defect in this lane.

## Verifier issues — concur

1. Splash inversion (`src/killstreak-runtime.ts:76`, `:2731-2742` vs `:2715` + oracle
   `:160`): concur — real, brief-correct, owner decision. Fix as §1 exception.
2. Max-range ratio 0.4706 (`REPORT.md:79`): concur — `round(16.5)=17` vs `round(8.25)=8`
   in the pre-existing oracle; point-blank halves exactly (26 → 13). Disclosed and accepted.

## Method

Grep: `CHOPPER_GUN_PROFILE` (6 files), `damageMultiplierFromV2` (catalog + 1 test),
`CHOPPER_GUN_SPLASH` (runtime + table + 2 tests), `chopper-gun-standard` (catalog + report only),
`chopper-gun` (no id pins outside catalog), `applyAuthoritativeRemoteDamage |
applyKillstreakDamageEvent`, `recordOwnerSupportDamage | recordAuthoritativeDamage |
killstreakActorModifiers | killCauseFromKillstreak`, `hitmarker | killfeed`,
`threat | flee`, `challenge | achievement | DAMAGE_THRESHOLD`, `damageAround`,
`hitPracticeTarget`. Read: `killstreak-tuning.ts:70-101`, support-catalog `:113-165`,
runtime `:2683-2749`, `:2577-2587`, `:3280-3311`, legacy-main `:24643-24702`,
`:23819-23855`, `:15004-15070`, `:20567-20603`, `:23282-23324`,
`remote-health-authority.ts:58-119`, `handicap.ts`, `gameplay.ts:13`. Diff stat confirms
only the 7 listed files vs pass93-candidate.
