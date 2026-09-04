# Our r185 TAA resolve

HF-472 reimplements the temporal resolve in Atomic Acres rather than vendoring
Three's implementation. The upstream reference studied for the r185 graph
shape is [TRAANode.js in the Three.js r185 source](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/tsl/display/TRAANode.js).

## Local recipe

`src/rendering/taa-resolve.ts` owns one `TaaResolveNode` and one admission-time
`NodeMaterial`. It keeps two distinct RGBA16F targets: the history target and
the current resolve target. On each frame it reprojects history using the
scene-pass velocity MRT, rejects invalid UV/depth history, clamps history in a
3x3 YCoCg neighbourhood, then performs a sharpen-free blend controlled by the
`strength` uniform. The resolved colour is the first linear post stage and is
the input to motion blur, SSGI, SSR and the later composite.

The scene pass admits velocity on QUALITY as well as MAX. TAA makes the
principal target single-sampled; MSAA and TAA are mutually exclusive. GTAO and
SSGI temporal filtering are enabled only when this graph is actually built,
matching the r185 source comments that their temporal chain requires a TRAA
resolve.

Review cameras freeze the Halton jitter index. Normal runtime admission must
compile the graph before combat; the HF-472 evidence currently rejects this
candidate because the headless perf rung observed six pipeline creations in
`deployed-idle` and a +1.2 ms moving p50 delta at 1440p. Treat those as release
fences, not as numbers to relax.
