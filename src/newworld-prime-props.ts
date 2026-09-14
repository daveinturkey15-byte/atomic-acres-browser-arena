import { DeterministicRng } from './deterministic-rng';

/**
 * newworld-prime prop part descriptors (presentation-only, code-only wave).
 *
 * Every export in this module is frozen data: part offsets/sizes/roles plus
 * string material ids resolved centrally by the Shell/Layout assembler against
 * the TSL material registry. This file builds NO meshes, touches NO colliders,
 * spawns, nav, or authority rows, and uses NO ShaderMaterial/GLSL.
 *
 * Bar:
 * - batch-3 props plates (school-bus face, semi-truck face, shed face,
 *   fence/lamp/hedge/pad faces, welcome-sign face, rusty-car face)
 * - batch-2-layout/map__north-entrance.png (center pair staging + entrance sign)
 * LAYOUT_CONTRACT facts 4-9: center school-bus + semi-truck pair, 2 sheds,
 * privacy fences, street lamps, hedges, concrete pads, welcome-sign/rusty-car
 * plus jeep/sandbag reservations.
 * Original art only: generic small-town props, no licensed likeness.
 */

/** Deterministic seed for every derived prop value in this module. Never Math.random. */
export const NEWWORLD_PRIME_PROPS_SEED = 0x6e657770;

/** Prop-local primitive the assembler instantiates. Rounded boxes arrive via the TSL registry. */
export type NewworldPrimePropPrimitive = 'box' | 'cylinder' | 'plane' | 'icosahedron';

/** Presentation role of one part inside its prop. */
export type NewworldPrimePropRole =
  | 'body' | 'skirt' | 'roof' | 'glass' | 'door' | 'wheel' | 'bumper' | 'light'
  | 'mirror' | 'sign-board' | 'sign-face' | 'grille' | 'tank'
  | 'trailer' | 'fairing' | 'wall' | 'roof-slab' | 'frame-post' | 'floor'
  | 'panel' | 'post' | 'pole' | 'arm' | 'hood' | 'lens' | 'foliage'
  | 'pad' | 'planter' | 'rust-patch';

/** One frozen part descriptor: metres, prop-local, assembler-built. */
export type NewworldPrimePropPart = Readonly<{
  /** Unique within its prop family, e.g. 'school-bus-body'. */
  id: string;
  role: NewworldPrimePropRole;
  primitive: NewworldPrimePropPrimitive;
  /** Metres from the prop origin (origin = ground centre unless noted). */
  offset: readonly [number, number, number];
  /** Metres: box XYZ | cylinder [diameter, height, diameter] | plane [w, h] | icosahedron [radius]. */
  size: readonly [number, number, number];
  /** Local yaw radians. */
  rotationY: number;
  /** String id into the TSL material registry (owned by Shell). */
  materialId: string;
  /** Estimated triangles once built; feeds the family budget fence. */
  triangleEstimate: number;
}>;

/** Presentation-default placement; the assembler owns final authority. */
export type NewworldPrimePropPlacement = Readonly<{
  id: string;
  /** Metres in arena space. */
  x: number;
  z: number;
  rotationY: number;
}>;

/** Cleared footprint reserved for a future-wave prop; nothing built this wave. */
export type NewworldPrimePropReservation = Readonly<{
  id: string;
  x: number;
  z: number;
  rotationY: number;
  /** Metres. */
  halfWidth: number;
  halfLength: number;
}>;

/** TSL registry material ids consumed by every part below. */
export const NEWWORLD_PRIME_PROP_MATERIAL_IDS = Object.freeze({
  busYellow: 'newworld-prime-bus-yellow-v1',
  busCream: 'newworld-prime-cream-v1',
  busGlass: 'newworld-prime-vehicle-glass-v1',
  busRubber: 'newworld-prime-rubber-v1',
  busSteel: 'newworld-prime-steel-v1',
  busLight: 'newworld-prime-headlight-v1',
  truckCabRed: 'newworld-prime-truck-cab-red-v1',
  truckTrailerWhite: 'newworld-prime-trailer-white-v1',
  truckGlass: 'newworld-prime-vehicle-glass-v1',
  truckRubber: 'newworld-prime-rubber-v1',
  truckSteel: 'newworld-prime-steel-v1',
  truckLight: 'newworld-prime-headlight-v1',
  shedTimber: 'newworld-prime-shed-timber-v1',
  shedRoofFelt: 'newworld-prime-shed-roof-felt-v1',
  shedFloor: 'newworld-prime-shed-floor-v1',
  fenceTimber: 'newworld-prime-fence-timber-v1',
  lampSteel: 'newworld-prime-lamp-steel-v1',
  lampLens: 'newworld-prime-lamp-lens-v1',
  hedgeLeaf: 'newworld-prime-hedge-leaf-v1',
  concretePad: 'newworld-prime-concrete-pad-v1',
  planterConcrete: 'newworld-prime-planter-concrete-v1',
  signTimber: 'newworld-prime-sign-timber-v1',
  signFace: 'newworld-prime-sign-face-v1',
  carRustRed: 'newworld-prime-rusty-car-red-v1',
  carGlass: 'newworld-prime-vehicle-glass-v1',
  carRubber: 'newworld-prime-rubber-v1',
  carSteel: 'newworld-prime-steel-v1',
  rustPatch: 'newworld-prime-rust-patch-v1',
} as const);

