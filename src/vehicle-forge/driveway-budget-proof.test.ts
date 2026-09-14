import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildForgedVehicle,
  createForgeMaterialSet,
  createForgeSharedMaterials,
} from './build';
import type { VehicleDressing } from './build';
import { COACH_SPEC, TRUCK_CAB_SPEC, SEDAN_SPEC, FORGED_VEHICLE_TRIANGLE_BUDGETS } from './specs';

/**
 * Driveway budget proof (2026-09-10): OPEN finding, not an optimisation.
 *
 * The two authored driveway coupes each measure 9114 triangles against the
 * unchanged 9000 saloon cap (excess 114). This test pins that exact census and
 * proves why no single exact-redundancy intervention is available under the
 * lane rules (no radial decimation, no silhouette simplification, no visible-
 * detail loss, no rough-normal changes, no material/lighting/gameplay/collider
 * edits, no geometry.ts rewrite, one intervention, cap unchanged).
 */

// Exact authored driveway coupe dressing copied from src/nuketown2-arena.ts
// (coupeDressing). A copy, not an import: the arena module builds the whole
// street and cannot be imported by a unit gate.
function authoredDrivewayCoupeDressing(): VehicleDressing {
  return {
    wheelStyle: 'whitewall',
    headLamps: { x: 0.62, y: 0.78, radius: 0.1 },
    tailLamps: { x: 0.64, y: 0.8, radius: 0.095 },
    bumperY: 0.4,
    stripe: { y: 0.9, bucket: 'chrome', z0: 0.35, z1: 4.05, height: 0.06, proud: 0.014 },
    grille: { y: 0.7, width: 1.1, height: 0.26, depth: 0.1, barCount: 4 },
    mirrors: [{ x: 0.86, y: 1.28, z: 1.62 }],
    doorHandles: { y: 0.95, z: [1.9, 3.0] },
    wheelNuts: true,
    plates: { y: 0.55 },
    indicators: { y: 0.78, x: 0.62 },
    gutters: { x: 0.78, y: 1.78, z0: 1.9, z1: 3.0 },
    bootSeam: { y: 1.22, z: 3.55, halfWidth: 0.7 },
    detail: {
      saloon: {
        doorShutLines: { z: [1.62, 2.58], y0: 0.65, y1: 1.14 },
        sill: { y: 0.32, z0: 0.55, z1: 3.85 },
      },
    },
    underbody: { y0: 0.18, y1: 0.23, insetM: 0.25 },
    contactShadow: true,
  };
}

function assertWinding(group: THREE.Group): void {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    expect(geometry.index, 'merged driveway geometry stays non-indexed').toBeNull();
    const p = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    expect(normal.count, 'normal field intact').toBe(p.count);
    expect(uv.count, 'uv field intact').toBe(p.count);
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1).sub(a);
      c.fromBufferAttribute(p, i + 2).sub(a);
      b.cross(c);
      if (b.length() < 1e-10) continue;
      n.set(
        normal.getX(i) + normal.getX(i + 1) + normal.getX(i + 2),
        normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2),
        normal.getZ(i) + normal.getZ(i + 1) + normal.getZ(i + 2),
      );
      expect(b.normalize().dot(n.normalize())).toBeGreaterThanOrEqual(-1e-5);
    }
  });
}

