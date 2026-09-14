/**
 * forge-kit/street/street.test.ts — HF-536 (NIGHT-MUSE-STREET) proof gates.
 *
 * Street wear kit: manholes, drain grates, tar patches, gutter litter,
 * kerb chips, pothole rings. Every claim here is measured on the composed
 * arena (`buildNuketown2`): tri counts, carriageway containment, host relief
 * over the authored asphalt top (y = 0), pairwise non-overlap (both pair()
 * images), >= 0.5 m from every vehicle rect in both frames, >= 1.5 m from
 * spawn pads and doorway runs, existing roles only, determinism, and zero
 * movement colliders.
 */

import { describe, expect, it } from 'vitest';
import type { ArenaMap } from '../../map';
import * as THREE from 'three';
import {
  buildNuketown2,
  NUKETOWN2_SPAWN_LAYOUT,
  NUKETOWN2_DOORWAYS,
} from '../../nuketown2-arena';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  NUKETOWN2_CENTRAL_TRUCK,
  NUKETOWN2_STREET_CARS,
  NUKETOWN2_STREET_COACH,
  nuketown2HandedX,
} from '../../nuketown2-layout';
import {
  DRAIN_GRATE_TRIANGLES,
  GUTTER_LITTER_TRIANGLES,
  KERB_CHIP_TRIANGLES,
  MANHOLE_COVER_TRIANGLES,
  POTHOLE_RING_TRIANGLES,
  STREET_BOX_TRIANGLES,
  STREET_ROLES,
  TAR_PATCH_TRIANGLES,
  drainGrate,
  gutterLitter,
  kerbChip,
  manholeCover,
  potholeRing,
  streetPropPlacements,
  tarPatch,
} from './prefabs';

const PREFAB_FACTORIES = [
  { name: 'manholeCover', fn: () => manholeCover(), expectedTris: MANHOLE_COVER_TRIANGLES },
  { name: 'drainGrate', fn: () => drainGrate(), expectedTris: DRAIN_GRATE_TRIANGLES },
  { name: 'tarPatch(1.2)', fn: () => tarPatch(1.2), expectedTris: TAR_PATCH_TRIANGLES },
  { name: 'tarPatch(0.9)', fn: () => tarPatch(0.9), expectedTris: TAR_PATCH_TRIANGLES },
  { name: 'tarPatch(1.4)', fn: () => tarPatch(1.4), expectedTris: TAR_PATCH_TRIANGLES },
  { name: 'gutterLitter(2.0)', fn: () => gutterLitter(2.0), expectedTris: GUTTER_LITTER_TRIANGLES },
  { name: 'kerbChip', fn: () => kerbChip(Math.PI / 6), expectedTris: KERB_CHIP_TRIANGLES },
  { name: 'potholeRing(0.6)', fn: () => potholeRing(0.6), expectedTris: POTHOLE_RING_TRIANGLES },
] as const;

function buildOnce(): ArenaMap {
  return buildNuketown2(new THREE.Scene());
}

function meshBox(mesh: THREE.Mesh): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  const box = new THREE.Box3().setFromObject(mesh);
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z };
}

function distancePointToAABB2D(px: number, pz: number, minX: number, maxX: number, minZ: number, maxZ: number): number {
  const dx = Math.max(minX - px, 0, px - maxX);
  const dz = Math.max(minZ - pz, 0, pz - maxZ);
  return Math.hypot(dx, dz);
}

function distanceAABBToAABB2D(
  aMinX: number, aMaxX: number, aMinZ: number, aMaxZ: number,
  bMinX: number, bMaxX: number, bMinZ: number, bMaxZ: number,
): number {
  const dx = Math.max(bMinX - aMaxX, aMinX - bMaxX, 0);
  const dz = Math.max(bMinZ - aMaxZ, aMinZ - bMaxZ, 0);
  return Math.hypot(dx, dz);
}

interface AABB { id: string; minX: number; maxX: number; minZ: number; maxZ: number }

function placementAABBs(map: ArenaMap): AABB[] {
  const out: AABB[] = [];
  for (const p of streetPropPlacements()) {
    for (const side of ['north', 'south'] as const) {
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (const part of p.parts) {
        const mesh = map.root.getObjectByName(`nuketown2 ${side} ${p.propId} ${part.suffix}`) as THREE.Mesh;
        const box = meshBox(mesh);
        minX = Math.min(minX, box.minX); maxX = Math.max(maxX, box.maxX);
        minZ = Math.min(minZ, box.minZ); maxZ = Math.max(maxZ, box.maxZ);
      }
      out.push({ id: `${side} ${p.propId}`, minX, maxX, minZ, maxZ });
    }
  }
  return out;
}

