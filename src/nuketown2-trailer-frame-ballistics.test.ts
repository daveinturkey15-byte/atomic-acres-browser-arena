import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_CENTRAL_TRUCK, NUKETOWN2_HANDEDNESS, nuketown2HandedX } from './nuketown2-layout';
import { trailerFrameBoxes } from './vehicle-forge/trailer-frame';
import { traceBallisticPath } from './ballistics';
import { WEAPONS } from './gameplay';
import { auditArena, collectMeshCensus } from '../scripts/qa/collider-visual-parity-core';
import { proveTriangleShotCoverage } from '../scripts/qa/triangle-shot-coverage';
import type { Box2 } from './collision';

const door = { y0: .68, y1: 2.72, halfWidth: .92 };
const scene = new THREE.Scene(); const map = buildNuketown2(scene);
const rails = map.shotSurfaces.filter(s => s.name.includes('truck rear-frame rail'));
const truck = NUKETOWN2_CENTRAL_TRUCK;
const origin = new THREE.Vector3(nuketown2HandedX(truck.cabX + truck.cabLength / 2), 0, truck.z);
const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0),
  NUKETOWN2_HANDEDNESS === 1 ? -Math.PI / 2 : Math.PI / 2);
const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(rotation).add(origin);
const profile = { ...WEAPONS.carbine.penetration, penetrationPower: 100, maxPenetratedSurfaces: 8 };
const shoot = (x: number, y: number) => traceBallisticPath(world(x, y, 12),
  new THREE.Vector3(0, 0, -1).applyQuaternion(rotation), .6, profile, map.shotSurfaces);

describe('real arena trailer frame authority', () => {
  it('rates exactly four hidden metal raycast boxes without adding movement boxes', () => {
    expect(rails).toHaveLength(4);
    for (const rail of rails) {
      expect(rail.material).toBe('thin-metal'); expect(rail.classification).toBe('explicit');
      const proxy = map.raycastMeshes.find(mesh => mesh.userData.ballisticSurfaceId === rail.id)!;
      expect(proxy).toBeDefined(); expect(proxy.visible).toBe(false);
      expect(proxy.userData.collisionProxy).toBe(true);
      expect(map.colliders.includes(rail.bounds)).toBe(false);
      expect(map.physicsColliders.includes(rail.bounds)).toBe(false);
    }
  });
  it.each([[.885, 1.7], [-.885, 1.7], [0, .68], [0, 2.72], [.885, 2.70], [-.885, .70]])(
    'hits one 12mm metal layer at rail or corner (%s,%s) in the actual world placement', (x, y) => {
      const trace = shoot(x, y);
      expect(trace.impacts).toHaveLength(1);
      expect(rails.some(rail => rail.id === trace.impacts[0]!.surface.id)).toBe(true);
      expect(trace.impacts[0]!.thickness).toBeCloseTo(.012, 6);
    });
  it.each([[0, 1.7], [.84, 1.7], [-.84, 1.7], [0, .73], [0, 2.67]])(
    'keeps the cargo aperture free of shot blockers at (%s,%s)', (x, y) => {
    const trace = shoot(x, y);
    expect(trace.impacts).toEqual([]); expect(trace.damageMultiplier).toBe(1);
  });
  it('preserves every measured frame triangle and fails if any one rail authority is removed', () => {
    const frame = collectMeshCensus(scene).meshes.flatMap(m => m.ballisticParts ?? [m]).find(entry => {
      const middle = entry.box.getCenter(new THREE.Vector3());
      return entry.name === 'vehicle-forge merged chrome' && middle.distanceTo(world(0, 1.7, 11.706)) < .01
        && entry.box.max.y - entry.box.min.y > 2;
    })!;
    expect(frame.vertices).toBe(144); expect(frame.ballisticTriangles).toHaveLength(frame.vertices);
    expect(proveTriangleShotCoverage(frame.ballisticTriangles!, rails)?.triangles).toBe(48);
    for (const rail of rails) {
      expect(proveTriangleShotCoverage(frame.ballisticTriangles!, rails.filter(s => s !== rail))).toBeNull();
    }
  });
  it('returns the physical proof and conserves the full ballistic census', async () => {
    const result = await auditArena('nuketown2', buildNuketown2);
    expect(result.ballisticTriangleExplained?.some(p => p.triangles === 48 && p.surfaceIds.length === 4)).toBe(true);
    const c = result.ballisticCensus!;
    expect(c.ratedDirect + c.ratedByFootprint + c.ratedByTriangles + c.dynamicTargets + c.excludedByRule + c.unrated).toBe(c.total);
  });
});

describe('rear frame occupied solid conservation', () => {
  it('removes only duplicate internal upright ends, preserving occupied cells at authoring precision', () => {
    const old: Box2[] = [
      { minX: .85, maxX: .92, minY: .68, maxY: 2.72, minZ: 11.7, maxZ: 11.712 },
      { minX: -.92, maxX: -.85, minY: .68, maxY: 2.72, minZ: 11.7, maxZ: 11.712 },
      { minX: -.92, maxX: .92, minY: .645, maxY: .715, minZ: 11.7, maxZ: 11.712 },
      { minX: -.92, maxX: .92, minY: 2.685, maxY: 2.755, minZ: 11.7, maxZ: 11.712 },
    ];
    const next = trailerFrameBoxes(door, 11.7);
    const points = (axis: 'X' | 'Y' | 'Z') => {
      const edges = [...new Set([...old, ...next].flatMap(b => [b[`min${axis}`]!, b[`max${axis}`]!])
        .map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
      return edges.slice(1).map((edge, i) => (edge + edges[i]!) / 2);
    };
    const occupied = (boxes: Box2[], x: number, y: number, z: number) => boxes.filter(b =>
      x > b.minX && x < b.maxX && y > b.minY! && y < b.maxY! && z > b.minZ && z < b.maxZ).length;
    let overlapCells = 0;
    for (const x of points('X')) for (const y of points('Y')) for (const z of points('Z')) {
      expect(occupied(next, x, y, z) > 0).toBe(occupied(old, x, y, z) > 0);
      expect(occupied(next, x, y, z)).toBeLessThanOrEqual(1);
      if (occupied(old, x, y, z) > 1) overlapCells++;
    }
    expect(overlapCells).toBeGreaterThan(0);
  });
});