// ---------------------------------------------------------------------------
// Named dimensions (contract: metres, millimetres where small).
// ---------------------------------------------------------------------------

/** School-bus body: 11.2 m long, 2.50 m wide, 2.60 m tall, floor at 0.55 m. */
export const NEWWORLD_PRIME_SCHOOL_BUS_LENGTH_METRES = 11.2;
export const NEWWORLD_PRIME_SCHOOL_BUS_WIDTH_METRES = 2.5;
export const NEWWORLD_PRIME_SCHOOL_BUS_BODY_HEIGHT_METRES = 2.6;
export const NEWWORLD_PRIME_SCHOOL_BUS_FLOOR_HEIGHT_METRES = 0.55;
/** School-bus wheels: 500 mm radius class. */
export const NEWWORLD_PRIME_SCHOOL_BUS_WHEEL_DIAMETER_MM = 1000;
export const NEWWORLD_PRIME_SCHOOL_BUS_WHEEL_WIDTH_MM = 700;

/** Semi-truck: cab 2.8 m + trailer 9.6 m; widths 2.50/2.55 m. */
export const NEWWORLD_PRIME_SEMI_CAB_LENGTH_METRES = 2.8;
export const NEWWORLD_PRIME_SEMI_TRAILER_LENGTH_METRES = 9.6;
export const NEWWORLD_PRIME_SEMI_WIDTH_METRES = 2.55;
export const NEWWORLD_PRIME_SEMI_CAB_HEIGHT_METRES = 3.4;
export const NEWWORLD_PRIME_SEMI_TRAILER_HEIGHT_METRES = 2.7;
/** Semi-truck wheels: 480 mm radius class. */
export const NEWWORLD_PRIME_SEMI_WHEEL_DIAMETER_MM = 960;

/** Shed: 3.6 m wide, 2.5 m tall, 4.2 m deep (field-shed family). */
export const NEWWORLD_PRIME_SHED_WIDTH_METRES = 3.6;
export const NEWWORLD_PRIME_SHED_HEIGHT_METRES = 2.5;
export const NEWWORLD_PRIME_SHED_DEPTH_METRES = 4.2;

/** Privacy fence: 1.80 m panels, 2.40 m bays, 120 mm posts. */
export const NEWWORLD_PRIME_FENCE_PANEL_HEIGHT_METRES = 1.8;
export const NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES = 2.4;
export const NEWWORLD_PRIME_FENCE_POST_WIDTH_MM = 120;

/** Street lamp: 5.50 m pole, 1.15 m outreach arm (street family). */
export const NEWWORLD_PRIME_LAMP_POLE_HEIGHT_METRES = 5.5;
export const NEWWORLD_PRIME_LAMP_ARM_LENGTH_METRES = 1.15;

/** Hedge blob: 540 mm radius class (shrub family). */
export const NEWWORLD_PRIME_HEDGE_BLOB_RADIUS_MM = 540;

/** Concrete pad: 150 mm slab. */
export const NEWWORLD_PRIME_PAD_THICKNESS_MM = 150;

/** Welcome sign: 3.60 m board, 1.20 m tall, top at 3.10 m. */
export const NEWWORLD_PRIME_SIGN_BOARD_WIDTH_METRES = 3.6;
export const NEWWORLD_PRIME_SIGN_BOARD_HEIGHT_METRES = 1.2;
export const NEWWORLD_PRIME_SIGN_TOP_HEIGHT_METRES = 3.1;

/** Rusty car (saloon): 4.40 m long, 1.80 m wide, 1.45 m tall. */
export const NEWWORLD_PRIME_RUSTY_CAR_LENGTH_METRES = 4.4;
export const NEWWORLD_PRIME_RUSTY_CAR_WIDTH_METRES = 1.8;
export const NEWWORLD_PRIME_RUSTY_CAR_HEIGHT_METRES = 1.45;

// ---------------------------------------------------------------------------
// Vehicle family triangle-budget fences (observed: coach 10k / truck 6k / saloon 9k).
// ---------------------------------------------------------------------------

