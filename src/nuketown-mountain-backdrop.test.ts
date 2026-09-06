/**
 * Pass 82 contract tests for the Nuke Town mountain backdrop.
 *
 *   1. OUTSIDE THE ARENA — every ridge vertex sits radially beyond the
 *      boundary fence's far corner, so no sightline inside the arena can
 *      intersect the backdrop. The ground skirt stays BELOW the arena ground
 *      plane everywhere.
 *   2. INSIDE THE CAMERA ENVELOPE — the whole backdrop stays within the
 *      atomic-acres 180 m camera far plane from every reachable position.
 *   3. ART-ONLY — no colliders, no shot surfaces, no shadow passes, fog on;
 *      building it does not mutate the constructed arena's authority.
 *   4. DETERMINISM + BUDGET — two builds are byte-identical; the whole ring
 *      costs three draws and a bounded triangle count.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildArena } from './map';
import {
  buildNuketownMountainBackdrop,
  mountainTwoTone,
  NUKETOWN_MOUNTAIN_SHADE_COOL,
  NUKETOWN_MOUNTAIN_SUN_WARM,
  NUKETOWN_MOUNTAIN_TWO_TONE_FLOOR,
  NUKETOWN_BACKDROP_MAX_HEIGHT_M,
  NUKETOWN_BACKDROP_MAX_RADIAL_M,
  NUKETOWN_BACKDROP_MIN_RADIAL_M,
  NUKETOWN_BACKDROP_SKIRT_Y_M,
} from './nuketown-mountain-backdrop';

/** Boundary fence far corner: |x| 31.3 + 0.3 half depth, |z| 31.8 + 0.3. */
const FENCE_CORNER_RADIAL_M = Math.hypot(31.6, 32.1);
/** atomic-acres camera far plane (legacy-main: non-water arenas run 180). */
const ARENA_CAMERA_FAR_M = 180;
/** Furthest reachable camera from the origin (arena bounds corner). */
const CAMERA_CORNER_RADIAL_M = Math.hypot(31, 31.5);

function ridgeMeshes(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter(
    (node): node is THREE.Mesh => node instanceof THREE.Mesh && node.name !== 'nuketown-backdrop-ground-skirt',
  );
}

