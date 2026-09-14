import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { newworldPrimeAuthority } from './newworld-prime-authority';
import {
  NEWWORLD_PRIME_EAST_YELLOW_D_M,
  NEWWORLD_PRIME_EAST_YELLOW_W_M,
  NEWWORLD_PRIME_WEST_TEAL_D_M,
  NEWWORLD_PRIME_WEST_TEAL_W_M,
} from './newworld-prime-structures';
import {
  NEWWORLD_PRIME_INTERIOR_PORTAL_HALF_W_M,
  newworldPrimeHouseShellSolids,
  newworldPrimeInteriorOpenings,
  newworldPrimeInteriorParts,
  newworldPrimeInteriorReachableFromPorch,
  newworldPrimeInteriorRooms,
  newworldPrimeInteriorWallSolids,
} from './newworld-prime-interiors';

/**
 * INTERIORS PILOT focused gate (owner-authorized 2026-09-14): ground-floor
 * outlines for both houses. This file is the ledger for every new wall, room
 * and opening — exact id pins below fail loudly on any add/remove/rename, so
 * the parity/walkable/spawn/ballistic suites never absorb an interior change
 * silently. Presentation meshes land through the arena assembler (pending the
 * one-line hook); every wall here must already carry full authority.
 */
const WALL_IDS = Object.freeze([
  'newworld-prime-interior-west-teal-cross-0',
  'newworld-prime-interior-west-teal-cross-1',
  'newworld-prime-interior-west-teal-cross-2',
  'newworld-prime-interior-west-teal-cross-3',
  'newworld-prime-interior-west-teal-divider-kitchen-bed',
  'newworld-prime-interior-west-teal-divider-bed-bath',
  'newworld-prime-interior-east-yellow-cross-0',
  'newworld-prime-interior-east-yellow-cross-1',
  'newworld-prime-interior-east-yellow-cross-2',
  'newworld-prime-interior-east-yellow-cross-3',
  'newworld-prime-interior-east-yellow-divider-bath-bed',
  'newworld-prime-interior-east-yellow-divider-bed-kitchen',
]);

const ROOM_IDS = Object.freeze([
  'west-teal-living',
  'west-teal-kitchen',
  'west-teal-bed',
  'west-teal-bath',
  'east-yellow-living',
  'east-yellow-bath',
  'east-yellow-bed',
  'east-yellow-kitchen',
]);

const OPENING_IDS = Object.freeze([
  'west-teal-front-door',
  'west-teal-opening-living-kitchen',
  'west-teal-opening-living-bed',
  'west-teal-opening-living-bath',
  'east-yellow-front-door',
  'east-yellow-opening-living-bath',
  'east-yellow-opening-living-bed',
  'east-yellow-opening-living-kitchen',
]);

