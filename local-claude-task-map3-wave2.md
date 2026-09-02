# Task: Map 3 wave 2 - vehicle through vegetation, water and god-ray polish, integration pass

You are working in C:\Users\david\projects\aa-map3 on branch
contrib/dave-gaming-pc/claude/map3-demo-showcase (head 308c6cdb). Wave 1 landed
water, weather, god rays, machinery and signage (commits c4bdfbab..308c6cdb).
The orchestrator (Claude Code) verified wave 1: tsc clean, geometry validator
PASS, WebGPU backend with the shim active.

## Read first
1. docs\MAP3_HANDOFF_2026-08-31.md section "B. Vehicle through vegetation"
   IN FULL, including its warning, and section "H. Integration, perf pass,
   verification". Follow the warning exactly.
2. local-claude-task-map3.md (wave 1 brief) for the hard rules - they all
   still apply: TSL NodeMaterial only (no ShaderMaterial / RawShaderMaterial /
   onBeforeCompile), everything procedural, headless real Chrome only
   (Playwright channel:'chrome', never a visible window), never touch any
   other worktree, never kill processes you did not start, commit to this
   branch with explicit `git add <paths>` after each landed item.

## Work, in order
1. Vehicle through vegetation (handoff section B) - the 2.5-3 h lane.
2. Water polish, from the orchestrator's review of artifacts/corridor-4-water-shore.png:
   the water reads as a flat saturated cyan sheet. Add a sun specular term,
   Fresnel toward the horizon, depth-based transparency/colour at the shore,
   and tone the base colour down so barrels and buoys read as sitting IN water.
   Re-capture the same view and compare frames before claiming improvement.
3. God-ray polish, from artifacts/corridor-6-volume-godrays-inside.png: the
   colonnade frame is blown out to near-white. Reduce the accumulator so the
   columns keep their albedo and the shafts stay distinct; re-capture both
   god-ray views.
4. Integration/perf pass (handoff section H): keep the HUD fps at or above
   the wave-1 numbers (176-180 fps at 1280x720 in the captures) on every
   corridor; note any corridor that dropped.

## Verify before finishing
- npx tsc --noEmit -p tsconfig.json -> 0
- npx tsx scripts/map3-validate-geometry.mts -> PASS
- node scripts/qa/capture-corridor-views.mjs (or the equivalent you have) for
  every corridor you touched, saved under artifacts/, and an honest note per
  frame of anything that looks wrong.

## Report (final message)
Per item: done/partial/blocked, commit hash, evidence path, honest quality
notes (compare before/after frames), fps per corridor, and anything you could
not verify.
