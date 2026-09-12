/**
 * forge-kit/hardware/hardware.test.ts — HF-536 (NIGHT-MUSE-HARDWARE) proof gates.
 *
 * Mechanical test proof:
 * 1. Triangles <= 140 per prefab and <= 1,600 total per house side.
 * 2. Every part emitted through pair() into both halves as 12-triangle boxes.
 * 3. Roles exist and every mesh borrows an existing arena material instance.
 * 4. Every part's AABB within 0.06 m of its host surface, relief in
 *    [0.01, 0.05] m from its direct host (arena plane or own-part face).
 * 5. No two placed parts share a face plane (<= 5 mm with overlapping
 *    footprints), on either half.
 * 6. hardwarePlacements() and every prefab are deterministic.
 * 7. Zero movement colliders added (per-part non-match: the before/after
 *    count is identical by construction).
 * 8. >= 1.5 m horizontal clearance from every spawn pad (per placement).
 * 9. >= 1.5 m from every doorway run, except the two on-door placements,
 *    which instead prove they stay out of the opening's walkable volume.
 * 10. downpipe() isolated proof (prefab only: tris, determinism, foot height).
 * 11. presentationOnly on every mesh, solid false, shots false, with propId.
 */

import { describe, expect, it } from 'vitest';
import type { ArenaMap } from '../../map';
import * as THREE from 'three';
import {
  buildNuketown2,
  NUKETOWN2_DOORWAYS,
  NUKETOWN2_SPAWN_LAYOUT,
} from '../../nuketown2-arena';
import { nuketown2HandedX } from '../../nuketown2-layout';
import {
  DOORBELL_AND_LIGHT_TRIANGLES,
  DOOR_HARDWARE_TRIANGLES,
  DOWNPIPE_TRIANGLES,
  FENCE_RUN_HARDWARE_TRIANGLES,
  GARAGE_DOOR_HARDWARE_TRIANGLES,
  GATE_HARDWARE_TRIANGLES,
  HARDWARE_BOX_TRIANGLES,
  HARDWARE_ROLES,
  HOUSE_NUMBER_PLAQUE_TRIANGLES,
  WALL_VENT_AND_METER_BOX_TRIANGLES,
  doorHardware,
  doorbellAndLight,
  downpipe,
  fenceRunHardware,
  garageDoorHardware,
  gateHardware,
  hardwarePlacements,
  houseNumberPlaque,
  wallVentAndMeterBox,
} from './prefabs';

const PREFAB_FACTORIES = [
  { name: 'houseNumberPlaque', fn: houseNumberPlaque, expectedTris: HOUSE_NUMBER_PLAQUE_TRIANGLES },
  { name: 'doorbellAndLight', fn: doorbellAndLight, expectedTris: DOORBELL_AND_LIGHT_TRIANGLES },
  { name: 'doorHardware', fn: doorHardware, expectedTris: DOOR_HARDWARE_TRIANGLES },
  { name: 'garageDoorHardware', fn: garageDoorHardware, expectedTris: GARAGE_DOOR_HARDWARE_TRIANGLES },
  { name: 'gateHardware', fn: gateHardware, expectedTris: GATE_HARDWARE_TRIANGLES },
  { name: 'downpipe', fn: downpipe, expectedTris: DOWNPIPE_TRIANGLES },
  { name: 'wallVentAndMeterBox', fn: wallVentAndMeterBox, expectedTris: WALL_VENT_AND_METER_BOX_TRIANGLES },
] as const;

// fenceRunHardware is parametric in run length: prove it at every used length.
const FENCE_RUN_LENGTHS = [5.5, 14, 10.5] as const;

function buildOnce(): ArenaMap {
  return buildNuketown2(new THREE.Scene());
}

interface Box {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}

function meshBox(mesh: THREE.Mesh): Box {
  mesh.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(mesh);
  return {
    minX: bbox.min.x, maxX: bbox.max.x,
    minY: bbox.min.y, maxY: bbox.max.y,
    minZ: bbox.min.z, maxZ: bbox.max.z,
  };
}

