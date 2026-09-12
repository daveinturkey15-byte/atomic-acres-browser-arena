# Lane AL — "beautiful lighting" as an adjustable, budgeted option: indirect light, reflections, AO, baked probes, per-profile tiers

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-418. Runs after Lane AI's
audit exists (it names the current controls and costs) and after Lane AB
(time-of-day/weather) has its design doc, so the two lighting lanes share
one preset table.

Worktree: create `C:\Users\david\projects\aa-claude-lightq`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-lightq -b contrib/dave-gaming-pc/claude/lighting-quality-tiers <current head>`
then junction `node_modules`.

## Owner statement (verbatim, 2026-09-02 ~19:10 BST)
"when i say ray tracing i mean the beautiful lighting etc, get it all working
in a nice way that wont murder FPS and you can adjust and on/off stuff,
quality maybe its on lightly, maybe make a new balanced profile that doesnt
look shit like performance but will run nice and look good? and quality is
beautiful and smooth on a decent pc. Max is for mad pcs and RTX mode is in a
different runtime app ... maybe we can even have path tracing in game as an
option but not needed, sure it will still look great and its more about the
assets and sensible lighting than balls to the wall"

## What this lane builds (route 4 of the RTX skill, done properly; route 3 optional later)
1. Indirect lighting that reads as "ray traced" without tracing per frame:
   baked irradiance probes / lightmaps for the static geometry of the
   code-authored arenas, generated at BUILD time by an offline path-traced
   bake (three-gpu-pathtracer-class, headless, cached by geometry digest so
   an unchanged arena never re-bakes; the bake output is a provenance-pinned
   generated asset, procedural in origin), sampled at runtime by the TSL
   materials. Zero per-frame cost beyond a texture/probe fetch.
2. Screen-space reflections and ambient occlusion (SSR, GTAO) as TSL post
   passes with quality tiers (off / light / full), respecting the light-set
   freeze (no runtime light changes) and the pipeline tripwire.
3. Contact shadows and soft shadow filtering tiers where the arena's shadow
   setup allows.
4. Every feature is a graphics control with on/off and a tier, wired into
   the profile ladder Lane AI defines: Performance = off; Balanced = light
   (baked probes on, SSR off or quarter-res, AO light); Quality = on lightly
   (baked probes, SSR half-res, GTAO); Max = everything full; the RTX entry
   is not a rendering profile here (see Lane AI: it is the native-runtime
   explainer). Each tier's cost measured per arena at 1440p headless
   (frame time p50/p95, VRAM, pipelines before admission, tripwire 0) and
   written next to the control.
5. Readability and parity rules from the RTX skill: reflections must not
   give intel the low tier cannot; silhouette contrast at engagement
   distance holds; measured with the existing readability instrument.
6. Path tracing in game: research note only in this lane (a
   route-3 classic ray-traced or a progressive path-traced "photo mode" is
   a separate lane if the owner wants it after seeing the baked result).

## Boundaries
- You own: the bake pipeline scripts, probe/lightmap sampling in the shared
  TSL material helpers, the SSR/GTAO/contact-shadow passes, their controls
  and tiers, tests and docs. Coordinate with Lane AB on the preset table
  (one file, two sections). Not: arenas' geometry, weapons, netcode.
- Cold-compile fence: every tier must admit inside the fence on this
  machine; precompile in the menu; never widen the fence.
- Machine rules as every lane; bakes are GPU-heavy: run only with the
  owner's ComfyUI queue empty and say how long each took.

## Report
Per-arena before/after captures per tier, the cost table, bake times and
cache behaviour, tripwire results, the readability/parity check, commits.
Claim-state every line.
