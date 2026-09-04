# VERIFY — adversarial verification of `mp-lobby-overhaul` (HF-504, PASS 95)

Verifier run 2026-09-04 on `contrib/dave-gaming-pc/claude/mp-lobby-overhaul`
in worktree `C:/Users/david/projects/aa-wf-lobby`, against lane head
`7a73be8d`. No install, no rebuild, one headless e2e run on the lane's own
ports. Nothing outside this worktree was touched.

## VERDICT: SHIP-WITH-FIXES

Every gate the lane quoted reproduces exactly. Two real defects were found in
the succession fallback wiring — the one code path the lane's headline claim
rests on — and both are fixed on this branch at **net zero lines**, so the
size ratchet stayed at 37,396 and was not raised.

### Reason 1 — all four quoted gates reproduce, byte for byte

| Gate | Lane claimed | Verifier measured |
| --- | --- | --- |
| `npx tsc --noEmit` | TSC=0 | TSC=0 |
| brief glob vitest | 15 files / 178 tests | 15 files / 178 tests |
| migration/succession vitest | 7 files / 229 tests | 7 files / 229 tests |
| `pass95-lobby-roles-host-controls.spec.ts`, installed Chrome headless, `QA_EXTERNAL_PREVIEW=1`, preview 4201 / PeerJS 4202 | 1 passed | **1 passed (15.1 s test, 38.8 s wall)** |

The e2e ran against a `vite preview` this verifier owned on 4201 and stopped
afterwards; ports 4201–4203 were free before and after and `:4300` was never
touched. The lane's note about Playwright's 180 s `webServer` ceiling is
accurate: the built `dist/channels/pass94` bundle already contains
`data-lobby-kick`, so an external preview serves the lane's own code and the
run needs no cold build.

No test file, threshold, fence or gate was weakened: the lane's diff touches
exactly six files and modifies **no** pre-existing `*.test.ts`. `LINE_CEILING`
is untouched at 37,396 — it was already 37,396 at the merge base `b6bb8e07`
(set by PASS 94 candidate 4b) with the file at 37,312, so the lane spent
inherited slack rather than raising anything. The Pass 72 source-scanning
reset contract holds: `if (network.role !== 'host') return;` is still the
first statement of the `#lobby-reset` handler, with `authorizeRoomClose`
behind it. `lobby-kick` is genuinely host-authority — `network.ts:1171` drops
`isHostAuthorityMessage(payload)` on a guest connection before any handler
runs — so a guest can neither mint nor relay one.

### Reason 2 — the succession fallback discarded everything `promoteRetained` preserved (FIXED)

`promoteRetained` is correct and well tested. Its **call site was not**. In
`adoptMirroredHostAuthority` the lane wrote `privateLobbySnapshot =
fallback.snapshot;` and then called `broadcastHostLobby(...)`, which rebuilds
the snapshot from module state (`hostSnapshot()` reads `privateLobbyRevision`,
`privateMatchConfig`, `authoritativeScores`, `hostLobbyMembers`) and
**overwrites `privateLobbySnapshot` one call later**. So the assignment was
dead and none of the preserved fields reached the wire. Two consequences, both
falsifying the claim the fallback exists to make:

- **The room would not have continued.** `broadcastHostLobby` sends
  `privateLobbyRevision + 1`. A guest never increments that counter — both
  `+= 1` sites are host-only — so a promoted guest broadcasts revision **1**,
  while every follower holds the departed host's revision *N*.
  `acceptLobbyState` opens with `if (privateLobbySnapshot &&
  message.snapshot.revision < privateLobbySnapshot.revision) return;`, so every
  guest silently drops the successor's first snapshot. `retainLobbySnapshot`
  refuses it for the same reason. The room freezes on a dead host.
- **Every score would have reset to zero.** `hostSnapshot` builds `scores`
  from `authoritativeScores`, which on a peer that has never hosted is empty,
  so it emits `emptyPlayerScore(id)` per member.