describe('newworld-prime interiors pilot: room/doorway data contract', () => {
  it('authors living/kitchen/bed/bath for both houses, nothing else', () => {
    const rooms = newworldPrimeInteriorRooms();
    expect(rooms.map((room) => room.id)).toEqual([...ROOM_IDS]);
    for (const house of ['west-teal', 'east-yellow'] as const) {
      const kinds = rooms.filter((room) => room.house === house).map((room) => room.kind).sort();
      expect(kinds, `${house} room program`).toEqual(['bath', 'bed', 'kitchen', 'living']);
    }
  });
  it('reaches every room from the porch through the carved portal (ingress included)', () => {
    const expected: Record<string, readonly string[]> = {
      'west-teal': ['porch', 'west-teal-living', 'west-teal-kitchen', 'west-teal-bed', 'west-teal-bath'],
      'east-yellow': ['porch', 'east-yellow-living', 'east-yellow-bath', 'east-yellow-bed', 'east-yellow-kitchen'],
    };
    for (const house of ['west-teal', 'east-yellow'] as const) {
      expect([...newworldPrimeInteriorReachableFromPorch(house)].sort(), `${house} ingress set`).toEqual([...expected[house]].sort());
    }
  });
  it('pins every opening id (front doors included)', () => {
    expect(newworldPrimeInteriorOpenings().map((opening) => opening.id)).toEqual([...OPENING_IDS]);
  });


  it('keeps rooms and walls inside their house footprint', () => {
    const footprints = {
      'west-teal': { w: NEWWORLD_PRIME_WEST_TEAL_W_M, d: NEWWORLD_PRIME_WEST_TEAL_D_M },
      'east-yellow': { w: NEWWORLD_PRIME_EAST_YELLOW_W_M, d: NEWWORLD_PRIME_EAST_YELLOW_D_M },
    } as const;
    for (const room of newworldPrimeInteriorRooms()) {
      const { w, d } = footprints[room.house];
      const [minX, minZ, maxX, maxZ] = room.rect;
      expect(minX, `${room.id} minX`).toBeGreaterThanOrEqual(-w / 2);
      expect(maxX, `${room.id} maxX`).toBeLessThanOrEqual(w / 2);
      expect(minZ, `${room.id} minZ`).toBeGreaterThanOrEqual(-d / 2);
      expect(maxZ, `${room.id} maxZ`).toBeLessThanOrEqual(d / 2);
      expect(maxX - minX, `${room.id} width`).toBeGreaterThanOrEqual(0.95);
      expect(maxZ - minZ, `${room.id} depth`).toBeGreaterThanOrEqual(0.95);
    }
    for (const solid of newworldPrimeInteriorWallSolids()) {
      const { w, d } = footprints[solid.house];
      const originX = solid.house === 'west-teal' ? -13.5 : 13.5;
      const originZ = solid.house === 'west-teal' ? 1.5 : -1.5;
      expect(solid.x - solid.sizeX / 2, `${solid.id} minX`).toBeGreaterThanOrEqual(originX - w / 2);
      expect(solid.x + solid.sizeX / 2, `${solid.id} maxX`).toBeLessThanOrEqual(originX + w / 2);
      expect(solid.z - solid.sizeZ / 2, `${solid.id} minZ`).toBeGreaterThanOrEqual(originZ - d / 2);
      expect(solid.z + solid.sizeZ / 2, `${solid.id} maxZ`).toBeLessThanOrEqual(originZ + d / 2);
    }
  });

  it('is deterministic: repeated builds are deep-equal and frozen', () => {
    expect(newworldPrimeInteriorWallSolids()).toEqual(newworldPrimeInteriorWallSolids());
    expect(newworldPrimeInteriorParts()).toEqual(newworldPrimeInteriorParts());
    expect(Object.isFrozen(newworldPrimeInteriorWallSolids())).toBe(true);
    expect(Object.isFrozen(newworldPrimeInteriorParts())).toBe(true);
  });
});

