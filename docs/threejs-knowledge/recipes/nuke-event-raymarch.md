# Nuke event: bounded TSL volume

The Nuke Town event uses one shared `MeshBasicNodeMaterial` ray-marched over a
box with `NUKE_EVENT_RAY_STEPS = 40`. The background and detonation are draw
instances of that graph; origin, extents, mode, clock, seed, and timeline
values are uniforms. A separate `RingGeometry`/TSL material is the only other
new pipeline. This keeps the event presentation-only and avoids per-instance
node-graph baking or a full-screen pass.

The graph follows the current Three.js r185 NodeMaterial/raymarching shape used
by this checkout's `node_modules/three/examples/jsm/tsl/utils/Raymarching.js`.
For upstream orientation, see the [Three.js NodeMaterial documentation](https://threejs.org/docs/#api/en/materials/nodes/NodeMaterial)
and [WebGPURenderer documentation](https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer).

This recipe is a local re-implementation, not copied upstream code. Any future
change should preserve the 32-48 step bound, the two-pipeline ceiling, and the
menu-time prewarm before claiming a performance capture.
