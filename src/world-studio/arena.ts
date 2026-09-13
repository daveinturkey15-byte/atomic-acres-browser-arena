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
import { createStreetProps } from './prop-assets/street-props';
import { createStudioGardens } from './gardens';
import { createStudioBlenderAssets } from './blender-assets';
import { attachHousePresentation, type HousePresentationOptions } from './blender-presentation/houses';
import { createStudioLighting } from './lighting';
import { createStudioPbrLibrary } from './pbr-library';

/** A new arena with one authority root; never aliases or wraps an old map builder. */
export function buildWorldStudio(scene: THREE.Scene, housePresentationOptions?: HousePresentationOptions): ArenaMap {
  const root = new THREE.Group(); root.name = 'world-studio-authoritative-arena';
  const ground = createStudioGround();
  const architecture = createStudioArchitecture();
  const nature = createStudioNature();
  const snow = createStudioSnow();
  const vehicles = createStudioVehicles();
  const interiors = createStudioInteriors(architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[]);
  const gardens = createStudioGardens();
  // G3 street props: procedural poles/wires/sign/pillars, presentation-only
  // (prop-assets pattern) — no solids, so movement/shot authority is untouched.
  const streetProps = createStreetProps();
  root.add(ground.root, architecture.root, nature.root, snow.root, vehicles.root, interiors.root, gardens.root, streetProps.root);
  // These groups participate in asynchronous presentation swaps. The generic arena static batch
  // runs before house audits and hero-vehicle loads settle; marking the existing presentation
  // groups dynamic keeps it from baking hidden fallback meshes (and their owned materials/maps)
  // into an unowned copy that the per-asset lifecycle cannot retire. Collision and shot authority
  // remain in the solids built below; this flag is only the art-kit batching convention.
  architecture.root.userData.dynamic = true;
  vehicles.root.userData.dynamic = true;
  ground.root.userData.dynamic = true;
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
  // Blender house shells: presentation only. The root is attached now but stays invisible until
  // every shell has been decided; only a house whose load resolved AND audit passed is then
  // shown, and only that house's procedural art is hidden. Failure leaves procedural art.
  // Solids, colliders, shot surfaces, the dynamic glass registry, spawns and navigation above
  // are already final and are never derived from these meshes. Failure leaves procedural art.
  const housePresentation = attachHousePresentation({ architectureRoot: architecture.root, breakableWindows, raycastMeshes }, housePresentationOptions);
  // House GLBs may arrive before the global presentation batch and own their PBR resources until
  // the house lifecycle retires them. Keep both the pending shell and its eventual replacement
  // outside the generic static-batch copy path.
  housePresentation.root.userData.dynamic = true;
  root.add(housePresentation.root);
  root.userData.worldStudioHouseStatus = housePresentation.status();
  root.userData.worldStudioHousePresentation = housePresentation;
  // Lifecycle (wave 3, 2026-09-12): `retired` is the only terminal signal. Ordinary reparenting —
  // the staging detach in legacy-main constructArena, arena-cache moves, live adoption through
  // arenaVisualStream — must never dispose the loaders. Terminal retirement is explicit through
  // `root.userData.worldStudioRetire()`, called by the fenced retirement paths in legacy-main.
  let retired = false;
  let finalized = false;
  let retirePbr: (() => void) | null = null;
  let retireHeroes: (() => void) | null = null;
  let finalizeWorldStudioPresentation: (() => void) | null = null;
  const retireWorldStudioPresentation = (): (() => void) => {
    if (!retired) {
      retired = true;
      root.visible = false;
      housePresentation.root.visible = false;
      finalizeWorldStudioPresentation = () => {
        if (finalized) return;
        finalized = true;
        retirePbr?.();
        retireHeroes?.();
        housePresentation.dispose();
        root.userData.worldStudioHouseStatus = housePresentation.status();
      };
    }
    return finalizeWorldStudioPresentation!;
  };
  root.userData.worldStudioRetire = retireWorldStudioPresentation;
  root.userData.worldStudioIsRetired = (): boolean => retired;
  void housePresentation.ready.then(outcomes => {
    if (retired) {
      housePresentation.root.visible = false;
      return;
    }
    root.userData.worldStudioHouseStatus = housePresentation.status();
    root.userData.worldStudioHouseOutcomes = Object.fromEntries([...outcomes].map(([variant, outcome]) =>
      [variant, { substituted: outcome.substituted, reason: outcome.reason, glass: outcome.glass?.authority ?? null }]));
  });
  if (typeof window !== 'undefined') {
    const pbr = createStudioPbrLibrary();
    const originals = ground.surfaces.slice(0, 2).map(material => ({
      material, map: material.map, normalMap: material.normalMap, roughnessMap: material.roughnessMap,
    }));
    root.userData.worldStudioPbrStatus = 'loading';
    retirePbr = () => {
      // Restore originals before the arena disposer walks materials. The PBR
      // library releases its own clones; root disposal still owns the old maps.
      originals.forEach(({ material, ...maps }) => Object.assign(material, maps));
      pbr.dispose();
      root.userData.worldStudioPbrStatus = 'disposed';
    };
    void pbr.whenReady().then(() => {
      if (retired) return;
      ['asphalt_02', 'brushed_concrete_03'].forEach((id, index) => {
        // Ground UVs are already in two-metre units, including box faces.
        const consumer = pbr.createConsumer(id, { sizeMeters: [2, 2], normalScale: .5 });
        const material = ground.surfaces[index]!;
        material.map = consumer.material.map;
        material.normalMap = consumer.material.normalMap;
        material.roughnessMap = consumer.material.roughnessMap;
        material.normalScale.copy(consumer.material.normalScale);
        material.needsUpdate = true;
      });
      root.userData.worldStudioPbrStatus = 'ready';
    }).catch(error => {
      if (!retired) {
        pbr.dispose();
        root.userData.worldStudioPbrStatus = `failed: ${String(error)}`;
      }
    });
    const heroes = createStudioBlenderAssets({ headingRadians: Math.PI });
    heroes.root.userData.dynamic = true;
    root.userData.worldStudioBlenderStatus = 'loading';
    retireHeroes = () => {
      heroes.dispose();
      root.userData.worldStudioBlenderStatus = 'disposed';
    };
    void heroes.ready.then(() => {
      if (retired) return;
      // The procedural contract uses a -Z bus nose and +Z truck nose. The
      // Blender exports use +Z locally; the revised truck is centered on its
      // authored origin, aligned with the existing envelope without an offset.
      const truck = heroes.root.getObjectByName('world-studio-hero-truck');
      if (truck) { truck.rotation.y = 0; truck.position.z = -2.0; }
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
      if (!retired) {
        heroes.dispose();
        root.userData.worldStudioBlenderStatus = `failed: ${String(error)}`;
        console.error('World Studio Blender assets failed to load', error);
      }
    });
  }
  root.userData.worldStudioBuild = Object.freeze({
    id: 'world-studio', version: '20260912-first-slice', solidCount: solids.length,
    architecture: architecture.root.userData.worldStudioArchitecture, nature: nature.stats, gardens: gardens.stats,
    streetProps: streetProps.stats,
  });
  let lastEnvironment: StudioEnvironment | undefined;
  const white = new THREE.Color(0xe8edf0);
  const surfaceBase = ground.surfaces.map(material => material.color.clone());
  scene.add(root);
  return {
    id: 'world-studio', label: 'Atomic Acres - New World', root,
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
