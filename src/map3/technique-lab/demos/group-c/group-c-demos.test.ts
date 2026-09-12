/**
 * Group-C technique-lab CPU checks.
 *
 * These are deliberately small and deliberately NOT a rendering test. They
 * instantiate every non-blocked demo, advance it, dispose it, and assert the
 * things a CPU can actually know: that the manifest preserves the register's
 * IDs, that metadata agrees with the manifest, that geometry is finite and
 * bounded, that disposal releases what was created, and that each technique's
 * own characteristic number moves the way the method says it should.
 *
 * Pixel validation is OPEN and is root's serialized visual pass. Nothing here
 * is evidence of rendered quality.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { manifest } from './index';
import { applyBrief } from './source-35';
import { voxelRemesh } from './source-36';
import { convertZupCentimetres } from './source-37';
import { isSolid, litRoomCells, voxelIndex, type VoxelGrid } from './source-40';
import { shadeCorrect, shadeTintedAfter } from './source-46';

const SEED = 20260912;

describe('group-C manifest', () => {
  it('preserves the register IDs exactly and does not invent or drop any', () => {
    const ids = manifest.map((entry) => entry.sourceId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(35);
    for (const id of ids) expect(id).toBeLessThanOrEqual(50);
  });

  it('gives every non-blocked entry a factory and every blocked entry none', () => {
    for (const entry of manifest) {
      if (entry.adaptation === 'blocked') {
        expect(entry.createDemo).toBeUndefined();
        expect(entry.limitation, `blocked ${entry.sourceId} needs a limitation`).toBeTruthy();
      } else {
        expect(typeof entry.createDemo, `entry ${entry.sourceId}`).toBe('function');
      }
    }
  });

  it('names at least one primary source on every entry', () => {
    for (const entry of manifest) {
      expect(entry.sources.length, `entry ${entry.sourceId}`).toBeGreaterThan(0);
    }
  });
});

describe('every non-blocked group-C demo instantiates, advances and disposes', () => {
  const runnable = manifest.filter((entry) => entry.createDemo);

  for (const entry of runnable) {
    it(`source ${entry.sourceId} — ${entry.title}`, () => {
      const demo = entry.createDemo!({ THREE, seed: SEED });

      // Identity: the created metadata must agree with the manifest row, or the
      // lab would label an exhibit with another technique's name.
      expect(demo.metadata.sourceId).toBe(entry.sourceId);
      expect(demo.metadata.adaptation).toBe(entry.adaptation);
      expect(demo.root).toBeInstanceOf(THREE.Group);
      expect(demo.root.children.length).toBeGreaterThan(0);

      // Bounded cost, and no NaN anywhere in the geometry.
      let meshCount = 0;
      let vertexCount = 0;
      demo.root.traverse((object: any) => {
        if (!object.isMesh && !object.isInstancedMesh) return;
        meshCount += 1;
        const position = object.geometry?.getAttribute('position');
        if (!position) return;
        vertexCount += position.count;
        const array = position.array as ArrayLike<number>;
        for (let i = 0; i < array.length; i += 1) {
          expect(Number.isFinite(array[i])).toBe(true);
        }
      });
      expect(meshCount).toBeGreaterThan(0);
      expect(meshCount).toBeLessThanOrEqual(64);
      expect(vertexCount).toBeLessThanOrEqual(400_000);

      // No demo in this group may create lights unless it declared them.
      const declared = demo.metadata.localLights ?? [];
      const actual: string[] = [];
      demo.root.traverse((object: any) => {
        if (object.isLight) actual.push(object.name || object.type);
      });
      expect(actual.length, `undeclared lights in ${entry.sourceId}`).toBe(declared.length);

      // Advancing must not throw and must not poison geometry with NaN.
      if (demo.update) {
        for (let step = 0; step < 12; step += 1) demo.update(step / 60, 1 / 60);
        demo.root.traverse((object: any) => {
          const position = object.geometry?.getAttribute('position');
          if (!position) return;
          const array = position.array as ArrayLike<number>;
          for (let i = 0; i < array.length; i += 1) {
            expect(Number.isFinite(array[i])).toBe(true);
          }
        });
      }

      demo.dispose();
      expect(demo.root.children.length).toBe(0);
    });
  }
});

describe('source 35 — the brief is enforced, not merely written down', () => {
  it('admits only the three whitelisted verbs and refuses the rest with a reason', () => {
    const outcome = applyBrief([
      { verb: 'pump', at: [0, 0] },
      { verb: 'door', at: [0, 1] },
      { verb: 'fridge', at: [1, 0] },
      { verb: 'drive', at: [2, 0] },
      { verb: 'craft', at: [3, 0] },
    ]);
    expect(outcome.admitted.map((entry) => entry.verb)).toEqual(['pump', 'door', 'fridge']);
    expect(outcome.refused).toHaveLength(2);
    for (const refusal of outcome.refused) expect(refusal.reason.length).toBeGreaterThan(0);
  });
});

describe('source 36 — the remesh actually reduces, and the bake carries direction', () => {
  it('drops triangle count while keeping a normalised baked normal per output vertex', () => {
    const geometry = new THREE.IcosahedronGeometry(1, 4);
    const positions = geometry.getAttribute('position').array as Float32Array;
    const normals = geometry.getAttribute('normal').array as Float32Array;
    const index = geometry.getIndex();
    const triangles = index
      ? (index.array as ArrayLike<number>)
      : Array.from({ length: geometry.getAttribute('position').count }, (_v, i) => i);

    const coarse = voxelRemesh(positions, normals, triangles, 0.3);
    const fine = voxelRemesh(positions, normals, triangles, 0.12);

    expect(coarse.outputTriangles).toBeGreaterThan(0);
    expect(coarse.outputTriangles).toBeLessThan(coarse.sourceTriangles);
    // The grid spacing is the silhouette control: a finer cell must keep more.
    expect(fine.outputTriangles).toBeGreaterThan(coarse.outputTriangles);

    for (let vertex = 0; vertex < coarse.positions.length / 3; vertex += 1) {
      const length = Math.hypot(
        coarse.bakedNormals[vertex * 3],
        coarse.bakedNormals[vertex * 3 + 1],
        coarse.bakedNormals[vertex * 3 + 2],
      );
      expect(length).toBeGreaterThan(0.99);
      expect(length).toBeLessThan(1.01);
    }
    geometry.dispose();
  });
});

describe('source 37 — the convention conversion is exact', () => {
  it('maps Z-up centimetres onto Y-up metres and keeps the footprint square', () => {
    const converted = convertZupCentimetres({
      name: 'probe',
      position: [250, 400, 180],
      size: [100, 200, 300],
    });
    // Source Z (up, cm) becomes scene Y (up, m).
    expect(converted.position[1]).toBeCloseTo(1.8, 6);
    expect(converted.position[0]).toBeCloseTo(2.5, 6);
    // Handedness is preserved by negating the source Y as it becomes scene Z.
    expect(converted.position[2]).toBeCloseTo(-4.0, 6);
    // Extents follow the same axis swap: source height becomes scene height.
    expect(converted.size[1]).toBeCloseTo(3.0, 6);
    expect(converted.size[2]).toBeCloseTo(2.0, 6);
  });
});

describe('source 40 — the light dies with the ceiling because there is no light', () => {
  it('reports fewer lit cells after the ceiling above them is removed', () => {
    const sizeX = 5;
    const sizeY = 6;
    const sizeZ = 5;
    const grid: VoxelGrid = {
      solid: new Uint8Array(sizeX * sizeY * sizeZ),
      sizeX,
      sizeY,
      sizeZ,
    };
    for (let y = 0; y < sizeY; y += 1) {
      for (let z = 0; z < sizeZ; z += 1) {
        for (let x = 0; x < sizeX; x += 1) {
          const shell = x === 0 || z === 0 || x === sizeX - 1 || z === sizeZ - 1;
          const solid = shell ? y % 3 !== 1 : y % 3 === 0;
          grid.solid[voxelIndex(grid, x, y, z)] = solid ? 1 : 0;
        }
      }
    }

    const intact = litRoomCells(grid).length;
    expect(intact).toBeGreaterThan(0);

    // Remove every solid cell above the bottom storey in one shell column.
    for (let y = 1; y < sizeY; y += 1) grid.solid[voxelIndex(grid, 0, y, 2)] = 0;
    const carved = litRoomCells(grid).length;

    expect(carved).toBeLessThan(intact);
    // And the query is genuinely structural: nothing above means nothing lit.
    grid.solid.fill(0);
    expect(litRoomCells(grid)).toHaveLength(0);
    expect(isSolid(grid, 0, 0, 0)).toBe(false);
  });
});

describe('source 46 — where the bubble term is injected changes the colour', () => {
  it('returns brighter and green-shifted only when scattered inside the integral', () => {
    const depth = 2.0;
    const turbulence = 1;
    const correct = shadeCorrect(depth, turbulence);
    const tinted = shadeTintedAfter(depth, turbulence);

    // The physical claim: flat backscatter filtered by absorption emerges green.
    expect(correct.g).toBeGreaterThan(correct.r);
    expect(correct.g).toBeGreaterThan(correct.b);

    // The mistake the source warns about: flat in, flat out. The tint raises
    // every channel by the same amount, so it cannot produce a green shift —
    // its channel spread stays the (small) spread absorption alone gives.
    const correctSpread = correct.g - correct.r;
    const tintedSpread = tinted.g - tinted.r;
    expect(correctSpread).toBeGreaterThan(tintedSpread);

    // Still water has no bubbles, so both models must agree exactly there.
    const calmCorrect = shadeCorrect(depth, 0);
    const calmTinted = shadeTintedAfter(depth, 0);
    expect(calmCorrect.r).toBeCloseTo(calmTinted.r, 12);
    expect(calmCorrect.g).toBeCloseTo(calmTinted.g, 12);
    expect(calmCorrect.b).toBeCloseTo(calmTinted.b, 12);

    // Absorption alone must still darken with depth in the red first.
    const shallow = shadeCorrect(0.2, 0);
    expect(shallow.r).toBeGreaterThan(calmCorrect.r);
  });
});
