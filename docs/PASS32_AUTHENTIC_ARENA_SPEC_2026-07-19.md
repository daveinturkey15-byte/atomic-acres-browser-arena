# Pass 32 — Authentic Arena Detail and Combat Escalation

Date: 2026-07-19
Status: verified audit-correction release candidate

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

## 2026-07-20 failed-claim audit and correction

The original Pass 32 production release was valid for its combat, weapon, cover,
Quad Damage and escalation gates, but a follow-up audit found five presentation
requirements that had been omitted or incorrectly accepted:

1. The player-up minimap did not draw the six collision-authoritative cover
   landmarks. The correction derives two buses, cargo, pipes, skip and generator
   directly from `arena.physicalCover`, with distinct silhouettes and upright
   screen-space labels (`BUS`, `CRGO`, `PIPE`, `SKIP`, `GEN`).
2. The retained Performance browser gate explicitly accepted `furnishings: 0`.
   The correction adds two 20-piece semantic furnishing sets—dining set, sofa,
   media console, bed, shelving and workstation—batched into four
   texture-preserving fabric/timber/dark-equipment/metal submissions.
3. Performance disabled the already-bounded atmosphere solely by profile. The
   30-triangle, at-most-three-submission tier now defaults on for hardware
   Performance while Compat and software renderers remain fail-safe bypasses;
   forced software QA proves 10 mist cards, 5 smoke cards and 64 dust motes.
4. Reduced-detail Performance substituted three generic markers for the three
   specified bicycles. It now renders low-poly two-wheel/frame silhouettes.
5. Two bicycles and two exterior recycling bins were positioned inside house
   footprints. Flowers, bins and bicycles now use exported authoritative layouts
   with radius-aware tests proving every exterior prop stays outside both houses.

The physical pipe family was also corrected from capped drums to five hollow
extruded-ring pipes, retaining the same authoritative collider footprint and
five-mesh telemetry.

### Audit-correction verification

- Application and Worker TypeScript: pass.
- Deterministic gameplay contract and golden replays: pass.
- Unit suite: **299/299** across **61 files**.
- Production build and 55-file release-tree verification: pass.
- Production dependency audit: zero vulnerabilities.
- Strict Performance gate: passed twice in fresh single-worker browser contexts
  without raising the retained 147-call / 158,000-triangle ceilings.
- Six distinct weapon/two-hand model gate: pass.
- Performance atmosphere gate: pass.
- Player-up minimap rotation, six-label telemetry and left/right agreement gate: pass.
- Authoritative centre ray: all **18** weapon/viewport combinations pass.
- Direct Performance inspection: minimap labels readable at 240 CSS pixels;
  dining/sofa/media/bed/shelves/workstation materially distinct and route-clear;
  flowers outside both houses; bicycle silhouette outdoors; hollow pipe cover
  recognisable; atmosphere restrained and combat-readable.
- Published additive immutable review:
  `review/pass32-audit-correction-20260720-024546/`.
- Verified source commit: `7eb19228a826fc747a60a9c10a6506ca96356f26`.
- Immutable review Pages commit: `affec6656ab3b3f5478e3187054ff53b32697955`.
- Exact-byte production Pages commit: `b5a81221e8484191099149f58e4166644d265da2`.
- Artifact/review/production: **55 files**, **20,306,153 bytes**, SHA-256
  `264d458fd0cfc6aad779a4ded1208ab44186835795381de027915a7355ad05b2`.
