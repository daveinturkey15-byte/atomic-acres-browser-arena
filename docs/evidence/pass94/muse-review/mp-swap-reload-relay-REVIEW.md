# Muse review — mp-swap-reload-relay (pass95, HF-498/504; retry)

Skeptical review of `contrib/dave-gaming-pc/claude/mp-swap-reload-relay`
vs `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Method: read-only (`git show` against the base; no stash, no checkout,
no build, no browser, no install per task constraints).
Worktree at review time: branch as requested, HEAD `70b932cd`
(one docs commit past `a9b4b029`; no source delta between them),
`git status` clean, no `index.lock`, `git diff --check` clean.
Scope read: `AGENTS.md`, `docs/evidence/pass95/mp-swap-reload-relay/REPORT.md`,
`src/network.ts`, `src/protocol.ts`, full diff (12 files, 463 insertions,
13 deletions, evidence docs included).

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. Both replication defects are genuinely fixed under host authority: swap
   rides the client→host state lane with admission validation plus canonical
   host rebroadcast (`src/legacy-main.ts:19221`, `:13628`, `:13664-13665`),
   and the reload RELAY-GAP is closed by fanning the host result to all peers
   (`src/legacy-main.ts:6362`, cache-hit `:6483`) with a disjoint
   claimant/observer split on receipt (`:6535-6544`, `:6547-6548`).
2. The biomass is honest: all 13 deletions sit in `src/legacy-main.ts`;
   every test-file hunk is a pure addition (zero weakened assertions);
   `src/legacy-main.ts` sits exactly at the 37,396-line ceiling with the new
   58-line relay surface correctly extracted to `src/multiplayer-relay.ts`
   instead of raising the ratchet; the soak-gate delta cannot relax the
   published latency bound (max over peers, host term pinned at 0).
3. Two findings should land before publish — F1 (host rebroadcasts a
   guest-claimed equipped weapon without allow-listing it against the
   admitted pair; presentation spoof, no ammo authority gained) and F2 (one
   new source-text assertion is vacuous on base) — plus one REPORT prose
   correction (F3). None blocks the underlying design; all have smallest
   fixes below.

## Check results

### (1) Host-authoritative relay — PASS with F1

- Guest→host only: client `network.send()` transmits state solely on host
  connections (`src/network.ts:847-862`); the host fans out via
  `broadcast(message, exceptPlayerId)` (`:849-850`, `:1639-1645`).
  Guests never relay each other.
- `reload-intent` is consumed inside the host-claim branch
  (`src/network.ts:1318-1322`), before the generic
  `broadcast(payload, playerId)` at `:1326`. A guest intent reaches only
  the host; only the host's result fans out.
- Reload intent validation (unchanged, confirmed present):
  claimant/ledger/epoch presence (`src/legacy-main.ts:6469-6473`),
  result-cache dedup keyed on `(by, connectionEpoch, lifeId, requestId)`
  (`:6474-6485`), `isOrdinaryWeapon` gate (`:6486-6489`), then
  `admitGuestReloadIntent` with host-side weapon/alive/timing/inventory
  (`:6496-6504`). Expiry/life scoping re-derives authority per epoch
  (`:6491-6494`).
- Swap validation: a `primary` change requires respawn or an unexpired
  authorized pickup or the host corrects the claimant and drops the claim
  (`:13563-13576`); `secondary`/`grenade` changes are rejected outright
  (`:13577-13578`). Swap and reload-start emit client boundary state packets
  (`:19221`, `:19252`) so observers do not wait on heartbeat coalescing.
- F1 (minor, fix before ship): the equipped `snapshot.weapon` is not
  allow-listed against the admitted `{primary, secondary}` pair. Only
  `railgun` and timed-map weapons are holder-fenced (`:13560-13562`); an
  ordinary claimed weapon (e.g. `sniper` over an `m4a1/pistol` loadout)
  passes every gate, is stored (`:13628`), and is rebroadcast in the
  canonical state (`:13664-13665`). Blast radius is bounded — ammo authority
  stays in the host ledger, projections are pair-keyed and caps-checked
  (`src/guest-combat-inventory-authority.ts:129-159`), the protocol
  validator pins `combatInventory.primary.weapon === player.primary`
  (`src/protocol.ts:874-879`), and trigger authority resets on change
  (`:13582`) — so this is a peer-presentation spoof, not an ammo/fire
  bug. Smallest fix: before building `canonicalState`, reject-or-clamp
  `admittedIncoming.weapon` to the admitted pair
  (`remote.snapshot.primary`, `remoteLoadoutSidearm(remote.snapshot)`).

### (2) Observer projection vs self ammo — PASS

- Self and observer receipt paths are disjoint by guard:
  `acceptLocalReloadResult` requires `forPlayerId === player.id` plus
  `connectionEpoch` and `lifeId` match (`:6547-6548`);
  `acceptRemoteReloadResult` returns early when
  `forPlayerId === player.id` and additionally requires `by === hostId`
  and `lifeId === remote.continuity` (diff hunk `:6535-6544`). The host
  takes neither path (`role !== 'client'`) — no double-apply on the host.
- The state-lane projection applies only when `role === 'client'` and only
  into the per-remote ledger maps (`:13629-13631`); local `player` ammo is
  never touched. Stale projections are fenced by the revision guard
  (`src/multiplayer-relay.ts:26`); same-revision re-application is an
  idempotent counter copy. No host self-desync path exists.

### (3) RED tests fail on base — PASS with F2

Verified stash-free via `git show origin/.../pass93-candidate`:

- `src/multiplayer-relay.ts` is absent on base → the new
  `src/multiplayer-relay.test.ts` reds on base at the import. Genuine but
  thin: it pins the new helpers, it does not reproduce base behavior.
- `applyGuestCombatInventoryProjection`, `killstreakDamageSourceCueForVictim`,
  `acceptRemoteReloadResult`, and `createCanonicalRemoteState(admittedIncoming`
  all grep 0 hits on base; base `sendRemoteReloadResult` used
  `network.sendToPlayer(playerId, result)` and base `switchWeapon` had no
  `network.send(createStateMessage())` — the exact RELAY-GAP and swap
  silence. The hf499/hf504 string pins on those call sites are genuine REDs.
- F2 (test weakness, fix before ship): the new hf504 swap test asserts
  `guestView.toContain('remote.snapshot = { ...remote.snapshot, weapon:')`
  where `guestView` is the whole `onNetworkMessage` body — but that string
  already occurs 3× on base (railgun paths, base `:13188`, `:18011`,
  `:18439`), so the expect is vacuous and green on base. Smallest fix:
  retarget it at the swap-path effect asserted beside it
  (`applyRemoteInventoryProjectionToMaps(`, genuine, 0 hits on base) or
  drop the line.

### (4) Victim label covers every killstreak type — PASS

- `killstreakDamageSourceCueForVictim`
  (`src/killstreak-awareness.ts:420-428`) is type-agnostic: it selects the
  first receipt event addressed to `(victimId, lifeId)` and delegates to
  `killstreakDamageSourceCue`, whose label comes from
  `KILLSTREAK_DISPLAY_LABELS[event.source]` — typed
  `Record<Pass65KillstreakId, string>` (`:28-41`, all 12 ids), hence
  exhaustive at compile time (`tsc` green per REPORT). The non-controller
  receipt path stores the cue before damage application
  (`src/legacy-main.ts:13066-13083`), and the stale-life guard now precedes
  dedup insertion (`:24711-24722`), so an old-life receipt cannot poison
  the result set for any source type.

### (5) Rejoin latency epoch keying — PASS (implicit, note)

- `damageAfterRejoin` (`scripts/qa/mp-soak-gate.mjs:396-422`) runs after
  `scenarioRejoin` and reads `beforeHp` from the host view post-rejoin, so
  the baseline is post-rejoin by construction; the hook's
  `storedAfter < storedBefore` is synchronous with the mutation. There is no
  nominal connection-epoch tag on the damage sample — keying is positional
  (fresh baseline), not nominal (epoch id). Acceptable: the measured HP
  delta cannot predate the rejoin. The reload path, where stale-epoch
  confusion would actually bite, is nominally keyed: `localConnectionEpoch`
  regenerates on join/reconnect (`src/legacy-main.ts:7885`, `:9012`) and
  the self result path rejects mismatches (`:6547-6548`).
- The actual base gap per REPORT was the missing canonical broadcast after
  the authoritative health mutation; the fix broadcasts it (`:36564-36567`,
  hunk `+if (remote) network.send(createCanonicalRemoteState(...))`).
  Confirmed present; the soak loop then measures observer delivery normally.

### (6) Loosened tests / ratchet ceiling — PASS with note

- No test was loosened: every test-file hunk in the diff is a pure
  addition; all 13 deletions sit in `src/legacy-main.ts`. The new
  hf499/hf504 pins assert presence, never absence; no threshold, timeout,
  or tolerance was touched.
- Soak-gate note (reviewed, acceptable): `firstSeen.host = 0`
  (`scripts/qa/mp-soak-gate.mjs:406`) credits the host row without polling.
  This cannot relax the published bound: `maxLatencyMs` is the max over all
  peers, the host term is pinned at 0, and the host's own mutation was
  always locally visible in ~0 ms anyway (the hook updates the host
  snapshot synchronously). Guest rows are still measured through
  `peerViews` against the post-rejoin baseline. Not green-paint.
- Ratchet: no diff to the size-ratchet test; file is exactly 37,396 lines.
  The 58-line relay helper surface was extracted to `src/multiplayer-relay.ts`
  — the ratchet-preferred pattern — rather than raising the ceiling.
  Correctly hoisted.

### F3 (REPORT prose nit, fix with F1/F2)

- REPORT §Reload says the host result goes "to every admitted peer except
  the claimant". The code calls `network.send(result)` with no exclusion
  (`src/legacy-main.ts:6359-6362`; cache-hit path `:6480-6484`), so the
  claimant receives it too — necessarily, since `acceptLocalReloadResult`
  is the claimant's own commit path. Behavior is correct; correct the
  sentence to "to every admitted peer, claimant included".

## Evidence gates (as claimed, not re-run per task constraints)

- Task forbade builds/browsers/GPU; `tsc`, Vitest, soak-contract, and
  `git diff --check` outcomes are taken from REPORT.md as lane claims
  (`[VERIFIED]`/`[CLAIMED]`/`[OPEN]` as marked there). `git diff --check`
  across the review base was additionally re-verified clean here.
- Browser audit rows remain `[OPEN]` by the lane's own account (§Browser
  audit; one permitted `mp-audit.mjs` run correctly not started). No live
  SWAP/RELOAD/RELAY-GAP clearance is claimed by this review; a permitted
  three-peer browser audit is still required to convert the source/unit
  evidence into live findings clearance.
