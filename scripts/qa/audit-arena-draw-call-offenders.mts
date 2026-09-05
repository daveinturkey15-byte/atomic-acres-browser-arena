#!/usr/bin/env tsx
/**
 * audit-arena-draw-call-offenders.mts - PASS 95: why an arena's submitted draw
 * count is what it is.
 *
 * `audit-arena-draw-calls.mts` says HOW MANY draws an arena submits after the
 * runtime static batch. This says WHY: for every draw that survives batching it
 * names the reason `batchStaticMeshes` refused to merge it, and it groups the
 * surviving materials by value so a "97 materials" figure can be read as
 * "N genuinely different surfaces plus M near-duplicates".
 *
 * Usage: npx tsx scripts/qa/audit-arena-draw-call-offenders.mts <arenaId>
 */
import * as THREE from 'three';
import { buildersById } from './audit-arena-draw-calls.mts';

function refusalReason(mesh: THREE.Mesh, root: THREE.Object3D): string {
  let current: THREE.Object3D | null = mesh;
  while (current && current !== root.parent) {
    if (current.userData.dynamic === true) return 'dynamic-ancestor';
    current = current.parent;
  }
  if (!mesh.visible) return 'invisible';
  if (mesh.userData.targetRoot) return 'targetRoot';
  if (mesh.userData.pass73CollisionVisualOwner === true) return 'collisionVisualOwner';
  if (Array.isArray(mesh.material)) return 'multi-material';
  if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) return 'instanced';
  if (/-render-batches$/u.test(mesh.parent?.name ?? '')) return 'batch-output';
  return 'merged-or-other';
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error('usage: audit-arena-draw-call-offenders.mts <arenaId>');
  const builders = await buildersById();
  const build = builders[id];
  if (!build) throw new Error(`no builder for '${id}'`);
  const { batchStaticMeshes } = await import('../../src/art-kit');
  const scene = new THREE.Scene();
  const arena = build(scene) as { root: THREE.Object3D };
  batchStaticMeshes(arena.root, arena.root, () => '', 'preserve');

  const reasons = new Map<string, number>();
  const names = new Map<string, number>();
  const byMaterialValue = new Map<string, number>();
  arena.root.traverse((node) => {
    if (!node.visible) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    let hidden = false;
    for (let cursor: THREE.Object3D | null = node.parent; cursor; cursor = cursor.parent) {
      if (!cursor.visible) hidden = true;
    }
    if (hidden) return;
    const reason = refusalReason(mesh, arena.root);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    const key = `${reason}:${node.name || node.parent?.name || '(unnamed)'}`;
    names.set(key, (names.get(key) ?? 0) + 1);
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materialList) {
      if (!material) continue;
      const anyMaterial = material as unknown as Record<string, unknown>;
      const value = JSON.stringify({
        type: material.type,
        color: (anyMaterial.color as THREE.Color | undefined)?.getHex(),
        roughness: anyMaterial.roughness,
        metalness: anyMaterial.metalness,
        transparent: material.transparent,
        opacity: material.opacity,
        side: material.side,
        map: (anyMaterial.map as THREE.Texture | undefined)?.uuid,
      });
      byMaterialValue.set(value, (byMaterialValue.get(value) ?? 0) + 1);
    }
  });

  console.log(`${id}: surviving visible draws by refusal reason`);
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(24)} ${count}`);
  }
  console.log('\ntop surviving draw owners (reason:name):');
  for (const [key, count] of [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(count).padStart(4)}  ${key}`);
  }
  console.log(`\ndistinct surviving material VALUES: ${byMaterialValue.size}`);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
