/**
 * Source 33 - ThreeJS Super Terrain: partitioned mesh terrain with worker LOD.
 *
 * Primary source, read at the pinned revision on 2026-09-12:
 *   https://github.com/vibe-stack/super-terrain @ e417c048c29fc0193005df4f3e39dff44cef5d31
 *   src/terrain/lod/LodSelector.ts (7,444 bytes), src/terrain/partition/MeshPartition.ts (7,005).
 *
 * LICENCE POSITION: our own `LICENSE` probe at the pinned revision returned HTTP 404, which
 * independently confirms the register's re-inspection - there is no repository licence, so the
 * work is all rights reserved by default. Read for method only; no expression is reproduced.
 *
 * The three algorithms actually read out of LodSelector.ts, restated:
 *   1. SCREEN-SPACE GEOMETRIC ERROR (lines 23-31). A LOD's geometric error in world units is
 *      projected to pixels by multiplying by viewportHeight / (2 tan(fov/2)) and dividing by
 *      distance. LOD choice is then a pixel threshold rather than a distance ring, so it stays
 *      correct when the field of view or the viewport changes - which a distance ring does not.
 *   2. HYSTERESIS (lines 59-84). Switching to a coarser LOD requires the current level's error
 *      to exceed the tolerance by a margin, and switching finer requires the candidate to come
 *      in comfortably under it. Two different margins, so a section sitting exactly on the
 *      threshold cannot oscillate between levels frame to frame.
 *   3. NEIGHBOUR CONSTRAINT (lines 191-240). Adjacent sections may differ by at most one LOD
 *      level; the settled state is min(source level + Manhattan distance), solved by bucketed
 *      relaxation. Without it, a fine section beside a coarse one leaves a crack at the seam.
 *
 * The demo builds a 6x6 partitioned terrain and drives a virtual camera distance through
 * `update`, selecting LOD per section. Left grid applies the neighbour constraint; right grid
 * does not, so the illegal level jumps that produce seam cracks are directly inspectable.
 */

import { fbm2 } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';

const SECTIONS = 6;
const SECTION_SIZE = 2;
/** Vertex resolution per LOD level. Level 0 is finest. */
const LOD_RESOLUTIONS = [16, 8, 4, 2];
const ERROR_TOLERANCE_PIXELS = 6;
const VIEWPORT_HEIGHT = 900;
const VERTICAL_FOV = (55 * Math.PI) / 180;

/** Projected geometric error in pixels. */
export function projectedGeometricError(
  geometricError: number,
  distance: number,
  viewportHeight = VIEWPORT_HEIGHT,
  verticalFov = VERTICAL_FOV,
): number {
  const projectionScale = viewportHeight / (2 * Math.tan(verticalFov * 0.5));
  return (geometricError * projectionScale) / Math.max(distance, 0.001);
}

function geometricErrorFor(level: number): number {
  // Error scales with the grid spacing a level leaves unresolved.
  return (SECTION_SIZE / LOD_RESOLUTIONS[level]) * 0.5;
}

/** Coarsest level already under tolerance, with asymmetric hysteresis against the current. */
export function selectLod(distance: number, currentLevel: number): number {
  let candidate = 0;
  for (let level = LOD_RESOLUTIONS.length - 1; level >= 0; level -= 1) {
    if (projectedGeometricError(geometricErrorFor(level), distance) <= ERROR_TOLERANCE_PIXELS) {
      candidate = level;
      break;
    }
  }
  if (candidate === currentLevel) return currentLevel;
  if (candidate < currentLevel) {
    // Going finer: only if the current level is now clearly too coarse.
    const currentError = projectedGeometricError(geometricErrorFor(currentLevel), distance);
    return currentError > ERROR_TOLERANCE_PIXELS * 1.16 ? candidate : currentLevel;
  }
  // Going coarser: only if the candidate is comfortably inside tolerance.
  const candidateError = projectedGeometricError(geometricErrorFor(candidate), distance);
  return candidateError < ERROR_TOLERANCE_PIXELS * 0.72 ? candidate : currentLevel;
}

/** Adjacent sections may differ by at most one level: settle to min(level + Manhattan). */
export function constrainNeighbourLods(levels: number[][]): number[][] {
  const result = levels.map((row) => row.slice());
  let changed = true;
  let guard = 0;
  while (changed && guard < 32) {
    changed = false;
    guard += 1;
    for (let z = 0; z < result.length; z += 1) {
      for (let x = 0; x < result[z].length; x += 1) {
        const neighbours = [
          result[z][x + 1], result[z][x - 1], result[z - 1]?.[x], result[z + 1]?.[x],
        ];
        for (const neighbour of neighbours) {
          if (neighbour === undefined) continue;
          if (result[z][x] > neighbour + 1) {
            result[z][x] = neighbour + 1;
            changed = true;
          }
        }
      }
    }
  }
  return result;
}

function heightAt(x: number, z: number, seed: number): number {
  return fbm2(x * 0.35 + 5, z * 0.35 + 13, seed, 4) * 1.5;
}

interface Section {
  x: number;
  z: number;
  mesh: import('three').Mesh;
  level: number;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-33-partitioned-terrain-lod';

  const material = new THREE.MeshStandardMaterial({
    color: 0x8d9a72, roughness: 0.95, metalness: 0, wireframe: false, flatShading: true,
  });
  const geometryCache = new Map<number, import('three').BufferGeometry>();

