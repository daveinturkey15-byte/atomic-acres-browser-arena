# Lane AI — graphics profiles made clear (Performance / Quality / Max / RTX), and the DLSS 5 "3D-guided neural rendering" question

Orchestrator: Claude Code (Fable 5.1). Ledger rows HF-414 and HF-415. Owner
(2026-09-02 17:50): "we need a clearer understanding of the capabilities of
webGPU and our settings of performance, quality, max, and RTX. Is RTX above
or below max, and is it just based off quality but then only works on nvidia
cards? ... Also this DLSS5 general stuff ... possible to use somehow as an
option to make our game look cool? dont need better FPS via AI as that would
reduce latency, but do need cooler looking stuff options? ... Research and
ensure our graphic profiles are clear as to what they are and what they
deliver and how/why etc". Runs in the overnight build AFTER the Nuke Town
rebuild lane.

Worktree: create `C:\Users\david\projects\aa-claude-graphics`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-graphics -b contrib/dave-gaming-pc/claude/graphics-profiles-clarity <current head>`
then junction `node_modules`.

## Facts to start from
- Profiles: `src/graphics-settings-registry.ts` (40 controls; note the
  2026-08-31 finding that many are "verified" by a source grep rather than a
  frame observation), `src/rendering/grade-profile.ts` (`GRADE_PROFILES`:
  performance / quality / max), the RTX preset (search `rtx`, `rayTrac`,
  `path`, the skill `threejs-rtx-runtime-route` in the shared store which
  covers "pick native runtime vs in-browser, and ship a classic ray-traced
  preset well"). The renderer is WebGPU only (WebGL2 fallback retired
  2026-08-30). WebGPU exposes no vendor ray-tracing API and no DLSS: whatever
  "RTX" does in this game is our own shader work (TSL) and runs on any
  WebGPU adapter unless the code gates it by adapter/vendor - find out which.
- The MAX preset had a cold pipeline compile of 5-6.5 s against a 4 s
  admission bound (PASS 78 P0); check the current state.
- Owner hardware: RTX 5080, 2560x1440, Chrome. Measurements headless only.

## Job
1. AUDIT: for each profile (Performance, Quality, Max, RTX) list every
   control it sets, what the control does in rendering terms (shadow map
   size and cascades, SSR, volumetric shafts, bloom, AA, texture LOD,
   post chain, grade, particle density, grass density...), and what it
   costs: measure per arena (registry roster) headless at 1440p: frame time
   p50/p95, draw calls, pipelines compiled before admission and in combat
   (tripwire), VRAM. Answer the owner's exact questions in a table: is RTX
   above or below Max in cost and in visuals; is it Quality plus a
   ray-traced pass; does it depend on an NVIDIA adapter or on any WebGPU
   feature (list the `adapter.features` and `limits` it needs; test on the
   machine's adapter). Capture the same review camera per arena per profile
   and show them side by side.
2. FIX the clarity: in-game profile descriptions that say what each does and
   costs (one line each, derived from the audit, no marketing), a
   `docs/GRAPHICS_PROFILES_2026-09-03.md` with the full table, and a test
   that fails if a profile's control set changes without the doc changing
   (pin the control-set hash). Where a control's "verified" status is a
   source grep, say so in the doc's honesty column; do not fix the
   verifiers here (report the list).
3. NEURAL RENDERING RESEARCH (write `docs/NEURAL_RENDERING_OPTIONS_2026-09-03.md`):
   what DLSS 5 "3D-guided neural rendering" actually is (WebSearch, primary
   sources: NVIDIA's announcement, GTC talks, the DLSS SDK docs; record what
   is verified vs press paraphrase), why it is NOT reachable from a browser
   (driver/SDK feature, DirectX/Vulkan only, no WebGPU binding), and what IS
   reachable in WebGPU/TSL on an RTX 5080 today that gives "cooler looking"
   results without the latency cost the owner does not want: e.g. neural
   texture/material compression run as WGSL, small learned post-passes
   (learned tonemap / material response) with `shader-f16` and `subgroups`,
   ray-traced reflections/shadows/AO in compute (what the RTX preset does or
   could do), screen-space GI, volumetrics, temporal AA quality modes, HDR
   output. For each: feasibility on this stack, cost class, visual payoff,
   and a bounded first experiment. Recommend at most three as new optional
   "look" settings. No implementation in this lane beyond a spike if one is
   under an hour and clearly worth it.
4. `npx tsc --noEmit`; focused tests; commits with explicit paths; evidence
   under `docs/evidence/pass87/graphics-profiles/`.

## Boundaries
- You own: the profile descriptions, the two docs, the control-set hash
  test, the audit script. Do not change what profiles render this lane
  (that is a follow-up with the owner's pick), except a documented spike.
- Machine rules as every lane: headless only, one browser, one build, no
  full vitest, 3 GB free VRAM before a launch, wait for a quiet machine for
  every measurement (ComfyUI queue empty).

## Report
The profile table with costs and the owner's three answers, side-by-side
captures, the neural options table with the recommended three, the
verifier-grep list, commits. Claim-state every line.

## ADDENDUM (orchestrator, 18:35 BST) — the RTX skill's four routes are your option set
Read the shared skill `threejs-rtx-runtime-route` v1.2.0 (vault
`Skills/game-development/threejs-rtx-runtime-route/SKILL.md`, ~49 KB) and
technique-register rows 15 and 19 BEFORE the audit. It already settles the
vocabulary and the constraints:
- Route 1, native RTX runtime (SamG's ThreeRuntime, Node -> C++ -> Vulkan +
  RTX, "no browser rendering", MIT verified): owner-only product decision;
  not a browser preset. Report it as the future native option, nothing more.
- Route 2, in-browser hybrid ray tracing (G-buffer + BVH-traced soft-shadow
  and one-bounce GI rays + temporal denoise; the restated `three-realtime-rt`
  technique, ~60 fps at 1080p on a 3060 per its author): implementable by an
  agent under a declared budget; on our stack it would be WebGPU compute +
  a BVH (three-mesh-bvh pattern) + TSL passes.
- Route 3, in-browser classic recursive (Whitted) ray tracing:
  `erichlof/THREE.js-RayTracing-Renderer` @ 490ca081, **CC0 - the only
  source in the register whose code may be adapted directly** (trademark
  carve-out stands; re-read the licence at any newer pin). The owner asked on
  2026-08-24 for this as a PLAYER-FACING option with "beautiful
  implementations". Low noise, deterministic, true reflections/refractions/
  caustics/DoF, no GI colour bleed. Runs in WebGL2 fragment shaders in the
  original; ours would be a TSL/WebGPU port of the method.
- Route 4, screen-space + baked (SSR, GTAO/SSAO, baked irradiance/probes,
  area-light approximations): the honest default AND route 3's
  indirect-lighting supply.
Your audit must state which of these the CURRENT "RTX" preset actually is
(likely a route-4-plus-extras preset carrying the name), and the doc must
stop the name implying browser hardware ray tracing (the skill's naming
rule). Then the "cooler looking options" recommendation: (a) route 4 done
properly with a path-traced LIGHTMAP/probe BAKE for the code-authored
arenas at build time (three-gpu-pathtracer-class offline bake; zero runtime
cost; the biggest visible win for static maps), (b) a route-3 classic
ray-traced preset as the owner requested, sized to the admission fence
with menu-time precompile, (c) route-2 hybrid soft shadows + one bounce as
the stretch. Apply the skill's readability and parity rules (no intel
through reflections that the low preset cannot give; silhouette contrast
holds at engagement distance) and the cold-compile fence trap (measure
cold, weakest hardware, never raise the fence, precompile in the menu).
