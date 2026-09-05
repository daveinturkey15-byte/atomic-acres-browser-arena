# HF-499 multiplayer rejoin report

Date: 2026-09-05  
Branch: `contrib/dave-gaming-pc/claude/mp-rejoin`  
Base: `88d7ae68c58d98c41189db187947deaad9d47a91`

## Claim-state summary

- **[VERIFIED]** The baseline audit reproduced `REJOIN-NOT-REGISTERED` when guest B left an active match and rejoined. The replacement transport reached the host, but the host rejected the lobby join before B was re-registered.
- **[VERIFIED]** The final audit (`artifacts/qa/mp-audit/pass95-final4-audit.json`) reports `rejoin.ok: true`, `matchReadyAfterRejoin: { guestA: "fulfilled", host: "fulfilled", guestB: "fulfilled" }`, and `remotesAfterRejoin: { host: 2, guestA: 2, guestB: 2 }`. The final state-diff was clean.
- **[VERIFIED]** Rejoin registration is host-authoritative: the active-match reservation retains the host credential and combat authority; the rejoiner explicitly sends a fresh `join` registration; the host broadcasts the new slot and sends direct canonical `join` and `state` snapshots to the rejoiner for itself and every existing remote.
- **[VERIFIED]** The host admission path continues to key the current connection by `connectionEpoch`; guests do not relay authoritative results. The final audit recorded `otherSawRawClaim: false` for the pickup probes.
- **[OPEN]** The three-minute soak still fails `MP-SOAK-REJOIN-DAMAGE`: damage was triggered and rejoin was observed, but `seenByEveryoneAfter` was false and `damageLatencyMs` was null. The specific rejoin-registration/replication audit is green; damage-credit propagation is not proven green by the soak.
- **[OPEN]** W-1 runtime evidence remains red in the extended driver: `m14-ebr` to pistol showed `fastAmmoBefore: 15`, `fastAmmoAfter: 15`, `sentShot: true`. The remaining red path is the broader swap/replication residue, not a reason to loosen the test. All weapon-grant boundaries now clear `nextShotAt`.
- **[OPEN]** P-1 recovery is not proven: the driver attempted reject-then-retry, but both roles reported `firstRejected: false`, `firstDropRetained: false`, and `retrySucceeded: false`. The other guest saw the canonical result, not a raw relay.

## Baseline reproduction and drop point

**[VERIFIED]** Baseline audit result:

```json
{
  "ok": false,
  "role": "guestA",
  "identityBefore": "309ab3d9-3843-46a3-b675-2f8603b76fb0",
  "remotesAfterLeave": { "host": 1, "guestB": 1 },
  "rejoinClick": { "ok": true },
  "rosterAfterRejoin": { "guestA": "rejected", "host": "rejected", "guestB": "rejected" }
}
```

**[VERIFIED]** The all-peer trace showed: host received `leave` and then received B's new `lobby-join`, but emitted `lobby-reject`; guest A emitted `leave` and `lobby-join` and received `lobby-reject`; guest B received the leave but received no post-rejoin roster. The exact drop was the host's voluntary-leave cleanup: it deleted B from `hostLobbyTokens` and called `network.forgetPlayerRejoinCredential` before the replacement `lobby-join` was authenticated. The new transport therefore presented no valid retained credential and never reached entity registration or snapshot broadcast. This was a stale credential/session teardown, not a remote-render interpolation issue.

## Host-authoritative correction

**[VERIFIED]** The implementation now follows this sequence:

1. Active-match voluntary leave retains the host member reservation, token, combat authority, and bounded disconnect state. Waiting-lobby voluntary leave still performs the existing final cleanup.
2. The client persists its active-room identity before local lobby reset, carries same-room rejoin intent through `beginPrivateMatch`, and re-arms the current connection epoch for the world-ready registration.
3. The rejoiner's world-ready `join` is admitted by the host as explicit entity registration. The host's broadcast creates the fresh replication slot for all peers.
4. The host sends the rejoiner direct canonical `join` and full `state` snapshots for the host and every existing remote, while preserving the normal host broadcast path.
5. Shot/damage admission remains tied to the authenticated current peer session and the host remains the only authority that emits the canonical result.

## W-1 and P-1 evidence