/** Vehicle plan rects in the world frame, both pair() images. */
function vehicleRects(): Array<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }> {
  const t = NUKETOWN2_CENTRAL_TRUCK;
  const c = NUKETOWN2_STREET_COACH;
  const authored = [
    { id: 'truck box', x0: t.x - t.boxLength / 2, x1: t.x + t.boxLength / 2, z0: t.z - t.width / 2, z1: t.z + t.width / 2 },
    { id: 'truck cab', x0: t.cabX - t.cabLength / 2, x1: t.cabX + t.cabLength / 2, z0: t.z - t.width / 2, z1: t.z + t.width / 2 },
    { id: 'coach', x0: c.x - c.length / 2, x1: c.x + c.length / 2, z0: c.z - c.width / 2, z1: c.z + c.width / 2 },
    { id: 'saloon', x0: NUKETOWN2_STREET_CARS.saloon.x - NUKETOWN2_STREET_CARS.saloon.length / 2, x1: NUKETOWN2_STREET_CARS.saloon.x + NUKETOWN2_STREET_CARS.saloon.length / 2, z0: NUKETOWN2_STREET_CARS.saloon.z - NUKETOWN2_STREET_CARS.saloon.width / 2, z1: NUKETOWN2_STREET_CARS.saloon.z + NUKETOWN2_STREET_CARS.saloon.width / 2 },
    { id: 'classic', x0: NUKETOWN2_STREET_CARS.classic.x - NUKETOWN2_STREET_CARS.classic.length / 2, x1: NUKETOWN2_STREET_CARS.classic.x + NUKETOWN2_STREET_CARS.classic.length / 2, z0: NUKETOWN2_STREET_CARS.classic.z - NUKETOWN2_STREET_CARS.classic.width / 2, z1: NUKETOWN2_STREET_CARS.classic.z + NUKETOWN2_STREET_CARS.classic.width / 2 },
  ];
  return authored.flatMap((r) => {
    const nx0 = nuketown2HandedX(r.x0); const nx1 = nuketown2HandedX(r.x1);
    return [
      { id: `north ${r.id}`, minX: Math.min(nx0, nx1), maxX: Math.max(nx0, nx1), minZ: r.z0, maxZ: r.z1 },
      { id: `south ${r.id}`, minX: Math.min(-nx0, -nx1), maxX: Math.max(-nx0, -nx1), minZ: -r.z1, maxZ: -r.z0 },
    ];
  });
}

