# Muse review — v7-care-package-grant-once (pass94, third eyes)

Scope: branch `contrib/dave-gaming-pc/claude/v7-care-package-grant-once`,
base `origin/contrib/dave-gaming-pc/claude/pass93-candidate`, head `866de9ef`
(2 commits: `4fe2ef03` fix + `866de9ef` evidence; 14 files, +1202/−41).
Method: read `docs/evidence/pass95/care-package-grant-once/REPORT.md`, read the
full diff vs base, traced every cited path in source. No builds, no browsers,
no GPU, no npm install — static trace only, which is sufficient for all
findings below (each cites the exact lines that decide it).
Worktree `C:/Users/david/projects/aa-v-care-package-grant-once`, tree clean
(`git status --short` empty at review time).

Claim states: `[CONFIRMED]` = traced in the shipped source at the cited lines.
`[OPEN]` = not provable by static trace, left open, never asserted.

## V1 — shape-inferred package ordinal latches the second package [CONFIRMED]

`src/care-package-grant-once.ts:174-190`: `advanceCareRewardQueue` counts a
consumption only when the queue shrinks (`queue.length < previous.length`) or
when an equal-length queue changes its head (`queue[0] !== previous[0]`).
`src/care-package-grant-once.ts:198-204`: `headCarePackageId` is
`care-<matchEpoch>-<ownerId>-<consumedCount>` — the reward *string* never
enters the identity.

Two packages of the same reward string are therefore indistinguishable, and
the latch is reachable two ways:

- Sequential: queue `[crimson]` → grant → host `shift()` → `[]` → second crate
  lands → `[crimson]`. Lengths 1→0 (consumed=1, id advances — fine), then
  0→1 (growth advances nothing). If the second capture lands in the *same*
  replicated snapshot that carries the consumption (equal length, same head
  string), consumed stays 0 and the second package reuses the first package's
  id. The ledger (`src/care-package-grant-once.ts:101-147`, keyed on packageId)
  answers `already-claimed` forever: HUD prompt stuck, presses silent.
- Pre-queued: `[crimson]` → second capture before any consumption →
  `[crimson, crimson]` (growth, consumed=0, head id unchanged) → grant head →
  host shifts → `[crimson]`, equal length with equal head → consumed=0 → the
  surviving second package wears the first package's id → permanently
  unredeemable for that claimant.

Why it matters: an earned reward becomes a dead prompt with no recovery path
short of a new epoch. Smallest fix (as the verifier proposed, endorsed):
thread the host snapshot `revision` into `advanceCareRewardQueue` as a third
argument, record the revision at which the current head first appeared, and
emit `care-<matchEpoch>-<ownerId>-<headFirstSeenRevision>`. A repeated
observation of the same head keeps its id (press-idempotence preserved); any
new head — however the shape compares — mints a new id.

## V2 — guest grant is optimistic, not host-authoritative [CONFIRMED]

`src/legacy-main.ts:24350-24353` (`requestKillstreakActivation`, client
branch): on `network.role === 'client'` the intent is `network.send(message)`d
and the generated `activationRequestId` is returned as non-null **before any
host admission**. Hence `src/legacy-main.ts:26486`
(`requestHostConsumption: () => requestKillstreakActivation(id, now) !== null`)
is `true` on every guest press whose slot resolves — including presses the
host will later reject (`life-mismatch`, `replayed-sequence`,
`selection-mismatch`; host admission at
`src/killstreak-runtime.ts:1610-1619`). The grant at
`src/legacy-main.ts:26487` already ran. The `ports.ledger.release` rollback at
`src/care-package-grant-once.ts:242` is unreachable on guests. Repository-wide
grep for `activation-rejected|killstreak-activate-reject` returns no matches:
no host→client rejection message exists anywhere, so the guest can never learn
it granted without authority.

REPORT.md section 5 row "host-authoritative in multiplayer [VERIFIED]" is
therefore false for guests and must drop to [OPEN], as the verifier stated.
Smallest fix: make the guest path pessimistic — send the intent, grant only on
a new host→client activation-admitted message for that `activationId`
(ledger `release` on reject/timeout); until that message exists, gate the
guest grant behind the replicated snapshot clearing the queue (grant on
`revealedCareRewards` transition, not on send).

