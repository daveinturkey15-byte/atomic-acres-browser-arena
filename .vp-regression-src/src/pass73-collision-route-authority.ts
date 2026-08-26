import * as THREE from 'three';
import type { BallisticSurface } from './ballistics';
import type { Box2 } from './collision';
import type { Stance } from './gameplay';
import { solidBounds, type HouseArchitecture, type HouseOpening, type HouseSolid } from './house-navigation';
import type { ArenaMap } from './map';
import { STANCE_SHAPES } from './physics';

export const PASS73_COLLISION_ROUTE_SCHEMA = 'atomic-acres/collision-route-authority@1' as const;
export const PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES = 0.002;
export const PASS73_ROUTE_STANCES = Object.freeze(['stand', 'crouch', 'prone'] as const);
export const PASS73_COLLISION_VISUAL_ROLES = Object.freeze({
  'ground-west-wall': 'wall',
  'upper-floor-main': 'floor',
  'front-door-lintel': 'underside',
  'entrance-canopy': 'canopy',
  'upper-window-sill-wall': 'window-approach',
} as const);

export type Pass73CollisionRouteRole = typeof PASS73_COLLISION_VISUAL_ROLES[keyof typeof PASS73_COLLISION_VISUAL_ROLES];
export type Pass73CollisionRouteProfile = 'performance' | 'quality';
export type Pass73BoundsTuple = readonly [number, number, number, number, number, number];

export type Pass73CollisionRouteBinding = Readonly<{
  houseId: HouseArchitecture['id'];
  team: number;
  solidId: string;
  solidName: keyof typeof PASS73_COLLISION_VISUAL_ROLES;
  role: Pass73CollisionRouteRole;
  bounds: Pass73BoundsTuple;
}>;

export type Pass73CollisionRouteEntry = Readonly<{
  houseId: HouseArchitecture['id'];
  team: number;
  solidId: string;
  solidName: keyof typeof PASS73_COLLISION_VISUAL_ROLES;
  role: Pass73CollisionRouteRole;
  expectedBounds: Pass73BoundsTuple;
  renderedBounds: Pass73BoundsTuple | null;
  renderedAxisErrorMetres: Pass73BoundsTuple | null;
  maximumRenderedAxisErrorMetres: number | null;
  visibleOwnerCount: number;
  movementBoundsCount: number;
  physicsBoundsCount: number;
  shotBoundsCount: number;
  supportBoundsCount: number | null;
  issues: readonly string[];
}>;

export type Pass73RouteClearanceEntry = Readonly<{
  houseId: HouseArchitecture['id'];
  openingId: string;
  openingKind: HouseOpening['kind'];
  stance: Stance;
  samples: number;
  blockers: number;
  baseY: number;
  issues: readonly string[];
}>;

export type Pass73CollisionRouteAuthorityReport = Readonly<{
  schema: typeof PASS73_COLLISION_ROUTE_SCHEMA;
  profile: Pass73CollisionRouteProfile;
  axisToleranceMetres: typeof PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES;
  expectedOwners: number;
  passedOwners: number;
  expectedRouteClearances: number;
  passedRouteClearances: number;
  pass: boolean;
  issues: readonly string[];
  entries: readonly Pass73CollisionRouteEntry[];
  routeClearances: readonly Pass73RouteClearanceEntry[];
}>;

export type Pass73CollisionRouteFixture = Readonly<{
  id: string;
  profile: Pass73CollisionRouteProfile;
  houseId: HouseArchitecture['id'];
  team: number;
  solidId: string;
  role: Pass73CollisionRouteRole;
  stance: Stance;
  radius: number;
  eyeAboveFoot: number;
  bodyHeight: number;
  teleportPosition: readonly [number, number, number];
  yaw: number;
  pitch: number;
  supportTopY: number | null;
}>;

const AXES = Object.freeze(['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'] as const);
const AUTHORITY_EPSILON = 1e-6;
const CLEARANCE_EPSILON = 0.003;

