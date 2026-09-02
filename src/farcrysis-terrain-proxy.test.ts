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
import { traceBallisticPath } from './ballistics';
import { WEAPONS } from './gameplay';
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

const CARBINE_PENETRATION = WEAPONS.carbine.penetration;

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

  it('never puts a standing player INSIDE the ground shot box', () => {
    // The defect this pins, found by the HF-423 registration trail and measured
    // before it was fixed: `surfaceInterval` in src/ballistics.ts models every
    // shot surface as a SOLID BOX. The first proxy used each chunk's tight
    // minimum-to-maximum ground as that box, so a player standing anywhere
    // lower than their chunk's high point had their EYE inside 'earth' and
    // their shot died 0.21 m from the muzzle. MEASURED over 2,000 level-ish
    // shots from a standing eye seated on the arena's own ground: 56.5 % began
    // inside the box and only 172 of 2,000 travelled 60 m.
    //
    // The box ceiling is now the chunk's LOWEST ground. This is the property
    // that makes that impossible, asserted over the whole island rather than
    // over the shots that happened to be sampled.
    const boxes = farcrysisTerrainProxyChunks();
    const byFootprint = (x: number, z: number) => boxes.filter((chunk) => (
      x >= chunk.bounds.minX && x <= chunk.bounds.maxX
      && z >= chunk.bounds.minZ && z <= chunk.bounds.maxZ
    ));
    let checked = 0;
    for (const cell of dryCells(2)) {
      for (const eye of [cell.groundY + 1.7, cell.groundY + 1.16, cell.groundY + 0.61]) {
        for (const chunk of byFootprint(cell.x, cell.z)) {
          checked += 1;
          expect(
            eye,
            `${chunk.id}: an eye at ${eye.toFixed(2)} m over ground ${cell.groundY.toFixed(2)} m `
            + `is inside the shot box (ceiling ${chunk.bounds.maxY?.toFixed(2)} m)`,
          ).toBeGreaterThan(chunk.bounds.maxY as number);
        }
      }
    }
    expect(checked).toBeGreaterThan(3000);
    // ...and the ceiling really is BELOW the surface it stands for, everywhere.
    for (const chunk of boxes) {
      expect(chunk.bounds.maxY as number).toBeLessThanOrEqual(chunk.visualBounds.maxY as number);
      expect(chunk.bounds.minY as number).toBeLessThan(chunk.bounds.maxY as number);
    }
  });

  it('still blocks a real share of the shots the ground itself blocks', () => {
    // The ceiling above converges on the truth from BELOW: it can let a bullet
    // through a hillside, it can never eat one at the muzzle. This pins the
    // under-blocking so a future change cannot quietly trade the whole of the
    // ground's shot authority away - the pre-lane value was ZERO.
    const surfaces = arena.shotSurfaces;
    const rc = new THREE.Raycaster();
    rc.far = 60;
    let rng = 12345;
    const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    let fired = 0;
    let stoppedByGround = 0;
    let groundTruth = 0;
    let muzzleInside = 0;
    while (fired < 600) {
      const x = FARCRYSIS_BOUNDS.minX + rand() * (FARCRYSIS_BOUNDS.maxX - FARCRYSIS_BOUNDS.minX);
      const z = FARCRYSIS_BOUNDS.minZ + rand() * (FARCRYSIS_BOUNDS.maxZ - FARCRYSIS_BOUNDS.minZ);
      const groundY = farcrysisTerrainHeight(x, z);
      if (groundY <= FARCRYSIS_WATER_LEVEL) continue;
      fired += 1;
      const origin = { x, y: groundY + 1.7, z };
      const angle = rand() * Math.PI * 2;
      const pitch = (rand() - 0.5) * 0.2;
      const dir = {
        x: Math.cos(angle) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.sin(angle) * Math.cos(pitch),
      };
      const trace = traceBallisticPath(origin, dir, 60, CARBINE_PENETRATION, surfaces);
      if (trace.impacts.some((impact) => (
        impact.surface.id.startsWith('farcrysis-terrain-proxy') && impact.entryDistance < 1e-6
      ))) muzzleInside += 1;
      if (!trace.reachedDistance && (trace.stoppedBy?.id ?? '').startsWith('farcrysis-terrain-proxy')) {
        stoppedByGround += 1;
      }
      rc.set(new THREE.Vector3(origin.x, origin.y, origin.z),
        new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
      if (rc.intersectObjects(proxies, false).length > 0) groundTruth += 1;
    }
    expect(muzzleInside, 'no shot may begin inside the ground').toBe(0);
    expect(groundTruth, 'the island must really be in the way of some of these shots')
      .toBeGreaterThan(fired * 0.2);
    // Measured 56 % over 2,000 shots; pinned at 40 % so ordinary sampling noise
    // does not fail it, and a collapse back toward zero does.
    expect(stoppedByGround / groundTruth).toBeGreaterThan(0.4);
  });
});