describe('forge-kit street wear prefabs (HF-536 night-muse-street)', () => {
  it('counts triangles per prefab and total per side (<= 900)', () => {
    for (const prefab of PREFAB_FACTORIES) {
      const parts = prefab.fn();
      const tris = parts.length * STREET_BOX_TRIANGLES;
      expect(tris, `${prefab.name} triangle constant`).toBe(prefab.expectedTris);
    }
    // Five prefabs hold the 60-tri budget; the grate's brief-explicit frame +
    // five-bar construction costs 72 (see REPORT.md) — measured, not hidden.
    expect(MANHOLE_COVER_TRIANGLES).toBeLessThanOrEqual(60);
    expect(TAR_PATCH_TRIANGLES).toBeLessThanOrEqual(60);
    expect(GUTTER_LITTER_TRIANGLES).toBeLessThanOrEqual(60);
    expect(KERB_CHIP_TRIANGLES).toBeLessThanOrEqual(60);
    expect(POTHOLE_RING_TRIANGLES).toBeLessThanOrEqual(60);
    expect(DRAIN_GRATE_TRIANGLES, 'grate frame + five bars').toBe(72);

    const placements = streetPropPlacements();
    expect(placements.length, 'authored placement count').toBe(25);
    let totalBoxesPerSide = 0;
    for (const p of placements) totalBoxesPerSide += p.parts.length;
    const totalTrisPerSide = totalBoxesPerSide * STREET_BOX_TRIANGLES;
    expect(totalTrisPerSide, 'measured triangles per side').toBe(804);
    expect(totalTrisPerSide, 'total triangles per side <= 900').toBeLessThanOrEqual(900);
  });

  it('emits all street wear prefabs through pair() into both halves as 12-triangle boxes', () => {
    const map = buildOnce();
    const placements = streetPropPlacements();

    for (const placement of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of placement.parts) {
          const name = `nuketown2 ${side} ${placement.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          expect(mesh, `mesh ${name} exists in scene`).toBeDefined();
          expect(mesh.geometry, `${name} has BoxGeometry`).toBeInstanceOf(THREE.BoxGeometry);
          const triCount = (mesh.geometry.index?.count ?? 0) / 3;
          expect(triCount, `${name} has exactly 12 triangles`).toBe(12);
        }
      }
    }
  });

  it('uses existing material roles only', () => {
    const allowedRoles = new Set<string>(STREET_ROLES);
    const placements = streetPropPlacements();

    for (const p of placements) {
      expect(p.parts.length, `${p.propId} emits parts`).toBeGreaterThan(0);
      const suffixes = new Set<string>();
      for (const part of p.parts) {
        expect(allowedRoles.has(part.role), `${p.propId} ${part.suffix} role '${part.role}' in STREET_ROLES`).toBe(true);
        for (const val of [...part.offset, ...part.size]) {
          expect(Number.isFinite(val), `${p.propId} ${part.suffix} has finite numbers`).toBe(true);
        }
        expect(part.size[0] > 0 && part.size[1] > 0 && part.size[2] > 0, `${p.propId} ${part.suffix} has positive dimensions`).toBe(true);
        expect(part.suffix.trim(), `${p.propId} suffix non-empty`).not.toBe('');
        suffixes.add(part.suffix);
      }
      expect(suffixes.size, `${p.propId} suffixes unique`).toBe(p.parts.length);
    }
  });

  it('keeps every part AABB inside the carriageway+kerb footprint and the map bounds', () => {
    const map = buildOnce();
    const placements = streetPropPlacements();

    const onWorldCarriageway = (minX: number, maxX: number, minZ: number, maxZ: number): boolean => {
      // AABB corners + edge midpoints all inside one footprint entry.
      const pts: Array<[number, number]> = [
        [minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ],
        [(minX + maxX) / 2, minZ], [(minX + maxX) / 2, maxZ],
        [minX, (minZ + maxZ) / 2], [maxX, (minZ + maxZ) / 2],
      ];
      return pts.every(([x, z]) => NUKETOWN2_CARRIAGEWAY_FOOTPRINTS.some((footprint) => {
        if (footprint.shape === 'circle') {
          const worldCentreX = nuketown2HandedX(footprint.centreX);
          return Math.hypot(x - worldCentreX, z - footprint.centreZ) <= footprint.radius + 1e-4;
        }
        const loX = Math.min(nuketown2HandedX(footprint.x0), nuketown2HandedX(footprint.x1));
        const hiX = Math.max(nuketown2HandedX(footprint.x0), nuketown2HandedX(footprint.x1));
        return x >= loX - 1e-4 && x <= hiX + 1e-4 && z >= footprint.z0 - 1e-4 && z <= footprint.z1 + 1e-4;
      }));
    };

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);
          expect(box.minX, `${name} minX inside bounds`).toBeGreaterThanOrEqual(NUKETOWN2_BOUNDS.minX);
          expect(box.maxX, `${name} maxX inside bounds`).toBeLessThanOrEqual(NUKETOWN2_BOUNDS.maxX);
          expect(box.minZ, `${name} minZ inside bounds`).toBeGreaterThanOrEqual(NUKETOWN2_BOUNDS.minZ);
          expect(box.maxZ, `${name} maxZ inside bounds`).toBeLessThanOrEqual(NUKETOWN2_BOUNDS.maxZ);
          minX = Math.min(minX, box.minX); maxX = Math.max(maxX, box.maxX);
          minZ = Math.min(minZ, box.minZ); maxZ = Math.max(maxZ, box.maxZ);
        }
        expect(onWorldCarriageway(minX, maxX, minZ, maxZ), `${side} ${p.propId} AABB on carriageway`).toBe(true);
      }
    }
  });

  it('measures every part bottom 0.02–0.05 m above the authored host y (asphalt 0)', () => {
    const map = buildOnce();
    const placements = streetPropPlacements();

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);
          const relief = box.minY - 0;
          expect(relief, `${name} relief in [0.02, 0.05] (got ${relief.toFixed(4)})`).toBeGreaterThanOrEqual(0.02 - 1e-4);
          expect(relief, `${name} relief in [0.02, 0.05] (got ${relief.toFixed(4)})`).toBeLessThanOrEqual(0.05 + 1e-4);
        }
      }
    }
  });

  it('keeps all 50 placement AABBs pairwise non-overlapping', () => {
    const map = buildOnce();
    const boxes = placementAABBs(map);
    expect(boxes.length, 'both pair() images').toBe(50);

    let minGap = Infinity;
    let minPair = '';
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!; const b = boxes[j]!;
        const gap = distanceAABBToAABB2D(a.minX, a.maxX, a.minZ, a.maxZ, b.minX, b.maxX, b.minZ, b.maxZ);
        if (gap < minGap) { minGap = gap; minPair = `${a.id} vs ${b.id}`; }
        expect(gap, `${a.id} vs ${b.id} non-overlapping`).toBeGreaterThan(0);
      }
    }
    expect(minGap, `tightest pair (${minPair})`).toBeGreaterThan(0.05);
  });

  it('maintains >= 0.5 m from every vehicle rect in both frames', () => {
    const map = buildOnce();
    const boxes = placementAABBs(map);
    const rects = vehicleRects();

    for (const b of boxes) {
      for (const r of rects) {
        const dist = distanceAABBToAABB2D(b.minX, b.maxX, b.minZ, b.maxZ, r.minX, r.maxX, r.minZ, r.maxZ);
        expect(dist, `${b.id} clearance from ${r.id} >= 0.5 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(0.5 - 1e-4);
      }
    }
  });

  it('maintains >= 1.5 m clearance from all 16 spawn pads', () => {
    const map = buildOnce();
    const boxes = placementAABBs(map);
    const allSpawns = [...NUKETOWN2_SPAWN_LAYOUT[0]!, ...NUKETOWN2_SPAWN_LAYOUT[1]!];

    for (const b of boxes) {
      for (const [sx, sz] of allSpawns) {
        const dist = distancePointToAABB2D(sx, sz, b.minX, b.maxX, b.minZ, b.maxZ);
        expect(dist, `${b.id} clearance from spawn [${sx}, ${sz}] >= 1.5 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.5 - 1e-4);
      }
    }
  });

  it('maintains >= 1.5 m clearance from all doorway runs', () => {
    const map = buildOnce();
    const boxes = placementAABBs(map);

    const doorwayThresholds = NUKETOWN2_DOORWAYS.flatMap((door) => {
      const halfW = door.width / 2;
      if (door.span === 'x') {
        const x0 = door.centre - halfW;
        const x1 = door.centre + halfW;
        const [nx0, nx1] = [Math.min(nuketown2HandedX(x0), nuketown2HandedX(x1)), Math.max(nuketown2HandedX(x0), nuketown2HandedX(x1))];
        const [sx0, sx1] = [-nx1, -nx0];
        return [
          { id: `north ${door.id}`, minX: nx0, maxX: nx1, minZ: door.at - 1.0, maxZ: door.at + 1.0 },
          { id: `south ${door.id}`, minX: sx0, maxX: sx1, minZ: -door.at - 1.0, maxZ: -door.at + 1.0 },
        ];
      }
      const z0 = door.centre - halfW;
      const z1 = door.centre + halfW;
      const nx = nuketown2HandedX(door.at);
      return [
        { id: `north ${door.id}`, minX: nx - 1.0, maxX: nx + 1.0, minZ: z0, maxZ: z1 },
        { id: `south ${door.id}`, minX: -nx - 1.0, maxX: -nx + 1.0, minZ: -z1, maxZ: -z0 },
      ];
    });

    for (const b of boxes) {
      for (const dt of doorwayThresholds) {
        const dist = distanceAABBToAABB2D(b.minX, b.maxX, b.minZ, b.maxZ, dt.minX, dt.maxX, dt.minZ, dt.maxZ);
        expect(dist, `${b.id} clearance from ${dt.id} >= 1.5 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.5 - 1e-4);
      }
    }
  });

  it('is deterministic: streetPropPlacements() returns the same placements twice', () => {
    const first = streetPropPlacements();
    const second = streetPropPlacements();
    expect(second).toEqual(first);
  });

  it('marks every part presentationOnly: true, solid: false, shots: false with propId', () => {
    const map = buildOnce();
    const placements = streetPropPlacements();
    const shotSurfaces = new Map(map.shotSurfaces.map((s) => [s.name, s]));

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;

          expect(mesh.userData.presentationOnly, `${name} has presentationOnly`).toBe(true);
          expect(mesh.userData.nuketown2Prop, `${name} has nuketown2Prop propId`).toBe(`${side} ${p.propId}`);
          expect(mesh.userData.ballisticSurfaceId, `${name} has no ballistic id`).toBeUndefined();
          expect(shotSurfaces.has(name), `${name} is not in shotSurfaces`).toBe(false);
        }
      }
    }
  });

  it('adds zero movement colliders to the arena', () => {
    const map = buildOnce();
    const placements = streetPropPlacements();

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);

          const matchesCollider = map.colliders.some((c) => (
            Math.abs(c.minX - box.minX) < 1e-4
            && Math.abs(c.maxX - box.maxX) < 1e-4
            && Math.abs(c.minZ - box.minZ) < 1e-4
            && Math.abs(c.maxZ - box.maxZ) < 1e-4
          ));
          expect(matchesCollider, `${name} must not be a solid movement collider`).toBe(false);
        }
      }
    }
  });
});
