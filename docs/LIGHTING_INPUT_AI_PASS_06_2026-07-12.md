# Atomic Acres — Lighting, Input & Tactical AI Pass 06

Date: 2026-07-12
Branch: `overhaul/lighting-input-ai-pass-06`
Base: verified Pass 05 documentation head `56f11d9` (public game build `239a1da`)

## Purpose

Continue the original early-2010s compact arena-FPS quality roadmap without copying Black Ops 2/Nuketown geometry, assets, branding, interface or audio. Pass 06 focuses on the next three layers after Pass 05 combat/world art:

1. clearer lighting and atmosphere;
2. more deliberate gamepad response and grounded movement feedback;
3. smarter one-bot route/spawn decisions without increasing damage or health.

## Non-negotiable constraints

- Preserve the exact Pass 04/05 `68 × 86 m` authored bounds, colliders, houses, cover boxes and primary spawn sightline block.
- Preserve one solo bot, 22 m fire range, 650 ms reaction delay and 50% damage.
- Preserve physical ADS and camera-ray firing.
- Preserve full-quality `>=40 FPS` and compatibility `<=180` calls / `<=350,000` triangles; do not weaken renderer settings to hide regressions.
- Compatibility mode must remain a deliberate reduced path, not the full-quality default.
- Keep canonical Pass 03, `review/pass04/` and `review/pass05/` unchanged.
- Use only original procedural/generated visuals and synthesized sound.

## Planned implementation

### Lighting and atmosphere

- Upgrade the existing one-draw sky shader with an authored sun glow, warm horizon and restrained procedural high cloud bands.
- Rebalance hemisphere/ambient/sun lighting and shadow bias for stronger readable depth without crushed interiors.
- Add a low-cost, pooled/static dust-mote field only in full-quality mode if telemetry permits.
- Refine the existing CSS color grade rather than introducing a heavy post-processing composer.

### Controller and movement

- Add a pure, deterministic gamepad look-rate integrator with radial response, acceleration/deceleration and separate ADS scaling.
- Expose a bounded controller-sensitivity option while preserving mouse sensitivity behavior.
- Reset look velocity when the pad disconnects or menus take focus.
- Keep grounded movement speeds and no-slide policy unchanged unless tests identify a concrete defect.

### Tactical one-bot behavior

- Add pure spawn scoring for distance, line-of-sight exposure, occupancy and authored preference.
- Select patrol/intercept points deliberately when sight is lost instead of only cycling sequentially.
- Let a wounded bot disengage/reposition without increasing hidden accuracy, damage or health.
- Preserve all finite-coordinate and authored-bound recovery guards.

## Acceptance

- New pure input/spawn/route helpers have unit tests.
- All existing unit and Chromium scenarios pass.
- Isolated performance gate passes unchanged in a clean environment.
- Normal and compatibility release QA report zero console errors and remain within renderer budgets.
- Two-browser multiplayer room/join/stance replication passes.
- Visual review confirms improved depth/readability without haze obscuring enemies.
- Any review deployment uses only a new `review/pass06/` path.

## Implemented candidate

### Lighting and atmosphere

- Replaced the flat gradient shader with a one-draw procedural atmosphere containing a warmer horizon, authored sun disc/halo and restrained high cloud bands.
- Full quality keeps subtle cloud math; compatibility compiles that branch out entirely and uses a lower-segment sky sphere.
- Rebalanced hemisphere/ambient/direct lighting, exposure, fog range, shadow bias and normal bias for stronger depth without changing world geometry.
- No post-processing composer, dynamic cloud objects, extra texture fetches or extra atmosphere draw calls were added.

### Controller response

- Added `integrateGamepadLookRate`, a pure bounded angular-velocity integrator with separate hip/ADS limits, acceleration, faster release, vertical scaling and high-stick flick boost.
- Added a persisted, bounded `CONTROLLER LOOK` slider (`0.5–1.8`) separate from mouse sensitivity.
- Stored mouse/FOV/controller values are now range-validated before use.
- Gamepad movement/look are zeroed behind menus and look velocity resets on disconnect, preventing menu drift and stale rotational tails.

### Tactical one-bot behavior

- Added pure spawn scoring for threat distance, direct exposure, occupancy and authored preference.
- Bot respawns now choose among valid authored points rather than returning the first valid point.
- Added deterministic tactical waypoint scoring for travel cost, 13 m engagement band, sight reacquisition and route changes.
- The bot selects a tactical waypoint on sight loss and at hidden-route waypoint arrival; collision detours and all bounds guards remain intact.
- A bot below 35 HP disengages inside 18 m instead of receiving extra health, damage or accuracy.
- Solo policy remains one bot, 22 m fire range, 650 ms reaction delay and 50% damage.

## Local verification evidence

- TypeScript and production build passed.
- Unit tests: `63/63` across 11 files.
- Functional Chromium: `9/9`, including controller-slider persistence.
- Clean isolated performance scenario passed unchanged (`>=40 FPS`).
- Full-quality release QA: zero console errors, `302` calls / `302,706` triangles.
- Compatibility release QA: zero console errors, `59` calls / `72,406` triangles.
- Two-browser PeerJS QA passed room creation/join, reciprocal remote presence and prone replication with `24.19 m` observed spawn separation.
- Visual review covered menu composition, options-panel fit and persistence, sky/cloud iteration, side-yard brightness, shadow depth, weapon readability and world separation. An initial vertical cloud-streak artifact was reduced to a very faint high-band treatment before final QA.

## Remaining limitations

- Browser automation validates the pure controller curve and settings persistence but cannot substitute for a physical-pad feel review by the user.
- Tactical routing remains a lightweight authored-waypoint system, not a navigation mesh or cover-query planner.
- Multiplayer authority, grenade replication, match modes and scoreboard depth remain later roadmap layers.
- The original low-poly/procedural art direction remains intentionally lighter than a native commercial console title.

## Public review deployment

- Source build: `b0cf59c`.
- Pages revision: `373f549`.
- Review URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass06/?release=b0cf59c`.
- Pages diff from Pass 05 contained 15 files, all under `review/pass06/`; canonical root, `review/pass04/` and `review/pass05/` remained unchanged.
- Public full and compatibility release QA matched local telemetry with zero console errors.
- Public two-browser multiplayer QA passed room/join, reciprocal remote presence and prone replication.
- Public menu and first-person visual smoke checks found no missing assets, clipping, darkness, glare, fog or release blocker.