describe('newworld-prime interiors pilot: presentation/authority parity', () => {
  it('pins every wall id (one authority solid per partition, no extras)', () => {
    expect(newworldPrimeInteriorWallSolids().map((solid) => solid.id)).toEqual([...WALL_IDS]);
  });

  it('matches every wall solid 1:1 with a presentation part of identical bounds', () => {
    const parts = newworldPrimeInteriorParts();
    const solids = newworldPrimeInteriorWallSolids();
    // 12 partitions + 2 floor slabs (presentation-only underfoot, no authority).
    expect(parts).toHaveLength(14);
    expect(parts.filter((part) => part.role === 'interior-floor-slab')).toHaveLength(2);
    for (const solid of solids) {
      const coreId = solid.id.replace('newworld-prime-interior-', '');
      const part = parts.find((candidate) => candidate.id === coreId);
      expect(part, `${solid.id} has a presentation part`).toBeDefined();
      expect(part!.role).toBe('interior-partition');
      const [w, h, d] = part!.sizeMetres;
      const [ox, oy, oz] = part!.offsetMetres;
      expect(ox, `${solid.id} x`).toBe(solid.x);
      expect(oz, `${solid.id} z`).toBe(solid.z);
      expect(w, `${solid.id} sizeX`).toBe(solid.sizeX);
      expect(d, `${solid.id} sizeZ`).toBe(solid.sizeZ);
      // Centre/height form: both emitters construct BoxGeometry from these, so
      // this is the bit-exact parity the audit measures (not edge arithmetic).
      expect(oy, `${solid.id} cy`).toBe((solid.minY + solid.maxY) / 2);
      expect(h, `${solid.id} height`).toBe(solid.maxY - solid.minY);
    }
  });

  it('carries every wall in movement authority on both profiles', () => {
    const authority = newworldPrimeAuthority(new THREE.Scene());
    for (const solid of newworldPrimeInteriorWallSolids()) {
      for (const [profile, boxes] of [['colliders', authority.colliders], ['physicsColliders', authority.physicsColliders]] as const) {
        const match = boxes.find((box) => (
          box.minX === solid.x - solid.sizeX / 2
          && box.maxX === solid.x + solid.sizeX / 2
          && box.minZ === solid.z - solid.sizeZ / 2
          && box.maxZ === solid.z + solid.sizeZ / 2
          && box.minY === solid.minY
          && box.maxY === solid.maxY
        ));
        expect(match, `${solid.id} in ${profile}`).toBeDefined();
      }
    }
  });

  it('rates every wall for gunfire with a backed proxy mesh', () => {
    const authority = newworldPrimeAuthority(new THREE.Scene());
    for (const solid of newworldPrimeInteriorWallSolids()) {
      const surface = authority.shotSurfaces.find((entry) => entry.name === solid.id);
      expect(surface, `${solid.id} shot surface`).toBeDefined();
      expect(surface!.material).toBe('interior-wall');
      const proxy = authority.proxyMeshes.find((mesh) => mesh.name === solid.id);
      expect(proxy, `${solid.id} proxy mesh`).toBeDefined();
      expect(proxy!.visible).toBe(false);
      expect(proxy!.userData.ballisticSurfaceId).toBe(surface!.id);
      const cover = authority.physicalCover.find((entry) => entry.id === solid.id);
      expect(cover, `${solid.id} physical cover`).toBeDefined();
      expect(cover!.blocksMovement).toBe(true);
      expect(cover!.blocksShots).toBe(true);
    }
  });

  it('keeps every spawn outside every interior wall', () => {
    const authority = newworldPrimeAuthority(new THREE.Scene());
    const solids = newworldPrimeInteriorWallSolids();
    for (const [team, points] of [[0, authority.spawns[0]], [1, authority.spawns[1]]] as const) {
      for (const point of points) {
        for (const solid of solids) {
          const inside = point.x > solid.x - solid.sizeX / 2
            && point.x < solid.x + solid.sizeX / 2
            && point.z > solid.z - solid.sizeZ / 2
            && point.z < solid.z + solid.sizeZ / 2;
          expect(inside, `team ${team} spawn (${point.x},${point.z}) inside ${solid.id}`).toBe(false);
        }
      }
    }
  });
});

