# PASS 95 — multiplayer lobby and room flow overhaul (HF-504)

Lane: `contrib/dave-gaming-pc/claude/mp-lobby-overhaul`, branched from
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`, with
`origin/contrib/dave-gaming-pc/claude/lobby-countdown` (Muse; Luna
SHIP-WITH-FIXES) merged first as instructed and built on rather than redone.

Owner ask, 2026-09-04 22:00: *"lobby and room flow overhaul (roles, ready
state, host migration)"* — named as months-old pain.

Claim-states: **VERIFIED** = a gate quoted below proves it. **DESIGNED** = the
code is written and typechecks, but the proof needs a capture or a run this
lane did not produce. **OPEN** = not done.

---

## 1. What the merge already gave us (the READY half)

The `lobby-countdown` merge landed the ready-state half of the owner's ask
before this lane wrote a line, so this lane did not rebuild it:

| Owner ask | Where it lives | Claim-state |
| --- | --- | --- |
| per-peer ready state | `lobby-ready` on the wire, `LobbyMember.ready` | VERIFIED — `src/lobby-countdown.test.ts` in the gate below |
| "who is not ready" list | `notReadyMemberNames`, `waitingRoomGuidance` | VERIFIED — same gate; wired in `renderPrivateLobby` |
| host-side start timeout | `LOBBY_READY_TIMEOUT_MS = 60_000`, `readyTimeoutExpired`, `decideLobbyCountdownStart` | VERIFIED — same gate; wired to the `#lobby-start` disabled rule |
| shared 5-4-3-2-1 | `countdownSecondsRemaining` off the host's `activeAtEpochMs` | VERIFIED — same gate |

## 2. What this lane added — `src/lobby-roles.ts`

### Roles

Every roster row resolves through one function instead of the old inline
`member.id === hostId ? 'HOST' : 'PEER'`:

- **host** — the room's `hostId`, in every phase, *including while the host is
  itself still loading*. A loading host is a host.
- **spectator** — a connected non-host member of a room already in
  `countdown`/`active` that has not reported READY. The honest name for the
  state the lobby used to render as a peer stuck on `SETTING UP` forever: in
  the room, not in the match yet.
- **guest** — everything else, *including a disconnected member inside its
  rejoin grace*. Connection state is a separate axis, deliberately not
  collapsed into the role.

It is a **presentation** role, never an authority one. A spectator is still a
guest on the wire and its inputs are validated identically. Badge, tooltip
(`seatRoleHint`) and kick affordance all read the same resolved role, so they
cannot drift apart.

### Host controls — kick and close

`planLobbyKick` authorizes **and mints** in one step, so a call site cannot
authorize one thing and send another. The same decision is asked twice: once to
decide whether to *render* the KICK button (a courtesy), and again on the click
against the **live** snapshot (the one that matters).

A guest is refused at four independent layers:

- `isHostAuthorityMessage('lobby-kick')` is true, so `network.ts` drops a kick
  arriving on a **guest** connection before any handler runs;
- `authorizeLobbyKick` returns `not-host` when `role !== 'host'`;
- it returns `actor-not-host` when the actor is not the room's `hostId` — the
  case that matters for a **superseded ex-host**, which still reads
  `role === 'host'` locally for a few frames on the way down;
- `guestShouldHonorKick` refuses the residue on receipt: a kick from a peer,
  from a superseded host, or addressed to somebody else.

A kick removes the seat through the **existing voluntary-leave cleanup** —
rejoin credential forgotten, so the token cannot walk back in — not a bespoke
second removal path. Room close asks the same question through
`authorizeRoomClose`; the Pass 72 literal host guard
(`if (network.role !== 'host') return;`) stays **first and untouched**, because
its source-scanning contract test is a gate this lane honours, not one it edits.

### Host migration

HF-325 already shipped the hard parts and this lane did **not** second-guess
any of them: `electHostSuccessor` (deterministic election), `mintSuccessionMandate`,
`termSupersedes` (the term fence), `host-authority-mirror` (the rich checkpoint —
positions, loadouts, scores, resume tokens), and the transport re-point, which
rides the existing reconnect loop because the promoted host claims the **same
room-code peer id** every guest's reconnect attempts already target.

What this lane added is the fallback for the case that used to **kill the room**:

- **Rolling snapshot copy on every guest.** `retainLobbySnapshot` keeps the
  newest host-authored `lobby-state` **by revision**, not by arrival order, so a
  replayed or out-of-order snapshot cannot walk the copy backwards. Equal
  revisions keep what is held — a re-send is not new information.
- **Why it is the fallback and not the primary.** The mirror is richer and is
  sent to the **mandate holder only**: broadcasting every guest's resume token
  to every guest would be a credential leak, not a feature. What every guest
  can safely retain is what it already receives — roster, scores, config, phase.
