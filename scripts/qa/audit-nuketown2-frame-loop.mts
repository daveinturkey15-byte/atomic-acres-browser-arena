#!/usr/bin/env tsx
/**
 * audit-nuketown2-frame-loop.mts — PASS 94 lane TECHNIQUES frame-loop audit.
 *
 * Method: `threejs-frame-loop-audit` skill, restated from register row 9. The
 * skill's core principle is "severity follows the render loop": a small cost
 * inside a `requestAnimationFrame` callback outweighs a large one at build
 * time. So this instrument reports two separate things and never mixes them:
 *
 *   1. STATIC COST - the draw calls and triangles the arena submits, counted
 *      the way a renderer counts them (one draw per visible mesh; an
 *      InstancedMesh is ONE draw; a `THREE.LOD` contributes ONE draw, at the
 *      level its distance selects). This is what the 15 % draw-call ceiling is
 *      measured against.
 *   2. FRAME-LOOP COST - what the arena asks to be done sixty times a second.
 *      For this arena that is exactly one entry point, `updateArenaArt` ->
 *      `root.userData.nuketownLawnWind`, so the audit calls it a thousand
 *      times and checks that nothing it touches grows.
 *
 * LOD accounting. A `THREE.LOD` is counted at its NEAR level for the "worst
 * case" figure and at the level a camera at the arena centre would select for
 * the "typical" figure. Both are printed, because quoting only the worst case
 * over-states a design whose whole point is that the worst case is unreachable
 * (four avenue sectors 40 m apart cannot all be in one camera's near tier).
 *
 * Usage: npx tsx scripts/qa/audit-nuketown2-frame-loop.mts [--json <path>]
 */
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildNuketown2 } from '../../src/nuketown2-arena';

type Counts = { drawCalls: number; triangles: number };

function triangles(geometry: THREE.BufferGeometry): number {
  if (geometry.index) return geometry.index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

/**
 * Count draw calls the way a renderer does.
 *
 * `lodPolicy: 'near'` charges every LOD its level-0 mesh; `lodPolicy: 'centre'`
 * charges the level a camera standing at the arena origin would actually
 * select. Hidden meshes (the batcher leaves its source nodes `visible = false`)
 * are not counted - counting them is how a "batching saved N draws" claim gets
 * silently reversed.
 */
function count(root: THREE.Object3D, lodPolicy: 'near' | 'centre'): Counts {
  const camera = new THREE.Vector3(0, 1.7, 0);
  let drawCalls = 0;
  let tris = 0;
  const world = new THREE.Vector3();
  root.updateMatrixWorld(true);

  const visit = (node: THREE.Object3D): void => {
    if (node.visible === false) return;
    const lod = node as THREE.LOD;
    if (lod.isLOD === true) {
      lod.getWorldPosition(world);
      const distance = lodPolicy === 'near' ? 0 : world.distanceTo(camera);
      let chosen = lod.levels[0]?.object;
      for (const level of lod.levels) {
        if (distance >= level.distance) chosen = level.object;
      }
      if (chosen) {
        const mesh = chosen as THREE.Mesh;
        drawCalls += 1;
        const instances = (mesh as THREE.InstancedMesh).isInstancedMesh === true
          ? (mesh as THREE.InstancedMesh).count
          : 1;
        tris += triangles(mesh.geometry) * instances;
      }
      return; // an LOD's other levels are never submitted
    }
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh === true) {
      drawCalls += 1;
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh === true
        ? (mesh as THREE.InstancedMesh).count
        : 1;
      tris += triangles(mesh.geometry) * instances;
    }
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return { drawCalls, triangles: Math.round(tris) };
}

function main(): void {
  const jsonIndex = process.argv.indexOf('--json');
  const jsonPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : undefined;

  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);

  const worst = count(map.root, 'near');
  const typical = count(map.root, 'centre');

  // ---- frame-loop probe --------------------------------------------------
  // The arena exposes exactly ONE per-frame entry point. `legacy-main.ts`
  // drives it through `updateArenaArt(arena.root, visualNow)` for `nuketown2`,
  // and that function writes one uniform and returns.
  const wind = map.root.userData.nuketownLawnWind as ((seconds: number) => void) | undefined;
  if (typeof wind !== 'function') throw new Error('nuketownLawnWind is not wired - the frame hook is gone');

  // Warm-up, so the sample is not measuring first-call JIT.
  for (let i = 0; i < 200; i += 1) wind(i / 60);
  if (typeof globalThis.gc === 'function') globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  const started = process.hrtime.bigint();
  const FRAMES = 6000; // 100 seconds of gameplay at 60 Hz
  for (let i = 0; i < FRAMES; i += 1) wind(i / 60);
  const elapsedNs = Number(process.hrtime.bigint() - started);
  if (typeof globalThis.gc === 'function') globalThis.gc();
  const after = process.memoryUsage().heapUsed;
  const bytesPerFrame = (after - before) / FRAMES;
  const usPerFrame = elapsedNs / FRAMES / 1000;

  const lawn = map.root.userData.nuketown2LawnStats as Record<string, number> | undefined;
  const vegetation = map.root.userData.nuketown2VegetationStats as Record<string, number> | undefined;

  const report = {
    head: 'nuketown2 frame-loop audit',
    drawCalls: { worstCaseLodNear: worst.drawCalls, typicalFromArenaCentre: typical.drawCalls },
    triangles: { worstCaseLodNear: worst.triangles, typicalFromArenaCentre: typical.triangles },
    frameLoop: {
      entryPoints: 1,
      entryPoint: 'root.userData.nuketownLawnWind (driven by updateArenaArt)',
      framesSampled: FRAMES,
      microsecondsPerFrame: Number(usPerFrame.toFixed(4)),
      heapBytesPerFrame: Number(bytesPerFrame.toFixed(2)),
    },
    lawn,
    vegetation,
    colliders: map.colliders.length,
    raycastMeshes: map.raycastMeshes.length,
  };

  const lines = [
    '# nuketown2 frame-loop audit (threejs-frame-loop-audit, register row 9)',
    `# draw calls   worst-case (every LOD at level 0): ${worst.drawCalls}`,
    `#              typical (LOD levels a camera at the arena centre selects): ${typical.drawCalls}`,
    `# triangles    worst-case: ${worst.triangles}   typical: ${typical.triangles}`,
    `# frame loop   entry points: 1 (${report.frameLoop.entryPoint})`,
    `#              ${report.frameLoop.microsecondsPerFrame} us/frame over ${FRAMES} frames`,
    `#              ${report.frameLoop.heapBytesPerFrame} heap bytes/frame`
      + `${typeof globalThis.gc === 'function' ? '' : ' (run node with --expose-gc for a settled figure)'}`,
    `# colliders ${map.colliders.length} · raycast meshes ${map.raycastMeshes.length}`,
    `# lawn ${JSON.stringify(lawn)}`,
    `# vegetation ${JSON.stringify(vegetation)}`,
  ];
  console.log(lines.join('\n'));

  if (jsonPath) {
    const out = resolve(jsonPath);
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`written: ${out}`);
  }
}

main();
