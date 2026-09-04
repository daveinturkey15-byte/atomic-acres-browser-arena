# PASS 95 — HF-504 host-authoritative weapon pickup

Date: 2026-09-04
Lane: `contrib/dave-gaming-pc/claude/mp-weapon-pickup`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`
Owner report (HF-504): "cannot reload or pick up guns" — for months.

## Claim states

| State | Claim | Evidence |
| --- | --- | --- |
| VERIFIED | Typecheck clean | `npx tsc --noEmit` gives TSC_EXIT=0, no output |
| VERIFIED | Requested Vitest gate green, size ratchet included | `Test Files 40 passed (40) / Tests 468 passed (468)` |
| VERIFIED | All network + protocol suites green | `Test Files 7 passed (7) / Tests 109 passed (109)` |
| VERIFIED | 27 new pickup-authority tests | `src/weapon-pickup-authority.test.ts` |
| VERIFIED | The display-name contract caught this lane's prose and was obeyed, not weakened | `weapon-display-name-contract.test.ts` flagged the retired fictional label pattern in two of this lane's files; the prose was renamed |
| DESIGNED | Three-client headless race (host + 2 guests, one gun) | Driver at `scripts/qa/verify-hf504-pickup-race.mjs`; run state in `artifacts/qa/pass95/mp-weapon-pickup/race.json` |
| OPEN | No HF-504 row exists in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` on this base | `grep -rn HF-504 docs/` returns nothing; the row is owed |
| OPEN | Protocol-version collision with the concurrent HF-498 reload lane | see "Wire version" |

## The four defects

All four are host-authority defects, and each one alone loses the gun.

### 1. The transferred reserve was a hard `0` - the headline symptom

`consumeDeathDropWeapon` (`src/death-drops.ts`) built the picker's new inventory
with `reserve: 0`. The host spawns a death drop with
`Math.max(1, Math.ceil(spec.reserve * 0.25))` rounds (`spawnDeathDrop`,
`src/legacy-main.ts`), and every one of them was discarded at the moment of
transfer. A picked-up gun therefore arrived with one magazine and nothing to
reload from - exactly "cannot reload ... guns".

Fix: the reserve on the ground transfers with the weapon, clamped to the
weapon's own cap, and only when the drop's ammunition payload has not already
been scavenged. Nothing is duplicated: the same call overwrites the drop with
the magazine and reserve of the gun the picker handed over.

### 2. A repeated request was answered `rejected: duplicate`

The host recorded consumed nonces in one global `processedNonces` set (cleared
wholesale at 512 entries) and answered any repeat with
`status: 'rejected', reason: 'duplicate'`. The guest's rejection path
*restores the pre-swap inventory*. So a request the host **accepted**, whose
result was lost or arrived after the guest's 1,500 ms deadline, became a guest
that gave back a gun the host had already handed over. The two sides then
disagreed about the guest's primary weapon, and the 2 s `authorizedRemotePickups`
window began rejecting the guest's own snapshots.

