# Muse review — multiplayer bugs lane (HF-498)

Scope: `contrib/dave-gaming-pc/claude/mp-bugs-hf498`, `3e2fd273..HEAD`
(`3bd59a0b` reload acks, `26207d0a` stair muzzle, `c457aaab` respawn handoff).
Read: full `src`/`scripts` diff (16 files, +740/−64), `docs/evidence/pass94/mp-bugs/REPORT.md`,
`src/hf498-multiplayer-bugs.test.ts`, `scripts/qa/mp-lab/run-hf498-multiplayer-bugs.mjs`.
No builds, no browsers, no test runs; static review only. No `src/` modified by this review.

## Claim-states

### (1) Can a guest still lose a reload? — VERIFIED: no silent loss; bounded worst case
- Ack path traced end to end: `reload()` (`src/legacy-main.ts:19359`) creates a
  `LocalReloadPending` with a stable `reloadRequestId(epoch, life, seq, 'start')`
  (`src/local-reload-authority.ts:115`), sends via `sendLocalReloadIntent`
  (`src/legacy-main.ts:6324`), and `scheduleLocalReloadRetry` re-sends the same
  key every 350 ms while the same pending is live (identity check on
  `requestId`, `src/legacy-main.ts:6310`). Retry is safe by construction.
- Host dedupe is ordered correctly: `acceptRemoteReloadIntent` checks
  `remoteReloadResultCache` keyed `player:epoch:life:requestId`
  (`src/legacy-main.ts:6289,6500`) **before** the strict
  `actionSequence === last+1` admission in `admitGuestReloadIntent`
  (`src/guest-reload-authority.ts:67`). A retransmission therefore replays the
  cached `started`/`committed`/`rejected` instead of failing `action-sequence`.
  First arrival admits; loss of the first arrival is covered by the retry.
- Guest matching is key-exact: `sequenceMatches`
  (`src/local-reload-authority.ts:167`) requires both sequence AND `requestId`
  (cancel has its own `cancelRequestId` lane); `acceptLocalReloadResult`
  (`src/legacy-main.ts:6557`) drops cross-epoch/cross-life results, keeps the
  pending on `started` (and reschedules the retry), and on terminal results
  clears the pending and applies the host projection through the revision gate
  (`applyLocalCombatInventoryProjection`, `src/legacy-main.ts:6263`, rejects
  stale/equal revisions). Late `committed` after local expiry still applies the
  projection (`apply-projection-only`) without resurrecting the pending — ammo
  converges instead of bricking.
- The cancel race is handled explicitly, not accidentally: a commit at the start
  sequence stays authoritative while a cancel is in flight
  (`src/local-reload-authority.ts:167`, `cancelRequested` one-shot,
  `src/local-reload-authority.ts:99`). `reload()` refuses to stack a second
  attempt while a pending lives, and expiry (2 s grace) / stale-life clearing
  carries a diagnostic (`src/local-reload-authority.ts:139,157`). Worst case is
  a bounded ~2 s stall with a named reason, then reconciliation — never a
  permanently lost reload.

### (2) Can stale weapon state survive a respawn? — VERIFIED for the reported bug, with one narrow edge (F2)
- Local death-respawn (`respawn()`, `src/legacy-main.ts:17358` region) forces
  `player.weapon = authored primary`, replenishes `ammo`/`reserve` to full class
  caps for the deployment loadout, and resets `reloadState = null`,
  `switchingUntil = 0`, `pendingLocalPickup = null`, plus
  `clearExpiredLocalReloadAuthority()` on a new life (stale-life wins over
  expiry). A zero-ammo railgun held at death cannot persist as the armed weapon.
- Host remote admission treats death-to-life as a host-owned boundary:
  `respawnLoadout` is seeded from the host-retained snapshot class fields, not
  the guest packet (`src/legacy-main.ts:13560`), `resetRemoteCombatInventory`
  rebuilds ammo/reserve from the authored primary, and the reload authority is
  recreated when `state.lifeId !== remote.continuity`
  (`src/legacy-main.ts:6513`), with in-flight commit timers guarded on
  `actionSequence`/`requestId`/`epoch` match. A stale railgun/swap/depleted
  packet is overwritten or dropped (explicit railgun-holder and primary-change
  guards follow at `~13632`). Guest packets remain observations.
- Edge, not the reported bug: pre-death pickup authorizations and the reload
  result cache are not scoped out at the life boundary (see F1/F2). Neither
  resurrects the depleted railgun; both are follow-ups.

