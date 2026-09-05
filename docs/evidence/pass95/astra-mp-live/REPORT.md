# Pass 95 — astra mp-live fix (respawn-loadout admission, soak astra-c9)

## Scope and claim state

- [VERIFIED] Work performed only in `C:/Users/david/projects/aa-astra-pass95-mp-live` on branch `contrib/dave-gaming-pc/codex/pass95-mp-live-fixes`, base `ae2959e2`. No browser, no `npm install`, no build, no subagents, no other checkout touched, no QA scripts or owner process changed.
- [VERIFIED] Soak bundle read with targeted-field extraction only (`config`, `timing`, `replication` samples/divergences/classificationCounts, `rejoin`, `scenarios`, `scoreboard`, `consoleErrors`, `gate`); no trace bulk ingested.
- [VERIFIED] Thresholds/fences untouched (120 ms RTT, 1.5 m position, 180 s duration, 299 s hard stop, sample requirements). `src/legacy-main.ts` measures 37386 lines vs the 37396 ceiling (net −9 on this lane).
- [NOTE] Requested skills `browser-multiplayer-netcode` and live repo contracts are not mounted in this session (`skill://` resolves to none available); the fix follows the brief's root-confirmed diagnosis and in-repo conventions instead.

## Commits

- `82e175f2` — fix source + behavioral tests (3 files, +141/−19), with Meta Muse trailer.
- Lane REPORT commit recorded below at handoff (this file only).

## Changed paths

- `src/respawn-loadout-authority.ts` — new pure helper `admitAuthoritativeRespawnLoadout(incoming, canonicalClass, {respawned, redeployed}, authoritativeHp)` plus `AuthoritativeRespawnTransition` type.
- `src/legacy-main.ts` — import extended (same line); the 17-line always-spread block in host `onNetworkMessage` state admission replaced with one 8-line helper call. All downstream fences (movement, primary/pickup repair, secondary/grenade gate, railgun/timed-map holder fences, `clampAdmittedHeldWeapon`, reload weapon-mismatch cancel, store/broadcast) run unchanged.
- `src/respawn-loadout-admission.test.ts` — 4 behavioral tests (new file).

## Fix 1 (ROOT CONFIRMED BUG): continuous state no longer resets to authored primary

- Defect: the host branch spread `authoredRespawnLoadout(...)` over **every** admitted snapshot. The helper always sets `weapon = primary`, so each ordinary guest state erased a legitimate secondary swap and tripped the pending-reload `weapon-mismatch` cancel on secondary reloads. The ternary only chose the *seed* (canonical vs incoming), never whether to reset.
- Fix: the helper resets to the authored loadout only at a real boundary — respawn seeds from the host-retained canonical class (`remote.snapshot` primary/secondary/grenade, since the guest packet may carry the prior special), redeploy seeds from the already-authorized incoming selection — and on continuous state returns `{...incoming, hp: authoritativeHp}`, preserving the admitted weapon for the fences.
- Behavioral cases (`src/respawn-loadout-admission.test.ts`): continuous secondary (`pistol`) survives with authoritative hp; real respawn drops a prior `railgun` claim to canonical `m4a1/pistol/flash` + primary; redeploy adopts authorized `smg/machine-pistol/smoke` + primary; forged continuous `sniper` over `m4a1/pistol` is preserved by the helper (not laundered) and still clamped to `m4a1` by `clampAdmittedHeldWeapon`.

## Investigation 2 (ROOT EVIDENCE): observer staleness — no narrow production defect fixed

- First-sample position divergences (4 at second 0, `seq1/cont1` vs host `seq144/cont3` after the stair setup) are the known QA-teleport transient: the teleport helper deliberately starts a new continuity domain and the host-only bump (`killstreakRuntime.recordActorDeath` + broadcast) has no observer-side counterpart yet. Converges; not a production path.
- Bulk finding (325/345 divergences are `presence`, `stale-snapshot-never-applied`): from second 4, each guest sees host + self only (`remotes: 1`) while the host sees both guests fresh (ages 17–35 ms at second 4, same stair coordinate `[-5.63, 3.31, 19.65]` for both). `guestB` misses `a68745` ×163 samples, `guestA` misses `43caf5` ×149.
- Why no source fix: the host broadcast excludes only the subject owner and the team relay gate filters only `ping`, so cross-relay is sent; snapshot admission accepts new continuity and movement distance here is ~0; creation precedes all gates, so the next relayed message would recreate the replica; the 12 s expiry cannot explain a 4 s onset. No narrow defect identified — relaxing movement/continuity/stale gates or the `acceptRemoteReloadResult` observer `lifeId !== remote.continuity` guard (which correctly explains reload invisibility as a *consequence* of the missing replica) would weaken host authority without a confirmed cause.
- Second-90 transient (host loses `43caf5`, `guestB` sees only self, recovered by second 120) reads as transport/leave churn around the rejoin scenario, not admission logic.
- Candidate for root: if cross-relay is confirmed arriving, the reliable state-commit mirror (currently owner-only via `sendStateCommitReliablyToPlayer`) is the existing recovery message that could carry the canonical revision to observers — but that is a protocol/topology change needing root approval, explicitly out of scope.

## Checks: executed vs OPEN

- [EXECUTED] `git diff --check` — clean.
- [EXECUTED] `git status` — only the 3 intended files, committed as `82e175f2`.
- [EXECUTED] `legacy-main` line count — 37386 ≤ 37396 ceiling, ratchet-safe.
- [EXECUTED] Negative-case review (no `node_modules` in this worktree, so no runtime): pickup-authorized primary changes still admit before the helper output reaches the primary gate; `remoteLoadoutSidearm` dhv-X mapping untouched; `respawned` recomputation (`respawnAdmission.respawned || redeployed`) unchanged for movement/inventory reset; non-host path untouched.
- [OPEN] `npx tsc --noEmit`, focused Vitest gate (`respawn-loadout-admission`, `hf498`, `hf504`, size ratchet), soak-contract units — for root (lane constraints: no build/install; dependencies absent).
- [OPEN] Full Pass 95 MP soak (`PASS73_NATIVE_WEBGPU=1 npm run qa:mp-soak`) — for root. Fix 1 plausibly unblocks RELOAD-AFTER-DEATH (secondary reloads no longer cancelled by the forced primary reset), but only the real soak proves it. REPLICATION (325 presence), REJOIN-DAMAGE (`guestB: 0`), and sampler-timing (179/180) rows stay OPEN.

## Unresolved risks

- The observer cross-replica loss has no confirmed source cause; if root's live traces show the host broadcast arriving, suspect QA stacking (both guests teleported to the identical stair coordinate) interacting with interpolation/replica presentation rather than admission.
- `acceptRemoteReloadResult` drops results for missing/stale observer replicas by design; any recovery must come through replica restoration, never by loosening the `lifeId` match.
