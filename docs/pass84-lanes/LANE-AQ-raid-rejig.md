# Lane AQ — HF-408: Raid layout rethink, code-authored preview (`raid2`), true to the Black Ops 2 Raid flow

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-408. Scheduled 22:05 BST
2026-09-02 after the owner asked again ("didn't we have stuff for RAID").

## Owner statement (verbatim, 2026-09-02 ~16:10 BST)
"Raid just feels like loads of walls, need to ensure the layout and artstyle is
more similar to the original."  (Earlier that day the Raid ART pass, Lane L, was
put to one side; this lane is the LAYOUT, with a clean first-pass style.)

## Protocol
Exactly Lane U's protocol (`docs/pass84-lanes/LANE-U-nuketown-rejig.md`, both
addenda) applied to Raid: reference study written down first (published overhead
layouts and descriptions of Black Ops 2 Raid: the hillside mansion, the pool and
pool house, the garage/driveway, the basketball court, the main house's two
levels and its central sightlines, the three lanes, where cover breaks them);
then a NEW arena beside the shipped one so nothing breaks mid-pass: id `raid2`,
route `raid-rebuild`, displayName `Raid Rebuild`, selectorLabel
`RAID REBUILD · PREVIEW`, `authoring: 'code'`, `selectable: true`,
`multiplayer: true`; everything code-authored TSL (no imported asset, nothing
copied from any source: describe, measure, rebuild); TypeScript collision
authority for every floor, wall, stair, pool edge and prop; interiors enterable;
open sightlines where the reference has them (the owner's complaint is "loads
of walls": measure the shipped Raid's wall density and sightline lengths against
the reference proportions and make the rebuild match the reference, recorded as
ratios); spawn table from the solver; art-direction row above the distinctiveness
floor; registered on Lane P's trail (registry row, rosters derived, boot smoke
headless, menu-preview capture through the sanctioned generator, eye-clearance
stages 1-3 measured, collider/visual parity audit, spawn-quality gate, a
`raid2-fidelity.test.ts` with bands derived from the recorded reference
proportions and the reason next to each number); working documents under
`docs/raid-rebuild/` (SPATIAL_PLAN, ASSET_INVENTORY, TASK_STATE), a fixed
judgeset of review cameras, the three-reading-distances rule, the critical-
failure list, and the rubric the skeptic scores (layout fidelity 30, flow and
cover rhythm 25, collision parity 15, readability 15, technical hygiene 15; gates
>= 85% each).

Worktree: `C:\Users\david\projects\aa-claude-raid2` off the current integration
head (`git worktree add ../aa-claude-raid2 -b contrib/dave-gaming-pc/claude/raid-rejig <head>`
+ node_modules junction). Lane U's skeptic findings are your checklist of what
not to repeat: no verbatim prose from any source in any doc; every kept gameplay
feature reachable by a real traversal probe; no decal inside a building; a real
menu preview, not PREVIEW STANDBY; nothing left to a weapons-boundary patch
without the exact patch in the report.

## Boundaries
You own `src/raid2*`, `src/rendering/arenas/raid2.ts`, the rebuild's registry/
roster/spawn/art-direction rows (`// RAID2:` marks), the design doc and fidelity
test. Do NOT touch the shipped Raid (`test2`), weapons, lobby/netcode, other
arenas, or Lane V's Map 3 files. Machine rules as every lane (headless only, one
browser, 3 GB free VRAM, never kill processes, no full vitest, explicit-path
commits, LF in legacy-main). Target: merge-ready by 04:30 for the PASS 87 cut;
if not, it ships in the next pass - say which honestly.

## Report
Reference measurements; the rebuild's proportions per element; wall density and
sightline table shipped Raid vs reference vs rebuild; gate results; frames from
the judgeset; what still differs. Claim-state every line.
