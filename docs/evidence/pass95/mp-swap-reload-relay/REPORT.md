# Pass 95 — HF-504 swap/reload relay

## Scope and claim state

- [VERIFIED] Work was performed only in `C:/Users/david/projects/aa-claude-swaprelay` on branch `contrib/dave-gaming-pc/claude/mp-swap-reload-relay`, based on candidate 8 `32d8dcb08351403979ab74ea30c273dd67501742`.
- [VERIFIED] The owner worktree `C:/Users/david/projects/aa-claude-hitl` and the owner’s `:4300` candidate were not touched. No browser was launched.
- [VERIFIED] The branch contains the RED coverage commit `9507b10f`, implementation `7ef2d40d`, and observer-reload coverage `f0a126b6`; all were pushed to the requested remote branch.

## Trace and exact gaps

### Guest state, swap, and inventory

- [VERIFIED] A client `network.send()` chooses the state lane for a state message; a host `network.send()` calls `broadcast(message, exceptPlayerId)` (`src/network.ts:847-861`). Host event admission intentionally consumes host-claim messages, including `reload-intent`, without generic relay; only the later generic event branch broadcasts (`src/network.ts:1292-1326`).
- [VERIFIED] The protocol already had `PlayerSnapshot.weapon` and optional `StateMessage.combatInventory` (`src/protocol.ts:146-178`). The candidate host admission built its canonical state without the inventory projection (`candidate 8 src/legacy-main.ts:13650-13656`), and `switchWeapon()` did not send a boundary state packet (`candidate 8 src/legacy-main.ts:19185-19212`).
- [VERIFIED] The fixed path sends a client state immediately after a successful swap (`src/legacy-main.ts:19221`), the host builds canonical state through `createCanonicalRemoteState()` with the host ledger projection (`src/legacy-main.ts:13629-13665`, `src/multiplayer-relay.ts:32-42`), and the observer applies the projection through `applyRemoteInventoryProjectionToMaps()` (`src/legacy-main.ts:13629-13631`, `src/multiplayer-relay.ts:21-30`). Guests do not relay claims.
- [VERIFIED] `src/multiplayer-relay.test.ts` drives a guest A weapon change through canonical host state and asserts guest B’s view is `pistol`; it also asserts the observer sees host-authored reload ammo and `reloading` state.

### Reload

- [VERIFIED] `reload-intent` is admitted only by the host (`src/network.ts:1310-1322`). Before this fix, `sendRemoteReloadResult()` ended with `network.sendToPlayer(playerId, result)` at candidate 8 `src/legacy-main.ts:6362`, so the claimant received the result and every other peer did not. That is the exact RELAY-GAP.
- [VERIFIED] The host now sends the `ReloadResultMessage` through `network.send(result)` (`src/legacy-main.ts:6337-6362`), which fans it to every admitted peer except the claimant. Cache-hit retransmission uses the same host broadcast lane (`src/legacy-main.ts:6487-6500`).
- [VERIFIED] A non-claimant client now consumes the host result in `acceptRemoteReloadResult()` (`src/legacy-main.ts:6535-6544`), applies the host projection, and updates the remote snapshot’s weapon and reload presentation. The protocol validator continues to require a complete canonical projection (`src/protocol.ts:578-596`, `src/protocol.ts:1220-1245`).
- [VERIFIED] Reload start also emits a state boundary packet (`src/legacy-main.ts:19242-19255`) so state-lane observers do not wait for heartbeat coalescing.

### Killstreak damage-source label

- [CLAIMED] Candidate 8’s soak/audit evidence recorded the guest B damage-source label as `null` (`docs/evidence/pass94/candidate8/REPORT.md:355-364`).
- [VERIFIED] The host already broadcasts the applied damage receipt (`src/legacy-main.ts:25124-25129`), but the client previously obtained the HUD cue only as a side effect of local damage application (`candidate 8 src/legacy-main.ts:24738-24767`). There was no direct victim selection from the receipt before HUD projection.
- [VERIFIED] `killstreakDamageSourceCueForVictim()` now selects the receipt addressed to the current victim and life (`src/killstreak-awareness.ts:419-427`); the non-controller receipt path stores that cue before applying damage (`src/legacy-main.ts:13067-13083`). The stale local-life guard now precedes result de-duplication (`src/legacy-main.ts:24713-24722`), preventing an old-life receipt from poisoning the dedup set.

