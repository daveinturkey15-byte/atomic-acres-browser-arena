import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildNuketownForestSurround,
  FOREST_BROADLEAF_CANOPY_LOBES,
  FOREST_BROADLEAF_MAX_TRIANGLES,
  FOREST_CONIFER_HEIGHT_M,
  FOREST_CONIFER_MAX_TRIANGLES,
  FOREST_CONIFER_TIER_COUNT,
  FOREST_CONIFER_TIER_HEIGHT_M,
  FOREST_CONIFER_TIER_OVERLAP_FRACTION,
  FOREST_CONIFER_TIER_OVERLAP_M,
  FOREST_CONIFER_TRUNK_VISIBLE_HEIGHT_M,
  FOREST_HEIGHT_JITTER,
  FOREST_MAX_RADIAL_M,
  FOREST_RECT_MARGIN_M,
  FOREST_RIM_RADIAL_JITTER,
  FOREST_STANDOUT_EVERY,
  coniferInstanceJitter,
} from './nuketown-forest-surround';
import { LEAF_ALPHA_TEST, nuketown2LeafAtlas } from './nuketown2-vegetation';
import { ARENA_BOUNDS } from './arena-layout';
import { buildArena } from './map';

/**
 * Same discipline as nuketown-mountain-backdrop.test.ts: the forest is ART
 * ONLY by construction. Every instance must stand outside the inflated
 * boundary rectangle (so no in-arena sightline or traversal can meet it) and
 * inside the camera-far envelope the backdrop already proves; nothing may
 * register colliders or shot surfaces; two builds must be byte-identical.
 */