/** Coach-family fence (school bus). Observed build sits far inside it. */
export const NEWWORLD_PRIME_SCHOOL_BUS_TRIANGLE_BUDGET = 10_000;
/** Truck-family fence (semi-truck). Observed build sits far inside it. */
export const NEWWORLD_PRIME_SEMI_TRUCK_TRIANGLE_BUDGET = 6_000;
/** Saloon-family fence (rusty car). Observed build sits far inside it. */
export const NEWWORLD_PRIME_RUSTY_CAR_TRIANGLE_BUDGET = 9_000;

function part(
  id: string,
  role: NewworldPrimePropRole,
  primitive: NewworldPrimePropPrimitive,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  materialId: string,
  triangleEstimate: number,
  rotationY = 0,
): NewworldPrimePropPart {
  return Object.freeze({ id, role, primitive, offset, size, rotationY, materialId, triangleEstimate });
}

// ---------------------------------------------------------------------------
// School bus (coach family). Bar: batch-3 props school-bus face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_SCHOOL_BUS_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('school-bus-body', 'body', 'box', [0, 1.85, 0],
    [NEWWORLD_PRIME_SCHOOL_BUS_WIDTH_METRES, NEWWORLD_PRIME_SCHOOL_BUS_BODY_HEIGHT_METRES, NEWWORLD_PRIME_SCHOOL_BUS_LENGTH_METRES],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.busYellow, 240),
  part('school-bus-skirt', 'skirt', 'box', [0, 0.72, 0],
    [NEWWORLD_PRIME_SCHOOL_BUS_WIDTH_METRES + 0.08, 0.5, NEWWORLD_PRIME_SCHOOL_BUS_LENGTH_METRES - 0.4],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.busSteel, 12),
  part('school-bus-roof', 'roof', 'box', [0, 3.28, 0],
    [NEWWORLD_PRIME_SCHOOL_BUS_WIDTH_METRES - 0.2, 0.24, NEWWORLD_PRIME_SCHOOL_BUS_LENGTH_METRES - 0.6],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.busCream, 12),
  part('school-bus-windshield', 'glass', 'box', [0, 2.35, -5.62],
    [2.1, 1.1, 0.08], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busGlass, 12),
  part('school-bus-rear-glass', 'glass', 'box', [0, 2.35, 5.62],
    [2.0, 1.0, 0.08], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busGlass, 12),
  ...([-3.6, -1.2, 1.2, 3.6].flatMap((z, index) => ([
    part(`school-bus-window-left-${index}`, 'glass', 'box', [-1.26, 2.35, z],
      [0.06, 1.0, 1.7], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busGlass, 12),
    part(`school-bus-window-right-${index}`, 'glass', 'box', [1.26, 2.35, z],
      [0.06, 1.0, 1.7], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busGlass, 12),
  ]))),
  part('school-bus-door', 'door', 'box', [1.26, 1.7, -4.7],
    [0.08, 1.9, 1.1], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busGlass, 12),
  ...([[-0.95, -3.7], [0.95, -3.7], [-0.95, 3.7], [0.95, 3.7]].map(([x, z], index) =>
    part(`school-bus-wheel-${index}`, 'wheel', 'cylinder', [x, 0.5, z],
      [NEWWORLD_PRIME_SCHOOL_BUS_WHEEL_DIAMETER_MM / 1000, NEWWORLD_PRIME_SCHOOL_BUS_WHEEL_WIDTH_MM / 1000, NEWWORLD_PRIME_SCHOOL_BUS_WHEEL_DIAMETER_MM / 1000],
      NEWWORLD_PRIME_PROP_MATERIAL_IDS.busRubber, 96, Math.PI / 2))),
  part('school-bus-front-bumper', 'bumper', 'box', [0, 0.55, -5.75],
    [2.5, 0.3, 0.25], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busSteel, 12),
  part('school-bus-rear-bumper', 'bumper', 'box', [0, 0.55, 5.75],
    [2.5, 0.3, 0.25], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busSteel, 12),
  part('school-bus-headlight-left', 'light', 'cylinder', [-0.85, 1.15, -5.63],
    [0.26, 0.08, 0.26], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busLight, 40, Math.PI / 2),
  part('school-bus-headlight-right', 'light', 'cylinder', [0.85, 1.15, -5.63],
    [0.26, 0.08, 0.26], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busLight, 40, Math.PI / 2),
  part('school-bus-mirror-left', 'mirror', 'box', [-1.45, 2.2, -5.4],
    [0.3, 0.4, 0.1], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busSteel, 12),
  part('school-bus-mirror-right', 'mirror', 'box', [1.45, 2.2, -5.4],
    [0.3, 0.4, 0.1], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busSteel, 12),
  part('school-bus-destination', 'sign-face', 'plane', [0, 2.95, -5.64],
    [1.8, 0.45, 0], NEWWORLD_PRIME_PROP_MATERIAL_IDS.busCream, 2),
]);

