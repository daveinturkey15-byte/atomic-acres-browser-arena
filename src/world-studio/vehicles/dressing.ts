/**
 * HF-571 world-studio vehicles: forge dressings and authored extras per vehicle.
 *
 * Forge dressings (lamps, grille, mirrors, rub rails, pillars, plates) drive the lofted
 * bodies. Authored extras fill what the loft cannot: the ribbed box trailer, chassis rails,
 * fuel tanks, fifth wheel, roof marker lamps, the bus stop arm and the car's chrome spear.
 * All numbers are in each vehicle's own frame (nose at z = 0, +x right when facing +z).
 */
import type { VehicleDressing } from '../../vehicle-forge';
import type { PartSink } from './parts';
import {
  BUS_LENGTH,
  BUS_SPEC,
  CAR_LENGTH,
  CAR_SPEC,
  TRACTOR_REAR_AXLE_Z,
  TRACTOR_SPEC,
  TRAILER_AXLE_Z,
  TRAILER_FLOOR_Y,
  TRAILER_HEIGHT,
  TRAILER_Z0,
  TRAILER_Z1,
  TRUCK_HALF_WIDTH,
} from './specs';

/** Black rub rails, a chrome hood grille, split screen pillars and the twin rear lamps. */
export const BUS_DRESSING: VehicleDressing = Object.freeze<VehicleDressing>({
  wheelStyle: 'steel',
  headLamps: { x: 0.92, y: 1.12, radius: 0.13 },
  tailLamps: { x: 0.98, y: 1.15, radius: 0.15 },
  bumperY: 0.5,
  // School-bus signature: three black rub rails riding the flank below the window band.
  surfaceBands: [
    { y0: 0.78, y1: 0.86, bucket: 'accent', z0: 2.0, z1: 9.6, proud: 0.012 },
    { y0: 1.26, y1: 1.34, bucket: 'accent', z0: 2.0, z1: 9.6, proud: 0.012 },
    { y0: 1.82, y1: 1.9, bucket: 'accent', z0: 2.55, z1: 9.6, proud: 0.012 },
  ],
  grille: { y: 1.18, width: 1.3, height: 0.44, depth: 0.1, barCount: 7 },
  mirrors: [{ x: 1.46, y: 2.25, z: 1.85 }],
  roofRails: { x: [0.9, -0.9], z0: 2.6, z1: 9.4, bucket: 'chrome' },
  doorHandles: { y: 1.3, z: [2.45] },
  hubcaps: true,
  // Window pillars split the 6.8 m glass band into school-bus sash bays.
  pillars: { z: [3.4, 4.25, 5.1, 5.95, 6.8, 7.65, 8.5], y0: 1.92, y1: 2.75 },
  vents: { x: 0.0, z: [4.6, 7.4] },
  plates: { y: 0.72 },
  indicators: { y: 1.5, x: 1.0 },
  detail: {
    coach: {
      windscreen: { y0: 1.95, y1: 2.72, halfWidth: 1.15 },
      destinationBoard: { y: 2.88, width: 1.5, height: 0.2 },
      fogLamps: { x: 0.55, y: 0.78, width: 0.16, height: 0.12 },
      rearLouvers: { y0: 0.9, y1: 1.05, count: 2, halfWidth: 0.5 },
      skirt: { y: 0.58, height: 0.06, z0: 2.2, z1: 9.4 },
      luggageDoor: { y0: 0.7, y1: 1.7, z: 9.75, width: 1.6 },
      rearPlate: { y: 0.72, width: 0.34, height: 0.1 },
    },
  },
  underbody: { y0: 0.26, y1: BUS_SPEC.sillY - 0.01, insetM: 0.25 },
  contactShadow: true,
});