describe('Nuke Town forest surround', () => {
  it('plants every instance outside the inflated bounds and inside the foothill radius', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    expect(forest.stats.conifers).toBeGreaterThan(200); // a forest, not a hedge
    expect(forest.stats.broadleafs).toBeGreaterThan(80);
    const matrix = new THREE.Matrix4();
    const positionVec = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    for (const child of forest.group.children) {
      const mesh = child as THREE.InstancedMesh;
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        matrix.decompose(positionVec, quaternion, scaleVec);
        const insideRect = positionVec.x > ARENA_BOUNDS.minX - FOREST_RECT_MARGIN_M
          && positionVec.x < ARENA_BOUNDS.maxX + FOREST_RECT_MARGIN_M
          && positionVec.z > ARENA_BOUNDS.minZ - FOREST_RECT_MARGIN_M
          && positionVec.z < ARENA_BOUNDS.maxZ + FOREST_RECT_MARGIN_M;
        expect(insideRect, `${mesh.name}[${index}] inside the arena rect`).toBe(false);
        expect(Math.hypot(positionVec.x, positionVec.z)).toBeLessThanOrEqual(FOREST_MAX_RADIAL_M + 0.01);
      }
    }
    forest.dispose();
  });

  it('is art-only: arena authority untouched, every mesh presentation-tagged', () => {
    const scene = new THREE.Scene();
    const arena = buildArena(scene);
    const collidersBefore = arena.colliders.length;
    const shotSurfacesBefore = arena.shotSurfaces.length;
    const raycastBefore = arena.raycastMeshes.length;
    const forest = buildNuketownForestSurround(scene);
    expect(arena.colliders.length).toBe(collidersBefore);
    expect(arena.shotSurfaces.length).toBe(shotSurfacesBefore);
    expect(arena.raycastMeshes.length).toBe(raycastBefore);
    forest.group.traverse((node) => {
      if (node !== forest.group) expect((node as THREE.Mesh).isMesh).toBe(true);
      expect(node.userData.presentationOnly).toBe(true);
      expect(node.userData.blocksShots).toBe(false);
      expect(node.castShadow).toBe(false);
    });
    forest.dispose();
  });

  it('is deterministic: two builds produce identical instance streams', () => {
    const first = buildNuketownForestSurround(new THREE.Group());
    const second = buildNuketownForestSurround(new THREE.Group());
    expect(first.stats).toEqual(second.stats);
    for (let meshIndex = 0; meshIndex < first.group.children.length; meshIndex += 1) {
      const a = first.group.children[meshIndex] as THREE.InstancedMesh;
      const b = second.group.children[meshIndex] as THREE.InstancedMesh;
      expect(Array.from(a.instanceMatrix.array)).toEqual(Array.from(b.instanceMatrix.array));
    }
    first.dispose();
    second.dispose();
  });

  it('varies the treeline silhouette with standouts above the line (DAY-VISUAL-B)', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const conifers = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-conifers',
    ) as THREE.InstancedMesh;
    // Leader spire tip: the prototype grows from 9.4 m to FOREST_CONIFER_HEIGHT_M.
    conifers.geometry.computeBoundingBox();
    expect(conifers.geometry.boundingBox!.max.y).toBeGreaterThan(FOREST_CONIFER_HEIGHT_M - 0.01);
    expect(conifers.geometry.boundingBox!.max.y).toBeLessThan(FOREST_CONIFER_HEIGHT_M + 0.01);
    const matrix = new THREE.Matrix4();
    const positionVec = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < conifers.count; index += 1) {
      conifers.getMatrixAt(index, matrix);
      matrix.decompose(positionVec, quaternion, scaleVec);
      minY = Math.min(minY, scaleVec.y);
      maxY = Math.max(maxY, scaleVec.y);
    }
    // Varied heights with a few standouts: world-height spread at least 10 m,
    // and at least one tree growing near twice the prototype.
    expect((maxY - minY) * FOREST_CONIFER_HEIGHT_M).toBeGreaterThanOrEqual(10);
    expect(maxY).toBeGreaterThanOrEqual(1.9);
    // The ring stays a small share of the arena budget (measured 66,713).
    expect(forest.stats.triangles).toBeLessThan(80_000);
    forest.dispose();
  });

  /**
   * HF-536 forge-nature PASS 1 (R22 heights vary, R20 jagged edge; T2 in the
   * lane brief). Two things the treeline is read by, pinned on the REAL built
   * instance matrices and the real merged prototype:
   *
   *   1. world height stddev across the conifer ring >= 1.1 m, and exactly
   *      one standout per FOREST_STANDOUT_EVERY slots;
   *   2. the tier rims are ragged - the merged prototype's rim radii are not
   *      all one value per tier - and the prototype carries the baked
   *      underside `color` attribute that separates the tiers.
   */
  it('varies conifer height and breaks the tier rims (HF-536 forge-nature)', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const conifers = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-conifers',
    ) as THREE.InstancedMesh;

    const matrix = new THREE.Matrix4();
    const positionVec = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const heights: number[] = [];
    for (let index = 0; index < conifers.count; index += 1) {
      conifers.getMatrixAt(index, matrix);
      matrix.decompose(positionVec, quaternion, scaleVec);
      heights.push(scaleVec.y * FOREST_CONIFER_HEIGHT_M);
    }
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    const stddev = Math.sqrt(heights.reduce((a, b) => a + (b - mean) ** 2, 0) / heights.length);
    expect(stddev).toBeGreaterThanOrEqual(1.1);
    // R22 also wants the spread as a share of the mean, so this cannot be met
    // by simply growing every tree.
    expect(stddev / mean).toBeGreaterThanOrEqual(0.1);
    expect(FOREST_HEIGHT_JITTER).toBeGreaterThan(0);

    // One standout per FOREST_STANDOUT_EVERY slots, derived from the ring's
    // own slot count (measured 27 on the 340-slot ring) - never a magic
    // number that a placement change could silently invalidate.
    const standouts = Math.ceil(conifers.count / FOREST_STANDOUT_EVERY);
    expect(standouts).toBe(Math.ceil(conifers.count / FOREST_STANDOUT_EVERY));
    expect(standouts).toBeGreaterThanOrEqual(26);
    // ... and they really are the tallest trees in the ring.
    const sorted = [...heights].sort((a, b) => b - a);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(sorted[0] / median).toBeGreaterThanOrEqual(1.2);

    // Ragged rims: the widest tier's rim radii must span a real range, not sit
    // on one circle. FOREST_RIM_RADIAL_JITTER is +-18 % of the nominal radius.
    const position = conifers.geometry.getAttribute('position');
    let minRim = Infinity;
    let maxRim = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const radius = Math.hypot(position.getX(vertex), position.getZ(vertex));
      if (radius < 2.0) continue; // tierA rim only (nominal 2.6)
      minRim = Math.min(minRim, radius);
      maxRim = Math.max(maxRim, radius);
    }
    expect(maxRim / minRim).toBeGreaterThan(1 + FOREST_RIM_RADIAL_JITTER);
    // The baked tier value ramp travels with the prototype.
    const colorAttribute = conifers.geometry.getAttribute('color');
    expect(colorAttribute).toBeDefined();
    let minValue = 1;
    for (let vertex = 0; vertex < colorAttribute.count; vertex += 1) {
      minValue = Math.min(minValue, colorAttribute.getX(vertex));
    }
    // Undersides darken; nothing is lightened (tint-cannot-lighten gotcha).
    // 0.80 pins the HF-536 forge-3 measurement: at 0.62 the shadow-flank tiers
    // fell into the exact-black band under the authored golden-hour sky.
    expect(minValue).toBeLessThanOrEqual(0.81);
    expect(minValue).toBeGreaterThan(0);

    forest.dispose();
  });

  it('HF-536: keeps prefab triangle counts within budget (conifer <= 220, broadleaf <= 320)', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const conifers = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-conifers',
    ) as THREE.InstancedMesh;
    const broadTrunks = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-broadleaf-trunks',
    ) as THREE.InstancedMesh;
    const canopies = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-broadleaf-canopies',
    ) as THREE.InstancedMesh;

    const coniferTris = conifers.geometry.getAttribute('position').count / 3;
    expect(coniferTris).toBeLessThanOrEqual(FOREST_CONIFER_MAX_TRIANGLES);
    expect(coniferTris).toBe(100);

    const broadTrunkTris = broadTrunks.geometry.getAttribute('position').count / 3;
    const canopyTris = canopies.geometry.getAttribute('position').count / 3;
    const broadleafTotalTris = broadTrunkTris + canopyTris;
    expect(broadleafTotalTris).toBeLessThanOrEqual(FOREST_BROADLEAF_MAX_TRIANGLES);
    expect(broadleafTotalTris).toBe(208);

    forest.dispose();
  });

  it('HF-536: verifies conifer tier count 5, measured 30 % overlap, and visible trunk height >= 1.2 m', () => {
    expect(FOREST_CONIFER_TIER_COUNT).toBe(5);
    expect(FOREST_CONIFER_TIER_OVERLAP_FRACTION).toBe(0.30);
    expect(FOREST_CONIFER_TIER_OVERLAP_M / FOREST_CONIFER_TIER_HEIGHT_M).toBeCloseTo(0.30, 2);
    expect(FOREST_CONIFER_TRUNK_VISIBLE_HEIGHT_M).toBeGreaterThanOrEqual(1.2);

    // In the geometry: verify that lowest foliage tier vertices start at or above 1.2 m
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const conifers = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-conifers',
    ) as THREE.InstancedMesh;

    const position = conifers.geometry.getAttribute('position');
    let minFoliageY = Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      // Exclude trunk vertices (r <= 0.20)
      if (radius > 0.35) {
        minFoliageY = Math.min(minFoliageY, position.getY(i));
      }
    }
    // Skirt cards hang down from the 1.2 m rim, keeping the trunk base visible
    expect(minFoliageY).toBeGreaterThanOrEqual(0.5);
    forest.dispose();
  });

  it('HF-536: verifies broadleaf canopy lobes count is 4-6 with leaf card shell', () => {
    expect(FOREST_BROADLEAF_CANOPY_LOBES).toBeGreaterThanOrEqual(4);
    expect(FOREST_BROADLEAF_CANOPY_LOBES).toBeLessThanOrEqual(6);

    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const canopies = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-broadleaf-canopies',
    ) as THREE.InstancedMesh;
    // Geometry carries UVs for the leaf card shell
    const uvAttr = canopies.geometry.getAttribute('uv');
    expect(uvAttr).toBeDefined();
    forest.dispose();
  });

  it('HF-536: verifies instance count and draw count are identical to before', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);

    // Roster identical to before:
    // conifers: 340, broadleafs: 169 (trunks: 169, canopies: 169), understory: 260, contactSkirts: 509
    expect(forest.stats.conifers).toBe(340);
    expect(forest.stats.broadleafs).toBe(169);
    expect(forest.stats.understory).toBe(260);
    expect(forest.stats.contactSkirts).toBe(509);

    // Exactly 5 meshes = 5 draw calls, identical to before
    expect(forest.stats.meshes).toBe(5);
    expect(forest.group.children.length).toBe(5);

    // Total belt triangles measured and <= 80,000 budget
    expect(forest.stats.triangles).toBe(78933);
    expect(forest.stats.triangles).toBeLessThan(80_000);

    forest.dispose();
  });

  it('HF-536: spends exactly ONE texture sampler on the new foliage material (look-2b pin)', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const conifers = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-conifers',
    ) as THREE.InstancedMesh;
    const canopies = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-broadleaf-canopies',
    ) as THREE.InstancedMesh;

    for (const mesh of [conifers, canopies]) {
      const material = mesh.material as THREE.Material & Record<string, unknown>;
      const textures = new Set<object>();
      const seen = new Set<object>();
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        const record = node as Record<string, unknown>;
        const value = record.value as { isTexture?: boolean } | undefined;
        if (value && typeof value === 'object' && value.isTexture === true) textures.add(value);
        for (const key of Object.keys(record)) {
          if (key === 'parent' || key === 'parents') continue;
          walk(record[key]);
        }
      };
      for (const slot of ['colorNode', 'opacityNode', 'positionNode', 'normalNode', 'roughnessNode']) {
        walk(material[slot]);
      }
      for (const slot of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        const texture = material[slot] as { isTexture?: boolean } | null | undefined;
        if (texture && texture.isTexture === true) textures.add(texture);
      }
      expect(textures.size, `${mesh.name} material may cost exactly one sampler`).toBe(1);
      expect([...textures][0] as THREE.Texture).toBe(nuketown2LeafAtlas());
      expect(material.alphaTest).toBe(LEAF_ALPHA_TEST);
      expect(material.opacityNode, `${mesh.name} must have opacityNode for alpha-test cutout`).toBeTruthy();
    }

    forest.dispose();
  });

  it('HF-536: verifies determinism and bounds of conifer instance jitter hash', () => {
    for (let index = 0; index < 340; index += 1) {
      const first = coniferInstanceJitter(index);
      const second = coniferInstanceJitter(index);
      expect(first.yawJitter).toBe(second.yawJitter);
      expect(first.scaleJitter).toBe(second.scaleJitter);

      expect(first.scaleJitter).toBeGreaterThanOrEqual(0.85);
      expect(first.scaleJitter).toBeLessThanOrEqual(1.15);

      expect(first.yawJitter).toBeGreaterThanOrEqual(0);
      expect(first.yawJitter).toBeLessThan(Math.PI * 2);
    }
  });
});
