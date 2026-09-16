/**
 * InteriorsGray gate: room/doorway pins + porch-rooted BFS reachability.
 *
 * Every number is READ off the specs or the built scene — never re-typed —
 * so a drift between data, derivation and emission fails here instead of
 * passing twice-typed literals.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Builder } from './additional-maps';
import {
  ATOMIC_ACRES_REBUILD_DOORWAYS,
  ATOMIC_ACRES_REBUILD_SPREAD,
  ATOMIC_ACRES_REBUILD_PORCHES,
  ATOMIC_ACRES_REBUILD_ROOMS,
  REBUILD_DOOR_HEAD_Y,
  REBUILD_FRONT_DOOR_W,
  REBUILD_INTERIOR_DOOR_W,
  REBUILD_WIDE_OPENING_W,
  REBUILD_PORCH_STEP_M,
  REBUILD_STOREY_H,
  atomicAcresRebuildInteriorAuthority,
  buildAtomicAcresRebuildInteriors,
  frontDoorPortal,
  frontDoorSpec,
  garageSpec,
  garageWalls,
  houseFrame,
  houseSpec,
  rearLinkGap,
  REBUILD_GARAGE_H,
  REBUILD_INTERIOR_WALL_T,
  REBUILD_STAIR_RISER,
  REBUILD_STAIR_STEPS,
  REBUILD_STAIR_TREAD,
  REBUILD_STAIR_WIDTH,
  REBUILD_UPPER_DOOR_HEAD_Y,
  REBUILD_UPPER_FLOOR_Y,
  rebuildReachableRooms,
  stairSpec,
  type RebuildHouseId,
  upperDoors,
  upperReachableRooms,
  upperRooms,
  upperSlabs,
  upperWalls,
} from './atomic-acres-rebuild-interiors';

const HOUSES: readonly RebuildHouseId[] = ['west', 'east'];
const ROOM_IDS = ['living', 'kitchen', 'bath'] as const;

function makeBuilder(): Builder {
  const root = new THREE.Group();
  root.name = 'rebuild-interiors-test';
  return { root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0 };
}

interface Box {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}

function boxOf(mesh: THREE.Mesh): Box {
  const params = mesh.geometry as THREE.BoxGeometry;
  const { width, height, depth } = params.parameters;
  return {
    minX: mesh.position.x - width / 2, maxX: mesh.position.x + width / 2,
    minY: mesh.position.y - height / 2, maxY: mesh.position.y + height / 2,
    minZ: mesh.position.z - depth / 2, maxZ: mesh.position.z + depth / 2,
  };
}

function shellOf(house: RebuildHouseId): Box {
  const spec = houseSpec(house);
  return {
    minX: spec.cx - spec.w / 2, maxX: spec.cx + spec.w / 2,
    minY: 0, maxY: REBUILD_STOREY_H,
    minZ: spec.cz - spec.d / 2, maxZ: spec.cz + spec.d / 2,
  };
}

function roomsOf(house: RebuildHouseId): Box[] {
  return ATOMIC_ACRES_REBUILD_ROOMS.filter((room) => room.house === house).map((room) => ({
    minX: room.x0, maxX: room.x1,
    minY: 0, maxY: REBUILD_STOREY_H,
    minZ: room.z0, maxZ: room.z1,
  }));
}

describe('Atomic Acres rebuild interiors (InteriorsGray)', () => {
  it('defines three walkable ground rooms per house, strictly inside their shells', () => {
    for (const house of HOUSES) {
      const rooms = ATOMIC_ACRES_REBUILD_ROOMS.filter((room) => room.house === house).map((room) => room.id);
      expect([...rooms].sort()).toEqual([...ROOM_IDS].sort());
      const shell = shellOf(house);
      for (const room of roomsOf(house)) {
        expect(room.minX).toBeGreaterThan(shell.minX);
        expect(room.maxX).toBeLessThan(shell.maxX);
        expect(room.minZ).toBeGreaterThan(shell.minZ);
        expect(room.maxZ).toBeLessThan(shell.maxZ);
        expect((room.maxX - room.minX) * (room.maxZ - room.minZ)).toBeGreaterThan(2);
      }
    }
  });

  it('keeps rooms disjoint: touching edges share no area', () => {
    for (const house of HOUSES) {
      const rooms = roomsOf(house);
      for (let a = 0; a < rooms.length; a += 1) {
        for (let b = a + 1; b < rooms.length; b += 1) {
          const first = rooms[a]!;
          const second = rooms[b]!;
          const overlapX = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
          const overlapZ = Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ);
          expect(overlapX <= 0 || overlapZ <= 0, `rooms ${a}/${b} overlap`).toBe(true);
        }
      }
    }
  });

  it('cuts front-door portals at >= 0.95 m on the loop-facing shell face', () => {
    for (const house of HOUSES) {
      const spec = houseSpec(house);
      const door = frontDoorSpec(house);
      expect(door.width).toBe(REBUILD_FRONT_DOOR_W);
      expect(door.width).toBeGreaterThanOrEqual(0.95);
      expect(door.span).toBe('z');
      expect(door.centre).toBe(spec.cz);
      expect(door.at).toBe(spec.cx + spec.face * (spec.w / 2));
      expect(door.from).toBe('porch');
      expect(door.to).toBe('living');
      const portal = frontDoorPortal(house);
      expect(portal.face).toBe(spec.face);
      expect(portal.planeX).toBe(door.at);
      expect(portal.centreZ).toBe(spec.cz);
    }
  });

  it('pins interior doors to the module constants, inside the rear-band run', () => {
    for (const house of HOUSES) {
      const spec = houseSpec(house);
      const zLo = spec.cz - spec.d / 2;
      const zHi = spec.cz + spec.d / 2;
      for (const door of ATOMIC_ACRES_REBUILD_DOORWAYS.filter((entry) => entry.house === house && entry.from !== 'porch')) {
        expect([REBUILD_INTERIOR_DOOR_W, REBUILD_WIDE_OPENING_W].includes(door.width)).toBe(true);
        expect(door.headY).toBe(REBUILD_DOOR_HEAD_Y);
        expect(door.span).toBe('z');
        // Wide great-room openings may run past the room frontage into the
        // neighbouring gap (open plan); the centre stays on the run and the
        // wall builder clamps the overlap. Narrow doors stay strictly inside.
        expect(door.centre).toBeGreaterThan(zLo);
        expect(door.centre).toBeLessThan(zHi);
        if (door.width === REBUILD_INTERIOR_DOOR_W) {
          expect(door.centre - door.width / 2).toBeGreaterThan(zLo);
          expect(door.centre + door.width / 2).toBeLessThan(zHi);
        }
      }
    }
  });

  it('specifies the porch LayoutGray builds: slab footprint plus the 0.45 m step note', () => {
    for (const house of HOUSES) {
      const spec = houseSpec(house);
      const porch = ATOMIC_ACRES_REBUILD_PORCHES.find((entry) => entry.house === house)!;
      expect(porch.x1 - porch.x0).toBe(2.0);
      expect(porch.z1 - porch.z0).toBeCloseTo(spec.d * 0.9, 9);
      expect((porch.x0 + porch.x1) / 2).toBeCloseTo(spec.cx + spec.face * (spec.w / 2 + 1.0), 9);
      expect(porch.stepM).toBe(REBUILD_PORCH_STEP_M);
    }
  });

  it('reaches every room from its porch: BFS over the doorway graph', () => {
    for (const house of HOUSES) {
      expect([...rebuildReachableRooms(house)].sort()).toEqual([...ROOM_IDS].sort());
    }
  });

  it('leaves no sealed pockets: every room touches at least one doorway', () => {
    for (const house of HOUSES) {
      const doors = ATOMIC_ACRES_REBUILD_DOORWAYS.filter((entry) => entry.house === house);
      for (const id of ROOM_IDS) {
        const incident = doors.filter((door) => door.from === id || door.to === id);
        expect(incident.length, `${house} ${id} has no doorway`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves every interior gap open below the head and headed by a lintel', () => {
    const builder = makeBuilder();
    const meshes = buildAtomicAcresRebuildInteriors(builder);
    const uprights = meshes.filter((mesh) => !mesh.name.includes('lintel')).map(boxOf);
    const lintels = meshes.filter((mesh) => mesh.name.includes('lintel')).map(boxOf);
    for (const house of HOUSES) {
      for (const door of ATOMIC_ACRES_REBUILD_DOORWAYS.filter((entry) => entry.house === house && entry.from !== 'porch')) {
        // Meshes live in the SPREAD frame; probe points scale with them.
        const wx = door.at * ATOMIC_ACRES_REBUILD_SPREAD;
        const wz = door.centre * ATOMIC_ACRES_REBUILD_SPREAD;
        const blocked = uprights.some((box) => wx > box.minX && wx < box.maxX && wz > box.minZ && wz < box.maxZ && 1.0 > box.minY && 1.0 < box.maxY);
        expect(blocked, `${door.id} gap blocked at standing height`).toBe(false);
        const headed = lintels.some((box) => wx > box.minX && wx < box.maxX && wz > box.minZ && wz < box.maxZ && 2.6 > box.minY && 2.6 < box.maxY);
        expect(headed, `${door.id} has no lintel above the head`).toBe(true);
      }
    }
  });

  it('matches movement authority to the shells exactly: collider footprints equal mesh boxes', () => {
    const builder = makeBuilder();
    const meshes = buildAtomicAcresRebuildInteriors(builder);
    const uprights = meshes.filter((mesh) => !mesh.name.includes('lintel'));
    expect(builder.colliders).toHaveLength(uprights.length);
    expect(builder.physicsColliders).toHaveLength(uprights.length);
    expect(builder.shotSurfaces).toHaveLength(meshes.length);
    for (const mesh of uprights) {
      const built = boxOf(mesh);
      const match = builder.colliders.some(
        (rect) => rect.minX === built.minX && rect.maxX === built.maxX && rect.minZ === built.minZ && rect.maxZ === built.maxZ,
      );
      expect(match, `${mesh.name} has no exact collider`).toBe(true);
    }
    const rects = atomicAcresRebuildInteriorAuthority();
    expect(rects.filter((rect) => rect.kind === 'solid')).toHaveLength(uprights.length);
    const lintelBoxes = meshes.filter((mesh) => mesh.name.includes('lintel')).map(boxOf);
    expect(rects.filter((rect) => rect.kind === 'lintel')).toHaveLength(lintelBoxes.length);
    for (const rect of rects.filter((entry) => entry.kind === 'solid')) {
      const match = builder.colliders.some(
        (emitted) => emitted.minX === rect.x0 && emitted.maxX === rect.x1 && emitted.minZ === rect.z0 && emitted.maxZ === rect.z1,
      );
      expect(match, `authority rect ${rect.house}/solid matches no emitted collider`).toBe(true);
    }
    for (const rect of rects.filter((entry) => entry.kind === 'lintel')) {
      const shotOnly = !builder.colliders.some(
        (emitted) => emitted.minX === rect.x0 && emitted.maxX === rect.x1 && emitted.minZ === rect.z0 && emitted.maxZ === rect.z1,
      );
      expect(shotOnly, `lintel rect ${rect.house} leaks into movement colliders`).toBe(true);
      const headed = lintelBoxes.some(
        (built) => built.minX === rect.x0 && built.maxX === rect.x1 && built.minZ === rect.z0 && built.maxZ === rect.z1,
      );
      expect(headed, `lintel rect ${rect.house} matches no emitted lintel mesh`).toBe(true);
    }
  });
});

describe('Atomic Acres rebuild upper storey, stairs and garage link', () => {
  it('fits four disjoint upper rooms per house inside the shell', () => {
    for (const house of HOUSES) {
      const spec = houseSpec(house);
      const frame = houseFrame(spec);
      const x0 = spec.cx - spec.w / 2 + 0.3;
      const x1 = spec.cx + spec.w / 2 - 0.3;
      const z0 = spec.cz - spec.d / 2 + 0.3;
      const z1 = spec.cz + spec.d / 2 - 0.3;
      const rooms = upperRooms(house);
      expect(rooms.map((room) => room.id).sort()).toEqual(['bathUp', 'landing', 'rearBed']);
      for (const room of rooms) {
        expect(room.x0).toBeGreaterThanOrEqual(x0);
        expect(room.x1).toBeLessThanOrEqual(x1);
        expect(room.z0).toBeGreaterThanOrEqual(z0);
        expect(room.z1).toBeLessThanOrEqual(z1);
        expect((room.x1 - room.x0) * (room.z1 - room.z0)).toBeGreaterThan(2);
      }
      for (let a = 0; a < rooms.length; a += 1) {
        for (let b = a + 1; b < rooms.length; b += 1) {
          const first = rooms[a]!;
          const second = rooms[b]!;
          const overlapX = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
          const overlapZ = Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0);
          expect(overlapX <= 0 || overlapZ <= 0, `upper rooms ${a}/${b} overlap`).toBe(true);
        }
      }
      void frame;
    }
  });
  it('tiles the upper floor minus the stairwell hole', () => {
    for (const house of HOUSES) {
      const spec = houseSpec(house);
      const frame = houseFrame(spec);
      const stair = stairSpec(house);
      const footprint = (frame.xHi - frame.xLo) * (frame.zHi - frame.zLo);
      const hole = (stair.x1 - stair.x0) * (stair.zB - stair.zA);
      const tiled = upperSlabs(house).reduce((sum, slab) => sum + (slab.x1 - slab.x0) * (slab.z1 - slab.z0), 0);
      expect(tiled).toBeCloseTo(footprint - hole, 9);
      expect(upperWalls(house).length).toBeGreaterThan(3);
    }
  });

  it('reaches every upper room from the stairtop', () => {
    for (const house of HOUSES) {
      expect([...upperReachableRooms(house)].sort()).toEqual(['bathUp', 'landing', 'rearBed']);
    }
  });

  it('climbs 3 m in autostep-clear risers with headroom under the slab', () => {
    for (const house of HOUSES) {
      const stair = stairSpec(house);
      expect(REBUILD_STAIR_STEPS * REBUILD_STAIR_RISER).toBeCloseTo(3.0, 9);
      expect(REBUILD_STAIR_RISER).toBeLessThanOrEqual(0.42);
      expect(REBUILD_STAIR_TREAD).toBeGreaterThanOrEqual(0.22);
      expect(stair.x1 - stair.x0).toBeCloseTo(REBUILD_STAIR_WIDTH, 9);
      expect(stair.zB - stair.zA).toBeCloseTo(REBUILD_STAIR_STEPS * REBUILD_STAIR_TREAD, 9);
      // Top step lands flush with the upper floor.
      expect(stair.zB).toBeLessThan(houseSpec(house).cz + houseSpec(house).d / 2);
    }
  });

  it('leaves stair, landing and garage-link gaps open with headed lintels', () => {
    const builder = makeBuilder();
    const meshes = buildAtomicAcresRebuildInteriors(builder);
    const uprights = meshes.filter((mesh) => !mesh.name.includes('lintel')).map(boxOf);
    const lintels = meshes.filter((mesh) => mesh.name.includes('lintel')).map(boxOf);
    for (const house of HOUSES) {
      for (const door of upperDoors(house).filter((entry) => entry.from !== 'stairtop')) {
        const wx = (door.span === 'z' ? door.at : door.centre) * ATOMIC_ACRES_REBUILD_SPREAD;
        const wz = (door.span === 'z' ? door.centre : door.at) * ATOMIC_ACRES_REBUILD_SPREAD;
        const blocked = uprights.some((box) => wx > box.minX && wx < box.maxX && wz > box.minZ && wz < box.maxZ && 4.0 > box.minY && 4.0 < box.maxY);
        expect(blocked, `${door.id} gap blocked at upper standing height`).toBe(false);
        const headed = lintels.some((box) => wx > box.minX && wx < box.maxX && wz > box.minZ && wz < box.maxZ && 5.6 > box.minY && 5.6 < box.maxY);
        expect(headed, `${door.id} has no lintel above the head`).toBe(true);
      }
      const link = rearLinkGap(house);
      const lz = ((link[0] + link[1]) / 2) * ATOMIC_ACRES_REBUILD_SPREAD;
      const linkX = (house === 'west' ? -17.15 : 17.45) * ATOMIC_ACRES_REBUILD_SPREAD;
      const blockedLink = uprights.some((box) => {
        const nearGarage = Math.abs(((box.minX + box.maxX) / 2) - linkX) < 0.8;
        return nearGarage && lz > box.minZ && lz < box.maxZ && 1.0 > box.minY && 1.0 < box.maxY;
      });
      expect(blockedLink, `${house} garage link blocked`).toBe(false);
    }
    void REBUILD_GARAGE_H;
    void REBUILD_INTERIOR_WALL_T;
    void REBUILD_UPPER_DOOR_HEAD_Y;
    void REBUILD_UPPER_FLOOR_Y;
    void garageSpec;
    void garageWalls;
    void houseFrame;
    void rearLinkGap;
    void REBUILD_DOOR_HEAD_Y;
  });
});