// ---------------------------------------------------------------------------
// Semi-truck (truck family). Bar: batch-3 props semi-truck face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_SEMI_TRUCK_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('semi-cab', 'body', 'box', [0, 2.0, -5.9],
    [NEWWORLD_PRIME_SEMI_WIDTH_METRES, NEWWORLD_PRIME_SEMI_CAB_HEIGHT_METRES, NEWWORLD_PRIME_SEMI_CAB_LENGTH_METRES],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckCabRed, 120),
  part('semi-windshield', 'glass', 'box', [0, 2.6, -7.32],
    [2.2, 1.0, 0.08], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckGlass, 12),
  part('semi-grille', 'grille', 'box', [0, 1.1, -7.34],
    [2.2, 0.8, 0.1], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckSteel, 12),
  part('semi-fairing', 'fairing', 'box', [0, 3.7, -5.9],
    [2.3, 0.5, 2.5], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckCabRed, 12),
  part('semi-tank-left', 'tank', 'cylinder', [-1.0, 0.9, -4.6],
    [0.6, 1.6, 0.6], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckSteel, 72, Math.PI / 2),
  part('semi-tank-right', 'tank', 'cylinder', [1.0, 0.9, -4.6],
    [0.6, 1.6, 0.6], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckSteel, 72, Math.PI / 2),
  part('semi-trailer', 'trailer', 'box', [0, 2.05, 1.4],
    [NEWWORLD_PRIME_SEMI_WIDTH_METRES, NEWWORLD_PRIME_SEMI_TRAILER_HEIGHT_METRES, NEWWORLD_PRIME_SEMI_TRAILER_LENGTH_METRES],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckTrailerWhite, 120),
  part('semi-trailer-door-left', 'door', 'box', [-0.62, 2.0, 6.22],
    [1.2, 2.4, 0.08], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckSteel, 12),
  part('semi-trailer-door-right', 'door', 'box', [0.62, 2.0, 6.22],
    [1.2, 2.4, 0.08], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckSteel, 12),
  ...([[-0.95, -6.3], [0.95, -6.3], [-0.95, -4.9], [0.95, -4.9], [-0.95, 3.4], [0.95, 3.4]].map(([x, z], index) =>
    part(`semi-wheel-${index}`, 'wheel', 'cylinder', [x, 0.48, z],
      [NEWWORLD_PRIME_SEMI_WHEEL_DIAMETER_MM / 1000, 0.7, NEWWORLD_PRIME_SEMI_WHEEL_DIAMETER_MM / 1000],
      NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckRubber, 96, Math.PI / 2))),
  part('semi-front-bumper', 'bumper', 'box', [0, 0.55, -7.4],
    [2.5, 0.3, 0.25], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckSteel, 12),
  part('semi-headlight-left', 'light', 'cylinder', [-0.85, 1.0, -7.36],
    [0.24, 0.08, 0.24], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckLight, 40, Math.PI / 2),
  part('semi-headlight-right', 'light', 'cylinder', [0.85, 1.0, -7.36],
    [0.24, 0.08, 0.24], NEWWORLD_PRIME_PROP_MATERIAL_IDS.truckLight, 40, Math.PI / 2),
]);

// ---------------------------------------------------------------------------
// Shed (x2 placements). Bar: batch-3 props shed face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_SHED_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('shed-wall-front', 'wall', 'box', [0, 1.25, -NEWWORLD_PRIME_SHED_DEPTH_METRES / 2],
    [NEWWORLD_PRIME_SHED_WIDTH_METRES, NEWWORLD_PRIME_SHED_HEIGHT_METRES, 0.1],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedTimber, 12),
  part('shed-wall-back', 'wall', 'box', [0, 1.25, NEWWORLD_PRIME_SHED_DEPTH_METRES / 2],
    [NEWWORLD_PRIME_SHED_WIDTH_METRES, NEWWORLD_PRIME_SHED_HEIGHT_METRES, 0.1],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedTimber, 12),
  part('shed-wall-left', 'wall', 'box', [-NEWWORLD_PRIME_SHED_WIDTH_METRES / 2, 1.25, 0],
    [0.1, NEWWORLD_PRIME_SHED_HEIGHT_METRES, NEWWORLD_PRIME_SHED_DEPTH_METRES],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedTimber, 12),
  part('shed-wall-right', 'wall', 'box', [NEWWORLD_PRIME_SHED_WIDTH_METRES / 2, 1.25, 0],
    [0.1, NEWWORLD_PRIME_SHED_HEIGHT_METRES, NEWWORLD_PRIME_SHED_DEPTH_METRES],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedTimber, 12),
  part('shed-roof-left', 'roof-slab', 'box', [-0.92, 2.72, 0],
    [1.95, 0.1, NEWWORLD_PRIME_SHED_DEPTH_METRES + 0.3],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedRoofFelt, 12, 0.18),
  part('shed-roof-right', 'roof-slab', 'box', [0.92, 2.72, 0],
    [1.95, 0.1, NEWWORLD_PRIME_SHED_DEPTH_METRES + 0.3],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedRoofFelt, 12, -0.18),
  part('shed-door', 'door', 'box', [0.7, 1.05, -NEWWORLD_PRIME_SHED_DEPTH_METRES / 2 - 0.06],
    [1.0, 1.9, 0.08], NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedTimber, 12),
  ...([[-1.7, -2.0], [1.7, -2.0], [-1.7, 2.0], [1.7, 2.0]].map(([x, z], index) =>
    part(`shed-frame-post-${index}`, 'frame-post', 'box', [x, 1.2, z],
      [0.12, 2.4, 0.12], NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedTimber, 12))),
  part('shed-floor', 'floor', 'box', [0, 0.05, 0],
    [NEWWORLD_PRIME_SHED_WIDTH_METRES - 0.1, 0.1, NEWWORLD_PRIME_SHED_DEPTH_METRES - 0.1],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.shedFloor, 12),
]);

