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
import { createStudioGardens } from './gardens';
import { createStudioBlenderAssets } from './blender-assets';
import { createStudioLighting } from './lighting';

/** A new arena with one authority root; never aliases or wraps an old map builder. */
export function buildWorldStudio(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group(); root.name = 'world-studio-authoritative-arena';
  const ground = createStudioGround();
  const architecture = createStudioArchitecture();
  const nature = createStudioNature();
  const snow = createStudioSnow();
  const vehicles = createStudioVehicles();
  const interiors = createStudioInteriors(architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[]);
  const gardens = createStudioGardens();
  root.add(ground.root, architecture.root, nature.root, snow.root, vehicles.root, interiors.root, gardens.root);
  root.userData.verticalNavigation = architecture.verticalNavigation;
  root.userData.worldStudioEnvironment = STUDIO_ENVIRONMENTS[0];
  root.userData.worldStudioReviewPoints = [...STUDIO_REVIEW_CAMERAS, ...(architecture.reviewPoints ?? []), ...gardens.reviewPoints];
  root.userData.furnitureAnchors = architecture.root.userData.furnitureAnchors;
  const lighting = createStudioLighting({ root, scene: root,
    anchors: architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[], mode: 'presentation' });
  const solids: StudioSolid[] = [...ground.solids, ...architecture.solids, ...vehicles.solids, ...interiors.solids, ...gardens.solids];
  const breakableWindows: BreakableWindow[] = [];
  const shotSurfaces = solids.map((solid) => {
    const windowId = solid.material === 'glass' ? `world-studio-window:${solid.id.toLowerCase()}` : undefined;
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
  // Bots use authored ramp elevations; their horizontal solver must not
  // collide with each rise before reaching that ramp. Player physics and
  // shared LOS/shot authority retain every physical tread unchanged.
  root.userData.worldStudioBotStepColliders = new Set(solids
    .filter(solid => /-house-(?:ext-)?stair-\d+$/.test(solid.id))
    .map(solid => solid.bounds));
  const raycastMeshes = [...new Set(solids.map(solid => solid.mesh))];
  if (typeof window !== 'undefined') {
    const heroes = createStudioBlenderAssets({ headingRadians: Math.PI });
    root.userData.worldStudioBlenderStatus = 'loading';
    void heroes.ready.then(() => {
      if (root.parent !== scene) { heroes.dispose(); return; }
      // The procedural contract uses a -Z bus nose and +Z truck nose. The
      // Blender exports use +Z locally; center the truck's authored asymmetric
      // frame on its existing road envelope without changing physics.
      const truck = heroes.root.getObjectByName('world-studio-hero-truck');
      if (truck) { truck.rotation.y = 0; truck.position.z = -2.41375; }
      root.add(heroes.root);
      heroes.root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true; object.receiveShadow = true;
        raycastMeshes.push(object);
      });
      vehicles.root.traverse(object => {
        if (object.userData.studioVehicle === 'bus' || object.userData.studioVehicle === 'truck') object.visible = false;
      });
      root.userData.worldStudioBlenderStatus = 'ready';
    }).catch(error => {
      heroes.dispose();
      root.userData.worldStudioBlenderStatus = `failed: ${String(error)}`;
      console.error('World Studio Blender assets failed to load', error);
    });
  }
  root.userData.worldStudioBuild = Object.freeze({
    id: 'world-studio', version: '20260912-first-slice', solidCount: solids.length,
    architecture: architecture.root.userData.worldStudioArchitecture, nature: nature.stats, gardens: gardens.stats,
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
      lighting.update();
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
