# Atomic Acres Pass 59 implementation report

Date: 2026-07-23
Owner: GPT-5.6 Sol High via Codex for the bounded implementation pass, followed by Hermes Desktop as sole integrator/verifier after handoff
Assigned worktree: `C:/Users/david/projects/atomic-acres-pass59-20260723`
Protected baseline: `f55529f1d185a5e32f330998a589519e7a548d92` (Pass 58)
Production/stable action: none; chooser and pinned Pass 57 configuration were not modified.

## Implemented outcome

Pass 59 separates human PvP, hosted-bot, and solo-bot authority paths; adds host-owned bot counts of 2 or 4 while preserving the ordinary disabled/no-bot state; admits combat events through bounded sequence and timestamp windows; attaches explicit kill provenance; makes remote grenade/support effects presentation-only; records canonical damage and reconciliation telemetry; adds deterministic mode-aware spawn scoring; repairs the three frozen map geometry/collision sets; fixes LMG physical ADS sights and HUD feeds; and adds bounded player-downloadable post-match diagnostics.

The browser contracts target the following evidence files when run in an environment that permits Chromium workers:

- `artifacts/pass59/browser/rustworks-1v1.png`
- `artifacts/pass59/browser/skyline-terminal.png`
- `artifacts/pass59/browser/atomic-acres.png`
- `test-results/pass59-range-lmg-damage.png`
- `test-results/pass59-kill-provenance-support-column.png`
- `test-results/player-feedback-round-stats.png`
- `test-results/release-multiplayer-host.png`
- `test-results/release-multiplayer-guest.png`

No screenshot is classified as captured unless the corresponding Playwright command completed successfully.

## Observations

1. The assigned worktree contained no 2026-07-22 multiplayer browser log or artifact files. The only local evidence files found before implementation were the 2026-07-23 contribution preflight receipt and `preflight-pass59.log`. Therefore the reported host/guest contradictions could not be causally reconstructed from historical artifacts in this worktree.
2. Remote grenade and offensive-support activation messages had authority/admission code but no complete cosmetic non-owner presentation lifecycle.
3. Death messages did not carry an explicit kill cause, so score credit and killstreak eligibility could not be separated reliably at the protocol boundary.
4. Hosted private matches had no canonical hosted-bot count/state lane.
5. The LMG ADS selector was changed to a rear sight socket, but the authored model did not contain that socket. The socket was added and aligned to the physical rear/front sights.
6. The HUD test calculated whether support cards were vertically stacked but did not assert the result. The assertion and final all-breakpoint single-column CSS are now present.
7. Atomic Acres uses six authored transparent windows: four are deliberately breakable gameplay panes and two upper transparent panes are deliberately non-breakable. Pass 59 preserves that authored distinction.
8. The Codex sandbox could not create the shared worktree `index.lock`, so it handed the unstaged working tree to Hermes Desktop rather than bypassing the boundary. The integrator environment can stage and commit normally.
9. The Codex sandbox could not spawn Chromium workers. Hermes Desktop reran the browser work outside that sandbox: the bounded Pass 59 visual suite, targeted gameplay assertions, and same-machine two-peer multiplayer QA all completed successfully and produced the named evidence files.
10. Independent multiplayer QA and review exposed and corrected eight integration defects before handoff: hosted-bot weapon presentation was applied to the wrong scene node, leaderboard synchronization raced first remote creation, the multiplayer QA high-score fixture still used an obsolete storage schema, a guest-owned `leave` packet could remove the host's remote actor without terminating the bound transport, maximum player-plus-bot score snapshots exceeded the protocol's old six-row limit, hosted-bot targeting ignored eligible remote humans, replicated bot damage only reconciled health downward, and grenade/support QA stopped before effect cleanup. The leave path now closes the bound guest session, retains host combat authority through the active-match rejoin grace window, and expires that authority with the slot. Score snapshots admit the bounded six-player/four-bot maximum, hosted bots choose the nearest eligible local or remote enemy, guests reconcile to canonical host health, and QA requires bot-to-guest damage plus grenade/support lifecycle completion.

## Inferences

1. The missing kill provenance and mixed local/canonical feedback paths were sufficient mechanisms for recursive streak progress and contradictory feeds; explicit protocol provenance plus score-delta presentation removes those mechanisms.
2. A symmetric bounded timestamp/sequence admission policy improves abuse resistance and removes guest-only stale/duplicate acceptance differences without deliberately delaying the host. This is not a full historical rewind simulation.
3. Reusing the existing documented solo Bot Skirmish damage multiplier and AI/lifecycle functions for hosted bots is narrower and less error-prone than forking multiplayer-specific bot difficulty rules.
4. Presentation-only remote effects plus a single host-verified hit path prevent visual replication from becoming a second mutation/damage path.

