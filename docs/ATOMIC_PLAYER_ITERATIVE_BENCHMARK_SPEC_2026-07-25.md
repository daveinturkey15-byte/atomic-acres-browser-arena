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
- **R12 — frozen player-policy hypothesis:** Before each counted game, record the one main player-policy change being tested, the expected metric movement, unchanged controls and rollback condition. Do not bundle perception, movement, aim and orchestration changes unless the run is explicitly labelled exploratory.
- **R13 — real configuration receipts:** Record the resolved model/provider/reasoning/service tier, tool policy, player-harness commit and exact runtime arguments. Profile names and environment-variable labels are not proof of the effective policy.
- **R14 — lifecycle separation:** Preserve observation, recommendation, selected input, input-delivery receipt and official game outcome as separate events. A fired pulse is not a hit; a stable detection is not an operator; a browser click is not an official score.
- **R15 — ablations before mixtures:** Compare the simplest safe player with local-perception-only, model-only and combined-policy candidates when those lanes exist. Extra agents or tools must earn their latency, cost and coordination overhead through measured outcomes.
- **R16 — replication before promotion:** A one-game high score creates a candidate only. Reserve at least two comparable full games for unchanged replication before adopting a policy as the new default; any safety/fairness hard-gate failure vetoes promotion.
- **R17 — diagnostic replay is non-scoring:** Saved-frame or recorded-match replay may explain a miss and train the next policy, but it never rewrites a live archive result or counts as a live validation game.
- **R18 — claim-state discipline:** Label observations, inferences and assumptions separately. Random maps/opponents make single-match deltas exploratory; report uncertainty and sample limits rather than claiming universal causality.

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

## Player-policy promotion gate

Atomic Acres improvement is ranked lexicographically rather than by one blended vanity score:

1. Safety, fairness, visible-state boundaries and cleanup must all pass.
2. Official objective outcomes: kills, credited hits/damage, survival and deaths.
3. Reliability: valid perception coverage, input delivery, process/browser cleanup and absence of page errors.
4. Speed: perception, decision and input latency distributions, including p95 tails.
5. Resource cost and operational simplicity.

Every candidate is compared with both fixed baseline `G0001` and the previous comparable game. Promotion requires repeated full games under an unchanged configuration fingerprint, no catastrophic regression in any hard gate, and a written reason that cites archived evidence. Prefer the smallest policy that repeatedly achieves the objective; additional model lanes, detectors or control stages are removed when ablation shows no measurable value.

The reusable cross-game method is captured in Hermes skill `evidence-driven-player-improvement`. Atomic Acres remains an external player-learning project: upstream game code, rules and deployment are not optimization levers.

## Acceptance criteria

- **C1:** Unit tests prove deterministic game IDs, metric directionality, tolerance handling, missing values, safety hard failures and immutable index updates.
- **C2:** Migrating the existing baseline creates `G0001` without changing its source evidence and verifies every hash.
- **C3:** A synthetic second game produces comparisons versus `G0001` and previous game covering every metric in the registry.
- **C4:** Colour/UI fixtures reject minimap markers, top/right notifications and central countdown/engagement banners as fire authorization while retaining lower-left world pixels.
- **C5:** No shot is possible while visible countdown, engagement banner, respawn or postgame UI is present.
- **C6:** Automatic combat fire remains explicit opt-in and requires a temporally confirmed, visibly reviewed operator model; bursts and cooldowns remain bounded.
- **C7:** Reload requests are debounced and suppressed while the visible reload state is active.
- **C8:** No-target movement includes visible-frame stuck detection and a bounded reverse/turn escape action.
- **C9:** The dedicated Windows GPU run ends with no held inputs, no dedicated Chrome process and no port-9333 listener.
- **C10:** The next full Pass 63 game is archived and reports explicit improvement/regression/unchanged rows against `G0001`.

## G0002 result and new gate

G0002 proved that temporal persistence cannot rescue a wrong visual class. In Pass 63 Performance, walls, banners and damage notifications contain the Coral palette, while a visibly observed solo operator appeared tan/gold. Raw candidate saturation rose to 97.7%; the first temporally confirmed target was the `ENGAGE` banner; 150 screen-locked tracks were rejected; and the alignment gate allowed zero shots. One candidate frame visibly contained an operator in the lower-left world, but the old global 40%-left crop discarded it.

The immediate correction gates the `ENGAGE` banner, masks the minimap and stacked right-side notices rather than the whole left field, and makes automatic combat fire explicit opt-in. Do not re-enable it until a replacement operator/motion model produces both a visibly confirmed engagement frame and an official credited bot hit in calibration.

## Out of scope

- Modifying game bots, damage, maps, opponent visibility or authoritative game state.
- Database, dashboard, hosted service or cloud telemetry.
- Multiplayer with another human without a separate explicit request.
- Game-source push, PR, merge or deployment.
