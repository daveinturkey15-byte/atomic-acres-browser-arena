import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ForgedVehicle } from './build';
import type { VehicleSpec } from './geometry';
import { COACH_SPEC, SEDAN_SPEC, TRUCK_CAB_SPEC } from './specs';
import { quantizeVehicleAnchor } from './materials';

// Behaviour-based census of the ACTUAL arena builds (2026-09-12 completion).
// Reuses arena-budget.test.ts's observation wrapper and the forge's own
// pre-merge audit trail (partBounds) plus the per-anchor reader; adds no
// geometry, moves no fence and repins nothing.
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
import { mergedVehicleBounds } from './build';
import { buildNuketown2 } from '../nuketown2-arena';

/** Dressed envelope per vehicle family (length, width, height). Proud trim on top: the coach mirror heads stand 0.30 m off the flank (measured 2.96 m across the chrome), relief 0.02. */
const ENVELOPE: Readonly<Record<string, readonly [number, number, number]>> = {
  [COACH_SPEC.id]: [9.1, 2.6, 3.3],
  [TRUCK_CAB_SPEC.id]: [11.7, 2.6, 2.9],
  'nuketown2-truck-bogie': [11.7, 2.6, 2.9],
  [SEDAN_SPEC.id]: [4.4, 1.9, 1.88],
};
const TRIM_MARGIN = 0.45;
const anchorKey = (x: number, z: number): string => quantizeVehicleAnchor(x, z).map(Math.fround).join(',');

describe('completion census: every merged vehicle stays one vehicle', () => {
  observed.length = 0;
  const map = buildNuketown2(new THREE.Scene());
  map.root.updateMatrixWorld(true);
  const familyByAnchor = new Map<string, string>();
  for (const { id, built } of observed) familyByAnchor.set(anchorKey(built.group.position.x, built.group.position.z), id);

  it('bounds every merged mesh per vehicle anchor inside that vehicle\'s dressed envelope', () => {
    let merged = 0, anchorsSeen = 0, wholeMeshWider = 0;
    map.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith('vehicle-forge merged')) return;
      merged += 1;
      const perAnchor = mergedVehicleBounds(object.geometry);
      expect(perAnchor.size, `${object.name} carries anchors`).toBeGreaterThan(0);
      const whole = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      for (const [key, box] of perAnchor) {
        anchorsSeen += 1;
        const family = familyByAnchor.get(key);
        expect(family, `${object.name}: anchor ${key} belongs to an observed build`).toBeDefined();
        const size = box.getSize(new THREE.Vector3());
        // Yaw is a multiple of 90 degrees, so plan sizes permute; compare sorted.
        const plan = [size.x, size.z].sort((a, b) => b - a);
        const [length, width, height] = ENVELOPE[family!]!;
        expect(plan[0], `${object.name}/${family} length`).toBeLessThanOrEqual(length + TRIM_MARGIN);
        expect(plan[1], `${object.name}/${family} width`).toBeLessThanOrEqual(width + TRIM_MARGIN);
        expect(size.y, `${object.name}/${family} height`).toBeLessThanOrEqual(height + TRIM_MARGIN);
        if (whole.x > size.x + 1e-6 || whole.z > size.z + 1e-6) wholeMeshWider += 1;
      }
    });
    expect(merged).toBeGreaterThan(0);
    expect(anchorsSeen).toBeGreaterThanOrEqual(6);
    // The defect the parity gate reports is a WHOLE-mesh AABB spanning several
    // vehicles; per-anchor boxes never do. Printed, not pinned: layout owns it.
    console.log(JSON.stringify({ mergedMeshes: merged, anchorBoxes: anchorsSeen, anchorBoxesNarrowerThanWholeMesh: wholeMeshWider }));
  });

  it('keeps every tyre-bucket part above the fidelity plate line a wheel on a forged centre', () => {
    for (const { id, built } of observed) {
      const tyres = built.partBounds.filter((part) => part.bucket === 'tyre');
      // A carcass spans its full diameter and its squashed contact patch sits
      // on the road (CONTACT_SQUASH 0.035). Everything else above the 0.45
      // plate line (inboard discs) must share a plan centre with one.
      const carcasses = tyres.filter((part) => part.max[1] - part.min[1] >= 0.5 && part.min[1] <= 0.04);
      expect(carcasses.length, `${id} grounded wheel carcasses`).toBeGreaterThanOrEqual(2);
      for (const part of tyres) {
        const top = part.max[1];
        if (top <= 0.45) continue; // grounded dressing: contact pool, plates
        const cx = (part.min[0] + part.max[0]) / 2, cz = (part.min[2] + part.max[2]) / 2;
        // Exact on the axle position (z); the inboard disc sits up to a tyre
        // width inboard of the carcass centre along the axle (x).
        const onCarcass = carcasses.some((carcass) => Math.abs((carcass.min[0] + carcass.max[0]) / 2 - cx) <= 0.2
          && Math.abs((carcass.min[2] + carcass.max[2]) / 2 - cz) < 1e-6);
        expect(onCarcass, `${id} ${part.part} top ${top.toFixed(3)} at (${cx.toFixed(2)}, ${cz.toFixed(2)}) is not on a grounded wheel`).toBe(true);
      }
    }
  });

  it('prints the per-part allocation ledger for the actual arena builds', () => {
    for (const { id, built } of observed) {
      const parts = Object.entries(built.partTriangles).sort((a, b) => b[1] - a[1]).slice(0, 12);
      console.log(JSON.stringify({ id, triangles: built.triangles, partCounts: built.partCounts, top: parts }));
    }
    expect(observed).toHaveLength(7);
  });
});
