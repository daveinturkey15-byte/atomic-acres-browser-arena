/**
 * forge-kit/hardware/prefabs.ts — HF-536 (NIGHT-MUSE-HARDWARE)
 *
 * Facade and fence hardware kit: the small metal and timber parts a real
 * house has, geometry only, zero new materials.
 *
 * 1. houseNumberPlaque() — 0.18 x 0.12 x 0.02 m plate beside the front door
 *    with two 0.03 x 0.06 m "digit" boxes 0.010 m proud (NOT 0.005: a 5 mm
 *    standoff sits exactly on the oriented-coplanar audit's <= 5 mm finding
 *    boundary for a different-material pair with overlapping footprints, so
 *    the brief's no-rise rule forces 10 mm; reported in the lane REPORT.md).
 * 2. doorbellAndLight() — doorbell backplate + button box and a porch wall
 *    lantern (0.12 x 0.22 x 0.12 m body, 0.02 m bracket) for the wall beside
 *    the door head.
 * 3. doorHardware() — front-door leaf furniture: lever handle (rose + lever),
 *    0.30 x 0.07 m letterbox plate, two hinge plates on the hinge (west) side,
 *    0.7 x 0.15 m kick plate at the foot; reliefs 0.012–0.020 m (inside both
 *    the brief's 0.008–0.02 band and the >= 0.01 audit-safe floor; every back
 *    is also >= 6 mm clear of the siding face that buries the leaf).
 * 4. garageDoorHardware() — sectional-door furniture on the parked leaf:
 *    4 raised battens 0.03 x 0.02 m (recesses would cut see-through slots),
 *    3.46 m long so no end face lands exactly on the panel run ends, a centre
 *    handle (plate + grip), two 0.05 x 0.05 m side rails at 0.76 m (ends stop
 *    short of the panel head/foot planes); rails ride 6 mm behind the batten
 *    backs so no two owned faces share a plane.
 * 5. fenceRunHardware(length) — per yard-fence run: two 0.08 m posts engaged
 *    in the run ends, 0.10 x 0.03 x 0.10 m caps 0.01 m wider on all sides
 *    floating 10 mm over the post tops, one 0.04 x 0.06 m mid rail 0.02 m
 *    proud of the boards on the yard side.
 * 6. gateHardware() — per fence gap: 2 hinge straps 0.25 x 0.04 m on one
 *    flank post's gap face, one latch box on the other. (Both gaps are 3.0 m
 *    with posts inset 0.05 m, so one local layout serves both.)
 * 7. downpipe() — 0.08 m (8-gon faked by two boxes at 45 deg, the
 *    street-signs bollard precedent: real cylinders would need their own
 *    merge and read the same at review distance) pipe with two
 *    0.10 x 0.04 m brackets and a foot shoe. PREFAB ONLY, NOT PLACED: the
 *    arena already hangs gutterRunParts downpipes at all four house corners
 *    (measured shoe y 0.16–0.30, pipe x = centre +/- 5.198); emitting ours
 *    would double-pipe every corner. Isolated proof only; REPORTED as dropped.
 * 8. wallVentAndMeterBox() — 0.22 x 0.22 vent grille (backplate + 5 slats) low
 *    on the side wall and a 0.40 x 0.55 x 0.12 m meter box with a door-line
 *    strip, for the exposed east-wall run z in [-16, -10].
 *
 * Each prefab <= 140 tris (12 per box); existing roles only; every placed part
 * presentationOnly, solid false, shots false; no colliders.
 */

export type HardwareRole =
  | 'painted-metal'
  | 'timber'
  | 'trim'
  | 'chrome'
  | 'rubber';
export const HARDWARE_ROLES = Object.freeze([
  'painted-metal',
  'timber',
  'trim',
  'chrome',
  'rubber',
] as const);

export interface HardwarePart {
  readonly suffix: string;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: HardwareRole;
  readonly cast: boolean;
  readonly rotation?: readonly [number, number, number];
}

export const HARDWARE_BOX_TRIANGLES = 12;

const part = (
  suffix: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: HardwareRole,
  cast: boolean,
  rotation?: readonly [number, number, number],
): HardwarePart => Object.freeze({
  suffix,
  offset,
  size,
  role,
  cast,
  ...(rotation ? { rotation } : {}),
});

/**
 * 1. houseNumberPlaque — anchor at ground on the wall plane, beside the door.
 * 3 boxes = 36 triangles.
 */
