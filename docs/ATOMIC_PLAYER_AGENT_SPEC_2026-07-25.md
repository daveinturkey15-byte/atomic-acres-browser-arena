# Atomic Player agent project — first implementation slice

Date: 2026-07-25
Owner: Jigglyclaw / Hermes on `jigglyclaw-wsl`
Impact: local process-only external player/QA tooling; not intended for an upstream PR unless Dave explicitly asks
Base: `1bd55076c952080d5f7a8a5b0b8869aaa0646a76` (Pass 63 Live source)

## Goal

Create a dedicated, low-latency Jigglyclaw player lane that can enter Atomic Acres through ordinary player and private-lobby controls, always use Performance rendering on the low-spec machine, play from visible information, and produce repeatable evidence for refinement.

## Requirements

- **R1 — Latest first:** identify and benchmark the current canonical latest/live pass before running Stable compatibility.
- **R2 — Performance invariant:** every gameplay launch on this machine must observe `render.profile === performance`; Quality/Blender is not a performance baseline here.
- **R3 — Ordinary player flow:** deploy, host, join, chat, Ready, and start through normal browser controls rather than direct world-state mutation.
- **R4 — Fair perception:** decisions use rendered pixels, visible HUD and allowed room chat. Hidden coordinates, through-wall state, `aimAtBot`, teleport, direct damage and other QA helpers are not gameplay inputs.
- **R5 — Bounded control:** key/button holds have deadlines; focus loss, pointer-lock loss, timeout, error, and normal exit release all inputs.
- **R6 — Evidence:** each run records pass/source identity where available, render profile, frame pacing, perception/input counts, aggregate outcome, browser errors, and screenshots without persisting room codes.
- **R7 — Resource discipline:** one fast live lane owns input. Terra/Luna/MOA may review replays offline later but do not vote inside the frame-critical loop.
- **R8 — No accidental public records:** local/private testing is the default; a non-local solo/host run requires explicit `--allow-live`.

## Acceptance checks

- **C1:** the dedicated `atomicplayer` Hermes profile exists, uses low reasoning, starts in the isolated contribution worktree, and carries the fair-play/performance/latest-first contract.
- **C2:** the vision unit fixtures accept the Performance Coral palette, reject Aqua, select the nearest plausible component, and reject large scenery.
- **C3:** a local Pass 63 served benchmark starts an ordinary bot skirmish, observes Performance mode, exercises bounded movement/aim, saves evidence, and releases input.
- **C4:** the report contains no room code or hidden bot coordinates in its decision/action records and labels debug snapshots as post-action verification only.
- **C5:** TypeScript/static/unit/build gates remain green and the change-impact classifier reports process-only for `scripts/agent-player/**`.
- **C6:** Stable is not attempted until C1–C5 pass on latest.
- **C7:** shooting/combat is not green on WSL until GPU-backed execution is available; a forced first shot wedged SwiftShader and is opt-in only.

## Architecture

The browser driver is the reflex/input sidecar. On WSL it takes one on-demand low-quality compositor capture, downsamples to 320×180, extracts plausible visible Coral components, acts, then leaves a readback-free input-release window before the next capture. Continuous CDP screencast is forbidden on SwiftShader because ReadPixels starvation can block input-release RPCs. Hermes is not called every frame. The dedicated `atomicplayer` profile will later supply event-driven tactics, lobby communication and replay-directed policy updates.

The game's localhost debug snapshot is a verifier, not perception. It may confirm Performance mode, FPS, aggregate K/D and safety outcomes after inputs have been selected. Any future feature that uses hidden bot or remote positions to choose a live action violates this specification.

## Claim states

- **Observed:** canonical live chooser labels Pass 63 as live experimental and Pass 62 as the pinned stable fallback.
- **Observed:** Pass 63 has ordinary solo, host, join, room chat, Ready, hosted bots and Performance controls.
- **Observed:** the runtime already exposes detailed localhost QA snapshots and direct mutation helpers.
- **Decision:** retain those helpers solely for post-action verification; visible-pixel play remains a separate data path.
- **Observed:** the first detector treated minimap Coral markers as enemies; a conservative central ROI removed those false positives in the next served run.
- **Observed:** the latest clean-target local solo run acquired pointer lock, processed five visual frames with zero detected targets, moved **1.637877 metres**, released all inputs, and had no uncaught page exceptions. On-demand capture cost roughly **1.11–1.52 seconds per frame** in that run; this is a functional gate, not competitive latency. Chromium also logged one context-loss warning plus the known ReadPixels warnings, so WSL visual health is not a combat/performance pass.
- **Observed:** requested 350 ms key holds reached about **1.79 seconds** under SwiftShader scheduling jitter but remained below the configured 2 second watchdog and finished with no held keys.
- **Observed:** ordinary local host, chat and Ready passed; a hosted two-bot lifecycle start also passed when visual readback was disabled.
- **Observed:** non-scoring deployed lifecycle gates passed Latest Pass 63 first and Stable Pass 62 second with Performance mode and two bots.
- **Blocked on this host:** a forced first shot wedged the headless SwiftShader renderer and left its Playwright process group requiring termination. Combat and continuous hosted perception must run in GPU-backed Windows Chrome.

## Out of scope for this slice

- Publishing or changing the live game.
- Modifying netcode, weapon authority, bot AI, scoring or leaderboard behavior.
- Claiming competitive skill from one short benchmark.
- MOA in the real-time control loop.
- Publishing or submitting public leaderboard results from automated test runs.
