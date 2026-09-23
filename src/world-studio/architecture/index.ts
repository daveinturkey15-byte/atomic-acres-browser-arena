/**
 * HF-571 world-studio architecture entry point.
 *
 * Exports the two authored houses (teal at X = -20 facing the road, yellow at X = +20
 * facing back) with their attached garages, porches, rear balconies, external stairs and a
 * fully connected two-storey interior. Everything is authored in WORLD coordinates and the
 * returned root sits at the origin with no enclosing transform, so root can add it directly.
 *
 * Scope boundary for this lane: houses only. Ground, road, fences, vehicles, vegetation,
 * sheds and interior furniture belong to other lanes; `root.userData.furnitureAnchors`
 * publishes measured placements for the furniture author.
 */

import * as THREE from 'three';
import type { BallisticMaterialId } from '../../ballistics';
import type { Box2 } from '../../collision';
import type { ArenaVerticalNavigation } from '../../vertical-navigation';
import { StudioSurfaceCollector, type StudioSolid } from './build';
import { buildHouse, type FurnitureAnchor, type HouseConfig } from './house';
import { createStudioMaterialKit, type StudioMaterialKit } from './materials';

export type { StudioSolid } from './build';
export type { FurnitureAnchor, HouseConfig } from './house';
export { createStudioMaterialKit } from './materials';
export {
  EAVE_Y,
  GARAGE_ROOF_Y,
  GROUND_FLOOR_Y,
  HOUSE_HALF_DEPTH,
  HOUSE_HALF_WIDTH,
  RIDGE_Y,
  UPPER_CEILING_Y,
  UPPER_FLOOR_Y,
} from './house';

export type StudioReviewPoint = Readonly<{
  id: string;
  position: [number, number, number];
  target: [number, number, number];
}>;

export type StudioArchitecture = Readonly<{
  root: THREE.Group;
  solids: Array<{ id: string; mesh: THREE.Object3D; bounds: Box2; material: BallisticMaterialId }>;
  verticalNavigation: ArenaVerticalNavigation;
  reviewPoints?: StudioReviewPoint[];
}>;

export const STUDIO_HOUSES: readonly HouseConfig[] = Object.freeze([
  Object.freeze({
    id: 'teal-house',
    side: 'teal',
    centreX: -20,
    frontSign: 1,
    siding: 'siding-teal',
    masonry: 'brick',
    accent: 'interior-accent-teal',
  } as const),
  Object.freeze({
    id: 'yellow-house',
    side: 'yellow',
    centreX: 20,
    frontSign: -1,
    siding: 'siding-yellow',
    masonry: 'stone',
    accent: 'interior-accent-yellow',
  } as const),
]);

/**
 * Builds the world-studio architecture. One call owns one material kit; the caller may
 * release every generated texture through `root.userData.dispose()` when the arena unloads.
 */
export function createStudioArchitecture(): StudioArchitecture {
  const root = new THREE.Group();
  root.name = 'world-studio-architecture';

  const materials: StudioMaterialKit = createStudioMaterialKit();
  const collector = new StudioSurfaceCollector();

  const routes: ArenaVerticalNavigation['routes'][number][] = [];
  const ramps: ArenaVerticalNavigation['ramps'][number][] = [];
  const platforms: ArenaVerticalNavigation['platforms'][number][] = [];
  const anchors: FurnitureAnchor[] = [];
  const reviewPoints: StudioReviewPoint[] = [];

  for (const house of STUDIO_HOUSES) {
    const built = buildHouse(collector, house);
    routes.push(...built.routes);
    ramps.push(...built.ramps);
    platforms.push(...built.platforms);
    anchors.push(...built.anchors);
    reviewPoints.push(...built.reviewPoints.map((point) => Object.freeze({ ...point })));
  }

  const solids: StudioSolid[] = collector.build(root, materials);

  const verticalNavigation: ArenaVerticalNavigation = Object.freeze({
    routes: Object.freeze(routes.map((route) => Object.freeze({ ...route }))),
    ramps: Object.freeze(ramps.map((ramp) => Object.freeze({ ...ramp }))),
    platforms: Object.freeze(platforms.map((platform) => Object.freeze({ ...platform }))),
  });

  root.userData.worldStudioArchitecture = Object.freeze({
    version: 'hf571-world-studio-architecture-v1',
    houses: STUDIO_HOUSES.map((house) => house.id),
    solidCount: solids.length,
    drawGroupCount: collector.drawGroupCount,
    triangleCount: countTriangles(root),
  });
  root.userData.furnitureAnchors = Object.freeze(anchors.map((entry) => Object.freeze({ ...entry })));
  root.userData.verticalNavigation = verticalNavigation;
  root.userData.dispose = (): void => {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    materials.dispose();
  };

  return Object.freeze({
    root,
    solids: solids.map((solid) => ({ ...solid })),
    verticalNavigation,
    reviewPoints: reviewPoints.map((point) => ({ ...point })),
  });
}

/** Triangle census used by the authoring budget checks. */
export function countTriangles(object: THREE.Object3D): number {
  let triangles = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const index = child.geometry.getIndex();
    const position = child.geometry.getAttribute('position');
    if (index) triangles += index.count / 3;
    else if (position) triangles += position.count / 3;
  });
  return triangles;
}

/** Renderable draw groups before root batching. */
export function countDrawGroups(object: THREE.Object3D): number {
  let groups = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) groups++;
  });
  return groups;
}