// ---------------------------------------------------------------------------
// Privacy fence bay template. Bar: batch-3 props fence face.
// ---------------------------------------------------------------------------

/** One 2.40 m bay: panel + closing post; runs repeat it via newworldPrimePrivacyFenceRunParts. */
export const NEWWORLD_PRIME_PRIVACY_FENCE_PANEL_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('fence-panel', 'panel', 'box', [0, NEWWORLD_PRIME_FENCE_PANEL_HEIGHT_METRES / 2, 0],
    [NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES, NEWWORLD_PRIME_FENCE_PANEL_HEIGHT_METRES, 0.06],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.fenceTimber, 12),
  part('fence-post', 'post', 'box', [NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES / 2, 1.0, 0],
    [NEWWORLD_PRIME_FENCE_POST_WIDTH_MM / 1000, 2.0, NEWWORLD_PRIME_FENCE_POST_WIDTH_MM / 1000],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.fenceTimber, 12),
]);

// ---------------------------------------------------------------------------
// Street lamp template. Bar: batch-3 props lamp face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_STREET_LAMP_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('street-lamp-pole', 'pole', 'cylinder', [0, NEWWORLD_PRIME_LAMP_POLE_HEIGHT_METRES / 2, 0],
    [0.14, NEWWORLD_PRIME_LAMP_POLE_HEIGHT_METRES, 0.14],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.lampSteel, 48),
  part('street-lamp-arm', 'arm', 'box', [0.5, 5.45, 0],
    [NEWWORLD_PRIME_LAMP_ARM_LENGTH_METRES, 0.12, 0.12],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.lampSteel, 12),
  part('street-lamp-hood', 'hood', 'cylinder', [1.0, 5.32, 0],
    [0.34, 0.2, 0.34], NEWWORLD_PRIME_PROP_MATERIAL_IDS.lampSteel, 40),
  part('street-lamp-lens', 'lens', 'cylinder', [1.0, 5.2, 0],
    [0.22, 0.08, 0.22], NEWWORLD_PRIME_PROP_MATERIAL_IDS.lampLens, 32),
]);

// ---------------------------------------------------------------------------
// Hedge blob template. Bar: batch-3 props hedge face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_HEDGE_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('hedge-blob', 'foliage', 'icosahedron',
    [0, NEWWORLD_PRIME_HEDGE_BLOB_RADIUS_MM / 1000, 0],
    [NEWWORLD_PRIME_HEDGE_BLOB_RADIUS_MM / 1000, 0, 0],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.hedgeLeaf, 160),
  part('hedge-planter', 'planter', 'box', [0, 0.35, 0],
    [2.2, 0.7, 1.05], NEWWORLD_PRIME_PROP_MATERIAL_IDS.planterConcrete, 12),
]);

// ---------------------------------------------------------------------------
// Concrete pad template (150 mm slab). Bar: batch-3 props pad face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_CONCRETE_PAD_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('concrete-pad-slab', 'pad', 'box', [0, NEWWORLD_PRIME_PAD_THICKNESS_MM / 2000, 0],
    [4.2, NEWWORLD_PRIME_PAD_THICKNESS_MM / 1000, 4.8],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.concretePad, 12),
]);

