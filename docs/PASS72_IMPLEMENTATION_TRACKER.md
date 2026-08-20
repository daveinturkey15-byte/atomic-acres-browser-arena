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

- FFA is the canonical new private-lobby default; TDM remains selectable.
- Added a host-only `RESET LOBBY · NEW CODE` action that closes the old room, clears the recovery checkpoint, and creates a fresh room through the existing host path.
- Added strict squad name/colour presentation metadata and a host-admitted `lobby-squad` protocol path that can update during waiting/countdown/active phases without mutating team authority.
- Reduced the M14 EBR damage envelope exactly 40% (`62/40` to `37.2/24`) while retaining falloff range and hit-zone multipliers.
- Halved authoritative fall-damage output while retaining impact-speed thresholds/calculation.
- Increased the shared flare projectile collision radius from `0.16m` to `0.24m`, retaining world-occlusion admission and bounded splash policy.
- Made map-owned Carpet Bomber damage produce environment provenance and `map:carpet-bomber` attribution rather than a player-owned killstreak kill.
- Routed explosive crossbow bolt detonation through the existing occlusion-aware replicated glass-break helper.
- Allowed replicated Chopper/Drone support-shot audio cues on teammates while retaining owner-only tracer/damage HUD presentation.

## Release topology added for this pass

- Promoted the candidate identity and player-facing changelog to Pass 72.
- Added an exact pinned `PASS 70` previous-live channel at `channels/pass70-retained`, sourced from Pages SHA `3b5e675c54eaea2a2dd721eca6f247c933361587` and runtime tree digest `c8f6aeed492cd747ef83aa41bdc0d05f2fd86264418d40d0ebbd0916c85d6160`.
- Kept the exact Pass 69 retained channel, Pass 67.1 stable-source pin, Pass 63 stable WebGL rollback, and Pass 62 best-ever benchmark record unchanged.
- Extended the chooser and browser smoke matrix to verify Pass 72, Pass 70, Pass 69 and Pass 63 independently, including legacy `release=previous` and `release=pass69` routes.

## Verified

- `npm test -- --run --reporter=dot`: 367 files passed, 1 skipped; 2,580 tests passed, 2 skipped.
- `npx tsc -p tsconfig.json --noEmit`: passed.
- `npm run build`: passed; generated `dist/` with `legacy-main` 1,433.01 kB, Rapier 2,234.73 kB, Three vendor 1,427.98 kB. Vite emitted the existing large-chunk advisory; it was not suppressed.
- Focused Pass 72/lobby/protocol/provenance/crossbow/audio suites passed.
- Local staged-topology verification passed: Pass 72 candidate, 516-file Pass 70 previous wrapper, 516-file Pass 69 wrapper, Pass 67.1 stable and Pass 63 rollback.
- Local chooser/provenance browser smoke passed for all four public choices and legacy routes.
- The first fresh Windows CI run exposed only a default 5-second timeout on the exhaustive arm-rig catalog test; the unchanged assertions now have a 15-second cross-platform harness budget, and the full local suite remains green.
- The first pre-implementation repository preflight passed. The second preflight correctly refused while the worktree was dirty; it must be rerun after commit.

## Unknowns / explicit falsifiers

- Installed Chrome/Firefox two-browser, two-machine LAN, WAN/NAT, host-process-loss recovery and exact WebGPU adapter/backend evidence remain **UNPROVEN** here.
- Native HF-296 contact matrix, exact first-explosive frame/long-task/GPU distributions, subjective audio HITL, Terminal zero-z-fighting capture, all-map invisible-blocker/prone-contact matrix and immutable preview inspection remain **UNPROVEN**.
- No protected publication, Pages mutation, merge or release workflow was performed in this pass.

A native or release receipt must not promote any of those unknowns merely because the mechanical suite is green.