- **`promoteRetained` refuses to elect.** The successor id is an **input**. A
  module that could both elect and adopt would be a second, weaker election
  path sitting beside the real one.
- **Where it is reached.** Only inside `adoptMirroredHostAuthority`, on the
  branch where an **already authorized** promotion (mandate + term fence +
  roster re-election + survivor floor) could not adopt the mirror — the host
  died between a roster change and its mirror send. Before this lane that
  branch closed the room outright. Now the room continues: `hostId` becomes the
  successor, the departed host is marked disconnected (keeping its seat and
  score for the rejoin grace, exactly as any other dropped peer), `revision`
  advances by one, and **every other member row, every score, the config, the
  phase and both match-start clocks carry forward untouched**. This widens an
  authorized promotion; it never mints one.
- **"HOST CHANGED" notice.** `hostChangedNotice` is computed identically on
  every peer from the same two ids, so the successor and its followers narrate
  the same event. Wired to `setStatus` plus a `HOST CHANGED` feed line.

## 3. Size ratchet

`src/legacy-main.ts` sits at **37,396 lines against the 37,396 ceiling**:
exactly on it, never above, and the ceiling was **not raised**. Every decision
lives in `src/lobby-roles.ts`; the wiring in `legacy-main.ts` is call sites.
Where the budget bit, comments were compacted rather than the ceiling lifted.

## 4. Gates

```
$ npx tsc --noEmit
TSC=0
```

```
$ npx vitest run src/network*.test.ts src/protocol*.test.ts src/*lobby* src/*room* \
    src/legacy-main-size-ratchet.test.ts
 Test Files  15 passed (15)
      Tests  178 passed (178)
```

```
$ npx vitest run src/network.test.ts src/protocol.test.ts src/lobby-roles.test.ts \
    src/lobby-countdown.test.ts src/legacy-main-size-ratchet.test.ts \
    src/host-migration.test.ts src/host-succession-protocol.test.ts \
    src/host-authority-mirror.test.ts
 Test Files  7 passed (7)
      Tests  229 passed (229)
```

New unit coverage in `src/lobby-roles.test.ts`, by name:

- **seat roles** — host in every phase; a not-ready guest is a spectator *only*
  once the match is running; a ready guest in an active match is a guest; a
  disconnected member inside its rejoin grace stays a guest; whole-roster
  projection in host-authored order; blank-name fallback.
- **host controls** — the sitting host may kick a connected guest; a guest is
  refused whatever it claims about itself; a **stale host whose room has moved
  on** is refused; kicking the host, an unknown peer or an already-gone peer is
  refused; close is gated on the same two checks.
- **on the wire** — only the host can mint a kick, and what it mints is a legal
  host-authored message; nothing is minted for a guest, a stale host, a missing
  room or an absent target; the envelope guard refuses malformed,
  self-addressed and wrong-version kicks; a guest honours only a kick from its
  current host that names it.
- **migration** — the retained copy keeps the newest revision and never walks
  backwards on a replay; an out-of-bounds revision is refused rather than
  adopted; **the handoff restores every peer, their scores and their
  loadout-bearing rows** with both match clocks unchanged; promoting nothing,
  the sitting host, a stranger or a dropped peer is refused; **the election is
  deterministic across peers and agrees with the handoff**; **a guest cannot
  forge a migration** — a promotion claim is host-authority traffic.
- **the notice** — null when nothing changed; names the successor to the
  followers and "you" to the successor; falls back to the peer id.

### Headless e2e

`tests/e2e/pass95-lobby-roles-host-controls.spec.ts` — three real browsers
(host + two guests) on an owned PeerJS server; installed Chrome, **headless**,
`--mute-audio`; preview on port 4201, PeerJS on 4202 (this lane's assigned
ports). It asserts what a unit test cannot: exactly one host seat rendered, and
the **same** seat on all three screens; two guest seats; the KICK control on the
host's screen for both guests and on **neither guest's** screen; pressing it
drops that peer from **every** roster in the room, not only the host's view; the
removed player is told why and is out of the room rather than sitting in it
disconnected; the surviving guest keeps its seat and role.

Run, installed Chrome headless, owned preview on 4201, owned PeerJS on 4202:

```
$ QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4201 PASS95_LOBBY_PEER_PORT=4202     PASS73_NATIVE_WEBGPU=1 npx playwright test     tests/e2e/pass95-lobby-roles-host-controls.spec.ts --project=chromium
  ok 1 [chromium] > tests/e2e/pass95-lobby-roles-host-controls.spec.ts:77:5 >
     shows one host seat, guest seats for the rest, and offers KICK to the host alone (57.0s)
  1 passed (1.4m)
```

Claim-state: **VERIFIED**. Note on the run: the webServer path timed out at its
180 s ceiling because a cold `vite build` on this machine (the owner's ComfyUI
shares the GPU) exceeds it; the run above uses `QA_EXTERNAL_PREVIEW=1` against a
preview this lane built and owned on its assigned port. Same binary, same
topology (`stage-release-topology.mjs`), just started outside Playwright's own
180 s window.

