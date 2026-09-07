# Muse review — HF-504 mp-audit-todos lane (pass95)

Reviewer: Meta Muse Spark 1.3 (skeptical reviewer). Date: 2026-09-05.
Range: `origin/contrib/dave-gaming-pc/claude/mp-audit-hf504..HEAD` (HEAD `9cc369bd` at review time).
Inputs: full diff over `src` + `scripts/qa`, `docs/evidence/pass95/mp-audit-todos/REPORT.md`,
`docs/evidence/pass94/mp-audit/DEFECTS.md`, `artifacts/qa/mp-audit/hf504-pass95-final-audit.json`
(15 findings, `stateDiff.divergences` empty). No builds, no browsers, no GPU; static review only.

## Verdict: SHIP-WITH-FIXES

Three reasons:

1. **Core authority fixes are real and measured.** P-3/P-4 host-only claims + broadcast
   correction, R-1/R-2 reload continuity, L-1/L-7/L-9 lobby gates all hold up in code
   AND in the final artifact's traces/measures (details §1, §2, §4 below).
2. **No silent green.** P-6/P-8, L-3 all-ready runtime proof, rejoin/X-3 stay OPEN in both
   REPORT.md and DEFECTS.md; the size ratchet (`37614 > 37396`) stays red and unweakened;
   no unit test was loosened (§6). The residual findings (swap replication, reload
   visibility, rejoin, relay-gap) are preserved in the artifact, not deleted.
3. **But two MEASURED PASS labels overclaim and one measure is mislabeled.**
   R-5 "PASS" contradicts four `RELOAD-NOT-VISIBLE` findings in the same artifact;
   L-4 "measured ten surfaces" is really a 4-field agreement check; the L-3
   `all-ready-start-enabled` measure records `ok:true` against a stale partial result.
   None of these is hidden — the evidence to catch them ships in the same artifact —
   but the REPORT.md claim-states must be corrected before the lane is quoted as proof
   (fixes F-1, F-2, F-3).

## 1. P-3/P-4 — PASS (with one harness-note fix)

**Claim:** guest pickup claim validated by host BEFORE any other guest acts; rejection
sends explicit correction to every peer that saw it.

- `src/network.ts:1281` — `pickup` added to the host-only ingress list: the branch does
  `this.onMessage(payload); return;` with **no** `this.broadcast(payload, playerId)`.
  Before, `pickup` fell through to `onMessage + broadcast`, i.e. the blind relay cited
  in DEFECTS (`network.ts:1285-1286` base). The fix is exactly at the old defect site.
- `src/legacy-main.ts:15730` (`sendRemotePickupResult`) — now `network.send(result)`
  (broadcast) instead of `sendToPlayer(message.by, …)`, with a comment stating the
  canonical post-transaction drop goes to every admitted guest. Correct direction:
  claims are guest input, results are host state.
- `src/legacy-main.ts:15815` (`acceptLocalPickupResult`) — non-claimant branch
  (`forPlayerId !== player.id`) applies `applyCanonicalPickupDrop` and returns before
  touching inventory/nonce correlation. Claimant path still restores-then-adopts on
  rejection. This is the P-4 repair channel (guest B no longer wedges on
  `legacy-main.ts:13498-13517`-class early return because there is nothing to wedge on).
- Artifact proof (not vacuous): `rowMeasures.P-3/P-4`, `pickup-rejected-claim` case —
  `sentPickup:true, gotPickupResult:true, hostSawClaim:true, otherSawRawClaim:false,
  otherSawCorrection:true, restored:true` (both guest roles). The scenario
  (`scripts/qa/mp-audit.mjs:scenarioPickup`) stages a guest-local drop unknown to the
  host, presses the real `interactDrop`, and asserts from three independent traces
  (guest/host/other marks). A vacuous pass would need all five booleans to align by
  accident; they are each recorded as a finding when wrong (`PICKUP-RAW-RELAY`,
  `PICKUP-CORRECTION-MISSED`, `PICKUP-HOST-MISSED-CLAIM`).

