/**
 * HF-571 world-studio vehicles entry point.
 *
 * Three authored vehicles for the fresh world: the rounded yellow school bus and the red
 * long-nose tractor with its white ribbed box trailer on the central road, facing opposite
 * directions, and a classic car parked in the teal driveway. Bodies are lofted by the
 * in-repo vehicle forge (`src/vehicle-forge`) from new specs; the trailer, chassis and the
 * small attached trim are authored parts in the same material buckets. Every placement is
 * baked into WORLD coordinates and folded into one mesh per material, so the returned root
 * sits at the origin with no enclosing transform.
 *
 * Solids are the exact blocking boxes for the visible mass: body shells, wheels, chassis,
 * tanks and the trailer box, each a world-coordinate `Box2` with explicit minY/maxY. The
 * trailer is a full solid in this first slice; there is no transverse passage yet.
 */

import * as THREE from 'three';
import type { BallisticMaterialId } from '../../ballistics';
import type { Box2 } from '../../collision';
import {
  buildForgedVehicle,
  buildForgedWheelSet,
  createForgeMaterialSet,
  createForgeSharedMaterials,
  mergeForgedPlacements,
  type ForgedPlacement,
  type ForgedVehicleMaterials,
} from '../../vehicle-forge';
import { BUS_DRESSING, CAR_DRESSING, TRACTOR_DRESSING, busExtras, carExtras, truckExtras } from './dressing';
import { PartSink } from './parts';
import {
  BUS_HALF_WIDTH,
  BUS_HEIGHT,
  BUS_LENGTH,
  BUS_SPEC,
  CAR_HALF_WIDTH,
  CAR_HEIGHT,
  CAR_LENGTH,
  CAR_SPEC,
  STUDIO_VEHICLE_PLACEMENTS,
  TRACTOR_HEIGHT,
  TRACTOR_LENGTH,
  TRACTOR_REAR_AXLE_Z,
  TRACTOR_SPEC,
  TRAILER_AXLE_Z,
  TRAILER_FLOOR_Y,
  TRAILER_HEIGHT,
  TRAILER_Z0,
  TRAILER_Z1,
  TRUCK_HALF_WIDTH,
  TRUCK_LENGTH,
} from './specs';

export {
  BUS_SPEC,
  CAR_SPEC,
  STUDIO_VEHICLE_PLACEMENTS,
  TRACTOR_SPEC,
  TRAILER_HEIGHT,
  TRUCK_LENGTH,
} from './specs';

export type StudioVehicleSolid = { id: string; mesh: THREE.Object3D; bounds: Box2; material: BallisticMaterialId };

export type StudioVehicles = {
  root: THREE.Group;
  solids: Array<StudioVehicleSolid>;
};

/** Paint palette (sRGB). Kept off the saturated end per the brief. */
export const STUDIO_VEHICLE_PAINT = Object.freeze({
  bus: 0xe9b42a,
  busAccent: 0x1c1b19,
  tractor: 0xa8301f,
  tractorAccent: 0x2b2624,
  trailer: 0xe6e3da,
  car: 0x9fb4c3,
  carAccent: 0xf1ede2,
});

type Placement = Readonly<{ centreX: number; noseZ: number; yaw: number }>;
type Vec3 = readonly [number, number, number];

/** Vehicle-frame box -> world-coordinate `Box2` through the placement's yaw (multiples of PI only). */
function worldBox(placement: Placement, min: Vec3, max: Vec3): Box2 {
  const cos = Math.round(Math.cos(placement.yaw));
  const sin = Math.round(Math.sin(placement.yaw));
  const corners = [
    [min[0], min[2]], [max[0], min[2]], [min[0], max[2]], [max[0], max[2]],
  ].map(([x, z]) => [
    placement.centreX + x * cos + z * sin,
    placement.noseZ - x * sin + z * cos,
  ]);
  return {
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minZ: Math.min(...corners.map((c) => c[1])),
    maxZ: Math.max(...corners.map((c) => c[1])),
    minY: min[1],
    maxY: max[1],
  };
}

type PendingSolid = { id: string; paint: THREE.Material; bounds: Box2; material: BallisticMaterialId };