/** Roof marker lamps, hood ornament, stop arm, rear ladder rungs and a crossing gate. */
export function busExtras(sink: PartSink): void {
  const roofY = 3.12;
  // Four amber markers at the front roof edge and four red at the rear (school-bus code).
  for (const [offset, kind, z, facing] of [
    [0.55, 'headLamp', 2.15, -1], [0.2, 'headLamp', 2.02, -1],
    [0.55, 'tailLamp', BUS_LENGTH - 0.18, 1], [0.2, 'tailLamp', BUS_LENGTH - 0.08, 1],
  ] as const) {
    for (const side of [1, -1] as const) {
      sink.box('chrome', 'roof-marker-housing', [side * offset - 0.07, roofY - 0.2, z - 0.05], [side * offset + 0.07, roofY, z + 0.05]);
      sink.box(kind, 'roof-marker-lens', [side * offset - 0.05, roofY - 0.17, z + (facing > 0 ? 0.05 : -0.058)],
        [side * offset + 0.05, roofY - 0.03, z + (facing > 0 ? 0.058 : -0.05)]);
    }
  }
  // Stop arm folded against the left flank behind the driver's window.
  sink.box('accent', 'stop-arm-plate', [-1.42, 1.95, 3.15], [-1.4, 2.4, 3.6]);
  sink.box('chrome', 'stop-arm-hinge', [-1.44, 1.9, 3.12], [-1.39, 2.45, 3.18]);
  // Rear emergency-door outline: proud frame and a handle bar.
  sink.box('accent', 'rear-door-frame', [-0.6, 0.62, BUS_LENGTH - 0.03], [0.6, 0.66, BUS_LENGTH + 0.02]);
  sink.boxPair('accent', 'rear-door-frame', [0.56, 0.62, BUS_LENGTH - 0.03], [0.6, 2.62, BUS_LENGTH + 0.02]);
  sink.box('accent', 'rear-door-frame', [-0.6, 2.58, BUS_LENGTH - 0.03], [0.6, 2.62, BUS_LENGTH + 0.02]);
  sink.box('chrome', 'rear-door-handle', [-0.2, 1.36, BUS_LENGTH + 0.005], [0.2, 1.4, BUS_LENGTH + 0.04]);
  // Hood ornament and a chrome bonnet strip down the hood centreline.
  sink.box('chrome', 'hood-strip', [-0.02, 1.87, 0.25], [0.02, 1.9, 1.5]);
  // Wing-mounted crossing gate on the front bumper (right side), folded.
  sink.box('chrome', 'crossing-gate', [0.7, 0.52, -0.06], [1.45, 0.56, -0.02]);
  // Mud flaps behind each rear wheel.
  sink.boxPair('tyre', 'mud-flap', [1.05, 0.12, 8.05], [1.38, 0.55, 8.08]);
  sink.boxPair('tyre', 'mud-flap', [1.05, 0.12, 2.12], [1.38, 0.55, 2.15]);
}

/** A tall chrome radiator, split screen, tandem-ready cab and West Coast mirrors. */
export const TRACTOR_DRESSING: VehicleDressing = Object.freeze<VehicleDressing>({
  wheelStyle: 'steel',
  extraWheelZ: [...TRACTOR_REAR_AXLE_Z],
  headLamps: { x: 0.88, y: 1.22, radius: 0.13 },
  bumperY: 0.6,
  // Chrome moulding along the hood shoulder and a dark sun visor band over the screen.
  stripe: { y: 1.98, bucket: 'chrome', z0: 0.2, z1: 2.15, height: 0.04, proud: 0.014 },
  surfaceBands: [{ y0: 3.2, y1: 3.42, bucket: 'accent', z0: 2.45, z1: 2.9, proud: 0.03 }],
  grille: { y: 1.3, width: 1.5, height: 0.9, depth: 0.1, barCount: 12 },
  mirrors: [{ x: 1.6, y: 2.45, z: 2.75 }],
  doorHandles: { y: 1.55, z: [3.9] },
  hubcaps: true,
  vents: { x: 0.0, z: [3.9] },
  plates: { y: 0.78 },
  indicators: { y: 1.7, x: 1.05 },
  underbody: { y0: 0.28, y1: TRACTOR_SPEC.sillY - 0.01, insetM: 0.25 },
});

