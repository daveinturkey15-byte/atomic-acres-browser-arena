# Lane AU — HF-426: Nuke Town Rebuild made accurate to Black Ops 2 Nuketown, then the approved visual style layered on

Priority 1 of 2026-09-03. Worktree `C:\Users\david\projects\aa-claude-nuketown3`,
branch `contrib/dave-gaming-pc/claude/nuketown2-accurate` (base = current
integration head, PASS 88 + PASS 89 candidate work). Owner (07:00, verbatim):
"the nuketown rebuild is not right, its based on an old layout we had here, not
the actual layout of black ops 2 nuketown, you need to do some proper research
and adjust the layout of the map and assets, then layer in all the visual styles
we had aimed for and approved in our older layout, prioritise that ahead of
other things and be careful with compute. I hope it wont take long?"

## What exists
`src/nuketown2-arena.ts` + `src/nuketown2-layout.ts` (layout constants),
`src/rendering/arenas/nuketown2.ts` (visuals), `src/nuketown2-fidelity.test.ts`
(bands derived from Lane U's study `docs/NUKETOWN_REBUILD_2026-09-02.md`), review
cameras in `scripts/qa/viewpoint-catalog.mjs`, spawn table, art-direction row,
menu preview media. Lane U's study measured the playable footprint from ONE
published scalar and then reused our 2026-08-29 redesign's flow; that is what
the owner rejects.

## Job 1 — proper reference research (Gemini bulk, Opus verifies)
Sources are public overhead/callout maps and gameplay stills of Black Ops 2
Nuketown 2025 (wikis, callout-map sites, video stills); fetch them with curl/
WebFetch, LOOK at them, and write `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`:
a grid schematic (ASCII or SVG you draw) of the WHOLE map with relative
positions and sizes of: the two houses (which corner each occupies, footprint,
garage side, front door side, the upstairs windows and which way they face),
the two back yards and the spawn positions inside them, the fences and the gaps
in them, the street (its length and width), the central vehicle(s) and which
are open/closed cover, the driveway cars, the kerb props (mailbox, planters,
signs), the shed/toolbox positions, and the three lanes players actually run.
Record every number as a ratio to street length; cite each source URL beside
the fact it supports; where sources disagree, say so and pick with a reason.
Copy nothing: no image, no text, no asset. Then a DIFF TABLE: reference vs the
current `nuketown2` (measured from `src/nuketown2-layout.ts`), element by
element, with the correction needed.

## Job 2 — the layout and props corrected (Gemini bulk)
Edit `src/nuketown2-layout.ts` / `src/nuketown2-arena.ts` so every element in
the diff table matches the schematic within 5% of street length; houses'
interiors and stairs follow the reference (which rooms, which windows), the
central vehicle(s) as the reference has them (open/closed as cover), driveway
cars, fences with the reference's gaps, kerb props, sheds; 180-degree symmetry
only where the reference is symmetric (it is not exactly - record where not).
Keep the gameplay carry-overs (2x core on the central vehicle's roof with line
of sight, rare gun sites re-derived, sheds through the registry). Re-derive the
fidelity test's bands FROM THE SCHEMATIC (reasons beside every number); the
spawn table through the solver; parity and walkable audits at 0.

## Job 3 — the approved visual style layered on (Gemini bulk, Opus verifies)
The style the owner approved is the SHIPPED Nuke Town's: read
`src/rendering/arenas/atomic-acres.ts`, `src/nuketown-lawn-field.ts`,
`src/nuketown-forest-surround.ts`, the mountain ring, its art-direction row and
lighting. Port that look onto the corrected layout in code (house materials and
trim, garage doors, lawn field, forest surround, mountain ring, kerb/asphalt,
vehicle paint, time-of-day hook from Lane AB if merged), keeping the art-
direction distinctiveness floor against the shipped map (the rebuild is a
sibling card, not a duplicate: same family, its own grade). Review-camera
captures from the judgeset before/after; the overhead render beside the
schematic is the headline evidence.

## Gates and rules
tsc; `src/nuketown2-fidelity.test.ts` (re-derived), map-selection/selectability,
spawn-quality, parity + walkable audits, art-direction floor, boot smoke headless,
60 s solo run zero errors, tripwire 0; explicit-path commits; LF in legacy-main;
never touch the shipped Nuke Town; headless only; ComfyUI queue empty before
browser work; one browser at a time. Report with claim-states, the schematic, the
diff table, the overhead comparison, and what still differs.
