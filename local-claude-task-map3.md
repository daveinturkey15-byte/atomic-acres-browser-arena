# Task: continue the Map 3 demo (pass 84 parallel sweep)

You are Claude, working in C:\Users\david\projects\aa-map3 on branch
contrib/dave-gaming-pc/claude/map3-demo-showcase. This is a standalone Vite
demo page (map3.html) that touches NO existing game file.

## Read first (in order)
1. docs\MAP3_HANDOFF_2026-08-31.md — nine gotchas + remaining work estimates.
2. The session handoff section "Remaining work — Dave's spec" (water rework,
   vehicle through vegetation, car splash, rain zones, machinery, volumetrics,
   corridor 6 beams, integration).

## First action — settle the ONE open question
Boot headless REAL Chrome (Playwright, channel: 'chrome' - NOT bundled Chromium,
which has no WebGPU on this machine), open http://localhost:41931/map3.html
(serve with npx vite --port 41931 --strictPort), wait for the HUD, and record
the `backend` and `shim N/M` values. WebGPU + shim N non-zero = proceed.
WebGL2-fallback or shim OFF = diagnose that first and report before building.
Screenshot to artifacts/ for evidence. Headless only; never a visible window.

## Then work Dave's spec in this order, timeboxed to ~3 hours total
1. Water rework + physics interaction (floating, splash) - 1.5-2h
2. Car through water splash - 0.5h
3. Heavier-rain zones - 0.5h
4. Corridor 6 beams fix - 0.5h
5. If time remains: animated machinery from physics - 1h
Leave the 2.5-3h vehicle-through-vegetation lane for a later pass unless
everything else lands early.

## Hard rules
- Repo contract: no ShaderMaterial, no RawShaderMaterial, no onBeforeCompile -
  three/webgpu NodeMaterial + TSL only.
- Everything procedural: no imported mesh, image, font, LUT.
- Headless browsers only; never open a visible window; never kill Dave's
  processes (he runs ComfyUI/ollama).
- NEVER touch C:\Users\david\projects\atomic-acres-gauntlet or any file outside
  this worktree.
- Commit incrementally to your branch with clear messages after each landed
  item. Do NOT merge into any other branch and do NOT push to gh-pages.

## Verify before finishing
- npx tsc --noEmit -p tsconfig.json -> 0
- npx tsx scripts/map3-validate-geometry.mts -> PASS
- Headless Chrome screenshot of each corridor you touched, saved under
  artifacts/, and an honest note of anything that looks wrong.

## Report back (final message)
Per item: done/partial/blocked, evidence path, honest quality notes (open the
demo and compare frames before any quality claim), and the WebGPU shim answer.