// ---------------------------------------------------------------------------
// Welcome sign. Bar: batch-3 props sign face + batch-2-layout/map__north-entrance.png.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_WELCOME_SIGN_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('welcome-sign-post-left', 'post', 'box', [-1.5, 1.15, 0],
    [0.18, 2.3, 0.18], NEWWORLD_PRIME_PROP_MATERIAL_IDS.signTimber, 12),
  part('welcome-sign-post-right', 'post', 'box', [1.5, 1.15, 0],
    [0.18, 2.3, 0.18], NEWWORLD_PRIME_PROP_MATERIAL_IDS.signTimber, 12),
  part('welcome-sign-board', 'sign-board', 'box', [0, 2.5, 0],
    [NEWWORLD_PRIME_SIGN_BOARD_WIDTH_METRES, NEWWORLD_PRIME_SIGN_BOARD_HEIGHT_METRES, 0.12],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.signTimber, 12),
  part('welcome-sign-face', 'sign-face', 'plane', [0, 2.5, -0.07],
    [3.4, 1.0, 0], NEWWORLD_PRIME_PROP_MATERIAL_IDS.signFace, 2, Math.PI),
]);

// ---------------------------------------------------------------------------
// Rusty car (saloon family). Bar: batch-3 props rusty-car face.
// ---------------------------------------------------------------------------

export const NEWWORLD_PRIME_RUSTY_CAR_PARTS: readonly NewworldPrimePropPart[] = Object.freeze([
  part('rusty-car-body', 'body', 'box', [0, 0.75, 0],
    [NEWWORLD_PRIME_RUSTY_CAR_WIDTH_METRES, 0.65, NEWWORLD_PRIME_RUSTY_CAR_LENGTH_METRES],
    NEWWORLD_PRIME_PROP_MATERIAL_IDS.carRustRed, 60),
  part('rusty-car-cabin', 'body', 'box', [0, 1.3, 0.2],
    [1.6, 0.55, 2.2], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carRustRed, 60),
  part('rusty-car-windshield', 'glass', 'box', [0, 1.28, -0.95],
    [1.5, 0.5, 0.06], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carGlass, 12),
  part('rusty-car-rear-glass', 'glass', 'box', [0, 1.28, 1.32],
    [1.5, 0.45, 0.06], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carGlass, 12),
  part('rusty-car-side-left', 'glass', 'box', [-0.81, 1.28, 0.2],
    [0.05, 0.45, 1.9], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carGlass, 12),
  part('rusty-car-side-right', 'glass', 'box', [0.81, 1.28, 0.2],
    [0.05, 0.45, 1.9], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carGlass, 12),
  ...([[-0.8, -1.45], [0.8, -1.45], [-0.8, 1.45], [0.8, 1.45]].map(([x, z], index) =>
    part(`rusty-car-wheel-${index}`, 'wheel', 'cylinder', [x, 0.33, z],
      [0.66, 0.24, 0.66], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carRubber, 72, Math.PI / 2))),
  part('rusty-car-front-bumper', 'bumper', 'box', [0, 0.45, -2.28],
    [1.8, 0.22, 0.18], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carSteel, 12),
  part('rusty-car-rear-bumper', 'bumper', 'box', [0, 0.45, 2.28],
    [1.8, 0.22, 0.18], NEWWORLD_PRIME_PROP_MATERIAL_IDS.carSteel, 12),
  part('rusty-car-rust-hood', 'rust-patch', 'plane', [0.2, 1.09, -1.6],
    [1.2, 0.8, 0], NEWWORLD_PRIME_PROP_MATERIAL_IDS.rustPatch, 2, 0.12),
  part('rusty-car-rust-door', 'rust-patch', 'plane', [-0.91, 0.75, 0.4],
    [1.0, 0.5, 0], NEWWORLD_PRIME_PROP_MATERIAL_IDS.rustPatch, 2, -Math.PI / 2),
]);

// ---------------------------------------------------------------------------
// Placements (presentation defaults; authority rows untouched).
// ---------------------------------------------------------------------------

/** Fact 4: center pair — school bus west of origin, nose south. */
export const NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT: NewworldPrimePropPlacement = Object.freeze({
  id: 'newworld-prime-school-bus-center', x: -3.4, z: 1.2, rotationY: Math.PI / 2 + 0.14,
});

/** Fact 4: center pair — semi-truck east of origin, nose north (staggered, not mirrored). */
export const NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT: NewworldPrimePropPlacement = Object.freeze({
  id: 'newworld-prime-semi-truck-center', x: 3.6, z: -1.4, rotationY: -Math.PI / 2 - 0.1,
});

/** Fact 5: exactly two sheds, opposite quadrants. */
export const NEWWORLD_PRIME_SHED_PLACEMENTS: readonly NewworldPrimePropPlacement[] = Object.freeze([
  Object.freeze({ id: 'newworld-prime-shed-northwest', x: -18.5, z: -14.0, rotationY: 0.35 }),
  Object.freeze({ id: 'newworld-prime-shed-southeast', x: 18.0, z: 15.5, rotationY: Math.PI + 0.3 }),
]);