## Assumptions

1. The existing `BOT_DAMAGE_MULTIPLIER = 0.25` is the canonical low-damage Bot Skirmish rule. Hosted bots reuse it unchanged; no host/guest-specific buff or nerf was introduced.
2. `0` remains the pre-existing disabled/no-bot hosting state. The only enabled hosted-bot quantities are exactly `2` and `4`.
3. A 350 ms maximum combat-event age, 80 ms future tolerance, 512 sequence-gap cap, and 180 ms recorded rewind ceiling are conservative browser-hosted bounds pending WAN measurements.
4. The protected baseline plus local Pass 59 worktree label is the best available diagnostic source identity until Git can create a local candidate commit.

## Unknowns

1. WAN, TURN/relay, NAT traversal, mobile-network jitter, geographic latency, and multi-machine clock behavior are unexercised. Same-machine PeerJS/WebRTC is not evidence for those paths.
2. The unavailable 2026-07-22 evidence means the original production symptom frequencies and exact causal ordering remain unknown.
3. Browser evidence verifies the exercised local Chromium and same-machine PeerJS/WebRTC paths only; it does not establish WAN/TURN behavior or every visual approach on every render profile.

## Falsifiers

- Any accepted stale, future, duplicate, or excessive-gap combat event falsifies the bounded admission contract.
- Any grenade, melee, environment, or killstreak kill increasing field-support streak falsifies the provenance contract.
- Any guest ability to change hosted-bot count, any enabled count other than 2 or 4, duplicate bot IDs after restart/rejoin, or divergent bot health/death/score falsifies hosted-bot authority.
- Any non-authoritative remote effect changing health or breaking a window falsifies cosmetic-only presentation.
- Any mismatch between visual map geometry and Rapier/ballistic collision, or any profile-dependent collider/audit count, falsifies the map contract.
- Any post-match export containing raw room codes, raw peer/session IDs, credentials/tokens, or private IPs, or exceeding 512 KiB/1,024 retained events, falsifies diagnostics privacy/bounds.
- Successful multi-machine WAN/TURN tests with different admission or convergence results would falsify the assumption that same-machine behavior generalizes.

## Integrator verification evidence

Hermes Desktop independently reran the following after the Codex handoff and after correcting the integration defects above:

- gameplay contract: 15/15 checks passed;
- Vitest: 94 files and 516 tests passed;
- the exact `gemini-3.6-flash-high` AGY sidecar ran as a bounded read-only critic with structural no-fallback arguments and a receipt; after a permission-denied repository-read attempt was preserved as failed, a no-tools evidence-inline retry exited 0 with non-empty output, found no high/medium flaw in the death-authority path, and correctly falsified a separate reviewer's guest-forged-death claim against `network.ts` transport filtering;
- lint/type checking, production build, leaderboard contract, provenance, release-tree, and dependency audit passed;
- bounded Pass 59 Chromium visual suite passed;
- targeted LMG/HUD, kill provenance, critical-damage, and rigged-model Chromium checks passed; the ephemeral LMG style assertion also passed three consecutive executions;
- same-machine host/guest multiplayer QA passed with two hosted bots, explicit host-authoritative bot-to-guest damage convergence, grenade detonation cleanup, support-effect cleanup, canonical damage, leaderboard convergence, synchronization windows, kill/death propagation, and zero unexpected captured page errors;
- visual inspection of the captured Atomic Acres, Rustworks, Skyline Terminal, and Shooting Range evidence found no obvious seam, floating/intersection, doorway, clipping, or HUD-overlap defect in the exercised views.

The contribution preflight is intentionally rerun only after the candidate is committed because it requires a clean tree and commit-bound receipt.

## Verification design

Focused deterministic coverage lives in the new provenance, hosted-bot, network-fairness, damage-matrix, spawn-safety, map/Rapier, HUD, and diagnostics tests. Browser coverage is encoded in `tests/e2e/pass59-visuals.spec.ts`, the Pass 59 additions to `tests/e2e/atomic-acres.spec.ts`, and `scripts/qa/verify-multiplayer.mjs`. Exact executed command results and blockers are reported in the final implementation handoff; a command is never treated as passed merely because its test contract exists.