/**
 * Focused CPU check for the group-B technique lab.
 *
 * Scope, stated so the claim is not read as more than it is: this instantiates each demo on
 * the CPU with the installed Three.js, advances it, inspects geometry/counters/metadata and
 * disposes it. It executes NO renderer and validates NO pixel. Rendered acceptance for every
 * row in this group is OPEN and belongs to root's serialized visual pass.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { manifest } from './index';
import type { Demo } from './types';

const SEED = 20260912;

/** A lab scene must stay small enough that 17 of them can coexist in one page. */
const MAX_DRAWABLE_OBJECTS = 400;
const MAX_TRIANGLES = 400_000;

function countGeometry(root: THREE.Group): { drawables: number; triangles: number; nonFinite: number } {
  let drawables = 0;
  let triangles = 0;
  let nonFinite = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { isMesh?: boolean; count?: number };
    if (!mesh.isMesh || !mesh.geometry) return;
    drawables += 1;
    const position = mesh.geometry.getAttribute('position');
    if (position) {
      const array = position.array as ArrayLike<number>;
      for (let i = 0; i < array.length; i += 1) {
        if (!Number.isFinite(array[i])) nonFinite += 1;
      }
      const index = mesh.geometry.getIndex();
      const perInstance = index ? index.count / 3 : position.count / 3;
      const instances = typeof mesh.count === 'number' ? mesh.count : 1;
      triangles += perInstance * instances;
    }
    const matrixArray = (mesh as unknown as { instanceMatrix?: THREE.BufferAttribute }).instanceMatrix;
    if (matrixArray) {
      const array = matrixArray.array as ArrayLike<number>;
      for (let i = 0; i < array.length; i += 1) {
        if (!Number.isFinite(array[i])) nonFinite += 1;
      }
    }
  });
  return { drawables, triangles, nonFinite };
}

