import type { Material } from 'three';
import { box, type Builder } from './additional-maps';
import {
  NUKETOWN2_HANDEDNESS,
  NUKETOWN2_HOUSE_CENTRE_X,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_UPPER_Y0,
  nuketown2HandedX,
} from './nuketown2-layout';

type BoxOptions = Parameters<typeof box>[5];

export type Nuketown2RoofMaterials = Readonly<{
  roof: Material;
  roofGlazing: Material;
  timber: Material;
}>;

type RoofSide = 'north' | 'south';
type RoofBodyKind = 'rake' | 'solar-panel' | 'capsule-band';
type RoofMaterialRole = 'roof' | 'roofGlazing';

export type Nuketown2RoofBodySpec = Readonly<{
  id: string;
  side: RoofSide;
  kind: RoofBodyKind;
  name: string;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  material: RoofMaterialRole;
  solid: false;
  shots: boolean;
  planArea: number;
}>;

const HOUSE_BACK_Z = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH;
const HOUSE_MID_Z = (NUKETOWN2_HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;
const ROOF_PITCH_RADIANS = (8 * Math.PI) / 180;
const ROOF_VALLEY_Y = 6.55;
const ROOF_THICKNESS = 0.18;
const ROOF_WIDTH = NUKETOWN2_HOUSE_WIDTH + 0.3;
const ROOF_FRONT_EAVE_Z = NUKETOWN2_HOUSE_FRONT_Z + 0.6;
const ROOF_REAR_EAVE_Z = HOUSE_BACK_Z - 2.2;
const ROOF_FRONT_RUN = ROOF_FRONT_EAVE_Z - HOUSE_MID_Z;
const ROOF_REAR_RUN = HOUSE_MID_Z - ROOF_REAR_EAVE_Z;
const CAPSULE_RADIUS = 1.6;
const CAPSULE_LENGTH = 5;
const CAPSULE_BAND_COUNT = 8;
const CAPSULE_BAND_HEIGHT = CAPSULE_RADIUS / CAPSULE_BAND_COUNT;
const CAPSULE_CENTRES_X = [-4, 1.5] as const;

/** One authored panel body, placed six times on House A's rear rake. */
export const NUKETOWN2_SOLAR_PANEL = Object.freeze({
  size: Object.freeze([1.55, 0.06, 1.10] as const),
  xCentres: Object.freeze([-4.35, -1.25, 1.85] as const),
  slopeDistances: Object.freeze([2.2, 3.5] as const),
  proudOfRake: 0.05,
});

/**
 * The fairness footprint is the existing house plan, not the sum of projected
 * presentation boxes. Both show homes own the same 11 x 13 m plan, while their
 * roof forms deliberately differ. Keeping this metric explicit prevents a
 * future exception from quietly buying gameplay area with decoration.
 */
export const NUKETOWN2_ROOF_PLAN_AREA_BY_SIDE = Object.freeze({
  north: NUKETOWN2_HOUSE_WIDTH * NUKETOWN2_HOUSE_DEPTH,
  south: NUKETOWN2_HOUSE_WIDTH * NUKETOWN2_HOUSE_DEPTH,
});

const planeCentreY = (run: number): number => (
  ROOF_VALLEY_Y
  + (run / 2) * Math.sin(ROOF_PITCH_RADIANS)
  + (ROOF_THICKNESS / 2) * Math.cos(ROOF_PITCH_RADIANS)
);

const roofPlaneSpecs: readonly Nuketown2RoofBodySpec[] = Object.freeze([
  Object.freeze({
    id: 'house-a-front-rake',
    side: 'north' as const,
    kind: 'rake' as const,
    name: 'house A roof deck front rake',
    position: [NUKETOWN2_HOUSE_CENTRE_X, planeCentreY(ROOF_FRONT_RUN), (HOUSE_MID_Z + ROOF_FRONT_EAVE_Z) / 2] as const,
    size: [ROOF_WIDTH, ROOF_THICKNESS, ROOF_FRONT_RUN] as const,
    rotation: [-ROOF_PITCH_RADIANS, 0, 0] as const,
    material: 'roof' as const,
    solid: false as const,
    shots: true,
    planArea: ROOF_WIDTH * ROOF_FRONT_RUN,
  }),
  Object.freeze({
    id: 'house-a-rear-rake',
    side: 'north' as const,
    kind: 'rake' as const,
    name: 'house A roof deck rear rake',
    position: [NUKETOWN2_HOUSE_CENTRE_X, planeCentreY(ROOF_REAR_RUN), (HOUSE_MID_Z + ROOF_REAR_EAVE_Z) / 2] as const,
    size: [ROOF_WIDTH, ROOF_THICKNESS, ROOF_REAR_RUN] as const,
    rotation: [ROOF_PITCH_RADIANS, 0, 0] as const,
    material: 'roof' as const,
    solid: false as const,
    shots: true,
    planArea: ROOF_WIDTH * ROOF_REAR_RUN,
  }),
]);

const solarPanelSpecs: readonly Nuketown2RoofBodySpec[] = Object.freeze(
  NUKETOWN2_SOLAR_PANEL.slopeDistances.flatMap((slopeDistance, row) =>
    NUKETOWN2_SOLAR_PANEL.xCentres.map((x, column) => {
      const z = HOUSE_MID_Z - slopeDistance * Math.cos(ROOF_PITCH_RADIANS);
      const y = ROOF_VALLEY_Y + slopeDistance * Math.sin(ROOF_PITCH_RADIANS)
        + NUKETOWN2_SOLAR_PANEL.proudOfRake;
      return Object.freeze({
        id: `house-a-solar-panel-${row}-${column}`,
        side: 'north' as const,
        kind: 'solar-panel' as const,
        name: `house A solar panel ${row}-${column}`,
        position: [x, y, z] as const,
        size: NUKETOWN2_SOLAR_PANEL.size,
        rotation: [ROOF_PITCH_RADIANS, 0, 0] as const,
        material: 'roof' as const,
        solid: false as const,
        shots: false,
        planArea: NUKETOWN2_SOLAR_PANEL.size[0] * NUKETOWN2_SOLAR_PANEL.size[2],
      });
    }),
  ),
);

const capsuleSpecs: readonly Nuketown2RoofBodySpec[] = Object.freeze(
  CAPSULE_CENTRES_X.flatMap((x, capsule) => Array.from({ length: CAPSULE_BAND_COUNT }, (_, band) => {
    const midHeight = (band + 0.5) * CAPSULE_BAND_HEIGHT;
    const normalizedHeight = midHeight / CAPSULE_RADIUS;
    const halfChord = CAPSULE_RADIUS * Math.sqrt(Math.max(0, 1 - normalizedHeight ** 2));
    return Object.freeze({
      id: `house-b-capsule-${capsule}-band-${band}`,
      side: 'south' as const,
      kind: 'capsule-band' as const,
      name: `house B capsule ${capsule} band ${band}`,
      position: [x, ROOF_VALLEY_Y + midHeight, HOUSE_MID_Z] as const,
      size: [CAPSULE_LENGTH, CAPSULE_BAND_HEIGHT, halfChord * 2] as const,
      material: (band >= CAPSULE_BAND_COUNT - 2 ? 'roofGlazing' : 'roof') as RoofMaterialRole,
      solid: false as const,
      shots: false,
      planArea: CAPSULE_LENGTH * halfChord * 2,
    });
  })),
);

/** Expanded body table: the six panel placements and all sixteen capsule bands. */
export const NUKETOWN2_ROOF_BODY_TABLE: readonly Nuketown2RoofBodySpec[] = Object.freeze([
  ...roofPlaneSpecs,
  ...solarPanelSpecs,
  ...capsuleSpecs,
]);

/** The fourth fidelity exception is mechanically derived from the body table. */
export const NUKETOWN2_ROOF_SYMMETRY_EXCEPTION_NAMES: readonly string[] = Object.freeze(
  NUKETOWN2_ROOF_BODY_TABLE.map((body) => `nuketown2 ${body.side} ${body.name}`),
);

/** Fixed-envelope carpentry table; the existing collision ramp reads the same run. */
export const NUKETOWN2_EXTERIOR_STAIR = Object.freeze({
  width: 1.4,
  risers: 17,
  rise: NUKETOWN2_UPPER_Y0 / 17,
  totalRise: NUKETOWN2_UPPER_Y0,
  going: 4.2 / 16,
  run: 4.2,
  topX: -5.2,
  footX: -5.2 - 4.2,
  centreZ: HOUSE_BACK_Z - 0.7,
  angleRadians: Math.atan2(NUKETOWN2_UPPER_Y0, 4.2),
  stringerLength: Math.hypot(4.2, NUKETOWN2_UPPER_Y0),
  stringerHeight: 0.3,
  stringerDepth: 0.1,
  treadCount: 16,
  treadHeight: 0.08,
  riserDepth: 0.05,
  handrailHeight: 0.08,
  railPostHeight: 0.95,
  railPostSize: 0.1,
  railOffset: 0.95,
});

function materialFor(materials: Nuketown2RoofMaterials, role: RoofMaterialRole): Material {
  return role === 'roofGlazing' ? materials.roofGlazing : materials.roof;
}

export function northOnly(
  builder: Builder,
  name: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: Material,
  options: BoxOptions = {},
): void {
  const mesh = box(builder, `nuketown2 north ${name}`,
    [nuketown2HandedX(position[0]), position[1], position[2]],
    [size[0], size[1], size[2]], material, options);
  mesh.userData.nuketown2RoofBody = true;
  mesh.userData.nuketown2RoofSolid = false;
  mesh.userData.nuketown2RoofWalkable = false;
}

export function southOnly(
  builder: Builder,
  name: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: Material,
  options: BoxOptions,
): void {
  const mesh = box(builder, `nuketown2 south ${name}`,
    [-nuketown2HandedX(position[0]), position[1], -position[2]],
    [size[0], size[1], size[2]], material, options);
  mesh.userData.nuketown2RoofBody = true;
  mesh.userData.nuketown2RoofSolid = false;
  mesh.userData.nuketown2RoofWalkable = false;
}

/** Emit the deliberately one-sided roof forms after the existing presentation batch. */
export function buildNuketown2Rooflines(builder: Builder, materials: Nuketown2RoofMaterials): void {
  for (const body of NUKETOWN2_ROOF_BODY_TABLE) {
    const options: BoxOptions = {
      solid: body.solid,
      shots: body.shots,
      ...(body.rotation ? { rotation: [body.rotation[0], body.rotation[1], body.rotation[2]] as [number, number, number] } : {}),
    };
    const emit = body.side === 'north' ? northOnly : southOnly;
    emit(builder, body.name, body.position, body.size, materialFor(materials, body.material), options);
  }
}

function pairedStairBox(
  builder: Builder,
  name: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: Material,
  options: BoxOptions = {},
): void {
  const north = box(builder, `nuketown2 north ${name}`,
    [nuketown2HandedX(position[0]), position[1], position[2]],
    [size[0], size[1], size[2]], material, options);
  const southOptions: BoxOptions = options.rotation
    ? { ...options, rotation: [options.rotation[0], options.rotation[1], -options.rotation[2]] }
    : options;
  const south = box(builder, `nuketown2 south ${name}`,
    [-nuketown2HandedX(position[0]), position[1], -position[2]],
    [size[0], size[1], size[2]], material, southOptions);
  for (const mesh of [north, south]) {
    mesh.userData.nuketown2ExteriorStairBody = true;
    mesh.userData.nuketown2ExteriorStairSolid = false;
    mesh.userData.nuketown2ExteriorStairWalkable = false;
  }
}

/** Additive timber carpentry; movement remains owned by the two existing ramps. */
export function buildNuketown2ExteriorStairs(builder: Builder, materials: Nuketown2RoofMaterials): void {
  const stair = NUKETOWN2_EXTERIOR_STAIR;
  const stairAngle = NUKETOWN2_HANDEDNESS * stair.angleRadians;
  const centreX = (stair.topX + stair.footX) / 2;
  const stringerY = stair.totalRise / 2 - Math.cos(stair.angleRadians) * (0.08 + 0.15);
  const outboardZ = stair.centreZ - stair.width / 2;

  for (const [index, zOffset] of [-0.65, 0.65].entries()) {
    pairedStairBox(builder, `exterior stair stringer ${index}`,
      [centreX, stringerY, stair.centreZ + zOffset],
      [stair.stringerLength, stair.stringerHeight, stair.stringerDepth], materials.timber,
      { solid: false, shots: true, ballisticMaterial: 'wood', rotation: [0, 0, stairAngle] });
  }

  pairedStairBox(builder, 'exterior stair handrail',
    [centreX, stair.totalRise / 2 + stair.railOffset, outboardZ],
    [stair.stringerLength, stair.handrailHeight, stair.handrailHeight], materials.timber,
    { solid: false, shots: true, ballisticMaterial: 'wood', rotation: [0, 0, stairAngle] });

  pairedStairBox(builder, 'exterior stair rail post foot',
    [stair.footX, stair.railPostHeight / 2, outboardZ],
    [stair.railPostSize, stair.railPostHeight, stair.railPostSize], materials.timber,
    { solid: false, shots: false });
  pairedStairBox(builder, 'exterior stair rail post top',
    [stair.topX, stair.totalRise + stair.railPostHeight / 2, outboardZ],
    [stair.railPostSize, stair.railPostHeight, stair.railPostSize], materials.timber,
    { solid: false, shots: false });

  for (let index = 0; index < stair.treadCount; index += 1) {
    const treadTop = stair.totalRise - stair.rise * (index + 1);
    pairedStairBox(builder, `exterior stair closed riser ${index}`,
      [stair.topX - stair.going * (index + 1), treadTop - stair.rise / 2, stair.centreZ],
      [stair.riserDepth, stair.rise, stair.width - 0.2], materials.timber,
      { solid: false, shots: false });
    pairedStairBox(builder, `exterior stair tread ${index}`,
      [stair.topX - stair.going * (index + 0.5), treadTop - stair.treadHeight / 2, stair.centreZ],
      [stair.going, stair.treadHeight, stair.width], materials.timber,
      { solid: false, shots: false, cast: true });
  }
}
