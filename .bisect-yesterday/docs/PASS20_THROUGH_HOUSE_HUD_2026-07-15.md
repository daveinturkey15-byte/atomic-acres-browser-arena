# Atomic Acres Pass 20 — Through-House Openings and HUD Legibility

Date: 2026-07-15
Branch: `overhaul/production-vertical-slice-pass-19`

## Overview

Refine the current two-house arena without changing its original compact combat rhythm. Each mirrored house gains an opposite-side ground-floor exit and window, structural seams are closed, and the combat HUD becomes cleaner and materially more legible—especially Field Supports and ammunition.

## Requirements

- **R1 — Opposite-side access:** Each house has two exterior ground-floor doors: the existing front door and one rear/opposite-side door.
- **R2 — Opposite-side visibility:** Each house has two ground-floor windows, one on each exterior side, while retaining one upper-floor window.
- **R3 — Through-route:** The real standing controller traverses front yard → front door → both ground rooms → rear door → rear yard, and the reverse route, in both mirrored houses.
- **R4 — Clean shell:** Wall segments overlap or meet without sub-centimetre/sliver gaps; the ground-floor slab covers the whole interior footprint; upper-floor pieces and ramp landing overlap cleanly without visible seams.
- **R5 — Shared authority:** Rendering, collision, openings, routes, and runtime telemetry remain derived from `createHouseArchitecture(...)`.
- **R6 — Cleaner HUD:** Ammo is the strongest lower-right number, with a clearer reserve/reload hierarchy and a bounded dark backing panel.
- **R7 — Legible Field Supports:** The three support tiers are larger labelled cards with unambiguous activation keys, kill thresholds, names, ready state, and current streak.
- **R8 — Preserve combat:** Field Support thresholds/effects/reset semantics, approved Pass 19 viewmodel, weapon behavior, compact map layout, two rooms per floor, and one continuous physical ramp remain unchanged.
- **R9 — Isolated delivery:** Stable/canonical release remains untouched; publish only to the isolated preview repository after all gates pass.

## Mechanical acceptance checks

- **C1:** Each house reports exactly 2 ground rooms, 2 upper rooms, 2 exterior doors, 3 windows, 2 interior openings, and 1 ramp.
- **C2:** Across the arena telemetry reports 2 houses, 4 ground rooms, 4 upper rooms, 4 doors, 6 windows, 2 ramps, 0 furnishings, 0 fixtures, and 0 visible collision proxies.
- **C3:** Architecture tests prove the front-to-rear route in both directions for Aqua and Coral using the real Rapier standing controller.
- **C4:** Structural tests prove continuous interior floor coverage at the ground footprint and overlapping upper-floor/landing joins; no positive seam remains at declared joins.
- **C5:** Browser QA at the standard desktop viewport reports ammo font size at least 64 px, support card text at least 15 px, three visible support cards, and no overlap with the ammo panel.
- **C6:** Public browser earning/activation still proves Scout Sweep at 3, Yardhawk at 5, and Tri-Pass at 7 without source-contract changes.
- **C7:** `npm run lint`, `npm test`, `npm run build`, `npm run verify`, `npm run test:e2e`, and `git diff --check` pass on the exact final revision.
- **C8:** Public cache-busted HTTPS review loads the deployed hashed assets, starts a solo match, reports the C2 telemetry, and has zero new page/console errors.

## Out of scope

- No literal Black Ops/Nuketown geometry, assets, names, branding, or UI reproduction.
- No new weapon, Field Support tier, room, staircase, furniture, or decorative clutter.
- No canonical-release overwrite before owner approval.
