/**
 * vehicle-forge/specs.ts - DATA ONLY. No geometry code lives in this file.
 *
 * Every number is in metres in the vehicle's own frame: nose at z = 0, tail at
 * z = length, +x is the vehicle's right when facing +z, y = 0 is the ground.
 *
 * THE ENVELOPES ARE NOT FREE CHOICES. Nuke Town Rebuild's street vehicles are
 * already authored as solid boxes that own the movement colliders and the shot
 * surfaces, and this forge is presentation only, so every spec is sized to the
 * box it dresses rather than to a catalogue vehicle:
 *
 *   coach      9.1 x 2.6 x 3.3 m   (NUKETOWN2_STREET_COACH)
 *   truck cab  5.2 x 2.6 x 2.9 m   (NUKETOWN2_CENTRAL_TRUCK cab)
 *   sedan      4.4 x 1.9 x 1.88 m  (`car body` 0.22-1.22 + `car cabin` 1.22-1.88)
 *
 * The sedan envelope is the one worth flagging: 1.88 m is tall for a 4.4 m
 * saloon, so the forged body is a tall three-box estate rather than a low
 * coupe. Lowering the roof to a "correct" 1.45 m would leave 0.43 m of collider
 * with no visible mass under it, which is an authority change dressed as art -
 * exactly what the forging review exists to catch. The greenhouse therefore
 * tops out at 1.86 m and the belt sits at the `car body` box's own 1.16 m, so
 * the loft's silhouette IS the two boxes it replaces, with radii.
 *
 * PROPORTIONS, as fractions of wheelbase, measured from these records:
 *   sedan      wheelbase 3.00  front overhang 0.70 (23 %)  axle-to-cowl 0.54 (18 %)
 *   coach      wheelbase 5.80  front overhang 1.65 (28 %)
 *   truck cab  front axle 0.80 back from the nose on a 5.2 m cab-over
 * These are asserted in `vehicle-forge.test.ts` so a spec edit that turns the
 * sedan into a cartoon fails a gate rather than a critic.
 */
import type { VehicleSpec } from './geometry';

/**
 * The retro coach: a cream streamlined body with a raked screen, a continuous
 * side-glass band and a rounded roof. The reference's coach is the map's
 * landmark and the only saturated body on the street, so its roof line is the
 * silhouette that has to survive being seen from 30 m.
 */
export const COACH_SPEC: VehicleSpec = Object.freeze({
  id: 'nuketown2-coach',
  length: 9.1,
  halfWidth: 1.3,
  sillHalfWidth: 1.16,
  sillY: 0.4,
  beltY: 1.75,
  sillRadius: 0.022,
  wheelRadius: 0.42,
  tyreHalfWidth: 0.14,
  trackHalfWidth: 1.1,
  wheelZ: Object.freeze([1.65, 7.45]),
  archGap: 0.05,
  top: Object.freeze([
    { z: 0.0, yTop: 2.3, halfWidthTop: 0.85, topRadius: 0.44 },
    { z: 0.55, yTop: 3.0, halfWidthTop: 1.14, topRadius: 0.34 },
    { z: 1.3, yTop: 3.26, halfWidthTop: 1.2, topRadius: 0.3 },
    { z: 7.9, yTop: 3.26, halfWidthTop: 1.2, topRadius: 0.3 },
    { z: 8.6, yTop: 3.04, halfWidthTop: 1.14, topRadius: 0.34 },
    { z: 9.1, yTop: 2.36, halfWidthTop: 0.86, topRadius: 0.44 },
  ]),
  sideGlass: Object.freeze([{ z0: 1.45, z1: 8.2 }]),
  screens: Object.freeze([{ z0: 0.18, z1: 1.12 }, { z0: 8.5, z1: 9.02 }]),
  shutLines: Object.freeze([1.36, 2.38, 6.7]),
  stationSpacing: 0.55,
});

