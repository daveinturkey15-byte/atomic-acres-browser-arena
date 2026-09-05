# PASS 95 - HF-509 Chopper Gunner machine-gun damage halved

Owner request (HF-509, 2026-09-05): *"half the damage of the helicopter's
machine gun, the chopper gunner. Keep everything else the same."*

- Lane branch: `contrib/dave-gaming-pc/claude/v7-chopper-gunner-damage`
- Base commit: `452d7aba` (`contrib/dave-gaming-pc/claude/pass93-candidate`,
  candidate 7)
- Worktree: `C:/Users/david/projects/aa-v-chopper-gunner-damage`

Claim-state convention: `[VERIFIED]` = this lane ran the command and read its
output; `[MEASURED]` = a number produced by an instrument this lane ran;
`[OPEN]` = not proven here.

---

## 1. Which "chopper gunner" the owner means

`[VERIFIED]` There is exactly one thing in the codebase named "Chopper Gunner".

`src/killstreak-catalog.ts:273`

```
{ id: 'chopper', displayName: 'Chopper Gunner', cost: 8, tier: 'high', ... }
```

Its machine gun is `CHOPPER_GUN_PROFILE` in
`src/killstreak-support-catalog.ts:113`, consumed by the host-side killstreak
runtime at `src/killstreak-runtime.ts:2691` (AI autopilot fire) and `:2715`
(possessed player fire).

`[VERIFIED]` The nearby candidates that are **not** this thing, reported with
their current values, all unchanged by this lane:

| Candidate | What it actually is | Current value | Changed? |
|---|---|---|---|
| `minigun` (`src/combat/weapon-catalog.ts`) | player-carried LMG-class hand weapon, not a helicopter gun | base `11.25`, minimum `8.4375`, rpm `1200` | no |
| helicopter in `src/ui/menu-preview-camera.ts` / `menu-preview-video.ts` | prerecorded main-menu preview choreography; no weapon, no damage | n/a | no |
| Chopper missiles (`CHOPPER_MISSILE_MAX_DAMAGE`) | the 12-rocket payload, a separate system from the machine gun | `240` | no |
| Chopper gun near-miss splash (`CHOPPER_GUN_SPLASH_MAX_DAMAGE`) | shell burst on a miss; the brief explicitly excludes splash | `16` | no |

There is no separate "player helicopter" weapon. A player *possesses* the
killstreak chopper (`possession.kind === 'chopper-gunner'`), and possessed fire
reads the same `CHOPPER_GUN_PROFILE` as the autopilot, so halving the profile
halves both AI and player-controlled fire. That is what "the chopper gunner"
means in this codebase.

---

## 2. Before / after

`[VERIFIED]` Values read from the base commit and from this lane's head.

| Quantity | Base `452d7aba` | This lane | Ratio |
|---|---|---|---|
| `CHOPPER_GUN_PROFILE.damage` | `25.5` | `12.75` | exactly 0.5 |
| `CHOPPER_GUN_PROFILE.minimumDamage` | `16.5` | `8.25` | exactly 0.5 |
| `damageMultiplierFromV2` | `0.75` | `0.375` | 0.75 x 0.5 |
| profile `id` | `chopper-gun-standard-v3-hf458` | `chopper-gun-standard-v4-hf509` | renamed to record the tune |

`[MEASURED]` What the shared host-side oracle `supportGunDamageAtDistance`
actually **admits** per shell (it rounds and floors at 1, so the profile field
alone is not proof):

| Distance | Base admitted | Lane admitted |
|---|---|---|
| 0 m (point blank) | `26` | `13` |
| 18 m (inside falloff start) | `26` | `13` |
| 78 m (max range) | `17` | `8` |
| 78.01 m (out of range) | `0` | `0` |

Point-blank halves exactly. Max range reads 8 rather than 8.5 because of the
pre-existing integer rounding in the oracle, not a second tune.

