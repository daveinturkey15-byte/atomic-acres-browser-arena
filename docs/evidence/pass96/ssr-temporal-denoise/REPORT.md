# PASS 96 — SSR temporal denoise (HF-486) — REPORT

Branch: `contrib/dave-gaming-pc/claude/ssr-temporal-denoise`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (465ae6b7)
Worktree: `C:/Users/david/projects/aa-muse-ssr` (own new worktree; no other
worktree, preview, or checkout touched)

## What changed

SSR was single-frame: one mirror ray per pixel, visibly grainy on glossy
windows, bus paint and wet road (Nuke Town most of all). This lane adds a
temporal denoise strictly inside the existing SSR stage, in our likeness of
upstream r185's `temporalReproject() + recurrentDenoise()` chain (which costs
two pipelines and two targets — over this brief's budget of one and one):

`denoised = mix(current, clamp(history(uv - velocity), box(current)),
strength * valid * velocityGate * depthGate)`

- History reprojection with the existing velocity/depth MRT data (no new MRT
  attachment beyond the velocity one the denoise itself requests).
- Neighbourhood clamp (4-tap cross + center box of the current frame).
- Disocclusion fallback: out-of-bounds UV, fast motion, or depth edges force
  weight 0 — the old single-frame path, so moving enemies cannot smear.
- Strength uniform (default 0.55, ceiling 0.85: the fresh frame always keeps
  ≥15%). Additive composition and `ssr-screen-space-reflection-add` preserved;
  no new stage, no `LINEAR_SOURCE_STAGE_ORDER` change.

Files (271 insertions, 22 deletions across 9 modified + 3 new):

- NEW `src/rendering/ssr-temporal-denoise.ts` — tuning, constants, CPU
  reference math, single-target history manager.
- NEW `src/rendering/ssr-temporal-denoise.test.ts` (15 tests) — budgets,
  reprojection, clamp, gates, tuning, history lifecycle.
- NEW `src/rendering/screen-space-post-ssr-denoise.test.ts` (9 tests) — MRT,
  stages, topology, combat safety, construction-time registration, prime cycle,
  off-path identity, precompile-registration grep.
- `src/rendering/screen-space-post.ts` — fused blend, velocity MRT, history
  refresh/invalidate/dispose, live uniforms.
- `src/rendering/screen-space-post-profile.ts` — `ssrDenoise` tuning, topology
  fragment `ssr|ssr+denoise`, combat-safety ceiling, disabled state.
- `src/graphics-settings-registry.ts` — `ssrTemporalDenoise` toggle
  (performance/balanced off, high/max on) + evidence + presets.
- `src/pass65-settings.ts` — one-line threading into the selection.
- `src/rendering/pass64-tsl-scene.ts` — pre-frame refresh in `update()`
  (renderer-guarded), invalidate on `applyDefinition`, status receipt.
- Tests/docs: topology-contract pair, inventory lists, re-fingerprinted pins,
  `docs/GRAPHICS_PROFILES_2026-09-03.md` (row, hashes, PASS 96 note, counts).

## Claim states

| # | Claim | State | Evidence |
|---|---|---|---|
| 1 | Reprojection math (uv − velocity, NDC→UV ×0.5, bounds) | VERIFIED | `ssr-temporal-denoise.test.ts` 15/15 |
| 2 | Clamp bounds (history ⊂ current neighbourhood box) | VERIFIED | same suite, clamp cases |
| 3 | Off switch restores the old path (no buffer, no copy, same stages) | VERIFIED | `screen-space-post-ssr-denoise.test.ts` off-path case; `reflectionLight` single-frame line kept byte-identical |
| 4 | ≤1 pipeline (actual: 0 new; blend fused, refresh is a copy) | VERIFIED | `SSR_TEMPORAL_DENOISE_PIPELINE_COUNT = 0` pinned by test |
| 5 | ≤1 history buffer (actual: exactly 1 when on, 0 when off) | VERIFIED | status receipt cases (`historyTargets` 0/1, never 2 across resize/invalidate) |
| 6 | Precompile registration (built at construction, warmed by `precompileExactScenePass`) | VERIFIED | construction-time `enabled: true` receipt + assembler grep pin (`hdr.refreshSsrDenoiseHistory(renderer)`, `screenSpace.invalidateSsrDenoiseHistory()`) |
| 7 | Topology rebuild staged on toggle; tiers stay uniform-only | VERIFIED | topology-contract suite incl. new `[false, true]` pair |
| 8 | No gate weakened; pins re-fingerprinted per tripwire procedure | VERIFIED | contract suite green with new hashes `6990222a/1265dfaa/87a2c804/62d82ed1` |
| 9 | Per-frame cost ~0.35 ms @1440p RTX 5080 | DESIGNED | estimate only (8 taps at SSR scale + 1 SSR-sized copy, 0 pipelines); headed capture is OPEN |
| 10 | No smearing on moving enemies; combat readability kept | DESIGNED | gates proven numerically (velocity knee, strength floor); visual confirm needs headed capture |
| 11 | Velocity sign convention (prev = curr − vel, NDC) | DESIGNED | matches upstream `historyUV = uvHit.sub(velocity)` and the blur gate's ×0.5; same-frame visual check OPEN |
| 12 | Full ladder re-capture with denoise live | OPEN | explicitly not claimed; audit doc records it as OPEN |