### Rejoin damage latency

- [CLAIMED] Candidate 8 measured `seenByEveryoneAfter=true` but `damageLatencyMs=null`; its row failed only because the latency sample was not measured (`docs/evidence/pass94/candidate8/REPORT.md:308-314`).
- [VERIFIED] The source did not contain an old-connection-epoch timer for this sample. The actual gap was that `damageRemoteAuthoritatively()` mutated the host’s remote snapshot and emitted no canonical state after the mutation (`candidate 8 src/legacy-main.ts:36538-36570`). The soak loop compared every sample against the pre-hit HP, so the host’s already-applied decrease could never become a first-seen sample.
- [VERIFIED] The hook now broadcasts a canonical remote state immediately after the authoritative health mutation (`src/legacy-main.ts:36549-36567`). The soak gate credits that host-local observation at `0 ms` from the returned `storedAfter` value, then measures observer delivery normally (`scripts/qa/mp-soak-gate.mjs:396-420`). This preserves the latency bound; it does not relax it.

## Evidence gates

- [VERIFIED] `npx tsc --noEmit` passed.
- [VERIFIED] Focused Vitest gate covering the requested network/protocol/weapon/reload/pickup/killstreak/respawn patterns plus the new relay tests and explicit HF-499/HF-504 tests: 72 files, 683 passed, 2 skipped, 0 failed.
- [VERIFIED] Additional relay/rejoin/size set: 6 files, 61 passed, 0 failed.
- [VERIFIED] `node --test scripts/qa/mp-soak-gate-contract.test.mjs scripts/qa/mp-soak-assertions.test.mjs`: 8 passed, 0 failed.
- [VERIFIED] `git diff --check` passed.
- [VERIFIED] `src/legacy-main.ts` is 37,396 lines, exactly at the 37,396-line ceiling; the ratchet test passed. No ceiling was raised.
- [VERIFIED] Preflight lockfile check passed. [OPEN] The repository contribution guard rejects the owner-requested branch because it requires `contrib/dave-gaming-pc/codex/<short-outcome>` while the requested branch is `contrib/dave-gaming-pc/claude/mp-swap-reload-relay`; the branch was not renamed or rewritten.

## Browser audit

| Evidence | Before | After |
|---|---|---|
| `SWAP-NOT-REPLICATED` | [CLAIMED] 32 soak findings; 16 audit findings (`docs/evidence/pass94/candidate8/REPORT.md:322`, `:349`) | [OPEN] Not run |
| `RELOAD-NOT-VISIBLE` | [CLAIMED] 12 audit findings (`docs/evidence/pass94/candidate8/REPORT.md:350`) | [OPEN] Not run |
| `RELAY-GAP` | [CLAIMED] 4 audit findings (`docs/evidence/pass94/candidate8/REPORT.md:353`) | [OPEN] Not run |

- [OPEN] The one permitted `node scripts/qa/mp-audit.mjs` browser run was not started because the explicit headless three-peer/timing/machine-lock condition was not satisfied during this run. No claim is made that the browser findings are cleared.

## Handoff

- [VERIFIED] Implementation commits `7ef2d40d` and `f0a126b6`, plus the evidence commits on this branch, are pushed to the requested remote branch.
- [VERIFIED] Remote branch is tracking `origin/contrib/dave-gaming-pc/claude/mp-swap-reload-relay`.
- [OPEN] A permitted three-peer browser audit remains required to convert the source/unit evidence into live SWAP, RELOAD, RELAY-GAP, killstreak-label, and rejoin-latency evidence.