**F-1 (harness, minor): the relay-gap detector is stale.** The final artifact still
emits `RELAY-GAP-… notRelayed:[…, 'pickup', 'reload-intent', …]`. `pickup` and
`reload-intent` are now intentionally host-only (host-arbitrated by design, same as
`shot-request`). Flagging them as gaps will cry wolf on every future run.
Smallest fix: `scripts/qa/mp-audit.mjs` relay-gap check — allow-list the
host-arbitrated set (`pickup`, `reload-intent`, `shot-request`) and only flag
presentation signals (e.g. `trigger-state`, still genuinely unrelayed per X-1 TODO).

## 2. Reload rows R-2/R-3/R-4/R-5 (+R-1) — PASS on continuity, FAIL on visibility claim

Continuity machinery (all verified in diff):

- R-1: `src/legacy-main.ts` respawn `startsNewLife` branch calls
  `localReloadActionSequence.reset()` — the exact missing reset from DEFECTS. Host
  rebuilds per-guest authority per life (`lastActionSequence=-1`); guest now restarts
  its counter per life too. Post-respawn reload measure passes with
  `ammoBefore:1 → ammoAfter:30, hostSeesAmmo:30, sentIntent:true, gotResult:true`.
- R-2: `onNetworkMessage` continuity reducer — `respawned ? max(remote+1, claimed) :
  max(remote, claimed)` for movement resync (no invented life id). The `reload-result`
  lifeId filter can now be satisfied after a bounded resync. Idempotency completes the
  picture: stable `requestId` (`src/local-reload-authority.ts:reloadRequestId`, FNV
  digest of epoch + life + sequence + action), 350 ms client retry
  (`scheduleLocalReloadRetry`), host result cache
  (`remoteReloadResultCacheKey` + cache-hit replay). Retry storms are safe; reconnect
  retransmission replays the cached result instead of double-committing.
- R-3: `resolveAuthoritativeShot` — `cancelRemoteReloadAuthority` moved below the
  `missing-history` / `bad-origin` / `empty-magazine` rejections. A rejected shot no
  longer cancels an in-flight reload. TRACED (no direct rejection scenario); ordering
  verified in diff.
- R-4: self-`state` repair now applies `message.combatInventory` via
  `applyLocalCombatInventoryProjection(…, true)` in addition to HP. TRACED; no direct
  missed-projection scenario, honestly marked.

