# Muse review — mp-swap-reload-relay (pass95, HF-498/504)

Skeptical review of `contrib/dave-gaming-pc/claude/mp-swap-reload-relay @ a9b4b029`
vs `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Base refs checked read-only (`git show`); no stash, no checkout, no build, no browser, no install.
Worktree status at review time: clean, branch + SHA as requested, no `index.lock`.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. The two real defects are genuinely fixed and host-authoritative: swap rides the
   client→host state lane with loadout validation plus host canonical rebroadcast
   (`src/legacy-main.ts:19221`, `:13664-13668`), and the reload RELAY-GAP is closed
   by fanning the host result to all peers (`src/legacy-main.ts:6362`) with a
   claimant/observer split on receipt (`src/legacy-main.ts:6535-6544`, `:13216`).
2. The biomass is honest: 315 insertions / 13 deletions across 11 files, test files
   pure additions (no weakened assertions), the size ratchet untouched and exactly
   at ceiling (37,396), and the soak-gate delta is a host-local 0 ms credit that
   cannot inflate the guest-measured max.
3. Two findings below should land before publish: F1 — the host rebroadcasts the
   guest-claimed equipped `snapshot.weapon` without allow-listing it against the
   admitted pair (presentation spoof, no ammo authority gained); F3 — one new
   source-text assertion is vacuous on base. Both have smallest fixes. F2 is a
   REPORT prose correction.

## Check results

### (1) Host-authoritative relay — PASS with F1

- Guest→host only: client `network.send()` transmits state solely on host
  connections (`src/network.ts:847-862`); clients never broadcast. Host
  `send()` fans out via `broadcast(message, exceptPlayerId)` (`:849-850`).
- `reload-intent` is consumed by host validation only: it returns inside the
  host-claim branch (`src/network.ts:1319-1322`) before the generic
  `broadcast(payload, playerId)` at `:1326`. Guests cannot relay each other.
- Reload intent validation (unchanged, confirmed): claimant/ledger/epoch
  presence, result-cache dedup, `isOrdinaryWeapon`, then `admitGuestReloadIntent`
  with weapon/alive/timing/inventory (`src/legacy-main.ts:6469-6529`).
- Swap validation: `primary` change requires respawn or unexpired authorized
  pickup or the host corrects the claimant and drops the claim (`:13564-13576`);
  `secondary`/`grenade` changes are rejected outright (`:13577`). Swap and reload
  start emit client boundary state packets (`:19221`, `:19255`) so observers do
  not wait on heartbeat coalescing.
- F1 (minor, fix before ship): the equipped `snapshot.weapon` is not allow-listed
  against the admitted `{primary, secondary}` pair. Only `railgun` and timed-map
  weapons are holder-fenced (`:13560-13562`); an ordinary claimed weapon (e.g.
  `sniper` over an `m4a1/pistol` loadout) is stored (`:13629`) and rebroadcast
  in the canonical state (`:13664`). Blast radius is bounded — ammo authority
  stays in the host ledger, projections are pair-keyed and caps-checked
  (`src/guest-combat-inventory-authority.ts:134-158`), and trigger authority
  resets on change (`:13582`) — so this is a peer-presentation spoof, not an
  ammo/fire-authority bug. Smallest fix: before building `canonicalState`,
  reject-or-clamp `admittedIncoming.weapon` to the admitted pair
  (`remote.snapshot.primary`, `remoteLoadoutSidearm(remote.snapshot)`).

### (2) Observer projection vs self ammo — PASS

- Self and observer receipt paths are disjoint by guard: `acceptLocalReloadResult`
  requires `forPlayerId === player.id` + `connectionEpoch` + `lifeId` match;
  `acceptRemoteReloadResult` requires `forPlayerId !== player.id` +
  `by === hostId` + `lifeId === remote.continuity` (`:6535-6555`). No double
  application; the host takes neither path (`role !== 'client'`).
- State-lane projection applies only when `role === 'client'` and only into the
  per-remote ledger maps (`:13629-13631`); local `player.ammo` is never touched.
  Stale projections are fenced by the revision guard
  (`src/multiplayer-relay.ts:26`); same-revision re-application is idempotent
  counter copies. No host self-desync path exists.

### (3) RED tests fail on base — PASS with F3

Verified stash-free via `git show origin/.../pass93-candidate`:

- `src/multiplayer-relay.ts` absent on base → `src/multiplayer-relay.test.ts`
  (62 lines, new) reds on base by missing import. Genuine but thin: it pins new
  helpers, it does not reproduce the base bug behaviorally.
- `applyGuestCombatInventoryProjection`, `killstreakDamageSourceCueForVictim`,
  `acceptRemoteReloadResult`, `createCanonicalRemoteState(admittedIncoming`
  all absent on base (grep count 0) → the guest-combat, killstreak, hf499, and
  hf504 reload/swap string pins red on base. Base `sendRemoteReloadResult` used
  `network.sendToPlayer(playerId, result)` and base `switchWeapon` had no
  `network.send(createStateMessage())` — the exact RELAY-GAP and swap-silence.
- F3 (test weakness, fix before ship): the new hf504 swap test asserts
  `guestView.toContain('remote.snapshot = { ...remote.snapshot, weapon:')`,
  but that string already occurs 3× on base (railgun paths, `:13200`, `:18020`,
  `:18448`) — the expect is vacuous and green on base. Smallest fix: retarget it
  at the swap-path effect already asserted beside it
  (`applyRemoteInventoryProjectionToMaps(` — genuine, 0 hits on base) or drop it.

### (4) Victim label covers every killstreak type — PASS

- `killstreakDamageSourceCueForVictim` (`src/killstreak-awareness.ts:420-428`)
  is type-agnostic: it selects any receipt event addressed to
  `(victimId, lifeId)` and delegates to `killstreakDamageSourceCue`, whose label
  comes from `KILLSTREAK_DISPLAY_LABELS[event.source]` — typed
  `Record<Pass65KillstreakId, string>` (`:28`), hence exhaustive at compile time
  (`tsc` green per REPORT). The non-controller receipt path stores the cue
  before damage application (`src/legacy-main.ts:13069`), and the stale-life
  guard now precedes dedup insertion (`:24714-24716`), so an old-life receipt
  can no longer poison the result set for any source type.

### (5) Rejoin latency epoch keying — PASS (implicit, note)

- `damageAfterRejoin` (`scripts/qa/mp-soak-gate.mjs:393-413`) reads `beforeHp`
  from the host view after `scenarioRejoin` completes, so the baseline is
  post-rejoin by construction; the hook's `storedAfter < storedBefore` is
  synchronous with the mutation. There is no explicit connection-epoch tag on
  the sample — keying is positional (fresh baseline), not nominal (epoch id).
  Acceptable: the compared HP delta cannot predate the rejoin. Optional
  hardening: record the post-rejoin epoch in `bundle.rejoin.damage` for
  auditability. Not ship-blocking.
- The actual base gap per REPORT was the missing canonical broadcast after the
  authoritative health mutation; the fix broadcasts it (`:36567`). Confirmed
  present; the soak loop then measures observer delivery normally.

### (6) Loosened tests / ratchet ceiling — PASS with note

- No test was loosened: every test-file hunk in the diff is a pure addition
  (`+21/+7/+25/+13/+62`, zero deletions); all 13 deletions sit in
  `src/legacy-main.ts`. The new hf499/hf504 pins assert presence, never absence.
- Soak-gate note (reviewed, acceptable): `firstSeen.host = 0`
  (`scripts/qa/mp-soak-gate.mjs:406`) credits the host row without polling.
  This cannot relax the published bound: `maxLatencyMs` is the max over peers,
  the host term is pinned at 0, and the host's own mutation was always locally
  visible in ~0–20 ms anyway. Guest rows are still measured through `peerViews`
  against the post-rejoin baseline. Not a green-paint.
- Ratchet: `LINE_CEILING = 37_396` unchanged (no diff to
  `src/legacy-main-size-ratchet.test.ts`); file is exactly 37,396 lines
  (base 37,384, +12 net). The 58-line relay helper surface was extracted to
  `src/multiplayer-relay.ts` — precisely the ratchet-preferred pattern
  ("extract the new code into its own module (preferred)"). Correctly hoisted.

### F2 (REPORT prose nit, fix with F1/F3)

- REPORT §Reload claims the host result goes "to every admitted peer except the
  claimant". The code calls `network.send(result)` with no exclusion
  (`src/legacy-main.ts:6362`; cache-hit path `:6483`), so the claimant receives
  it too — necessarily, since `acceptLocalReloadResult` is the claimant's own
  commit path. Behavior is correct; correct the sentence to "to every admitted
  peer, claimant included".

## Evidence gates (as claimed, not re-run per task constraints)

- Task forbade builds/browsers/GPU; `tsc`, Vitest, soak-contract, and
  `git diff --check` outcomes are taken from REPORT.md as [VERIFIED] lane
  claims. `git diff --check ...pass93-candidate...HEAD` re-verified clean here.
- Browser audit rows remain [OPEN] by the lane's own account; no live
  SWAP/RELOAD/RELAY-GAP clearance is claimed by this review.