`[VERIFIED]` Everything the owner said to keep the same, kept the same:
`falloffStartM 28`, `maximumRangeM 78`, `cadenceMs 240`, `rpm 250`,
`penetration 'solid-occluded'`, `criticalHits false`, splash radius `2.6 m`,
splash max damage `16`, missile capacity `12`, missile max damage `240`,
autopilot missile budget `6`. Spread is not a field of this profile: the
possessed gun is a centre-ray capsule (`targetRadiusM: 1`), untouched.

---

## 3. Where the change lives

`src/killstreak-tuning.ts` - the halving is expressed as its own named ratio
next to the value it scales, so the request stays readable as intent:

```ts
export const CHOPPER_GUN_DAMAGE_HF458 = roundToMilli(CHOPPER_GUN_DAMAGE_BEFORE * CHOPPER_GUN_DAMAGE_MULTIPLIER); // 25.5
export const CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER = 0.5;
export const CHOPPER_GUN_DAMAGE_AFTER = roundToMilli(CHOPPER_GUN_DAMAGE_HF458 * CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER); // 12.75
```

The owner asked to halve **what is in the game today** (the post-HF-458 25.5),
not to re-derive from the Pass 66.1 baseline of 34, so the halving stacks on
HF-458 rather than replacing it. Total scaling from v2 is therefore 0.375.

`src/killstreak-support-catalog.ts` - `CHOPPER_GUN_PROFILE` consumes the new
constants and records the new total multiplier. No other field touched.

---

## 4. Host authority - guests take the same value

`[VERIFIED]` The halved number is applied host-authoritatively; a guest never
computes chopper-gun damage from its own build.

1. `src/legacy-main.ts:25014` gates the entire killstreak step:
   `if (network.role !== 'client' && matchState.phase === 'active')`.
   `killstreakRuntime.advance(...)` - where
   `supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, ...)` is evaluated
   (`src/killstreak-runtime.ts:2691` and `:2715`) - runs on host/solo only.
2. The resulting `damageEvents` are applied in `applyKillstreakDamageEvent`
   (`src/legacy-main.ts:24643`). For a remote guest target it takes the
   host-only branch at `:24682` (`if (network.role !== 'host') return event;`)
   and resolves through `remoteHealthAuthorities` /
   `applyAuthoritativeRemoteDamage`.
3. A guest therefore receives an already-resolved health result. A guest on a
   stale build cannot deal or take a different chopper-gun number.

`[VERIFIED]` A possessed player's fire is only an intent: the client sends
`pilot-control { fire: true }` (`src/legacy-main.ts:24989`); the host rebuilds
the ray from its own entity pose (`chopperGunnerAuthoritativeRay`) and resolves
the hit. Wallbang admission still costs half the admitted shell
(`src/killstreak-runtime.ts:2717`), which now halves along with the profile:
point-blank through a wall goes 13 -> 6.5, previously 26 -> 13.

---

## 5. Tests added

`src/hf509-chopper-gunner-damage.test.ts` (new, 4 cases):

1. **one Chopper Gunner** - asserts exactly one killstreak carries the display
   name "Chopper Gunner" and that its id is `chopper`, so a later lane cannot
   silently aim this tune at the wrong thing.
2. **halved, and only halved** - pins `12.75` / `8.25`, pins the exact `/2`
   relationship to the recorded base values `25.5` / `16.5`, and pins every
   other field of the profile plus splash and missile damage.
3. **the oracle halves too** - pins the admitted-per-shell values in section 2,
   including the out-of-range zero.
4. **snapshot: nothing else moved** - `BASE_COMBAT_DAMAGE_TABLE`, 237 rows,
   compared with `toEqual`.

`src/combat-damage-table.ts` (new) is the collector behind case 4. It walks
`WEAPON_CATALOG` (all 21 weapons: policy, base, minimum, both falloff bounds,
head and limb multipliers, rpm, pellets), the three drone gun profiles, the
flame damage catalog, every killstreak damage constant (chopper missile,
chopper gun splash, carpet bomber, tri-pass, hunter swarm, nuke) and the
player-side damage constants (grenade, melee, headshot, sniper headshot, fall,
bot, adrenaline, overdrive, railgun, explosive bolt).

