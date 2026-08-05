import type { BallisticMaterialId } from './ballistics';
import { canonicalSha256 } from './canonical-state';
import type { Point3 } from './collision';
import type { HouseArchitecture } from './house-navigation';
import { SHARED_MAJOR_DEBRIS_BUDGET } from './major-debris-budget';

export const HOUSE_DESTRUCTION_DEFINITION_SET_ID = 'atomic-house-structural-slice-v1';
export const HOUSE_DESTRUCTION_SCHEMA_VERSION = 1;
export const HOUSE_MAX_FRAGMENT_DEFINITIONS = 10;
export const HOUSE_MAX_MAJOR_DEBRIS_BODIES = SHARED_MAJOR_DEBRIS_BUDGET.house;
export const HOUSE_POSITION_Q = 1_000;
export const HOUSE_ROTATION_Q = 10_000;

export type HouseFragmentRole = 'wall' | 'roof' | 'furniture';
export type HouseFragmentSourceKind = 'architecture-solid' | 'authored-roof-slab' | 'authored-furniture';

export type HouseFragmentDefinition = Readonly<{
  id: string;
  houseId: HouseArchitecture['id'];
  role: HouseFragmentRole;
  sourceKind: HouseFragmentSourceKind;
  sourceId: string;
  profileOwnedPresentation: boolean;
  position: Point3;
  halfExtents: Point3;
  rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  ballisticMaterial: BallisticMaterialId;
  presentationMaterialId: 'aqua-wall' | 'coral-wall' | 'roof-shingles' | 'storage-locker';
  detachDamageQ: number;
  detachVelocity: Point3;
  detachAngularVelocity: Point3;
}>;

export type HouseFragmentState = Readonly<{
  fragmentId: string;
  damageQ: number;
  stage: 'intact' | 'damaged' | 'detached';
}>;

export type HouseMajorDebrisState = Readonly<{
  fragmentId: string;
  poseQ: Readonly<{
    position: Readonly<{ xQ: number; yQ: number; zQ: number }>;
    rotation: Readonly<{ xQ: number; yQ: number; zQ: number; wQ: number }>;
  }>;
  velocityQ: Readonly<{ xQ: number; yQ: number; zQ: number }>;
  angularVelocityQ: Readonly<{ xQ: number; yQ: number; zQ: number }>;
  sleeping: boolean;
  flat: boolean;
}>;

export type HouseDestructionState = Readonly<{
  schemaVersion: typeof HOUSE_DESTRUCTION_SCHEMA_VERSION;
  definitionSetId: typeof HOUSE_DESTRUCTION_DEFINITION_SET_ID;
  definitionHash: string;
  arenaId: 'atomic-acres';
  matchEpoch: number;
  revision: number;
  fragments: readonly HouseFragmentState[];
  detachedFragmentIds: readonly string[];
  majorDebris: readonly HouseMajorDebrisState[];
}>;

export type HouseDestructionMutationResult = Readonly<{
  accepted: boolean;
  reason:
    | 'accepted'
    | 'not-host'
    | 'stale-epoch'
    | 'stale-revision'
    | 'unknown-fragment'
    | 'invalid-impact'
    | 'already-detached'
    | 'shared-major-body-cap';
  state: HouseDestructionState;
}>;

const ID_PATTERN = /^[a-z0-9][a-z0-9:-]{0,127}$/;

function frozenPoint(x: number, y: number, z: number): Point3 {
  return Object.freeze({ x, y, z });
}

function localToWorld(house: HouseArchitecture, x: number, y: number, z: number): Point3 {
  return frozenPoint(house.origin.x + x, y, house.origin.z + house.origin.facing * z);
}

