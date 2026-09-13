# Lane L — Raid (test2) art pass: per-part lighting and art

Orchestrator: Claude Code (Fable 5.1). Owner 2026-09-02 08:40: "sort all of
this too". Previous state: "Raid art pass (layout accepted, wants per-part
lighting/art)".

Worktree: `C:\Users\david\projects\aa-claude-raid`
Branch: `contrib/dave-gaming-pc/claude/raid-art-pass` (base 7a083e48)

## Owner direction on record (memory, 2026-08-31 and earlier)
- Dynamic, coloured, time-of-day and weather lighting everywhere is the
  long-term direction; a separate lane will do time-of-day. Your job is the
  per-part art and lighting of Raid so each structure reads as a distinct,
  authored place under the CURRENT lighting model (light set frozen before
  the coverage fence; no runtime light toggles - see the PASS 82 freeze root
  cause; lights you add are static, counted, and present before the fence).
- Per-arena grade identity lives in `src/rendering/art-direction.ts`
  (routed); night/indoor identities carry hue and haze, never added linear
  contrast (shadow-mass datum).
- Techniques the owner shared and wants used: procedural TSL materials,
  3-blade Bezier tuft grass with LOD, ridged-FBM mountain rings, original
  procedural art only (no imported mesh, image, font or LUT). Load the
  repo skill `atomic-acres-procedural-art-authoring` guidance if present
  under `.agents/skills/`.
- Raid was rebuilt at full scale 2026-08-30 and given two art passes; the
  layout is accepted. Do not move gameplay geometry or spawns.

## Job
1. Capture Raid headless from 8 review cameras (existing review cams if
   any; else author them and commit as review cams) at Quality settings.
   Save `artifacts/qa/raid-art/before-*.png`. Read them: name what looks
   flat, untextured, mis-lit or placeholder, per structure.
2. Per structure: material detail (procedural wear, edge darkening, trim
   sheets), local static lighting where the fence allows, props that sell
   the place, grade tuning for Raid's identity. Keep draw calls and fps at
   or above before (measure with the same sampler Lane A uses; report both).
3. Re-capture the same 8 cameras; compare frame by frame; anything that got
   worse is reverted. Keep in-combat pipeline creations at 0
   (`scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`).
4. `npx tsc --noEmit`; focused tests (arena definition tests, art-direction
   tests); commit per structure with explicit paths.

## Boundaries
- You own: `src/rendering/arenas/test2*` (Raid) visual modules, Raid's row in
  `src/rendering/art-direction.ts`, Raid review cameras.
- Do NOT touch: Raid spawns (Lane D), collision/geometry authority, other
  arenas, viewmodel, lobby/netcode. Static lights only, all present before
  the coverage fence.
- Machine rules: headless only, one browser, one build, never kill
  processes, never the full vitest suite, 3 GB free VRAM before a launch.

## Report
The 8 before/after pairs with a one-line judgement each, fps and draw-call
before/after, pipeline tripwire, commits, what you deliberately left for the
owner's taste call. Claim-state every line.