`[VERIFIED]` **The expected table was derived, not typed.** The collector was
written first, run against the unmodified base tree via a throwaway vitest case
that serialised `collectCombatDamageTable()` to JSON, and that JSON was
formatted into the test file mechanically. The throwaway case was then deleted.
No expected value in that table was authored by hand.

`[VERIFIED]` **The guard was falsified before it was trusted.** With
`MELEE_DAMAGE` temporarily changed `100 -> 101` in `src/gameplay.ts`, the
snapshot case failed with:

```
AssertionError: expected { ...(237) } to deeply equal { ...(237) }
-   "player.meleeDamage": 100,
+   "player.meleeDamage": 101,
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

`src/gameplay.ts` was then restored; `git diff --stat src/gameplay.ts` was
empty.

Two existing tests were updated to the new value rather than weakened. Both
still pin the HF-458 `-25%` ratio, now against the named intermediate constant,
and additionally pin the HF-509 `x0.5` ratio:
`src/killstreak-tuning.test.ts`, `src/killstreak-support-catalog.test.ts`.

`src/chopper-gunner-fire-ray.test.ts` needed no edit: it already derives its
expectations from `supportGunDamageAtDistance(CHOPPER_GUN_PROFILE, ...)`.

---

## 6. Gates

`[VERIFIED]` `npx tsc --noEmit` - exit 0, no output.

`[VERIFIED]` Targeted run:

```
npx vitest run src/hf509-chopper-gunner-damage.test.ts src/killstreak-tuning.test.ts \
  src/killstreak-support-catalog.test.ts src/chopper-gunner-fire-ray.test.ts \
  src/killstreak-runtime.test.ts src/legacy-main-size-ratchet.test.ts

 Test Files  6 passed (6)
      Tests  75 passed (75)
