# Muse review — mp-soak-red round 2 (HF-499 / HF-504)

Scope: `aa-claude-soakred @ 8ff4d236`, diff vs
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Read: `AGENTS.md`, `docs/evidence/pass95/mp-soak-red/REPORT.md` (rounds 1+2),
`src/network.ts`, `src/protocol.ts`, full source diff.
No builds, no browsers, no GPU. No thresholds changed by hand.

## Verdict: DO-NOT-SHIP (as a release green)

Three reasons:

1. No complete post-fix runtime proof exists. The 180 s soak, the after
   `mp-audit`, and `seenByEveryoneAfter` are all still OPEN by the lane's own
   report (WebGPU queue/deployment fence). Unit-test-first repair is good work,
   but it cannot certify replication, rejoin damage, or stair fire.
2. The 0.35 m snap path has no rate limit or smoothing
   (`src/legacy-main.ts:13322`, `src/remote-snapshot-reconciliation.ts:~95-118`).
   Under the mandated 120 ms RTT + 1% loss this can rubber-band every sample
   during sprint/stair motion. Ship only with a persist-count or cooldown.
3. The stair "fix" is probe accommodation, not a gameplay fix
   (`src/legacy-main.ts:35803`, inside the `debugWindow` QA teleport hook).
   Real stair climbs go through physics + the unreliable state lane, which is
   untouched. Keep the stair row OPEN.

The three root-cause repairs are otherwise sound in structure and correctly
fail closed. Details per check below.

## (1) Continuity-before-sequence apply fence — SAFE from cross-player exploit, minor self-teleport note

- Fence: `src/remote-snapshot-reconciliation.ts:~40-60`
  (`incoming.continuity > current.continuity` admits before the seq fence;
  same-continuity still requires `seq >` or same-seq + newer `hostTimeMs`).
  Call site: `src/legacy-main.ts:13444`. Join path correctly ignores wire
  continuity (`continuity: message.type === 'state' ? message.continuity :
  remote.continuity`).
- Why no cross-player exploit: guests never relay. `src/network.ts:890-891`
  (`sendToPlayer` returns false unless `role === 'host'`), client `send`
  goes to the host only, and host state ingress binds sender
  (`src/network.ts:1371-1373`, `messageBelongsToPlayer(payload, playerId)`).
  A guest cannot inject a `state`/`join` as another player, so a forged
  continuity only affects the host's view of the forger.
- Residual (minor): on the host path the state continuity number itself is
  guest-supplied with no monotonicity proof beyond transport binding. A guest
  can bump its own continuity to force `accepted=true` on a low-seq sample
  and clear its own `positionHistory` (`src/legacy-main.ts:~13600`,
  `if (...continuity !== admittedContinuity) remote.positionHistory.length = 0`).
  Impact is limited to self-teleport, which the guest can already do by
  sending any in-bounds position; post-admission movement/bounds checks still
  run. Not a ship-blocker.
- Smallest fix (optional hardening): on the host path, accept a continuity
  increase only when an authenticated replacement is pending
  (`pendingGuestAuthorityRepairs.has(id)` / `remote.awaitingReplacementState`
  / guest-resume-authority), otherwise treat the sample as same-continuity.
  One predicate at `src/legacy-main.ts:13444`.

## (2) Guest pose reconciliation beyond 0.35 m — CORRECT gating, MISSING rate limit

- Bound documented: `LOCAL_AUTHORITATIVE_CORRECTION_BOUND_M = 0.35` with
  comment in `src/remote-snapshot-reconciliation.ts:~5-8`; applied at
  `src/legacy-main.ts:13322` (client-only, `join`/`state`, self id only).
- Never overrides newer-than-ack: `reconcileLocalAuthoritativeSnapshot`
  rejects `authoritative.seq <= lastAcknowledgedInputSeq`, wrong id, or
  non-safe-integer seq, and the caller returns early on `!accepted`, then
  advances `lastAcknowledgedLocalInputSeq = incoming.seq`. Correct.
  Deterministic tests pin both directions
  (`src/remote-snapshot-reconciliation.test.ts:48-69`).
- FINDING F-RATE (ship-with-fix): no rate limit, no smoothing, no persist
  count. Every accepted sample with divergence > 0.35 m snaps immediately,
  zeroes velocity, and clears `localPositionHistory`. Sprint, stair steps,
  and loss-induced prediction gaps routinely exceed 0.35 m for a sample or
  two under 120 ms RTT + 1% loss, so this can snap every sample
  (rubber-band) instead of converging.
- Smallest fix: snap only when divergence exceeds the bound on N consecutive
  accepted samples (e.g. 3) or when `now - lastSnapMs > 250`; otherwise keep
  prediction and record the diagnostic. Alternatively critically-damped lerp
  toward authority for `0.35–1.5 m` and snap only beyond 1.5 m. Keep the
  `<= lastAck` reject untouched.

## (3) Rejoiner slot replay — CORRECT for live observers; LATE-JOINER path is implicit

- Host repair: `src/legacy-main.ts:13411` sends the retained rejoiner
  `join`+`state` directly to the replacement, replays the same fresh slot to
  every currently admitted observer via `broadcastFreshRejoinerSlotToObservers`
  (`src/legacy-main.ts:9178`), and aborts mid-delivery if
  `hostLobbyConnectionEpochs.get(rejoinerId) !== connectionEpoch`. Also sends
  every other candidate slot to the rejoiner. Plan builder is pure and
  protocol-guarded (`src/rejoin-replication.ts:~50-70`,
  `isGameMessage` assertions in `src/rejoin-replication.test.ts:24-32`).
