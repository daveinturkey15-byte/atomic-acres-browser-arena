# Atomic Acres Pass 25A — Baseline and Bug Harness

**Date:** 2026-07-16
**Branch:** `overhaul/pass25a-baseline-bug-harness`
**Behavioral reference:** Pass 24 source `3a1ead06bfdede4b3d6c96f9ecde228520c04ccf`
**Public deployment:** canonical source `204f9b19f9bbef05861c839d6cdd6bab2d99eaf4`; Pages `86daf8fff1a1940bb9e8b99417766e487c8eb898`

## Purpose

Pass 25A freezes the approved movement, traversal, aim, inventory, match and multiplayer behavior as executable evidence before Pass 25B changes presentation. It also contains the owner-authorized shotgun, Tri-Pass, streak, spawn and default-profile deltas plus direct defect fixes; no unrelated balance or art change is permitted.

## Implemented safety net

### Checked behavior contract

- `src/gameplay-contract.ts` serializes the current weapon registry, movement profiles, 120 Hz simulation rate, match/melee/grenade constants, character-controller settings, arena layouts, house navigation, field supports, death drops, loadouts, lighting and render-profile contracts.
- `scripts/qa/generate-pass25a-baselines.ts` generates or verifies:
  - `baselines/pass25a/gameplay-contract.json`;
  - `baselines/pass25a/golden-replays.json`.
- Normal verification uses `npm run verify:gameplay-contract`; contract drift fails instead of silently rewriting the oracle.

### Deterministic replay and randomness

- `src/deterministic-rng.ts` supplies reproducible, independently forked gameplay, presentation and protocol streams.
- `src/runtime-random.ts` accepts optional `?seed=...`, otherwise uses a cryptographic runtime seed.
- Production source has zero direct `Math.random()` calls.
- The debug snapshot records the seed and all three stream states; network nonces cannot perturb combat randomness.
- `src/gameplay-replay.ts` executes fixed 120 Hz command traces and produces canonical FNV-1a state hashes.
- Each checked replay stores its input commands, initial and per-tick hashes, per-command checkpoints, final state/hash and explicit shot schedule so the first divergent tick/action can be reproduced.
- Golden traces cover locomotion/recovery, all weapons/reload/melee and interruption/respawn flow.

### Generated and mutation testing

- `src/gameplay-state-property.test.ts` runs 10,000 generated command sequences by default and 100,000 via `npm run test:property:nightly`.
- `stryker.config.mjs` mutates deterministic RNG, canonical state and replay authority with:
  - hard break threshold: `85%`;
  - zero ignored mutants;
  - local JSON report: `artifacts/pass25a/mutation/mutation.json`.
- Fresh accepted mutation result: `88.93%` total; 269 killed, 4 timed out, 31 survived, 3 no-coverage and 0 errors.

### Browser and visual evidence

- Playwright retains traces on the first failure in `artifacts/pass25a/playwright-results/`.
- `tests/e2e/pass25a-baseline.spec.ts` covers:
  - checked Chromium menu screenshot;
  - all six weapons in hip fire and ADS across `960×540`, `1280×720` and `1920×1080`;
  - actual reticle centre, camera ray and principal pellet alignment;
  - WebGL context loss/restoration without page reload;
  - focus-loss input neutralization, pointer-lock reacquisition and resize;
  - twenty complete match/rematch cycles;
  - bounded static-shadow refreshes plus a framebuffer-output change for a moving Blender-profile caster.
- `tests/e2e/pass25a-capability.spec.ts` runs Chromium, headed-Xvfb Firefox and WebKit capability smoke.
- Controlled image oracle:
  - `tests/e2e/pass25a-baseline.spec.ts-snapshots/pass25a-performance-menu-chromium-linux.png`.
- `scripts/qa/run-bounded-e2e.mjs` runs scenario groups serially instead of one fragile monolithic Chromium command.

### Browser/GPU and soak evidence

- `scripts/qa/capture-pass25a-environment.mjs` records browser, Node, OS, viewport, DPR, masked WebGL identity, lockfile hash, render-profile constants and frame telemetry; unmasked renderer, user agent and hardware concurrency are deliberately excluded.
- Reference environment:
  - `baselines/pass25a/reference-environment.json`;
  - Chromium `149.0.7827.55`;
  - masked WebGL identity `WebKit / WebKit WebGL` under headed WSL/Xvfb.
