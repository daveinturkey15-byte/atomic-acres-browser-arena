#!/usr/bin/env tsx
/**
 * audit-arena-residual-auto-matrices.mts - PASS 95.
 *
 * After `batchStaticMeshes` + `freezeStaticArenaMatrices`, which arena nodes
 * still recompose their matrix every frame, and are they provably static?
 *
 * The r185 tax (pass94 `three-r185-matrix-recompose` gotcha): every node with
 * `matrixAutoUpdate === true` recomposes its local matrix and re-multiplies its
 * world matrix on every matrix pass, whether or not anything changed - and the
 * renderer plus the shadow and post passes walk the graph more than once a
 * frame.
 *
 * Usage: npx tsx scripts/qa/audit-arena-residual-auto-matrices.mts <arenaId>
 */
import * as THREE from 'three';
import { buildersById } from './audit-arena-draw-calls.mts';

function hasDynamicAncestor(node: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let cursor: THREE.Object3D | null = node; cursor && cursor !== root.parent; cursor = cursor.parent) {
    if (cursor.userData.dynamic === true) return true;
  }
  return false;
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error('usage: audit-arena-residual-auto-matrices.mts <arenaId>');
  const builders = await buildersById();
  const build = builders[id];
  if (!build) throw new Error(`no builder for '${id}'`);
  const [{ batchStaticMeshes }, { freezeStaticArenaMatrices }] = await Promise.all([
    import('../../src/art-kit'),
    import('../../src/static-matrix-freeze'),
  ]);
  const scene = new THREE.Scene();
  const arena = build(scene) as { root: THREE.Object3D };
  batchStaticMeshes(arena.root, arena.root, () => '', 'preserve');
  freezeStaticArenaMatrices(arena.root);

  const buckets = new Map<string, number>();
  const examples = new Map<string, string[]>();
  arena.root.traverse((node) => {
    if (!node.matrixAutoUpdate) return;
    const dynamic = hasDynamicAncestor(node, arena.root);
    const kind = (node as THREE.Mesh).isMesh === true ? 'mesh' : node.type;
    const bucket = `${dynamic ? 'DYNAMIC-SUBTREE' : 'static-candidate'}:${kind}`;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    const list = examples.get(bucket) ?? [];
    if (list.length < 6) list.push(node.name || `(unnamed under ${node.parent?.name ?? '?'})`);
    examples.set(bucket, list);
  });

  console.log(`${id}: nodes still matrixAutoUpdate after batch + freeze`);
  for (const [bucket, count] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${bucket}`);
    console.log(`         e.g. ${(examples.get(bucket) ?? []).join(', ')}`);
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
