import * as THREE from 'three';

/**
 * farcrysis-instancing.ts — one InstancedMesh factory for every farcrysis
 * module, so the arena's instanced draws share WebGPU programs.
 *
 * PASS 84 (lane C) ROOT CAUSE, measured on the real WebGPU route
 * (scripts/qa/probe-farcrysis-boot-cdp.mjs, artifacts/qa/farcrysis-load/):
 * the first fenced farcrysis submission created 217 render pipelines from 196
 * DISTINCT vertex shader modules and never completed inside the 12 s admission
 * fence ("WebGPU queue completion exceeded 12000 ms for submission 1"), which
 * rolled the selection back and poisoned the next arena's fence too. Atomic
 * Acres creates 75 pipelines in the same phase and admits.
 *
 * Why 196 vertex shaders for a few dozen materials: three r185's instancing
 * node (`nodes/accessors/Instance.js` createInstanceMatrixNode) keeps the
 * instance matrices in a UNIFORM array whenever `instanceMatrix.count * 64`
 * fits the uniform-buffer limit (65536 B, i.e. up to 1024 instances), and the
 * WGSL for that array is declared `array<mat4x4<f32>, COUNT>` — the mesh's
 * allocated capacity is baked into the shader text. Every farcrysis layer was
 * constructed with capacity = its placement count (108 instanced meshes with
 * ~100 different counts), so identical materials compiled into different
 * programs, and every one of them again for the shadow pass. Above the limit
 * three switches to instanced vertex attributes, whose shader text carries no
 * count and is shared by every mesh that uses the same material variant.
 *
 * The factory therefore allocates every farcrysis instanced mesh at a capacity
 * that is (a) above the uniform path so the shader is count-free, and (b)
 * identical for every layer that fits, so even a device with a larger uniform
 * limit still produces one program per material variant. `mesh.count` keeps
 * the authored instance count: three draws, culls, raycasts and computes
 * bounds over `count`, never over capacity, so placement, LOD pairs,
 * per-instance colour and gameplay stay byte-for-byte as authored. Cost: 64 B
 * per padded slot, ~65 KB per layer, ~7 MB for the arena, uploaded once.
 */

/**
 * Smallest capacity that takes three's instanced-attribute path on the
 * default WebGPU uniform-buffer limit (65536 B / 64 B per mat4 = 1024).
 * Exported so the regression test asserts the same number the factory uses.
 */
export const FARCRYSIS_INSTANCE_SHARED_CAPACITY = 1025;

/**
 * Build an InstancedMesh with `count` authored instances on a shared,
 * count-free shader path. Layers larger than the shared capacity keep their
 * own capacity (they are already on the attribute path).
 */
export function farcrysisInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  count: number,
): THREE.InstancedMesh {
  const capacity = Math.max(count, FARCRYSIS_INSTANCE_SHARED_CAPACITY);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = count;
  return mesh;
}