- This software-rendered environment is not used to claim end-user GPU FPS. Product-facing performance remains protected by draw-call, triangle, presentation and browser gates.
- `scripts/qa/run-pass25a-soak.mjs` provides a 30-minute seeded solo browser soak with an actual WebGL loss/restore cycle, frame heartbeat, heap growth, hard effect-pool caps and rematch handling.
- `scripts/qa/run-network-chaos-soak.ts` independently runs the adverse deterministic authority stream for 30 minutes, failing on zero work/acceptance, duplicate side effects, low acceptance or excessive Node RSS growth. It is deliberately labeled authority-layer evidence rather than a claim that CDP can impair WebRTC data channels.

### Multiplayer disorder and lifecycle

- `src/network-chaos.ts` defines seeded clean, normal and adverse profiles including latency, jitter, loss, duplication, reorder and a two-second outage.
- `npm run qa:network-chaos` runs 1,000 seeds per profile through existing remote-shot admission.
- Accepted matrix:
  - clean: `100,000` deliveries, `100,000` accepted;
  - normal: `99,561` deliveries, `98,972` accepted;
  - adverse: `77,473` deliveries, `68,949` accepted;
  - duplicate side effects: `0` for every profile.
- `scripts/qa/verify-multiplayer.mjs` now records exact failed-response URLs and supports headed-Xvfb cadence.
- Fresh multiplayer lifecycle evidence: **20/20** host/join/leave cycles, zero errors, one remote observed on both peers in every cycle, and host departure observed each time.
- `scripts/qa/verify-multiplayer.mjs` also proves stance, shot-window, explosive-window, sniper death/drop, scavenge and pickup replication.

## Confirmed fixes and owner-approved deltas

See `docs/PASS25A_DEFECT_LEDGER_2026-07-16.md` for evidence and classifications.

1. Recoverable WebGL context loss no longer triggers fatal pause plus page reload.
2. Blender static shadows refresh at most once per 100 ms while dynamic casters exist instead of freezing operators into the first shadow map.
3. Mutable root dependency declarations are pinned exactly.
4. Gameplay and presentation randomness are independently seedable.
5. Contract drift, replay drift, generated-state regressions and insufficient test sensitivity are executable failures.
6. Yardhawk collides with solid geometry; grenade blasts break replicated semantic glass; broken panes no longer block later pellets.
7. The west greenhouse collider matches its open-frame art; bots traverse authored interior ramps vertically.
8. Minimap is player-up, bot facing matches the `-Z` model axis, and the sniper head proxy is enlarged.
9. New players default to Blender Render, with explicit Performance/Quality preserved.
10. There are 24 valid authored spawns; respawns use gameplay RNG within the ten farthest from every living actor.
11. Model 12 damage is `17`; Tri-Pass is `7.5` radius / `225` maximum damage; streak progression restarts after the final reward.

## Current verification evidence

- `npm test`: **43 files / 203 tests passed**.
- `npm run test:property:nightly`: **100,000 generated invariant sequences** plus **20,000 deterministic replay-hash sequences** passed in 153.2 seconds.
- Stryker: **88.93%**, above the hard 85% floor.
- Bounded E2E: all eight groups exited zero—Pass 25A Chromium baseline, Chromium/Firefox/WebKit capability, boot/authored, field-kit, solo, and performance/quality. One reload-interruption poll was classified as a harness race, made atomic, then passed three retry-free repeats.
- Focused owner regressions pass for Blender default/fallback, Yardhawk cover collision, streak looping, bot ramp traversal, close-range shotgun, sniper lethality, grenade/shot glass, west-greenhouse collision, player-up minimap and 24 valid spawns.
- Live PeerJS behavior passes, including replicated explosive glass; lifecycle passes **20/20** with zero errors.
- Network-chaos matrix passes 1,000 seeds/profile with zero duplicate effects; zero seeds fail closed.
- Full adverse-network soak passed: 1,800,001 ms, 35,467 iterations, 2,447,439 accepted deliveries, zero duplicate effects, `0.8902` acceptance ratio and only 2,482,176 bytes final RSS growth.
- Full browser soak passed: 1,800,000 ms requested, 351 samples, zero errors, context recovery exercised, `12.05%` garbage-collected heap growth, and maxima of 6 particles / 8 marks / 1 tracer.
- Production build, release-tree check and production dependency audit pass; audit reports zero vulnerabilities.