- Epoch cannot be spoofed by a guest: `hostLobbyConnectionEpochs` is written
  only on the host after resume-token digest verification
  (`src/legacy-main.ts:~9645-9660`, `credentialAccepted` gate) or for a fresh
  build-checked admission (`~9690-9692`); transport binding is via
  `confirmPlayerAdmission` + `messageBelongsToPlayer`. A guest cannot set
  another player's epoch, and kill credit is now session-bound
  (`sessionBoundCreditKey(playerId, epoch)`, stale prefix cleared on
  `removeRemote`).
- FINDING F-LATE (minor, docs/test gap): the replay fan-out enumerates
  `network.connectedPlayerIds()` (admitted only, `src/network.ts:906-908`) at
  call time. An observer that joins *after* the rejoin is not in that
  snapshot; it converges only via the normal newcomer full-state path. That
  path exists (new-member admission + direct state repair), but no contract
  test pins "late joiner sees the rejoiner slot". Verdict impact: none on the
  live-observer claim; close the gap before calling rejoin green.
- Smallest fix: add one test — build plan with observer set taken before a
  late join, then assert the newcomer admission path delivers the rejoiner
  `join`+`state` (same two-message shape). One paragraph in the report
  naming the newcomer path file:line.

## (4) Stair fire — PROBE ACCOMMODATION, not a gameplay fix

- Change: `src/legacy-main.ts:35803` — inside the `debugWindow` QA teleport
  helper, the teleport state is now also sent on the reliable lane for
  clients: `network.send(teleportState); if (network.role === 'client')
  network.sendStateCommitReliably(teleportState);`.
- Why accommodation: only the debug/QA teleport entry point is mirrored.
  Production stair traversal (physics walk, respawn/teleport broadcast sites,
  the every-30-tick reliable fallback at `src/legacy-main.ts:12573`) is
  unchanged, and `src/physics.ts` grounding was deliberately not touched
  (per report). GuestA's 43.681 m host error was an unreliable-lane drop of a
  locally staged pose; making the *probe's* teleport reliable proves the
  probe can stage, not that players climbing stairs replicate.
- Say it plainly: real fix would be in the production pose-publication path
  (reliable commit on authoritative teleport/respawn, or a staging ack before
  the fire window), with the stair row then re-proven by a full soak.
- Smallest fix: either (a) move the reliable commit into the production
  teleport/state path shared by gameplay, or (b) keep `35803` labeled
  QA-only and keep MP-SOAK-STAIR-FIRE OPEN. Do not cite the serialized-probe
  soak as stair evidence.

## (5) Soak bounds, tests, timeouts, ratchet — NO LOOSENING; two setup changes disclosed

- Thresholds intact: `scripts/qa/mp-soak-assertions.mjs:5-10`
  (`playDurationMs: 180_000`, `sampleIntervalMs: 1_000`,
  `positionBoundM: 1.5`, `rttMs: 120`); gate consumes them without override
  (`scripts/qa/mp-soak-gate.mjs:42-48,77-83`); 1% loss and one-RTT damage
  bound preserved.
- Ratchet intact: 37,396-line ceiling unchanged, lane reports 37,394
  (compaction, not ceiling raise). `git diff --check` clean per report.
- QA setup changes (not relaxations, but must stay disclosed):
  - Stair probes serialized (`for` loop over guests) instead of
    `Promise.all` (`scripts/qa/mp-soak-gate.mjs:~384`). Justified (shared
    staircase race), but it removes simultaneous-staircase stress; note it
    in the row.
  - Rejoin damage now waits for bounded `remotes === 2` convergence on every
    peer before the probe (`scripts/qa/mp-audit.mjs:~1310-1322`,
    `JOIN_TIMEOUT_MS` unchanged at 60 s). This is a wait, not a weaker
    assertion — a peer that never converges still fails the one-way check.
    Pinned by `mp-soak-gate-contract.test.mjs:+44-49`.
  - Ports moved 4194/4195 → 4233/4234 with allowlist `{4233,4234,4235}`
    (owner QA-port binding); contract test updated, no `4227/4228` contact.
  - Replication accounting changed from full-mesh-every-pair to
    host-authoritative primary + separately classified guest-originated
    reverse directions (`addReplicationDivergences`). Strictly more
    informative; reverse divergences are still recorded, not dropped.
- No timeout lengthened, no assertion weakened, no `OPEN` row flipped to
  green. The report's `[OPEN]` rows match the artifact state. Good hygiene.

## Minor notes (non-blocking)

- `src/rejoin-replication.ts` builds identical `join`+`state` pairs per
  recipient via `messagesFor`; fine (small N), no action.
- `hf499-mp-soak-red.test.ts` asserts source text for the repair wiring.
  Brittle but honest as a regression lock; prefer behavioral protocol tests
  (already added) over string locks long-term.
- Two single-line multi-statement lines (`9177`, `9178`, `13322`, `13444`)
  hurt debuggability/line-coverage; consider `npm run format` splitting when
  next touching them. Not a finding.

## What would flip this review

1. A complete 180 s three-peer soak + after `mp-audit` with zero divergences,
   `seenByEveryoneAfter=true`, and stair fire true/true.
2. F-RATE fixed (persist-count/cooldown on the 0.35 m snap).
3. Stair row proven by gameplay-path publication (or explicit QA-only label
   with the row OPEN).
