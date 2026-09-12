import * as THREE from 'three';
import type { ArenaMap, BreakableWindow } from '../map';
import { createBallisticSurface } from '../ballistics';
import { createStudioArchitecture } from './architecture';
import { createStudioNature } from './nature';
import { createStudioGround, type StudioSolid } from './ground';
import { STUDIO_BOUNDS, STUDIO_REVIEW_CAMERAS, studioSpawnPositions } from './layout';
import { STUDIO_ENVIRONMENTS, type StudioEnvironment } from './environment';
import { createStudioSnow } from './snow';
import { createStudioVehicles } from './vehicles';
import { createStudioInteriors, type StudioInteriorAnchor } from './interiors';

/** A new arena with one authority root; never aliases or wraps an old map builder. */
export function buildWorldStudio(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group(); root.name = 'world-studio-authoritative-arena';
  const ground = createStudioGround();
  const architecture = createStudioArchitecture();
  const nature = createStudioNature();
  const snow = createStudioSnow();
  const vehicles = createStudioVehicles();
  const interiors = createStudioInteriors(architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[]);
  root.add(ground.root, architecture.root, nature.root, snow.root, vehicles.root, interiors.root);
  root.userData.verticalNavigation = architecture.verticalNavigation;
  root.userData.worldStudioEnvironment = STUDIO_ENVIRONMENTS[0];
  root.userData.worldStudioReviewPoints = [...STUDIO_REVIEW_CAMERAS, ...(architecture.reviewPoints ?? [])];
  root.userData.furnitureAnchors = architecture.root.userData.furnitureAnchors;
  const solids: StudioSolid[] = [...ground.solids, ...architecture.solids, ...vehicles.solids, ...interiors.solids];
  const breakableWindows: BreakableWindow[] = [];
  const shotSurfaces = solids.map((solid) => {
    const windowId = solid.material === 'glass' ? `world-studio-window:${solid.id}` : undefined;
    const surface = createBallisticSurface(`world-studio:${solid.id}`, solid.id, solid.bounds, { material: solid.material }, windowId);
    if (windowId && solid.mesh instanceof THREE.Mesh) {
      breakableWindows.push({ id: windowId, mesh: solid.mesh, broken: false });
      solid.mesh.userData.breakableWindowId = windowId;
      solid.mesh.userData.ballisticSurfaceId = surface.id;
      solid.mesh.userData.dynamic = true;
    }
    const ids = solid.mesh.userData.ballisticSurfaceIds ??= [];
    ids.push(surface.id);
    return surface;
  });
  // Intact panes join movement through the game's dynamic glass registry.
  // Keeping them in this static set would leave an invisible wall after a break.
  const physicsColliders = solids.filter(solid => solid.material !== 'glass').map(solid => solid.bounds);
  const raycastMeshes = [...new Set(solids.map(solid => solid.mesh))];
  root.userData.worldStudioBuild = Object.freeze({
    id: 'world-studio', version: '20260912-first-slice', solidCount: solids.length,
    architecture: architecture.root.userData.worldStudioArchitecture, nature: nature.stats,
  });
  let lastEnvironment: StudioEnvironment | undefined;
  const white = new THREE.Color(0xe8edf0);
  const surfaceBase = ground.surfaces.map(material => material.color.clone());
  scene.add(root);
  return {
    id: 'world-studio', label: 'Nuke Town · New World', root,
    colliders: physicsColliders, physicsColliders, raycastMeshes, shotSurfaces,
    spawns: { 0: studioSpawnPositions(0).map(p => new THREE.Vector3(...p)), 1: studioSpawnPositions(1).map(p => new THREE.Vector3(...p)) },
    patrolPoints: [
      [-33, 1.7, -11], [-33, 1.7, 23], [-12, 1.7, -14], [-12, 1.7, 22],
      [0, 1.7, -22], [0, 1.7, 20], [12, 1.7, -14], [12, 1.7, 22],
      [33, 1.7, -11], [33, 1.7, 23],
    ].map(p => new THREE.Vector3(p[0], p[1], p[2])),
    targets: [], houses: [], breakableWindows,
    physicalCover: vehicles.solids.map(s => ({ id: s.id, bounds: s.bounds, blocksMovement: true as const, blocksShots: true as const })),
    bounds: { ...STUDIO_BOUNDS }, physicsSafetyFloorY: 0,
    houseTelemetry: { houses: 2, groundRooms: 8, upperRooms: 8, doors: 12, windows: breakableWindows.length, ramps: architecture.verticalNavigation.ramps.length, wallMaterialVariants: 6, pbrMaterialFamilies: 10 },
    update(elapsed, dt, context) {
      const environment = (root.userData.worldStudioEnvironment ?? STUDIO_ENVIRONMENTS[0]) as StudioEnvironment;
      nature.update(elapsed, dt, context.cameraPosition, environment);
      snow.update(elapsed, context.cameraPosition, environment.snow, environment.wind);
      if (lastEnvironment !== environment) {
        ground.surfaces.forEach((material, i) => {
          material.color.copy(surfaceBase[i]!).lerp(white, environment.snow * .75);
          material.roughness = 1 - environment.wetness * .48;
        });
        lastEnvironment = environment;
      }
    },
  };
}