function boxTuple(box: Box2): Pass73BoundsTuple {
  return Object.freeze([
    box.minX,
    box.minY ?? 0,
    box.minZ,
    box.maxX,
    box.maxY ?? 8,
    box.maxZ,
  ]);
}

function solidTuple(solid: HouseSolid): Pass73BoundsTuple {
  return boxTuple(solidBounds(solid));
}

function box3Tuple(box: THREE.Box3): Pass73BoundsTuple {
  return Object.freeze([box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]);
}

function tupleAxisErrors(actual: Pass73BoundsTuple, expected: Pass73BoundsTuple): Pass73BoundsTuple {
  return Object.freeze(actual.map((value, index) => Math.abs(value - expected[index]!)) as unknown as Pass73BoundsTuple);
}

function tupleMatches(left: Pass73BoundsTuple, right: Pass73BoundsTuple, tolerance = AUTHORITY_EPSILON): boolean {
  return left.every((value, index) => Math.abs(value - right[index]!) <= tolerance);
}

function nodeVisibleWithin(node: THREE.Object3D, root: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (!cursor.visible) return false;
    if (cursor === root) return true;
    cursor = cursor.parent;
  }
  return false;
}

function meshWorldBounds(mesh: THREE.Mesh): THREE.Box3 | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.count === 0) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld) ?? null;
}

function ownerWorldBounds(owner: THREE.Object3D, presentationRoot: THREE.Object3D): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  let found = false;
  owner.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !nodeVisibleWithin(node, presentationRoot)) return;
    const meshBounds = meshWorldBounds(node);
    if (!meshBounds) return;
    bounds.union(meshBounds);
    found = true;
  });
  return found ? bounds : null;
}

function ownerMetadata(node: THREE.Object3D): Readonly<{
  owner: boolean;
  houseId: unknown;
  solidId: unknown;
  role: unknown;
  declaredBounds: unknown;
}> {
  const blenderOwner = node.userData.atomic_semantic === 'collision-visual-owner';
  const performanceOwner = node.userData.pass73CollisionVisualOwner === true;
  return Object.freeze({
    owner: blenderOwner || performanceOwner,
    houseId: blenderOwner ? node.userData.atomic_house_id : node.userData.pass73HouseId,
    solidId: blenderOwner ? node.userData.atomic_solid_id : node.userData.pass73SolidId,
    role: blenderOwner ? node.userData.atomic_route_role : node.userData.pass73RouteRole,
    declaredBounds: blenderOwner ? node.userData.atomic_collision_bounds : node.userData.pass73CollisionBounds,
  });
}

function exactBoxMatches(boxes: readonly Box2[], expected: Pass73BoundsTuple): readonly Box2[] {
  return boxes.filter((box) => tupleMatches(boxTuple(box), expected));
}

function exactShotMatches(surfaces: readonly BallisticSurface[], solidName: string, expected: Pass73BoundsTuple): readonly BallisticSurface[] {
  return surfaces.filter((surface) => surface.name === solidName && tupleMatches(boxTuple(surface.bounds), expected));
}

function routeBindings(arena: ArenaMap): readonly Pass73CollisionRouteBinding[] {
  return Object.freeze(arena.houses.flatMap((house) => Object.entries(PASS73_COLLISION_VISUAL_ROLES).map(([solidName, role]) => {
    const solid = house.solids.find((candidate) => candidate.name === solidName);
    if (!solid) throw new TypeError(`Missing Pass 73 route solid ${house.id}:${solidName}`);
    if (!solid.collidable || solid.rotation?.some((value) => Math.abs(value) > AUTHORITY_EPSILON)) {
      throw new TypeError(`Pass 73 route solid must be an axis-aligned collidable: ${solid.id}`);
    }
    return Object.freeze({
      houseId: house.id,
      team: house.team,
      solidId: solid.id,
      solidName: solidName as keyof typeof PASS73_COLLISION_VISUAL_ROLES,
      role,
      bounds: solidTuple(solid),
    });
  })));
}

