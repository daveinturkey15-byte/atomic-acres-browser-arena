// Lane R (PASS 87, HF-423): does the SHARED spawn-quality floor rule find a
// floor on farcrysis?
//
//   npx tsx scripts/qa/measure-farcrysis-floor-coverage.ts [--out <file.json>]
//
// `floorBeneath` in src/spawn-layout-constraints.ts (Lane D's, unchanged by
// this lane) accepts a floor from exactly three sources: a downward ray against
// `arena.raycastMeshes`, the top face of an AXIS-ALIGNED box in `colliders` /
// `physicsColliders`, or the arena's fail-safe floor. farcrysis historically
// offered none of them under a standing player - its ground is 5,474 ROTATED
// tangent-plane plates, which that rule skips by construction, and its visual
// terrain was never registered for raycasts. Every other shipped arena pushes
// its ground into `raycastMeshes` (additional-maps.ts `ground` / `floor` /
// `tarmac`); farcrysis is the outlier, and that is a defect in the ARENA, not
// in the shared rule.
//
// This instrument measures the coverage both ways over the same dry-land grid,
// and reports the proxy's own height error against the analytic field, so the
// fix can be judged on numbers rather than on the gate turning green.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { buildFarcrysis } from '../../src/farcrysis';
import { FARCRYSIS_BOUNDS } from '../../src/farcrysis-constants';
import {
  FARCRYSIS_WATER_LEVEL,
  farcrysisTerrainHeight,
} from '../../src/farcrysis-terrain-authority';
import { SPAWN_EYE_HEIGHT, floorBeneath } from '../../src/spawn-layout-constraints';

/** Dry-land sample grid: the cells a player can actually stand on. */
function dryCells(stepM: number): Array<{ x: number; z: number; groundY: number }> {
  const out: Array<{ x: number; z: number; groundY: number }> = [];
  for (let x = FARCRYSIS_BOUNDS.minX + stepM / 2; x < FARCRYSIS_BOUNDS.maxX; x += stepM) {
    for (let z = FARCRYSIS_BOUNDS.minZ + stepM / 2; z < FARCRYSIS_BOUNDS.maxZ; z += stepM) {
      const groundY = farcrysisTerrainHeight(x, z);
      if (groundY <= FARCRYSIS_WATER_LEVEL) continue;
      out.push({ x, z, groundY });
    }
  }
  return out;
}

function main(): void {
  const outFlag = process.argv.indexOf('--out');
  const arena = buildFarcrysis(new THREE.Scene());
  const cells = dryCells(2);

  const raycaster = new THREE.Raycaster();
  let found = 0;
  const bySource: Record<string, number> = {};
  let worstGap = 0;
  for (const cell of cells) {
    const eye = { x: cell.x, y: cell.groundY + SPAWN_EYE_HEIGHT, z: cell.z };
    const floor = floorBeneath(eye, arena, raycaster);
    if (!floor) continue;
    found += 1;
    bySource[floor.source] = (bySource[floor.source] ?? 0) + 1;
    if (Math.abs(floor.gapM) > Math.abs(worstGap)) worstGap = floor.gapM;
  }

  // How accurately does whatever IS in raycastMeshes track the analytic field?
  const proxyMeshes = arena.raycastMeshes.filter(
    (mesh) => mesh.userData.farcrysisTerrainProxy === true,
  );
  let proxyError = { samples: 0, maxAbsM: 0, meanAbsM: 0, misses: 0 };
  if (proxyMeshes.length > 0) {
    let sum = 0;
    let max = 0;
    let misses = 0;
    let samples = 0;
    const down = new THREE.Vector3(0, -1, 0);
    for (const cell of cells) {
      // Deliberately OFF the proxy's own 1 m lattice: a sample that lands on a
      // vertex is exact by construction and measures nothing. These land near
      // the centre of a lattice cell, where linear interpolation is worst.
      const sx = cell.x + 0.5;
      const sz = cell.z + 0.5;
      const truth = farcrysisTerrainHeight(sx, sz);
      const origin = new THREE.Vector3(sx, truth + 40, sz);
      raycaster.set(origin, down);
      raycaster.far = 200;
      const hit = raycaster.intersectObjects(proxyMeshes, true)[0];
      if (!hit) {
        misses += 1;
        continue;
      }
      const error = Math.abs(origin.y - hit.distance - truth);
      samples += 1;
      sum += error;
      if (error > max) max = error;
    }
    proxyError = {
      samples,
      maxAbsM: Number(max.toFixed(4)),
      meanAbsM: Number((sum / Math.max(1, samples)).toFixed(4)),
      misses,
    };
  }

  let proxyTriangles = 0;
  for (const mesh of proxyMeshes) {
    const geometry = (mesh as THREE.Mesh).geometry;
    if (geometry instanceof THREE.BufferGeometry) {
      proxyTriangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryCells: cells.length,
    cellsWithFloor: found,
    coverage: Number((found / cells.length).toFixed(4)),
    bySource,
    worstAbsGapM: Number(worstGap.toFixed(4)),
    raycastMeshes: arena.raycastMeshes.length,
    shotSurfaces: arena.shotSurfaces.length,
    terrainProxyMeshes: proxyMeshes.length,
    terrainProxyTriangles: proxyTriangles,
    proxyError,
  };
  const text = JSON.stringify(report, null, 2);
  if (outFlag > -1 && process.argv[outFlag + 1]) {
    const path = resolve(process.argv[outFlag + 1]);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${text}\n`);
  }
  console.log(text);
}

main();
