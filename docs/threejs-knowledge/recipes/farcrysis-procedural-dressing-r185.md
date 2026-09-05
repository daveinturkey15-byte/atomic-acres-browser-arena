# FARCRYSIS procedural dressing on Three.js r185

Claim-state: VERIFIED for the implementation described by commit `a7ed8c5b`.

The dressing layer is presentation-only. It samples the existing FARCRYSIS
terrain and route/spawn authority, rejects placements inside the derived keep-
out bands, and emits deterministic procedural meshes. It does not create
colliders, raycast surfaces, spawns, patrol points or a second water surface.

## Reusable pattern

- Use a seeded `mulberry32` stream for each authored family so placement is
  reproducible without storing a placement asset.
- Build one reusable `BufferGeometry` per family, then use `THREE.InstancedMesh`
  with per-instance transforms and colors. Keep foliage graphs bounded and
  reuse an already admitted material when the material ceiling is the binding
  constraint.
- Derive terrain Y from the arena height function and derive route/spawn
  keep-outs from the layout constants. Never duplicate the gameplay roster in
  an art module.
- Set a bounding sphere after the final instance count. Use distance-only LOD
  visibility for the authored midstory and understory groups; do not allocate
  in the frame callback.
- Attach all new objects below the arena presentation root so the existing
  arena retirement traversal owns geometry/material disposal.

## Upstream references

- [Three.js r185 documentation](https://threejs.org/docs/llms.txt)
- [TSL procedural terrain example](https://threejs.org/examples/webgpu_tsl_procedural_terrain)
- [InstancedMesh example](https://threejs.org/examples/webgpu_instance_mesh.html)
- [Compute water example](https://threejs.org/examples/webgpu_compute_water.html)

The examples are API references only. The FARCRYSIS geometry, colors and
placement stream are authored locally and contain no copied game asset.
