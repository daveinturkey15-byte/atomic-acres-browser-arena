# Pass 55 - Indoor range and walk-up armory

## Overview

Rebuild Acres Gun Range as an original indoor near-future live-fire hall. The range must feel atmospheric and spacious without copying proprietary Battlefield or Black Ops geometry, art, branding, audio, or weapon data.

## Requirements

- R1: Enclose the complete range with a ceiling, side walls, acoustic baffles, safe lighting, ventilation, and an expanded ready/armory area.
- R2: Preserve the bullet-transparent player safety barrier and the existing nine reusable 100/200/300 point targets.
- R3: Hide field-kit selection for Gun Range. Players deploy with the service pistol and acquire primaries from persistent walk-up armory stations.
- R4: Armory pickup is an explicit `F` interaction, is repeatable, refills that weapon, and immediately equips the selected primary.
- R5: Add the Mastiff 63 LMG as a distinct range weapon with an original model silhouette, tuning, sound profile, action details, and presentation contract.
- R6: Longline 86 sniper ADS enters and exits in one update, including scope FOV and overlay. Other weapons retain their authored easing.

## Acceptance checks

- C1: Unit tests prove the larger interior footprint, enclosing shell, ceiling/acoustic/light detail, unchanged target values, and closed physical bounds.
- C2: Unit tests prove five unique armory stations, nearest-station selection, and the LMG station.
- C3: TypeScript exhaustiveness covers all seven weapons; focused model/gameplay/presentation tests prove the LMG contract.
- C4: Unit tests prove sniper ADS snaps to `1` and `0`, while a non-sniper remains transitional.
- C5: Browser QA proves the field-kit tab is unavailable on Gun Range, range deployment starts on the pistol, `F` equips the LMG, and sniper ADS/scope enters and exits immediately.
- C6: `npm run lint`, focused Vitest, the production build, and visual browser inspection pass without weakening existing gates.

## Out of scope

- Canonical production promotion before the dependent wall-penetration work and this pass are integrated into the source history.
- Changes to multiplayer authority beyond the shared wall-penetration dependency in Pass 54.
- Proprietary reference assets, exact layouts, names, extracted files, or copied audio.
- Removing the firing-line safety contract or changing target scoring.

## Delivery authorization

Dave explicitly authorized source push and public publication on 2026-07-22. Pass 55 is stacked on Pass 54 because both change the range/map, gameplay, entry-point, and gameplay-contract surfaces. The first public publication must therefore use the combined source state in a new isolated review subtree, preserving the canonical root and every existing review archive until the source branches are integrated.

## Assumptions and falsifiers

- Assumption: "more space to walk around" means a materially larger ready/armory and booth circulation zone while keeping the established firing-line safety barrier. Falsifier: Dave explicitly asks for downrange player access.
- Assumption: the missing class should complement the current carbine/SMG/scattergun/sniper set; an LMG is the cleanest gap. Falsifier: a current authoritative branch already introduces an LMG or Dave names another class.

## Gotcha

**Symptom → Cause → Correction → Verify:** a focused Playwright check appeared to ignore the new range-only menu state → the shared default port reused a preview server from another worktree → run this worktree on a unique preview port and point `BASE_URL` at it → confirm the served build exposes the indoor armory summary before trusting the result.

**Symptom → Cause → Correction → Verify:** the range compiled before Pass 54 integration but failed the combined type and ballistic-coverage gates → Pass 54 made weapon penetration profiles and explicit shot-surface classification mandatory → author the LMG penetration profile and classify every new solid range prop → run the full unit suite plus the Pass 54 and Pass 55 Chromium contracts from the combined branch.
