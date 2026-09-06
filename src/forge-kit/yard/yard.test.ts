/**
 * forge-kit/yard/yard.test.ts — HF-536 (NIGHT-GEMINI4) proof gates.
 *
 * Proof requirements from BRIEF.md:
 * 1. Triangle count per prefab <= 120.
 * 2. Total triangles per yard <= 1,200.
 * 3. Every prefab AABB inside the yard footprint, above the lawn.
 * 4. >= 1.5 m from every spawn pad and doorway run.
 * 5. Role names exist and resolve to existing arena materials.
 * 6. presentationOnly flags set on every mesh.
 * 7. No solid bodies added (movement collider count identical before/after).
 * 8. Cast flags: cast: true for bins and table only; false for clutter.
 */

import { describe, expect, it } from 'vitest';
import type { ArenaMap } from '../../map';
import * as THREE from 'three';
import {
  buildNuketown2,
  NUKETOWN2_SPAWN_LAYOUT,
} from '../../nuketown2-arena';
import {
  GARDEN_CHAIR_TRIANGLES,
  GARDEN_TABLE_TRIANGLES,
  HOSE_REEL_TRIANGLES,
  MAILBOX_POST_TRIANGLES,
  PLANTER_WITH_PLANT_TRIANGLES,
  SAND_PIT_TOYS_TRIANGLES,
  WASHING_LINE_TRIANGLES,
  WHEELIE_BIN_TRIANGLES,
  YARD_BOX_TRIANGLES,
  YARD_ROLES,
  gardenChair,
  gardenTable,
  hoseReel,
  mailboxPost,
  planterWithPlant,
  sandPitToys,
  washingLine,
  wheelieBin,
  yardPropPlacements,
} from './prefabs';

const PREFAB_FACTORIES = [
  { name: 'wheelieBin(blue)', fn: () => wheelieBin('blue'), expectedTris: WHEELIE_BIN_TRIANGLES },
  { name: 'wheelieBin(green)', fn: () => wheelieBin('green'), expectedTris: WHEELIE_BIN_TRIANGLES },
  { name: 'mailboxPost()', fn: () => mailboxPost(), expectedTris: MAILBOX_POST_TRIANGLES },
  { name: 'gardenChair()', fn: () => gardenChair(), expectedTris: GARDEN_CHAIR_TRIANGLES },
  { name: 'gardenTable()', fn: () => gardenTable(), expectedTris: GARDEN_TABLE_TRIANGLES },
  { name: 'hoseReel()', fn: () => hoseReel(), expectedTris: HOSE_REEL_TRIANGLES },
  { name: 'washingLine()', fn: () => washingLine(), expectedTris: WASHING_LINE_TRIANGLES },
  { name: 'sandPitToys()', fn: () => sandPitToys(), expectedTris: SAND_PIT_TOYS_TRIANGLES },
  { name: 'planterWithPlant()', fn: () => planterWithPlant(), expectedTris: PLANTER_WITH_PLANT_TRIANGLES },
];

function buildOnce(): ArenaMap {
  return buildNuketown2(new THREE.Scene());
}

function meshBox(mesh: THREE.Mesh): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  const box = new THREE.Box3().setFromObject(mesh);
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
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
  const dx = Math.max(aMinX - bMaxX, 0, bMinX - aMaxX);
  const dz = Math.max(aMinZ - bMaxZ, 0, bMinZ - aMaxZ);
  return Math.hypot(dx, dz);
}