function houseWallFragment(
  house: HouseArchitecture,
  suffix: 'front-ground-centre' | 'rear-ground-centre',
): HouseFragmentDefinition {
  const solid = house.solids.find((candidate) => candidate.id === `${house.id}:${suffix}`);
  if (!solid) throw new TypeError(`Missing canonical house wall ${house.id}:${suffix}`);
  const front = suffix.startsWith('front');
  return Object.freeze({
    id: `${house.id}:wall-${front ? 'front' : 'rear'}-centre`,
    houseId: house.id,
    role: 'wall',
    sourceKind: 'architecture-solid',
    sourceId: solid.id,
    profileOwnedPresentation: true,
    position: frozenPoint(...solid.position),
    halfExtents: frozenPoint(solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2),
    rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    ballisticMaterial: 'interior-wall',
    presentationMaterialId: house.team === 0 ? 'aqua-wall' : 'coral-wall',
    detachDamageQ: 280,
    detachVelocity: frozenPoint(0, 1.4, (front ? 1 : -1) * house.origin.facing * 3.1),
    detachAngularVelocity: frozenPoint(front ? 0.8 : -0.8, 0.35, house.team === 0 ? -0.55 : 0.55),
  });
}

function houseRoofFragment(house: HouseArchitecture, side: -1 | 1): HouseFragmentDefinition {
  const width = house.dimensions.width + 0.6;
  const depth = house.dimensions.depth + 0.6;
  return Object.freeze({
    id: `${house.id}:roof-${side < 0 ? 'west' : 'east'}-slab`,
    houseId: house.id,
    role: 'roof',
    sourceKind: 'authored-roof-slab',
    sourceId: `${house.id}:authored-roof-${side < 0 ? 'west' : 'east'}-slab`,
    profileOwnedPresentation: true,
    position: frozenPoint(house.origin.x + side * width / 4, 7.35, house.origin.z),
    halfExtents: frozenPoint(width / 4, 0.21, depth / 2),
    rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    ballisticMaterial: 'wood',
    presentationMaterialId: 'roof-shingles',
    detachDamageQ: 360,
    detachVelocity: frozenPoint(side * 1.35, 3.2, house.origin.facing * 0.45),
    detachAngularVelocity: frozenPoint(house.origin.facing * 0.4, side * 0.22, side * 0.75),
  });
}

function houseFurnitureFragment(house: HouseArchitecture): HouseFragmentDefinition {
  const side = house.team === 0 ? 1 : -1;
  return Object.freeze({
    id: `${house.id}:furniture-storage-locker`,
    houseId: house.id,
    role: 'furniture',
    sourceKind: 'authored-furniture',
    sourceId: `${house.id}:authored-storage-locker`,
    profileOwnedPresentation: false,
    position: localToWorld(house, side * 6.75, 0.82, -5.65),
    halfExtents: frozenPoint(0.62, 0.82, 0.36),
    rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
    ballisticMaterial: 'thin-metal',
    presentationMaterialId: 'storage-locker',
    detachDamageQ: 220,
    detachVelocity: frozenPoint(side * 1.1, 1.75, house.origin.facing * 1.25),
    detachAngularVelocity: frozenPoint(0.55, side * 0.9, -side * 0.45),
  });
}

/** Exactly five authored cuboids per canonical house; no runtime fracture or CSG. */
export function createAtomicHouseFragmentDefinitions(
  houses: readonly HouseArchitecture[],
): readonly HouseFragmentDefinition[] {
  const definitions = houses.flatMap((house) => [
    houseWallFragment(house, 'front-ground-centre'),
    houseWallFragment(house, 'rear-ground-centre'),
    houseRoofFragment(house, -1),
    houseRoofFragment(house, 1),
    houseFurnitureFragment(house),
  ]).sort((left, right) => left.id.localeCompare(right.id));
  const errors = validateHouseFragmentDefinitions(definitions, houses);
  if (errors.length > 0) throw new TypeError(`Invalid Atomic house fragments: ${errors.join('; ')}`);
  return Object.freeze(definitions);
}

