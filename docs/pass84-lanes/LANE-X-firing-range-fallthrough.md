# Lane X — HF-411: Firing Range roof grating fall-through, plus a walkable-surface parity sweep on every arena

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-411.

Worktree: `C:\Users\david\projects\aa-claude-parity` (created for you)
Branch: `contrib/dave-gaming-pc/claude/hf411-walkable-parity` (base 75a4e508)

## Owner statement (verbatim, 2026-09-02 ~16:40 BST)
"on firing range sometimes you go to run onto a metal fence layed as a floor
on the roof level of the map and you fall through it, fix all that shit"

## Facts
- Firing Range = arena id `test1` (menu name Firing Range), built in
  `src/test-maps.ts` (`buildTest1`): TypeScript collision boxes are the
  movement and shot authority; presentation meshes sit beside them. A grating
  or mesh fence used as a walkable roof floor with no matching collider (or
  a collider with an edge gap) lets the capsule fall through. "Sometimes"
  points at a partial collider or an edge gap rather than a missing one.
- AGENTS.md: every substantial player-reachable visible object must have
  matching movement and shot authority. A collider/visual parity audit exists
  (Lane P ran it on map3: zero unexplained colliders, zero unrated ghost shot
  surfaces); find it with `grep -rl parity src --include=*.test.ts scripts/qa`
  and use it as the instrument.
- Traversal tests exist in the style of `src/additional-maps.test.ts` (Rapier
  route probes in stand, crouch and prone). Physics config: `src/physics.ts`.

## Job
1. Find every presentation mesh on test1 at roof level that reads as a floor
   (grating, fence-as-floor, catwalk, mesh panel); compare each footprint
   against the collider set; list the gaps with numbers.
2. Reproduce headless: teleport the player (debug API) onto each grating at
   several interior and edge points, sample y over 2 s; a drop is a
   fall-through. Save `docs/evidence/pass85/hf411/before.json`.
3. Fix: colliders that match the visual footprint exactly (thin walkable
   box, correct top height, no edge gaps), plus shot surfaces if the audit
   expects them. Never move or hide the visual to close the gap.
4. Add a Rapier traversal test that walks across every roof grating on
   test1 in stand and crouch and asserts no drop, and a parity assertion
   that every walkable visual on test1 has a collider whose top matches
   within a stated tolerance.
5. SWEEP every selectable arena with the same walkable-surface parity check
   (roster derived from the registry). Fix siblings on test1 and test2.
   Gun Range and Skyline Terminal geometry belong to Lane J today: report
   those, do not edit. List everything else in the report.
6. Eye-clearance sweep on test1 for the roof level after the fix (no ceiling
   changes); `npx tsc --noEmit`; focused tests; commits with explicit paths.

## Boundaries
- You own: the test1 and test2 collider tables in `src/test-maps.ts`, the
  new traversal and parity tests, and any sweep script you write.
- Do NOT touch: arena visuals and art, Gun Range and Skyline Terminal
  geometry (Lane J), Nuke Town (Lane U), Map 3 (Lane V), weapons and
  viewmodel (Lane W), netcode.
- Machine rules: headless only (a guard kills headed browsers), one browser,
  one build, never kill processes you did not start, never the full vitest
  suite, 3 GB free VRAM before a launch.

## Report
The grating list with collider gaps, before and after drop evidence, the fix
per surface, test names, the cross-arena sweep table, commits. Claim-state
every line.