export function houseNumberPlaque(): readonly HardwarePart[] {
  return Object.freeze([
    // Enamelled plate on the siding face (siding outer face is 0.05 m outboard
    // of the anchor plane; back stands 16 mm proud of it).
    part('plate', [0, 1.60, 0.076], [0.18, 0.12, 0.02], 'painted-metal', false),
    // Raised digits, 10 mm proud of the plate (see header: 5 mm would sit on
    // the oriented audit's finding boundary).
    part('digit 0', [-0.04, 1.60, 0.100], [0.03, 0.06, 0.008], 'trim', false),
    part('digit 1', [0.04, 1.60, 0.100], [0.03, 0.06, 0.008], 'trim', false),
  ]);
}
export const HOUSE_NUMBER_PLAQUE_TRIANGLES = 3 * HARDWARE_BOX_TRIANGLES;

/**
 * 2. doorbellAndLight — anchor at ground on the wall plane, beside the door.
 * 4 boxes = 48 triangles.
 */
export function doorbellAndLight(): readonly HardwarePart[] {
  return Object.freeze([
    // Bell backplate, 16 mm proud of the siding face.
    part('bell plate', [0, 1.42, 0.072], [0.06, 0.10, 0.012], 'painted-metal', false),
    // Button box, 16 mm proud of the backplate front.
    part('bell button', [0, 1.42, 0.100], [0.04, 0.04, 0.012], 'trim', false),
    // Lantern wall bracket, 10 mm proud of the siding face.
    part('lantern bracket', [0, 2.50, 0.070], [0.05, 0.05, 0.02], 'trim', false),
    // Lantern body, 12 mm proud of the bracket front.
    part('lantern body', [0, 2.50, 0.152], [0.12, 0.22, 0.12], 'rubber', false),
  ]);
}
export const DOORBELL_AND_LIGHT_TRIANGLES = 4 * HARDWARE_BOX_TRIANGLES;

/**
 * 3. doorHardware — anchor at the parked leaf's bottom centre on the wall
 * plane (the leaf's own face plane). Host planes, measured on the built
 * arena: raised-panel fronts -9.96, rail fronts -9.957, leaf base -9.97, with
 * the siding face at -9.95 burying all three. Small furniture rides 16–20 mm
 * proud of the -9.96 panel plane (>= 6 mm clear of the siding face); the two
 * large plates (letterbox, kick) ride 20 mm proud of the SIDING face so their
 * fronts stand past the oriented audit's 30 mm NEAR band. Reported.
 * 6 boxes = 72 triangles.
 */
export function doorHardware(): readonly HardwarePart[] {
  return Object.freeze([
    // Lever rose on panel 1 (panel fronts measured at -9.96).
    part('handle rose', [0.30, 1.15, 0.060], [0.05, 0.12, 0.012], 'chrome', false),
    // Lever arm reaching out from the rose face.
    part('handle lever', [0.30, 1.15, 0.128], [0.02, 0.02, 0.10], 'chrome', false),
    // Letterbox plate on panel 0. Back 20 mm proud of the SIDING face (not the
    // panel): the buried leaf puts any large plate's front inside the oriented
    // audit's 30 mm NEAR band unless its front stands past it. Reported.
    part('letterbox', [-0.20, 0.60, 0.076], [0.30, 0.07, 0.012], 'chrome', false),
    // Hinge plates on the hinge (west, opening-side) stile.
    part('hinge lower', [-0.70, 0.45, 0.062], [0.025, 0.12, 0.012], 'chrome', false),
    part('hinge upper', [-0.70, 1.95, 0.062], [0.025, 0.12, 0.012], 'chrome', false),
    // Kick plate at the foot. Same construction as the letterbox: back 20 mm
    // proud of the siding face, front 32 mm proud, past the audit NEAR band.
    part('kick plate', [-0.20, 0.235, 0.076], [0.70, 0.15, 0.012], 'painted-metal', false),
  ]);
}
export const DOOR_HARDWARE_TRIANGLES = 6 * HARDWARE_BOX_TRIANGLES;

/**
 * 4. garageDoorHardware — anchor at ground on the garage-front plane under
 * the parked sectional leaf (panel board fronts measured at -15.95, leaf
 * y in [2.6, 3.4], run x in [5.0, 8.5]).
 *
 * The leaf is four 0.2 m boards over [2.6, 3.4], so the battens sit ON the
 * three panel joints (2.80, 3.00, 3.20) plus the leaf's bottom rail (2.62):
 * a batten mid-panel reads as a stripe, on a joint it reads as the shadow
 * line a sectional door has. Backs stay 20 mm proud of the board faces, so
 * the relief contract and the oriented-audit occlusion pattern are unchanged.
 * 8 boxes = 96 triangles.
 */