Fix: a `(playerId, nonce)` to resolution ledger
(`src/weapon-pickup-authority.ts`). A repeat replays the original answer -
accepted replays accepted, rejected replays rejected - with the host's *current*
canonical inventory and the same ground-state delta. TTL 15 s (longer than the
guest's whole retry schedule), capped at 256 entries with oldest-first eviction
so a guest inventing nonces cannot grow it, dropped wholesale when the peer
leaves or the drops are cleared.

### 3. The guest sent once and reverted

One lost datagram cost the pickup even against a healthy host. The guest now
resends the identical request at 700 ms - same nonce, so the host replays
rather than re-executes - and reverts at the unchanged 1,500 ms deadline. The
deadline was not relaxed; a retry was inserted before it.

### 4. The host checked range but not sight

`acceptTimedMapWeaponClaim` has always traced eye-to-pickup against the world
colliders. The ground-weapon path checked radius only, so a gun on the far side
of a wall was reachable. Weapon pickups are now sight-gated by the same trace,
and - the part that matters to a player - *the same predicate feeds the F
prompt*, so the HUD never offers a pickup the host would refuse
(`visibleDeathDropWeaponPickup` is the single local eligibility used by both the
prompt and the action). Scavenging is deliberately **not** sight-gated: it is a
contact action inside 1.05 m performed standing on the corpse.

### Also: drops carry the victim's remaining ammunition

`spawnDeathDrop` always invented `ceil(mag*0.5)` / `ceil(reserve*0.25)`
regardless of what the victim had left. Where the host holds that peer's
canonical ledger (`remoteCombatInventories`, i.e. every remote peer) the drop
now carries the real remainder, clamped to the weapon and floored at one round
in the magazine. Bots have no ledger and keep the historical fraction, so their
loot economy is unchanged. Nothing is minted - the victim's ledger is the source.

## Where the decisions live

`src/weapon-pickup-authority.ts` is pure: no DOM, no GPU, no peer. The host's
THREE.js and collider reads stay in `legacy-main.ts`; the *decisions* - guard
order, replay, retry timing, drop payload - are in the module so they are
testable. `evaluatePickupGeometry` returns the **first** failed guard in a fixed
order (bounds, sender drift, range, sight), so a rejection names the guard that
actually failed rather than the last one evaluated.

## Guest input is untrusted

Everything a guest controls is re-derived or bounded host-side:

- the stamped position is checked against the host's **replicated** position for
  that peer (2.8 m), so a guest cannot teleport its claim next to a distant gun;
- the requested weapon id is never transferred - `consumeDeathDropWeapon` moves
  `drop.weapon`, so a guest asking for a minigun gets whatever is on the ground
  (and the `weapon-mismatch` guard rejects it first);
- non-finite distances fail closed (`<=` against NaN is false), pinned by test;
- the resolution ledger is keyed by `(playerId, nonce)` and prefix-safe, so one
  guest cannot replay another's pickup;
- the ledger is capped, so a flood of fabricated nonces cannot grow host memory.

## Tests

`src/weapon-pickup-authority.test.ts` - 27 tests:

- **request validation**: admissible case; fixed guard order; sender drift;
  range boundary at exactly +0.5 and +0.51; through-a-wall rejection and the
  scavenge exemption; the scavenge horizontal-plus-vertical window; NaN fails
  closed.
- **idempotency**: accepted replays accepted; rejected replays rejected;
  `(playerId, nonce)` scoping; TTL outlives the retry schedule (asserted as a
  relation, not a magic number); bounded under a nonce flood with the newest
  entry surviving; peer-leave clears; prefix-safe player ids.
- **two guests racing**: exactly one ak-47 exists across the winner's inventory
  and the host's ground record after the transaction; the loser's request
  against the post-transaction record cannot produce a second one; a guest
  cannot mint a weapon by naming one the drop does not hold; a consumed drop
  cannot be picked twice.
- **drop on death / reload after pickup**: payload carries the victim's
  remainder, clamped, floored; bots keep the historical fraction; the drop's
  reserve transfers so the first reload is possible; no ammunition is duplicated
  across the swap; a scavenged drop gives no reserve; a swap keeps per-session
  state so the surrendered gun stays pickable and a swap-back restores it.
- **retry schedule**: wait, resend once, revert at the unchanged deadline; the
  1,500 ms revert is pinned so it cannot be relaxed later.

## Gate quotes

```
$ npx tsc --noEmit
TSC_EXIT=0

$ npx vitest run src/weapon-pickup-authority.test.ts src/death-drops.test.ts \
    src/*weapon*.test.ts src/*pickup*.test.ts src/*loadout*.test.ts \
    src/network-lifecycle.test.ts src/protocol.test.ts \
    src/legacy-main-size-ratchet.test.ts \
    src/combat/weapon-catalog.test.ts src/combat/legacy-weapon-adapter.test.ts
 Test Files  40 passed (40)
      Tests  468 passed (468)

$ npx vitest run src/network-*.test.ts src/protocol.test.ts
 Test Files  7 passed (7)
      Tests  109 passed (109)
```

The `legacy-main.ts` size ratchet passed unchanged - it was not hoisted or
raised by this lane.

## Headless race - ran, and returned an honest negative

`scripts/qa/verify-hf504-pickup-race.mjs` - one host and two guests through the
real menu and a real PeerJS join, installed Chrome headless, stock flags, muted,
off-screen, ports 4204 (dist) and 4205 (signalling) only. Artifact:
`artifacts/qa/pass95/mp-weapon-pickup/race.json`.

The run reached the race. Quoted from the driver:

```
[hf504] booted {"host":"webgpu","guest-a":"webgpu","guest-b":"webgpu"}
[hf504] room-open {"codeLength":36}
[hf504] three-joined
[hf504] arena-synced
[hf504] deployed
[hf504] drop-spawned {"dropId":"death-137849111","hostPose":[-16,1.698...,-24]}
[hf504] staged {"seen":false,"prompts":["F","F"]}
[hf504] raced {"bothGuestsSeeTheDrop":false,"promptOfferedToBoth":false,
               "exactlyOneWinner":false,"winner":null,"loserKeptItsWeapon":true,
               "hostGroundCopies":1,"hostCarriedCopies":1,
               "noWeaponMinted":true,"noPageErrors":true}
```

**What this does and does not establish.** VERIFIED by the run: three real
clients boot on WebGPU, join three-up over a real PeerJS server, sync the arena
and deploy into an active match with no page errors, and the host's canonical
ground record never contains a second copy of the contested weapon. NOT
established: the race itself. `bothGuestsSeeTheDrop:false` is a **harness**
defect, not a game defect - the debug hook
`__ATOMIC_ACRES_DEBUG__.spawnDeathDrop()` calls `spawnDeathDrop` on the calling
page only and broadcasts no death message, so the guests' own `deathDrops` lists
stayed empty and their F press had nothing local to select. A real death
broadcasts a `death` message and both roles spawn the same `death-<nonce>` id.

The driver therefore needs a real kill (or a QA hook that broadcasts) before it
can decide the race, and this lane does not claim the race as passing. The
racing behaviour it was meant to prove is covered at unit level in
`src/weapon-pickup-authority.test.ts` ("HF-504 two guests racing for one gun").

Two harness faults were found and fixed inside the driver, not in the game: a
1024x576 viewport let the arena lede intercept the `#host` click (mp-lab's
1280x720 does not), and keep-alive sockets from three clients kept the static
server's `close()` pending forever, so the driver held its own port against the
next run.

The approach to the gun is staged with the debug teleport; the pickup itself
goes through the real `interactWithWeaponPickup` path and the real wire.

## Wire version - OPEN, needs an integrator decision

This lane adds the `'line-of-sight'` pickup-result reason, which is a wire
change, and bumps `MULTIPLAYER_PROTOCOL_VERSION` **18 to 20, deliberately
skipping 19**.

The concurrent HF-498 reload lane
(`contrib/dave-gaming-pc/claude/mp-bugs-hf498`, unpushed at the time of writing:
`git branch -r` lists no such ref) bumps the same constant 18 to 19 for a
*different* wire change (a `requestId` on reload intent/result). If both lanes
landed "19", git would auto-merge the identical line into one version number
describing two incompatible schemas, and two builds would happily admit each
other. Taking 20 forces a textual conflict the integrator has to resolve.

**Whoever merges second must renumber and re-pin** the three tests that assert
the constant: `src/network-lifecycle.test.ts`,
`src/combat/weapon-catalog.test.ts`, `src/combat/legacy-weapon-adapter.test.ts`.

### PASS 95 verify — CORRECTION, and the reasoning above is confirmed

The "unpushed" statement is **stale**. `contrib/dave-gaming-pc/claude/mp-bugs-hf498`
**is on origin**, at `2b0c304e` (`docs(pass94): Muse review - multiplayer bugs
lane (HF-498)`, committed 2026-09-04 22:25:05, six minutes before this lane's
first fix commit). `git ls-remote origin` resolves it.

The lane's *reasoning* survives the correction and is now measured rather than
predicted:

- `git show 2b0c304e:src/protocol.ts` has
  `export const MULTIPLAYER_PROTOCOL_VERSION = 19`. The two lanes took **19 and
  20 — disjoint**. The auto-merge-into-one-number hazard did not occur.
- The admission check is strict equality, not an N-1 tolerance window:
  `initialLobbyJoinHasProtocolMismatch` returns `true` for
  `MULTIPLAYER_PROTOCOL_VERSION - 1` (`src/network-lifecycle.test.ts:662-663`)
  and `isGameMessage` rejects `- 1` (`src/protocol.test.ts:162` and five more).
  So a v19 build and a v20 build **reject each other**. Skipping 19 does not
  open a window that admits the HF-498 schema.

**Corrected integrator instruction.** No renumbering is required. Merge HF-498
first, then this lane, and resolve every conflict to **20** — the constant in
`src/protocol.ts` plus the three pins named above (HF-498 pins 19 in the same
three files, so each one conflicts textually, which is exactly the intended
effect). Both lanes share the base `3e2fd273`.

## Still OPEN

1. The headless race does not yet decide a winner: the driver needs a real
   death broadcast (a kill, or a QA hook that sends the `death` message) so both
   guests hold the same `death-<nonce>` drop. Falsifier: one run where
   `bothGuestsSeeTheDrop` is true and `exactlyOneWinner` is true.
2. Reload-after-pickup is proven at unit level; the e2e assertion for it never
   executed because no guest won the (undecided) race.
3. Idempotency is proven at unit level, not on the wire - the driver does not
   drop a `pickup-result` datagram to force the replay path. Falsifier: one run
   with a bounded result-drop injected after the host accepts.
4. No HF-504 row exists in the owner-feedback ledger on this base
   (`grep -rn HF-504 docs/` is empty). The row is owed.
5. Ammo boxes / consumable pickups share this same host transaction and the same
   geometry evaluator, and their guards are covered by the geometry tests, but no
   dedicated scavenge e2e was run.
6. The line-of-sight trace uses the same `activeWorldColliders()` set as the
   timed-map-weapon claim. Whether that set includes every dynamic occluder
   (deployed shields, vehicles) is unmeasured here.
7. WAN behaviour is unmeasured. The retry schedule (700 ms resend, 1,500 ms
   revert) is tuned against the pre-existing deadline, not against a measured
   round-trip distribution on a real link.

## TODO — raised by the PASS 95 adversarial verify

See `VERIFY.md` beside this file for the full verdict and evidence.

8. **TODO (blocking, unlisted regression): an occluded NEAREST drop suppresses a
   reachable second one.** `visibleDeathDropWeaponPickup` asks
   `selectDeathDropWeaponPickup` for the single nearest eligible drop and *then*
   sight-tests that one result, returning `null` if it is blocked. There is no
   fallback to the next-nearest. `selectDeathDropWeaponPickup` →
   `nearestDeathDrop` returns one drop, so with two guns inside
   `DEATH_DROP_INTERACTION_RANGE` (2.35 m, `MAX_DEATH_DROPS` is 12 and drops
   cluster where fights happen) — the nearer one behind a wall, the farther one
   in the open — the player now gets **no prompt and a dead F key**, for a
   pickup the host would have accepted. Before this lane the near gun was
   wrongly offered; after it, the legitimate gun is wrongly withheld. In a lane
   whose subject is "cannot pick up guns", this converts one wrong answer into
   another. The fix is to sight-filter the candidate set *before* selecting the
   nearest, but the naive form runs a collider trace per drop on a path that
   executes twice per frame, so it needs a range pre-filter and a test — not a
   hasty edit from a verifier. Falsifier for the current code: two drops in
   range, the nearer occluded, and a prompt still offered for the farther.
9. **TODO: the sight gate is unvalidated against real drop placement.** The
   trace convention is genuinely identical to the shipped
   `acceptTimedMapWeaponClaim` gate — body-origin (`player.position` /
   `remote.snapshot`, *not* an eye point; `camera.position.y` adds the stance
   eye offset at `legacy-main.ts:27406`) to `drop + 0.25`. But that shipped gate
   only ever traces to **curated, authored pickup pedestals**, whereas a death
   drop comes to rest wherever a player fell — flush against a wall, on stairs,
   in a doorway. A near-floor-to-near-floor segment ending 0.25 m above a gun
   that is touching a collider is materially more likely to false-block than the
   pedestal case, and a false block here *prevents* a pickup. The e2e that would
   have caught this never reached a spawned drop (item 1). Prose fixed: the
   header comment on `deathDropSightBlocked` said "eye-to-gun"; it is
   body-origin, and now says so.
10. **DONE (PASS 95 verify): per-frame allocation on the HUD path.**
    `deathDropSightBlocked` did `dropPosition.clone().add(new THREE.Vector3(...))`
    and `visibleDeathDropWeaponPickup` allocated a third `THREE.Vector3`.
    `updateFInteractionPrompt` reaches `fInteractionCandidates` **twice per
    frame** (`advanceFInteractionPress` and `selectedFInteraction`), so that was
    six `THREE.Vector3` per frame for as long as any ground weapon was in reach.
    Both are module scratch vectors now; no semantic change.
11. **TODO (low): the sight trace runs even for requests already doomed.** In
    `acceptRemotePickup` the `sightBlocked` field is evaluated eagerly inside the
    object literal, so a full `activeWorldColliders()` scan happens before the
    bounds and sender-drift guards get a chance to reject. The *reported* guard
    order is still correct (the evaluator's order decides the reason, and a test
    pins it); this is wasted work on a guest-floodable path, not a wrong answer.