/** Fact 6: privacy fence runs (bay counts; assembler repeats the panel template). */
export const NEWWORLD_PRIME_PRIVACY_FENCE_RUNS: readonly (NewworldPrimePropPlacement & Readonly<{ bays: number }>)[] = Object.freeze([
  Object.freeze({ id: 'newworld-prime-fence-west', x: -26.0, z: 6.0, rotationY: Math.PI / 2, bays: 6 }),
  Object.freeze({ id: 'newworld-prime-fence-east', x: 26.0, z: -8.0, rotationY: Math.PI / 2, bays: 6 }),
  Object.freeze({ id: 'newworld-prime-fence-north', x: -8.0, z: -30.0, rotationY: 0, bays: 5 }),
]);

/** Fact 7a: street lamps ringing the center and the entrance. */
export const NEWWORLD_PRIME_STREET_LAMP_PLACEMENTS: readonly NewworldPrimePropPlacement[] = Object.freeze([
  Object.freeze({ id: 'newworld-prime-lamp-north', x: -6.0, z: -12.0, rotationY: 0 }),
  Object.freeze({ id: 'newworld-prime-lamp-south', x: 6.0, z: 12.0, rotationY: Math.PI }),
  Object.freeze({ id: 'newworld-prime-lamp-entrance-west', x: -10.0, z: 30.0, rotationY: Math.PI / 2 }),
  Object.freeze({ id: 'newworld-prime-lamp-entrance-east', x: 10.0, z: 30.0, rotationY: -Math.PI / 2 }),
]);

/** Fact 7b: hedge rows (blob counts; assembler repeats the blob template). */
export const NEWWORLD_PRIME_HEDGE_RUNS: readonly (NewworldPrimePropPlacement & Readonly<{ blobs: number }>)[] = Object.freeze([
  Object.freeze({ id: 'newworld-prime-hedge-north', x: -14.0, z: -24.0, rotationY: 0, blobs: 5 }),
  Object.freeze({ id: 'newworld-prime-hedge-south', x: 14.0, z: 24.0, rotationY: Math.PI, blobs: 5 }),
]);

/** Fact 8: concrete pads under sheds, center pair, and entrance. */
export const NEWWORLD_PRIME_CONCRETE_PAD_PLACEMENTS: readonly NewworldPrimePropPlacement[] = Object.freeze([
  Object.freeze({ id: 'newworld-prime-pad-bus', x: -3.4, z: 1.2, rotationY: Math.PI / 2 + 0.14 }),
  Object.freeze({ id: 'newworld-prime-pad-truck', x: 3.6, z: -1.4, rotationY: -Math.PI / 2 - 0.1 }),
  Object.freeze({ id: 'newworld-prime-pad-shed-northwest', x: -18.5, z: -14.0, rotationY: 0.35 }),
  Object.freeze({ id: 'newworld-prime-pad-shed-southeast', x: 18.0, z: 15.5, rotationY: Math.PI + 0.3 }),
  Object.freeze({ id: 'newworld-prime-pad-entrance', x: 0, z: 32.5, rotationY: 0 }),
]);

/** Fact 9a: welcome sign at the north entrance (faces incoming players). */
export const NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT: NewworldPrimePropPlacement = Object.freeze({
  id: 'newworld-prime-welcome-sign', x: 0, z: 34.5, rotationY: Math.PI,
});

/** Fact 9b: rusty car showcase placement (reservation doubles as its pad). */
export const NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT: NewworldPrimePropPlacement = Object.freeze({
  id: 'newworld-prime-rusty-car', x: -12.5, z: 22.0, rotationY: 0.6,
});

/** Fact 9c: jeep footprint reservation — kept clear, built in a later wave. */
export const NEWWORLD_PRIME_JEEP_RESERVATION: NewworldPrimePropReservation = Object.freeze({
  id: 'newworld-prime-jeep-reservation', x: 13.5, z: -21.0, rotationY: -0.5,
  halfWidth: 1.1, halfLength: 2.3,
});

/** Fact 9d: sandbag ring footprint reservation — kept clear, built in a later wave. */
export const NEWWORLD_PRIME_SANDBAG_RESERVATION: NewworldPrimePropReservation = Object.freeze({
  id: 'newworld-prime-sandbag-reservation', x: 0, z: 8.5, rotationY: 0,
  halfWidth: 2.0, halfLength: 1.0,
});

// ---------------------------------------------------------------------------
// Seeded run generators (deterministic jitter only; never Math.random).
// ---------------------------------------------------------------------------

