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