export function bindPass73CollisionVisualOwner(
  mesh: THREE.Mesh,
  house: HouseArchitecture,
  solid: HouseSolid,
): void {
  const role = PASS73_COLLISION_VISUAL_ROLES[solid.name as keyof typeof PASS73_COLLISION_VISUAL_ROLES];
  if (!role) return;
  mesh.userData.pass73CollisionVisualOwner = true;
  mesh.userData.pass73HouseId = house.id;
  mesh.userData.pass73SolidId = solid.id;
  mesh.userData.pass73RouteRole = role;
  mesh.userData.pass73CollisionBounds = [...solidTuple(solid)];
}

function openingNormalAxis(opening: HouseOpening): 'x' | 'z' {
  return opening.kind === 'ramp-entry' ? 'x' : 'z';
}

function strictVolumesIntersect(left: Pass73BoundsTuple, right: Pass73BoundsTuple): boolean {
  return left[3] > right[0] + CLEARANCE_EPSILON
    && left[0] < right[3] - CLEARANCE_EPSILON
    && left[4] > right[1] + CLEARANCE_EPSILON
    && left[1] < right[4] - CLEARANCE_EPSILON
    && left[5] > right[2] + CLEARANCE_EPSILON
    && left[2] < right[5] - CLEARANCE_EPSILON;
}

function openingBaseY(opening: HouseOpening, physicsColliders: readonly Box2[], radius: number): number {
  const declaredBottom = opening.centre[1] - opening.height / 2;
  const candidates = physicsColliders.filter((box) => {
    const maxY = box.maxY ?? 8;
    return maxY <= declaredBottom + 0.25 + AUTHORITY_EPSILON
      && box.minX <= opening.centre[0] + radius
      && box.maxX >= opening.centre[0] - radius
      && box.minZ <= opening.centre[2] + radius
      && box.maxZ >= opening.centre[2] - radius;
  });
  return Math.max(declaredBottom, ...candidates.map((box) => box.maxY ?? 8));
}

function auditRouteClearances(arena: ArenaMap): readonly Pass73RouteClearanceEntry[] {
  return Object.freeze(arena.houses.flatMap((house) => house.openings.filter((opening) => opening.route).flatMap((opening) => (
    PASS73_ROUTE_STANCES.map((stance): Pass73RouteClearanceEntry => {
      const shape = STANCE_SHAPES[stance];
      const extent = shape.halfHeight + shape.radius;
      const baseY = openingBaseY(opening, arena.physicsColliders, shape.radius);
      const normalAxis = openingNormalAxis(opening);
      const horizontalAxis = normalAxis === 'x' ? 'z' : 'x';
      const halfUsableWidth = Math.max(0, opening.width / 2 - shape.radius - 0.05);
      const horizontalOffsets = [-halfUsableWidth * 0.6, 0, halfUsableWidth * 0.6];
      let blockers = 0;
      for (const offset of horizontalOffsets) {
        const centreX = opening.centre[0] + (horizontalAxis === 'x' ? offset : 0);
        const centreZ = opening.centre[2] + (horizontalAxis === 'z' ? offset : 0);
        const normalReach = shape.radius + 0.24;
        const body: Pass73BoundsTuple = normalAxis === 'x'
          ? [centreX - normalReach, baseY + CLEARANCE_EPSILON, centreZ - shape.radius, centreX + normalReach, baseY + extent * 2 - CLEARANCE_EPSILON, centreZ + shape.radius]
          : [centreX - shape.radius, baseY + CLEARANCE_EPSILON, centreZ - normalReach, centreX + shape.radius, baseY + extent * 2 - CLEARANCE_EPSILON, centreZ + normalReach];
        blockers += arena.physicsColliders.filter((box) => strictVolumesIntersect(body, boxTuple(box))).length;
      }
      const issues = blockers > 0 ? [`invisible-or-intruding-route-blockers:${blockers}`] : [];
      return Object.freeze({
        houseId: house.id,
        openingId: opening.id,
        openingKind: opening.kind,
        stance,
        samples: horizontalOffsets.length,
        blockers,
        baseY: Number(baseY.toFixed(4)),
        issues: Object.freeze(issues),
      });
    })
  ))));
}

