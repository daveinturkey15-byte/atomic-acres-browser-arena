# Vehicle paint under a blue environment

## Recipe

For Atomic Acres' parked vehicle paint on Three.js r185, use
`MeshPhysicalNodeMaterial` as a dielectric: `metalness: 0`, base
`roughness: 0.20`, `clearcoat: 0.60`, `clearcoatRoughness: 0.25`, and
`specularIntensity: 0.08`. Keep the authored pigment in a per-material
uniform-backed `colorNode`; do not bake the swatch into the node graph.

The clearcoat owns the visible highlight while the reduced base specular lobe
prevents a blue sky from replacing the pigment. Keep the swatch in
`material.userData.nuketown2PaintKey` and include that key in static batch
identity whenever preserve-mode batching is used. This preserves distinct
liveries without multiplying the compiled node graph.

For forged geometry, use the shared material set and the measured authority
envelope. Scale presentation geometry to the collider instead of changing the
collider, keep the long axis on the authored local z axis, and mirror the
placement by position/yaw. Run the exact native-WebGPU review cameras before
accepting a visual change; code-level material tests are not a substitute for
the capture.

## Upstream references

- [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- [MeshPhysicalNodeMaterial](https://threejs.org/docs/pages/MeshPhysicalNodeMaterial.html)
- [TSL](https://threejs.org/docs/pages/TSL.html)
- [WebGPU clearcoat example](https://threejs.org/examples/webgpu_clearcoat.html)

## Local acceptance anchors

- `src/nuketown2-vehicle-materials.ts` owns the car-paint node graph and
  `specularIntensity` value.
- `src/vehicle-forge/materials.ts` is the shared forged-paint physics reference.
- `src/art-kit.ts` must include `nuketown2PaintKey` in preserve-mode batch keys.
- `scripts/qa/measure-nuketown2-vehicle-paint.mjs` is the numeric blue-reflection
  instrument; report the roster and board aggregates separately.
