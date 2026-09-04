/**
 * Bake-only Nuke Town SH-L2 occluders.
 *
 * This is deliberately not the ray-tracing proxy registration. The material
 * volume needs roofs, floors, walls and authored openings to keep an interior
 * from sampling the sunlit street; the combat ray tracer keeps its separate
 * shape envelope. No gameplay collider is added here and
 * the large world ground collider is intentionally absent.
 */
import {
  DEFAULT_PROXY_EXTRACTION,
  finaliseProxyScene,
  type ProxyScene,
  type ProxyShape,
  vec3,
} from '../raytracing/analytic-proxy-scene';
import {
  NUKETOWN2_BUILDING_FOOTPRINTS,
  NUKETOWN2_DOORWAYS,
  NUKETOWN2_SECTION,
  NUKETOWN2_WINDOWS,
} from '../../nuketown2-arena';

type Run = Readonly<{ start: number; end: number; bottom: number; top: number }>;

const FLOOR_TOP = 0.3;
const ROOF_THICKNESS = 0.3;
const WALL_THICKNESS = 0.3;
const HOUSE_INTERNAL_Z = -16.5;
const HOUSE_WALL_TOP = 6.2;
const GARAGE_WALL_TOP = 2.7;
const SURFACE_ALBEDO = vec3(0.62, 0.58, 0.5);

function addBox(
  shapes: ProxyShape[],
  name: string,
  centre: readonly [number, number, number],
  halfExtents: readonly [number, number, number],
  albedo = SURFACE_ALBEDO,
): void {
  const [x, y, z] = centre as readonly [number, number, number];
  if (halfExtents.some((value) => !(value > 0))) return;
  shapes.push(Object.freeze({
    kind: 'box' as const,
    centre: vec3(x, y, z),
    halfExtents: vec3(halfExtents[0], halfExtents[1], halfExtents[2]),
    yaw: 0,
    normal: vec3(0, 0, 0),
    albedo,
    metalness: 0,
    roughness: 0.86,
    name,
  }));
}

function transformPoint(point: readonly [number, number], mirrored: boolean): readonly [number, number] {
  return mirrored ? [-point[0], -point[1]] : point;
}

function transformRun(run: Run, mirrored: boolean): Run {
  if (!mirrored) return run;
  return { ...run, start: -run.end, end: -run.start };
}

function emitWallWithOpenings(
  shapes: ProxyShape[],
  name: string,
  axis: 'x' | 'z',
  fixed: number,
  minimum: number,
  maximum: number,
  bottom: number,
  top: number,
  openings: readonly Run[],
  mirrored: boolean,
): void {
  const transformed = openings.map((run) => transformRun(run, mirrored))
    .filter((run) => run.end > minimum && run.start < maximum)
    .map((run) => ({
      start: Math.max(minimum, run.start),
      end: Math.min(maximum, run.end),
      bottom: Math.max(bottom, run.bottom),
      top: Math.min(top, run.top),
    }))
    .filter((run) => run.end > run.start && run.top > run.bottom)
    .sort((left, right) => left.start - right.start);

  let cursor = minimum;
  const emit = (start: number, end: number, y0: number, y1: number, part: string): void => {
    if (end <= start || y1 <= y0) return;
    const middle = (start + end) / 2;
    if (axis === 'x') addBox(shapes, `${name} ${part}`, [middle, (y0 + y1) / 2, fixed], [(end - start) / 2, (y1 - y0) / 2, WALL_THICKNESS / 2]);
    else addBox(shapes, `${name} ${part}`, [fixed, (y0 + y1) / 2, middle], [WALL_THICKNESS / 2, (y1 - y0) / 2, (end - start) / 2]);
  };
  for (const opening of transformed) {
    emit(cursor, opening.start, bottom, top, 'pier');
    emit(opening.start, opening.end, bottom, opening.bottom, 'sill');
    emit(opening.start, opening.end, opening.top, top, 'lintel');
    cursor = Math.max(cursor, opening.end);
  }
  emit(cursor, maximum, bottom, top, 'pier');
}

function xWallOpenings(wallX: number): Run[] {
  return NUKETOWN2_DOORWAYS
    .filter((door) => door.span === 'z' && Math.abs(door.at - wallX) < 0.5)
    .map((door) => ({ start: door.centre - door.width / 2, end: door.centre + door.width / 2, bottom: FLOOR_TOP, top: door.headY }));
}

