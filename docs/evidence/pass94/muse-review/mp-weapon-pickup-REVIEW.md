# PASS 95 — third review: `contrib/dave-gaming-pc/claude/mp-weapon-pickup` (HF-504)

Reviewer: Muse Spark 1.3 (third pair of eyes; no builds, no browsers, no GPU).
Date: 2026-09-04. Lane head: `f77994aa`. Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Read: `docs/evidence/pass95/mp-weapon-pickup/REPORT.md`, `VERIFY.md` (verdict DO-NOT-SHIP),
full diff base..HEAD, `src/weapon-pickup-authority.ts`, `src/death-drops.ts`,
`src/legacy-main.ts` pickup/death paths, `src/network.ts` ingress, race driver
`scripts/qa/verify-hf504-pickup-race.mjs`, audit register
`origin/contrib/dave-gaming-pc/claude/mp-audit-hf504:docs/evidence/pass94/mp-audit/DEFECTS.md`,
P-3/P-4 fix commit `19c6e3d4` on branch `contrib/dave-gaming-pc/claude/mp-audit-todos`
(NOT in this lane: `git merge-base --is-ancestor 19c6e3d4 HEAD` is false).
No Luna follow-up commits are in this lane (log is the 4 build commits + `f77994aa` verify; tree clean).

## VERDICT: DO-NOT-SHIP

Agrees with the Opus verifier, on partly new grounds. The unit work is strong and the
REPORT is honest, but the lane still withholds a gun it should offer, still replicates
drops by local derivation instead of host broadcast, and still leaves the known
guest-to-guest pickup rows open. Three reasons:

1. **The e2e race is still undecided, and the undecided part hides a real gap, not just a harness bug**
   (finding F-1). Fixing the driver alone (real broadcast kill) will likely surface P-6
   content divergence (`weapon-mismatch` / `drop-distance` rejections) the lane never addresses.
2. **TODO 8 is a live regression in the lane's own symptom** (finding F-4): an occluded nearest
   drop now suppresses a reachable farther one — no prompt, dead F key — where the host would
   have accepted the farther gun. In a "cannot pick up guns" lane this is blocking.
3. **P-3 / P-4 (and the P-1 rejection path) are still open in this lane** (findings F-5, F-6):
   raw `pickup` claims are still relayed guest-to-guest, `pickup-result` is still unicast,
   and a rejected claimant still restores its own stale drop instead of adopting the host's
   canonical record. The fix exists — commit `19c6e3d4` on `mp-audit-todos` — but nothing in
   this diff ports it, so three-peer pickup replication remains unobserved and unrepaired.

## Findings

### F-1. `bothGuestsSeeTheDrop:false` is a harness defect AND a real replication gap

- Harness defect, confirmed: the debug hook `__ATOMIC_ACRES_DEBUG__.spawnDeathDrop`
  (`src/legacy-main.ts:36780-36786`) calls `spawnDeathDrop(...)` on the calling page only
  and sends no `death` message. The real path broadcasts one `death` message and every role
  runs `processDeath` → `spawnDeathDrop(message)` (`src/legacy-main.ts:16681`) with the shared
  id `death-${message.nonce}` (`src/legacy-main.ts:15110`). So the verifier's diagnosis is
  correct as far as it goes: guests' `deathDrops` stayed empty because nothing was broadcast.
- Real gap the verifier left undecided: drop **content** is derived per-peer from the local
  view, never replicated. `deathDropVictim` (`src/legacy-main.ts:15094-15107`) reads the
  victim's weapon/position from local `player.position`, `remotes.get(...).snapshot`, or
  `bots.get(...).position`; the ammo payload uses the host ledger only on the host
  (`src/legacy-main.ts:15122-15127`, `deathDropPayload` in `src/weapon-pickup-authority.ts:246-259`).
  This is audit row P-6 ("every peer spawns its own copy; ids match, content does not").
  A real broadcast kill gives both guests the same id but potentially different
  weapon/position/ammo, i.e. `weapon-mismatch` / `drop-distance` rejections the fixed driver
  would then hit. There is no host broadcast of ground-weapon state anywhere in this diff.