## Commands

```bash
npm run verify:gameplay-contract
npm run test:property
npm run test:property:nightly
npm run test:mutation
npm run qa:network-chaos
npm run qa:network-chaos:soak
npm run test:e2e:bounded
npm run verify:pass25a:core
npm run verify:pass25a
```

Local live multiplayer:

```bash
npm run preview -- --port 4180
npx peer --host 127.0.0.1 --port 9000 --path /peerjs --no-allow_discovery
xvfb-run -a env QA_HEADED=1 QA_BASE_URL=http://127.0.0.1:4180/ QA_PEER_PORT=9000 QA_RENDER_MODE=performance npm run qa:multiplayer
xvfb-run -a env QA_HEADED=1 QA_BASE_URL=http://127.0.0.1:4180/ QA_PEER_PORT=9000 QA_MULTIPLAYER_CYCLES=20 npm run qa:multiplayer:lifecycle
```

Reference environment and thirty-minute soak:

```bash
xvfb-run -a env QA_HEADED=1 QA_BASE_URL=http://127.0.0.1:4180/ npm run qa:environment -- --record
xvfb-run -a env QA_HEADED=1 QA_BASE_URL=http://127.0.0.1:4180/ QA_SOAK_MS=1800000 npm run qa:soak
QA_NETWORK_SOAK_MS=1800000 npm run qa:network-chaos:soak
```

## Gotchas

### Standalone headless Chromium can suppress RAF cadence

- **Symptom:** the game loads, but `frameCount` advances only a few times and frame-pacing samples remain zero.
- **Cause:** standalone headless Chromium is compositor-throttled in this WSL environment; Playwright Test and headed Xvfb behave differently.
- **Correction:** use headed Chromium under `xvfb-run` for timed soak/performance evidence. A CDP screencast heartbeat is acceptable for functional scripts only and must be labeled instrumentation-capped.
- **Verify:** environment manifest says `headed Chromium under Xvfb` and reports non-zero frame samples.

### Firefox headless does not produce the first 3D draw here

- **Symptom:** menu DOM is ready, but the arena remains a flat clear colour and draw calls stay zero.
- **Cause:** this host's headless Firefox compositor does not advance the WebGL frame.
- **Correction:** run the Firefox capability smoke headed under Xvfb.
- **Verify:** renderer-owned WebGL version contains `WebGL 2`, draw calls are non-zero, and no page errors occur.

### `tsx` follows this package's CommonJS shape

- **Symptom:** a TypeScript QA script fails with `Top-level await is currently not supported with the "cjs" output format`.
- **Cause:** the package does not declare ESM with `"type": "module"`.
- **Correction:** wrap asynchronous TypeScript QA entry points in `async function main()`; keep `.mjs` scripts as native ESM.
- **Verify:** the script exits zero under its package command.

### Root Pages publish can delete archived review builds

- **Symptom:** canonical `dist/` publishes successfully, but every historical `/review/*` path disappears from `gh-pages`.
- **Cause:** `gh-pages -d dist` mirrors only `dist/` and removes destination files absent from that directory.
- **Correction:** publish with `gh-pages -d dist --add`. If an earlier publish removed archives, restore only `review/` from the prior Pages revision while retaining the new canonical root.
- **Verify:** the remote canonical `index.html` hash equals `dist/index.html`, the new Pages root returns HTTP 200, the restored `review/` tree hash equals its prior revision, and a representative archived review URL returns HTTP 200.

## Canonical promotion

Dave approved canonical promotion on 2026-07-16. Source `204f9b19f9bbef05861c839d6cdd6bab2d99eaf4` was built and published to Pages revision `86daf8fff1a1940bb9e8b99417766e487c8eb898`.

- Canonical URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/`
- Traceable URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/?source=204f9b1&pages=86daf8f`
- Verification: canonical HTTP 200; remote/local `index.html` SHA-256 `80b0d68ec7b691275c871ede15123453ac2734e44951184d59246f3abbf777d3`; archived Pass 24 review HTTP 200.

## Promotion rule

Pass 25A was promoted only after all gates passed and Dave explicitly approved going live. Future gameplay-contract or presentation changes still require classification, verification, owner review, and a separate promotion decision.