function distancePointToAABB2D(px: number, pz: number, b: Box): number {
  const dx = Math.max(0, b.minX - px, px - b.maxX);
  const dz = Math.max(0, b.minZ - pz, pz - b.maxZ);
  return Math.hypot(dx, dz);
}

function distanceAABBToAABB2D(a: Box, b: Box): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dz);
}

type Side = 'north' | 'south';
type Axis = 'x' | 'y' | 'z';

interface HostSpec {
  readonly axis: Axis;
  /** Host plane in AUTHORED coordinates (pair() mirrors x/z into the world). */
  readonly authored: number;
  readonly nominal: number;
}

/** Direct host per placed part: arena plane or own-part face, authored coords. */
const HOSTS: Readonly<Record<string, Readonly<Record<string, HostSpec>>>> = {
  'hardware house number plaque': {
    'plate': { axis: 'z', authored: -9.95, nominal: 0.016 },
    'digit 0': { axis: 'z', authored: -9.914, nominal: 0.010 },
    'digit 1': { axis: 'z', authored: -9.914, nominal: 0.010 },
  },
  'hardware doorbell and light': {
    'bell plate': { axis: 'z', authored: -9.95, nominal: 0.016 },
    'bell button': { axis: 'z', authored: -9.922, nominal: 0.016 },
    'lantern bracket': { axis: 'z', authored: -9.95, nominal: 0.010 },
    'lantern body': { axis: 'z', authored: -9.92, nominal: 0.012 },
  },
  'hardware front door hardware': {
    'handle rose': { axis: 'z', authored: -9.96, nominal: 0.016 },
    'handle lever': { axis: 'z', authored: -9.934, nominal: 0.012 },
    'letterbox': { axis: 'z', authored: -9.95, nominal: 0.020 },
    'hinge upper': { axis: 'z', authored: -9.96, nominal: 0.018 },
    'hinge lower': { axis: 'z', authored: -9.96, nominal: 0.018 },
    'kick plate': { axis: 'z', authored: -9.95, nominal: 0.020 },
  },
  'hardware garage door hardware': {
    'batten 0': { axis: 'z', authored: -15.95, nominal: 0.020 },
    'batten 1': { axis: 'z', authored: -15.95, nominal: 0.020 },
    'batten 2': { axis: 'z', authored: -15.95, nominal: 0.020 },
    'batten 3': { axis: 'z', authored: -15.95, nominal: 0.020 },
    'rail left': { axis: 'z', authored: -15.95, nominal: 0.026 },
    'rail right': { axis: 'z', authored: -15.95, nominal: 0.026 },
    'handle plate': { axis: 'z', authored: -15.95, nominal: 0.038 },
    'handle grip': { axis: 'z', authored: -15.90, nominal: 0.012 },
  },
  'hardware fence run 0': fenceRunHosts(),
  'hardware fence run 1': fenceRunHosts(),
  'hardware fence run 2': fenceRunHosts(),
  'hardware fence gate 0': gateHosts(-11.0),
  'hardware fence gate 1': gateHosts(6.0),
  'hardware vent and meter box': {
    'vent plate': { axis: 'x', authored: 4.30, nominal: 0.014 },
    'vent slat 0': { axis: 'x', authored: 4.344, nominal: 0.012 },
    'vent slat 1': { axis: 'x', authored: 4.344, nominal: 0.012 },
    'vent slat 2': { axis: 'x', authored: 4.344, nominal: 0.012 },
    'vent slat 3': { axis: 'x', authored: 4.344, nominal: 0.012 },
    'vent slat 4': { axis: 'x', authored: 4.344, nominal: 0.012 },
    'meter box': { axis: 'x', authored: 4.30, nominal: 0.016 },
    'meter door strip': { axis: 'x', authored: 4.436, nominal: 0.012 },
  },
};

