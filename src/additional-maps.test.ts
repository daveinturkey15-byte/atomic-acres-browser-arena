import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pointInsideBounds } from './collision';
import { buildGunRange, buildRustworks1v1 } from './additional-maps';

function expectSpawnContract(map: ReturnType<typeof buildRustworks1v1>): void {
  for (const team of [0, 1] as const) {
    expect(map.spawns[team].length).toBeGreaterThan(0);
    for (const spawn of map.spawns[team]) {
      expect(Number.isFinite(spawn.x)).toBe(true);
      expect(Number.isFinite(spawn.z)).toBe(true);
      expect(pointInsideBounds({ x: spawn.x, y: spawn.y, z: spawn.z }, map.bounds, 0.5)).toBe(true);
      expect(map.colliders.some((box) => spawn.x > box.minX && spawn.x < box.maxX && spawn.z > box.minZ && spawn.z < box.maxZ)).toBe(false);
    }
  }
}

describe('additional authored maps', () => {
  it('builds an original compact collision-backed industrial 1v1 arena', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    expect(map.id).toBe('rustworks-1v1');
    expect(map.label).toBe('Rustworks 1V1');
    expect(map.root.name).toContain('Rustworks');
    expect(map.colliders.length).toBeGreaterThanOrEqual(25);
    expect(map.raycastMeshes.length).toBeGreaterThanOrEqual(25);
    expect(map.patrolPoints.length).toBeGreaterThanOrEqual(8);
    expect(map.targets).toHaveLength(0);
    expect(map.root.getObjectByName('rustworks-lower-deck')).toBeTruthy();
    expect(map.root.getObjectByName('rustworks-upper-deck')).toBeTruthy();
    expect(map.root.getObjectByName('rustworks-lower-ramp')).toBeTruthy();
    expectSpawnContract(map);
  });

  it('builds an untimed three-distance score range with reusable targets', () => {
    const map = buildGunRange(new THREE.Scene());
    expect(map.id).toBe('gun-range');
    expect(map.label).toBe('Acres Gun Range');
    expect(map.targets).toHaveLength(9);
    expect(map.targets.filter((target) => target.distanceBand === 'near')).toHaveLength(3);
    expect(map.targets.filter((target) => target.distanceBand === 'mid')).toHaveLength(3);
    expect(map.targets.filter((target) => target.distanceBand === 'far')).toHaveLength(3);
    expect(map.targets.map((target) => target.scoreValue).sort((a, b) => a - b)).toEqual([
      100, 100, 100, 200, 200, 200, 300, 300, 300,
    ]);
    expect(map.targets.every((target) => target.root.userData.scoreValue === target.scoreValue)).toBe(true);
    expect(map.root.getObjectByName('gun-range-firing-line')).toBeTruthy();
    expect(map.root.getObjectByName('gun-range-backstop')).toBeTruthy();
    expectSpawnContract(map);
  });
});
