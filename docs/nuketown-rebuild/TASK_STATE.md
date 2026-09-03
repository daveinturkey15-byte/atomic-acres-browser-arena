# Lane AU — task state (HF-426)

## Overview
- **Branch**: `contrib/dave-gaming-pc/claude/nuketown2-accurate`
- **Goal**: make the Nuke Town rebuild (`nuketown2`) accurate to Black Ops 2
  Nuketown 2025, then layer on the approved visual style from the shipped map.
- **Dates**: Jobs 1–2 first cut 2026-09-03 (Gemini 3.8 Flash); Jobs 1–2 verified
  and rebuilt 2026-09-03 (Claude Opus 5.1).

## Job 1 — reference research
- **State**: REDONE. The first cut was rejected on verification: three of its
  five cited URLs do not resolve (one is Medium's page-not-found shell, one a
  404, one a bare domain), and its structure reproduced this repository's own
  2026-08-29 redesign rather than the reference. See
  `REFERENCE_SCHEMATIC.md` §0.
- **Deliverable**: `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`, measured in
  pixels off the two first-party Treyarch minimaps of Nuketown 2025 (BO2 and
  BO7), which agree to ~1 % on every shared ratio.
- **The finding that mattered**: the map's long axis runs ACROSS the street at
  2.36 : 1, and the road is a short stub opening into a cul-de-sac turning head.
  The previous cut had 0.90 : 1 with the street as the long axis.

## Job 2 — layout and props
- **State**: REDONE, gates green.
- `src/nuketown2-layout.ts`, `src/nuketown2-arena.ts` re-proportioned to
  36 m of street by 84 m across it at constant playable area (3,016 → 3,024 m²).
- Truck is now the OPEN body in the turning head and carries the 2x core; the
  coach is CLOSED. A car in the head is the coach's fairness counterweight.
- Garages set back 6 m and given a link door that is a real hole in BOTH leaves
  (the previous cut cut one leaf and left the house wall solid behind it).
- Yard fence gaps taken off-axis from their own rotational partners; two flank
  props moved onto the perimeter wall's inner face. Worst standing lane
  82.0 → 46.0 m.
- Shed registry rows moved from x = ±24 (now outside the map) into the yards.
- `src/nuketown2-fidelity.test.ts` re-derived from the schematic, with the
  previous cut's `.filter(name.startsWith('truck'))` escape hatch replaced by an
  exact enumerated exception plus two new properties.
- Footprint-derived visual numbers re-derived in
  `src/rendering/arenas/nuketown2.ts` and `src/graphics-refinement.ts`.

## Job 3 — approved visual style
- **State**: PENDING, not started by this pass.
- Port the shipped Nuke Town's look: `src/rendering/arenas/atomic-acres.ts`,
  `src/nuketown-lawn-field.ts`, `src/nuketown-forest-surround.ts`, the mountain
  ring, and the art-direction row — keeping the distinctiveness floor against
  the shipped map.
- Start from `REFERENCE_SCHEMATIC.md` §5.3 (house colours) and §9 (what this
  pass already re-derived, and what it deliberately left alone).

## Evidence from the rebuild pass
- tsc clean; 270 targeted gate tests green (16 fidelity, spawn quality,
  selectability, map selection, parity, walkable, art direction, shed registry,
  overdrive LoS, railgun authority, killstreak nav, menu preview, proxy
  coverage, visual definition).
- Collider/visual parity **0** invisible colliders, **0** walk-through meshes.
  Walkable-surface parity **0** fall-through floors.
- Arena boot smoke: 13/13 arenas, real WebGPU, own preview on 127.0.0.1:4243.
- 60 s headless solo run on `nuketown2`: 0 page errors, 0 console errors,
  99.4 mean FPS, still active at the end
  (`artifacts/qa/nuketown2-solo-60s.json`).
- Review-camera capture 7/7 on hardware WebGPU
  (`artifacts/viewpoint-regression/hf426-candidate/`).