**[VERIFIED]** `nextShotAt` is cleared after canonical weapon assignment in guest authority restore, gun-range armory pickup, respawn, and both railgun holder transitions. The source-contract tests cover these paths and the legacy-main size ratchet remains unchanged at 37,396 lines.

**[VERIFIED]** The pickup driver now creates a real host-authored drop, performs a sender-distance rejection probe without broadcasting the probe teleport, then retries at the canonical position. It records retention, rejection, retry, host claim, and raw-relay fields.

**[OPEN]** The current runtime probe does not yet produce the required rejected-first-then-successful-second-F sequence; P-1 remains a finding.

## Final audit and soak evidence

**[VERIFIED]** Final targeted audit command:

```text
PASS73_NATIVE_WEBGPU=1 npm run build
node scripts/qa/mp-audit.mjs --dist dist --port 4233 --peer-port 4234 --label pass95-final4 --renderer webgpu --render performance
```

**[VERIFIED]** The build completed successfully (562 modules). `pass95-final4` contains no `REJOIN-NOT-REGISTERED` or `REJOIN-ONE-WAY-REPLICATION` finding and reports 20 high findings, all outside the corrected rejoin-registration row. The remaining findings include swap replication, reload visibility, stair fire, and relay-gap rows; they are retained as findings.

**[VERIFIED]** Required soak command used only ports 4233/4234 (4235 reserved):

```text
PASS73_NATIVE_WEBGPU=1 MP_SOAK_DIST_PORT=4233 MP_SOAK_PEER_PORT=4234 npm run qa:mp-soak
```

**[VERIFIED]** The soak table was:

| ID | REQUIREMENT | RESULT | EVIDENCE |
| --- | --- | --- | --- |
| MP-SOAK-DURATION | scripted play lasts at least three minutes | PASS | `completed=true`, `durationMs=180256`, `requiredDurationMs=180000` |
| MP-SOAK-REPLICATION | all directed peer pairs replicate every one-second sample within 1.5 m | FAIL | `samples=179`, `expectedSamples=180`, `divergences=600`, `missingDirections=[]`, `positionBoundM=1.5` |
| MP-SOAK-REJOIN-DAMAGE | guest B leaves/rejoins and damage is observed by everyone within one 120 ms RTT | FAIL | `leaveObserved=true`, `rejoinObserved=true`, `seenByEveryoneAfter=false`, `damageTriggered=true`, `damageLatencyMs=null`, `rttMs=120` |
| MP-SOAK-RELOAD-AFTER-DEATH | both guests complete a reload after a death | PASS | `guestA=true`, `guestB=true` |
| MP-SOAK-RESPAWN-RESET | respawn restores the authored loadout and usable ammo for both guests | PASS | `guestA=true`, `guestB=true` |
| MP-SOAK-STAIR-FIRE | both guests fire successfully while staged on a house stair | FAIL | `guestA=false`, `guestB=false` |
| MP-SOAK-CONSOLE-CLEAN | the three peers emit no page or console errors | PASS | `total=0`, all peers 0 |
| MP-SOAK-SCOREBOARD | all three peers agree on the final scoreboard | PASS | `agreement=true`, peers present host/guestA/guestB |

## Verification and commits

- **[VERIFIED]** `npx tsc --noEmit` passed after the final ratchet-preserving cleanup.
- **[VERIFIED]** Final targeted ratchet and multiplayer audit-fix tests passed: 42 tests across 2 files. The preceding complete requested focused selection reached 500/501 before the size-only cleanup; its only failure was the unchanged size ceiling, then the final rerun passed the ratchet and affected tests.
- **[VERIFIED]** The build, audit, soak, and evidence artifacts are local under `artifacts/qa/`; no secrets were printed or stored.
- **[OPEN]** Pipeline preflight's lockfile check passed, but the repository contract rejected this user-mandated branch name because it expects `contrib/dave-gaming-pc/codex/<short-outcome>`. No bypass or threshold change was made.
- **[VERIFIED]** Each implementation step was committed and pushed to `origin/contrib/dave-gaming-pc/claude/mp-rejoin`: `e61ce70e`, `989a89ad`, `0cc85d8f`, `021ce6b7`, `afc0bafa`, `b783eede`, `da563c3e`, `0b3221f6`, `e15bbfe8`, `8cd024aa`, and `dd79438b`. This report is the final evidence commit.