export function garageDoorHardware(): readonly HardwarePart[] {
  const battens: HardwarePart[] = ([2.62, 2.80, 3.00, 3.20] as const).map((y, index) =>
    part(`batten ${index}`, [0, y, 0.080], [3.46, 0.03, 0.02], 'trim', false),
  );
  return Object.freeze([
    ...battens,
    // Side rails: backs 26 mm proud (6 mm behind the batten backs, so the two
    // owned planes never coincide where footprints overlap).
    part('rail left', [-1.65, 3.00, 0.101], [0.05, 0.76, 0.05], 'trim', false),
    part('rail right', [1.65, 3.00, 0.101], [0.05, 0.76, 0.05], 'trim', false),
    // Centre pull on the second panel from the bottom (2.83-2.97, clear of
    // the 2.80 and 3.00 joint battens): plate 38 mm proud of the boards,
    // grip 12 mm off the plate.
    part('handle plate', [0, 2.90, 0.094], [0.10, 0.14, 0.012], 'painted-metal', false),
    part('handle grip', [0, 2.90, 0.162], [0.03, 0.03, 0.10], 'chrome', false),
  ]);
}
export const GARAGE_DOOR_HARDWARE_TRIANGLES = 8 * HARDWARE_BOX_TRIANGLES;

/**
 * 5. fenceRunHardware — one yard-fence run. Anchor at ground on the fence
 * centreline at the run centre. 5 boxes = 60 triangles.
 */
export function fenceRunHardware(length: number): readonly HardwarePart[] {
  if (!(length > 0)) throw new Error('fenceRunHardware length must be positive');
  const end = length / 2 - 0.05;
  return Object.freeze([
    // Posts engaged in the run ends (same timber as the run itself).
    part('post west', [-end, 0.95, 0], [0.08, 1.9, 0.08], 'timber', false),
    part('post east', [end, 0.95, 0], [0.08, 1.9, 0.08], 'timber', false),
    // Caps 0.01 m wider on all sides, floating 10 mm over the post tops.
    part('cap west', [-end, 1.925, 0], [0.10, 0.03, 0.10], 'timber', false),
    part('cap east', [end, 1.925, 0], [0.10, 0.03, 0.10], 'timber', false),
    // Mid rail along the run, 20 mm proud of the boards on the yard side.
    part('mid rail', [0, 0.95, 0.175], [length, 0.04, 0.06], 'timber', false),
  ]);
}
export const FENCE_RUN_HARDWARE_TRIANGLES = 5 * HARDWARE_BOX_TRIANGLES;

/**
 * 6. gateHardware — one fence gap (both gaps are 3.0 m; flank posts inset
 * 0.05 m, so gap faces sit at +/-1.51 m and one layout serves both gaps).
 * Anchor at ground on the fence centreline at the gap centre.
 * 3 boxes = 36 triangles.
 */
export function gateHardware(): readonly HardwarePart[] {
  return Object.freeze([
    // Two hinge straps on the west flank post's gap face, 16 mm standoff.
    part('hinge strap lower', [-1.488, 0.60, 0], [0.012, 0.04, 0.25], 'chrome', false),
    part('hinge strap upper', [-1.488, 1.30, 0], [0.012, 0.04, 0.25], 'chrome', false),
    // Latch box on the east flank post's gap face, 16 mm standoff.
    part('latch box', [1.454, 1.10, 0], [0.08, 0.12, 0.08], 'chrome', false),
  ]);
}
export const GATE_HARDWARE_TRIANGLES = 3 * HARDWARE_BOX_TRIANGLES;

/**
 * 7. downpipe — prefab only (see header: NOT placed, the gutter kit already
 * pipes every corner). Local frame: origin at ground on the wall-face plane.
 * 5 boxes = 60 triangles.
 */