## V3 — line-count claim is wrong [CONFIRMED, with a line-ref correction]

`src/legacy-main-size-ratchet.test.ts:306-313`: `countLines` counts `\n`
bytes. Measured: base file 37,396 `\n`, current file 37,395 `\n` (LF-only,
trailing newline present in both). `LINE_CEILING` is 37,396
(`src/legacy-main-size-ratchet.test.ts:78`). So REPORT.md:103
("[MEASURED] `src/legacy-main.ts`: 37,396 lines before, **37,396 lines after**,
exactly on `LINE_CEILING`") is wrong twice: after is 37,395, and the file sits
1 *below* the ceiling, not exactly on it. (The verifier cited REPORT.md:110;
in the shipped report the sentence is at line 103 — line drift, same
substance.) "Before" (37,396) matches the base newline count. Smallest fix:
`37,395 lines after, one below the 37,396 ceiling`.

## (a) Second half of the owner sentence — "keep until out of ammo"

The verifier proved press-idempotence only. Lifetime trace:

- A1 — ammo depletion does NOT end the claim (silent empty gun). The catalog
  entry (`src/combat/weapon-catalog.ts:329-336`) is `magazine: 100, reserve: 0`
  ("one tank, no resupply"). `src/legacy-main.ts:19209` (`reload`) returns
  early when `availableReserve <= 0`, and `src/legacy-main.ts:19420-19431`
  fires `audio.empty()` + `reload()` on an empty mag — so a depleted crimson
  stays equipped and clicks forever. The only auto-revert in the client
  (`src/legacy-main.ts:17977-17986`) covers timed-map weapons; the grant
  deliberately bypasses that authority (`src/legacy-main.ts:26455-26461`
  comment). REPORT.md:87-91 ("existing revert rules still apply") is
  inaccurate: no revert rule consumes this weapon. Whether "until it's out of
  ammo" means *keep the empty gun* or *lose it* is an owner decision, but the
  current behavior is the former with no feed and no swap-back. Smallest fix:
  owner ruling first; if lose-it, mirror the timed-map revert (on
  mag+reserve==0, `player.weapon = player.primaryWeapon` + feed); if keep-it,
  one feed line ("CRIMSON DEPLETED") so the empty state reads as intentional.
- A2 — weapon swap silently strands the grant. `crimson-flamethrower` is in
  `SPECIAL_WEAPON_IDS`, not `ORDINARY_WEAPON_IDS` (`src/protocol.ts:109-121`).
  `switchWeapon` (`src/legacy-main.ts:19172-19200`) can only reach
  `handicapLoadout(player.primaryWeapon)` (primary+sidearm) or
  `localAuthoritySpecialWeapon()` (`src/legacy-main.ts:17925-17927`: railgun or
  timed-map weapon) — crimson is in neither set, so swapping away is a
  one-way door: ammo is preserved in `player.ammo` but no input path
  re-equips it, while the ledger/queue stay consumed so no re-grant is
  possible. Smallest fix: document swap-ends-claim in the grant feed, or admit
  crimson to the swap set while its total ammo is nonzero.
- A3 — death/respawn correctly ends the claim. `src/legacy-main.ts:17295-17301`
  resets `player.weapon` to the authored respawn loadout on every redeploy;
  the ledger staying consumed is then correct (one grant per package per life,
  new life cannot resurrect it). No finding; the `lifeId` validation in
  `validRequest` (`src/care-package-grant-once.ts:86-90`) is consistent with
  this. Spectate and host migration have no weapon-revoke path, so the grant
  persists across them like any equipped weapon — acceptable, with the
  migration-tracker caveat in (b).

## (b) Claim lifetime — epoch scoping saves matches, migration can still latch

`carePackageGrantLedger` is created once (`src/legacy-main.ts:5656`) and
`careRewardQueueTracker` once (`src/legacy-main.ts:5655`); grep confirms
`.reset()` is never called and the match-start path
(`src/legacy-main.ts:17424-17470`: new `killstreakMatchEpoch`, fresh
`HostKillstreakRuntime`, sequence resets) touches neither. Cross-match safety
holds *only* because package ids embed the epoch
(`src/care-package-grant-once.ts:198-204`) and `advanceCareRewardQueue` resets
`consumedCount` on epoch change (`src/care-package-grant-once.ts:179-182`) —
implicit, undocumented, and one refactor away from a cross-match latch. The
same latch as V1 is reachable without shape collision: a same-match host
migration rebuilds the runtime from a checkpoint while the local tracker keeps
its old `consumedCount`; if the rebuilt queue re-presents a head the tracker
already counted, the head id repeats a ledger-consumed id and a legitimate
later package is refused (`already-claimed`). `lifeId` is validated but is not
part of the ledger identity, so it cannot disambiguate this case either.
Smallest fix: call `carePackageGrantLedger.reset()` plus tracker re-seed
whenever `killstreakMatchEpoch` changes *and* whenever the runtime is rebuilt
from a host checkpoint/migration (not only on epoch change); add a comment at
`src/legacy-main.ts:17470` stating the epoch-scoping invariant so a future
mover preserves it.

## (c) The four hoisted blocks — pure, verbatim, no cycle, no duplication [PASS]

- `createWeaponCapacityRegistry` → `src/legacy-pure-helpers-2.ts:83-96`:
  reads only its four parameters (ids + table passed in at the single call
  site `src/legacy-main.ts:5191-5192`, same arrays `WEAPON_IDS` /
  `SPECIAL_WEAPON_IDS` / `WEAPONS` as the original). Runtime identical; the
  `string`-widened signature with a cast at the call site is type-level only.
- `DOMINATION_TEAM_COLORS` → `src/legacy-pure-helpers-2.ts:99-101`: byte-equal
  frozen record; sole consumer `src/legacy-main.ts:24009` unchanged.
- `DEBUG_RIGGED_EVIDENCE_SENTINEL_DEFINITIONS` →
  `src/legacy-pure-helpers-2.ts:104-111`: byte-equal frozen array; consumers
  `src/legacy-main.ts:33421,33494` unchanged.
- `GAMEPAD_SUPPORT_LABELS` → `src/field-support.ts:252-266`: all 12 entries
  identical, same `Record<Pass65KillstreakId, string>` type; ~10 call sites in
  legacy-main unchanged (pure import rewire at `src/legacy-main.ts:638-641`).
- No import cycles: both receiving modules import only types/catalog-level
  modules (`legacy-pure-helpers-2.ts:1-40` header: type imports only;
  `field-support.ts:1-5`: gameplay/protocol/ordnance/catalog/loadout — none
  imports `legacy-main`). Frozen consts: no init-order hazard. No duplication:
  the originals are deleted from legacy-main (only imports/usages remain).
  No finding.

## Verdict: DO-NOT-SHIP

Three reasons, each blocking on its own:

1. V1 strands earned rewards behind a dead prompt with no recovery — a
   second package in the same epoch can become permanently unredeemable
   through ordinary play (back-to-back crates, one 20 Hz revision).
2. V2 leaves the guest path exactly where the owner complaint started:
   optimistic, unbounded-by-authority grants with an unreachable rollback and
   no rejection message — the "host-authoritative" evidence row is false.
3. (a)+(b) leave the claimed lifetime unproven and partially wrong: depletion
   keeps a silent empty gun against REPORT.md's "existing revert rules" claim,
   swap-away is an irrecoverable silent loss, and migration without
   ledger/tracker re-seed re-opens the V1 latch by a second route.

What is genuinely good and should survive: the host/solo redemption ordering
(claim → host consume → grant, release-on-refuse), the press-loop
measurements, the unweakened ratchet/thresholds, and the clean pure
extractions in (c). Fix V1 (revision-keyed instance id), V2 (pessimistic guest
grant + admitted/rejected message), and the (a)/(b) lifetime rulings, then
re-review — the re-review can be narrow (guest path + lifetime + counts).
