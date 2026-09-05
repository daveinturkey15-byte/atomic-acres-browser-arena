# Pass 95 HF-499/HF-504 multiplayer soak-red report

## Decision

[OPEN] The lane is not a release green: the required complete 180-second WebGPU soak and the after `mp-audit` were both blocked by the machine's existing WebGPU queue/deployment fence. Red rows remain findings.

[VERIFIED] Prior Round 1 snapshot: worktree `C:\Users\david\projects\aa-claude-soakred`; branch `contrib/dave-gaming-pc/claude/mp-soak-red`; remote head `33ef9c2121a42fbd544fd935c7e10de743c3dcd0`.

[VERIFIED] Runtime scope: headless Chrome, WebGPU, three peers, ports 4233/4234, simulated 120 ms RTT and 1% loss for soak runs; port 4300 and the owner's worktrees were not used.

## Full soak tables

The first table is the supplied candidate-7 baseline from `docs/evidence/pass94/candidate7/REPORT.md`.

| STATE | ID | REQUIREMENT | RESULT | EVIDENCE |
|---|---|---|---|---|
| [CLAIMED] | MP-SOAK-DURATION | scripted play lasts at least three minutes | PASS | duration 180058 ms |
| [CLAIMED] | MP-SOAK-REPLICATION | all directed peer pairs replicate every one-second sample within 1.5 m | FAIL | 179 samples; 606 divergences |
| [CLAIMED] | MP-SOAK-REJOIN-DAMAGE | guest B leaves/rejoins and damage is observed by everyone within one 120 ms RTT | FAIL | rejoin observed; seenByEveryoneAfter=false; latency null |
| [CLAIMED] | MP-SOAK-RELOAD-AFTER-DEATH | both guests complete a reload after a death | PASS | PASS |
| [CLAIMED] | MP-SOAK-RESPAWN-RESET | respawn restores the authored loadout and usable ammo for both guests | PASS | PASS |
| [CLAIMED] | MP-SOAK-STAIR-FIRE | both guests fire successfully while staged on a house stair | FAIL | guestA=false; guestB=false |
| [CLAIMED] | MP-SOAK-CONSOLE-CLEAN | the three peers emit no page or console errors | PASS | 0 errors |
| [CLAIMED] | MP-SOAK-SCOREBOARD | all three peers agree on the final scoreboard | PASS | agreement=true |

The next table is the last usable post-source-fix soak artifact (`hf499-bundle.json`). It reached 172921 ms, so it is diagnostic evidence, not a passing soak.

| STATE | ID | REQUIREMENT | RESULT | EVIDENCE |
|---|---|---|---|---|
| [VERIFIED] | MP-SOAK-DURATION | scripted play lasts at least three minutes | FAIL | `completed=false`, `durationMs=172921`, required 180000 |
| [VERIFIED] | MP-SOAK-REPLICATION | all directed peer pairs replicate every one-second sample within 1.5 m | FAIL | 169 samples; 147 divergences; bound 1.5 m |
| [VERIFIED] | MP-SOAK-REJOIN-DAMAGE | guest B leaves/rejoins and damage is observed by everyone within one 120 ms RTT | FAIL | leave/rejoin observed; immediate remote table was host=1, guestA=1, guestB=0; damage byPeer host=null, guestA=null, guestB=100 |
| [VERIFIED] | MP-SOAK-RELOAD-AFTER-DEATH | both guests complete a reload after a death | PASS | guestA=true; guestB=true |
| [VERIFIED] | MP-SOAK-RESPAWN-RESET | respawn restores the authored loadout and usable ammo for both guests | PASS | guestA=true; guestB=true |
| [VERIFIED] | MP-SOAK-STAIR-FIRE | both guests fire successfully while staged on a house stair | FAIL | guestA=false; guestB=true |
| [VERIFIED] | MP-SOAK-CONSOLE-CLEAN | the three peers emit no page or console errors | PASS | total=0; host=0; guestA=0; guestB=0 |
| [VERIFIED] | MP-SOAK-SCOREBOARD | all three peers agree on the final scoreboard | FAIL | agreement=false after hard-stop collection |

The final retry artifacts are quoted separately because they never entered gameplay.

| STATE | ARTIFACT | RESULT | EVIDENCE |
|---|---|---|---|
| [VERIFIED] | `hf499-table.md` | FAIL / invalid as soak evidence | WebGPU queue/deployment fence; 0 samples; console total 8; `completed=false` |
| [VERIFIED] | `hf499-after-retry-table.md` | FAIL / invalid as soak evidence | WebGPU queue/deployment fence; 0 samples; console total 3; `completed=false` |
| [VERIFIED] | `hf499-after-final-audit-audit.json` | FAIL / invalid as audit evidence | three peers booted and lobby synchronized, then `DEPLOY-INCOMPLETE`; host queue completion exceeded 12000 ms |