export function downpipe(): readonly HardwarePart[] {
  const H = 5.95;
  return Object.freeze([
    // 8-gon pipe faked by two boxes at 45 deg (street-signs bollard precedent).
    part('pipe 0', [0, 0.15 + H / 2, 0.09], [0.08, H, 0.08], 'painted-metal', false),
    part('pipe 1', [0, 0.15 + H / 2, 0.09], [0.08, H, 0.08], 'painted-metal', false, [0, Math.PI / 4, 0]),
    // Wall brackets.
    part('bracket lower', [0, 1.20, 0.045], [0.10, 0.04, 0.05], 'trim', false),
    part('bracket upper', [0, 4.80, 0.045], [0.10, 0.04, 0.05], 'trim', false),
    // Shoe at the foot, sole 0.15 m above ground.
    part('shoe', [0, 0.23, 0.10], [0.08, 0.16, 0.14], 'painted-metal', false),
  ]);
}
export const DOWNPIPE_TRIANGLES = 5 * HARDWARE_BOX_TRIANGLES;

/**
 * 8. wallVentAndMeterBox — anchor at ground on the side-wall plane
 * (siding outer face 0.05 m outboard of the anchor). 8 boxes = 96 triangles.
 */
export function wallVentAndMeterBox(): readonly HardwarePart[] {
  const slats: HardwarePart[] = ([0.32, 0.37, 0.42, 0.47, 0.52] as const).map((y, index) =>
    part(`vent slat ${index}`, [0.112, y, 0], [0.012, 0.03, 0.22], 'trim', false),
  );
  return Object.freeze([
    // Vent backplate, 14 mm proud of the siding face.
    part('vent plate', [0.079, 0.42, 0], [0.03, 0.26, 0.26], 'painted-metal', false),
    // Five grille slats, 12 mm proud of the plate front.
    ...slats,
    // Meter box, 16 mm proud of the siding face.
    part('meter box', [0.126, 1.00, 0.55], [0.12, 0.55, 0.40], 'painted-metal', false),
    // Door-line strip on the meter face, 12 mm proud of it.
    part('meter door strip', [0.204, 1.00, 0.45], [0.012, 0.50, 0.03], 'trim', false),
  ]);
}
export const WALL_VENT_AND_METER_BOX_TRIANGLES = 8 * HARDWARE_BOX_TRIANGLES;

export interface HardwarePropPlacement {
  readonly propId: string;
  readonly anchor: readonly [number, number, number];
  readonly parts: readonly HardwarePart[];
}

/**
 * Authored placements (authored frame; pair() mirrors them onto both houses
 * and both yards). Anchors sit on the host surface plane; part offsets carry
 * the measured relief. downpipe() is deliberately absent (see header).
 *
 * Front-wall column x = 1.26: 1.52 m laterally clear of the front-door run in
 * BOTH worlds (the mirror swaps east and west, so the clearance is symmetric),
 * east of the parked leaf's neighbours and west of window B's reveal.
 */
export function hardwarePlacements(): readonly HardwarePropPlacement[] {
  return Object.freeze([
    Object.freeze({
      propId: 'hardware house number plaque',
      anchor: [1.26, 0, -10] as const,
      parts: houseNumberPlaque(),
    }),
    Object.freeze({
      propId: 'hardware doorbell and light',
      anchor: [1.26, 0, -10] as const,
      parts: doorbellAndLight(),
    }),
    Object.freeze({
      propId: 'hardware front door hardware',
      anchor: [0.65, 0, -10] as const,
      parts: doorHardware(),
    }),
    Object.freeze({
      propId: 'hardware garage door hardware',
      anchor: [6.75, 0, -16] as const,
      parts: garageDoorHardware(),
    }),
    // Yard fence runs (authored runs [-18,-12.5], [-9.5,4.5], [7.5,18]).
    Object.freeze({
      propId: 'hardware fence run 0',
      anchor: [-15.25, 0, -35.875] as const,
      parts: fenceRunHardware(5.5),
    }),
    Object.freeze({
      propId: 'hardware fence run 1',
      anchor: [-2.5, 0, -35.875] as const,
      parts: fenceRunHardware(14),
    }),
    Object.freeze({
      propId: 'hardware fence run 2',
      anchor: [12.75, 0, -35.875] as const,
      parts: fenceRunHardware(10.5),
    }),
    // Fence gaps (authored [-12.5,-9.5] and [4.5,7.5]).
    Object.freeze({
      propId: 'hardware fence gate 0',
      anchor: [-11.0, 0, -35.875] as const,
      parts: gateHardware(),
    }),
    Object.freeze({
      propId: 'hardware fence gate 1',
      anchor: [6.0, 0, -35.875] as const,
      parts: gateHardware(),
    }),
    // Side wall: exposed east-wall run z in [-16,-10].
    Object.freeze({
      propId: 'hardware vent and meter box',
      anchor: [4.25, 0, -13] as const,
      parts: wallVentAndMeterBox(),
    }),
  ]);
}
