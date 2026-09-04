# MUSE REVIEW — mp-lobby-overhaul (HF-504, PASS 95), third independent pass

Reviewer: Muse Spark 1.3 (skeptical third eye, after Opus build + Opus verify).
Date: 2026-09-04. Branch: `contrib/dave-gaming-pc/claude/mp-lobby-overhaul`
at `786909a9` (verifier's own two fixes included). Base:
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Method: static trace only — no builds, no browsers, no GPU, no npm.
Scope portes: REPORT.md + VERIFY.md (verdict SHIP-WITH-FIXES, reproduced),
full 11-file diff (2067+/13-), five lanes the verifier did NOT cover.

## VERDICT: SHIP-WITH-FIXES

### Reason 1 — the steady-state paths are exact and unit-pinned
Election is a pure function of identical input (order-independent,
lexicographically-lowest connected guest); retain is revision-monotonic with
equal-revision keep-held; all five kick refusals fire on the right inputs;
`readyTimeoutExpired` is exact at the 60.000 s boundary (59.999 s holds);
`lobby-state` and `lobby-kick` are both `isHostAuthorityMessage`
(`src/protocol.ts:1422`, `:1416`) so host-ingress (`src/network.ts:1171`)
drops guest forgeries before any handler runs.

### Reason 2 — every remaining hole needs a rare precondition and does bounded damage
The three mediums below each require host loss/supersession or a double-START
race; none is reachable from a healthy room. Worst cases: a stale kick honored
by laggard followers only, a re-minted countdown guests invalidate on
revision advance, a fallback promotion that still sits behind the
mandate + term-fence authorization.

### Reason 3 — nothing was loosened and the old contracts hold
All test files in the diff are NEW (761+/0); new unit tests pin exact
boundaries; the Pass 72 reset-guard literal host check is still first
(`src/legacy-main.ts:30841`) with `authorizeRoomClose` second, contract test
files untouched, and the verifier's two succession-fallback defects are
already fixed on this branch at net zero lines.

---

## FINDINGS (ordered by severity; file:line + why + smallest fix)

### M-1. A superseded ex-host can still kick laggard followers in its stale window
- Where: `src/lobby-roles.ts:279` (`guestShouldHonorKick`), `src/legacy-main.ts:10605`
  (`hostKickMember`), `src/legacy-main.ts:10618` (`acceptLobbyKick`).
- Why: the four kick-refusal paths (transport drop, `not-host`, `actor-not-host`,
  honor-check) all evaluate against each peer's CURRENT belief. A deposed host
  whose local `role` is still `'host'` and whose `privateLobbySnapshot.hostId`
  is still itself (the module docstring admits this lasts "a few frames",
  `src/lobby-roles.ts:205-207`) passes `planLobbyKick` and mints a real kick.
  `LobbyKickMessage` carries no term/epoch/revision, so a follower that has
  already adopted the successor refuses it (good) but a follower that has NOT
  yet adopted still believes the ex-host and honors it — including a kick
  naming the legitimate successor. The guest ingress path (`wireHostChannel`)
  performs no host-authority check, so the honor-check is the ONLY guard that
  runs on receipt. The unit "stale ex-host" case feeds a FRESH snapshot, so
  this window is untested.
- Fix (smallest): carry `term` on `LobbyKickMessage`; refuse in
  `acceptLobbyKick` when `message.term < highestObservedTerm` (one comparison,
  reuses the HF-325 term fence). Add a unit case with a stale-belief snapshot
  (actor == old hostId, current == new hostId) asserting `planLobbyKick` ok
  locally but `guestShouldHonorKick`-with-term refuses on an updated follower
  and the laggard case is documented as accepted-risk.

### M-2. Double START re-commits mid-countdown (synthetic snapshot blinds the phase gate)
- Where: `src/legacy-main.ts:~10367` (`hostStartPrivateMatch` builds
  `candidate = hostSnapshot('waiting')`).
- Why: `decideLobbyCountdownStart` refuses non-waiting phases, but the
  candidate it is handed is always constructed with phase `'waiting'`, so the
  `wrong-phase` arm can never fire on the commit path. A double-click /
  keyboard-Enter before re-render (the only guard is the START button's
  `disabled` state, `~11057-11064`) re-mints `activeAt` timestamps, bumps
  revision, and broadcasts a second `lobby-start` while guests are
  mid-countdown.
- Fix (one line): first line of `hostStartPrivateMatch`:
  `if (privateLobbySnapshot?.phase !== 'waiting') return;`

### M-3. Succession fallback promotes without re-running the election
- Where: `src/legacy-main.ts:7246`
  (`promoteRetained(retainedLobbySnapshot, player.id)` in
  `adoptMirroredHostAuthority`).
- Why: the mandate + term-fence + roster re-election authorization was computed
  at decision time against `privateLobbySnapshot`, but promotion consumes
  `retainedLobbySnapshot`. Same stream today (both max-revision via the
  `acceptLobbyState` drop guard), yet nothing enforces
  `successorId == electHostSuccessor(retained)` — the second weaker election
  path the module header (`src/lobby-roles.ts:53-57`) swore not to create,
  re-created at the call site. If the two ever skew, a non-elected peer
  self-installs with revision+1.
- Fix (3 lines): project retained members to a `SuccessionRoster`, run
  `electHostSuccessor`, abort (same fail-closed `announceLobbyClosed` + `close`
  as the mirror-failure branch) unless decided and `successorId === player.id`.

### L-1. Reconnect flap re-arms the full 60 s ready window
- Where: `src/legacy-main.ts:8193-8197` (arm-once when a guest is present,
  clear when none).
- Why: a holdout that disconnects at 59 s and rejoins resets
  `lobbyReadyWaitStartEpochMs` to null → re-armed from zero. Flapping every
  59 s dodges force-start indefinitely.
- Fix: persist the arm across short disconnects (e.g. only clear after the
  room is guest-free for > 30 s), or record first-arm per room;
  one-line variant: don't null the arm, null it only on phase change.

### L-2. Stuck pending-guest admission strands the lobby past the timeout with no bound
- Where: `src/legacy-main.ts:8263` (`hostHasPendingGuestConnection`) +
  early return in `hostStartPrivateMatch`, and `pending-guest` outranking
  `ok-timeout` in `decideLobbyCountdownStart`.
- Why: correct by design (HF-323: never start mid-admission), but a hung
  admission or stale diag count blocks even manual force-start forever.
- Fix: bound the hold (pending blocks timeout-force-start for at most N s) or
  name the blocking admission in the early-return status line.

### L-3. Equal-term double claim never resolves
- Where: `src/host-migration.ts:327` (`termSupersedes` strict `>`) +
  `src/host-migration.ts:690` (`resolveHostTermConflict` retains on equal).
- Why: two claimants at the SAME presented term (publisher-reset double-mint
  or replayed mandate across a partition) win per-follower first-seen, differ
  per partition, and nobody ever stands down.
- Fix: `publishSuccessionMandate` must refuse to mint a term `<=`
  already-published standing term (persist `previousTerm` across reconnect;
  verify the `host-succession-wire.ts:216` standing read enforces this).

### L-4. Stale presence can elect an unreachable ghost
- Where: `src/host-migration.ts:246` (roster builder), consumed at
  `src/legacy-main.ts:6163` (`successionRoster()` copies host-authored
  `connected` flags verbatim, no freshness bound).
- Why: a clean leave whose broadcast never reached a partitioned peer leaves
  `connected: true`; the partition can elect — and via M-3 install — a ghost.
  `promoteRetained` refuses only what its own copy marks disconnected.
- Fix (cheapest): mark members silent past `HOST_SILENCE_WARNING_MS`
  ineligible in `successionRoster()`, or document trust-host-presence and
  cover with the L-5 test.

### L-5 (test lock). No test covers two peers DISAGREEING
- Why: `electHostSuccessor` determinism is proven only for identical inputs
  (order-permutation test); follower refusals are single-peer. Under partition
  the inputs differ (rev N vs N+1, flipped `connected`), each side refuses for
  a different reason, and the room dies instead of converging (safe, but
  unproven and unnamed).
- Fix: add a two-roster unit test (rev N vs N+1 with flipped `connected`)
  asserting the stale peer refuses rather than promotes; document in the
  `lobby-roles.ts` header that divergence ⇒ dead room by design
  (last-host-write-wins on presence, term fence on authority).

### L-6 (test minors, not loosening).
- `src/lobby-roles.test.ts:36`: fixture uses `dhv: 100` with an
  `as LobbyMember` cast, bypassing the `Dhv` type (`10|8|6|4|2|'X'`). Fix:
  `dhv: 10` and drop the cast if it typechecks.
- `tests/e2e/pass95-lobby-roles-host-controls.spec.ts:93`: join barrier polls
  `toBeGreaterThan(0)`; a stalled second join passes the intermediate step
  (final `toBe(3)` still guards). Fix: assert exact per-join index.

### INFO (not bugs).
- `RetainedLobbySnapshot.receivedAtEpochMs` (`src/lobby-roles.ts:301`) is
  write-only: no decision reads it (expiry uses mandate TTL, freshness uses
  revision). Either enforce it at promotion or delete the field.
- 60 s window uses wall-clock `Date.now()` while countdown ticks use
  `performance.now()`; harmless under normal clocks.
- Ready-wait arm stays set across the countdown flip until the first tick
  rebroadcast clears it; harmless (live-phase gates return `wrong-phase`).
- A peer reporting ready at 59.9 s is ACCEPTED iff `updateHostReady` ran
  before the host's `decide` read (`ok-all-ready` outranks the timeout);
  otherwise it is silently carried as a named holdout into the force-start —
  never kicked, deploys unready, shows as spectator in countdown/active.
  Correct; no fix.

## CHECKED CLEAN (no finding)
- Snapshot bounded: single slot by construction; roster 1–6 members, scores
  ≤ 10 (`src/private-match.ts`); `MAX_REVISION = 1_000_000_000`
  (`src/lobby-roles.ts:67`); retain refuses non-finite timestamps,
  out-of-range and non-advancing revisions (`:316-320`); reset on room leave
  (verifier fix, `resetPrivateLobbyState`); retain call site sits BEHIND the
  authorship gate (`message.by !== message.snapshot.hostId` return at
  `src/legacy-main.ts:10498`, itself behind the transport drop).
- Kick refusal paths independent: local-role check vs room-hostId check read
  different inputs (`src/lobby-roles.ts:215-216`); receipt check reads the
  follower's belief (`:283-285`); close path mirrors the dual check
  (`authorizeRoomClose`, `:261-269`).
- Timeout never overrides: pending-guest, empty, over-capacity, wrong-phase,
  non-host (`src/lobby-countdown.ts:121-136`); guest can never start.
- Tie-breaks total and convergent (UTF-16 code-unit sort, unique ids,
  duplicates refused); forgery story closed on the wire.
- No test loosened: zero pre-existing `*.test.ts`/`tests/e2e/*` modified; new
  tests assert exact boundaries (59_999→false / 60_000→true, monotonicity,
  per-branch refusal reasons, exact e2e end-states). E2e 240 s / 60 s polls
  match house convention.
- Pass 72 reset-guard INTACT: literal host guard first, `authorizeRoomClose`
  second, synchronous durable-key invalidation, distinct fresh code;
  contract test files untouched by the diff.

## Claim-state corrections to REPORT §2 (beyond the verifier addendum)
- The end-to-end handoff remains DESIGNED, not VERIFIED (no migration e2e;
  VERIFY T1/T2 still open) — now with three more named reasons (M-1, M-2, M-3).
- `promoteRetained` "refuses to invent a successor" is true of the function
  and false of the call site (M-3): the invention moved one frame up.
- "A guest that fabricates a `lobby-kick` is refused twice over" is true on
  the host ingress path and once (honor-check) on guest receipt; under
  partition the two checks run against different beliefs (M-1).