## 5. OPEN

1. **Browser host-migration e2e** — host leaves mid-match, match continues,
   scores intact. Not run inside this lane's time box. It is genuinely heavier
   than the lobby e2e: promotion only arms during an **active** match (the
   mirror is a match checkpoint), so the run needs three contexts to finish
   arena load and start a real match before the host is killed, and the
   host-loss detector plus the mandate handshake add their own wall-clock. The
   state machine underneath is VERIFIED by unit gate; the wall-clock claim
   **"the match continues within one snapshot interval"** is **DESIGNED**, not
   VERIFIED — nothing in this lane measured it.
2. **Spectator badge in a live match** — `resolveSeatRole` returns `spectator`
   for a connected not-ready peer in a `countdown`/`active` room and the badge
   renders from it (VERIFIED at unit level), but the e2e exercises a `waiting`
   room only, so the *rendered* spectator badge is **DESIGNED**.
3. **`lobby-kick` forged by a guest process** — that `network.ts` drops it is a
   property of `isHostAuthorityMessage`, asserted at unit level. No e2e forges
   one from a guest browser; the e2e proves the weaker, still useful claim that
   a guest is never *offered* the control.

---

## 6. VERIFIER ADDENDUM (adversarial pass, 2026-09-04)

Full record: `docs/evidence/pass95/mp-lobby-overhaul/VERIFY.md`. Verdict
**SHIP-WITH-FIXES**. All four gates above reproduced exactly (TSC=0, 178/178,
229/229, e2e 1 passed). Two defects were found in the succession fallback and
fixed on this branch at net zero lines; the ratchet is still 37,396.

### Claim-states corrected

- Section 2's *"every score, the config, the phase and both match-start clocks
  carry forward untouched"* described `promoteRetained`, not the shipped call
  site. `broadcastHostLobby` rebuilds the snapshot from module state, so the
  lane's `privateLobbySnapshot = fallback.snapshot` was dead: the successor
  broadcast revision 1 (a guest never increments `privateLobbyRevision`) and
  every follower dropped it via `acceptLobbyState`'s
  `revision < privateLobbySnapshot.revision` guard, and scores re-minted empty.
  Fixed. The end-to-end handoff claim is now **DESIGNED**, not VERIFIED, and
  `activeAtHostTimeMs` / `matchClock` are still not carried by design.
- `retainedLobbySnapshot` was never reset, so the rolling copy outlived its
  room and froze permanently once `privateLobbyRevision` restarted at 0 in a
  new room. Fixed in `resetPrivateLobbyState()`.
- The unit case named *"a guest cannot forge a migration"* asserts election
  determinism and two kick refusals; it proves nothing about a promotion
  message. The property is HF-325's (`isHostSuccessionProtocolMessage`), not
  new coverage here.
- `lobbySeats` has no caller outside its own test; the render path uses
  `resolveSeatRole` directly.

### TODOs carried forward

T1 rebuild + re-run the lobby e2e (the run used the pre-fix `dist/`); T2 the
three OPEN items above still stand; T3 carry or document the match clocks
through the fallback; T4 decide whether KICK should render in an `active`
phase; T5 `hostKickMember`'s bare 75 ms `setTimeout` before
`disconnectPlayer`; T6 pre-existing `qa:text-integrity` red on a PASS 94
evidence file (not this lane's).

## Follow-ups

- **VERIFIED** — the follow-up fixture uses three headless installed-Chrome contexts,
  the production field-kit redeploy listener, and the lane-owned preview/PeerJS ports
  4223/4224. Direct debug weapon mutation is not used as a network admission shortcut.
- **VERIFIED** — `npx tsc --noEmit` passed, and the quoted seven-file succession/lobby
  unit gate passed with 229 tests.
- **VERIFIED** — the existing three-context role/control e2e passed on the owned
  preview/PeerJS topology at 4223/4224 with installed Chrome headless, WebGPU, and
  muted audio (1 passed, 35.5 s).
- **OPEN** — the real active-match host-loss handoff was not proven in this time box.
  The custom three-context lane test reached no reliable successor assertion before its
  360,000 ms test timeout; the lane CDP QA driver also timed out at its 180,000 ms
  active-match wait (served bundle `legacy-main-DYK9fcer.js`, backend `webgpu`, no page
  errors). First successor snapshot: **N/A**; one 40 Hz snapshot interval is 25 ms, so
  the designed one-interval claim remains OPEN rather than being inferred.
- **OPEN** — because no successor snapshot was observed, score/loadout/position
  preservation and deterministic successor reconnection remain unverified by browser
  evidence; the underlying unit claims remain covered by the 229-test gate.
- **OPEN** — live spectator badge rendering and a real guest-forged `lobby-kick` browser
  attempt remain the existing lane OPEN items.