function fenceRunHosts(): Readonly<Record<string, HostSpec>> {
  return {
    'mid rail': { axis: 'z', authored: -35.75, nominal: 0.020 },
    'cap west': { axis: 'y', authored: 1.90, nominal: 0.010 },
    'cap east': { axis: 'y', authored: 1.90, nominal: 0.010 },
  };
}

function gateHosts(centreX: number): Readonly<Record<string, HostSpec>> {
  return {
    'hinge strap lower': { axis: 'x', authored: centreX - 1.51, nominal: 0.016 },
    'hinge strap upper': { axis: 'x', authored: centreX - 1.51, nominal: 0.016 },
    'latch box': { axis: 'x', authored: centreX + 1.51, nominal: 0.016 },
  };
}

/** Run-end x spans (authored) each run placement's posts engage. */
const FENCE_RUN_ENDS: Readonly<Record<string, readonly [number, number]>> = {
  'hardware fence run 0': [-18, -12.5],
  'hardware fence run 1': [-9.5, 4.5],
  'hardware fence run 2': [7.5, 18],
};

function worldPlane(spec: HostSpec, side: Side): number {
  if (spec.axis === 'y') return spec.authored;
  if (spec.axis === 'z') return side === 'north' ? spec.authored : -spec.authored;
  return side === 'north' ? -spec.authored : spec.authored;
}

function nearRelief(box: Box, axis: Axis, plane: number): number {
  const lo = axis === 'x' ? box.minX : axis === 'y' ? box.minY : box.minZ;
  const hi = axis === 'x' ? box.maxX : axis === 'y' ? box.maxY : box.maxZ;
  return Math.min(Math.abs(lo - plane), Math.abs(hi - plane));
}

