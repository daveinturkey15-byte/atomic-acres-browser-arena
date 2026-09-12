/**
 * HF-571 world-studio vehicle specs - DATA ONLY.
 *
 * Every number is metres in the vehicle's own frame (vehicle-forge convention): nose at
 * z = 0, tail at z = length, +x is the vehicle's right when facing +z, y = 0 is ground.
 *
 * These envelopes are the BUILD_BRIEF's solid boxes for the fresh world, not the retired
 * Nuke Town boxes the original forge dresses:
 *   school bus   10.0 x 3.0 x 3.2  at X -3.5, Z 2   (nose to -Z)
 *   tractor unit  6.2 x 3.0 x 3.6  the front of the 14 m truck at X 3.5, Z -2 (nose to +Z)
 *   box trailer   9.2 x 3.0 x 4.0  behind the tractor, sharing its last 1.4 m (fifth wheel)
 *   classic car   4.2 x 1.8 x 1.5  at X -21, Z 23 in the teal driveway (nose to -Z)
 */
import type { VehicleSpec } from '../../vehicle-forge';

export const BUS_LENGTH = 10;
export const BUS_HALF_WIDTH = 1.5;
export const BUS_HEIGHT = 3.2;

/**
 * The rounded yellow school bus: a short blunt hood, a split flat windscreen, a long
 * ribbed flank with a continuous side-window band and a crowned roof. The stations keep
 * the crown under 3.2 m and the hood well under the cab line so the "conventional"
 * school-bus step reads from every angle.
 */
export const BUS_SPEC: VehicleSpec = Object.freeze({
  id: 'world-studio-bus',
  length: BUS_LENGTH,
  halfWidth: BUS_HALF_WIDTH,
  sillHalfWidth: 1.34,
  sillY: 0.5,
  beltY: 1.9,
  sillRadius: 0.03,
  shoulderDepthM: 0.16,
  orientPerTriangle: true,
  wheelRadius: 0.5,
  tyreHalfWidth: 0.15,
  trackHalfWidth: 1.22,
  wheelZ: Object.freeze([1.55, 7.45]),
  archGap: 0.06,
  top: Object.freeze([
    { z: 0.0, yTop: 1.62, halfWidthTop: 1.02, topRadius: 0.24 },
    { z: 0.35, yTop: 1.78, halfWidthTop: 1.24, topRadius: 0.18 },
    { z: 1.55, yTop: 1.84, halfWidthTop: 1.3, topRadius: 0.16, crease: true },
    { z: 1.95, yTop: 2.7, halfWidthTop: 1.36, topRadius: 0.26 },
    { z: 2.4, yTop: 3.1, halfWidthTop: 1.38, topRadius: 0.36 },
    { z: 3.0, yTop: 3.17, halfWidthTop: 1.4, topRadius: 0.4 },
    { z: 9.2, yTop: 3.17, halfWidthTop: 1.4, topRadius: 0.4 },
    { z: 9.7, yTop: 3.05, halfWidthTop: 1.36, topRadius: 0.4 },
    { z: 10.0, yTop: 2.7, halfWidthTop: 1.2, topRadius: 0.4 },
  ]),
  sideGlass: Object.freeze([{ z0: 2.55, z1: 9.35 }]),
  screens: Object.freeze([{ z0: 1.95, z1: 2.45 }]),
  shutLines: Object.freeze([1.9, 2.5, 9.55]),
  roofCrownM: 0.03,
  stationSpacing: 0.5,
});

export const TRACTOR_LENGTH = 5.6;
export const TRUCK_HALF_WIDTH = 1.5;
export const TRACTOR_HEIGHT = 3.6;

/**
 * The red long-nose tractor unit: a tall square hood with a chrome grille in its face,
 * a stepped cab behind it with a split screen and a short sleeper. The loft ends where
 * the bare chassis begins; `trailer.ts` owns the chassis rails, the rear tandem and the
 * fifth wheel the trailer sits over.
 */