/**
 * Repeats the fence-bay template along local +X with deterministic lean jitter.
 * The assembler adds the run placement transform (position + yaw) on top.
 */
export function newworldPrimePrivacyFenceRunParts(
  bays: number,
  seed: number | string = NEWWORLD_PRIME_PROPS_SEED,
): readonly NewworldPrimePropPart[] {
  const rng = new DeterministicRng(seed).fork('privacy-fence');
  const out: NewworldPrimePropPart[] = [];
  for (let bay = 0; bay < bays; bay += 1) {
    const x = bay * NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES;
    const lean = (rng.next() - 0.5) * 0.02;
    for (const template of NEWWORLD_PRIME_PRIVACY_FENCE_PANEL_PARTS) {
      const [ox, oy, oz] = template.offset;
      out.push(Object.freeze({
        ...template,
        id: `${template.id}-bay-${bay}`,
        offset: Object.freeze([x + ox, oy + lean * bay, oz] as const),
      }));
    }
  }
  return Object.freeze(out);
}

/**
 * Repeats the hedge blob along local +X with deterministic height/yaw jitter.
 * Planter repeats every third blob; blobs are spaced 1.10 m apart.
 */
export function newworldPrimeHedgeRowParts(
  blobs: number,
  seed: number | string = NEWWORLD_PRIME_PROPS_SEED,
): readonly NewworldPrimePropPart[] {
  const rng = new DeterministicRng(seed).fork('hedge-row');
  const out: NewworldPrimePropPart[] = [];
  const blob = NEWWORLD_PRIME_HEDGE_PARTS[0];
  const planter = NEWWORLD_PRIME_HEDGE_PARTS[1];
  for (let index = 0; index < blobs; index += 1) {
    const x = index * 1.1;
    const lift = (rng.next() - 0.5) * 0.08;
    const yaw = rng.next() * Math.PI * 2;
    const [ox, oy, oz] = blob.offset;
    out.push(Object.freeze({
      ...blob,
      id: `${blob.id}-${index}`,
      offset: Object.freeze([x + ox, oy + lift, oz] as const),
      rotationY: yaw,
    }));
    if (index % 3 === 0) {
      const [px, py, pz] = planter.offset;
      out.push(Object.freeze({ ...planter, id: `${planter.id}-${index}`, offset: Object.freeze([x + px, py, pz] as const) }));
    }
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Budget fences (new arena owns its 60k-class lane; world-studio lane untouched).
// ---------------------------------------------------------------------------

/** Sums triangle estimates for one part list. */
export function newworldPrimePropTriangleTotal(parts: readonly NewworldPrimePropPart[]): number {
  return parts.reduce((total, partDescriptor) => total + partDescriptor.triangleEstimate, 0);
}

/** Observed estimate totals (frozen at authoring; validate* enforces the fences). */
export const NEWWORLD_PRIME_SCHOOL_BUS_TRIANGLES_OBSERVED = newworldPrimePropTriangleTotal(NEWWORLD_PRIME_SCHOOL_BUS_PARTS);
export const NEWWORLD_PRIME_SEMI_TRUCK_TRIANGLES_OBSERVED = newworldPrimePropTriangleTotal(NEWWORLD_PRIME_SEMI_TRUCK_PARTS);
export const NEWWORLD_PRIME_RUSTY_CAR_TRIANGLES_OBSERVED = newworldPrimePropTriangleTotal(NEWWORLD_PRIME_RUSTY_CAR_PARTS);

/** Returns one error per blown family fence; empty means inside every budget. */
export function validateNewworldPrimePropBudgets(): readonly string[] {
  const errors: string[] = [];
  const bus = newworldPrimePropTriangleTotal(NEWWORLD_PRIME_SCHOOL_BUS_PARTS);
  const truck = newworldPrimePropTriangleTotal(NEWWORLD_PRIME_SEMI_TRUCK_PARTS);
  const car = newworldPrimePropTriangleTotal(NEWWORLD_PRIME_RUSTY_CAR_PARTS);
  if (bus > NEWWORLD_PRIME_SCHOOL_BUS_TRIANGLE_BUDGET) errors.push(`school-bus ${bus} > ${NEWWORLD_PRIME_SCHOOL_BUS_TRIANGLE_BUDGET}`);
  if (truck > NEWWORLD_PRIME_SEMI_TRUCK_TRIANGLE_BUDGET) errors.push(`semi-truck ${truck} > ${NEWWORLD_PRIME_SEMI_TRUCK_TRIANGLE_BUDGET}`);
  if (car > NEWWORLD_PRIME_RUSTY_CAR_TRIANGLE_BUDGET) errors.push(`rusty-car ${car} > ${NEWWORLD_PRIME_RUSTY_CAR_TRIANGLE_BUDGET}`);
  return Object.freeze(errors);
}
