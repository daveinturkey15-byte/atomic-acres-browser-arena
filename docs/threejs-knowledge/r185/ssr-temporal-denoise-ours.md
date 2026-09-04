# Recipe: SSR temporal denoise, ours (HF-486)

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_postprocessing_ssr_denoise.html
(`temporalReproject()` → `recurrentDenoise()` behind `ssr()`; r185 recipe
`docs/threejs-knowledge/r185/webgpu_postprocessing_ssr_denoise.md`, technique #3.)

## When to use it

Any noisy screen-space buffer (SSR reflections here) where the brief allows
**one pipeline and one history target** — upstream's two-node chain does not
fit that fence (TemporalReprojectNode alone owns history + resolve targets).

## The pattern (single fused stage)

1. Own exactly one half-float history target; refresh it pre-frame with
   `copyTextureToTexture` (a command, not a pipeline); report invalid until a
   full frame has elapsed so an empty/stale buffer is never sampled.
2. Reproject with the existing velocity attachment
   (`prev = curr − vel`, NDC→UV ×0.5, same convention as upstream
   `historyUV = uvHit.sub(velocity)`).
3. Clamp the history sample to the current frame's neighbourhood box (4-tap
   cross + center of the same signal the composite reads).
4. Gate the blend weight with smoothstep boxcars (no boolean ops): UV validity,
   velocity dead-zone→knee (static trusts, fast falls back), depth-edge band
   shared with the bloom guard.
5. Blend under a strength uniform capped so the fresh frame always keeps ≥15%;
   keep the composite additive and the stage name unchanged.
6. Invalidate on arena/definition apply (no stale history across matches);
   resize in place; dispose with the graph.

## Numbers that travel with it

- Strength default 0.55, ceiling 0.85. Velocity gate 0.003→0.012 UV/frame
  (halved motion-blur NDC band). Depth band 0.00035→0.0035 (bloom's band).
- Budgets: 0 new pipelines, 1 history buffer, ≤8 taps, 0 per-frame allocs,
  topology key moves on presence only.

## What we deliberately did not reuse

Upstream `SSRNode.setHistory()` multi-bounce: no strength, no clamp, no
disocclusion control — wiring it under our own blend would filter twice.
The TSL enumerations (`texture()`, `screenUV`, `screenSize`, vec3 `min/max`,
`mix`) were checked against installed `three@0.185.1` types before use.

Module: `src/rendering/ssr-temporal-denoise.ts`. Tests:
`src/rendering/ssr-temporal-denoise.test.ts`,
`src/rendering/screen-space-post-ssr-denoise.test.ts`.
