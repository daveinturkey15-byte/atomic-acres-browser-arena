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
- **State**: DONE 2026-09-03 (Claude Opus 5.1), gates green.
- **Materials.** `nuketown2Materials()` is the shipped map's palette, MEASURED
  rather than eyeballed: the mean albedo of each PBR texture set `atomic-acres`
  streams, at that set's authored roughness/metalness, plus its flat-authored
  `white` / `mustard` / `chrome` and art-kit's `MAT.rubber` / `MAT.cream`.
  Nothing is imported. Three reference overrides: houses BLUE / YELLOW /
  ORANGE (§5.3 — green+yellow are the ORIGINAL Nuketown's), a cream-and-red
  coach, and a plain box van. `pair()` now takes `[north, south]` materials so
  the two houses differ by paint alone; geometry, and therefore the symmetry
  gate, is untouched.
- **Lawn.** `buildNuketownRebuildLawnField` grows the shipped map's field on
  regions DERIVED from `NUKETOWN2_GROUND_DRESSING`'s `material: 'lawn'`
  rectangles plus their rotational partners, with `builder.colliders` as the
  keep-out truth, so neither extents nor keep-outs can drift. 9,953 tufts,
  149,295 triangles, 8 draws.
- **Surrounds.** The forest ring and mountain ring take an ENVELOPE each; the
  shipped map's envelope holds its authored numbers exactly (its own tests stay
  green) and the rebuild's is fitted to 36 × 84: forest 44.5–70 m, massif from
  66 m, no ground skirt (this arena authors its own ground, now 270 m so the
  massif is not standing half on nothing).
- **Light and grade.** Key, fill, fog curve, atmosphere and exposure are the
  shipped map's. Sky is `estate-golden-hour` — the shipped `sunset-farmland`
  resolves to an ASSET this arena may not have. Shadow normal bias stays 0.044
  (derived from this footprint's own 44 × 92 m volume). The art-direction CDL
  is left EXACTLY as searched; only its brief prose changed.
- **Three corrections the first capture round measured**, not predicted: the
  road rendered as a hole at a texture-mean albedo on an untextured box; the
  perimeter was a concrete compound wall in both yard frames; and the overhead
  review camera stood inside the new forest ring.

## Evidence from Job 3 (2026-09-03)
- tsc clean; 97 targeted gate tests green (nuketown2 fidelity 16, nuketown
  fidelity, art direction, arena visual definition, map selection, menu preview
  video, lawn field, forest surround, mountain backdrop).
- Collider/visual parity **0** invisible colliders, **0** walk-through meshes.
  Walkable-surface parity **0** fall-through floors.
- Art-direction distinctiveness, the test's own instrument: floor 0.02157,
  `atomic-acres` vs `nuketown2` **0.02446**, unchanged by this pass and still
  above the shipped catalog's own weakest pair (0.02262).
- Review-camera capture 7/7 on hardware WebGPU, three rounds:
  `artifacts/viewpoint-regression/hf426-job3`, `-v2`, `-v3` (final).
- Arena boot smoke: `nuketown2` boots a clean visible solo match, 29.7 s.
- 60 s headless solo run on `nuketown2`: 0 page errors, 0 console errors,
  **100 mean FPS**, p95 14 ms, still active at the end
  (`artifacts/qa/nuketown2-job3-solo-60s.json`).
- Menu preview + loading backdrop re-captured through the sanctioned
  generators. `qa:pass77:menu-previews` verified; generator lineage 6/6 after
  the additive repair described below.

### Open, and not this lane's
- `qa:pass65:menu-previews` reports 11 digest-mismatch / drift lines against
  PASS 65's frozen expectations of the shared capture generator. Verified
  PRE-EXISTING on this head (identical output with Job 3's changes stashed).
- The shared generator lineage was stale for the same reason and HAS been
  repaired here, additively, with `write-capture-generator-lineage.mjs` — the
  tool the failure names. No recorded digest was edited in place.

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