describe('newworld-prime interiors pilot: front-door portal carve', () => {
  const ORIGINS = { 'west-teal': { x: -13.5, z: 1.5 }, 'east-yellow': { x: 13.5, z: -1.5 } } as const;

  it('cuts a 1.0 m portal at local x=0 on each street face (at or above 0.95 m)', () => {
    expect(NEWWORLD_PRIME_INTERIOR_PORTAL_HALF_W_M * 2).toBeGreaterThanOrEqual(0.95);
    for (const house of ['west-teal', 'east-yellow'] as const) {
      const shells = newworldPrimeHouseShellSolids().filter((shell) => shell.house === house);
      const left = shells.find((shell) => shell.id.endsWith('wall-south-left'))!;
      const right = shells.find((shell) => shell.id.endsWith('wall-south-right'))!;
      const gap = right.x - right.sizeX / 2 - (left.x + left.sizeX / 2);
      expect(gap, `${house} portal clear width`).toBeGreaterThanOrEqual(0.95);
      expect((left.x + left.sizeX / 2 + (right.x - right.sizeX / 2)) / 2, `${house} portal centre`).toBeCloseTo(ORIGINS[house].x, 9);
    }
  });

  it('retires the full-footprint house boxes: every remaining house solid is a thin wall', () => {
    for (const shell of newworldPrimeHouseShellSolids().filter((shell) => shell.movement)) {
      expect(Math.min(shell.sizeX, shell.sizeZ), `${shell.id} thin wall`).toBeCloseTo(0.14, 9);
    }
    const authority = newworldPrimeAuthority(new THREE.Scene());
    for (const retired of ['newworld-prime-house-west-teal', 'newworld-prime-house-east-yellow']) {
      expect(authority.shotSurfaces.some((surface) => surface.name === retired), `${retired} surface retired`).toBe(false);
      expect(authority.physicalCover.some((entry) => entry.id === retired), `${retired} cover retired`).toBe(false);
      expect(authority.proxyMeshes.some((mesh) => mesh.name === retired), `${retired} proxy retired`).toBe(false);
    }
  });

  it('leaves the portal walkable: no movement collider crosses the door gap', () => {
    const authority = newworldPrimeAuthority(new THREE.Scene());
    for (const house of ['west-teal', 'east-yellow'] as const) {
      const leaf = newworldPrimeHouseShellSolids().find((shell) => shell.house === house && !shell.movement)!;
      const blocked = [...authority.colliders, ...authority.physicsColliders].some((box) => (
        leaf.x > box.minX && leaf.x < box.maxX
        && leaf.z > box.minZ && leaf.z < box.maxZ
      ));
      expect(blocked, `${house} portal crosses a movement collider`).toBe(false);
    }
  });

  it('rates the door leaf for gunfire without movement or cover (closed-leaf read)', () => {
    const authority = newworldPrimeAuthority(new THREE.Scene());
    for (const shell of newworldPrimeHouseShellSolids().filter((shell) => !shell.movement)) {
      const surface = authority.shotSurfaces.find((entry) => entry.name === shell.id);
      expect(surface, `${shell.id} shot surface`).toBeDefined();
      expect(surface!.material).toBe('interior-wall');
      const proxy = authority.proxyMeshes.find((mesh) => mesh.name === shell.id);
      expect(proxy, `${shell.id} proxy mesh`).toBeDefined();
      expect(proxy!.visible).toBe(false);
      expect(proxy!.userData.ballisticSurfaceId).toBe(surface!.id);
      const inMovement = [...authority.colliders, ...authority.physicsColliders].some((box) => (
        box.minX === shell.x - shell.sizeX / 2 && box.maxX === shell.x + shell.sizeX / 2
        && box.minZ === shell.z - shell.sizeZ / 2 && box.maxZ === shell.z + shell.sizeZ / 2
      ));
      expect(inMovement, `${shell.id} carries no movement`).toBe(false);
      expect(authority.physicalCover.some((entry) => entry.id === shell.id), `${shell.id} carries no cover`).toBe(false);
    }
  });

  it('carries every perimeter wall in movement authority on both profiles', () => {
    const authority = newworldPrimeAuthority(new THREE.Scene());
    for (const shell of newworldPrimeHouseShellSolids().filter((shell) => shell.movement)) {
      for (const boxes of [authority.colliders, authority.physicsColliders]) {
        expect(boxes.some((box) => (
          box.minX === shell.x - shell.sizeX / 2 && box.maxX === shell.x + shell.sizeX / 2
          && box.minZ === shell.z - shell.sizeZ / 2 && box.maxZ === shell.z + shell.sizeZ / 2
          && box.minY === shell.minY && box.maxY === shell.maxY
        )), `${shell.id} in movement authority`).toBe(true);
      }
    }
  });
});