/** Tractor chassis, twin stacks, fuel tanks, the box trailer and its running gear. */
export function truckExtras(sink: PartSink): void {
  const hw = TRUCK_HALF_WIDTH;
  // Chassis rails from under the cab to the trailer's rear, and the fifth-wheel plate.
  sink.boxPair('lining', 'chassis-rail', [0.42, 0.72, 2.2], [0.54, 1.02, 8.6]);
  sink.box('lining', 'chassis-cross', [-0.54, 0.74, 8.5], [0.54, 1.0, 8.6]);
  sink.box('lining', 'fifth-wheel', [-0.55, 1.02, 6.3], [0.55, 1.2, 7.4]);
  // Cylindrical fuel tanks with chrome straps under each cab door.
  sink.cylinder('chrome', 'fuel-tank', 'z', [hw - 0.38, 0.85, 4.5], 0.3, 1.5, 14);
  sink.cylinder('chrome', 'fuel-tank', 'z', [-(hw - 0.38), 0.85, 4.5], 0.3, 1.5, 14);
  sink.boxPair('lining', 'tank-strap', [hw - 0.7, 0.52, 4.05], [hw - 0.06, 1.18, 4.09]);
  sink.boxPair('lining', 'tank-strap', [hw - 0.7, 0.52, 4.95], [hw - 0.06, 1.18, 4.99]);
  // Cab steps under the doors.
  sink.boxPair('lining', 'cab-step', [hw - 0.5, 0.34, 3.2], [hw + 0.05, 0.4, 3.85]);
  // Twin chrome exhaust stacks behind the cab with heat shields.
  for (const side of [1, -1] as const) {
    sink.cylinder('chrome', 'exhaust-stack', 'y', [side * (hw - 0.2), 2.3, 5.35], 0.07, 2.6, 10);
    sink.box('lining', 'stack-shield', [side * (hw - 0.3) - (side > 0 ? 0 : 0.2), 1.2, 5.24], [side * (hw - 0.3) + (side > 0 ? 0.2 : 0), 2.6, 5.46]);
  }
  // Long-nose signature: chrome bonnet strip and a bulldog-style ornament on the hood.
  sink.box('chrome', 'hood-strip', [-0.025, 2.03, 0.15], [0.025, 2.065, 2.1]);
  sink.box('chrome', 'hood-ornament', [-0.05, 2.06, 0.22], [0.05, 2.2, 0.36]);
  // Air horns on the cab roof and a marker rail.
  for (const x of [0.5, -0.5]) sink.cylinder('chrome', 'air-horn', 'z', [x, 3.6, 3.7], 0.06, 0.5, 8, 0.04);
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) {
    sink.box('headLamp', 'cab-marker', [x - 0.05, 3.5, 2.62], [x + 0.05, 3.57, 2.7]);
  }

  // ---------------- Box trailer ----------------
  const z0 = TRAILER_Z0;
  const z1 = TRAILER_Z1;
  const y0 = TRAILER_FLOOR_Y;
  const y1 = TRAILER_HEIGHT;
  const wall = hw - 0.02;
  // Body shell (white paint), floor deck and roof cap.
  sink.box('paint', 'trailer-body', [-wall, y0, z0], [wall, y1 - 0.02, z1]);
  sink.box('lining', 'trailer-floor', [-hw, y0 - 0.16, z0 + 0.1], [hw, y0, z1 - 0.05]);
  sink.box('paint', 'trailer-roof', [-hw, y1 - 0.02, z0], [hw, y1, z1]);
  // Vertical corrugation ribs every 250 mm along both flanks.
  for (let z = z0 + 0.25; z < z1 - 0.3; z += 0.25) {
    sink.boxPair('paint', 'trailer-rib', [wall, y0 + 0.18, z - 0.04], [wall + 0.018, y1 - 0.14, z + 0.04]);
  }
  // Top and bottom rails in bare aluminium, plus a lower rub rail at 1.05 above the floor.
  sink.boxPair('chrome', 'trailer-top-rail', [wall - 0.02, y1 - 0.14, z0], [wall + 0.03, y1 - 0.06, z1]);
  sink.boxPair('chrome', 'trailer-bottom-rail', [wall - 0.02, y0, z0], [wall + 0.03, y0 + 0.16, z1]);
  sink.boxPair('chrome', 'trailer-rub-rail', [wall, y0 + 1.0, z0 + 0.2], [wall + 0.025, y0 + 1.08, z1 - 0.2]);
  // Front bulkhead corner posts and a nose-mounted refrigeration blank.
  sink.boxPair('chrome', 'trailer-corner-post', [wall - 0.04, y0, z0 - 0.02], [wall + 0.03, y1, z0 + 0.06]);
  sink.box('lining', 'trailer-nose-unit', [-0.9, y0 + 1.4, z0 - 0.28], [0.9, y1 - 0.4, z0]);
  // Rear doors: two panels, three hinges each, twin vertical lock bars with handles.
  for (const side of [1, -1] as const) {
    const inner = side > 0 ? 0.03 : -wall + 0.03;
    const outer = side > 0 ? wall - 0.03 : -0.03;
    sink.box('paint', 'trailer-door', [Math.min(inner, outer), y0 + 0.08, z1 - 0.01], [Math.max(inner, outer), y1 - 0.1, z1 + 0.02]);
    for (const y of [y0 + 0.4, y0 + 1.35, y0 + 2.3]) {
      sink.box('chrome', 'trailer-hinge', [side * (wall - 0.1) - 0.05, y, z1], [side * (wall - 0.1) + 0.05, y + 0.14, z1 + 0.05]);
    }
    const bar = side * 0.45;
    sink.cylinder('chrome', 'trailer-lock-bar', 'y', [bar, (y0 + y1) / 2, z1 + 0.045], 0.02, y1 - y0 - 0.3, 8);
    sink.box('chrome', 'trailer-lock-handle', [bar - 0.03, y0 + 1.15, z1 + 0.03], [bar + 0.03, y0 + 1.19, z1 + 0.34]);
  }
  sink.box('lining', 'trailer-door-gap', [-0.03, y0 + 0.08, z1 - 0.005], [0.03, y1 - 0.1, z1 + 0.015]);
  // ICC rear under-run bar, bumper uprights and mud flaps.
  sink.box('lining', 'trailer-icc-bar', [-hw + 0.15, 0.5, z1 - 0.12], [hw - 0.15, 0.62, z1 - 0.02]);
  sink.boxPair('lining', 'trailer-icc-upright', [0.5, 0.5, z1 - 0.12], [0.6, y0, z1 - 0.02]);
  sink.boxPair('tyre', 'trailer-mud-flap', [0.85, 0.12, TRAILER_AXLE_Z[1] + 0.62], [1.33, 0.7, TRAILER_AXLE_Z[1] + 0.65]);
  // Trailer bogie frame and landing gear.
  sink.boxPair('lining', 'trailer-bogie-rail', [0.42, 0.72, TRAILER_AXLE_Z[0] - 1.0], [0.54, y0, TRAILER_AXLE_Z[1] + 0.8]);
  sink.boxPair('lining', 'landing-leg', [0.9, 0.22, z0 + 1.2], [1.02, y0, z0 + 1.32]);
  sink.boxPair('lining', 'landing-foot', [0.82, 0.16, z0 + 1.12], [1.1, 0.24, z0 + 1.4]);
  // Belly storage box between the tractor tandem and the trailer bogie: the visible mass
  // behind the trailer's full-solid first-slice collider (no transverse passage yet).
  sink.box('lining', 'trailer-belly-box', [-hw + 0.2, 0.3, TRACTOR_REAR_AXLE_Z[1] + 0.7], [hw - 0.2, y0 - 0.16, TRAILER_AXLE_Z[0] - 0.7]);
  sink.boxPair('chrome', 'trailer-belly-latch', [0.3, 0.7, TRACTOR_REAR_AXLE_Z[1] + 0.68], [0.42, 0.78, TRACTOR_REAR_AXLE_Z[1] + 0.7]);
  // Twin round tail lamps per side plus amber side markers and rear reflectors.
  for (const side of [1, -1] as const) {
    for (const y of [0.78, 1.05]) sink.roundLamp('trailer-tail', 'tailLamp', [side * (hw - 0.32), y, z1 - 0.02], 0.09, 1);
    for (const z of [z0 + 0.4, z0 + 2.9, z0 + 5.4, z1 - 0.4]) {
      sink.box('headLamp', 'trailer-side-marker', [side * wall - (side > 0 ? 0 : 0.02), y0 + 1.15, z - 0.06], [side * wall + (side > 0 ? 0.02 : 0), y0 + 1.21, z + 0.06]);
    }
  }
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) {
    sink.box('tailLamp', 'trailer-roof-marker', [x - 0.05, y1 - 0.09, z1], [x + 0.05, y1 - 0.03, z1 + 0.02]);
  }
}