/**
 * The moving truck's CAB ONLY, as a cab-over: flat front, raked screen at the
 * very nose, one arch over the front axle.
 *
 * The cargo box behind it stays exactly as the arena authored it - a deck, a
 * bulkhead, two flanks with walk-through openings and a roof. That is not a
 * shortcut: the box is enterable cover whose openings are HF-436 gameplay, and
 * a single lofted skin over the whole vehicle would seal all three mouths.
 */
export const TRUCK_CAB_SPEC: VehicleSpec = Object.freeze({
  id: 'nuketown2-truck-cab',
  length: 5.2,
  halfWidth: 1.3,
  sillHalfWidth: 1.14,
  sillY: 0.6,
  beltY: 1.95,
  sillRadius: 0.025,
  wheelRadius: 0.42,
  tyreHalfWidth: 0.16,
  trackHalfWidth: 1.06,
  wheelZ: Object.freeze([0.8]),
  archGap: 0.05,
  top: Object.freeze([
    { z: 0.0, yTop: 2.55, halfWidthTop: 1.02, topRadius: 0.3 },
    { z: 0.45, yTop: 2.86, halfWidthTop: 1.16, topRadius: 0.2, crease: true },
    { z: 4.6, yTop: 2.88, halfWidthTop: 1.18, topRadius: 0.16 },
    { z: 5.2, yTop: 2.72, halfWidthTop: 1.02, topRadius: 0.3 },
  ]),
  sideGlass: Object.freeze([{ z0: 0.58, z1: 1.5 }]),
  screens: Object.freeze([{ z0: 0.06, z1: 0.42 }]),
  shutLines: Object.freeze([1.6, 2.62]),
  stationSpacing: 0.5,
});

/**
 * The parked sedan, used for both driveway cars and the head car in the
 * turning head. Three boxes: hood, greenhouse, deck, with a crease at the cowl
 * and another where the roof meets the backlight, so the two hard breaks stay
 * sharp while every radius around them shades smoothly.
 */
export const SEDAN_SPEC: VehicleSpec = Object.freeze({
  id: 'nuketown2-sedan',
  length: 4.4,
  halfWidth: 0.95,
  sillHalfWidth: 0.8,
  sillY: 0.24,
  beltY: 1.16,
  sillRadius: 0.02,
  wheelRadius: 0.34,
  tyreHalfWidth: 0.115,
  trackHalfWidth: 0.79,
  wheelZ: Object.freeze([0.7, 3.7]),
  archGap: 0.045,
  top: Object.freeze([
    { z: 0.0, yTop: 1.06, halfWidthTop: 0.62, topRadius: 0.14 },
    { z: 0.3, yTop: 1.19, halfWidthTop: 0.86, topRadius: 0.09 },
    { z: 1.24, yTop: 1.22, halfWidthTop: 0.88, topRadius: 0.08, crease: true },
    { z: 1.95, yTop: 1.84, halfWidthTop: 0.78, topRadius: 0.1 },
    { z: 2.95, yTop: 1.86, halfWidthTop: 0.8, topRadius: 0.11 },
    { z: 3.5, yTop: 1.24, halfWidthTop: 0.88, topRadius: 0.08, crease: true },
    { z: 4.12, yTop: 1.21, halfWidthTop: 0.86, topRadius: 0.09 },
    { z: 4.4, yTop: 1.08, halfWidthTop: 0.62, topRadius: 0.14 },
  ]),
  sideGlass: Object.freeze([{ z0: 1.98, z1: 2.92 }]),
  screens: Object.freeze([{ z0: 1.28, z1: 1.92 }, { z0: 2.98, z1: 3.46 }]),
  shutLines: Object.freeze([1.42, 2.6, 3.58]),
  stationSpacing: 0.45,
});

/** Every spec this forge ships, for the gates that sweep all of them. */
export const FORGED_VEHICLE_SPECS: readonly VehicleSpec[] = Object.freeze([
  COACH_SPEC,
  TRUCK_CAB_SPEC,
  SEDAN_SPEC,
]);
