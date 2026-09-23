# Lane P — Map 3 on Claude: verify Gemini's waves, finish polish, register as a real arena

Orchestrator: Claude Code (Fable 5.1). Owner 2026-09-02 08:47: "bring map 3
back stuff from gemini its usage about to expire, do it with claude fable";
08:40: "sort all of this too" (which includes registering Map 3 as a real
arena, previously held for the owner's art approval). Ledger row HF-405.

Worktree: `C:\Users\david\projects\aa-map3`
Branch: `contrib/dave-gaming-pc/claude/map3-demo-showcase` (continue on it)

## What exists
- Standalone Vite demo page `map3.html` + `src/map3/*` (~10k lines), no
  existing game file touched. Handoff `docs/MAP3_HANDOFF_2026-08-31.md`
  (nine gotchas, remaining-work table, "Later, not now: register as a real
  arena (~80 files, 21 rosters)"). Wave briefs on disk:
  `local-claude-task-map3.md`, `-wave2.md`, `-wave3.md`.
- Gemini landed waves 1-3 today (commits c4bdfbab..HEAD): Gerstner water
  with buoyancy and splash, weather corridor, god rays, machinery, signage,
  4x4 truck through bending vegetation, water polish (specular, Fresnel,
  shore transparency), god-ray recalibration. The orchestrator verified
  waves 1-2 (tsc 0, geometry validator PASS, scope clean, no ShaderMaterial).
  WAVE 3 DID NOT LAND: Gemini exited with NO commits, leaving only an
  UNCOMMITTED diff in `src/map3/corridor-volume.ts` (run `git diff` first)
  and a log that ends waiting for tsc. Handoff item F (volumetrics reacting
  to physics objects) and the god-ray midpoint are therefore YOURS to do:
  inspect the diff, keep what is sound, finish both, commit.
- Hard rules unchanged: three/webgpu NodeMaterial + TSL only; everything
  procedural; headless real Chrome only; never a visible window; never
  touch any other worktree; explicit-path commits.

## Job
1. VERIFY wave 3: `npx tsc --noEmit -p tsconfig.json`, `npx tsx scripts/map3-validate-geometry.mts`,
   re-capture every corridor headless (`scripts/qa/capture-corridor-views.mjs`),
   look at every frame, and fix anything Gemini claimed that is not true.
   Read the god-ray frames across the three generations and settle on the
   midpoint that shows distinct shafts with column albedo intact.
2. POLISH pass with the owner's eye: the water (should read as sea, not
   dye), the truck through vegetation (bend and rebound visible in a
   capture sequence, not just claimed), rain rings size, hub vista. Keep
   HUD fps at or above 163 on every corridor at 1280x720.
3. REGISTER Map 3 as a real arena, gated so it cannot silently fall back or
   silently ship: read `src/map-selection.ts` (the `ARENA_SELECTIONS` list
   is the one that falls back to Nuke Town if missed - the "published but
   unselectable" failure), `src/rendering/arenas/` definitions, and every
   roster the existing arena-boot smoke and gates derive from. Add Map 3
   with a menu card labelled as a PREVIEW, `multiplayer: false` for now,
   `selectable: true`, its own spawn table (solo only), its own
   art-direction row, and provenance rows for any generated preview media
   (procedural, no imported images). Every gate that enumerates arenas must
   see it: run the arena-boot smoke for map3 and the menu-preview
   verifier. Do NOT touch weapon, netcode or other arenas' files.
4. `npx tsc --noEmit` (root config now, not only map3's); focused tests for
   map-selection, arena registry, art-direction, boot smoke for map3;
   commit per step with explicit paths.

## Boundaries
- You own: `src/map3/**`, `map3.html`, map3 scripts/docs, and the minimal
  registry/roster/art-direction/spawn rows needed to register the arena
  (mark each `// MAP3:`). `src/legacy-main.ts` only if registration truly
  requires it, LF preserved, `// MAP3:` marks.
- Machine rules: headless only, one browser, one build, never kill
  processes, never the full vitest suite, 3 GB free VRAM before a launch.

## Report
Wave-3 verification verdict with frames, polish items with before/after
frames, registration file list, gate results (boot smoke, menu preview,
tsc), fps per corridor, commits. Claim-state every line.