/** Chrome bumpers, whitewalls, a chrome side spear and fender-top lamps. */
export const CAR_DRESSING: VehicleDressing = Object.freeze<VehicleDressing>({
  wheelStyle: 'whitewall',
  headLamps: { x: 0.6, y: 0.74, radius: 0.1 },
  tailLamps: { x: 0.62, y: 0.76, radius: 0.085 },
  bumperY: 0.4,
  stripe: { y: 0.84, bucket: 'chrome', z0: 0.35, z1: CAR_LENGTH - 0.3, height: 0.05, proud: 0.014 },
  grille: { y: 0.64, width: 1.08, height: 0.24, depth: 0.1, barCount: 4 },
  mirrors: [{ x: 0.84, y: 1.14, z: 1.7 }],
  doorHandles: { y: 0.9, z: [1.95, 3.0] },
  wheelNuts: true,
  plates: { y: 0.5 },
  indicators: { y: 0.74, x: 0.6 },
  gutters: { x: 0.74, y: 1.44, z0: 1.9, z1: 3.0 },
  bootSeam: { y: 1.06, z: 3.55, halfWidth: 0.66 },
  detail: {
    saloon: {
      doorShutLines: { z: [1.62, 2.55], y0: 0.5, y1: 0.98 },
      sill: { y: 0.3, z0: 0.5, z1: 3.7 },
    },
  },
  underbody: { y0: 0.16, y1: CAR_SPEC.sillY - 0.01, insetM: 0.25 },
  contactShadow: true,
});

/** Hood ornament, tail fins, and a rear-bumper exhaust tip. */
export function carExtras(sink: PartSink): void {
  sink.box('chrome', 'hood-ornament', [-0.02, 1.03, 0.3], [0.02, 1.1, 0.5]);
  sink.boxPair('chrome', 'fin-trim', [0.72, 1.02, 3.3], [0.78, 1.08, CAR_LENGTH - 0.15]);
  sink.cylinder('chrome', 'exhaust-tip', 'z', [-0.5, 0.3, CAR_LENGTH + 0.03], 0.03, 0.12, 8);
  sink.box('lining', 'rear-axle-shadow', [-0.6, 0.18, 3.3], [0.6, 0.24, 3.7]);
}
