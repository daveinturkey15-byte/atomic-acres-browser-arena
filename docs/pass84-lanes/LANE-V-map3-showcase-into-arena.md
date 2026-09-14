# Lane V — HF-409: put the real Map 3 showcase INTO the game arena (and stop shipping the stone shell)

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-409.

Worktree: `C:\Users\david\projects\aa-map3`
Branch: `contrib/dave-gaming-pc/claude/map3-demo-showcase` (continue; it is
already merged into PASS 84, so base your diffs on the PASS 84 head 75a4e508:
`git merge 75a4e508` first if the branch is behind it)

## The owner's words (2026-09-02 ~16:25 BST)
"it was full of rich code based asset tests and now its just a square map of
stone? can we roll it back and figure out what happened?"

## What happened (verified by the orchestrator, do not re-investigate)
Nothing was deleted. `src/map3/**` (corridors, corridor-water/-weather/
-volume/-physics/-colosseum, plants, foliage-material, leaf-geometry, sky,
noise, main; ~10k lines of TSL) and `map3.html` are intact. Lane P
registered `map3` as a NEW authored stone hub-and-bays arena in
`src/map3-arena.ts` and deliberately did NOT import the showcase modules. Its
header states three real constraints; read it first:
1. the showcase modules publish geometry + an `update()` and NO colliders;
2. `ArenaMap` has no per-frame hook, so the corridors' time uniforms would
   never advance (frozen water, rain, god rays);
3. `arenaFactories` in `src/legacy-main.ts` is a static import map, so the
   builder lands in the main chunk for every arena (owner priority: faster
   loads).
The showcase page is not a Vite build input; it is not in dist and returns
404 on the live channel.

## Job (all three constraints solved properly, not bypassed)
1. IMMEDIATE, first commit: hide the stone shell (`selectable: false` for
   `map3` in `src/map-selection.ts`, keep the registry row so rosters and
   saved links still resolve; the publish guard for hidden arenas must stay
   green), and add `map3.html` as a second Vite input (`vite.config.*`
   `build.rollupOptions.input`) so the showcase ships at `/map3.html` on the
   channel with its own chunks. Prove: `npm run build` emits `dist/map3.html`
   and its assets; the main game bundle's size does not grow (compare
   `dist/assets/index-*.js` bytes before/after).
2. ARENA HOOK: add an optional per-frame `update(elapsedSeconds, dtSeconds,
   context)` to `ArenaMap` (or an arena animation registry the frame loop
   calls once per frame from the existing arena-update site in
   `src/legacy-main.ts`, marked `// MAP3:`), with a unit test proving it is
   called only for the active arena and costs nothing when absent. Every
   other arena's behaviour is unchanged (their tests stay green).
3. CODE-SPLIT: make the map3 arena factory a dynamic import behind the
   registry (`arenaFactories` entry returns a lazy loader for map3 only),
   with a loading state the arena transition already understands (see the
   farcrysis prewarm/admission path for how arenas are staged before the
   12 s fence). Prove the main chunk does not grow for other arenas.
4. COLLISION PARITY: author TypeScript colliders and shot surfaces for every
   substantial reachable surface in the showcase corridors (floors, piers,
   walls, water as a swim/blocked volume decision, the truck, the colosseum
   tiers, physics-bay props as dynamic or presentation-only per AGENTS.md).
   The collider/visual parity audit that runs on map3 must pass with zero
   unexplained visible solids.
5. PHYSICS: the showcase runs its own Rapier world. The game already has
   Rapier. Either bridge the physics bay's bodies into the game's world
   (preferred if the API allows) or keep the bay presentation-only with
   colliders on its static parts; record the decision.
6. BUILD THE ARENA from the showcase: `src/map3-arena.ts` becomes the
   showcase's hub + eight corridors using the real modules, animated by the
   new hook, with the spawn table re-solved (`scripts/qa/solve-spawn-layouts.ts
   --arenas map3`), the boot smoke green headless, the menu-preview captured
   from the real arena, the eye-clearance ledger entry, and the art-direction
   row kept above the distinctiveness floor. Then flip `selectable: true`
   again with the PREVIEW label.
7. `npx tsc --noEmit`; focused tests (map-selection, arena registry, the new
   hook test, parity audit, spawn quality, map3 fidelity if any); commits per
   step with explicit paths.

## Boundaries
- You own: `src/map3/**`, `src/map3-arena.ts`, `src/rendering/arenas/map3.ts`,
  `map3.html`, the vite input, the `ArenaMap` hook and its single frame-loop
  call site (`// MAP3:` marks, LF preserved), map3 registry/spawn/roster rows.
- Do NOT touch other arenas' geometry or behaviour, weapons/viewmodel,
  lobby/netcode, Nuke Town (Lane U is rebuilding it separately).
- Machine rules as every lane: headless only, one browser, one build, never
  kill processes, never the full vitest suite, 3 GB free VRAM before a launch.

## Report
Per step done/partial with evidence; bundle sizes before/after; hook test
name; collider coverage numbers from the parity audit; frames of the in-game
corridors animated (two captures a few seconds apart proving motion); gate
results; commits. Claim-state every line.

## OWNER UPDATE (2026-09-02 ~16:55 BST) — read this before step 6
"Just keep the showcase in and it's not about combat, it's a mode you can
explore." Map 3 is an EXPLORE mode: the showcase corridors ARE the content.
Register it solo with `soloBotCount: 0`, `maximumSoloBots: 0`,
`multiplayer: false`, `fieldSupport: false`, label it as an explore preview,
and do not spend budget on combat: no enemy-spawn constraints (a single
player spawn table at the hub is enough; the spawn-quality gate's
team-separation rules do not apply to a 0-bot arena - if the gate cannot
express that, put the exact gate patch in your report rather than authoring
fake enemy spawns), no field support, no overdrive. Collision parity for
walkable and blocking surfaces still applies: the player must not fall
through or walk through the showcase.