**F-2 (claim-state, must-fix): R-5 MEASURED PASS contradicts the same artifact.**
`rowMeasures.R-5` (`reload-after-respawn`, both guests) records `ok:true`, but
`otherSeesReloading:null` in every R-5 result, and the artifact contains **four**
`RELOAD-NOT-VISIBLE` findings (pre- AND post-respawn, both directions). Root cause:
`scripts/qa/mp-audit.mjs:942` — `result.ok = result.ammoAfter > result.ammoBefore`
ignores `otherSeesReloading`, so the visibility leg (the actual R-5 symptom, "reload
is invisible to other players") never gates the verdict. The `reloading` replication
itself (`protocol.ts` `PlayerSnapshot.reloading`, `snapshot(): reloading:
player.reloadState !== null`, `operator.userData.reloading` presentation) is present
and the unit test asserts both ends — but at runtime the other guest observed `null`,
not `true`, in all four cases.
Smallest fix: gate the R-5 verdict on visibility —
`result.ok = ammoGrew && sentIntent && gotResult && otherSeesReloading === true &&
hostSeesAmmo === ammoAfter`, keep the `RELOAD-NOT-VISIBLE` record as the failure
signal, and downgrade REPORT.md/DEFECTS.md R-5 to FIXED/TRACED with "runtime
visibility OPEN" until a run shows `otherSeesReloading:true`.

Residual (disclosed, not hidden): `SWAP-NOT-REPLICATED` fires 8× in the same artifact
(secondary swap never reaches host or other guest). Swap path also matters for reload:
`switchWeapon` does cancel-then-`interruptReload(true)` → `sendLocalReloadCancel`
(verified — swap notifies the host), but W-4 (`finishReload` credits `player.weapon`,
not `reloadState.weapon`) is still TODO, so a commit landing mid-swap can credit the
wrong slot. Keep swap/reload-after-swap OPEN; do not quote R-rows as covering swaps.

## 3. L-4 (+L-5) — code fix PASS, "ten surfaces measured" OVERCLAIMED

Code (`src/legacy-main.ts:renderPrivateLobby`):

- `members = snapshot?.members ?? []`, `config = snapshot?.config ?? null` — the
  host-local fallbacks (`[...hostLobbyMembers.values()]`, `privateMatchConfig.*`)
  are gone. No-snapshot now renders `—`/empty + `Waiting for the host to admit this
  connection…` instead of fabricated `1 / 4` + enabled READY. Verified across roster,
  capacity, arena/mode/limits/time-of-day, squad label (`AWAITING AUTHORITY`), READY,
  HOST badge (`member.id === snapshot?.hostId`, the old `|| self-is-host` self-badge
  removed), DHV, guidance, countdown.
- L-5: `localLobbyReady = localMember?.ready ?? false` — a dropped guest (absent from
  roster) clears READY; with no snapshot there is no ready state at all. A guest can
  no longer see itself READY ✓ when the host dropped it. The READY button is additionally
  disabled unless `snapshot?.phase === 'waiting'` with a listed, connected member.
- Ping exception (`localLobbyPingMs` for self) is telemetry, not authority — acceptable.

**F-3 (claim-state, must-fix): the driver does not measure ten surfaces.**
`measure('L-4','authoritative-snapshot-agreement')` compares only
`{phase, revision, arenaId, members}` across the three peers. Countdown text, READY
label/enabled, HOST badge, squad/DHV rendering, ping display, guidance text are never
compared. The three-peer agreement (`revision 6` identical, single-set key) is a real
signal, and the focused predicate tests cover the ready/start predicates — but
REPORT.md/DEFECTS.md must say FIXED/TRACED + snapshot-agreement-measured, not
"ten surfaces MEASURED". Smallest fix: either extend the L-4 measure to snapshot the
ten DOM fields per peer (READY text/disabled, HOST badge, squad label, DHV, countdown
title, capacity label, guidance) or reword the claim.

## 4. X-2 remote admission — PASS on desync, forgery risk LOW (one hardening note)

- `src/legacy-main.ts:1285,12478,13807,27726`: `RemotePlayer.authoritativeReady`
  (host defaults true, client defaults false) → set true on first accepted client-side
  `state` → `updateRemotes` withholds (`visible=false; continue`) until then.
  `stateDiff` has zero position divergences over 4 samples; the spawn-default
  teleport (guest B rendering guest A at a seed pose) is gone by construction.
- Forgery: admission still requires lobby membership + team match + arena-bounds +
  DHV/magnum checks before a remote exists, and client transport only carries
  host-originated state-lane messages — a forged pose needs the host's relay, i.e.
  host compromise, not a guest edit. One gap: `:13807` sets `authoritativeReady` on
  **any** `message.type === 'state'` without checking `message.by === hostId`. States
  relayed by the host on behalf of guest A keep `by=guestA`, so a strict host-only
  check would break legitimate relay — but thesetter should at least require the
  message to have passed the lobby-membership/team/bounds admission above (it does
  today by position in `onNetworkMessage`, worth a one-line comment + unit pin) rather
  than sitting as a bare type check. Low risk, note for the next pass, not a
  ship-blocker.
- Measure caveat (document, don't re-run): `runStateDiff` skips
  `authoritativeReady === false` remotes. Correct (a withheld seed has nothing to
  compare), but a permanently-withheld remote would pass vacuously. The artifact shows
  4 compared samples with zero divergences, so this run compared real poses — add
  `samplesCompared` to the X-2 result so the next reader doesn't have to infer it.

## 5. MEASURED PASS rigor — per-row verdicts

Quoting the scenario step that gates each row (`scripts/qa/mp-audit.mjs`):

- L-1 (`host-alone`: `startDisabled === true` with one host-only member) — genuine.
- L-4 (`authoritative-snapshot-agreement`: single-set JSON over phase/revision/arena/
  members) — genuine but narrow (see F-3).
- L-7 (`host-time-countdown`: all three peers `DEPLOYING IN 5` via `hostTimeToGuestMono`
  mapping) — genuine; the old `Date.now()`-minus-host-epoch clamp is gone.
- L-9 (`telemetry-does-not-advance-revision`: `10 → 10` across 2.3 s of clock-ping) —
  genuine; `broadcastHostLobby(…, {revisionBump:false, render:false})` verified.
- X-2 (`post-deploy-state-diff`: zero position divergences, 4 samples) — genuine for
  compared poses; add compared-count (see §4).
- P-3/P-4 (`pickup-rejected-claim`: five-boolean conjunction over three traces) —
  genuine; cannot pass vacuously (§1).
- P-5 (`auto-scavenge-rejected-claim`: `sentPickup && gotResult && ammoAfter===0 &&
  reserveAfter===0`) — genuine; asserts the rollback left the emptied projection
  intact rather than silently crediting.
- R-1/R-2 (`reload-after-respawn`: `ammoBefore → ammoAfter` + intent/result +
  host agreement) — genuine for continuity; R-1 ordering note: the reload scenario
  runs post-respawn (DEFECTS §D ordering complaint addressed — reload runs again after
  `scenarioRespawn`).
- R-5 — **vacuous on the visibility leg** (see F-2). Pre-respawn R-5 (`measuredRows:
  ['R-5']` only) has the same hole.
- L-3 — **mislabeled measure.** `all-ready-start-enabled` passes
  `allReadyStartEnabled` as `ok` but attaches the stale `partial` object as `result`
  (artifact shows `ok:true` with `result.startDisabled:true`). Genuine wait (driver
  waits for `startDisabled===false` before continuing) but the recorded evidence is the
  wrong object. One-line fix: attach `{startDisabled: !allReadyStartEnabled…}` /
  the fresh read. REPORT.md already marks L-3 runtime proof OPEN — keep it OPEN.
- P-6/P-8 (`pickup-accepted-claim`) — honestly OPEN (`staged.ok:false`, drop not at
  post-respawn position). The `canonicalDeathMessage` path (host-authored `drop` on
  every death broadcast, guests adopt verbatim via `spawnDeathDrop`) is TRACED, not
  measured. No convergence claimed. Correct handling.

## 6. Test loosening — none found

- `src/private-match.test.ts`: host-alone start `true → false`, host-unready commit
  `true → false`, disconnected-reservation case added. All tightenings toward the new
  predicates (`hasSecondParticipant`, `!hasDisconnectedReservation`,
  `connected.every(ready)` in both `canHostStart`/`canHostCommitStart`). No assertion
  removed.
- `src/protocol.test.ts`: `requestId` now required on intent/result (+negative cases).
  Tightening.
- `src/local-reload-authority.test.ts`, `src/guest-reload-authority.test.ts`: updated
  constructors for the new required `requestId`/`cancelRequestId` fields; new branches
  (cancel-once, committed-start race, requestId matching) covered, not deleted.
- `src/hf504-multiplayer-audit-fixes.test.ts`: the pickup-rollback test now scopes
  `restore→canonical` ordering from the `rejected` branch instead of anywhere in the
  function. More precise (accepted path has no restore), not weaker; paired with new
  P-3/P-4, R-2..R-5, P-6/P-8, lobby-fence, and X-2 suites that assert exact
  host-only/broadcast/no-fallback strings. Source-text tests are brittle by nature,
  but they pin the exact defect lines and every one matches the diff I read.
- Gates honestly reported: `tsc` + `build` + 42/43 Vitest files pass; ratchet red at
  `37614 > 37396` with threshold unweakened (hoist lane owns the fix); preflight
  branch-shape rejection disclosed rather than worked around.

## Follow-ups (bounded, not this lane)

1. F-2 (R-5 visibility gate), F-3 (L-4 ten-field measure or reword), F-1 (relay-gap
   allow-list), L-3 stale-result one-liner — all in `scripts/qa/mp-audit.mjs` + two
   REPORT.md claim-state sentences.
2. Swap replication (`SWAP-NOT-REPLICATED` ×8) + W-4 wrong-weapon credit + W-2/W-3/W-5
   telemetry gaps: untouched, correctly TODO.
3. Rejoin (`REJOIN-NOT-REGISTERED`, critical) / X-3: owned by `mp-desync-hf499`,
   reproduced here — no action except keeping the confirmation.
4. Size ratchet: hoist lane's fix; this lane must not touch the threshold.