export function auditPass73CollisionRouteAuthority(
  arena: ArenaMap,
  presentationRoot: THREE.Object3D,
  profile: Pass73CollisionRouteProfile,
): Pass73CollisionRouteAuthorityReport {
  presentationRoot.updateWorldMatrix(true, true);
  const bindings = routeBindings(arena);
  const ownerNodes: THREE.Object3D[] = [];
  presentationRoot.traverse((node) => {
    // Blender exports a multi-material slab as one metadata-bearing Group with
    // primitive Mesh children. Count that logical authored object once, while
    // Performance's single-material owners remain direct Mesh nodes.
    if (ownerMetadata(node).owner && nodeVisibleWithin(node, presentationRoot)) ownerNodes.push(node);
  });

  const entries = bindings.map((binding): Pass73CollisionRouteEntry => {
    const issues: string[] = [];
    const owners = ownerNodes.filter((owner) => {
      const metadata = ownerMetadata(owner);
      return metadata.houseId === binding.houseId
        && metadata.solidId === binding.solidId
        && metadata.role === binding.role;
    });
    if (owners.length !== 1) issues.push(`visible-owner-count:${owners.length}`);
    const owner = owners.length === 1 ? owners[0]! : null;
    const renderedBox = owner ? ownerWorldBounds(owner, presentationRoot) : null;
    const renderedBounds = renderedBox ? box3Tuple(renderedBox) : null;
    const axisErrors = renderedBounds ? tupleAxisErrors(renderedBounds, binding.bounds) : null;
    const maximumAxisError = axisErrors ? Math.max(...axisErrors) : null;
    if (maximumAxisError === null || maximumAxisError > PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES) {
      issues.push(`rendered-bounds-drift:${maximumAxisError === null ? 'missing' : maximumAxisError.toFixed(6)}`);
    }
    if (owner) {
      const declared = ownerMetadata(owner).declaredBounds;
      if (!Array.isArray(declared) || declared.length !== 6
        || !declared.every(Number.isFinite)
        || !tupleMatches(declared as unknown as Pass73BoundsTuple, binding.bounds)) {
        issues.push('owner-declared-bounds-drift');
      }
    }

    const movement = exactBoxMatches(arena.colliders, binding.bounds);
    const physics = exactBoxMatches(arena.physicsColliders, binding.bounds);
    const shots = exactShotMatches(arena.shotSurfaces, binding.solidName, binding.bounds);
    if (movement.length !== 1) issues.push(`movement-bounds-count:${movement.length}`);
    if (physics.length !== 1) issues.push(`physics-bounds-count:${physics.length}`);
    if (shots.length !== 1) issues.push(`shot-bounds-count:${shots.length}`);
    const supportCount = binding.role === 'floor' || binding.role === 'canopy' ? physics.length : null;
    if (supportCount !== null && supportCount !== 1) issues.push(`support-bounds-count:${supportCount}`);

    return Object.freeze({
      ...binding,
      expectedBounds: binding.bounds,
      renderedBounds,
      renderedAxisErrorMetres: axisErrors,
      maximumRenderedAxisErrorMetres: maximumAxisError,
      visibleOwnerCount: owners.length,
      movementBoundsCount: movement.length,
      physicsBoundsCount: physics.length,
      shotBoundsCount: shots.length,
      supportBoundsCount: supportCount,
      issues: Object.freeze(issues),
    });
  });
  const routeClearances = auditRouteClearances(arena);
  const issues = [
    ...entries.flatMap((entry) => entry.issues.map((issue) => `${entry.solidId}:${issue}`)),
    ...routeClearances.flatMap((entry) => entry.issues.map((issue) => `${entry.houseId}:${entry.openingId}:${entry.stance}:${issue}`)),
  ];
  return Object.freeze({
    schema: PASS73_COLLISION_ROUTE_SCHEMA,
    profile,
    axisToleranceMetres: PASS73_COLLISION_VISUAL_AXIS_TOLERANCE_METRES,
    expectedOwners: bindings.length,
    passedOwners: entries.filter((entry) => entry.issues.length === 0).length,
    expectedRouteClearances: routeClearances.length,
    passedRouteClearances: routeClearances.filter((entry) => entry.issues.length === 0).length,
    pass: issues.length === 0,
    issues: Object.freeze(issues),
    entries: Object.freeze(entries),
    routeClearances,
  });
}