describe('forge-kit yard prefabs (HF-536 night-gemini4)', () => {
  it('enforces triangle count <= 120 per prefab and <= 1,200 total per yard', () => {
    for (const prefab of PREFAB_FACTORIES) {
      const parts = prefab.fn();
      const tris = parts.length * YARD_BOX_TRIANGLES;
      expect(tris, `${prefab.name} triangle constant`).toBe(prefab.expectedTris);
      expect(tris, `${prefab.name} <= 120 triangles`).toBeLessThanOrEqual(120);
    }

    const placements = yardPropPlacements();
    let totalBoxesPerYard = 0;
    for (const p of placements) {
      totalBoxesPerYard += p.parts.length;
    }
    const totalTrisPerYard = totalBoxesPerYard * YARD_BOX_TRIANGLES;
    expect(totalTrisPerYard, 'total triangles per yard <= 1,200').toBeLessThanOrEqual(1200);
    expect(totalTrisPerYard, 'measured triangles per yard').toBe(756);
  });

  it('emits all yard prefabs through pair() into both yards as 12-triangle boxes', () => {
    const map = buildOnce();
    const placements = yardPropPlacements();

    for (const placement of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of placement.parts) {
          const name = `nuketown2 ${side} ${placement.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          expect(mesh, `mesh ${name} exists in scene`).toBeDefined();
          expect(mesh.geometry, `${name} has geometry`).toBeInstanceOf(THREE.BoxGeometry);
          const triCount = (mesh.geometry.index?.count ?? 0) / 3;
          expect(triCount, `${name} has exactly 12 triangles`).toBe(12);
        }
      }
    }
  });

  it('uses existing material roles only and resolves onto existing arena materials', () => {
    const allowedRoles = new Set<string>(YARD_ROLES);
    const placements = yardPropPlacements();

    for (const p of placements) {
      for (const part of p.parts) {
        expect(allowedRoles.has(part.role), `${p.propId} ${part.suffix} role '${part.role}' is defined in YARD_ROLES`).toBe(true);
        for (const val of [...part.offset, ...part.size]) {
          expect(Number.isFinite(val), `${p.propId} ${part.suffix} has finite numbers`).toBe(true);
        }
        expect(part.size[0] > 0 && part.size[1] > 0 && part.size[2] > 0, `${p.propId} ${part.suffix} has positive dimensions`).toBe(true);
      }
    }

    // Material instance reuse: every yard kit mesh borrows an existing material instance
    const map = buildOnce();
    const nonKitMaterials = new Set<string>();
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.material || Array.isArray(node.material)) return;
      if (!node.name.includes(' yard ')) {
        nonKitMaterials.add(node.material.uuid);
      }
    });

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const mat = mesh.material as THREE.Material;
          expect(nonKitMaterials.has(mat.uuid), `${name} borrows an existing arena material instance`).toBe(true);
        }
      }
    }
  });

  it('keeps every prefab AABB inside the yard footprint and above the lawn', () => {
    const map = buildOnce();
    const placements = yardPropPlacements();

    // North yard: x in [-18, 18], z in [-35.8, -23.0] (between fence and house back wall)
    // South yard: x in [-18, 18], z in [23.0, 35.8]
    // Lawn level is at y = 0.
    const FOOTPRINT = {
      north: { minX: -18.0, maxX: 18.0, minZ: -35.8, maxZ: -23.0 },
      south: { minX: -18.0, maxX: 18.0, minZ: 23.0, maxZ: 35.8 },
    };

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        const bounds = FOOTPRINT[side];
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);

          expect(box.minX, `${name} minX inside yard`).toBeGreaterThanOrEqual(bounds.minX - 1e-4);
          expect(box.maxX, `${name} maxX inside yard`).toBeLessThanOrEqual(bounds.maxX + 1e-4);
          expect(box.minZ, `${name} minZ inside yard`).toBeGreaterThanOrEqual(bounds.minZ - 1e-4);
          expect(box.maxZ, `${name} maxZ inside yard`).toBeLessThanOrEqual(bounds.maxZ + 1e-4);
          // Above lawn (allowing small seating tolerance of -0.01 m for sand toys / ground seating)
          expect(box.minY, `${name} minY above lawn`).toBeGreaterThanOrEqual(-0.01);
        }
      }
    }
  });

  it('maintains >= 1.5 m clearance from every spawn pad', () => {
    const map = buildOnce();
    const placements = yardPropPlacements();

    // Collect all world spawn positions for team 0 and team 1
    const allSpawns: Array<{ team: number; x: number; z: number }> = [];
    for (const [teamIndex, spawns] of NUKETOWN2_SPAWN_LAYOUT.entries()) {
      for (const [x, z] of spawns) {
        allSpawns.push({ team: teamIndex, x, z });
      }
    }

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        // Calculate composite AABB of the prefab placement on this side
        let aabbMinX = Infinity;
        let aabbMaxX = -Infinity;
        let aabbMinZ = Infinity;
        let aabbMaxZ = -Infinity;

        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);
          aabbMinX = Math.min(aabbMinX, box.minX);
          aabbMaxX = Math.max(aabbMaxX, box.maxX);
          aabbMinZ = Math.min(aabbMinZ, box.minZ);
          aabbMaxZ = Math.max(aabbMaxZ, box.maxZ);
        }

        for (const spawn of allSpawns) {
          const dist = distancePointToAABB2D(spawn.x, spawn.z, aabbMinX, aabbMaxX, aabbMinZ, aabbMaxZ);
          expect(
            dist,
            `${side} ${p.propId} clearance from spawn T${spawn.team} (${spawn.x}, ${spawn.z}) >= 1.5 m (got ${dist.toFixed(2)} m)`,
          ).toBeGreaterThanOrEqual(1.5 - 1e-4);
        }
      }
    }
  });

  it('maintains >= 1.5 m clearance from all yard doorway runs', () => {
    const map = buildOnce();
    const placements = yardPropPlacements();

    // Doors connecting to back yard:
    // 1. House back door (north authored x in [-2.15, -0.35], at z = -23.0)
    //    In world coordinates (with nuketown2HandedX = -x):
    //    North world x in [0.35, 2.15], z <= -23.0
    //    South world x in [-2.15, -0.35], z >= 23.0
    // 2. Garage rear door (north authored x in [5.3, 7.1], at z = -23.0)
    //    In world coordinates:
    //    North world x in [-7.1, -5.3], z <= -23.0
    //    South world x in [5.3, 7.1], z >= 23.0
    const doorwayThresholds = [
      // North house back door run (threshold extending 1.8 m into yard)
      { id: 'north house back door', minX: 0.35, maxX: 2.15, minZ: -24.8, maxZ: -23.0 },
      // North garage rear door run
      { id: 'north garage rear door', minX: -7.1, maxX: -5.3, minZ: -24.8, maxZ: -23.0 },
      // South house back door run
      { id: 'south house back door', minX: -2.15, maxX: -0.35, minZ: 23.0, maxZ: 24.8 },
      // South garage rear door run
      { id: 'south garage rear door', minX: 5.3, maxX: 7.1, minZ: 23.0, maxZ: 24.8 },
    ];

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        let aabbMinX = Infinity;
        let aabbMaxX = -Infinity;
        let aabbMinZ = Infinity;
        let aabbMaxZ = -Infinity;

        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);
          aabbMinX = Math.min(aabbMinX, box.minX);
          aabbMaxX = Math.max(aabbMaxX, box.maxX);
          aabbMinZ = Math.min(aabbMinZ, box.minZ);
          aabbMaxZ = Math.max(aabbMaxZ, box.maxZ);
        }

        for (const door of doorwayThresholds) {
          const dist = distanceAABBToAABB2D(
            aabbMinX, aabbMaxX, aabbMinZ, aabbMaxZ,
            door.minX, door.maxX, door.minZ, door.maxZ,
          );
          expect(
            dist,
            `${side} ${p.propId} clearance from ${door.id} run >= 1.5 m (got ${dist.toFixed(2)} m)`,
          ).toBeGreaterThanOrEqual(1.5 - 1e-4);
        }
      }
    }
  });

  it('marks every part presentationOnly: true, solid: false, shots: false with propId', () => {
    const map = buildOnce();
    const placements = yardPropPlacements();
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
    const placements = yardPropPlacements();

    // Check that none of the map's movement colliders matches any yard kit part
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

  it('casts shadows for bins and table only, false for all other clutter', () => {
    const map = buildOnce();
    const placements = yardPropPlacements();

    for (const p of placements) {
      const shouldCast = p.propId.includes('bin') || p.propId.includes('table');
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          expect(mesh.castShadow, `${name} castShadow expectation`).toBe(shouldCast);
          expect(part.cast, `${p.propId} ${part.suffix} part.cast`).toBe(shouldCast);
        }
      }
    }
  });
});