Fix on this branch: carry `fallback.snapshot.revision`, `.config` and
`.scores` into the module state `broadcastHostLobby` rebuilds from, and drop
the dead assignment. The host-clock base is deliberately **not** carried — it
is the departed host's `performance.now()` origin and only
`resolveHostMatchResumeTiming` can translate it, which is exactly what the
failed `initializeRecoveredHostLobby` was doing.

### Reason 3 — the rolling copy was room-agnostic and could never be refreshed (FIXED)

`retainedLobbySnapshot` was a module-level `let` written in exactly one place
(`acceptLobbyState`) and **reset nowhere**. `LobbySnapshot` carries no room
code, and `retainLobbySnapshot` keeps the higher revision. So after leaving a
room and joining another — where `resetPrivateLobbyState()` restarts
`privateLobbyRevision` at 0 — the retained copy stays frozen on the *previous*
room for the rest of the page session and can never be replaced. A fallback
promotion in the new room would have re-registered the **old** room's roster,
config, phase and scores and broadcast them as authoritative.

Fix on this branch: `retainedLobbySnapshot = null` in
`resetPrivateLobbyState()`, which both `#host` and `#join` call before every
room entry.

## Claims REFUTED (report accuracy, not code)

1. **REPORT §2, host migration**: *"Now the room continues: … revision advances
   by one, and every other member row, every score, the config, the phase and
   both match-start clocks carry forward untouched."* This was true of the pure
   function and false of the shipped wiring (Reason 2). After the fix it is
   true of revision, config, scores, roster and phase, and **still false of
   `activeAtHostTimeMs`**, which is re-read from this peer's own
   `privateMatchActiveAtHostTimeMs`; `matchClock`, `testDummies` and
   `domination` are likewise re-sampled by `hostSnapshot`, not carried. The
   correct claim-state for the end-to-end handoff is **DESIGNED**.
2. **REPORT §4, unit coverage**: the case listed as *"**a guest cannot forge a
   migration** — a promotion claim is host-authority traffic"* asserts nothing
   about a promotion message. Its body checks `electHostSuccessor`
   determinism, `guestShouldHonorKick` on a forged **kick**, and
   `authorizeLobbyKick` refusing a client. The underlying property is real but
   belongs to HF-325 (`isHostSuccessionProtocolMessage` inside
   `isHostAuthorityMessage`, `protocol.ts:1409`), not to new coverage in this
   lane. The test name overstates what the test proves.
3. **REPORT §4, "whole-roster projection"**: `lobbySeats` has **zero callers**
   outside its own module and test — `renderPrivateLobby` calls
   `resolveSeatRole` per row directly. Tested code that does not ship.

## TODO for the next lane (recorded, not fixed here)

- **T1.** Re-run the lobby e2e after a fresh `vite build`. This verifier's run
  used the pre-fix build already in `dist/`; the fixes touch only the import
  block, `resetPrivateLobbyState` and the succession fallback (none on the
  e2e's path) and `tsc` is green, but the built bundle is now behind HEAD.
- **T2.** The lane's own OPEN items 1, 2 and 4 stand unchanged: no browser
  host-migration run, no measured "continues within one snapshot interval", no
  guest-forged `lobby-kick` from a real browser. Items 1 and 2 now matter more,
  not less: Reason 2 is precisely the class of defect a browser migration run
  would have caught and a unit gate structurally cannot.
- **T3.** Carry the match clocks properly through the fallback, or state in
  the code that it resumes the room but not the authoritative match clock.
- **T4.** The KICK affordance renders in every phase, including `active`. Decide
  whether a mid-match kick is intended; the e2e only covers `waiting`.
- **T5.** `hostKickMember` schedules `network.disconnectPlayer(targetId)` on a
  bare 75 ms `setTimeout` to let the broadcast flush. Unowned timer, no
  cancellation if the room closes first.
- **T6.** Pre-existing and unrelated: `npm run qa:text-integrity` reds on
  `docs/evidence/pass94/nuketown2-ballistics/gate-tsc.txt: is unexpectedly
  empty`. Present at the merge base; not this lane's.