function wheelSolids(
  out: PendingSolid[],
  id: string,
  placement: Placement,
  paint: THREE.Material,
  axleZ: readonly number[],
  trackHalfWidth: number,
  tyreHalfWidth: number,
  radius: number,
): void {
  axleZ.forEach((z, axle) => {
    for (const side of [1, -1] as const) {
      const x0 = side * trackHalfWidth - tyreHalfWidth;
      const x1 = side * trackHalfWidth + tyreHalfWidth;
      out.push({
        id: `${id}-wheel-${axle}-${side > 0 ? 'r' : 'l'}`,
        paint,
        material: 'vehicle',
        bounds: worldBox(placement, [Math.min(x0, x1), 0, z - radius], [Math.max(x0, x1), radius * 2, z + radius]),
      });
    }
  });
}

/**
 * Builds the world-studio vehicle set. One call owns one forge material set; release the
 * generated materials through `root.userData.dispose()` when the arena unloads.
 */
export function createStudioVehicles(): StudioVehicles {
  const root = new THREE.Group();
  root.name = 'world-studio-vehicles';

  const shared = createForgeSharedMaterials();
  const paints = STUDIO_VEHICLE_PAINT;
  const busMaterials = createForgeMaterialSet(paints.bus, 'world-studio-bus', paints.busAccent, 0.24, shared);
  const tractorMaterials = createForgeMaterialSet(paints.tractor, 'world-studio-tractor', paints.tractorAccent, 0.22, shared);
  const trailerMaterials = createForgeMaterialSet(paints.trailer, 'world-studio-trailer', paints.trailer, 0.42, shared);
  const carMaterials = createForgeMaterialSet(paints.car, 'world-studio-car', paints.carAccent, 0.2, shared);
  const materialSets: ForgedVehicleMaterials[] = [busMaterials, tractorMaterials, trailerMaterials, carMaterials];

  const bus = STUDIO_VEHICLE_PLACEMENTS.bus;
  const truck = STUDIO_VEHICLE_PLACEMENTS.truck;
  const car = STUDIO_VEHICLE_PLACEMENTS.car;
  const placements: ForgedPlacement[] = [];
  const pending: PendingSolid[] = [];

  // ---- School bus ----
  placements.push({ built: buildForgedVehicle(BUS_SPEC, BUS_DRESSING, busMaterials), x: bus.centreX, z: bus.noseZ, yaw: bus.yaw });
  const busParts = new PartSink();
  busExtras(busParts);
  placements.push({ built: busParts.build('bus', busMaterials), x: bus.centreX, z: bus.noseZ, yaw: bus.yaw });
  pending.push(
    { id: 'bus-body', paint: busMaterials.paint, material: 'vehicle', bounds: worldBox(bus, [-BUS_HALF_WIDTH, BUS_SPEC.sillY, 0], [BUS_HALF_WIDTH, BUS_HEIGHT, BUS_LENGTH]) },
    { id: 'bus-underbody', paint: busMaterials.paint, material: 'vehicle', bounds: worldBox(bus, [-1.05, 0.26, 2.1], [1.05, BUS_SPEC.sillY, 6.9]) },
    { id: 'bus-front-bumper', paint: busMaterials.paint, material: 'thin-metal', bounds: worldBox(bus, [-1.2, 0.38, -0.08], [1.2, 0.62, 0.02]) },
    { id: 'bus-rear-bumper', paint: busMaterials.paint, material: 'thin-metal', bounds: worldBox(bus, [-1.2, 0.38, BUS_LENGTH - 0.02], [1.2, 0.62, BUS_LENGTH + 0.08]) },
  );
  wheelSolids(pending, 'bus', bus, busMaterials.paint, BUS_SPEC.wheelZ, BUS_SPEC.trackHalfWidth, BUS_SPEC.tyreHalfWidth + 0.02, BUS_SPEC.wheelRadius);

  // ---- Tractor unit + trailer ----
  placements.push({ built: buildForgedVehicle(TRACTOR_SPEC, TRACTOR_DRESSING, tractorMaterials), x: truck.centreX, z: truck.noseZ, yaw: truck.yaw });
  placements.push({
    built: buildForgedWheelSet('world-studio-trailer-bogie', 0.53, 0.17, 1.2, [...TRAILER_AXLE_Z], 'steel', trailerMaterials, {
      contactShadow: true,
      contactSpan: { z0: 0.4, z1: TRUCK_LENGTH - 0.4 },
    }),
    x: truck.centreX,
    z: truck.noseZ,
    yaw: truck.yaw,
  });
  const truckParts = new PartSink();
  truckExtras(truckParts);
  placements.push({ built: truckParts.build('truck', trailerMaterials), x: truck.centreX, z: truck.noseZ, yaw: truck.yaw });
  const hoodTop = TRACTOR_SPEC.top[2]!.yTop;
  pending.push(
    { id: 'tractor-hood', paint: tractorMaterials.paint, material: 'vehicle', bounds: worldBox(truck, [-1.18, TRACTOR_SPEC.sillY, 0], [1.18, hoodTop, 2.3]) },
    { id: 'tractor-cab', paint: tractorMaterials.paint, material: 'vehicle', bounds: worldBox(truck, [-TRUCK_HALF_WIDTH, TRACTOR_SPEC.sillY, 2.3], [TRUCK_HALF_WIDTH, TRACTOR_HEIGHT, TRACTOR_LENGTH]) },
    { id: 'tractor-front-bumper', paint: tractorMaterials.paint, material: 'thin-metal', bounds: worldBox(truck, [-1.3, 0.46, -0.1], [1.3, 0.74, 0.02]) },
    { id: 'tractor-chassis', paint: trailerMaterials.paint, material: 'structural-metal', bounds: worldBox(truck, [-0.55, 0.7, 2.2], [0.55, 1.2, 8.6]) },
    { id: 'tractor-fuel-tank-r', paint: trailerMaterials.paint, material: 'thin-metal', bounds: worldBox(truck, [TRUCK_HALF_WIDTH - 0.7, 0.52, 3.2], [TRUCK_HALF_WIDTH, 1.18, 5.3]) },
    { id: 'tractor-fuel-tank-l', paint: trailerMaterials.paint, material: 'thin-metal', bounds: worldBox(truck, [-TRUCK_HALF_WIDTH, 0.52, 3.2], [-(TRUCK_HALF_WIDTH - 0.7), 1.18, 5.3]) },
    { id: 'trailer-box', paint: trailerMaterials.paint, material: 'container', bounds: worldBox(truck, [-TRUCK_HALF_WIDTH, TRAILER_FLOOR_Y - 0.16, TRAILER_Z0 - 0.28], [TRUCK_HALF_WIDTH, TRAILER_HEIGHT, TRAILER_Z1 + 0.05]) },
    { id: 'trailer-belly-box', paint: trailerMaterials.paint, material: 'container', bounds: worldBox(truck, [-TRUCK_HALF_WIDTH + 0.2, 0.3, TRACTOR_REAR_AXLE_Z[1]! + 0.7], [TRUCK_HALF_WIDTH - 0.2, TRAILER_FLOOR_Y - 0.16, TRAILER_AXLE_Z[0]! - 0.7]) },
    { id: 'trailer-icc-bar', paint: trailerMaterials.paint, material: 'structural-metal', bounds: worldBox(truck, [-TRUCK_HALF_WIDTH + 0.15, 0.5, TRAILER_Z1 - 0.12], [TRUCK_HALF_WIDTH - 0.15, TRAILER_FLOOR_Y, TRAILER_Z1 - 0.02]) },
    { id: 'trailer-landing-gear-r', paint: trailerMaterials.paint, material: 'structural-metal', bounds: worldBox(truck, [0.82, 0.16, TRAILER_Z0 + 1.12], [1.1, TRAILER_FLOOR_Y, TRAILER_Z0 + 1.4]) },
    { id: 'trailer-landing-gear-l', paint: trailerMaterials.paint, material: 'structural-metal', bounds: worldBox(truck, [-1.1, 0.16, TRAILER_Z0 + 1.12], [-0.82, TRAILER_FLOOR_Y, TRAILER_Z0 + 1.4]) },
  );
  wheelSolids(pending, 'tractor', truck, tractorMaterials.paint, TRACTOR_SPEC.wheelZ, TRACTOR_SPEC.trackHalfWidth, TRACTOR_SPEC.tyreHalfWidth + 0.02, TRACTOR_SPEC.wheelRadius);
  // Tandem and trailer bogie: one box per side spanning both axles, tyre tops to the floor.
  for (const [id, axles] of [['tractor-tandem', TRACTOR_REAR_AXLE_Z], ['trailer-bogie', TRAILER_AXLE_Z]] as const) {
    for (const side of [1, -1] as const) {
      const x0 = side * 1.2 - 0.2;
      const x1 = side * 1.2 + 0.2;
      pending.push({
        id: `${id}-${side > 0 ? 'r' : 'l'}`,
        paint: trailerMaterials.paint,
        material: 'vehicle',
        bounds: worldBox(truck, [Math.min(x0, x1), 0, axles[0]! - 0.6], [Math.max(x0, x1), TRAILER_FLOOR_Y - 0.16, axles[1]! + 0.6]),
      });
    }
  }

  // ---- Classic car ----
  placements.push({ built: buildForgedVehicle(CAR_SPEC, CAR_DRESSING, carMaterials), x: car.centreX, z: car.noseZ, yaw: car.yaw });
  const carParts = new PartSink();
  carExtras(carParts);
  placements.push({ built: carParts.build('car', carMaterials), x: car.centreX, z: car.noseZ, yaw: car.yaw });
  pending.push(
    { id: 'car-body', paint: carMaterials.paint, material: 'vehicle', bounds: worldBox(car, [-CAR_HALF_WIDTH, CAR_SPEC.sillY, 0], [CAR_HALF_WIDTH, CAR_HEIGHT, CAR_LENGTH]) },
    { id: 'car-front-bumper', paint: carMaterials.paint, material: 'thin-metal', bounds: worldBox(car, [-0.8, 0.32, -0.08], [0.8, 0.5, 0.02]) },
    { id: 'car-rear-bumper', paint: carMaterials.paint, material: 'thin-metal', bounds: worldBox(car, [-0.8, 0.32, CAR_LENGTH - 0.02], [0.8, 0.5, CAR_LENGTH + 0.08]) },
  );
  wheelSolids(pending, 'car', car, carMaterials.paint, CAR_SPEC.wheelZ, CAR_SPEC.trackHalfWidth, CAR_SPEC.tyreHalfWidth + 0.015, CAR_SPEC.wheelRadius);

  // ---- Bake and merge: one mesh per material, world space ----
  const merged = mergeForgedPlacements(placements, 'world-studio-vehicles');
  for (const mesh of merged.meshes) root.add(mesh);
  const meshByMaterial = new Map<THREE.Material, THREE.Mesh>();
  for (const mesh of merged.meshes) meshByMaterial.set(mesh.material as THREE.Material, mesh);

  const solids: StudioVehicleSolid[] = pending.map((solid) => {
    const mesh = meshByMaterial.get(solid.paint);
    if (!mesh) throw new Error(`world-studio vehicles: solid '${solid.id}' has no merged paint mesh`);
    return { id: solid.id, mesh, bounds: solid.bounds, material: solid.material };
  });

  root.userData.worldStudioVehicles = Object.freeze({
    version: 'hf571-world-studio-vehicles-v1',
    vehicles: ['bus', 'truck', 'car'],
    solidCount: solids.length,
    drawGroupCount: merged.drawCalls,
    triangleCount: merged.triangles,
    skins: merged.skins.map((skin) => ({ ...skin })),
    trailerPassage: 'none: full solid first slice',
  });
  root.userData.dispose = (): void => {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    for (const set of materialSets) {
      set.paint.dispose();
      set.accent.dispose();
    }
    for (const material of Object.values(shared)) material.dispose();
  };

  return { root, solids };
}

/** Triangle census used by the authoring budget checks. */
export function countVehicleTriangles(object: THREE.Object3D): number {
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
