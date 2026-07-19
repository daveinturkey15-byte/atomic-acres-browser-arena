# Pass 32 — Authentic Arena Detail and Combat Escalation

Date: 2026-07-19
Status: verified release candidate

## Overview

Make Atomic Acres read as a deliberately authored compact early-2010s arena in ordinary play—not only in telemetry—while preserving the approved bright lighting, compact routes, support HUD, two initial neon-purple rigged bots, and existing weapon/reload behavior.

## Requirements

- **R1 — Large physical arena detail:** the live arena must visibly contain two recognisable authored buses plus additional substantial street/yard cover. Detailed presentation and simplified collision may remain separate, but the visible and physical bounds must align, routes must stay open, and all six landmarks must remain recognisable in the representative Performance profile rather than only in Blender Render.
- **R2 — No unexplained sky clutter:** presentation-only fauna or props must not read as random floating objects. Remove or replace ambiguous airborne primitive silhouettes and prevent static environment meshes from appearing unsupported.
- **R3 — Quad Damage UX:** the 4× Overdrive pickup must receive a stronger audiovisual announcement and a persistent, readable icon in both the world and minimap while available.
- **R4 — First-person quality:** the representative Performance profile must keep coherent firearms, hands, gloves, sleeves, proportions, poses, recoil, reload, and knife. Blender Render may retain extra PBR detail as an optional showcase path, but it is not a meaningful gameplay/performance target for Dave's low-spec PC.
- **R5 — Authentic atmosphere:** shader-driven haze/mist/dust must be visible but restrained, bounded, reusable, and must not darken or obscure the approved bright combat lanes.
- **R6 — Semantic interiors:** house furnishings must use materials appropriate to their function (fabric upholstery/bedding, timber tables/shelving, dark media equipment, metal accents). Flowers must be placed only in outdoor beds.
- **R7 — Wind-responsive grass:** grass blades must bend and flutter through a bounded shader-driven wind field rather than only moving as a rigid mass.
- **R8 — Headshots:** accepted head hits deal exactly 1.5× base weapon damage. A sniper headshot must be lethal to a full-health ordinary opponent.
- **R9 — Bot escalation:** solo starts with exactly two bots. Every fifth cumulative bot death in the current match adds one additional persistent respawning bot. Thus deaths 5, 10, 15, and 20 increase the live target population before the 25-kill score limit; ordinary respawns do not double-add.

## Acceptance criteria

- **C1:** deterministic telemetry and focused browser inspection show two authored buses and additional aligned movement/projectile-blocking large cover visible from normal spawn routes. Performance specifically exposes semantic cargo, pipe, skip and generator silhouettes rather than generic collider boxes.
- **C2:** direct sky inspection shows no ambiguous floating primitive clutter; any retained airborne element is visually authored and animated as fauna.
- **C3:** Overdrive available/claim states drive a world icon, minimap icon, announcement banner/feed, and audio cue; tests cover availability and claim transitions.
- **C4:** Performance-profile first-person firearm/hand anatomy tests pass for all six weapons and direct browser captures show coherent hands, gloves, sleeves, distinct gun silhouettes, reload poses, and knife.
- **C5:** atmosphere telemetry reports bounded haze/mist/dust and direct inspection preserves route visibility.
- **C6:** generated/runtime house furnishing materials are semantically grouped and flower placement assertions prove all flower instances are outside house footprints.
- **C7:** grass shader tests prove time-varying wind bend and gust variation while constrained-profile budgets remain bounded.
- **C8:** unit tests prove head multiplier `1.5`, ordinary sniper headshots are lethal from 100 health, and body damage remains unchanged.
- **C9:** deterministic tests prove initial bot target `2`, deaths `1–4` keep `2`, death `5` raises to `3`, death `10` raises to `4`, and respawns do not alter the cumulative threshold.
- **C10:** full unit suite, application TypeScript, Worker TypeScript, production build, gameplay-contract verification, focused Chromium scenarios, and `git diff --check` pass without weakening unrelated retained gates.
- **C11:** a new additive immutable review is inspected over HTTPS; production is promoted from those exact bytes; all historical review paths remain byte-preserved.
- **C12:** Performance remains the representative acceptance profile on Dave's hardware. The optional Blender compatibility/showcase path remains bounded at or below 175 draw submissions and 100,000 triangles in the deliberately dense breakable-window evidence view, but its FPS is not used as evidence of expected local playability.

## Decisions

- “Each time a bot dies for the 5th time” is implemented as **every fifth cumulative bot death per match**, because this is deterministic, applies uniformly to all bot identities, and naturally remains bounded by the existing 25-kill match limit.
- Initial solo population remains exactly two; escalation is a new runtime target, not a change to `SOLO_BOT_COUNT`.
- Commercial references guide pacing, clarity, and authored density only. No proprietary map geometry, models, names, audio, or UI are copied.
- Large visible assets may use simplified collision bodies, but visual and gameplay bounds must align.
- Dave's low-spec target PC makes Performance the default visual, gameplay, capture, and performance-verification profile. Blender Render is opt-in compatibility/showcase evidence only.
- Performance semantic cover retains the 147-call ceiling and stays at or below 158,000 rendered triangles (measured 156,304 in the release gate).

## Out of scope

- Hostile-peer multiplayer hardening.
- Broad movement, score-limit, reload, Field Support, or lighting redesign.
- Replacing the existing original arena with copied commercial geometry or assets.