## Gates quoted (all in `C:/Users/david/projects/aa-muse-ssr`)

`npx tsc --noEmit` → clean, no output (three consecutive runs during the lane;
final run 23:31Z).

`npx vitest run` batch one (contract, pipeline-metrics, bridge, graph,
post, profile, topology, registry, inventory):

> Test Files  9 passed (9)
> Tests  93 passed (93)

`src/legacy-main-size-ratchet.test.ts src/nuketown2-fidelity.test.ts`
(`src/legacy-main.ts` untouched):

> Test Files  2 passed (2)
> Tests  38 passed (38)

Adjacent (`pass64-tsl-scene`, `pass65-settings`, settings-inventory,
`advanced-graphics-controls`):

> Test Files  4 passed (4)
> Tests  39 passed (39)

`src/rendering/cold-session-precompile-reach.test.ts`:

> Test Files  1 passed (1)
> Tests  3 passed (3)

Total: 173 tests green, 0 weakened, 0 skipped.

## HF-481 source-priority evidence (dave-gaming-pc)

1. Upstream docs: dated local copy
   `docs/threejs-knowledge/upstream/threejs-docs-llms-full-2026-09-04.txt`
   (ssr / RecurrentDenoiseNode / TemporalReprojectNode / SSRNode entries; read
   from the `aa-claude-hotfix` checkout, which carries the upstream mirror).
2. Poimandres MCP: not applicable (core three.js, not R3F/Drei) — fell back to
   point 3 per the policy's falsifier clause and say so.
3. Current source: installed `three@0.185.1` (`SSRNode.js` setHistory /
   reprojectHitPointHistory, `TemporalReprojectNode.js` updateBefore history +
   resolve management, `RecurrentDenoiseNode.js` strength/phis) plus the r185
   recipe `webgpu_postprocessing_ssr_denoise.md` on
   `origin/contrib/dave-gaming-pc/claude/r185-techniques` (technique #3).
4. Installed version checked against HEAD APIs before use (`texture`,
   `screenUV`, `screenSize`, `mix`, `min/max` vec3 overloads verified in
   `@types/three@0.185.0` and at runtime import).
5. Measurement: estimate stated with derivation (§What changed, claim 9);
   headed FPS/draw-call/disposal validation is OPEN (owner running ComfyUI —
   no GPU work in this lane, per brief).
6. Recipe: `docs/threejs-knowledge/r185/ssr-temporal-denoise-ours.md`.

## Luna review TODOs

- TODO: obtain the required native-WebGPU capture with moving enemies and
  reflective surfaces in both supported graphics profiles; this review was
  intentionally no-browser/no-GPU.
- TODO: record the real cold-session pipeline/target timing and steady-state
  copy cost; the current 0.35 ms figure is a defended estimate only.
- TODO: validate the velocity sign and SSR target ordering in a headed runtime;
  the CPU reference and source contract are not a visual proof of reprojection.

## Per-frame cost estimate (defended)

At 1440p, SSR high (0.75 scale): ~8 texture taps/pixel in the already-bound
composite shader (5 SSR + 1 history + 2 depth) ≈ instruction-level, plus one
`copyTextureToTexture` of the SSR target (~0.75² × 3.7 MP × 8 B ≈ 16 MB/frame
bandwidth ≈ 1 GB/s @60 fps — noise against the 5080's ~1 TB/s). Zero new
pipelines, zero per-frame allocation, zero in-combat compilation. ≈0.35 ms
p95 DESIGNED; capture OPEN.

## Residual risks

- TSL is verified at construction (headless builds) and by type, not by a
  headed frame: a runtime-only node-shape error would surface on first headed
  SSR admission, fail-closed (history invalid → weight 0 → old path) but
  visible in logs. First headed run should watch for it.
- `update()` refresh ordering assumes node `updateBefore` hooks (SSR render)
  run at submission, after `update()` — the same assumption the shaft tint
  already relies on.
