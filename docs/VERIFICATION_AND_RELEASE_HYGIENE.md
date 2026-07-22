# Verification and release hygiene

Atomic Acres uses one cross-platform verification contract for local work and CI. This document describes the current release gates rather than a historical implementation pass.

## Canonical gates

- `npm run lint` — browser and Worker type checks.
- `npm run verify:gameplay-contract` — generated gameplay contract and golden replay drift.
- `npm run verify:provenance` — manifest presence and SHA-256 validation, with CRLF checkout normalization only for declared text assets.
- `npm test` — browser/shared/Worker unit and property tests.
- `npm run leaderboard:check` — leaderboard Worker and browser policy tests.
- `npm run build` — production bundle.
- `npm run verify:release-tree` — forbidden and untracked release-tree checks.
- `npm run audit:dependencies` — production dependency audit.
- `npm run test:e2e:bounded` — serialized Chromium groups with Windows/Linux command selection.

`npm run verify` composes the full local gate. GitHub Actions runs static and unit gates on Windows and Linux, then the representative bounded browser groups on Windows.

## Portability contract

- Tracked text uses LF through `.gitattributes`; generated gameplay baselines and manifest verification normalize only CRLF checkout differences.
- Node wrappers invoke Playwright through the local Node-resolved CLI entrypoint, avoiding Windows `.cmd` spawn differences.
- Linux headed groups use `xvfb-run`; native Windows runs Chromium directly.
- Blender authoring sets `PYTHONHASHSEED=0` inside Node rather than with POSIX-only shell syntax. `AUTHORING_DRY_RUN=1` mechanically checks command composition without launching Blender.
- The Pass 52 changelog QA command builds the app, owns its preview-server lifecycle, and tears down the full Windows process tree.

## Asset and legal hygiene

- Runtime assets and source/provenance records remain SHA-256 checked through `assets.manifest.json`.
- The texture contact sheet is documentation-only and no longer ships from `public/`.
- Rejected third-party candidates remain outside the public release tree.
- Atomic Acres is an original retro-future arena. Do not copy protected branding, geometry, names, audio, or art from another franchise.

## Current technical notes

- Large runtime dependencies are split into explicit PeerJS/Three.js chunks. Rapier remains a separately emitted physics chunk; its size is visible in build output rather than hidden by a raised warning threshold.
- Multiplayer lifecycle tests cover stale same-peer callbacks, peer-owner replacement, and clean invalid-room recovery.
- Leaderboard streak keys are claimed before mutation; duplicate submissions do not replay writes, and failed leaderboard writes release the claim for retry.

## Verification gotchas

- **Symptom →** the Rustworks ship-ladder unit traversal passes, but a real browser descent walks across the upper deck and falls to ground. **Cause →** the player capsule can still contact the upper-deck slab edge when the ladder centreline is visually outside it, so the controller stays on the deck instead of settling onto the ramp. **Correction →** preserve capsule-radius clearance at the deck edge and stage route anchors at the standing 1.7 m eye height. **Verify →** run `npx vitest run src/additional-maps.test.ts` and the `pass34-contracts` bounded browser group in both directions.
