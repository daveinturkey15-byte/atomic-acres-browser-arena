# PASS 95 — adversarial verify of `contrib/dave-gaming-pc/claude/mp-weapon-pickup`

Verifier: Claude Opus 5, adversarial pass over the lane's own claims.
Base: `8d6b41f2` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate` less 2).
Lane head at time of verify: `8c3545d3`.
Method: re-run every quoted gate, diff every changed `*.test.ts` and every
tolerance constant for weakening, attack host authority, attack idempotency,
check per-frame allocation and the size ratchet, and try to break each VERIFIED
claim-state in the REPORT.

## VERDICT: DO-NOT-SHIP

Not because the code is bad — the unit work here is unusually strong and I could
not break its host authority. Because the one gate that would have exercised any
of it end-to-end does not reproduce, and while looking for that I found an
unlisted regression in the exact behaviour the lane exists to fix.

## Reason 1 — the quoted e2e gate does not reproduce, and now fails *earlier*

Gate `[6]`, `scripts/qa/verify-hf504-pickup-race.mjs`, was re-run once
(headless installed Chrome, `PASS73_NATIVE_WEBGPU=1`, ports 4204/4205 only,
3 browsers, `:4300` left untouched — another lane holds it).

| step | lane's quoted run | this verify |
| --- | --- | --- |
| `servers-up` / `booted` / `room-open` / `three-joined` / `arena-synced` | reached | reached |
| `deployed` | reached | **never reached** |
| `drop-spawned` / `staged` / `raced` | reached, all race assertions `false` | never reached |

```
[hf504] arena-synced
[hf504] FAILED {"failure":"page.waitForFunction: Timeout 150000ms exceeded."}
```

The lane was honest about its run: it labelled the result a negative, diagnosed
its own harness, and explicitly did **not** claim the race as passing. That
honesty is why this is reason 1 and not reason 3 — the finding is not that a
green gate went red, it is that **the only end-to-end evidence this lane has is
not reproducible**, so every wire-level claim rests on unit tests alone. Three
host-authority behaviours (replay on a lost ack, the 700 ms resend, the sight
gate) have never been observed on a real datagram.

Confirmed while checking this, in the lane's favour:

- The harness diagnosis in OPEN-1 is **correct**. `__ATOMIC_ACRES_DEBUG__.spawnDeathDrop`
  (`legacy-main.ts:36767`) calls `spawnDeathDrop(...)` on the calling page and
  sends no `death` message, so the guests' `deathDrops` genuinely stay empty.
  The real path (`legacy-main.ts:16668`) spawns on every role from one broadcast
  `death`, and the drop id derives from `message.nonce`, so both roles agree.
- **`dist` was fresh**, not the stale-build trap: `dist/` built 22:37:21,
  `src/legacy-main.ts` last written 22:32:58. The driver refuses to run without
  a build rather than silently making one.
- The driver released 4204/4205 and left no browser behind. My re-run
  overwrote the gitignored `artifacts/qa/pass95/mp-weapon-pickup/race.json`; the
  lane's numbers survive in the REPORT.

## Reason 2 — an unlisted regression, in the symptom the lane is fixing

`visibleDeathDropWeaponPickup` takes the single nearest eligible drop from
`selectDeathDropWeaponPickup` and *then* sight-tests it, returning `null` when
it is blocked. `selectDeathDropWeaponPickup` → `nearestDeathDrop` returns one
drop and there is no fallback. So with two guns inside
`DEATH_DROP_INTERACTION_RANGE` (2.35 m; `MAX_DEATH_DROPS` is 12 and drops
cluster where fights happen), the nearer occluded and the farther in the open,
the player gets **no prompt and a dead F key** for a pickup the host would
accept. The lane replaced "the wrong gun is offered through a wall" with "the
right gun is withheld".

Compounding it, the sight gate itself is unvalidated against real drop
placement. Its trace convention *is* honestly identical to the shipped
`acceptTimedMapWeaponClaim` gate — body-origin to `drop + 0.25` — but that gate
only traces to curated authored pedestals, while a death drop lands wherever a
player fell, including flush against a collider, where a near-floor segment is
much likelier to false-block. A false block here **prevents** a pickup. The e2e
that would have caught either problem never reached a spawned drop.

(Prose nit, fixed: the comment on `deathDropSightBlocked` and the handoff both
said "eye-to-gun". It is body-origin — `camera.position.y` adds the stance eye
offset on top of `player.position` at `legacy-main.ts:27406`.)

Recorded as REPORT TODO 8 and 9. Not fixed here: the correct fix sight-filters
the candidate set before selecting, and the naive form runs a collider trace per
drop on a path that executes twice per frame. That needs a range pre-filter and
a test, not a hasty edit from the verifier.

## Reason 3 — everything else the lane claimed holds, including under attack

Every non-e2e gate reproduced, most of them stronger than quoted:

| gate | quoted | reproduced |
| --- | --- | --- |
| `npx tsc --noEmit` | exit 0, no diagnostics | exit 0, **zero output lines** (checked with a real exit code, not `$?` after a pipe) |
| requested vitest gate | 40 files / 468 tests | superset run: **50 files / 611 tests passed** |
| network + protocol | 7 files / 109 tests | **7 / 109** exactly |
| `src/weapon-pickup-authority.test.ts` | 27 tests | **27** exactly |
| size ratchet | passed unchanged | file untouched in the diff, **still green** — and still green after my edit |

**No assertion was weakened and no ceiling was raised.** I diffed every changed
`*.test.ts`. The only test changes in the whole lane are the protocol pin
`18 → 20` in three files and one renamed test title. `legacy-main-size-ratchet`
and `weapon-display-name-contract` are not in the diff at all, so claim `[5]`
holds structurally: the display-name contract could not have been weakened, and
the prose was renamed instead.

**Host authority: I could not break it.**

- A guest cannot mint. `acceptLocalPickupResult` sets
  `player.primaryWeapon = message.combatInventory.primary.weapon` — the host's
  projection — never `message.weapon`; and `consumeDeathDropWeapon` transfers
  `drop.weapon`, never the requested id.
- A replay cannot be steered. Resolutions are keyed `(playerId, nonce)` and
  prefix-safe; a replayed result carrying a mismatched `dropId` is dropped by
  the guest's `pending.dropId !== message.dropId` guard, and the attacker would
  in any case converge on the host's canonical inventory.
- The ledger is bounded: TTL 15 s, cap 256, oldest-first eviction, cleared on
  `removeRemote` and `clearDeathDrops`.
- Nonce collision across guests is not a live hazard: `randomNonce()` is
  `performance.now() * 1000 + protocolRandom() * 1e6`.
- Tolerances were **moved, not widened** — 0.5 / 2.8 / 2.5 are byte-identical to
  the code they replaced.

**The protocol-version skip is sound, and I tried hard to refute it.** My
hypothesis was that skipping to 20 leaves 19 inside an N-1 tolerance window and
so actively admits the very HF-498 schema the lane is defending against. It does
not: admission is strict equality (`initialLobbyJoinHasProtocolMismatch` returns
`true` for `- 1`; `isGameMessage` rejects `- 1` in six places), so v19 and v20
reject each other. **One stated fact was stale, though**, and I corrected it in
the REPORT: `mp-bugs-hf498` **is** on origin, at `2b0c304e`, and it takes
version **19** — which confirms the lane's prediction empirically. No
renumbering is needed; merge HF-498 first and resolve every conflict to 20.

## Fixed on the branch by this verify

- `src/legacy-main.ts` — per-frame allocation on the HUD path.
  `deathDropSightBlocked` did `dropPosition.clone().add(new THREE.Vector3(...))`
  and `visibleDeathDropWeaponPickup` allocated a third `THREE.Vector3`.
  `updateFInteractionPrompt` reaches `fInteractionCandidates` twice per frame,
  so that was six `THREE.Vector3` per frame while any gun was in reach. Both are
  module scratch now. No semantic change; `tsc` clean, ratchet still green.
- The "eye-to-gun" comment corrected to body-origin.
- `REPORT.md` — the stale HF-498 fact corrected with evidence, and TODOs 8–11
  added.

## What would flip this to SHIP

1. One race run where `bothGuestsSeeTheDrop` **and** `exactlyOneWinner` are both
   true — which needs the driver to trigger a real broadcast death, not the
   local-only debug hook.
2. TODO 8 fixed with a test: an occluded nearest drop must fall through to a
   reachable farther one.
3. Evidence that the sight gate does not false-block a gun resting against a
   collider (TODO 9).
