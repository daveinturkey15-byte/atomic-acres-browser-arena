import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildFarcrysis } from './farcrysis';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import {
  FARCRYSIS_WATER_LEVEL,
  PLATE_FIT_TOLERANCE_M,
  farcrysisTerrainHeight,
  farcrysisTerrainProxyChunks,
} from './farcrysis-terrain-authority';
import { SPAWN_EYE_HEIGHT, floorBeneath } from './spawn-layout-constraints';

/**
 * HF-423. farcrysis is the only shipped arena whose ground was never in
 * `raycastMeshes`, so the shared HF-402 floor rule found no floor under it
 * (MEASURED: 202 of 3,136 dry cells, all prop tops) and bullets flew through
 * the island. These cases hold the collision proxy that closes both, and they
 * hold the two properties that made it silently useless the first time it was
 * written: the triangle winding, and the fact that an invisible mesh must
 * still be reachable through `raycastMeshes`.
 */

/** The dry-land sample grid the lane instrument uses. */
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

describe('farcrysis terrain collision proxy', () => {
  const arena = buildFarcrysis(new THREE.Scene());
  const proxies = arena.raycastMeshes.filter(
    (mesh) => mesh.userData.farcrysisTerrainProxy === true,
  ) as THREE.Mesh[];

  it('registers every chunk in raycastMeshes, invisible, and never in colliders', () => {
    expect(proxies.length).toBe(farcrysisTerrainProxyChunks().length);
    expect(proxies.length).toBeGreaterThan(0);
    for (const mesh of proxies) {
      expect(mesh.visible).toBe(false);
      // legacy-main's `activeRaycastMeshes` keeps an invisible mesh only when
      // it carries this flag; without it the proxy is filtered out at runtime
      // and every measurement here would still pass.
      expect(mesh.userData.collisionProxy).toBe(true);
      expect(mesh.castShadow).toBe(false);
    }
    // Line-of-sight, bot horizontal avoidance and spawn validation all iterate
    // `colliders`; ground there reads as walls. Same split the plates use.
    const proxyBoxes = farcrysisTerrainProxyChunks().filter((chunk) => (
      arena.colliders.some((box) => (
        box.minX === chunk.bounds.minX && box.maxX === chunk.bounds.maxX
        && box.minZ === chunk.bounds.minZ && box.maxZ === chunk.bounds.maxZ
      ))
    ));
    expect(proxyBoxes).toEqual([]);
  });

  it('winds its triangles so the face normals point UP', () => {
    // The first draft wound them the other way. Everything below still built,
    // the geometry was identical in outline, and every downward ray passed
    // straight through a FrontSide material - 0 hits over 3,136 cells.
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (const chunk of farcrysisTerrainProxyChunks()) {
      for (let t = 0; t < chunk.indices.length; t += 3) {
        const i0 = chunk.indices[t] * 3;
        const i1 = chunk.indices[t + 1] * 3;
        const i2 = chunk.indices[t + 2] * 3;
        a.fromArray(chunk.positions, i0);
        b.fromArray(chunk.positions, i1);
        c.fromArray(chunk.positions, i2);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        normal.crossVectors(ab, ac);
        expect(normal.y).toBeGreaterThan(0);
      }
    }
  });

  it('tracks the analytic surface inside the physics plates own fit tolerance', () => {
    // Sampled at mid-cell, OFF the proxy lattice, where linear interpolation is
    // worst; a sample on a vertex is exact by construction and proves nothing.
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    let worst = 0;
    let misses = 0;
    for (const cell of dryCells(4)) {
      const x = cell.x + 0.5;
      const z = cell.z + 0.5;
      const truth = farcrysisTerrainHeight(x, z);
      raycaster.set(new THREE.Vector3(x, truth + 40, z), down);
      raycaster.far = 200;
      const hit = raycaster.intersectObjects(proxies, true)[0];
      if (!hit) {
        misses += 1;
        continue;
      }
      worst = Math.max(worst, Math.abs(truth + 40 - hit.distance - truth));
    }
    expect(misses).toBe(0);
    expect(worst).toBeLessThanOrEqual(PLATE_FIT_TOLERANCE_M);
  });

  it('gives the SHARED spawn-quality floor rule a floor on every dry cell', () => {
    // This is the measurement the unhide turned on. Before the proxy: 202 of
    // 3,136 (6.44 %), every one a prop top.
    const raycaster = new THREE.Raycaster();
    const cells = dryCells(4);
    let found = 0;
    let fromRaycast = 0;
    for (const cell of cells) {
      const floor = floorBeneath(
        { x: cell.x, y: cell.groundY + SPAWN_EYE_HEIGHT, z: cell.z },
        arena,
        raycaster,
      );
      if (!floor) continue;
      found += 1;
      if (floor.source === 'raycast') fromRaycast += 1;
    }
    expect(found).toBe(cells.length);
    // Prop tops alone used to carry ~6 %; the ground itself must be the source
    // for the overwhelming majority, or the proxy is not what is being read.
    expect(fromRaycast / cells.length).toBeGreaterThan(0.9);
  });

  it('makes the ground a ballistic surface with a matching shot record', () => {
    // src/ballistics.test.ts asserts shotSurfaces/raycastMeshes parity across
    // every arena; this pins the farcrysis half of it at the chunk level so a
    // future chunk-count change cannot half-register.
    const ids = new Set(arena.shotSurfaces.map((surface) => surface.id));
    for (const mesh of proxies) {
      expect(typeof mesh.userData.ballisticSurfaceId).toBe('string');
      expect(ids.has(mesh.userData.ballisticSurfaceId as string)).toBe(true);
      expect(mesh.userData.ballisticMaterial).toBe('earth');
    }
  });
});