### (3) Stair admission admits only a truly clear muzzle? — VERIFIED, one fail-open note (F3)
- The gate refuses fire iff the authored muzzle socket is inside a probed
  surface half-space: `weaponView.root.updateWorldMatrix` →
  `muzzleWorldPosition()` → `viewmodelMuzzleInsideSurfaceClip(muzzle, planes)`
  (`src/legacy-main.ts:19527`, predicate
  `src/systems/viewmodel-surface-clip.ts:385`). The planes come from the
  existing surface-clip probe over colliders + dressing + ground
  (`currentViewmodelSurfaceClipPlanes`, `src/legacy-main.ts:11716` region).
  No stair/collider-class branch exists, so stairs stop blocking while a
  muzzle-in-solid still refuses. The pure predicate is pinned by the stair-side
  unit test (`src/hf498-multiplayer-bugs.test.ts:26`: clear at x=0.4, blocked at
  x=0.65). This is a muzzle-in-solid gate, not a line-of-fire check — a muzzle
  in open air with a wall ahead correctly fires (and hits the wall) rather than
  refusing. No shooting *through* geometry is introduced: any box containing the
  muzzle is within the probe's eye reach (1.4 m;
  `src/systems/viewmodel-surface-clip.ts:99`), and the muzzle sits <1 m from
  the eye.

### (4) Guests remain untrusted? — VERIFIED
- Host validates every reload intent against host truth: epoch from
  `hostLobbyConnectionEpochs`, life from `remote.continuity`, weapon from
  `remote.snapshot.weapon`, `alive`, and mag/reserve via the `WEAPONS` spec
  (`src/guest-reload-authority.ts:67`; non-ordinary weapons rejected before
  admission, `src/legacy-main.ts:6505`). Death-respawn loadout ignores guest
  fields. Magazine transfer commits only via the host reload transaction;
  client-selected splits in state packets are observation-only. Protocol 19
  `requestId` is format-validated (`src/protocol.ts:1197,1208`); the local key
  derivation hashes the epoch (FNV lanes) instead of exposing it
  (`src/local-reload-authority.ts:115`).

### (5) Any test loosened? Are the e2e assertions real? — VERIFIED, none loosened
- Test diff only extends fixtures to the new contract: version ratchets 18→19
  (three files, required), `requestId` added to reload fixtures, one-shot
  cancel signature updated, and two *new* negative guards
  (`requestId: undefined` rejected, `src/protocol.test.ts:465`). No threshold,
  timeout, or assertion weakened. `run-host-guest.mjs` gains only a bounded
  `--event-delay-qa-ms` (clamped 0–250) and exports `pageUrl` — harness
  capability, not a looser check.
- The e2e (`run-hf498-multiplayer-bugs.mjs`) asserts five mechanical predicates
  on live snapshots: `reloadRetrySent` (≥2 sends), `hostCacheHit`, `reloadCommitted`,
  `guestRespawnedWithPrimary`, `hostCanonicalRespawnLoadout` (carbine/pistol
  exact). Debug helpers stage state (`equipWeapon`/`setAmmo`/
  `damageRemoteAuthoritatively`), which REPORT.md discloses as host-side QA
  setup; the exercised reload/retry/admit/commit and respawn/canonicalize paths
  are the real production code. The 250 ms delay is deterministic fault
  injection applied after deploy, and the duplicate ceiling-hit run is honestly
  marked OPEN and uncounted.

## Findings (file:line + smallest fix)

- F1 (minor, memory hygiene): `remoteReloadResultCache`
  (`src/legacy-main.ts:5767`) grows without bound — every result is cached in
  `sendRemoteReloadResult` and cleared only on full match reset (`:7914`,
  `:9576`). A long match accumulates ~2 entries per reload per life; a hostile
  guest can also mint keys within the `requestId` regex. Fix: bound per player
  (e.g. keep last 8 keys; evict on `remote.continuity` change), same key
  function `remoteReloadResultCacheKey` (`:6289`).
- F2 (minor, narrow edge): `authorizedRemotePickups` (`src/legacy-main.ts:6085`)
  is never cleared on respawn — only consumed at `:13630`. A pre-death pickup
  auth whose `expiresAt` is still future and whose `weapon` equals the new
  authored primary would authorize a post-respawn primary change without a fresh
  pickup. Fix: `authorizedRemotePickups.delete(id)` wherever `respawned` is
  established in the host snapshot path (`~:13610`), mirroring
  `clearRemoteReloadAuthority`.
- F3 (observation, not a defect): muzzle gate fail-open on `null` socket
  (`src/legacy-main.ts:19529`: `!== null && …` admits when the socket is
  missing). Reachable only before the weapon view is ready, and the
  `switchingUntil` gate above it normally refuses first. Optional hardening:
  treat `null` as refuse with a distinct `fireBlock` reason.

## Verdict: SHIP-WITH-FIXES
1. The three owner faults are genuinely fixed with host-authoritative,
   idempotent mechanisms, each traced to exact lines and covered by unit + live
   host/guest evidence — the hard part of this lane is done and safe.
2. The remaining items (F1 unbounded cache, F2 stale pickup-auth edge) are
   small, well-scoped, and fix-forward in days, not a redesign — but F2 is a
   real (if narrow) trust-boundary gap, so unconditional SHIP overstates it.
3. No tests were loosened, the e2e assertions are mechanical predicates on live
   state, and the one inconclusive run was disclosed rather than counted —
   evidence handling is trustworthy, supporting ship once F1/F2 are filed.
