# r185 recipe: texture gather

## 1. Observed API surface

**VERIFIED.** The example binds `texture()` nodes and demonstrates `sample(...).offset(...).gather(0)`
for four colour texels, plus depth comparison `gather(0).compare(1)`. It uses TSL `If`,
`Fn`, `uv`, `ivec2`, and `vec4`, a `DepthTexture`, and `LessEqualCompare`; local r185's
implementation is `node_modules/three/src/nodes/accessors/TextureNode.js:819-822`, with
WebGPU gather generation at `.../WGSLNodeBuilder.js:934-947`. Version `0.185.1`.

## 2. Engine equivalent

**PARTIAL.** Our post stack already reads scene MRTs through `src/rendering/screen-space-
post.ts:212-228`, while GTAO/SSR and shadow filtering are the relevant consumers. No
project-owned gather helper is present; the upstream node is available.

## 3. Applicability ranking

1. **Nuke Town/Raid — medium:** shadow/SSR neighbourhood taps if profiling proves sampler
  fetches are the limit.
2. **Terminal/RustRig — low/medium:** depth-aware material diagnostics.
3. **Farcrysis/Gun Range — low:** no clear current need.

## 4. Re-implementation plan

Do not add a module yet. If needed, add `src/rendering/tsl-gather-kernel.ts` with one
compile-time channel and fixed four-tap use in an existing post node. Budget: zero new
passes, <0.1 ms p95, zero persistent memory; offsets and channel are compile-time because
the API requires a constant gather channel, while scale/weight remain uniforms.

Deploy fence: only in an existing precompiled graph, never as a new per-frame material;
tripwire unsupported WebGL2 fallback and depth-format mismatch. Gates: source-level TSL
compile check, four-tap correctness fixture and post-stage receipt. Estimate: 50-90 LOC.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_texturegather.html