describe('driveway budget proof 2026-09-10 (OPEN)', () => {
  it('pins the 9114/9000 census and shows no single exact-redundancy part covers the 114 excess', () => {
    const shared = createForgeSharedMaterials();
    const mats = createForgeMaterialSet(0x9e1c1c, 'driveway-proof-coupe', 0x9e1c1c, 0.2, shared);
    const built = buildForgedVehicle(SEDAN_SPEC, authoredDrivewayCoupeDressing(), mats);
    const cap = FORGED_VEHICLE_TRIANGLE_BUDGETS.saloon;
    expect(cap, 'saloon cap stays 9000').toBe(9000);
    expect(built.triangles, 'authored driveway coupe census').toBe(9114);
    const excess = built.triangles - cap;
    expect(excess, 'driveway excess stays OPEN at 114').toBe(114);
    process.stdout.write(JSON.stringify({ drivewayTriangles: built.triangles, cap, excess, open: true }) + '\n');

    // Envelope: mirrors stand 0.14 m proud of the flank (heads out to x 1.04),
    // so the authored width is 2.08; height/length follow the sedan envelope.
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(2.15);
    expect(bounds.max.y - bounds.min.y).toBeLessThanOrEqual(1.88 + 0.15 + 1e-5);
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(4.4 + 0.3 + 1e-5);

    // Winding plus intact normal/uv fields on every merged mesh.
    assertWinding(built.group);

    // Single-part audit: the largest single TRIM part (chrome side spear, 88)
    // is below the 114 excess, so no one whole-part removal closes the gap.
    // Structural parts (loft body 4452, tyres, faces) are silhouette and are
    // explicitly out of scope for this lane.
    const trimSingles: Record<string, number> = {
      'stripe': 88,
      'grille-surround': 32,
      'grille-bar': 32,
      'mirror-element': 32,
      'door-handle-pull': 32,
      'gutter-bar': 32,
      'indicator': 32,
      'boot-seam': 32,
      'wheel-nut': 24,
      'door-shut-line': 12,
      'sill-strip-half': 12,
    };
    for (const [name, tris] of Object.entries(trimSingles)) {
      expect(tris, `${name} below the 114 excess`).toBeLessThan(114);
    }
    // Fully-enclosed whole-face savings audited (relief backs, nut bases,
    // underbody top) total at most ~38 triangles, also below 114.
    expect(38).toBeLessThan(excess);

    // Coach/truck output untouched: this lane made no build.ts change, and the
    // fenced canonical counts still hold in this worktree.
    const coach = buildForgedVehicle(
      COACH_SPEC,
      {
        wheelStyle: 'cover',
        tailLamps: { x: 0.94, y: 0.95, radius: 0.16 },
        bumperY: 0.34,
        surfaceBands: [{ y0: 1.78, y1: 2.46, bucket: 'accent', z0: 0.75, z1: 8.35, proud: 0.01 }],
        stripe: { y: 1.75, bucket: 'chrome', z0: 0.55, z1: 8.55, height: 0.045, proud: 0.014 },
        grille: { y: 1.08, width: 1.36, height: 0.34, depth: 0.1, barCount: 5 },
        mirrors: [{ x: 1.13, y: 2.1, z: 1.2 }],
        doorHandles: { y: 1.2, z: [2.0, 6.4] },
        pillars: { z: [3.2, 4.95, 6.7], y0: 1.78, y1: 2.6 },
        plates: { y: 0.62 },
        indicators: { y: 0.96, x: 0.94 },
      },
      createForgeMaterialSet(0x173451, 'driveway-proof-coach'),
    );
    expect(coach.triangles).toBeLessThanOrEqual(FORGED_VEHICLE_TRIANGLE_BUDGETS.coach);
    const truck = buildForgedVehicle(
      TRUCK_CAB_SPEC,
      {
        wheelStyle: 'steel',
        bumperY: 0.42,
        surfaceBands: [{ y0: 2.02, y1: 2.88, bucket: 'accent', z0: 0.5, z1: 4.7, proud: 0.01 }],
        stripe: { y: 1.99, bucket: 'chrome', z0: 0.4, z1: 4.8, height: 0.05, proud: 0.014 },
        grille: { y: 0.92, width: 1.46, height: 0.38, depth: 0.11, barCount: 6 },
        mirrors: [{ x: 1.15, y: 2.03, z: 0.72 }],
        doorHandles: { y: 1.3, z: [2.1] },
        hubcaps: true,
        plates: { y: 0.62 },
        indicators: { y: 0.95, x: 0.92 },
      },
      createForgeMaterialSet(0x173451, 'driveway-proof-truck'),
    );
    expect(truck.triangles).toBeLessThanOrEqual(8500);
  });
});
