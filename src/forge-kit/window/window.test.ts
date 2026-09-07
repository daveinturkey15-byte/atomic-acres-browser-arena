/**
 * forge-kit/window/window.test.ts — HF-536 NIGHT-MUSE-WINDOWS proof.
 *
 * Mechanical proof for the window dressing kit: tri budgets, relief (>= 5 mm
 * between every pair of own parts), no pane intersection, interior dressing
 * inside the house volume, authority unchanged (solid/collider counts
 * identical), and north/south symmetry through pair().
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from '../../nuketown2-arena';
import {
  WINDOW_GROUND_TRIANGLES,
  WINDOW_HOUSE_TRIANGLES,
  WINDOW_OUTER_TRIANGLES,
  WINDOW_UPPER_TRIANGLES,
  windowDressing,
} from './index';
import type { WindowPart } from './index';

const TRIS = 12;
const HOUSE_X0 = -6.75;
const HOUSE_X1 = 4.25;
const HOUSE_FRONT_Z = -10;
const HOUSE_BACK_Z = -23;
const WALL_T = 0.3;

type Aabb = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

const aabbOfPart = (p: WindowPart): Aabb => ({
  minX: p.offset[0]! - p.size[0]! / 2,
  maxX: p.offset[0]! + p.size[0]! / 2,
  minY: p.offset[1]! - p.size[1]! / 2,
  maxY: p.offset[1]! + p.size[1]! / 2,
  minZ: p.offset[2]! - p.size[2]! / 2,
  maxZ: p.offset[2]! + p.size[2]! / 2,
});

const reliefOf = (a: Aabb, b: Aabb): number => {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
  if (dx <= 0 && dy <= 0 && dz <= 0) return -1;
  return Math.max(dx, dy, dz);
};

const find = (parts: readonly WindowPart[], suffix: string): WindowPart =>
  parts.find((p) => p.suffix === suffix)!;

describe('window dressing prefab', () => {
  it('costs 96 tris outer, 120 ground dressed, 180 upper dressed, 600 per house', () => {
    const groundWest = windowDressing({ width: 2.0, height: 1.1, depth: WALL_T, facing: 1, dressing: 'curtain' });
    const upperFront = windowDressing({ width: 3.2, height: 2.0, depth: WALL_T, facing: 1, dressing: 'blind' });
    const upperBack = windowDressing({ width: 2.5, height: 2.0, depth: WALL_T, facing: -1, dressing: 'blind' });
    expect(groundWest.length).toBe(10);
    expect(upperFront.length).toBe(15);
    expect(upperBack.length).toBe(15);
    expect(groundWest.length * TRIS).toBe(WINDOW_GROUND_TRIANGLES);
    expect(upperFront.length * TRIS).toBe(WINDOW_UPPER_TRIANGLES);
    expect(WINDOW_OUTER_TRIANGLES).toBe(96);
    expect(WINDOW_GROUND_TRIANGLES).toBe(120);
    expect(WINDOW_UPPER_TRIANGLES).toBe(180);
    expect(WINDOW_HOUSE_TRIANGLES).toBe(600);
    expect(WINDOW_OUTER_TRIANGLES).toBeLessThanOrEqual(120);
    expect(WINDOW_HOUSE_TRIANGLES).toBeLessThanOrEqual(1200);
    // Existing roles only.
    for (const p of [...groundWest, ...upperFront]) {
      expect(p.role === 'trim' || p.role === 'interior').toBe(true);
      expect(p.cast).toBe(false);
    }
    expect(new Set(groundWest.map((p) => p.suffix)).size).toBe(groundWest.length);
    expect(new Set(upperFront.map((p) => p.suffix)).size).toBe(upperFront.length);
  });

  it('holds >= 5 mm relief between every pair of own parts (ground + upper)', () => {
    for (const opts of [
      { width: 2.0, height: 1.1, depth: WALL_T, facing: 1 as const, dressing: 'curtain' as const },
      { width: 3.2, height: 2.0, depth: WALL_T, facing: 1 as const, dressing: 'blind' as const },
      { width: 2.5, height: 2.0, depth: WALL_T, facing: -1 as const, dressing: 'blind' as const },
    ]) {
      const parts = windowDressing(opts);
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          const relief = reliefOf(aabbOfPart(parts[i]!), aabbOfPart(parts[j]!));
          expect(relief, `${opts.width}x${opts.height} ${parts[i]!.suffix} vs ${parts[j]!.suffix}`).toBeGreaterThanOrEqual(0.005 - 1e-9);
        }
      }
    }
  });

  it('per-window relief table: frame vs siding 0.045, mullion vs pane 0.015/0.040, drip vs sill 0.045', () => {
    const parts = windowDressing({ width: 2.0, height: 1.1, depth: WALL_T, facing: 1, dressing: 'curtain' });
    const sidingOuter = WALL_T / 2 + 0.05;
    const frameLeft = find(parts, 'frame left');
    const frameBack = frameLeft.offset[2]! - frameLeft.size[2]! / 2;
    expect(frameBack - sidingOuter).toBeGreaterThanOrEqual(0.005 - 1e-9);
    expect(frameBack - sidingOuter).toBeCloseTo(0.045, 6);
    const paneOuter = 0.03;
    const mullV = find(parts, 'mullion vertical');
    const mullH = find(parts, 'mullion horizontal');
    expect(mullV.offset[2]! - mullV.size[2]! / 2 - paneOuter).toBeCloseTo(0.015, 6);
    expect(mullH.offset[2]! - mullH.size[2]! / 2 - paneOuter).toBeCloseTo(0.04, 6);
    const sill = find(parts, 'sill');
    const drip = find(parts, 'drip');
    const sillFront = sill.offset[2]! + sill.size[2]! / 2;
    const dripFront = drip.offset[2]! + drip.size[2]! / 2;
    // 0.045, not the brief's 0.005: 0.005 lands the drip back coplanar with
    // the verge hedge front (oriented finding, 0.044 m2 x2). See prefabs.ts.
    expect(dripFront - sillFront).toBeCloseTo(0.045, 6);
    expect(sill.offset[1]! - sill.size[1]! / 2 - (drip.offset[1]! + drip.size[1]! / 2)).toBeCloseTo(0.01, 6);
    // Frame corners: vertical top 5 mm below top-bar bottom (and symmetric below).
    const frameTop = find(parts, 'frame top');
    const frameBottom = find(parts, 'frame bottom');
    const vTop = frameLeft.offset[1]! + frameLeft.size[1]! / 2;
    const tBottom = frameTop.offset[1]! - frameTop.size[1]! / 2;
    expect(vTop).toBeLessThan(tBottom);
    expect(tBottom - vTop).toBeCloseTo(0.005, 6);
    const vBottom = frameLeft.offset[1]! - frameLeft.size[1]! / 2;
    const bTop = frameBottom.offset[1]! + frameBottom.size[1]! / 2;
    expect(bTop).toBeLessThan(vBottom);
    expect(vBottom - bTop).toBeCloseTo(0.005, 6);
    // Mullion cross: vertical front 5 mm behind horizontal back.
    const vFront = mullV.offset[2]! + mullV.size[2]! / 2;
    const hBack = mullH.offset[2]! - mullH.size[2]! / 2;
    expect(hBack - vFront).toBeCloseTo(0.005, 6);
  });
});

describe('window dressing in the composed arena', () => {
  const build = (): ReturnType<typeof buildNuketown2> => buildNuketown2(new THREE.Scene());

  it('places 100 dressing boxes (50 per house) with zero pane intersections', () => {
    const arena = build();
    arena.root.updateMatrixWorld(true);
    const panes: THREE.Mesh[] = [];
    const dressing: THREE.Mesh[] = [];
    arena.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (/window.*glass/i.test(o.name)) panes.push(o);
      if (/window dressing/i.test(o.name)) dressing.push(o);
    });
    // 8 real glass panes (4 authored bodies x north/south), enumerated live.
    expect(panes.map((p) => p.name).sort()).toEqual([
      'nuketown2 north house front window glass 0',
      'nuketown2 north house front window glass 1',
      'nuketown2 north house upper back window glass',
      'nuketown2 north house upper front window glass',
      'nuketown2 south house front window glass 0',
      'nuketown2 south house front window glass 1',
      'nuketown2 south house upper back window glass',
      'nuketown2 south house upper front window glass',
    ]);
    // 4 authored windows x (10 + 10 + 15 + 15) boxes x 2 houses.
    expect(dressing.length).toBe(100);
    const paneBoxes = panes.map((p) => new THREE.Box3().setFromObject(p));
    for (const mesh of dressing) {
      const box = new THREE.Box3().setFromObject(mesh);
      for (const [i, pane] of paneBoxes.entries()) {
        expect(box.intersectsBox(pane), `${mesh.name} intersects ${panes[i]!.name}`).toBe(false);
      }
    }
  });

  it('keeps curtains/blinds inside the house volume behind the glass', () => {
    const arena = build();
    arena.root.updateMatrixWorld(true);
    const interior: THREE.Mesh[] = [];
    arena.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (/window dressing.*(curtain|blind)/i.test(o.name)) interior.push(o);
    });
    // 2 curtains x 2 ground windows + 7 slats x 2 upper windows, x 2 houses.
    expect(interior.length).toBe((2 * 2 + 7 * 2) * 2);
    for (const mesh of interior) {
      const box = new THREE.Box3().setFromObject(mesh);
      const south = mesh.name.includes(' south ');
      // World frame is authored mirrored on x (handedness -1): north world x
      // is authored -x, so north spans [-4.25, 6.75], south [-6.75, 4.25].
      const minX = south ? HOUSE_X0 : -HOUSE_X1;
      const maxX = south ? HOUSE_X1 : -HOUSE_X0;
      const minZ = south ? -HOUSE_BACK_Z : HOUSE_BACK_Z;
      const maxZ = south ? -HOUSE_FRONT_Z : HOUSE_FRONT_Z;
      const loZ = Math.min(minZ, maxZ);
      const hiZ = Math.max(minZ, maxZ);
      expect(box.min.x, `${mesh.name} minX`).toBeGreaterThanOrEqual(minX - 1e-6);
      expect(box.max.x, `${mesh.name} maxX`).toBeLessThanOrEqual(maxX + 1e-6);
      expect(box.min.z, `${mesh.name} minZ`).toBeGreaterThanOrEqual(loZ - 1e-6);
      expect(box.max.z, `${mesh.name} maxZ`).toBeLessThanOrEqual(hiZ + 1e-6);
      expect(box.min.y, `${mesh.name} minY`).toBeGreaterThanOrEqual(-1e-6);
      expect(box.max.y, `${mesh.name} maxY`).toBeLessThanOrEqual(6.5 + 1e-6);
    }
    // Ground curtains leave 60 % of the opening clear (inner edges ±0.60).
    const ground = windowDressing({ width: 2.0, height: 1.1, depth: WALL_T, facing: 1, dressing: 'curtain' });
    const left = find(ground, 'curtain left');
    const right = find(ground, 'curtain right');
    const clear = (right.offset[0]! - right.size[0]! / 2) - (left.offset[0]! + left.size[0]! / 2);
    expect(clear / 2.0).toBeCloseTo(0.6, 6);
  });

  it('adds presentation only: solid/collider/shot counts identical, houses symmetric', () => {
    const arena = build();
    expect(arena.breakableWindows).toHaveLength(8);
    expect(arena.colliders).toHaveLength(371);
    expect(arena.physicsColliders).toHaveLength(375);
    expect(arena.raycastMeshes).toHaveLength(387);
    expect(arena.shotSurfaces).toHaveLength(387);
    const north: string[] = [];
    const south: string[] = [];
    const raycast = new Set(arena.raycastMeshes.map((m) => (m as THREE.Mesh).name));
    const shots = new Set(arena.shotSurfaces.map((s) => s.name));
    arena.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!/window dressing/i.test(o.name)) return;
      expect(o.userData.presentationOnly, `${o.name} presentationOnly`).toBe(true);
      expect(o.userData.presentationBatchCandidate, `${o.name} batch candidate`).toBe(true);
      expect(o.userData.ballisticSurfaceId, `${o.name} no ballistic id`).toBeUndefined();
      expect(raycast.has(o.name), `${o.name} not raycast`).toBe(false);
      expect([...shots].some((n) => n.endsWith(`:${o.name}`) || n === o.name), `${o.name} not shot`).toBe(false);
      if (o.name.includes(' north ')) north.push(o.name);
      if (o.name.includes(' south ')) south.push(o.name);
    });
    expect(north.length).toBe(50);
    expect(south.length).toBe(50);
    const strip = (n: string): string => n.replace(' north ', ' ').replace(' south ', ' ');
    expect(north.map(strip).sort()).toEqual(south.map(strip).sort());
  });
});