describe('forge-kit hardware prefabs (HF-536 night-muse-hardware)', () => {
  it('enforces triangle count <= 140 per prefab and <= 1,600 total per house', () => {
    for (const prefab of PREFAB_FACTORIES) {
      const parts = prefab.fn();
      const tris = parts.length * HARDWARE_BOX_TRIANGLES;
      expect(tris, `${prefab.name} triangle constant`).toBe(prefab.expectedTris);
      expect(tris, `${prefab.name} <= 140 triangles`).toBeLessThanOrEqual(140);
    }
    for (const length of FENCE_RUN_LENGTHS) {
      const tris = fenceRunHardware(length).length * HARDWARE_BOX_TRIANGLES;
      expect(tris, `fenceRunHardware(${length}) <= 140 triangles`).toBeLessThanOrEqual(140);
      expect(tris, `fenceRunHardware(${length}) triangle constant`).toBe(FENCE_RUN_HARDWARE_TRIANGLES);
    }

    const placements = hardwarePlacements();
    let totalBoxes = 0;
    for (const p of placements) totalBoxes += p.parts.length;
    const totalTris = totalBoxes * HARDWARE_BOX_TRIANGLES;
    expect(totalTris, 'total triangles per house <= 1,600').toBeLessThanOrEqual(1600);
    expect(totalTris, 'measured triangles per house').toBe(600);
  });

  it('emits all hardware prefabs through pair() into both halves as 12-triangle boxes', () => {
    const map = buildOnce();
    const placements = hardwarePlacements();

    for (const placement of placements) {
      for (const side of ['north', 'south'] as const) {
        for (const part of placement.parts) {
          const name = `nuketown2 ${side} ${placement.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          expect(mesh, `mesh ${name} exists in scene`).toBeDefined();
          expect(mesh.geometry, `${name} has BoxGeometry`).toBeInstanceOf(THREE.BoxGeometry);
          const triCount = (mesh.geometry.index?.count ?? 0) / 3;
          expect(triCount, `${name} has exactly 12 triangles`).toBe(12);
          expect(part.cast, `${placement.propId} ${part.suffix} casts no shadow`).toBe(false);
          expect(mesh.castShadow, `${name} castShadow false`).toBe(false);
        }
      }
    }
  });

  it('uses existing material roles only and resolves onto existing arena materials', () => {
    const allowedRoles = new Set<string>(HARDWARE_ROLES);
    const placements = hardwarePlacements();

    for (const p of placements) {
      for (const part of p.parts) {
        expect(allowedRoles.has(part.role), `${p.propId} ${part.suffix} role '${part.role}' is defined`).toBe(true);
        for (const val of [...part.offset, ...part.size]) {
          expect(Number.isFinite(val), `${p.propId} ${part.suffix} has finite numbers`).toBe(true);
        }
        expect(part.size[0] > 0 && part.size[1] > 0 && part.size[2] > 0, `${p.propId} ${part.suffix} positive`).toBe(true);
      }
    }

    const map = buildOnce();
    const nonKitMaterials = new Set<string>();
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.material || Array.isArray(node.material)) return;
      if (!node.name.includes(' hardware ')) {
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

  it('lands every part on its host surface with relief in [0.01, 0.05] m', () => {
    const map = buildOnce();
    const placements = hardwarePlacements();

    for (const p of placements) {
      const hosts = HOSTS[p.propId];
      expect(hosts, `host table covers ${p.propId}`).toBeDefined();
      for (const side of ['north', 'south'] as const) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const mesh = map.root.getObjectByName(name) as THREE.Mesh;
          const box = meshBox(mesh);

          if (part.suffix.startsWith('post ')) {
            // Posts stand on the lawn engaged in the run ends (same timber as
            // the run, so the contact cannot be a finding).
            expect(box.minY, `${name} stands on the lawn`).toBeGreaterThanOrEqual(-0.001);
            expect(box.minY, `${name} stands on the lawn`).toBeLessThanOrEqual(0.011);
            const ends = FENCE_RUN_ENDS[p.propId]!;
            const worldEnds = side === 'north'
              ? [-ends[1], -ends[0]] as const
              : [ends[0], ends[1]] as const;
            const endGap = Math.min(
              Math.abs(box.minX - worldEnds[0]), Math.abs(box.maxX - worldEnds[0]),
              Math.abs(box.minX - worldEnds[1]), Math.abs(box.maxX - worldEnds[1]),
            );
            expect(endGap, `${name} engages a run end`).toBeLessThanOrEqual(0.10);
            const fz = side === 'north' ? -35.875 : 35.875;
            expect(Math.abs((box.minZ + box.maxZ) / 2 - fz), `${name} centred on the fence line`).toBeLessThanOrEqual(0.01);
            continue;
          }

          const host = hosts![part.suffix];
          expect(host, `host covers ${p.propId} ${part.suffix}`).toBeDefined();
          const plane = worldPlane(host!, side);
          const relief = nearRelief(box, host!.axis, plane);
          expect(relief, `${name} within 0.06 m of its host`).toBeLessThanOrEqual(0.06);
          expect(relief, `${name} relief >= 0.01 m (got ${relief.toFixed(4)} m)`).toBeGreaterThanOrEqual(0.01 - 1e-4);
          expect(relief, `${name} relief <= 0.05 m (got ${relief.toFixed(4)} m)`).toBeLessThanOrEqual(0.05 + 1e-4);
          expect(Math.abs(relief - host!.nominal), `${name} relief matches the authored ${host!.nominal} m`).toBeLessThanOrEqual(0.004);
        }
      }
    }
  });

  it('shares no face plane between any two placed parts (5 mm, overlap-gated)', () => {
    const map = buildOnce();
    const placements = hardwarePlacements();

    for (const side of ['north', 'south'] as const) {
      const boxes: Array<{ name: string; box: Box }> = [];
      for (const p of placements) {
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          boxes.push({ name, box: meshBox(map.root.getObjectByName(name) as THREE.Mesh) });
        }
      }
      const faces = (b: Box, axis: Axis): [number, number] =>
        axis === 'x' ? [b.minX, b.maxX] : axis === 'y' ? [b.minY, b.maxY] : [b.minZ, b.maxZ];
      const span = (b: Box, axis: Axis): [number, number] => faces(b, axis);
      const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean =>
        Math.min(a1, b1) - Math.max(a0, b0) > 1e-6;

      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          for (const axis of ['x', 'y', 'z'] as const) {
            const [a0, a1] = faces(a.box, axis);
            const [b0, b1] = faces(b.box, axis);
            const others: Axis[] = axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
            const [ao0, ao1] = span(a.box, others[0]!);
            const [bo0, bo1] = span(b.box, others[0]!);
            const [ap0, ap1] = span(a.box, others[1]!);
            const [bp0, bp1] = span(b.box, others[1]!);
            if (!overlaps(ao0, ao1, bo0, bo1) || !overlaps(ap0, ap1, bp0, bp1)) continue;
            for (const [fa, fb] of [[a0, b0], [a0, b1], [a1, b0], [a1, b1]] as const) {
              expect(
                Math.abs(fa - fb),
                `${side} shared ${axis}-plane: ${a.name} @${fa.toFixed(4)} vs ${b.name} @${fb.toFixed(4)}`,
              ).toBeGreaterThan(0.005);
            }
          }
        }
      }
    }
  });

  it('is deterministic: hardwarePlacements() and every prefab freeze their output', () => {
    expect(JSON.stringify(hardwarePlacements())).toBe(JSON.stringify(hardwarePlacements()));
    for (const prefab of PREFAB_FACTORIES) {
      expect(JSON.stringify(prefab.fn()), `${prefab.name} deterministic`).toBe(JSON.stringify(prefab.fn()));
    }
    for (const length of FENCE_RUN_LENGTHS) {
      expect(JSON.stringify(fenceRunHardware(length)), `fenceRunHardware(${length}) deterministic`)
        .toBe(JSON.stringify(fenceRunHardware(length)));
    }
  });

  it('maintains >= 1.5 m clearance from every spawn pad', () => {
    const map = buildOnce();
    const placements = hardwarePlacements();

    const allSpawns: Array<{ team: number; x: number; z: number }> = [];
    for (const [teamIndex, spawns] of NUKETOWN2_SPAWN_LAYOUT.entries()) {
      for (const [x, z] of spawns) {
        allSpawns.push({ team: teamIndex, x, z });
      }
    }

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        let composite: Box | null = null;
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const box = meshBox(map.root.getObjectByName(name) as THREE.Mesh);
          composite = composite === null ? box : {
            minX: Math.min(composite.minX, box.minX), maxX: Math.max(composite.maxX, box.maxX),
            minY: Math.min(composite.minY, box.minY), maxY: Math.max(composite.maxY, box.maxY),
            minZ: Math.min(composite.minZ, box.minZ), maxZ: Math.max(composite.maxZ, box.maxZ),
          };
        }
        for (const spawn of allSpawns) {
          const dist = distancePointToAABB2D(spawn.x, spawn.z, composite!);
          expect(
            dist,
            `${side} ${p.propId} clearance from spawn T${spawn.team} (${spawn.x}, ${spawn.z}) >= 1.5 m (got ${dist.toFixed(2)} m)`,
          ).toBeGreaterThanOrEqual(1.5 - 1e-4);
        }
      }
    }
  });

  it('maintains >= 1.5 m clearance from all doorway runs, except on-door hardware', () => {
    const map = buildOnce();
    const onDoor = new Set(['hardware front door hardware', 'hardware garage door hardware']);
    const placements = hardwarePlacements().filter((p) => !onDoor.has(p.propId));

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

    for (const p of placements) {
      for (const side of ['north', 'south'] as const) {
        let composite: Box | null = null;
        for (const part of p.parts) {
          const name = `nuketown2 ${side} ${p.propId} ${part.suffix}`;
          const box = meshBox(map.root.getObjectByName(name) as THREE.Mesh);
          composite = composite === null ? box : {
            minX: Math.min(composite.minX, box.minX), maxX: Math.max(composite.maxX, box.maxX),
            minY: Math.min(composite.minY, box.minY), maxY: Math.max(composite.maxY, box.maxY),
            minZ: Math.min(composite.minZ, box.minZ), maxZ: Math.max(composite.maxZ, box.maxZ),
          };
        }
        for (const dt of doorwayThresholds) {
          const dist = distanceAABBToAABB2D(composite!, { ...composite!, minX: dt.minX, maxX: dt.maxX, minZ: dt.minZ, maxZ: dt.maxZ });
          expect(dist, `${side} ${p.propId} clearance from ${dt.id} >= 1.5 m (got ${dist.toFixed(2)} m)`).toBeGreaterThanOrEqual(1.5 - 1e-4);
        }
      }
    }
  });

  it('keeps on-door hardware out of the door openings walkable volume', () => {
    const map = buildOnce();
    // Front-door leaf furniture sits east of the opening span in both worlds.
    const frontDoor = NUKETOWN2_DOORWAYS.find((door) => door.id === 'house front door')!;
    const frontSpan: readonly [number, number] = [frontDoor.centre - frontDoor.width / 2, frontDoor.centre + frontDoor.width / 2];
    for (const side of ['north', 'south'] as const) {
      const span = side === 'north'
        ? [Math.min(nuketown2HandedX(frontSpan[0]), nuketown2HandedX(frontSpan[1])), Math.max(nuketown2HandedX(frontSpan[0]), nuketown2HandedX(frontSpan[1]))]
        : [-Math.max(nuketown2HandedX(frontSpan[0]), nuketown2HandedX(frontSpan[1])), -Math.min(nuketown2HandedX(frontSpan[0]), nuketown2HandedX(frontSpan[1]))];
      for (const part of doorHardware()) {
        const name = `nuketown2 ${side} hardware front door hardware ${part.suffix}`;
        const box = meshBox(map.root.getObjectByName(name) as THREE.Mesh);
        const xOverlap = Math.min(box.maxX, span[1]!) - Math.max(box.minX, span[0]!);
        expect(box.maxY, `${name} below the 2.4 m head`).toBeLessThanOrEqual(2.4);
        expect(xOverlap, `${name} clear of the opening span`).toBeLessThanOrEqual(0);
      }
      // Garage-leaf furniture rides above the vehicle-door head (2.6 m).
      for (const part of garageDoorHardware()) {
        const name = `nuketown2 ${side} hardware garage door hardware ${part.suffix}`;
        const box = meshBox(map.root.getObjectByName(name) as THREE.Mesh);
        expect(box.minY, `${name} above the walkable volume`).toBeGreaterThan(2.6);
      }
    }
  });

  it('marks every part presentationOnly: true, solid: false, shots: false with propId', () => {
    const map = buildOnce();
    const placements = hardwarePlacements();
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
    const placements = hardwarePlacements();

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

  it('proves the unplaced downpipe() in isolation: tris, determinism, foot height', () => {
    const parts = downpipe();
    expect(parts.length * HARDWARE_BOX_TRIANGLES, 'downpipe triangle constant').toBe(DOWNPIPE_TRIANGLES);
    expect(DOWNPIPE_TRIANGLES, 'downpipe <= 140 triangles').toBeLessThanOrEqual(140);
    expect(JSON.stringify(downpipe()), 'downpipe deterministic').toBe(JSON.stringify(parts));

    // Foot 0.15 m above ground, brackets 0.10 m wide, all backs off the wall.
    const bySuffix = new Map(parts.map((part) => [part.suffix, part]));
    expect(bySuffix.get('shoe')!.offset[1] - bySuffix.get('shoe')!.size[1] / 2, 'shoe sole 0.15 m up').toBeCloseTo(0.15, 6);
    for (const name of ['bracket lower', 'bracket upper'] as const) {
      expect(bySuffix.get(name)!.size[0], `${name} 0.10 m wide`).toBeCloseTo(0.10, 6);
    }
    for (const part of parts) {
      const back = part.offset[2] - part.size[2] / 2;
      expect(back, `${part.suffix} back stands off the wall`).toBeGreaterThanOrEqual(0.01 - 1e-9);
    }
  });
});