export function validateHouseFragmentDefinitions(
  definitions: readonly HouseFragmentDefinition[],
  houses: readonly HouseArchitecture[],
): readonly string[] {
  const errors: string[] = [];
  if (definitions.length !== houses.length * 5 || definitions.length > HOUSE_MAX_FRAGMENT_DEFINITIONS) {
    errors.push('exactly five fragments per house within the global definition cap required');
  }
  if (new Set(definitions.map((definition) => definition.id)).size !== definitions.length) errors.push('duplicate fragment id');
  if (definitions.some((definition, index) => index > 0 && definitions[index - 1]!.id.localeCompare(definition.id) >= 0)) {
    errors.push('fragment definitions must use deterministic id order');
  }
  for (const house of houses) {
    const entries = definitions.filter((definition) => definition.houseId === house.id);
    if (entries.filter((definition) => definition.role === 'wall').length !== 2
      || entries.filter((definition) => definition.role === 'roof').length !== 2
      || entries.filter((definition) => definition.role === 'furniture').length !== 1) {
      errors.push(`${house.id}: requires two walls, two roof slabs and one furniture fragment`);
    }
  }
  for (const definition of definitions) {
    if (!ID_PATTERN.test(definition.id) || !ID_PATTERN.test(definition.sourceId)) errors.push(`${definition.id}: invalid identity`);
    if (!houses.some((house) => house.id === definition.houseId)) errors.push(`${definition.id}: unknown house`);
    if (![definition.position.x, definition.position.y, definition.position.z,
      definition.halfExtents.x, definition.halfExtents.y, definition.halfExtents.z,
      definition.rotation.x, definition.rotation.y, definition.rotation.z, definition.rotation.w,
      definition.detachVelocity.x, definition.detachVelocity.y, definition.detachVelocity.z,
      definition.detachAngularVelocity.x, definition.detachAngularVelocity.y, definition.detachAngularVelocity.z]
      .every(Number.isFinite)
      || definition.halfExtents.x <= 0 || definition.halfExtents.y <= 0 || definition.halfExtents.z <= 0
      || definition.halfExtents.x > 12 || definition.halfExtents.y > 5 || definition.halfExtents.z > 12) {
      errors.push(`${definition.id}: invalid bounded cuboid`);
    }
    if (!Number.isSafeInteger(definition.detachDamageQ) || definition.detachDamageQ < 1 || definition.detachDamageQ > 1_000_000) {
      errors.push(`${definition.id}: invalid detach threshold`);
    }
    if ((definition.role === 'wall') !== (definition.sourceKind === 'architecture-solid')) {
      errors.push(`${definition.id}: wall/source mismatch`);
    }
    if ((definition.role === 'roof') !== (definition.sourceKind === 'authored-roof-slab')) {
      errors.push(`${definition.id}: roof/source mismatch`);
    }
    if ((definition.role === 'furniture') !== (definition.sourceKind === 'authored-furniture')) {
      errors.push(`${definition.id}: furniture/source mismatch`);
    }
    if (definition.profileOwnedPresentation !== (definition.role !== 'furniture')) {
      errors.push(`${definition.id}: invalid profile presentation ownership`);
    }
    if (definition.sourceKind === 'architecture-solid') {
      const house = houses.find((candidate) => candidate.id === definition.houseId);
      if (!house?.solids.some((solid) => solid.id === definition.sourceId && solid.collidable && solid.kind === 'wall')) {
        errors.push(`${definition.id}: missing collidable architecture source`);
      }
    }
  }
  return Object.freeze(errors);
}

export function houseFragmentDefinitionHash(definitions: readonly HouseFragmentDefinition[]): string {
  return canonicalSha256(definitions);
}

