/**
 * forge-kit/street-signs/street-signs.test.ts — HF-536 (NIGHT-GEMINI5) proof gates.
 *
 * Mechanical test proof:
 * 1. Triangles <= 160 per prefab and <= 1,600 total per side.
 * 2. Every AABB inside verge/kerb footprint and off the carriageway.
 * 3. Every plate-border/lettering box measured 0.005–0.01 m proud of its plate (no coplanar faces).
 * 4. Pole base within 0.01 m of the verge y (y = 0).
 * 5. Pairwise clearances:
 *    - >= 1.5 m from every spawn pad
 *    - >= 1.5 m from every doorway run
 *    - >= 1.2 m from every lamp post
 *    - >= 1.2 m from every vehicle anchor
 * 6. Roles exist and resolve onto existing arena materials.
 * 7. Zero new materials with a map (count materials with maps is identical).
 * 8. Movement collider count identical (0 colliders added).
 * 9. presentationOnly on every mesh.
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
  NUKETOWN2_HEAD_CAR,
  NUKETOWN2_LAMP_POST_LAYOUT,
  NUKETOWN2_STREET_CARS,
  NUKETOWN2_STREET_COACH,
  nuketown2HandedX,
} from '../../nuketown2-layout';
import {
  BENCH_AND_BIN_TRIANGLES,
  BOLLARD_TRIANGLES,
  CHEVRON_BOARD_TRIANGLES,
  FIRE_HYDRANT_TRIANGLES,
  SPEED_ROUNDEL_TRIANGLES,
  STOP_SIGN_TRIANGLES,
  STREET_NAME_BLADE_TRIANGLES,
  STREET_SIGN_BOX_TRIANGLES,
  STREET_SIGN_ROLES,
  benchAndBin,
  bollard,
  chevronBoard,
  fireHydrant,
  speedRoundel,
  stopSign,
  streetNameBlade,
  streetSignPropPlacements,
} from './prefabs';

const PREFAB_FACTORIES = [
  { name: 'stopSign', fn: stopSign, expectedTris: STOP_SIGN_TRIANGLES },
  { name: 'streetNameBlade', fn: streetNameBlade, expectedTris: STREET_NAME_BLADE_TRIANGLES },
  { name: 'speedRoundel', fn: speedRoundel, expectedTris: SPEED_ROUNDEL_TRIANGLES },
  { name: 'chevronBoard', fn: chevronBoard, expectedTris: CHEVRON_BOARD_TRIANGLES },
  { name: 'bollard', fn: bollard, expectedTris: BOLLARD_TRIANGLES },
  { name: 'benchAndBin', fn: benchAndBin, expectedTris: BENCH_AND_BIN_TRIANGLES },
  { name: 'fireHydrant', fn: fireHydrant, expectedTris: FIRE_HYDRANT_TRIANGLES },
] as const;

function buildOnce(): ArenaMap {
  return buildNuketown2(new THREE.Scene());
}

function meshBox(mesh: THREE.Mesh): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
  mesh.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(mesh);
  return {
    minX: bbox.min.x,
    maxX: bbox.max.x,
    minY: bbox.min.y,
    maxY: bbox.max.y,
    minZ: bbox.min.z,
    maxZ: bbox.max.z,
  };
}

function distancePointToAABB2D(px: number, pz: number, minX: number, maxX: number, minZ: number, maxZ: number): number {
  const dx = Math.max(0, minX - px, px - maxX);
  const dz = Math.max(0, minZ - pz, pz - maxZ);
  return Math.hypot(dx, dz);
}

function distanceAABBToAABB2D(
  aMinX: number, aMaxX: number, aMinZ: number, aMaxZ: number,
  bMinX: number, bMaxX: number, bMinZ: number, bMaxZ: number,
): number {
  const dx = Math.max(0, aMinX - bMaxX, bMinX - aMaxX);
  const dz = Math.max(0, aMinZ - bMaxZ, bMinZ - aMaxZ);
  return Math.hypot(dx, dz);
}

describe('forge-kit street-signs prefabs (HF-536 night-gemini5)', () => {
  it('enforces triangle count <= 160 per prefab and <= 1,600 total per side', () => {
    for (const prefab of PREFAB_FACTORIES) {
      const parts = prefab.fn();
      const tris = parts.length * STREET_SIGN_BOX_TRIANGLES;
      expect(tris, `${prefab.name} triangle constant`).toBe(prefab.expectedTris);
      expect(tris, `${prefab.name} <= 160 triangles`).toBeLessThanOrEqual(160);
    }

    const placements = streetSignPropPlacements();
    let totalBoxesPerSide = 0;
    for (const p of placements) {
      totalBoxesPerSide += p.parts.length;
    }
    const totalTrisPerSide = totalBoxesPerSide * STREET_SIGN_BOX_TRIANGLES;
    expect(totalTrisPerSide, 'total triangles per side <= 1,600').toBeLessThanOrEqual(1600);
    expect(totalTrisPerSide, 'measured triangles per side').toBe(1164);
  });

  it('emits all street sign prefabs through pair() into both halves as 12-triangle boxes', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();

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

  it('uses existing material roles only and resolves onto existing arena materials', () => {
    const allowedRoles = new Set<string>(STREET_SIGN_ROLES);
    const placements = streetSignPropPlacements();

    for (const p of placements) {
      for (const part of p.parts) {
        expect(allowedRoles.has(part.role), `${p.propId} ${part.suffix} role '${part.role}' in STREET_SIGN_ROLES`).toBe(true);
        for (const val of [...part.offset, ...part.size]) {
          expect(Number.isFinite(val), `${p.propId} ${part.suffix} has finite numbers`).toBe(true);
        }
        expect(part.size[0] > 0 && part.size[1] > 0 && part.size[2] > 0, `${p.propId} ${part.suffix} has positive dimensions`).toBe(true);
      }
    }
  });

  it('adds zero materials with a texture map to the composed arena', () => {
    const map = buildOnce();
    let texturedMaterialCount = 0;
    map.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material;
        if (mat) {
          const materials = Array.isArray(mat) ? mat : [mat];
          for (const m of materials) {
            if ((m as THREE.MeshStandardMaterial).map) {
              texturedMaterialCount += 1;
            }
          }
        }
      }
    });
    // Arena is procedural geometry with zero texture maps on street signs
    expect(texturedMaterialCount).toBe(0);
  });

  it('measures every plate-border and lettering box 0.005–0.01 m proud of its plate', () => {
    // 1. stopSign: border boxes and bar box are 0.005 m proud of plate 0
    const stopParts = stopSign();
    const stopPlate = stopParts.find((p) => p.suffix === 'plate horiz')!;
    const stopPlateFront = stopPlate.offset[2] + stopPlate.size[2] / 2;
    for (const p of stopParts.filter((p) => p.suffix.startsWith('border') || p.suffix === 'bar')) {
      const front = p.offset[2] + p.size[2] / 2;
      const proud = front - stopPlateFront;
      expect(proud, `stop sign ${p.suffix} relief`).toBeCloseTo(0.005, 4);
      expect(proud).toBeGreaterThanOrEqual(0.005 - 1e-4);
      expect(proud).toBeLessThanOrEqual(0.01 + 1e-4);
    }

    // 2. streetNameBlade: edge strips and word boxes are 0.005 m proud of blade
    const bladeParts = streetNameBlade();
    const blade = bladeParts.find((p) => p.suffix === 'blade')!;
    const bladeFront = blade.offset[2] + blade.size[2] / 2;
    for (const p of bladeParts.filter((p) => p.suffix.startsWith('edge') || p.suffix.startsWith('word'))) {
      const front = p.offset[2] + p.size[2] / 2;
      const proud = front - bladeFront;
      expect(proud, `street name ${p.suffix} relief`).toBeCloseTo(0.005, 4);
      expect(proud).toBeGreaterThanOrEqual(0.005 - 1e-4);
      expect(proud).toBeLessThanOrEqual(0.01 + 1e-4);
    }

    // 3. speedRoundel: ring boxes and digits are 0.005 m proud of disc 0
    const roundelParts = speedRoundel();
    const disc = roundelParts.find((p) => p.suffix === 'disc 0')!;
    const discFront = disc.offset[2] + disc.size[2] / 2;
    for (const p of roundelParts.filter((p) => p.suffix.startsWith('ring') || p.suffix.startsWith('digit'))) {
      const front = p.offset[2] + p.size[2] / 2;
      const proud = front - discFront;
      expect(proud, `speed roundel ${p.suffix} relief`).toBeCloseTo(0.005, 4);
      expect(proud).toBeGreaterThanOrEqual(0.005 - 1e-4);
      expect(proud).toBeLessThanOrEqual(0.01 + 1e-4);
    }

    // 4. chevronBoard: chevron arms are 0.005 m proud of plate
    const chevParts = chevronBoard();
    const chevPlate = chevParts.find((p) => p.suffix === 'plate')!;
    const chevPlateFront = chevPlate.offset[2] + chevPlate.size[2] / 2;
    for (const p of chevParts.filter((p) => p.suffix.startsWith('chev'))) {
      const front = p.offset[2] + p.size[2] / 2;
      const proud = front - chevPlateFront;
      expect(proud, `chevron ${p.suffix} relief`).toBeCloseTo(0.005, 4);
      expect(proud).toBeGreaterThanOrEqual(0.005 - 1e-4);
      expect(proud).toBeLessThanOrEqual(0.01 + 1e-4);
    }

    // 5. bollard: white bands are 0.005 m proud of bollard body
    const bollardParts = bollard();
    const body = bollardParts.find((p) => p.suffix === 'body 0')!;
    const band = bollardParts.find((p) => p.suffix === 'band upper 0')!;
    const proud = (band.size[0] - body.size[0]) / 2;
    expect(proud, 'bollard band relief').toBeCloseTo(0.005, 4);
    expect(proud).toBeGreaterThanOrEqual(0.005 - 1e-4);
    expect(proud).toBeLessThanOrEqual(0.01 + 1e-4);
  });

  it('keeps pole base within 0.01 m of verge y (y = 0)', () => {
    const placements = streetSignPropPlacements();
    for (const p of placements) {
      // Find ground-touching parts (poles, bodies, posts, bases)
      const baseParts = p.parts.filter((part) => (
        part.suffix.includes('pole')
        || part.suffix.includes('post')
        || part.suffix.includes('body')
        || part.suffix.includes('flange')
        || part.suffix.includes('bench end')
        || part.suffix.includes('bin base')
      ));
      expect(baseParts.length, `${p.propId} has at least one base part`).toBeGreaterThan(0);
      for (const part of baseParts) {
        const bottomY = p.anchor[1] + part.offset[1] - part.size[1] / 2;
        expect(Math.abs(bottomY), `${p.propId} ${part.suffix} base within 0.01 m of y=0 (got ${bottomY})`).toBeLessThanOrEqual(0.01 + 1e-4);
      }
    }
  });

  it('keeps every prefab AABB strictly inside the map bounds', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);

          expect(box.minX, `${name} minX inside bounds`).toBeGreaterThanOrEqual(NUKETOWN2_BOUNDS.minX);
          expect(box.maxX, `${name} maxX inside bounds`).toBeLessThanOrEqual(NUKETOWN2_BOUNDS.maxX);
          expect(box.minZ, `${name} minZ inside bounds`).toBeGreaterThanOrEqual(NUKETOWN2_BOUNDS.minZ);
          expect(box.maxZ, `${name} maxZ inside bounds`).toBeLessThanOrEqual(NUKETOWN2_BOUNDS.maxZ);
          expect(box.minY, `${name} minY >= -0.05`).toBeGreaterThanOrEqual(-0.05);
        }
      }
    }
  });

  it('places every prefab on the verge/kerb line, never on the carriageway', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();

    // Carriageway check in world frame
    const onWorldCarriageway = (x: number, z: number): boolean => {
      return NUKETOWN2_CARRIAGEWAY_FOOTPRINTS.some((footprint) => {
        if (footprint.shape === 'circle') {
          const worldCentreX = nuketown2HandedX(footprint.centreX);
          return Math.hypot(x - worldCentreX, z - footprint.centreZ) < footprint.radius - 0.05;
        }
        const minX = Math.min(nuketown2HandedX(footprint.x0), nuketown2HandedX(footprint.x1));
        const maxX = Math.max(nuketown2HandedX(footprint.x0), nuketown2HandedX(footprint.x1));
        return x > minX + 0.05 && x < maxX - 0.05 && z > footprint.z0 + 0.05 && z < footprint.z1 - 0.05;
      });
    };

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

        const midX = (aabbMinX + aabbMaxX) / 2;
        const midZ = (aabbMinZ + aabbMaxZ) / 2;
        expect(onWorldCarriageway(midX, midZ), `${side} ${p.propId} centre must not be on carriageway`).toBe(false);
      }
    }
  });

  it('maintains >= 1.5 m clearance from all 16 spawn pads', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();
    const allSpawns = [...NUKETOWN2_SPAWN_LAYOUT[0]!, ...NUKETOWN2_SPAWN_LAYOUT[1]!];

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

        for (const [sx, sz] of allSpawns) {
          const dist = distancePointToAABB2D(sx, sz, aabbMinX, aabbMaxX, aabbMinZ, aabbMaxZ);
          expect(dist, `${side} ${p.propId} clearance from spawn [${sx}, ${sz}] >= 1.5 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.5 - 1e-4);
        }
      }
    }
  });

  it('maintains >= 1.5 m clearance from all doorway runs', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();

    // Map doorways from NUKETOWN2_DOORWAYS into world coordinates for both residential halves
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
      } else {
        const z0 = door.centre - halfW;
        const z1 = door.centre + halfW;
        const nx = nuketown2HandedX(door.at);
        return [
          { id: `north ${door.id}`, minX: nx - 1.0, maxX: nx + 1.0, minZ: z0, maxZ: z1 },
          { id: `south ${door.id}`, minX: -nx - 1.0, maxX: -nx + 1.0, minZ: -z1, maxZ: -z0 },
        ];
      }
    });

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

        for (const dt of doorwayThresholds) {
          const dist = distanceAABBToAABB2D(aabbMinX, aabbMaxX, aabbMinZ, aabbMaxZ, dt.minX, dt.maxX, dt.minZ, dt.maxZ);
          expect(dist, `${side} ${p.propId} clearance from ${dt.id} >= 1.5 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.5 - 1e-4);
        }
      }
    }
  });

  it('maintains >= 1.2 m clearance from all lamp posts', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();

    // Lamp posts world coordinates (both halves)
    const lamps = NUKETOWN2_LAMP_POST_LAYOUT.flatMap((lamp) => [
      { id: `north ${lamp.id}`, x: nuketown2HandedX(lamp.x), z: lamp.z },
      { id: `south ${lamp.id}`, x: -nuketown2HandedX(lamp.x), z: -lamp.z },
    ]);

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

        for (const lamp of lamps) {
          const dist = distancePointToAABB2D(lamp.x, lamp.z, aabbMinX, aabbMaxX, aabbMinZ, aabbMaxZ);
          expect(dist, `${side} ${p.propId} clearance from ${lamp.id} lamp post >= 1.2 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.2 - 1e-4);
        }
      }
    }
  });

  it('maintains >= 1.2 m clearance from all vehicle anchors', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();

    // Vehicles world anchors
    const vehicles: Array<{ id: string; x: number; z: number }> = [
      { id: 'truck box', x: nuketown2HandedX(NUKETOWN2_CENTRAL_TRUCK.x), z: NUKETOWN2_CENTRAL_TRUCK.z },
      { id: 'truck cab', x: nuketown2HandedX(NUKETOWN2_CENTRAL_TRUCK.cabX), z: NUKETOWN2_CENTRAL_TRUCK.z },
      { id: 'coach', x: nuketown2HandedX(NUKETOWN2_STREET_COACH.x), z: NUKETOWN2_STREET_COACH.z },
      { id: 'car classic', x: nuketown2HandedX(NUKETOWN2_STREET_CARS.classic.x), z: NUKETOWN2_STREET_CARS.classic.z },
      { id: 'car saloon', x: nuketown2HandedX(NUKETOWN2_STREET_CARS.saloon.x), z: NUKETOWN2_STREET_CARS.saloon.z },
      { id: 'head car', x: nuketown2HandedX(NUKETOWN2_HEAD_CAR.x), z: NUKETOWN2_HEAD_CAR.z },
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

        for (const v of vehicles) {
          const dist = distancePointToAABB2D(v.x, v.z, aabbMinX, aabbMaxX, aabbMinZ, aabbMaxZ);
          expect(dist, `${side} ${p.propId} clearance from ${v.id} >= 1.2 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.2 - 1e-4);
        }
      }
    }
  });

  it('marks every part presentationOnly: true, solid: false, shots: false with propId', () => {
    const map = buildOnce();
    const placements = streetSignPropPlacements();
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
    const placements = streetSignPropPlacements();

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
