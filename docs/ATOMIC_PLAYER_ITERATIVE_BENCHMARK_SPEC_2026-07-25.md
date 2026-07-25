# Atomic Player Iterative Archive and Benchmark Specification — 2026-07-25

## Overview

Jigglyclaw will improve as an ordinary, fair Atomic Acres player through an immutable sequence of archived games. Every match Jigglyclaw starts—complete, partial, failed, or calibration—must produce an archive entry. Every completed match must be compared with both the immediately previous comparable game and the fixed first full-round baseline.

This is external player-learning tooling only. It does not modify, push, or propose changes to Atomic Acres game source.

## Context

Fixed full-round baseline `G0001`:

- Latest Pass 63, Performance rendering, solo, 303 seconds including warmup.
- Defeat 0–17; 534 shots, zero credited bot hits, zero bot damage.
- 680/709 raw target frames; first saved target was countdown/UI rather than an operator.
- GPU render near 29 FPS; on-demand perception near 2.35 FPS.
- Inputs safely released; no page errors.

## Requirements

- **R1 — immutable game archive:** Every started game gets a monotonically increasing `G####` identifier and a dedicated directory. Existing game directories are never overwritten.
- **R2 — complete evidence:** Preserve driver report, human summary, technical report when available, benchmark JSON, comparison JSON, screenshots, contact sheet, file hashes and a Markdown summary.
- **R3 — canonical index:** Maintain one versioned `archive/index.json` containing ordered games, baseline ID, comparable predecessor, status and relative artifact paths.
- **R4 — explicit provenance:** Record observed URL/channel/menu pass and human-summary build separately. Stale technical `context.sourceId` is diagnostic context, not release proof.
- **R5 — all-metric comparison:** Compare every registered metric against baseline and previous comparable game. Each row records value, reference, delta, direction, tolerance and `improved|regressed|unchanged|informational|missing|incomparable`.
- **R6 — hard safety gates:** Performance profile, ordinary player slot, visible-state decisions, pointer lock for combat, bounded input, release-at-end, no forbidden inputs and no page errors are invariant checks rather than weighted score fodder.
- **R7 — fair perception:** Combat decisions may use rendered gameplay pixels and visible HUD only. No hidden opponent coordinates, network state, debug target data or game-source modifications.
- **R8 — honest contacts:** Keep raw colour candidates, temporally confirmed visual targets, firing attempts, credited bot hits, damage and kills as separate metrics.
- **R9 — failure preservation:** A timeout, browser crash, missing download, partial game or failed safety check still receives a manifest and index entry with the exact failure state.
- **R10 — reproducibility:** Archive the player-harness commit, policy version, command arguments, viewport/capture mode, callsign and generated-file SHA-256 hashes.
- **R11 — no PR:** Harness commits remain on `local/jigglyclaw/atomic-player-harness` unless Dave explicitly requests upstream work.

## Metric registry

Higher is better unless noted:

- Combat: kills, K/D, credited hits, accuracy, bot damage, headshots, best streak.
- Lower is better: deaths, damage taken, shots per kill, time to first credited bot hit, warmup shots, unconfirmed fire pulses.
- Survival: median life, longest life and time to first incoming damage are higher-is-better.
- Perception: confirmed visual target frames, confirmed/raw ratio and capture FPS are higher-is-better; raw target saturation and screen-locked rejects are diagnostic unless tied to confirmed/credited evidence.
- Reliability: capture failures, dropped damage events, page errors and browser warnings are lower-is-better.
- Latency: median/p95 capture, perception-decode and observed input-hold latency are lower-is-better.
- Rendering: game FPS and frame cadence are higher-is-better; Performance profile is invariant.
- Safety/fairness fields are invariant and any failure is a hard regression.

A missing value never silently becomes zero. Metrics with no meaningful ordinal direction remain informational.

## Acceptance criteria

- **C1:** Unit tests prove deterministic game IDs, metric directionality, tolerance handling, missing values, safety hard failures and immutable index updates.
- **C2:** Migrating the existing baseline creates `G0001` without changing its source evidence and verifies every hash.
- **C3:** A synthetic second game produces comparisons versus `G0001` and previous game covering every metric in the registry.
- **C4:** Colour/UI fixtures reject top-right hostile-operator instructions and the central warmup countdown as fire authorization.
- **C5:** No shot is possible while the visible countdown is active or respawn/postgame UI is visible.
- **C6:** Firing requires a temporally confirmed, non-screen-locked target and is burst/cooldown bounded.
- **C7:** Reload requests are debounced and suppressed while the visible reload state is active.
- **C8:** No-target movement includes visible-frame stuck detection and a bounded reverse/turn escape action.
- **C9:** The dedicated Windows GPU run ends with no held inputs, no dedicated Chrome process and no port-9333 listener.
- **C10:** The next full Pass 63 game is archived and reports explicit improvement/regression/unchanged rows against `G0001`.

## Out of scope

- Modifying game bots, damage, maps, opponent visibility or authoritative game state.
- Database, dashboard, hosted service or cloud telemetry.
- Multiplayer with another human without a separate explicit request.
- Game-source push, PR, merge or deployment.
