# Verification and release hygiene

Atomic Acres uses one cross-platform verification contract for local work and CI. This document describes the current release gates rather than a historical implementation pass.

Contribution ownership, branch identity, PR receipts, integration serialization, and production promotion are defined in [Contribution and production pipeline](CONTRIBUTION_AND_RELEASE_PIPELINE.md).

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
- `node scripts/release/acceptance-gate.mjs` — Pass 62+ requirement coverage, evidence, immutable preview, and exact-SHA human approval.

`npm run verify` composes the full local gate. GitHub Actions runs static and unit gates on Windows and Linux, then the representative bounded browser groups on Windows.

CI selects browser work from the exact changed paths with `scripts/release/change-impact.mjs`:

- `process-only`: retain both cross-platform static/unit jobs; skip Chromium installation and execution.
- `release-shell`: run only the chooser/release-shell browser smoke on Windows and Linux.
- `runtime`: run the full representative browser groups and any focused evidence required by the changed surface.

Unknown or unresolvable diffs select `runtime`. This classification changes cost, not product standards: the integrator may always escalate a class, and may not downgrade one by relabelling the PR.

For `runtime` and `release-shell` PRs, the Linux static job also uploads the built `dist/` tree with a SHA-256 tree receipt as `pr-preview-<pr>-<head-sha>`. The `requirements-acceptance` job deliberately remains red until the Pass 62+ manifest records Dave's approval of that immutable candidate. Only manifest/process paths may change after the approved preview; otherwise the gate demands a new preview and approval.

The final production gate runs after GitHub Pages reports the exact published SHA as built. It exercises the public chooser, all three release channels, room-link routing, pass labels, HTTP failures, request failures, page exceptions, and application warnings/errors. Its JSON and screenshots are embedded in the production receipt.

The non-product `pipeline-metrics` job measures workflow wall time, job start delay, execution time, acceptance coverage, feedback-to-preview, and preview-to-approval. This supplies comparable build-to-build data without weakening any required check.

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

- **Symptom →** a local browser gate times out against the wrong build while Vite reports that port 4180 is already in use. **Cause →** the preview wrapper accepted an unrelated listener as its own readiness signal before its child process finished failing. **Correction →** the wrapper now proves its requested port is free before spawning; concurrent tasks must set a unique `QA_PORT`. **Verify →** an occupied port fails immediately with `QA port ... is unavailable`, while an unused port starts, tests, and tears down only its own process tree.
- **Symptom →** the Rustworks ship-ladder unit traversal passes, but a real browser descent walks across the upper deck and falls to ground. **Cause →** the player capsule can still contact the upper-deck slab edge when the ladder centreline is visually outside it, so the controller stays on the deck instead of settling onto the ramp. **Correction →** preserve capsule-radius clearance at the deck edge and stage route anchors at the standing 1.7 m eye height. **Verify →** run `npx vitest run src/additional-maps.test.ts` and the `pass34-contracts` bounded browser group in both directions.