## Red-row investigation

### Replication

[VERIFIED] The first instrumented run exposed a coordinate-measurement defect: host authoritative position `[6,1.7,-25]` was compared with a guest remote root at `[6,0,-25]`; the guest's last authoritative position was `[6,1.7,-25]`. The 1.7 m difference was the feet-versus-eye coordinate mismatch, not a weakened bound.

[VERIFIED] After pose normalization, the usable partial run measured 169 samples and 147 divergences. Classification counts were `stale-snapshot-never-applied=80`, `guest-self-prediction-over-authority=65`, `ordering-or-coalescing=1`, and `authority-not-relayed=1`. The dominant observed class was stale/unapplied snapshot presence, concentrated around the rejoin transition.

[VERIFIED] Each recorded divergence now includes peer, entity, host authoritative position, guest view position, guest authoritative position, sequence, continuity, snapshot age, and snapshot-buffer counters. Reverse guest-originated directions are also recorded instead of leaving the directed-pair row silently incomplete.

[OPEN] No complete post-fix 180-second run was obtained, so replication is not certified green. The 1.5 m threshold and all assertion fences remain unchanged.

### Rejoin damage

[VERIFIED] The trace showed the same player identity before and after rejoin. The host received `leave` at 220082.6 ms, `lobby-join` at 225319.7 ms, and the replacement `join` at 236126.4 ms; it emitted the host-authoritative repair sequence, including direct `join`/`state` repair and `guest-resume-authority`.

[VERIFIED] The observed drop was after authenticated roster re-registration: at the gate's first post-roster read, the rejoiner still had zero remotes, while later samples reached two remotes on all peers. The damage probe was issued before that full-state convergence, so the rejoiner remained at 100 HP during the 120 ms damage window.

[VERIFIED] The source now preserves the active voluntary rejoin identity, retains the host's reservation and combat authority, re-arms the replacement connection epoch/continuity, directly repairs the rejoiner, and broadcasts the fresh slot to observers. The QA scenario now waits for bounded `snapshot().remotes === 2` convergence before issuing damage; this is a wait, not a threshold relaxation.

[OPEN] The final after audit could not deploy under the WebGPU queue fence, so the host-authoritative rejoin/damage path is not certified by a complete after run.

### Stair fire

[VERIFIED] In the usable partial run guestB staged successfully and fired: host position error was 0.005 m, `shot-request` and `shot-result` were present, and ammo changed 30 to 29. GuestA staged locally, but the host still held the prior position `[-6,1.7,-24]`, an error of 43.681 m; no host-side fire rejection was observed because the request was not issued after staging failed.

[VERIFIED] `src/physics.ts` grounded vertical clamping was not changed. The corrective source change mirrors the one-frame QA teleport state on the existing reliable state-commit lane for clients, while preserving the normal state publication and the stair fire validation path.

[OPEN] The reliable staging correction was committed and tested mechanically, but no post-correction WebGPU stair run completed; the stair row remains OPEN.

## Mechanical gates

[VERIFIED] `npx tsc --noEmit` exited 0.

[VERIFIED] The requested concrete test scope expanded from the Windows wildcard invocation to 39 exact matching files: 359 tests passed, 0 failed. This included network, protocol, weapon, pickup, respawn, teleport, `legacy-main-size-ratchet`, and `hf499-mp-soak-red` tests.

[VERIFIED] QA contract/assertion tests passed: 8/8. HF-499 source tests passed: 5/5. Fresh Vite build passed: 568 modules transformed.

[VERIFIED] The size ratchet passed at the existing 37,396-line ceiling. The ceiling was not raised; the authority repair code was compacted to fit it.

[OPEN] The pre-lane `node scripts/qa/mp-audit.mjs` attempt timed out before writing a usable artifact under GPU contention. The after command on 4233/4234 produced `hf499-after-final-audit.json` but failed closed at `DEPLOY-INCOMPLETE`; it is not a product pass.

## Commits and publication

[VERIFIED] Every lane step was committed with explicit paths and pushed to `contrib/dave-gaming-pc/claude/mp-soak-red`:

- `2398a1f91378fe7b2cbbff748baf99056b948fde` — bind owner QA ports and stair probe
- `c4ce5500f8faa21b4758bc6525f524d0e968ebfa` — resolve selected arena for stair probe
- `ee6d14cbd98134ed743cafc68dbd3eae524c4581` — serialize stair probes
- `7d0d0b5f6ef06c9a38908dbea2c7c52e6d82b108` — rearm active rejoin authority
- `bf0b8f010fc9ee0d761c3a04e591a92e2a73b7a9` — instrument authority divergence
- `a494cc8335a1741934984b82c1f7a407fc463408` — normalize replicated poses
- `f79c97f8cb0667acd1d90590119e99f02ca7463b` — preserve active rejoin identity
- `88eb7e0bc0beb84373ea037a0acdb6c8dfd648c0` — await rejoin full-state convergence
- `fa8bb834c2631c6dc21f1089f5e50e0230c8e643` — harden stair and directional probes
- `33ef9c2121a42fbd544fd935c7e10de743c3dcd0` — fit authority repair under ratchet

[VERIFIED] Round 2 final working tree is clean and the remote branch resolves to `2d146f13` after the report commit.

## Round 2 — deterministic soak-red repair

[VERIFIED] Round 2 was unit-test-first and browser-free. The recorded WebGPU artifacts available in this checkout are the earlier 147-divergence partial run plus failed zero-sample retries; no new browser or soak was started during the first-hour machine restriction.

[VERIFIED] `stale-snapshot-never-applied` root cause: the old guest apply fence was the sequence-only reducer `if (incoming.seq > remote.snapshot.seq)`. A replacement/rejoin sample can carry a newer continuity while its document-local sequence is lower than the retained join seed, so the sample was rejected before interpolation/application. The deterministic fixture feeds continuity 7 / seq 240 followed by continuity 8 / seq 239 and asserts the latter is applied. The new reducer admits continuity before sequence and still rejects an older sample in the same continuity.

[VERIFIED] Before/after apply-path evidence: before, `if (incoming.seq > remote.snapshot.seq) {`; after, `admitRemoteSnapshot(remote.snapshot, remote.continuity, remote.authoritativeHostTimeMs, { ... })`, whose authority reducer applies `incoming.continuity > current.continuity` before the sequence fence. The bound and ordering assertions were not weakened.

[VERIFIED] `guest-self-prediction-over-authority` root cause: the old `incoming.id === player.id` path repaired health/ammo and returned without reconciling the local predicted pose. The new path rejects authority at or before the last acknowledged input sequence, accepts a newer host sample, and snaps when divergence exceeds the documented `0.35 m` correction bound; a scripted prediction at x=12 versus authority at x=1 proves the snap and authority winner.

[VERIFIED] Before/after self-authority evidence: before, the self branch performed health repair and then `return`; after, `reconcileLocalAuthoritativeSnapshot({ predicted: ..., authoritative: incoming, lastAcknowledgedInputSeq: lastAcknowledgedLocalInputSeq })` gates the sample and the `correction === 'snap'` branch applies the authoritative pose, clears local pose history, and records the correction diagnostic.

[VERIFIED] Rejoin damage drop point: the prior host `message.type === 'join'` branch sent a generic rejoiner `join` broadcast, but did not explicitly send the fresh rejoiner `state` slot to each admitted observer. The usable trace showed the immediate observer remote table as host=1, guestA=1, guestB=0; the damage probe then ran before full-state convergence, leaving the rejoiner at 100 HP. This is the exact observer-side drop, after roster re-registration and before observer authoritative-ready state application.

[VERIFIED] Rejoin fix: the host now sends the retained rejoiner `join` + `state` pair directly to the replacement, builds one fresh slot plan, replays that pair to every currently admitted observer through `sendToPlayer`, and aborts the replay if the rejoiner `connectionEpoch` changes during delivery. Host kill credit uses `sessionBoundCreditKey(playerId, epoch)` from `hostLobbyConnectionEpochs`, and stale per-player credit entries are cleared on remote removal.

[VERIFIED] New deterministic protocol evidence: `src/rejoin-replication.test.ts` validates both full-state messages, both observer deliveries, protocol guards via `isGameMessage`, continuity/host time, and distinct old/current session credit keys.

[VERIFIED] Round 2 gates: `npx tsc --noEmit` exited 0; the requested explicit Windows glob expansion ran 41 files with 365 tests passed and 0 failed; the focused reconciliation/rejoin/network/protocol/size set ran 6 files with 55 tests passed and 0 failed; `git diff --check` passed; the existing 37,396-line size ceiling passed at 37,394 lines.

[VERIFIED] Round 2 commits pushed in order: `0df48d2e` (lock apply-path regressions), `18e79ddb` (authority reconciliation), `194c0542` (rejoin protocol contract), `95fb8394` (fresh observer slot), and `8359502d` (ratchet-preserving extraction).

[OPEN] No new three-peer soak was run: the first 60-minute no-browser restriction was still active during this pass, and the prior complete-after evidence remains blocked by the WebGPU queue/deployment fence. The 180-second production soak, after `mp-audit`, and runtime confirmation of `seenByEveryoneAfter` remain OPEN; no test threshold or fence was relaxed.
