# Pass 72 implementation tracker

**Recorded:** 2026-08-19T19:10:17+01:00
**Impact:** `runtime`
**Worktree:** `contrib/dave-gaming-pc/hermes/pass72-future-features`
**Source base:** `origin/main` at `130fd59bd2cf1e1719b802463219ddf36e2484d5`

## Observations

- The Desktop recovery ledger says Pass 70 recovery is complete, while Pass 71/PR #60 is not a releasable or published base. The next numbered continuation is therefore Pass 72.
- Current live PR #60 was observed as draft/failing before this work; no Pass 71 publication was inferred.
- The repository already contains the protected per-SHA PR preview artifact path in `.github/workflows/verify.yml`; no direct Pages route was added.
- Existing host checkpoint/rejoin, WebGPU/TSL fail-closed, arena prewarm and bounded audio voice contracts are retained.

## Implemented in this pass

This tracker covers the first bounded Pass 72 correction slice listed below. It
does not claim that the wider `atomicnext` backlog, native-browser matrices, or
owner HITL are complete; those remain separate work unless explicitly evidenced.

- FFA is the canonical new private-lobby default; TDM remains selectable.
- Added a host-only `RESET LOBBY · NEW CODE` action that closes the old room, clears the recovery checkpoint, and creates a fresh room through the existing host path.
- Added strict squad name/colour presentation metadata and a host-admitted `lobby-squad` protocol path that can update during waiting/countdown/active phases without mutating team authority.
- Reduced the M14 EBR damage envelope exactly 40% (`62/40` to `37.2/24`) while retaining falloff range and hit-zone multipliers.
- Halved authoritative fall-damage output while retaining impact-speed thresholds/calculation.
- Increased the shared flare projectile collision radius from `0.16m` to `0.24m`, retaining world-occlusion admission and bounded splash policy.
- Made map-owned Carpet Bomber damage produce environment provenance and `map:carpet-bomber` attribution, consistently retain victim damage/death totals, broadcast the authoritative scoreboard, and emit a canonical Carpet Bomber environment feed/diagnostic entry without creating a map score or awarding a player kill.
- Routed explosive crossbow bolt detonation through the existing occlusion-aware replicated glass-break helper.
- Allowed replicated Chopper/Drone support-shot audio cues on teammates while retaining owner-only tracer/damage HUD presentation.
- Bumped the multiplayer protocol to 18 so cached protocol-17 peers are rejected before the new squad/support-shot wire shape can be silently discarded.
- Made death transitions host-authored: the host event lane drops guest-forged death packets before app delivery while the same validated death shape still replicates from host to clients.
- Rejected initial guest joins in the reserved `map:` and `host-bot-` participant namespaces before credential binding, while retaining ordinary participant IDs.

## Release topology added for this pass

- Promoted the candidate identity and player-facing changelog to Pass 72.
- Added an exact pinned `PASS 70` previous-live channel at `channels/pass70-retained`, sourced from Pages SHA `3b5e675c54eaea2a2dd721eca6f247c933361587` and runtime tree digest `c8f6aeed492cd747ef83aa41bdc0d05f2fd86264418d40d0ebbd0916c85d6160`.
- Kept the exact Pass 69 retained channel, Pass 67.1 stable-source pin, Pass 63 stable WebGL rollback, and Pass 62 best-ever benchmark record unchanged.
- Bound both source-rebuilt fallbacks to the immutable timestamp of their pinned original Pages publication; Pass 63 can no longer inherit the new Pass 72 production-build time, and topology plus browser verification now check its exact timestamp and original Pages identity.
- Extended the chooser and browser smoke matrix to verify Pass 72, Pass 70, Pass 69 and Pass 63 independently, including legacy `release=previous` and `release=pass69` routes.

## Verified

- `npx vitest run --exclude src/release-topology.test.ts --reporter=dot`: 370 files passed, 1 skipped; 2,625 tests passed, 2 skipped. The commit-sensitive release-topology test remains pending until the final manifest is committed and rebound to the superseding immutable preview receipt.
- `npx tsc -p tsconfig.json --noEmit`: passed.
- `npm run build`: passed; generated `dist/` with `legacy-main` 1,435.96 kB, Rapier 2,234.73 kB, Three vendor 1,427.98 kB. Vite emitted the existing large-chunk advisory; it was not suppressed.
- Focused death-outcome/integration, Railgun ordering, provenance, Carpet damage, protocol, participant identity, connection lifecycle, changelog and acceptance-gate suites passed: 11 files and 142 tests.
- `npm run verify:gameplay-contract`: passed for frozen Pass 25A and Pass 65 candidate gameplay/replay baselines.
- The authoritative death outcome and real `processDeath` integration suites cover map-owned victim deaths, score broadcast wiring, canonical feed/diagnostics, removal of synthetic map score rows, ordinary hostile-player scoring, and consistent map damage attribution.
- The network lifecycle suite exercises a forged guest death through the real guest event lane, proves it is not delivered to the host app, then proves host-authored death replication still reaches the client.
- The participant-identity and network lifecycle suites cover both reserved namespaces and prove `map:` / `host-bot-` joins are rejected before any resume token, guest bundle or provisional replacement is bound.
- Local staged-topology verification passed: Pass 72 candidate, 516-file Pass 70 previous wrapper, 516-file Pass 69 wrapper, Pass 67.1 stable and Pass 63 rollback.
- Local chooser/provenance browser smoke passed for all four public choices and legacy routes.
- The first fresh Windows CI run exposed only a default 5-second timeout on the exhaustive arm-rig catalog test; the unchanged assertions now have a 15-second cross-platform harness budget and passed in the current non-topology suite.
- The next hosted Windows run exposed the owned Vite preview server's exact 60-second startup ceiling; only the web-server budget is now 180 seconds, while Playwright's 60-second test timeout and all browser assertions remain unchanged.
- The first pre-implementation repository preflight passed. The second preflight correctly refused while the worktree was dirty; it must be rerun after commit.

## Unknowns / explicit falsifiers

- Installed Chrome/Firefox two-browser, two-machine LAN, WAN/NAT, host-process-loss recovery and exact WebGPU adapter/backend evidence remain **UNPROVEN** here.
- Native HF-296 contact matrix, exact first-explosive frame/long-task/GPU distributions, subjective audio HITL, Terminal zero-z-fighting capture, all-map invisible-blocker/prone-contact matrix and immutable preview inspection remain **UNPROVEN**.
- No protected publication, Pages mutation, merge or release workflow was performed in this pass.

A native or release receipt must not promote any of those unknowns merely because the mechanical suite is green.