export const TRACTOR_SPEC: VehicleSpec = Object.freeze({
  id: 'world-studio-tractor',
  length: TRACTOR_LENGTH,
  halfWidth: TRUCK_HALF_WIDTH,
  sillHalfWidth: 1.3,
  sillY: 0.62,
  beltY: 2.1,
  sillRadius: 0.03,
  shoulderDepthM: 0.14,
  orientPerTriangle: true,
  wheelRadius: 0.55,
  tyreHalfWidth: 0.17,
  trackHalfWidth: 1.2,
  wheelZ: Object.freeze([1.35]),
  archGap: 0.07,
  top: Object.freeze([
    { z: 0.0, yTop: 1.92, halfWidthTop: 0.96, topRadius: 0.12 },
    { z: 0.25, yTop: 2.0, halfWidthTop: 1.1, topRadius: 0.1 },
    { z: 2.2, yTop: 2.06, halfWidthTop: 1.16, topRadius: 0.1, crease: true },
    { z: 2.55, yTop: 3.0, halfWidthTop: 1.36, topRadius: 0.2 },
    { z: 2.9, yTop: 3.5, halfWidthTop: 1.4, topRadius: 0.26 },
    { z: 4.6, yTop: 3.52, halfWidthTop: 1.4, topRadius: 0.26 },
    { z: 5.0, yTop: 3.3, halfWidthTop: 1.3, topRadius: 0.3 },
    { z: 5.25, yTop: 2.6, halfWidthTop: 1.1, topRadius: 0.2 },
    { z: 5.6, yTop: 2.5, halfWidthTop: 1.0, topRadius: 0.16 },
  ]),
  sideGlass: Object.freeze([{ z0: 3.05, z1: 4.75 }]),
  screens: Object.freeze([{ z0: 2.5, z1: 2.95 }]),
  shutLines: Object.freeze([2.25, 3.95, 5.1]),
  roofCrownM: 0.02,
  stationSpacing: 0.5,
});

export const TRUCK_LENGTH = 14;
/** Trailer box in the tractor's frame: starts over the sleeper, ends at the truck tail. */
export const TRAILER_Z0 = 5.9;
export const TRAILER_Z1 = TRUCK_LENGTH;
export const TRAILER_HEIGHT = 4.0;
export const TRAILER_FLOOR_Y = 1.35;
export const TRAILER_AXLE_Z = Object.freeze([11.5, 12.8]);
export const TRACTOR_REAR_AXLE_Z = Object.freeze([6.3, 7.6]);

export const CAR_LENGTH = 4.2;
export const CAR_HALF_WIDTH = 0.9;
export const CAR_HEIGHT = 1.5;

/**
 * The classic parked car: a low 1950s two-box saloon, long hood, rounded greenhouse,
 * chrome bumpers and whitewalls, sized to its 4.2 x 1.8 driveway slot.
 */
export const CAR_SPEC: VehicleSpec = Object.freeze({
  id: 'world-studio-classic-car',
  length: CAR_LENGTH,
  halfWidth: CAR_HALF_WIDTH,
  sillHalfWidth: 0.76,
  sillY: 0.24,
  beltY: 0.98,
  sillRadius: 0.03,
  shoulderDepthM: 0.12,
  orientPerTriangle: true,
  wheelRadius: 0.32,
  tyreHalfWidth: 0.105,
  trackHalfWidth: 0.74,
  wheelZ: Object.freeze([0.72, 3.5]),
  archGap: 0.045,
  top: Object.freeze([
    { z: 0.0, yTop: 0.9, halfWidthTop: 0.56, topRadius: 0.14 },
    { z: 0.3, yTop: 1.02, halfWidthTop: 0.78, topRadius: 0.12 },
    { z: 1.35, yTop: 1.06, halfWidthTop: 0.8, topRadius: 0.12, crease: true },
    { z: 1.75, yTop: 1.34, halfWidthTop: 0.76, topRadius: 0.18 },
    { z: 2.15, yTop: 1.48, halfWidthTop: 0.72, topRadius: 0.24 },
    { z: 2.85, yTop: 1.49, halfWidthTop: 0.72, topRadius: 0.24 },
    { z: 3.25, yTop: 1.3, halfWidthTop: 0.76, topRadius: 0.18 },
    { z: 3.5, yTop: 1.08, halfWidthTop: 0.8, topRadius: 0.12, crease: true },
    { z: 3.95, yTop: 1.04, halfWidthTop: 0.78, topRadius: 0.12 },
    { z: 4.2, yTop: 0.92, halfWidthTop: 0.58, topRadius: 0.14 },
  ]),
  sideGlass: Object.freeze([{ z0: 1.8, z1: 3.15 }]),
  screens: Object.freeze([{ z0: 1.38, z1: 1.74 }, { z0: 3.18, z1: 3.48 }]),
  shutLines: Object.freeze([1.4, 2.5, 3.52]),
  roofCrownM: 0.02,
  stationSpacing: 0.45,
});

/** Placement contract from BUILD_BRIEF.md, world metres. Vehicles are parallel to Z. */
export const STUDIO_VEHICLE_PLACEMENTS = Object.freeze({
  /** Nose to -Z: the rear (twin round lamps, ribbed door) faces the +Z street mouth. */
  bus: Object.freeze({ centreX: -3.5, centreZ: 2, noseZ: 2 - BUS_LENGTH / 2, yaw: 0 }),
  /** Nose to +Z: the grille faces the +Z street mouth, opposite to the bus. */
  truck: Object.freeze({ centreX: 3.5, centreZ: -2, noseZ: -2 + TRUCK_LENGTH / 2, yaw: Math.PI }),
  /** Nose to -Z, parked in the teal driveway toward its garage. */
  car: Object.freeze({ centreX: -21, centreZ: 23, noseZ: 23 - CAR_LENGTH / 2, yaw: 0 }),
});
