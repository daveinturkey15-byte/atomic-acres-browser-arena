# Pass 40 — Rustworks polish, walkable tower access, and leaderboard headroom

Date: 2026-07-21
Branch: `overhaul/pass40-rustworks-polish`

## Overview

Raise the defensive global streak/kill ceiling above 100 and substantially improve the original Rustworks 1V1 arena. Preserve Atomic Acres' own identity: evoke a readable compact rusted industrial FPS arena without copying a commercial map's exact geometry, assets, names, signage, or protected visual composition.

## Context

- Dave reports that the scoreboard caps at 100 kills.
- The procedural Rustworks tower contains two ramps and a Quality-only Blender detail overlay, but its central ladder is presentation-only and cannot be traversed.
- Performance mode is Dave's representative low-spec path, so visual and navigation improvements must exist in the procedural map rather than relying only on the Blender overlay.
- TypeScript/Rapier colliders remain movement and shot authority. Blender assets remain non-authoritative presentation.

## Requirements

- **R1 — Leaderboard headroom:** Replace the client and Worker 100-kill/streak ceiling with a shared documented ceiling of 9,999. Accept and preserve legitimate values above 100; continue rejecting negative, fractional, unsafe, and above-ceiling payloads. Keep client/Worker bounds aligned.
- **R2 — Original visual overhaul:** Improve Rustworks' ground, perimeter, tower silhouette, structural supports, process equipment, pipework, cover, markings, and industrial clutter in Performance mode using bounded low-poly geometry/materials.
- **R3 — Coherent traversal:** Rebuild the central access so the lower and upper platforms connect logically. Every ramp must meet its source/destination surface without an impassable lip, false floating end, or collider mismatch.
- **R4 — Walkable ladder:** Represent the requested ladder as a steep industrial ship-ladder/stair-ladder with visible rails/rungs and a continuous collision-backed walking surface no steeper than the character controller's 50-degree climb limit. The player must walk both up and down without a use key or teleport.
- **R5 — Quality asset parity:** Align/regenerate the editable Blender source and exported GLB so Quality mode supports the revised tower instead of displaying contradictory old access geometry. Keep GLB presentation-only.
- **R6 — Performance safety:** Keep added meshes/triangles bounded, avoid per-frame allocation or new dynamic loops, and preserve low-spec compatibility.
- **R7 — Regression coverage:** Add deterministic tests for leaderboard values above 100, Rustworks semantic visual parts, ramp/ladder geometry, platform alignment, and bidirectional Rapier traversal.

## Acceptance criteria

- **C1:** Client and Worker tests accept a representative score/streak of 1,000 and reject 10,000; existing hostile-payload and migration tests remain green.
- **C2:** Procedural Rustworks contains named semantic structures for lower ramp, upper access, walkable ship ladder, rail/rung set, platform landings, structural bracing, process equipment, and upgraded cover/detail.
- **C3:** A deterministic CharacterPhysics test walks from ground to the lower deck and back, and from lower deck to upper deck and back, using authored access routes.
- **C4:** Ramp/ladder surface angles are at or below 50 degrees and platform transition lips/overlaps are within the bounded physics tolerance.
- **C5:** Blender source and GLB contract tests pass with an incremented asset version and revised semantic details.
- **C6:** `git diff --check`, TypeScript, affected tests, full Vitest, gameplay contract, dependency audit, and production build pass.
- **C7:** Browser QA in representative Performance mode visibly confirms the improved Rustworks scene and bidirectional tower traversal; Quality mode loads the revised GLB without console errors.
- **C8:** Persistent primary provider remains OpenAI Codex; this implementation pass uses provider-pinned `xai-oauth` `grok-4.5` at high reasoning only for the requested work.

## Out of scope

- Exact reproduction of any commercial Rust map.
- New paid assets or copied textures.
- Changing multiplayer architecture, bots, weapons, match clocks, or Atomic Acres' main arena.
- Expanding the global leaderboard API beyond the existing streak/kill record shape.

## Release rule

Implement and verify locally first. Publish an immutable HTTPS review artifact and verify exact bytes before promoting production. Deploy the leaderboard Worker only if the same raised bound is verified locally and its configured Cloudflare target is confirmed. Preserve prior `review/` trees during Pages promotion.