- Smallest fix (driver first, then game): stage the race with a real kill (or a QA hook that
  sends the `death` message, not a local `spawnDeathDrop` call); then, if P-6 bites, have the
  host's `death` broadcast carry (or be followed by) the canonical drop content and make guests
  adopt it in `spawnDeathDrop` instead of deriving from the local view.

### F-2. Idempotency keys survive a lost ack — with three residual holes, one load-bearing

What holds (`src/weapon-pickup-authority.ts:109-179`, `src/legacy-main.ts:15677-15682,15824-15831`):
repeat `(playerId, nonce)` replays the original resolution with the host's *current*
canonical inventory and the stored ground-state delta; TTL 15 s outlives the 700 ms resend /
1,500 ms revert schedule (`:121-122,201-202,208-218`); guest resends the identical request
(`src/legacy-main.ts:15648-15651`); rejected replays stay rejected so a retry cannot mint a
second gun. The double-pick-after-lost-ack the old `rejected: duplicate` path caused is closed
for the weapon-pickup path.

- (a) **Eviction of a live entry reopens the old divergence** (`src/weapon-pickup-authority.ts:161-179`,
  `src/legacy-main.ts:15683-15687`). Cap is 256 with oldest-first eviction; a nonce flood can
  evict a genuinely pending resolution, after which the resend falls through to the global
  `processedNonces` check and is answered `rejected: 'duplicate'` — the exact answer this lane
  removed — and the guest reverts a won gun. Adversarial and narrow, but it is the same wrong
  answer, reachable by design. Smallest fix: consulted `processedNonces` only for nonces never
  resolved (or scope it per player), and on a `processedNonces` hit for a `(playerId, nonce)`
  with no ledger entry, prefer a safe no-revert (e.g. re-project current inventory) over a
  state-restoring `duplicate` rejection; at minimum pin the behavior with a test.