function zWallOpenings(wallZ: number): Run[] {
  const doors = NUKETOWN2_DOORWAYS
    .filter((door) => door.span === 'x' && Math.abs(door.at - wallZ) < 0.5)
    .map((door) => ({ start: door.centre - door.width / 2, end: door.centre + door.width / 2, bottom: FLOOR_TOP, top: door.headY }));
  const windows = NUKETOWN2_WINDOWS
    .filter((window) => Math.abs(window.wallZ - wallZ) < 0.5)
    .map((window) => ({ start: window.x0, end: window.x1, bottom: window.sillTop, top: window.headY }));
  return [...doors, ...windows];
}

function addBuildingShell(
  shapes: ProxyShape[],
  footprint: (typeof NUKETOWN2_BUILDING_FOOTPRINTS)[number],
  mirrored: boolean,
): void {
  const section = NUKETOWN2_SECTION;
  const width = footprint.x1 - footprint.x0;
  const depth = footprint.z1 - footprint.z0;
  const expectedWidth = footprint.id === 'house' ? section.houseWidth : section.garageWidth;
  const expectedDepth = footprint.id === 'house' ? section.houseDepth : section.garageDepth;
  if (Math.abs(width - expectedWidth) > 1e-6 || Math.abs(depth - expectedDepth) > 1e-6) {
    throw new Error(`Nuke Town SH-L2 footprint drift: ${footprint.id}`);
  }
  const [x0, z0] = transformPoint([footprint.x0, footprint.z0], mirrored);
  const [x1, z1] = transformPoint([footprint.x1, footprint.z1], mirrored);
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1);
  const maxZ = Math.max(z0, z1);
  const wallTop = footprint.id === 'house' ? HOUSE_WALL_TOP : GARAGE_WALL_TOP;
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  addBox(shapes, `sh-l2 ${footprint.id} floor${mirrored ? ' mirrored' : ''}`, [centreX, FLOOR_TOP / 2, centreZ], [width / 2, FLOOR_TOP / 2, depth / 2]);
  addBox(shapes, `sh-l2 ${footprint.id} roof${mirrored ? ' mirrored' : ''}`, [centreX, wallTop + ROOF_THICKNESS / 2, centreZ], [width / 2, ROOF_THICKNESS / 2, depth / 2]);

  const zWalls: ReadonlyArray<readonly [string, number]> = [['front', minZ], ['back', maxZ]];
  for (const [label, wallZ] of zWalls) {
    const sourceZ = mirrored ? -wallZ : wallZ;
    const openings = zWallOpenings(sourceZ);
    emitWallWithOpenings(shapes, `sh-l2 ${footprint.id} ${label}${mirrored ? ' mirrored' : ''}`, 'x', wallZ, minX, maxX, FLOOR_TOP, wallTop, openings, mirrored);
  }
  const xWalls: ReadonlyArray<readonly [string, number]> = [['west', minX], ['east', maxX]];
  for (const [label, wallX] of xWalls) {
    const sourceX = mirrored ? -wallX : wallX;
    emitWallWithOpenings(
      shapes,
      `sh-l2 ${footprint.id} ${label}${mirrored ? ' mirrored' : ''}`,
      'z',
      wallX,
      minZ,
      maxZ,
      FLOOR_TOP,
      wallTop,
      xWallOpenings(sourceX),
      mirrored,
    );
  }

  if (footprint.id === 'house') {
    const partitionZ = mirrored ? -HOUSE_INTERNAL_Z : HOUSE_INTERNAL_Z;
    const internalDoor = NUKETOWN2_DOORWAYS.find((door) => door.id === 'house internal door');
    const openings = internalDoor ? [{
      start: internalDoor.centre - internalDoor.width / 2,
      end: internalDoor.centre + internalDoor.width / 2,
      bottom: FLOOR_TOP,
      top: internalDoor.headY,
    }] : [];
    emitWallWithOpenings(shapes, `sh-l2 house internal partition${mirrored ? ' mirrored' : ''}`, 'x', partitionZ, minX, maxX, FLOOR_TOP, wallTop, openings, mirrored);
  }
}

/** Builds only authored building occluders; there is no 220 x 220 ground slab. */
export function buildNuketown2ShL2BakeOccluders(): ProxyScene {
  const shapes: ProxyShape[] = [];
  for (const footprint of NUKETOWN2_BUILDING_FOOTPRINTS) {
    addBuildingShell(shapes, footprint, false);
    addBuildingShell(shapes, footprint, true);
  }
  return finaliseProxyScene(
    shapes,
    shapes.length,
    { ...DEFAULT_PROXY_EXTRACTION, maximumShapes: shapes.length, minimumFootprintM2: 0 },
  );
}