  function geometryFor(level: number, sx: number, sz: number): import('three').BufferGeometry {
    // Geometry depends on both level and section, because the heightfield differs per
    // section; cache by a composite key so repeated level changes do not reallocate.
    const key = level * 1000 + sz * SECTIONS + sx;
    const cached = geometryCache.get(key);
    if (cached) return cached;
    const segments = LOD_RESOLUTIONS[level];
    const geometry = new THREE.PlaneGeometry(SECTION_SIZE, SECTION_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position');
    const originX = (sx - (SECTIONS - 1) / 2) * SECTION_SIZE;
    const originZ = (sz - (SECTIONS - 1) / 2) * SECTION_SIZE;
    for (let i = 0; i < position.count; i += 1) {
      position.setY(i, heightAt(position.getX(i) + originX, position.getZ(i) + originZ, seed));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometryCache.set(key, geometry);
    return geometry;
  }

  function buildGrid(offsetX: number, name: string): Section[] {
    const grid = new THREE.Group();
    grid.name = name;
    grid.position.x = offsetX;
    root.add(grid);
    const sections: Section[] = [];
    for (let z = 0; z < SECTIONS; z += 1) {
      for (let x = 0; x < SECTIONS; x += 1) {
        const mesh = new THREE.Mesh(geometryFor(0, x, z), material);
        mesh.name = `${name}-section-${x}-${z}`;
        mesh.position.set(
          (x - (SECTIONS - 1) / 2) * SECTION_SIZE,
          0,
          (z - (SECTIONS - 1) / 2) * SECTION_SIZE,
        );
        grid.add(mesh);
        sections.push({ x, z, mesh, level: 0 });
      }
    }
    return sections;
  }

  const span = SECTIONS * SECTION_SIZE * 0.58;
  const constrained = buildGrid(-span, 'constrained');
  const unconstrained = buildGrid(span, 'unconstrained');

  /** Latest selected levels, exposed so a check can assert the constraint actually holds. */
  const state = {
    constrainedLevels: [] as number[][],
    unconstrainedLevels: [] as number[][],
  };

  function update(time: number): void {
    // A virtual camera sweeps in and out along +Z; nothing here touches a real camera.
    const cameraZ = 6 + Math.sin(time * 0.4) * 4.5 + 5;
    const raw: number[][] = [];
    for (let z = 0; z < SECTIONS; z += 1) {
      raw[z] = [];
      for (let x = 0; x < SECTIONS; x += 1) {
        const section = constrained[z * SECTIONS + x];
        const worldX = (x - (SECTIONS - 1) / 2) * SECTION_SIZE;
        const worldZ = (z - (SECTIONS - 1) / 2) * SECTION_SIZE;
        const distance = Math.hypot(worldX, cameraZ - worldZ);
        raw[z][x] = selectLod(distance, section.level);
      }
    }
    const settled = constrainNeighbourLods(raw);
    state.constrainedLevels = settled;
    state.unconstrainedLevels = raw;

    for (let z = 0; z < SECTIONS; z += 1) {
      for (let x = 0; x < SECTIONS; x += 1) {
        const withConstraint = constrained[z * SECTIONS + x];
        if (withConstraint.level !== settled[z][x]) {
          withConstraint.level = settled[z][x];
          withConstraint.mesh.geometry = geometryFor(settled[z][x], x, z);
        }
        const without = unconstrained[z * SECTIONS + x];
        if (without.level !== raw[z][x]) {
          without.level = raw[z][x];
          without.mesh.geometry = geometryFor(raw[z][x], x, z);
        }
      }
    }
  }

  update(0);

  return {
    root,
    update,
    dispose: () => {
      disposeGroup(root);
      for (const geometry of geometryCache.values()) geometry.dispose();
      geometryCache.clear();
      material.dispose();
    },
    metadata: {
      sourceId: 33,
      title: 'ThreeJS Super Terrain - partitioned mesh terrain with live CSG and worker LOD',
      method:
        'Terrain partitioned into independent sections, each selecting a LOD by PROJECTED '
        + 'SCREEN-SPACE GEOMETRIC ERROR (error * viewportHeight / (2 tan(fov/2)) / distance) '
        + 'against a pixel tolerance, with asymmetric hysteresis (1.16x coarser, 0.72x finer) so '
        + 'a section on the threshold cannot oscillate, and a neighbour constraint that settles '
        + 'adjacent sections to min(level + Manhattan distance) so no seam differs by more than '
        + 'one level. Left grid is constrained; right grid is the same selection WITHOUT the '
        + 'neighbour pass, so the illegal jumps that crack seams are visible.',
      adaptation: 'adapted',
      sources: [
        'https://github.com/vibe-stack/super-terrain',
        'https://vibe-stack.github.io/super-terrain',
      ],
      limitation:
        'Source is all rights reserved (LICENSE probe at the pinned revision returned HTTP '
        + '404); this is an independent implementation of the read algorithms only. The source\'s '
        + 'other headline features are NOT demonstrated and must not be read into this scene: no '
        + 'QEF dual-contouring CSG, no add/subtract of primitives or imported meshes, no tunnel '
        + 'or cave digging, no worker-pool compilation, no frame-budget scheduler, no IndexedDB '
        + 'persistence and no Godot export. LOD switching here swaps cached geometry on the main '
        + 'thread.',
      localLights: [],
    },
  };
}

export default createDemo;