describe('technique-lab group B manifest', () => {
  it('keeps original register IDs, in range, with no duplicates', () => {
    const ids = manifest.map((entry) => entry.sourceId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(18);
      expect(id).toBeLessThanOrEqual(34);
    }
  });

  it('gives every non-blocked entry a factory and every blocked entry a limitation', () => {
    for (const entry of manifest) {
      if (entry.adaptation === 'blocked') {
        expect(entry.createDemo, `blocked entry ${entry.sourceId} must not ship a factory`).toBeUndefined();
        expect(entry.limitation, `blocked entry ${entry.sourceId} must state its limitation`).toBeTruthy();
      } else {
        expect(entry.createDemo, `entry ${entry.sourceId} must ship a factory`).toBeTypeOf('function');
      }
      expect(entry.sources.length).toBeGreaterThan(0);
    }
  });

  it('treats row 21 as an alias of row 19 and never as a distinct technique', () => {
    const alias = manifest.find((entry) => entry.sourceId === 21);
    if (!alias) return; // not yet landed in this interim subset
    expect(alias.limitation).toBe('Alias of source 19');
    const nineteen = manifest.find((entry) => entry.sourceId === 19);
    expect(nineteen, 'row 21 may only alias a row 19 that exists').toBeDefined();
  });

  it('source 20 resolves ordered plate hits with distance-interpolated penetration', () => {
    const entry = manifest.find((row) => row.sourceId === 20)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const stats = demo.root.userData.stats as {
      shellsFired: number;
      plateHits: number;
      penetrations: number;
      bounces: number;
      lastResolution: string;
    };
    const penAtDistanceMm = demo.root.userData.penAtDistanceMm as (dist: number) => number;
    // pen curve clamps outside 100-1000 m exactly as the source interpolation states.
    expect(penAtDistanceMm(0)).toBeCloseTo(180, 5);
    expect(penAtDistanceMm(100)).toBeCloseTo(180, 5);
    expect(penAtDistanceMm(550)).toBeCloseTo(160, 5);
    expect(penAtDistanceMm(1000)).toBeCloseTo(140, 5);
    expect(penAtDistanceMm(5000)).toBeCloseTo(140, 5);

    for (let frame = 0; frame < 600; frame += 1) demo.update?.(frame / 60, 1 / 60);
    expect(stats.shellsFired).toBeGreaterThanOrEqual(4);
    expect(stats.plateHits).toBeGreaterThan(0);
    expect(stats.lastResolution).toMatch(/^(glacis|rear|turretFront|turretSide):(pen|bounce)@\d+deg$|^ammo:module$/);
    expect(stats.penetrations + stats.bounces).toBeLessThanOrEqual(stats.shellsFired);
    demo.dispose();
  });

  it('source 31 keeps the IK chain on its handle target with a bounded curl', () => {
    const entry = manifest.find((row) => row.sourceId === 31)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const stats = demo.root.userData.stats as {
      lastReachRatio: number;
      lastCurl: number;
      ikSolvedFrames: number;
    };
    for (let frame = 0; frame <= 120; frame += 1) demo.update?.(frame / 30, 1 / 30);
    expect(stats.ikSolvedFrames).toBe(121);
    // Handle path stays inside the solvable annulus: finite ratio, never over-extended.
    expect(stats.lastReachRatio).toBeGreaterThan(0.2);
    expect(stats.lastReachRatio).toBeLessThan(0.95);
    expect(stats.lastCurl).toBeGreaterThanOrEqual(0);
    expect(stats.lastCurl).toBeLessThanOrEqual(1);
    demo.dispose();
  });

  it('source 34 delivers every event to exactly its contracted consumers, not everyone', () => {
    const entry = manifest.find((row) => row.sourceId === 34)!;
    const demo = entry.createDemo!({ THREE, seed: SEED });
    const stats = demo.root.userData.stats as {
      eventsEmitted: number;
      contractedDeliveries: number;
      broadcastDeliveries: number;
    };
    for (let frame = 0; frame < 180; frame += 1) demo.update?.(frame / 60, 1 / 60);
    expect(stats.eventsEmitted).toBeGreaterThanOrEqual(2);
    // 3 events per shot with 2+3+2 declared consumers; broadcast would be 3 x 5 receivers.
    expect(stats.contractedDeliveries).toBe(stats.eventsEmitted * 7);
    expect(stats.broadcastDeliveries).toBe(stats.eventsEmitted * 15);
    expect(stats.broadcastDeliveries).toBeGreaterThan(stats.contractedDeliveries);
    demo.dispose();
  });

  for (const entry of manifest.filter((row) => row.createDemo)) {
    it(`source ${entry.sourceId} builds, advances, stays finite and disposes`, () => {
      const factory = entry.createDemo!;
      const demo: Demo = factory({ THREE, seed: SEED });

      expect(demo.metadata.sourceId).toBe(entry.sourceId);
      expect(demo.metadata.adaptation).toBe(entry.adaptation);
      expect(demo.root.children.length).toBeGreaterThan(0);

      const before = countGeometry(demo.root);
      expect(before.nonFinite, 'no NaN/Infinity in initial geometry').toBe(0);
      expect(before.drawables).toBeGreaterThan(0);
      expect(before.drawables).toBeLessThanOrEqual(MAX_DRAWABLE_OBJECTS);
      expect(before.triangles).toBeLessThanOrEqual(MAX_TRIANGLES);

      if (demo.update) {
        for (let frame = 1; frame <= 8; frame += 1) {
          demo.update(frame / 60, 1 / 60);
        }
        const after = countGeometry(demo.root);
        expect(after.nonFinite, 'no NaN/Infinity after advancing 8 frames').toBe(0);
        expect(after.drawables, 'update must not allocate new drawables').toBe(before.drawables);
      }

      // Determinism: the same seed must rebuild the same scene.
      const twin = factory({ THREE, seed: SEED });
      expect(countGeometry(twin.root)).toEqual(before);
      twin.dispose();

      demo.dispose();
      expect(demo.root.children.length, 'dispose must empty the root').toBe(0);
    });
  }
});