- (b) **`processedNonces` is global while ledger keys are per-player** (`src/legacy-main.ts:15683`,
  `pickupRequestKey` at `src/weapon-pickup-authority.ts:130-132`). Guest B reusing guest A's
  numeric nonce is answered `duplicate` even though the ledger would correctly treat it as a new
  request. Collision odds are negligible (`randomNonce()` mixes `performance.now()` with
  randomness — verifier's point stands), so: no fix needed, noted for the record.
- (c) **Key prefix is colon-joined and `forgetPlayerPickupResolutions` is prefix-deleted**
  (`src/weapon-pickup-authority.ts:130-132,182-189`). A player id containing `:` (e.g. `ab:1`)
  collides with another (`ab`, nonce parsing aside — keys are `ab:1:2` vs `ab:`-prefixed delete
  sweeping it). Current ids (UUIDs/lobby codes) contain no colons. No fix needed; do not build
  ids with colons.
- (d) **Scavenge has no idempotency at all** (`src/legacy-main.ts:15438-15477` vs `15643-15666`).
  `autoScavengeDeathDrop` sends once with a fresh nonce, keeps no `pendingLocalPickup`, and the
  result handler's `pending === null` branch is the audit's P-5 force-switch. A lost scavenge ack
  still costs the scavenge (or worse, applies unobserved). Smallest fix: give scavenge the same
  pending/resend/revert record as weapon pickups, or explicitly document it as out of scope —
  the REPORT claims "a repeated request was answered duplicate" is fixed, but that is only true
  for `mode: 'weapon'`.

### F-3. Drop-on-death spawns exactly one entity per id — but it is not host-owned

What holds: id is `death-${message.nonce}` and a duplicate delivery returns the existing entity
(`src/legacy-main.ts:15109-15112`); send sites add `death.nonce` to `processedNonces`
(`:14666,18818,20765,21066,24846`); `MAX_DEATH_DROPS` / 30 s expiry / round-clear bound the set.
Exactly-one-entity-per-id: yes.

Host-owned: no. Every role spawns its own copy from its local view (F-1, audit P-6); the host
copy is authoritative only in the sense that `acceptRemotePickup` transacts against it. The
REPORT's "drops carry the victim's remaining ammunition" is true of the host's copy
(`src/legacy-main.ts:15122-15127`); a guest's copy of the same id still carries the invented
fraction or a stale snapshot's remainder. Smallest fix: as F-1 — replicate the canonical drop
content from the host (P-6 fix). Until then, "exactly one host-owned entity" overstates the
invariant; the true invariant is "at most one entity per id per peer".

### F-4. The HUD prompt is necessary but not sufficient for host acceptance — and TODO 8 is real

`visibleDeathDropWeaponPickup` (`src/legacy-main.ts:15351-15363`) is genuinely the single local
eligibility for both prompt (`fInteractionCandidates`, `:23788-23793`) and action
(`interactWithDeathDrop`, `:15367`), and the sight predicate is the same trace the host runs
(`deathDropSightBlocked`, body-origin → drop + 0.25, scratch vectors after the verify fix).
That half of the REPORT's claim checks out.

The other direction — "never shown for a request the host would refuse" — does not:

- (a) **Occluded-nearest suppression (REPORT TODO 8, VERIFY reason 2): confirmed live.**
  `selectDeathDropWeaponPickup` → `nearestDeathDrop` returns one drop
  (`src/death-drops.ts:121-135`); `visibleDeathDropWeaponPickup` sight-tests only that one and
  returns `null` when blocked (`src/legacy-main.ts:15353-15362`) with no fallback. Two guns in
  2.35 m, nearer behind a wall and farther in the open: no prompt, dead F key, for a pickup
  `acceptRemotePickup` would accept. The host evaluates per-requested-drop
  (`src/legacy-main.ts:15689-15728`), so it has no such suppression. Smallest fix (as the
  REPORT already prescribes, not done here): sight-filter the range pre-filtered candidate set
  *before* nearest-select in `selectDeathDropWeaponPickup` (or a sight-aware selector used by
  `visibleDeathDropWeaponPickup` only), plus the falsifier test REPORT TODO 8 names: two drops
  in range, nearer occluded, prompt still offered for the farther. Keep the range pre-filter
  first — the naive per-drop trace runs on a twice-per-frame HUD path.
- (b) **TOCTOU between prompt and host check.** The prompt tests the live `player.position`;
  the host tests the stamped `message.position` against bounds, its replicated sender snapshot
  (2.8 m), range, and sight (`src/legacy-main.ts:15714-15724`). A player who prompts then moves
  (or whose replica lags) can be offered a pickup the host rejects with `sender-distance` /
  `drop-distance` / `line-of-sight`. Pre-existing and bounded, but the "HUD never offers what
  the host would refuse" claim should be scoped to a stationary peer.
- (c) **Prompt ignores non-geometric refusals by design.** Expiry/consumed state is shared via
  `deathDropWeaponPickupAvailable`, but `no-inventory`, `grenade-state`/`grenade-grant`,
  `weapon-mismatch`, and the 2 s `authorizedRemotePickups` window (`:15821`) exist only
  host-side. Correct layering (prompt cannot know them), but again the claim needs scoping.

### F-5. P-3 / P-4 (host-validated relay) remain for `mp-audit-todos` — nothing in this lane closes them

- Raw `pickup` is **not** in the host-ingress allow-list (`src/network.ts:1190-1204`), so a
  guest's claim falls through to `this.onMessage(payload); this.broadcast(payload, playerId)`:
  every other guest receives the unvalidated claim (audit P-3, still live).
- `pickup-result` is unicast (`network.sendToPlayer(message.by, result)` at
  `src/legacy-main.ts:15554`): the other guest gets no correction channel (P-3 second half).
- Worse, guest B's ingress (`src/legacy-main.ts:13645-13648`) feeds the relayed raw claim into
  the full `acceptRemotePickup` host logic locally — no role fence at ingress or in
  `acceptRemotePickup` (`:15668`) except inside `sendRemotePickupResult`. A relayed claim makes
  guest B run admission against its own non-canonical drop copy and peer maps.
- The fix exists and is **not** in this lane: `19c6e3d4` (`mp-audit-todos`) broadcasts the
  canonical `pickup-result` to every admitted guest and makes non-claimants apply
  `applyCanonicalPickupDrop` while only the claimant touches inventory/nonce correlation.
  Port that commit (plus its `network.ts` ingress fence) rather than re-deriving it. Until
  then, three-peer pickup replication — the exact setup of the headless race — is unobserved
  and unrepaired, which independently keeps the race from deciding a winner.

### F-6. P-1 rejection path still restores stale local state (companion to F-5)

`acceptLocalPickupResult` (`src/legacy-main.ts:15618-15634`): on `rejected` it calls
`restorePendingLocalPickup(pending)` — the guest's own pre-swap snapshot — and returns,
discarding the host's canonical `message.drop` record that `sendRemotePickupResult` carefully
attached. That is audit P-1 ("a rejected pickup permanently poisons the drop"), still live:
after a legitimate rejection (`unknown-drop` aside), the guest re-renders the stale drop
verbatim and the next F-press fails identically. Smallest fix (this is the other half of the
`19c6e3d4` port): on rejection, `applyCanonicalPickupDrop(message, now)` first, then restore
inventory, and surface a `PICKUP DENIED`-style feed + diagnostic so the revert is observed,
not silent. Unit-test: rejected claim with a concurrently-consumed drop converges the guest's
ground record to the host's.

### F-7. Verifier's reason 1 stands; protocol-skip analysis stands

- Reproducibility: the lane's own run is an honest negative and the verify re-run failed
  earlier (`deployed` never reached). Nothing in this review contradicts VERIFY reason 1 —
  every wire-level claim (replay on lost ack, 700 ms resend, sight gate) still rests on unit
  tests alone. No new e2e evidence is offered here either (no GPU/browser per task bounds).
- Protocol 18→20 skip: agree with REPORT + VERIFY. Admission is strict equality
  (`initialLobbyJoinHasProtocolMismatch`, `isGameMessage` N-1 rejections), so v19 (HF-498) and
  v20 reject each other; no tolerance window is opened. Integrator instruction stands: merge
  HF-498 first, resolve conflicts to 20 including the three pinned tests
  (`src/network-lifecycle.test.ts`, `src/combat/weapon-catalog.test.ts`,
  `src/combat/legacy-weapon-adapter.test.ts`).
- Non-findings (checked, hold): reserve transfer with scavenged-payload guard and swap-back
  preservation (`src/death-drops.ts:217-247`); `evaluatePickupGeometry` fixed guard order with
  NaN-fails-closed (`src/weapon-pickup-authority.ts:86-96`); ledger bound + peer-leave/round
  clearing (`src/legacy-main.ts:15090,16816`); no weakened assertions (only test changes are
  the 18→20 pins + one renamed title); scratch-vector HUD fix is semantic-neutral.

## What remains (ordered)

1. Port `19c6e3d4` (P-3/P-4 + P-1 rejection-adopt) into this lane: broadcast
   `pickup-result`, fence raw `pickup` to host-only, non-claimant applies canonical drop,
   claimant adopts host record on rejection with a visible denied signal. (F-5, F-6.)
2. Fix occluded-nearest suppression with the REPORT TODO 8 falsifier test. (F-4a.)
3. Replicate canonical drop content from the host death broadcast (P-6); then re-run the
   headless race with a real kill until `bothGuestsSeeTheDrop && exactlyOneWinner`. (F-1, F-3.)
4. Give scavenge the same pending/resend/revert record or scope the idempotency claim to
   `mode: 'weapon'`. (F-2d.)
5. Harden the eviction-vs-live-pending path (F-2a); owed HF-504 owner-ledger row (REPORT OPEN-4);
   sight-gate false-block evidence vs floor-resting drops (REPORT TODO 9); WAN measurement of
   the 700/1,500 ms schedule (REPORT OPEN-7).