```

Full-suite result is recorded in section 8.

---

## 7. Killstreak damage-path guest/host asymmetry audit

Scope: every killstreak that deals damage. One question - can a guest's own
build change the number, or the fact, of damage it deals or takes?

`[VERIFIED]` findings. No fixes applied: the owner asked for one number to
move.

1. **All killstreak damage is host-only.** Every `damageEvent` push in
   `src/killstreak-runtime.ts` (`:1327` yardhawk, `:2692` chopper AI, `:2719`
   chopper possessed, `:2812` and `:2911` drone variants, `:3309`
   `damageAround` splash) is reachable only from `advance()`, and `advance()`
   is called from exactly one place, gated on `network.role !== 'client'`. No
   client-side path constructs a killstreak damage event.

2. **Bot damage is host-gated separately and correctly.**
   `applyKillstreakDamageEvent` at `src/legacy-main.ts:24677` requires
   `network.role !== 'client'` before applying to a bot, so a guest that
   somehow received a bot-targeted event drops it rather than double-applying.

3. **Self-damage is the one client-applied branch, and it is bounded.** At
   `:24652` an event whose `targetId` is the local player applies `applyDamage`
   locally. On a guest that branch is reached only for events the host sent
   about that guest, and it is life-id gated
   (`event.targetLifeId !== localContinuity` returns null), so a stale event
   from a previous life cannot land. `[OPEN]` I did not prove by measurement
   that the host's authoritative health and the guest's locally applied health
   cannot diverge by rounding when both apply the same event: the host resolves
   through `applyAuthoritativeRemoteDamage` while the guest applies
   `applyDamage` with its own armour/handicap multipliers. Pre-existing, not
   specific to the chopper gun.

4. **Practice-target damage has no role gate.** `:24670` applies killstreak
   damage to gun-range training dummies with no role or authority check. The
   gun range is single-player-shaped, so this is not a live asymmetry today,
   but it is the one damage branch in that function without a check.
   `[OPEN]` untested in a hosted room.

5. **Wallbang halving is host-side.** `src/killstreak-runtime.ts:2717`
   computes `hit.wallbanged ? distanceDamage * 0.5 : distanceDamage` inside the
   host-only advance, so a guest can neither claim nor deny a wallbang.

6. **The possessed gun's cadence is read in two places; only one is
   authoritative.** `src/legacy-main.ts:24970` schedules a client-side *report*
   interval from `CHOPPER_GUN_PROFILE.cadenceMs` for local audio, while
   `src/killstreak-runtime.ts:2747` sets the authoritative `nextShotAtMs` from
   the same constant. They agree today because both read one constant; a future
   lane that changed cadence in only one place would desync fire audio from
   fire. Not a damage asymmetry, and not touched here.

7. **Control intents are validated hard, and none of them can change a
   damage number.** `KillstreakRuntime.control` (`src/killstreak-runtime.ts:2029`)
   rejects on unknown actor, `matchEpoch`/`lifeId` mismatch, a non-increasing
   `sequence` (replay), a missing or expired or dead entity, an entity the
   actor does not own, a non-finite aim/thrust value, and a gun controller that
   is not this actor. Aim pitch is clamped to `[-1.2, 0.5]`, drone axes to
   `[-1, 1]`. Fire is an assigned held-state, not an OR-latch, so release is
   authoritative and cadence stays host-applied; missile and taser are
   edge-only and cannot be queued during cooldown. A guest can therefore change
   *where* it points and *whether* it is holding the trigger - never how often
   it fires, how far it reaches, or how much it deals.

8. **Two non-damage observations, reported not fixed.**
   `[VERIFIED]` (a) There is no turn-rate limit on possessed aim: `aimYaw` is
   accepted as any finite angle per intent, so a modified guest client could
   snap-aim the chopper gun. The host player sets aim from the same field, so
   this is an anti-cheat surface rather than a host/guest asymmetry.
   `[VERIFIED]` (b) `control` enforces a monotonic sequence but no per-time
   budget; the 50 ms send interval is client-side only
   (`src/legacy-main.ts:24976`). A spammy guest costs the host a little work
   per packet but gains no fire-rate or damage advantage, because
   `nextShotAtMs` is set inside the host-only advance.

`[VERIFIED]` No guest/host asymmetry was found in the chopper gun damage path
itself.

---

## 8. Full suite (under the machine heavy-work lock)

`[VERIFIED]` `npx vitest run` (lock held 07:36-07:41, released immediately
after):

```
 Test Files  1 failed | 621 passed | 1 skipped (623)
      Tests  1 failed | 6246 passed | 2 skipped (6249)
   Duration  262.82s
```

`[VERIFIED]` The single failure is `src/gameplay-state-property.test.ts >
replays every generated sequence to the same canonical hash`:

```
Error: Test timed out in 60000ms.
```

`[VERIFIED]` It is a wall-clock timeout under full-suite parallel load, not a
correctness failure, and it is independent of this lane's diff:

- Re-run in isolation on this branch: `Test Files 1 passed (1)`,
  `Tests 2 passed (2)`, duration `43.81s` against the file's own `60000ms`
  bound. It is a 10,000-run `fast-check` property whose margin is thin on a
  loaded machine (other lanes and ComfyUI were running).
- Its entire import surface is `./gameplay`, `./gameplay-replay`,
  `./protocol`, `./deterministic-rng`, `./canonical-state` and
  `./combat/legacy-weapon-adapter`. `[VERIFIED]` by grep, none of those import
  `killstreak-tuning`, `killstreak-support-catalog` or `combat-damage-table` -
  the only modules this lane changed or added. The test cannot observe this
  change.

The timeout was NOT raised and the run count was NOT lowered: no threshold,
budget or bound was touched anywhere in this lane. `[OPEN]` whether the same
test also times out at base `452d7aba` under identical load was not measured
here; the isolation re-run plus the import-surface proof is what this lane
stands on.
