/**
 * world-studio/nature — HF-571 natural surround and gardens for the
 * `world-studio` arena. API contract (frozen brief, 2026-09-12):
 *
 *   createStudioNature(): { root, update(elapsed, dt, camera, environment), dispose }
 *
 * Root owns the renderer, scene lights, fog, sky, weather selection and the
 * frame loop; this module only returns a group at the origin and moves four
 * uniforms from `update()`. No colliders, no listeners, no globals, no
 * per-frame allocation, no geometry rebuilds.
 *
 * Layers (each its own file, each reading the ONE height field in layout.ts):
 *   terrain.ts  ridge/forest/coast ring beyond X±42 / Z±36, boulders
 *   water.ts    coastal sector sea (about 30 % of the panorama toward -Z)
 *   trees.ts    broadleaf / conifer / birch family plus far silhouette cards
 *   gardens.ts  clipped hedges, flower beds, lawn tufts on the shared field
 */
import * as THREE from 'three';
import { createGardens } from './gardens';
import { createNatureUniforms } from './materials';
import { createTerrainRing } from './terrain';
import { createNatureTextures } from './textures';
import { createTreeFamily } from './trees';
import { createCoastalWater } from './water';

export type StudioNatureEnvironment = Readonly<{ wind: number; rain: number; snow: number; wetness: number }>;

export type StudioNatureStats = Readonly<{
  triangles: number;
  drawGroups: number;
  textures: number;
  trees: Readonly<{ broadleaf: number; conifer: number; birch: number; far: number }>;
  gardens: Readonly<{ hedgeSegments: number; hedgeSprigs: number; flowers: number; lawnTufts: number }>;
  boulders: number;
}>;

export type StudioNature = Readonly<{
  root: THREE.Group;
  update: (elapsed: number, dt: number, camera: THREE.Vector3, environment: StudioNatureEnvironment) => void;
  dispose: () => void;
  /** Build-time counts for the root's budget ledger (not part of the frozen API). */
  stats: StudioNatureStats;
}>;

/** Per-author budget from the brief, asserted by the lane test. */
export const NATURE_TRIANGLE_BUDGET = 100_000;
export const NATURE_DRAW_GROUP_BUDGET = 80;

export function createStudioNature(): StudioNature {
  const root = new THREE.Group();
  root.name = 'world-studio-nature';
  root.userData.presentationOnly = true;
  root.userData.blocksShots = false;

  const uniforms = createNatureUniforms();
  const textures = createNatureTextures();
  const terrain = createTerrainRing(textures, uniforms);
  const water = createCoastalWater(uniforms);
  const trees = createTreeFamily(textures, uniforms);
  const gardens = createGardens(textures, uniforms);
  root.add(terrain.group, water.mesh, trees.group, gardens.group);

  const stats: StudioNatureStats = Object.freeze({
    triangles: terrain.triangles + water.triangles + trees.triangles + gardens.triangles,
    drawGroups: terrain.drawGroups + water.drawGroups + trees.drawGroups + gardens.drawGroups,
    textures: textures.all.length + 1,
    trees: trees.counts,
    gardens: gardens.counts,
    boulders: terrain.group.children.length > 1 ? (terrain.group.children[1] as THREE.InstancedMesh).count : 0,
  });
  root.userData.natureStats = stats;

  let disposed = false;
  return Object.freeze({
    root,
    stats,
    update: (elapsed: number, _dt: number, _camera: THREE.Vector3, environment: StudioNatureEnvironment): void => {
      if (disposed) return;
      uniforms.time.value = elapsed;
      // Wind floor keeps foliage alive in still weather; rain adds gustiness.
      uniforms.wind.value = 0.3 + Math.max(0, environment.wind) + Math.max(0, environment.rain) * 0.25;
      uniforms.wetness.value = Math.min(1, Math.max(0, environment.wetness, environment.rain * 0.6));
      uniforms.snow.value = Math.min(1, Math.max(0, environment.snow));
      gardens.grass.advanceWind(elapsed * uniforms.wind.value);
    },
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      gardens.dispose();
      trees.dispose();
      water.dispose();
      terrain.dispose();
      for (const tex of textures.all) tex.dispose();
      root.clear();
    },
  });
}
