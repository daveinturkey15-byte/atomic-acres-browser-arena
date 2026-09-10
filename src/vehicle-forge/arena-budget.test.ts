import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ForgedVehicle } from './build';
import type { VehicleSpec } from './geometry';
import { COACH_SPEC, TRUCK_CAB_SPEC, FORGED_VEHICLE_TRIANGLE_BUDGETS } from './specs';
import { quantizeVehicleAnchor } from './materials';

// Observe the actual arena's authored dressing, not a smaller test fixture.
// The wrapper returns the exact unmodified build and never substitutes geometry.
const observed = vi.hoisted(() => [] as Array<{ id: string; built: ForgedVehicle }>);
vi.mock('./build', async (original) => {
  const actual = await original<typeof import('./build')>();
  return { ...actual, buildForgedVehicle: (...args: Parameters<typeof actual.buildForgedVehicle>) => {
    const built = actual.buildForgedVehicle(...args);
    observed.push({ id: (args[0] as VehicleSpec).id, built });
    return built;
  }, buildForgedWheelSet: (...args: Parameters<typeof actual.buildForgedWheelSet>) => {
    const built = actual.buildForgedWheelSet(...args);
    observed.push({ id: args[0], built });
    return built;
  } };
});
import { buildNuketown2 } from '../nuketown2-arena';

describe('actual authored Nuke Town vehicle census', () => {
  it('partitions every merged triangle once and holds each actual vehicle to its existing cap', () => {
    observed.length = 0;
    const scene = new THREE.Scene();
    buildNuketown2(scene);
    // Six vehicles, seven authored builds: the truck bogie shares its cab anchor.
    expect(observed).toHaveLength(7);
    const byAnchor = new Map<string, number>();
    const meshIds = new Set<string>(), geometryIds = new Set<string>();
    let mergedTriangles = 0;
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith('vehicle-forge merged')) return;
      expect(object instanceof THREE.InstancedMesh, 'instances need explicit instance accounting').toBe(false);
      expect(meshIds.has(object.uuid), 'duplicate mesh traversal').toBe(false);
      expect(geometryIds.has(object.geometry.uuid), 'unexpected shared geometry needs explicit copy accounting').toBe(false);
      meshIds.add(object.uuid); geometryIds.add(object.geometry.uuid);
      const geometry = object.geometry, anchor = geometry.getAttribute('forgeVehicleAnchor');
      expect(geometry.index).toBeNull();
      expect(anchor.count).toBe(geometry.getAttribute('position').count);
      expect(anchor.count % 3).toBe(0);
      for (let i = 0; i < anchor.count; i += 3) {
        const key = `${anchor.getX(i)},${anchor.getY(i)}`;
        for (const j of [i + 1, i + 2]) expect(`${anchor.getX(j)},${anchor.getY(j)}`, 'triangle spans vehicle anchors').toBe(key);
        byAnchor.set(key, (byAnchor.get(key) ?? 0) + 1);
        mergedTriangles++;
      }
    });
    expect(byAnchor.size).toBe(6);
    expect(meshIds.size, 'existing shared-material draw ceiling').toBeLessThanOrEqual(15);
    expect(mergedTriangles).toBe(observed.reduce((sum, { built }) => sum + built.triangles, 0));
    const authoredByAnchor = new Map<string, { id: string; anchor: string; triangles: number; limit: number }>();
    for (const { id, built } of observed) {
      // mergeForgedPlacements sets the real mirrored placement on this group.
      const anchor = quantizeVehicleAnchor(built.group.position.x, built.group.position.z).map(Math.fround).join(',');
      expect([COACH_SPEC.id, TRUCK_CAB_SPEC.id, 'nuketown2-truck-bogie', 'nuketown2-sedan']).toContain(id);
      const limit = id === COACH_SPEC.id ? FORGED_VEHICLE_TRIANGLE_BUDGETS.coach
        : id === TRUCK_CAB_SPEC.id || id === 'nuketown2-truck-bogie' ? FORGED_VEHICLE_TRIANGLE_BUDGETS.truck : FORGED_VEHICLE_TRIANGLE_BUDGETS.saloon;
      const prior = authoredByAnchor.get(anchor);
      if (prior) expect(prior.limit, 'shared anchor must have the same vehicle family').toBe(limit);
      authoredByAnchor.set(anchor, { id: prior?.id ?? id, anchor, triangles: (prior?.triangles ?? 0) + built.triangles, limit });
    }
    const census = [...authoredByAnchor.values()].map(row => {
      expect(byAnchor.get(row.anchor), `${row.id} raw builds versus merged anchor partition`).toBe(row.triangles);
      return { ...row, excess: Math.max(0, row.triangles - row.limit) };
    });
    console.log(JSON.stringify({ mergedTriangles, mergedDrawMeshes: meshIds.size, census }));
    expect(census.filter(row => row.excess > 0), 'actual arena overages remain OPEN; fixture counts do not qualify').toEqual([]);
  });
});