export function createInitialHouseDestructionState(
  definitions: readonly HouseFragmentDefinition[],
  matchEpoch: number,
): HouseDestructionState {
  if (!Number.isSafeInteger(matchEpoch)
    || matchEpoch < 1
    || definitions.length < 1
    || definitions.length > HOUSE_MAX_FRAGMENT_DEFINITIONS
    || new Set(definitions.map((definition) => definition.id)).size !== definitions.length
    || definitions.some((definition, index) => index > 0 && definitions[index - 1]!.id.localeCompare(definition.id) >= 0)) {
    throw new TypeError('Invalid initial house destruction state');
  }
  return Object.freeze({
    schemaVersion: HOUSE_DESTRUCTION_SCHEMA_VERSION,
    definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
    definitionHash: houseFragmentDefinitionHash(definitions),
    arenaId: 'atomic-acres',
    matchEpoch,
    revision: 0,
    fragments: Object.freeze(definitions.map((definition) => Object.freeze({
      fragmentId: definition.id,
      damageQ: 0,
      stage: 'intact' as const,
    }))),
    detachedFragmentIds: Object.freeze([]),
    majorDebris: Object.freeze([]),
  });
}

function quantizedPoint(point: Point3): Readonly<{ xQ: number; yQ: number; zQ: number }> {
  return Object.freeze({
    xQ: Math.round(point.x * HOUSE_POSITION_Q),
    yQ: Math.round(point.y * HOUSE_POSITION_Q),
    zQ: Math.round(point.z * HOUSE_POSITION_Q),
  });
}

function initialMajorDebris(definition: HouseFragmentDefinition): HouseMajorDebrisState {
  return Object.freeze({
    fragmentId: definition.id,
    poseQ: Object.freeze({
      position: quantizedPoint(definition.position),
      rotation: Object.freeze({
        xQ: Math.round(definition.rotation.x * HOUSE_ROTATION_Q),
        yQ: Math.round(definition.rotation.y * HOUSE_ROTATION_Q),
        zQ: Math.round(definition.rotation.z * HOUSE_ROTATION_Q),
        wQ: Math.round(definition.rotation.w * HOUSE_ROTATION_Q),
      }),
    }),
    velocityQ: quantizedPoint(definition.detachVelocity),
    angularVelocityQ: quantizedPoint(definition.detachAngularVelocity),
    sleeping: false,
    flat: false,
  });
}

function withRevision(
  state: HouseDestructionState,
  patch: Partial<Pick<HouseDestructionState, 'fragments' | 'detachedFragmentIds' | 'majorDebris'>>,
): HouseDestructionState {
  return Object.freeze({ ...state, ...patch, revision: state.revision + 1 });
}

function clampQuantizedVelocity(value: number): number {
  return Math.max(-50_000_000, Math.min(50_000_000, value));
}

export function applyHouseFragmentDamage(
  definitions: readonly HouseFragmentDefinition[],
  state: HouseDestructionState,
  request: Readonly<{
    isHost: boolean;
    matchEpoch: number;
    expectedRevision: number;
    fragmentId: string;
    damageQ: number;
  }>,
): HouseDestructionMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.matchEpoch !== state.matchEpoch) return { accepted: false, reason: 'stale-epoch', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  const definition = definitions.find((candidate) => candidate.id === request.fragmentId);
  const fragment = state.fragments.find((candidate) => candidate.fragmentId === request.fragmentId);
  if (!definition || !fragment) return { accepted: false, reason: 'unknown-fragment', state };
  if (fragment.stage === 'detached') return { accepted: false, reason: 'already-detached', state };
  if (!Number.isSafeInteger(request.damageQ) || request.damageQ < 1 || request.damageQ > 1_000_000) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const damageQ = Math.min(1_000_000, fragment.damageQ + request.damageQ);
  const detaches = damageQ >= definition.detachDamageQ;
  if (detaches && state.majorDebris.length >= HOUSE_MAX_MAJOR_DEBRIS_BODIES) {
    return { accepted: false, reason: 'shared-major-body-cap', state };
  }
  const fragments = Object.freeze(state.fragments.map((candidate) => candidate.fragmentId === definition.id
    ? Object.freeze({ ...candidate, damageQ, stage: detaches ? 'detached' as const : 'damaged' as const })
    : candidate));
  if (!detaches) return { accepted: true, reason: 'accepted', state: withRevision(state, { fragments }) };
  const detachedFragmentIds = Object.freeze([...state.detachedFragmentIds, definition.id].sort());
  const majorDebris = Object.freeze([...state.majorDebris, initialMajorDebris(definition)]
    .sort((left, right) => left.fragmentId.localeCompare(right.fragmentId)));
  return {
    accepted: true,
    reason: 'accepted',
    state: withRevision(state, { fragments, detachedFragmentIds, majorDebris }),
  };
}

