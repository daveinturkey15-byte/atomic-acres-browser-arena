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
compile the graph before combat. The HF-472 Pass 1 evidence recorded six
`deployed-idle` pipeline creations and a +1.2 ms moving p50 delta at 1440p;
those historical values remain release fences, not numbers to relax.

## Pass 2 admission and cost recipe

The Pass 2 admission contract has three explicit TAA-on reach items:

1. `pass96.taa-temporal-resolve.tsl.v1` — the unattached resolve
   `NodeMaterial`.
2. `taa-history.copyTextureToTexture` — the one-time history seed copy. This
   is a backend copy command, not a render pipeline, but it is part of the
   history resource path.
3. `scene-pass.velocity-mrt` — every material/geometry identity found by the
   submitted-scene pipeline census, including hidden and non-selected LOD
   renderables.

At admission, compile the exact ScenePass against its real render target and
MRT, then compile the resolver twice with the two history textures swapped:

```ts
renderer.setMRT(null);
await renderer.compileAsync(QUAD, QUAD.camera, targetScene); // A -> B
await renderer.compileAsync(QUAD, QUAD.camera, targetScene); // B -> A
```

The two calls matter in r185 because the texture bindings participate in the
pipeline identity even though both directions share one WGSL graph. Then walk
the census-derived velocity candidates with the exact ScenePass target/MRT;
temporarily admitting a hidden or culled representative is valid only if its
visibility and frustum flags are restored immediately after compilation.

For the frame path, keep two full-resolution RGBA16F targets and ping-pong
them. The resolve writes directly to the next history target, avoiding a
full-resolution colour copy every frame. Keep the first-frame seed copy and
depth history copy. The resolve remains the first linear stage and retains
velocity reprojection, depth rejection, a 3x3 YCoCg clamp, and the
sharpen-free blend. On the owner’s 2560x1440 WebGPU run this brought the
QUALITY moving p50 to 16.2 ms versus 21.4 ms for the matched TAA-off control;
the measured delta is -5.2 ms against the unchanged +1.0 ms falsifier.

The upstream r185 reference remains [TRAANode.js in the Three.js r185
source](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/tsl/display/TRAANode.js);
current Three.js API verification starts at the [official Three.js
documentation](https://threejs.org/docs/llms.txt). The local implementation is
deliberately an in-repo graph rather than a vendored upstream module.