export function assertPass73CollisionRouteAuthority(report: Pass73CollisionRouteAuthorityReport): void {
  if (!report.pass) {
    throw new Error(`Pass 73 collision/visual route authority failed (${report.profile}): ${report.issues.join(', ')}`);
  }
}

function stanceEyeY(footY: number, stance: Stance): number {
  const shape = STANCE_SHAPES[stance];
  return footY + shape.halfHeight + shape.radius + shape.eyeFromCenter;
}

export function pass73CollisionRouteFixtures(
  arena: ArenaMap,
  profile: Pass73CollisionRouteProfile,
): readonly Pass73CollisionRouteFixture[] {
  const houses = new Map(arena.houses.map((house) => [house.id, house]));
  const bindings = routeBindings(arena);
  return Object.freeze(bindings.flatMap((binding) => PASS73_ROUTE_STANCES.map((stance) => {
    const house = houses.get(binding.houseId)!;
    const [minX, , minZ, maxX, maxY, maxZ] = binding.bounds;
    const centreX = (minX + maxX) / 2;
    const centreZ = (minZ + maxZ) / 2;
    const radius = STANCE_SHAPES[stance].radius;
    let footY = 0;
    let x = centreX;
    let z = centreZ;
    let yaw = 0;
    let pitch = 0;
    let supportTopY: number | null = null;
    if (binding.role === 'wall') {
      x = maxX + radius + 0.035;
      z = centreZ + house.origin.facing * 2;
      yaw = Math.PI / 2;
    } else if (binding.role === 'floor') {
      const upperOpening = house.anchors.find((anchor) => anchor.id === 'upper-opening');
      if (!upperOpening) throw new TypeError(`Missing upper-opening fixture anchor for ${house.id}`);
      x = upperOpening.position[0];
      z = upperOpening.position[2] + house.origin.facing * 1.3;
      footY = maxY;
      supportTopY = maxY;
      pitch = 1.05;
    } else if (binding.role === 'underside') {
      z = centreZ + house.origin.facing * 0.68;
      yaw = house.origin.facing === 1 ? 0 : Math.PI;
      pitch = 0.82;
    } else if (binding.role === 'canopy') {
      footY = maxY;
      supportTopY = maxY;
      pitch = 0.9;
    } else {
      const floor = bindings.find((candidate) => candidate.houseId === binding.houseId && candidate.role === 'floor');
      if (!floor) throw new TypeError(`Missing floor fixture for ${house.id}`);
      footY = floor.bounds[4];
      supportTopY = floor.bounds[4];
      z = centreZ - house.origin.facing * (radius + (maxZ - minZ) / 2 + 0.035);
      yaw = house.origin.facing === 1 ? Math.PI : 0;
      pitch = 0.12;
    }
    return Object.freeze({
      id: `${profile}:${binding.houseId}:${binding.role}:${stance}`,
      profile,
      houseId: binding.houseId,
      team: binding.team,
      solidId: binding.solidId,
      role: binding.role,
      stance,
      radius,
      eyeAboveFoot: stanceEyeY(0, stance),
      bodyHeight: (STANCE_SHAPES[stance].halfHeight + radius) * 2,
      teleportPosition: Object.freeze([x, stanceEyeY(footY, stance), z] as const),
      yaw,
      pitch,
      supportTopY,
    });
  })));
}

export const PASS73_COLLISION_ROUTE_AXES = AXES;
