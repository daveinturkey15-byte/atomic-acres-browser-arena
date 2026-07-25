# Atomic Player driver

This directory contains Jigglyclaw's low-latency Atomic Acres player-side tools. They are external QA/player tooling and are not shipped in the browser runtime.

## Current slice

- Drives the ordinary deploy/lobby controls with Playwright.
- Forces `performance` rendering and records the observed live pass.
- Supports `solo`, `host`, and `join` flows, private-room chat, Ready, and host-start.
- Uses a downsampled rendered-canvas coral-palette detector for first-pass visible-enemy tracking.
- Sends bounded keyboard/mouse-equivalent events and releases every held input on exit/failure.
- Uses `__ATOMIC_ACRES_DEBUG__.snapshot()` only after actions for aggregate verification and benchmark evidence. Hidden bot positions and direct QA aim/damage/teleport hooks are forbidden as gameplay inputs.
- Refuses non-local solo/host runs unless `--allow-live` is explicit, preventing accidental global-leaderboard pollution.

## Local solo benchmark

Start a production preview in one terminal:

```bash
npm run build
npm run preview -- --port 4173
```

Then run:

```bash
node scripts/agent-player/atomic-player-driver.mjs \
  --url http://127.0.0.1:4173/ \
  --mode solo \
  --duration 20
```

Artifacts are written under ignored `artifacts/agent-player/` and include start/final screenshots plus `report.json`.

On this WSL host, headless Chromium uses SwiftShader. Compositor captures are intentionally on-demand rather than continuous: background WebGL screencast/readback can starve input-release RPCs. `--fire-check` opts into one local mechanical shot, but is disabled by default because first-shot shader/audio work has wedged SwiftShader; combat performance must be judged in GPU-backed Windows Chrome.

## GPU-backed Windows combat lane

The dedicated Windows runner uses a separate temporary Chrome profile and CDP port; it does not attach to or close Dave's normal Chrome profile. Launch it from WSL with:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File \
  "$(wslpath -w /root/.hermes/scripts/launch_atomic_player_chrome.ps1)"
```

The Windows runner directory is:

```text
C:\Users\HB\AppData\Local\Temp\jigglyclaw-atomic-player-runner
```

A full non-scoring five-minute Latest baseline uses a 330-second outer deadline so the three-second warmup and post-match export can complete:

```powershell
node.exe scripts\agent-player\atomic-player-driver.mjs `
  --cdp-url http://127.0.0.1:9333 `
  --url "<latest-channel-url>&multiplayerQa=1" `
  --allow-live --mode solo --duration 330 --wait-for-match-end `
  --width 960 --height 540 --output artifacts\full-5min-baseline
```

The driver uses the visible Performance canvas and HUD for live decisions, requires a trusted ordinary click for pointer lock, and downloads both post-match JSON files. Analyse the result repeatably with:

```bash
node scripts/agent-player/analyze-combat.mjs \
  --directory <artifact-directory>
```

This writes `combat-baseline.json` with combat, contact-window, perception, latency and input-safety metrics. Treat the observed channel URL/menu pass plus the human summary `build` field as build provenance; Pass 63 technical exports currently retain an older `context.sourceId`, so that field is diagnostic context rather than release proof. Stop and verify the dedicated browser after every run:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File \
  "$(wslpath -w /root/.hermes/scripts/stop_atomic_player_chrome.ps1)"
```

Do not push or open a game-source PR for player-harness work unless Dave explicitly asks.

## Private lobby shapes

Host with two hosted bots, send a lobby message, ready, and start:

```bash
node scripts/agent-player/atomic-player-driver.mjs \
  --url <latest-build-url> --allow-live --headed \
  --mode host --host-bots 2 --chat "Jigglyclaw ready." --ready true --start \
  --lifecycle-only
```

`--lifecycle-only` verifies hosted-match start and bot presence without WebGL
readback. Use it for the WSL/SwiftShader gate; integrated hosted perception and
combat belong on GPU-backed Windows Chrome.

Join Dave's room, chat, and ready:

```bash
node scripts/agent-player/atomic-player-driver.mjs \
  --url <latest-build-url> --headed \
  --mode join --room <ephemeral-room-code> \
  --chat "Jigglyclaw joined and ready." --ready true
```

Room codes are never written to reports. Do not paste them into committed files, Obsidian, AKP, logs, or screenshots intended for handoff.

## Verification

```bash
node --test scripts/agent-player/*.test.mjs
node scripts/agent-player/build-channels.mjs \
  --require-latest-pass 63 \
  --output artifacts/agent-player/build-channels.json
```

The build tracker reads the deployed release-channel config and records both
Latest and Stable pass numbers/URLs. Update the required pass whenever Dave
shares a promoted build or the live channel changes; inspect the matching
`acceptance/pass-N.json` and changelog before adapting controls.

A benchmark is only green when the report observes Performance mode, gameplay starts where requested, inputs are released at exit, and the browser has no page exceptions. Target detections and shots are performance/behaviour measurements, not a correctness oracle; inspect the saved screenshots while tuning the pixel detector.

## Planned refinement

1. Tune false positives using real served frames from each latest pass.
2. Add optical-flow confirmation and HUD-only OCR without hidden world state.
3. Add an event-driven tactical-policy socket for the `atomicplayer` Hermes profile.
4. Add private-lobby lifecycle and chat/Ready E2E receipts.
5. After latest succeeds, run the same read-only compatibility harness against pinned Stable and record differences by pass.