export function impulseHouseMajorDebris(
  state: HouseDestructionState,
  request: Readonly<{
    isHost: boolean;
    expectedRevision: number;
    fragmentId: string;
    impulseQ: Readonly<{ xQ: number; yQ: number; zQ: number }>;
  }>,
): HouseDestructionMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  const body = state.majorDebris.find((candidate) => candidate.fragmentId === request.fragmentId);
  if (!body) return { accepted: false, reason: 'unknown-fragment', state };
  if (![request.impulseQ.xQ, request.impulseQ.yQ, request.impulseQ.zQ]
    .every((value) => Number.isSafeInteger(value) && Math.abs(value) <= 50_000)) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const majorDebris = Object.freeze(state.majorDebris.map((candidate) => candidate.fragmentId === body.fragmentId
    ? Object.freeze({
      ...candidate,
      velocityQ: Object.freeze({
        xQ: clampQuantizedVelocity(candidate.velocityQ.xQ + request.impulseQ.xQ),
        yQ: clampQuantizedVelocity(candidate.velocityQ.yQ + request.impulseQ.yQ),
        zQ: clampQuantizedVelocity(candidate.velocityQ.zQ + request.impulseQ.zQ),
      }),
      sleeping: false,
    })
    : candidate));
  return { accepted: true, reason: 'accepted', state: withRevision(state, { majorDebris }) };
}

export function synchronizeHouseMajorDebris(
  state: HouseDestructionState,
  request: Readonly<{
    isHost: boolean;
    expectedRevision: number;
    bodies: readonly HouseMajorDebrisState[];
  }>,
): HouseDestructionMutationResult {
  if (!request.isHost) return { accepted: false, reason: 'not-host', state };
  if (request.expectedRevision !== state.revision) return { accepted: false, reason: 'stale-revision', state };
  if (request.bodies.length !== state.majorDebris.length
    || state.majorDebris.some((body) => !request.bodies.some((candidate) => candidate.fragmentId === body.fragmentId))
    || !request.bodies.every(isHouseMajorDebrisState)) {
    return { accepted: false, reason: 'invalid-impact', state };
  }
  const majorDebris = Object.freeze([...request.bodies].sort((left, right) => left.fragmentId.localeCompare(right.fragmentId)));
  if (canonicalSha256(majorDebris) === canonicalSha256(state.majorDebris)) return { accepted: true, reason: 'accepted', state };
  return { accepted: true, reason: 'accepted', state: withRevision(state, { majorDebris }) };
}

export function resetHouseDestructionState(
  state: HouseDestructionState,
  definitions: readonly HouseFragmentDefinition[],
  nextMatchEpoch: number,
): HouseDestructionState {
  if (!Number.isSafeInteger(nextMatchEpoch) || nextMatchEpoch <= state.matchEpoch) {
    throw new TypeError('House destruction epoch must advance');
  }
  return createInitialHouseDestructionState(definitions, nextMatchEpoch);
}

