# REPORT — lobby all-players READY + shared 5-4-3-2-1 countdown (pass95)

Branch: `contrib/dave-gaming-pc/claude/lobby-countdown`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (3e2fd273)
Worktree: `C:/Users/david/projects/aa-muse-lobby` (sole writer)

## What was built

Host-authoritative lobby countdown. The lobby waits until every joined
player reports READY/loaded, then runs a shared 5-4-3-2-1 countdown before
the match starts. New pure module `src/lobby-countdown.ts` owns the state
machine; `src/legacy-main.ts` (+85/−4, still under the size ratchet) holds
only thin call-sites. Covered by `src/lobby-countdown.test.ts`.

- Each peer sends an explicit `lobby-ready` once its arena has booted
  (`shouldAutoSendLoaded` → `maybeAutoSendLobbyLoadedReady`, once per boot;
  the manual READY toggle stays authoritative; solo never sends).
- The host starts only when all peers are ready, or after a host-side 60 s
  READY timeout that the HUD shows (`decideLobbyCountdownStart`,
  `LOBBY_READY_TIMEOUT_MS = 60_000`; timeout never overrides a pending guest
  admission, an empty room, or over-capacity).
- The host rebroadcasts the SAME shared match-start timestamp ~1/s
  mid-countdown (`countdownTickDue` in `scheduleLobbyCountdownRefresh`);
  every client renders 5-4-3-2-1 from that timestamp, never a local timer
  (`countdownSecondsRemaining` feeds the pinned `DEPLOYING IN` title).
- Late joiners admitted during the countdown receive the same timestamp
  (existing `admitLobbyJoin` `lobby-start` send, now pinned by test).
- The HUD names who is not ready plus the force-start wait
  (`waitingRoomGuidance`, `notReadyMemberNames`).
- Solo path unchanged (`offline` returns the inert value at every entry).

## Claim states

- VERIFIED — `npx tsc --noEmit` clean:
  `TSC done` (no error lines; full output empty).
- VERIFIED — gate set green, 19 files / 212 tests:
  `Test Files  19 passed (19)` / `Tests  212 passed (212)` —
  network ×6, protocol, host-lobby-admission-generation,
  pass72-lobby-reset-contract, lobby-countdown (new), legacy-main-size-ratchet,
  private-match, build-identity-handshake, host-match-recovery,
  match-admission, match-presentation, match-countdown ×3.
- VERIFIED — `src/legacy-main.ts` 37,312 lines ≤ 37,396 ceiling
  (`legacy-main-size-ratchet.test.ts` green in the run above).
- VERIFIED — adjacent red gate repaired without touching the gate:
  `build-identity-handshake.test.ts` pins the countdown surface in
  legacy-main; the refactor moved it, the test went red, and the wiring was
  changed back to the pinned shape (same math now owned by
  `countdownSecondsRemaining`). No test/threshold weakened.
- VERIFIED — OMP adoption: `PASS: OMP on dave-gaming-pc trust=trusted
  bootstrap=C:\Users\david\.omp\agent\AGENTS.md
  control_digest=7057aa9dbc70edef7fd2eacfa813c9dd48e1f9686c12aca88ded7672ace98889`.
  Power plan: High performance
  (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`) verified before work.
- DESIGNED (needs a headed capture) — the 60 s timeout HUD line, the
  DEPLOYING IN 5..1 title, and the auto-READY on arena boot are unit-tested
  and gate-green but never booted in a browser this run: no browsers per the
  brief (owner running ComfyUI, no GPU). Needs a two-client host+guest run
  per HF-403 before release claims.
- OPEN — spec text arrived truncated at "Keep the existing…", so no
  PASS84 ledger rows were named in the brief; HF-403 (host+guest lobby) and
  HF-404 (smooth) were used as the applicable rows. The named memory
  'atomic-acres-lobby-and-load-goals' was not found in the AKP ledger
  (`akp_ledger.py find` returned only unrelated hits); the task text itself
  was implemented verbatim.

## Three.js source priority (HF-481)

No new rendering technique adopted: pure netcode/HUD-logic change, no
material, pipeline, or present-surface touched (per-instance rule and
precompile reach unaffected). Installed `three` checked: 0.185.1 (matches
the r185 brief). Points 1–3 consulted only to confirm irrelevance: no
upstream lookup needed, no recipe written. Measurement: the gates above
(212 tests, tsc, ratchet).

## Files changed

- `src/lobby-countdown.ts` (new) — pure state machine + HUD strings.
- `src/lobby-countdown.test.ts` (new) — ready set, timeout, tick
  timestamps, guest-can-never-start, late-join timestamp, HUD strings,
  loaded signal, solo inert, legacy-main wiring pins.
- `src/legacy-main.ts` (+85/−4) — import, wait-state, broadcast arming,
  timeout force-start, 1/s tick rebroadcast, auto loaded/ready, START
  unlock, guidance override, pinned countdown rendering.

## Luna review follow-ups

- TODO (owner evidence): run the HF-403 two-client host/guest flow and verify
  the same countdown timestamp, timeout unlock, late-join delivery, and guest
  rejection against live transport. Static host-authority and timestamp wiring
  are verified here; no browser or network was run by this review.
- TODO (owner evidence): capture the countdown HUD and auto-READY transition
  in the real lobby. Unit and source-contract gates pass, but rendered/browser
  behavior remains unclaimed under the review constraint.