describe('Nuke Town mountain backdrop (Pass 82)', () => {
  it('keeps every ridge vertex outside the boundary fence and inside the camera envelope', () => {
    expect(NUKETOWN_BACKDROP_MIN_RADIAL_M).toBeGreaterThan(FENCE_CORNER_RADIAL_M + 10);
    expect(NUKETOWN_BACKDROP_MAX_RADIAL_M + CAMERA_CORNER_RADIAL_M).toBeLessThan(ARENA_CAMERA_FAR_M);

    const parent = new THREE.Group();
    const backdrop = buildNuketownMountainBackdrop(parent);
    for (const mesh of ridgeMeshes(backdrop.group)) {
      const positions = mesh.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const radial = Math.hypot(positions.getX(index), positions.getZ(index));
        expect(radial).toBeGreaterThanOrEqual(NUKETOWN_BACKDROP_MIN_RADIAL_M - 0.01);
        expect(radial).toBeLessThanOrEqual(NUKETOWN_BACKDROP_MAX_RADIAL_M + 0.01);
        expect(positions.getY(index)).toBeLessThanOrEqual(NUKETOWN_BACKDROP_MAX_HEIGHT_M + 0.01);
      }
    }
  });

  it('keeps the ground skirt below the arena ground plane everywhere', () => {
    const parent = new THREE.Group();
    const backdrop = buildNuketownMountainBackdrop(parent);
    const skirt = backdrop.group.getObjectByName('nuketown-backdrop-ground-skirt') as THREE.Mesh;
    expect(skirt).toBeDefined();
    expect(NUKETOWN_BACKDROP_SKIRT_Y_M).toBeLessThanOrEqual(-0.3);
    skirt.updateWorldMatrix(true, false);
    const positions = skirt.geometry.getAttribute('position');
    const world = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      world.fromBufferAttribute(positions, index).applyMatrix4(skirt.matrixWorld);
      expect(world.y).toBeLessThanOrEqual(NUKETOWN_BACKDROP_SKIRT_Y_M + 0.01);
      expect(Math.hypot(world.x, world.z)).toBeLessThanOrEqual(NUKETOWN_BACKDROP_MAX_RADIAL_M + 0.01);
    }
  });

  it('is art-only: no colliders registered, no shadow passes, fog left on, arena authority untouched', () => {
    const scene = new THREE.Scene();
    const arena = buildArena(scene);
    const collidersBefore = arena.colliders.length;
    const physicsBefore = arena.physicsColliders.length;
    const shotSurfacesBefore = arena.shotSurfaces.length;
    const raycastBefore = arena.raycastMeshes.length;

    const backdrop = buildNuketownMountainBackdrop(scene);
    expect(arena.colliders.length).toBe(collidersBefore);
    expect(arena.physicsColliders.length).toBe(physicsBefore);
    expect(arena.shotSurfaces.length).toBe(shotSurfacesBefore);
    expect(arena.raycastMeshes.length).toBe(raycastBefore);

    expect(backdrop.group.userData.presentationOnly).toBe(true);
    expect(backdrop.group.userData.blocksShots).toBe(false);
    backdrop.group.traverse((node) => {
      expect(node.name).not.toMatch(/collider/i);
      expect(node.userData.collisionProxy).toBeUndefined();
      expect(node.userData.collisionAuthorityFor).toBeUndefined();
      if (node instanceof THREE.Mesh) {
        expect(node.castShadow).toBe(false);
        expect(node.userData.blocksShots).toBe(false);
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        // Re-pinned 2026-08-31. The three RINGS now carry fog:false deliberately,
        // and the reason is the whole point of the pass: this arena's fog is
        // 0xb1c0be (rel. luminance 0.73) against a sunset sky measuring 85-155,
        // so at the ridge's 96-132 m the fog factor 0.58-0.82 put a FLOOR under
        // the massif ABOVE the sky. No albedo could read as a silhouette while
        // scene fog was hazing it toward something brighter than the sky behind
        // it. The rings now bake their own radial haze toward a dusk horizon
        // instead. Measured ridge/sky luminance: 0.945 -> 0.651 at eye level,
        // 0.947 -> 0.430 at the north ridge meter, with the sky unchanged.
        // The SKIRT keeps scene fog, because the skirt is ground.
        const ringLike = /ridge|foothills|far-range/u.test(node.name);
        for (const material of materials) {
          if (ringLike) expect(material.fog).toBe(false);
          else expect(material.fog).not.toBe(false);
        }
      }
    });
  });

  it('is deterministic and stays inside a three-draw, bounded-triangle budget', () => {
    const first = buildNuketownMountainBackdrop(new THREE.Group());
    const second = buildNuketownMountainBackdrop(new THREE.Group());
    expect(first.stats).toEqual(second.stats);
    // v3 2026-08-29: + the snowlined far range ring, and denser segments on
    // the ridged profiles (owner asked for higher-quality mountains).
    expect(first.stats.meshes).toBe(4);
    expect(first.stats.triangles).toBeLessThan(6_000);
    const firstMeshes = ridgeMeshes(first.group);
    const secondMeshes = ridgeMeshes(second.group);
    expect(firstMeshes.length).toBe(secondMeshes.length);
    for (let index = 0; index < firstMeshes.length; index += 1) {
      expect(Array.from(firstMeshes[index].geometry.getAttribute('position').array))
        .toEqual(Array.from(secondMeshes[index].geometry.getAttribute('position').array));
    }
  });

  /**
   * HF-536 forge-nature PASS 1 (R21 warm/cool sides, T1 in the lane brief).
   *
   * The rock light must actually SEPARATE a sunlit facet from a shaded one, or
   * the massif is one flat cut-out however many octaves the crest carries. The
   * floor is a luminance RATIO of full sun over full shade on the same base
   * colour, so it cannot be met by simply brightening everything.
   */
  it('separates sunlit from shaded rock by at least the two-tone floor', () => {
    const lit: [number, number, number] = [0, 0, 0];
    const shade: [number, number, number] = [0, 0, 0];
    // Mid-grey rock base: the ratio is a property of the light, not the albedo.
    mountainTwoTone(0.5, 0.5, 0.5, 1, lit);
    mountainTwoTone(0.5, 0.5, 0.5, 0, shade);
    const luma = (c: readonly [number, number, number]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(luma(lit) / luma(shade)).toBeGreaterThanOrEqual(NUKETOWN_MOUNTAIN_TWO_TONE_FLOOR);
    // ... and the hue direction is the point: sun warm (R > B), shade cool (B > R).
    expect(lit[0]).toBeGreaterThan(lit[2]);
    expect(shade[2]).toBeGreaterThan(shade[0]);
    // Constants stay the authored swing rather than drifting to neutral grey.
    expect(NUKETOWN_MOUNTAIN_SUN_WARM).toBe(0xffe0b8);
    expect(NUKETOWN_MOUNTAIN_SHADE_COOL).toBe(0x8f96c8);
  });

  /**
   * HF-536 forge-nature PASS 1 (R20 jagged edge, T1 in the lane brief).
   *
   * The crest function already carried four ridged octaves; what it did not
   * have was enough angular SAMPLES to put them on the silhouette. This pins
   * the resolved result on the real built geometry - the count of local maxima
   * along the crest row - so a future refactor cannot quietly drop the segment
   * counts back and re-alias the ridgeline into a smooth band.
   */
  it('resolves a jagged crest line on the built ridge rings', () => {
    const backdrop = buildNuketownMountainBackdrop(new THREE.Group());
    const meshes = ridgeMeshes(backdrop.group);
    // Row 2 of 5 is the crest row (buildRidgeRing's ringRows table).
    const crestOf = (mesh: THREE.Mesh): number[] => {
      const position = mesh.geometry.getAttribute('position');
      const heights: number[] = [];
      for (let vertex = 2; vertex < position.count; vertex += 5) heights.push(position.getY(vertex));
      // Drop the duplicated closing segment so the wrap-around is not counted twice.
      return heights.slice(0, -1);
    };
    const localMaxima = (series: readonly number[]): number => {
      let count = 0;
      for (let i = 0; i < series.length; i += 1) {
        const previous = series[(i - 1 + series.length) % series.length];
        const next = series[(i + 1) % series.length];
        if (series[i] > previous && series[i] > next) count += 1;
      }
      return count;
    };
    // The two rings that form the visible silhouette from inside the arena.
    const silhouette = meshes.filter((mesh) => crestOf(mesh).length >= 150);
    expect(silhouette.length).toBe(2);
    for (const mesh of silhouette) {
      const crest = crestOf(mesh);
      expect(localMaxima(crest)).toBeGreaterThanOrEqual(14);
      expect(Math.max(...crest) / Math.min(...crest)).toBeGreaterThanOrEqual(1.5);
    }
    backdrop.dispose();
  });
});