export function houseDestructionStateHash(state: HouseDestructionState): string {
  return canonicalSha256(state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function boundedInteger(value: unknown, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isQuantizedVector(value: unknown): value is HouseMajorDebrisState['velocityQ'] {
  return isRecord(value)
    && exactKeys(value, ['xQ', 'yQ', 'zQ'])
    && [value.xQ, value.yQ, value.zQ].every((entry) => boundedInteger(entry, -50_000_000, 50_000_000));
}

function isHouseMajorDebrisState(value: unknown): value is HouseMajorDebrisState {
  return isRecord(value)
    && exactKeys(value, ['fragmentId', 'poseQ', 'velocityQ', 'angularVelocityQ', 'sleeping', 'flat'])
    && typeof value.fragmentId === 'string' && ID_PATTERN.test(value.fragmentId)
    && isRecord(value.poseQ) && exactKeys(value.poseQ, ['position', 'rotation'])
    && isQuantizedVector(value.poseQ.position)
    && isRecord(value.poseQ.rotation) && exactKeys(value.poseQ.rotation, ['xQ', 'yQ', 'zQ', 'wQ'])
    && [value.poseQ.rotation.xQ, value.poseQ.rotation.yQ, value.poseQ.rotation.zQ, value.poseQ.rotation.wQ]
      .every((entry) => boundedInteger(entry, -HOUSE_ROTATION_Q, HOUSE_ROTATION_Q))
    && isQuantizedVector(value.velocityQ)
    && isQuantizedVector(value.angularVelocityQ)
    && typeof value.sleeping === 'boolean'
    && typeof value.flat === 'boolean';
}

export function isHouseDestructionState(value: unknown): value is HouseDestructionState {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion', 'definitionSetId', 'definitionHash', 'arenaId', 'matchEpoch', 'revision',
      'fragments', 'detachedFragmentIds', 'majorDebris',
    ])
    || value.schemaVersion !== HOUSE_DESTRUCTION_SCHEMA_VERSION
    || value.definitionSetId !== HOUSE_DESTRUCTION_DEFINITION_SET_ID
    || typeof value.definitionHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.definitionHash)
    || value.arenaId !== 'atomic-acres'
    || !boundedInteger(value.matchEpoch, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.revision, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.fragments) || value.fragments.length > HOUSE_MAX_FRAGMENT_DEFINITIONS
    || !Array.isArray(value.detachedFragmentIds) || value.detachedFragmentIds.length > HOUSE_MAX_MAJOR_DEBRIS_BODIES
    || !Array.isArray(value.majorDebris) || value.majorDebris.length > HOUSE_MAX_MAJOR_DEBRIS_BODIES) return false;
  const fragments = value.fragments as unknown[];
  if (!fragments.every((entry) => isRecord(entry)
    && exactKeys(entry, ['fragmentId', 'damageQ', 'stage'])
    && typeof entry.fragmentId === 'string' && ID_PATTERN.test(entry.fragmentId)
    && boundedInteger(entry.damageQ, 0, 1_000_000)
    && ['intact', 'damaged', 'detached'].includes(String(entry.stage)))) return false;
  const fragmentIds = fragments.map((entry) => (entry as Record<string, unknown>).fragmentId as string);
  const detachedIds = value.detachedFragmentIds as unknown[];
  const majorDebris = value.majorDebris as unknown[];
  if (new Set(fragmentIds).size !== fragmentIds.length
    || fragmentIds.some((id, index) => index > 0 && fragmentIds[index - 1]!.localeCompare(id) >= 0)
    || !detachedIds.every((id) => typeof id === 'string' && ID_PATTERN.test(id))
    || new Set(detachedIds).size !== detachedIds.length
    || detachedIds.some((id, index) => index > 0 && String(detachedIds[index - 1]).localeCompare(String(id)) >= 0)
    || !majorDebris.every(isHouseMajorDebrisState)) return false;
  const detachedFromFragments = fragments
    .filter((entry) => (entry as Record<string, unknown>).stage === 'detached')
    .map((entry) => (entry as Record<string, unknown>).fragmentId as string);
  const debrisIds = (majorDebris as HouseMajorDebrisState[]).map((body) => body.fragmentId);
  return canonicalSha256(detachedIds) === canonicalSha256(detachedFromFragments)
    && canonicalSha256(detachedIds) === canonicalSha256(debrisIds);
}

export function houseDestructionStateMatchesDefinitions(
  state: HouseDestructionState,
  definitions: readonly HouseFragmentDefinition[],
): boolean {
  return state.definitionHash === houseFragmentDefinitionHash(definitions)
    && state.fragments.length === definitions.length
    && state.fragments.every((fragment, index) => fragment.fragmentId === definitions[index]?.id);
}
