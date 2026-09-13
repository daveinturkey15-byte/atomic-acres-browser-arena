# HF-509 - a care package grants its contents exactly once

Lane: `care-package-grant-once`
Branch: `contrib/dave-gaming-pc/claude/v7-care-package-grant-once`
Base: `452d7aba` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`, candidate 7)
Worktree: `C:/Users/david/projects/aa-v-care-package-grant-once`
Date: 2026-09-05

Claim-state convention: `[VERIFIED]` = I ran it and quote its output.
`[MEASURED]` = a number produced by an instrument I ran. `[OPEN]` = not proven.

Owner statement (HF-509): "I've got the Crimson Flamethrower in the care
package, and it just let me keep pressing the button and getting a hundred
percent value. It should only grant it to you once, and then you have it until
it's out of ammo."

---

## 1. The defect, at cause

`[VERIFIED]` The crimson flamethrower is the only care-package reward that is a
**weapon grant** rather than a streak. In `src/legacy-main.ts`,
`activateFieldSupport` recognised it and returned immediately:

```ts
if (revealedCareReward === CRIMSON_FLAMETHROWER_KILLSTREAK_ID) {
  grantCrimsonFlamethrower();
  return;
}
```

That early return skipped `requestKillstreakActivation` -> `killstreakRuntime.activate`,
which is the **only** code path that consumes a care reward
(`src/killstreak-runtime.ts:1654`, `else if (fromCare) actor.careRewards.shift();`).
The queue entry therefore survived every grant. Consequences, all of them the
owner's report:

- `grantCrimsonFlamethrower` re-ran `player.ammo[weapon] = WEAPONS[weapon].mag`
  and `player.reserve[weapon] = WEAPONS[weapon].reserve` on every press: a full
  refill, "a hundred percent value".
- `revealedCareRewards[0]` never cleared, so the HUD kept the
  `CARE DROP: CRIMSON FLAMETHROWER` prompt on slot one forever.
- Nothing was ever sent to the host, so in multiplayer the grant was purely
  client-side and unbounded.

`[VERIFIED]` The **crate** side was already correct: `beginCareCapture` deletes
the entity and bumps the revision on a friendly tap
(`src/killstreak-runtime.ts:2218-2220`). The defect was entirely in the
redemption step, not the capture step. This report pins both.

## 2. The fix

New pure module **`src/care-package-grant-once.ts`** (no DOM, no three):

- `advanceCareRewardQueue` / `headCarePackageId` derive a stable identity for the
  package **instance** at the head of the replicated `revealedCareRewards`
  queue: `care-<matchEpoch>-<ownerId>-<rewards already consumed this epoch>`.
  Derived from the host-authoritative snapshot alone: **no protocol field was
  added and no checkpoint shape changed**. A consumed head advances the ordinal,
  so a *second* care package is a genuinely new instance and is grantable.
- `createCarePackageGrantLedger` is the idempotent claim ledger keyed by
  **package id + claimant**, mirroring the host-validated pickup relay
  (`acceptRemotePickup` in `src/mp-remote-pickup-authority.ts`, which refuses a
  duplicate nonce and an already-taken drop rather than applying twice). The
  first valid claim wins; a repeat by the same claimant returns
  `already-claimed`, a claim by anyone else returns `package-consumed`. Both
  refuse silently.
- `redeemCarePackageWeaponGrant` is the whole press as one pure decision: claim
  -> ask the host to consume -> grant, and **only** when both admit. A refused
  host admission calls `release`, because a rejected activation leaves the
  reward retryable; stranding it would be a second defect.

`src/legacy-main.ts`:

- `redeemCarePackageWeaponReward` replaces the bare grant. `requestHostConsumption`
  is `requestKillstreakActivation(id, now) !== null`, so the **host** shifts the
  reward exactly once and `broadcastKillstreakState` replicates the new snapshot
  to every peer. Further presses see an empty queue -> `no-package` -> no grant,
  no prompt.
- `careRewardQueueTracker` is folded forward from the replicated snapshot inside
  `refreshLocalKillstreakSnapshot`.
- `requestKillstreakActivation` / `killstreakSlotFor` widened from
  `SelectableKillstreakId` to `Pass65KillstreakId`. The care-only crimson reward
  still has **no loadout slot** (`FIELD_SUPPORT_IDS` excludes it, pinned) but is
  redeemed through slot one exactly like every other care reward.

Owner requirement "you have it until it's out of ammo": unchanged. The grant is
still an ordinary personal weapon with its own finite ammo, never routed through
timed-map-weapon authority, so the existing revert rules still apply. Pinned by
`crimson-flamethrower.test.ts` (`claimTimedMapWeapon` / `applyTimedMapWeaponState`
absent from the grant body) and re-pinned in the new suite.

## 3. Key measurements

`[MEASURED]` Press loop, 25 presses on one package instance
(`press-loop-measurement.json`, produced by running the shipped module):

| | grants | host consumption requests | magazine refills |
|---|---:|---:|---:|
| before (early-return path) | **25** | **0** | **25** |
| after (`redeemCarePackageWeaponGrant`) | **1** | **1** | **1** |

`[MEASURED]` `src/legacy-main.ts`: 37,396 lines before, **37,395 lines after**
(CORRECTED by the candidate 8 integrator: this section originally claimed 37,396
after; the ratchet's own metric on `866de9ef` reads 37,395, one line UNDER the
ceiling - the safe direction, but the quoted number was wrong. Verifier issue
(c). In the integrated candidate 8 the file measures 37,391.) The ceiling was **not** raised. Four pure blocks were
hoisted out to pay for the new wiring: `createWeaponCapacityRegistry`,
`DOMINATION_TEAM_COLORS` and `DEBUG_RIGGED_EVIDENCE_SENTINEL_DEFINITIONS` to
`src/legacy-pure-helpers-2.ts`, and `GAMEPAD_SUPPORT_LABELS` to
`src/field-support.ts`.

`[MEASURED]` New suite `src/care-package-grant-once.test.ts`: **4 failed / 22
passed** before the fix (`before-fix-vitest.txt`), **26 passed** after
(`after-fix-vitest.txt`). The four reds were exactly the legacy-main wiring pins.

## 4. Gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output (`tsc.txt`).

`[VERIFIED]` Targeted gate set (`targeted-vitest.txt`), exit 0:

```text
npx vitest run src/network*.test.ts src/protocol*.test.ts src/*pickup* src/*weapon* \
  src/*care* src/*supply* src/legacy-main-size-ratchet.test.ts \
  src/crimson-flamethrower.test.ts src/killstreak-runtime.test.ts \
  src/field-support.test.ts src/legacy-pure-helpers-2.test.ts

 Test Files  43 passed (43)
      Tests  483 passed (483)
```

`[VERIFIED]` Full suite under the machine heavy-work lock (`full-vitest.txt`), exit 0:

```text
 Test Files  622 passed | 1 skipped (623)
      Tests  6269 passed | 2 skipped (6271)
   Duration  219.82s
```

Candidate 7 measured `621 passed | 1 skipped` / `6243 passed | 2 skipped`; this
lane adds one test file and 26 tests, and loses none.

`[VERIFIED]` `npm run build` under the lock (`build.txt`), exit 0, built in
11.18 s, `legacy-main-B2hC8LUm.js 1,949.37 kB / gzip 599.80 kB`.

`[VERIFIED]` `src/legacy-main-size-ratchet.test.ts`: 5 passed.

## 5. Coverage of the owner's clauses

| Owner clause | Where it is proven | State |
|---|---|---|
| grants exactly once per package instance | `HF-509 redemption press loop`: 25 presses, 1 grant, 1 host request | `[VERIFIED]` |
| host-authoritative in multiplayer | `redeemCarePackageWeaponReward` requests `killstreakRuntime.activate`; `HF-509 host-authoritative guest claim path`: a second crimson intent is `selection-mismatch`, a replayed sequence is `replayed-sequence` | `[OPEN]` - **DOWNGRADED from [VERIFIED] by the candidate 8 integrator on the verifier's finding (b)**: at `src/legacy-main.ts:24350` a guest's `requestKillstreakActivation` returns a non-null id *before* host admission and there is no activation-rejected message, so on a guest the grant is optimistic and the ledger rollback path is unreachable. The single-machine claim path is verified; guest host-authority is not. |
| idempotent by package id + claimant | ledger suite: same claimant -> `already-claimed`, other claimant -> `package-consumed`; `headCarePackageId` scoped to epoch + owner | `[VERIFIED]` |
| package consumed and removed on grant, replicated to every peer | `consumes and removes the crate on the first claim and replicates that to every peer`: the crate is absent from `snapshotFor('owner')`, `snapshotFor('guest-b')` and `snapshotFor(null)` | `[VERIFIED]` |
| guest cannot double-claim | `refuses a guest double-claim ...`: the second `beginCareCapture` by the same guest is `crate-unavailable` | `[VERIFIED]` |
| second guest arriving after the grant sees a consumed package | same test: `guest-b` gets `crate-unavailable` and `revealedCareRewards: []` | `[VERIFIED]` |
| player keeps the weapon until ammo is exhausted, then existing revert rules | the grant body still sets only `mag`/`reserve` and never touches timed-map-weapon authority; the auto-reload/revert path in `legacy-main` was not modified | `[VERIFIED]` (unchanged behaviour) |
| further presses do nothing and show no prompt | `stops entirely once the host snapshot clears the queue` -> `no-package`; `displayedCareReward` clears from the replicated queue so slot one reverts to the loadout label (unchanged HUD code) | `[VERIFIED]` for the grant path |

## 6. Every other care-package content

`[VERIFIED]` `HF-509 every other care-package content follows the same rule`:

- The care pool ids minus `FIELD_SUPPORT_IDS` is **exactly**
  `['crimson-flamethrower']`. Every other pool reward is a field support and was
  already redeemed through `killstreakRuntime.activate`, which shifts the queue.
  If a second weapon-grant reward is ever added, that assertion fails until it is
  wired through the same ledger.
- A field-support care reward is consumed by one activation and a second is
  refused (verified with `piloted-drone` through the audited training bridge).
- The weapon reward is still never selectable into a killstreak slot.

## 7. What was not weakened

No test, threshold, fence, budget, timeout, soak bound or the legacy-main size
ratchet was weakened, skipped or widened. Two edits to
`src/crimson-flamethrower.test.ts` were **narrowings**, both stated in the file:

1. `diverts a rolled crimson reward ...` now additionally requires
   `redeemCarePackageWeaponReward(...)` and `grant: () => grantCrimsonFlamethrower(now),`
   and asserts the old bare grant-then-return pair is **absent**: the defect is
   now a failing assertion.
2. `grants finite personal ammo ...` sliced the grant body up to
   `function activateFieldSupport(`; HF-509 inserts a function between them, so
   the slice now ends at the next `function ` boundary. Same body, tighter bound.

## 8. Open items

- `[OPEN]` No browser run. This lane is unit/protocol only; the change is in
  gameplay logic reachable only through a live care-package roll, which the
  10-in-100 band makes non-deterministic in a four-minute headless session. The
  press loop, the host admission and the replication are proven mechanically
  instead.
- `[OPEN]` `npm run qa:mp-soak` (the Pass 95 required release gate) was not run
  in this lane. It remains a candidate-integration responsibility and was red on
  replication / rejoin damage / stair fire at candidate 7 for reasons unrelated
  to this change.
- `[OPEN]` No `HF-509` row was added to
  `docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json`: the ledger row is an
  integrator responsibility and writing one from a feature worktree would be a
  second uncoordinated edit to a shared file.

## 9. Files

| Path | Change |
|---|---|
| `src/care-package-grant-once.ts` | new: ledger, queue tracker, redemption step |
| `src/care-package-grant-once.test.ts` | new: 26 tests across 5 suites |
| `src/legacy-main.ts` | redemption wiring, tracker feed, widened activation id, four blocks hoisted out |
| `src/field-support.ts` | receives `GAMEPAD_SUPPORT_LABELS` |
| `src/legacy-pure-helpers-2.ts` | receives three pure blocks |
| `src/crimson-flamethrower.test.ts` | HF-334 pins narrowed for the new path |
