# Lane AK — Nuke Town Rebuild art and dressing pass, run by the brief-with-embedded-rules method (usage-conservative)

Orchestrator: Claude Code (Fable 5.1). Ledger rows HF-407 and HF-416. Runs
AFTER Lane U's basic rejig has landed on the integration branch and AFTER
Lane AJ has authored the `brief-driven-scene-production` skill (read it
first; if AJ has not finished, use the method summary in
`docs/pass84-lanes/LANE-AJ-brief-driven-scene-skill-map3.md`).

Worktree: `C:\Users\david\projects\aa-claude-nuketown` (Lane U's; U is
finished when you start), branch `contrib/dave-gaming-pc/claude/nuketown-rejig`
continued, or a new `contrib/dave-gaming-pc/claude/nuketown-art` from its head.

## Owner intent
"We can then make our own artstyle and gameplay enhancements and totally
modify it" (16:10); "we are looking for cool AF stuff here and you can
already see the stuff we started to make in map 3, so much room to improve
what we already have" (18:10); "being usage conservative and not breaking
or ruining anything".

## The method, adapted (no Blender; TSL only; headless captures are the renders)
1. Working documents in `docs/nuketown-rebuild/`: ART_DIRECTION.md (the
   rebuild's own style: readable, hard-lit suburbia with our palette; what
   Map 3 taught: procedural foliage with LOD and SSS, Gerstner water where
   there is water, instanced billboard weather, TSL god rays only where the
   fence allows, physics props with colliders), SPATIAL_PLAN.md (from Lane
   U's measured layout), ASSET_INVENTORY.md (every prop: state, reading
   distances covered, collider, cost), TASK_STATE.md (checkpoint recovery).
2. Judgeset: the arena's review cameras plus enough fixed cameras to cover
   both spawn yards, the street centre from both ends, both houses' upper
   rooms, the garages, the central vehicle, and one overhead - a dozen,
   fixed, never moved between cycles.
3. Build order: art bible -> graybox check (Lane U's) -> preview dressing ->
   prop substitution (each prop works at three reading distances: silhouette,
   structure, close joins) -> final dressing (lived-in detail: mailboxes,
   bins, kerb litter, garden furniture, window interiors, driveway oil,
   scuffed thresholds, cul-de-sac signage in our own words).
4. Review loop, usage-conservative: critics are Gemini 3.8 Flash via agy
   (`agy --print ... --model gemini-3.8-flash-high --effort high --dangerously-skip-permissions`),
   three fresh-context lenses per cycle (layout/flow fidelity vs the recorded
   reference proportions; materials/lighting readability in combat;
   technical: intersections, floating props, default materials, popping LOD),
   scoring a 100-point rubric with per-dimension gates (>= 85%) and a 90
   exit; ONE Opus critic only at the final cycle. Critics see captures only,
   never code. Each repair labelled improved / unchanged / regressed. Plateau
   rule: < 1 point over two cycles -> structural pass. Minimum three cycles;
   stop at the time box the orchestrator gives (default 4 hours).
5. Critical failures (auto-reject): floating or intersecting props, default
   grey materials, a zone that exists only as a sign, fog or darkness used
   to hide unfinished work, single-direction completion (reverse angles
   unfinished), any pipeline creation in combat (tripwire), fps below Lane
   U's baseline by more than 10% on the same capture route, any change to
   collision authority without a matching visual (parity audit).
6. Cold-start validation: fresh build, fresh headless boot, all judgeset
   captures, parity audit, spawn gate, boot smoke.

## Boundaries
- You own: the rebuild's visual module, its props and materials, the
  working documents, the judgeset cameras, the evidence. Not: the layout
  authority and colliders Lane U measured (report needed changes), other
  arenas, weapons, netcode.
- Machine rules as every lane; captures only in quiet windows; one browser.

## Report
Rubric history per cycle with the critics' named findings, before/after
capture pairs per camera, fps and tripwire before/after, tokens spent per
critic model, the method verdict for arenas. Claim-state every line.
