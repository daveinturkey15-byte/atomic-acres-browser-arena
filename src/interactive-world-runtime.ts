import * as THREE from 'three';
import type { BallisticApertureQuery, BallisticSurface } from './ballistics';
import { canonicalSha256 } from './canonical-state';
import type { Box2, Point3 } from './collision';
import {
  SHED_ANGLE_Q,
  SHED_PANEL_COORD_Q,
  admitShedDoorInteraction,
  advanceShedDoor,
  applyShedExplosion,
  applyShedStructuralBlast,
  applyShedSheetImpact,
  blockShedDoor,
  createInitialShedState,
  isShedState,
  impulseMajorShedDebris,
  pushShedDoorFromPlayerContact,
  resetShedState,
  resumeShedDoorWhenClear,
  shedApertureContainsWorldPoint,
  shedMajorChunkExtents,
  synchronizeMajorShedDebris,
  type DestructibleShedDefinition,
  type SheetSurfaceDefinition,
  type ShedMutationResult,
  type ShedArenaId,
  type ShedPlacement,
  type ShedState,
  type ShedStructuralBlastClass,
  type WorldCollisionSnapshot,
  type QuantizedVector,
} from './destructible-world';
import type { MajorDebrisBodyDefinition, MajorDebrisBodySnapshot } from './physics';
import { DestructibleShedPresentation } from './destructible-shed-presentation';
import {
  FIELD_SHED_BALLISTIC_MATERIAL_ID,
  FIELD_SHED_DEFINITION,
} from './destructible-shed-definition';
import {
  HOUSE_DESTRUCTION_DEFINITION_SET_ID,
  HOUSE_POSITION_Q,
  HOUSE_ROTATION_Q,
  applyHouseFragmentDamage,
  createInitialHouseDestructionState,
  houseDestructionStateMatchesDefinitions,
  impulseHouseMajorDebris,
  isHouseDestructionState,
  resetHouseDestructionState,
  synchronizeHouseMajorDebris,
  type HouseDestructionMutationResult,
  type HouseDestructionState,
  type HouseFragmentDefinition,
  type HouseMajorDebrisState,
} from './house-destruction';
import { HouseDestructionPresentation } from './house-destruction-presentation';
import { SHARED_MAJOR_DEBRIS_BUDGET } from './major-debris-budget';

export type InteractiveWorldCollisionView = Readonly<{
  revision: number;
  movementColliders: readonly Box2[];
  dynamicColliders: readonly Readonly<{ id: string; bounds: Box2 }>[];
  ballisticSurfaces: readonly BallisticSurface[];
}>;

export type InteractiveWorldCollisionSnapshot = Readonly<{
  schemaVersion: 1;
  arenaId: ShedArenaId;
  matchEpoch: number;
  revision: number;
  staticDefinitionId: string;
  consumers: WorldCollisionSnapshot['consumers'];
  sheds: readonly ShedState[];
  houseDestruction: HouseDestructionState | null;
  hashAlgorithm: 'sha256';
  hash: string;
}>;

export type InteractiveWorldRuntimeTelemetry = Readonly<{
  arenaId: ShedArenaId;
  matchEpoch: number;
  revision: number;
  sheds: number;
  apertures: number;
  dents: number;
  detachedChunks: number;
  awakeMajorBodies: number;
  movementColliders: number;
  ballisticSurfaces: number;
  presentationDraws: number;
  presentationRetiredGeometries: number;
  houseFragments: number;
  houseDetachedFragments: number;
  houseMajorBodies: number;
  majorBodiesTotal: number;
}>;

export type InteractiveWorldDoorCandidate = Readonly<{
  placementId: string;
  centre: Point3;
  distance: number;
}>;

export type InteractiveWorldDoorCollisionState = Readonly<{
  placementId: string;
  bounds: Box2;
  phase: ShedState['door']['phase'];
  blockedBy: ShedState['door']['blockedBy'];
  resumePolicy: ShedState['door']['resumePolicy'];
}>;

export type InteractiveWorldStateEnvelope = Readonly<{
  schemaVersion: 1;
  arenaId: ShedArenaId;
  matchEpoch: number;
  revision: number;
  sheds: readonly ShedState[];
  houseDestruction: HouseDestructionState | null;
  hashAlgorithm: 'sha256';
  hash: string;
}>;

const SHED_ARENA_IDS = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'] as const);

function interactiveWorldEnvelopeHash(value: Omit<InteractiveWorldStateEnvelope, 'hashAlgorithm' | 'hash'>): string {
  return canonicalSha256(value);
}

export function isInteractiveWorldStateEnvelope(value: unknown): value is InteractiveWorldStateEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const envelope = value as Partial<InteractiveWorldStateEnvelope> & Record<string, unknown>;
  if (Object.keys(envelope).sort().join('|') !== [
    'arenaId', 'matchEpoch', 'revision', 'schemaVersion', 'sheds', 'houseDestruction', 'hashAlgorithm', 'hash',
  ].sort().join('|')
    || envelope.schemaVersion !== 1
    || !SHED_ARENA_IDS.includes(envelope.arenaId as typeof SHED_ARENA_IDS[number])
    || !Number.isSafeInteger(envelope.matchEpoch) || Number(envelope.matchEpoch) < 1
    || !Number.isSafeInteger(envelope.revision) || Number(envelope.revision) < 0
    || envelope.hashAlgorithm !== 'sha256'
    || typeof envelope.hash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.hash)
    || !Array.isArray(envelope.sheds) || envelope.sheds.length > 8
    || !envelope.sheds.every(isShedState)
    || !(envelope.houseDestruction === null || isHouseDestructionState(envelope.houseDestruction))) return false;
  const states = envelope.sheds as ShedState[];
  const house = envelope.houseDestruction as HouseDestructionState | null;
  if (new Set(states.map((state) => state.placementId)).size !== states.length
    || states.some((state) => state.arenaId !== envelope.arenaId || state.matchEpoch !== envelope.matchEpoch)
    || house !== null && (envelope.arenaId !== 'atomic-acres' || house.matchEpoch !== envelope.matchEpoch)
    || states.reduce((sum, state) => sum + state.revision, house?.revision ?? 0) !== envelope.revision) return false;
  const body = Object.freeze({
    schemaVersion: 1 as const,
    arenaId: envelope.arenaId as ShedArenaId,
    matchEpoch: Number(envelope.matchEpoch),
    revision: Number(envelope.revision),
    sheds: Object.freeze([...states].sort((left, right) => left.placementId.localeCompare(right.placementId))),
    houseDestruction: house,
  });
  return interactiveWorldEnvelopeHash(body) === envelope.hash;
}

type RuntimeShed = {
  placement: ShedPlacement;
  definition: DestructibleShedDefinition;
  state: ShedState;
  presentation: DestructibleShedPresentation;
};

type RuntimeHouseDestruction = {
  definitions: readonly HouseFragmentDefinition[];
  state: HouseDestructionState;
  presentation: HouseDestructionPresentation;
};

type SurfaceFrame = SheetSurfaceDefinition['frame'];

function rotateY(point: Point3, yaw: number): Point3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

function transformPoint(point: Point3, placement: ShedPlacement): Point3 {
  const rotated = rotateY(point, placement.yaw);
  return {
    x: placement.position.x + rotated.x,
    y: placement.position.y + rotated.y,
    z: placement.position.z + rotated.z,
  };
}

function inverseTransformPoint(point: Point3, placement: ShedPlacement): Point3 {
  return rotateY({
    x: point.x - placement.position.x,
    y: point.y - placement.position.y,
    z: point.z - placement.position.z,
  }, -placement.yaw);
}

function doorFrameAt(surface: SheetSurfaceDefinition, angleQ: number): SurfaceFrame {
  const angle = -angleQ / SHED_ANGLE_Q * Math.PI / 2;
  const hinge = {
    x: surface.frame.centre.x - surface.frame.uAxis.x * surface.frame.halfU,
    y: surface.frame.centre.y - surface.frame.uAxis.y * surface.frame.halfU,
    z: surface.frame.centre.z - surface.frame.uAxis.z * surface.frame.halfU,
  };
  const centreOffset = rotateY({
    x: surface.frame.uAxis.x * surface.frame.halfU,
    y: surface.frame.uAxis.y * surface.frame.halfU,
    z: surface.frame.uAxis.z * surface.frame.halfU,
  }, angle);
  return Object.freeze({
    ...surface.frame,
    centre: Object.freeze({
      x: hinge.x + centreOffset.x,
      y: hinge.y + centreOffset.y,
      z: hinge.z + centreOffset.z,
    }),
    uAxis: Object.freeze(rotateY(surface.frame.uAxis, angle)),
    vAxis: Object.freeze(rotateY(surface.frame.vAxis, angle)),
  });
}

function worldFrame(frame: SurfaceFrame, placement: ShedPlacement): SurfaceFrame {
  return Object.freeze({
    ...frame,
    centre: Object.freeze(transformPoint(frame.centre, placement)),
    uAxis: Object.freeze(rotateY(frame.uAxis, placement.yaw)),
    vAxis: Object.freeze(rotateY(frame.vAxis, placement.yaw)),
  });
}

function surfaceFrame(
  surface: SheetSurfaceDefinition,
  placement: ShedPlacement,
  state: ShedState,
): SurfaceFrame {
  const local = surface.role === 'door' ? doorFrameAt(surface, state.door.angleQ) : surface.frame;
  return worldFrame(local, placement);
}

function frameQuaternion(frame: SurfaceFrame): THREE.Quaternion {
  const u = new THREE.Vector3(frame.uAxis.x, frame.uAxis.y, frame.uAxis.z);
  const v = new THREE.Vector3(frame.vAxis.x, frame.vAxis.y, frame.vAxis.z);
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
}

function surfaceBounds(frame: SurfaceFrame, thickness = 0.08): Box2 {
  const euler = new THREE.Euler().setFromQuaternion(frameQuaternion(frame), 'XYZ');
  return Object.freeze({
    minX: frame.centre.x - frame.halfU,
    maxX: frame.centre.x + frame.halfU,
    minY: frame.centre.y - frame.halfV,
    maxY: frame.centre.y + frame.halfV,
    minZ: frame.centre.z - thickness / 2,
    maxZ: frame.centre.z + thickness / 2,
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
  });
}

function panelCoordinates(frame: SurfaceFrame, point: Point3): Readonly<{ uQ: number; vQ: number }> {
  const offset = {
    x: point.x - frame.centre.x,
    y: point.y - frame.centre.y,
    z: point.z - frame.centre.z,
  };
  return Object.freeze({
    uQ: Math.round((offset.x * frame.uAxis.x + offset.y * frame.uAxis.y + offset.z * frame.uAxis.z) / frame.halfU * SHED_PANEL_COORD_Q),
    vQ: Math.round((offset.x * frame.vAxis.x + offset.y * frame.vAxis.y + offset.z * frame.vAxis.z) / frame.halfV * SHED_PANEL_COORD_Q),
  });
}

function closestPanelPoint(
  frame: SurfaceFrame,
  point: Point3,
): Readonly<{ distance: number; uQ: number; vQ: number }> {
  const offsetX = point.x - frame.centre.x;
  const offsetY = point.y - frame.centre.y;
  const offsetZ = point.z - frame.centre.z;
  const localU = Math.max(-frame.halfU, Math.min(
    frame.halfU,
    offsetX * frame.uAxis.x + offsetY * frame.uAxis.y + offsetZ * frame.uAxis.z,
  ));
  const localV = Math.max(-frame.halfV, Math.min(
    frame.halfV,
    offsetX * frame.vAxis.x + offsetY * frame.vAxis.y + offsetZ * frame.vAxis.z,
  ));
  const closestX = frame.centre.x + frame.uAxis.x * localU + frame.vAxis.x * localV;
  const closestY = frame.centre.y + frame.uAxis.y * localU + frame.vAxis.y * localV;
  const closestZ = frame.centre.z + frame.uAxis.z * localU + frame.vAxis.z * localV;
  return Object.freeze({
    distance: Math.hypot(point.x - closestX, point.y - closestY, point.z - closestZ),
    uQ: Math.round(localU / frame.halfU * SHED_PANEL_COORD_Q),
    vQ: Math.round(localV / frame.halfV * SHED_PANEL_COORD_Q),
  });
}

function majorDebrisBounds(shed: RuntimeShed, body: ShedState['majorDebris'][number]): Box2 {
  const localPosition = new THREE.Vector3(
    body.poseQ.position.xQ / 1_000,
    body.poseQ.position.yQ / 1_000,
    body.poseQ.position.zQ / 1_000,
  );
  const centre = transformPoint(localPosition, shed.placement);
  const localRotation = new THREE.Quaternion(
    body.poseQ.rotation.xQ / SHED_PANEL_COORD_Q,
    body.poseQ.rotation.yQ / SHED_PANEL_COORD_Q,
    body.poseQ.rotation.zQ / SHED_PANEL_COORD_Q,
    body.poseQ.rotation.wQ / SHED_PANEL_COORD_Q,
  ).normalize();
  const worldRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shed.placement.yaw).multiply(localRotation);
  const euler = new THREE.Euler().setFromQuaternion(worldRotation, 'XYZ');
  const extents = shedMajorChunkExtents(shed.definition, body.chunkId);
  return Object.freeze({
    minX: centre.x - extents.halfU,
    maxX: centre.x + extents.halfU,
    minY: centre.y - extents.halfV,
    maxY: centre.y + extents.halfV,
    minZ: centre.z - extents.halfThickness,
    maxZ: centre.z + extents.halfThickness,
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
  });
}

function houseBodyId(fragmentId: string): string {
  return `house-debris:${fragmentId}`;
}

function houseFragmentBounds(
  definition: HouseFragmentDefinition,
  body?: HouseMajorDebrisState,
): Box2 {
  const centre = body
    ? {
      x: body.poseQ.position.xQ / HOUSE_POSITION_Q,
      y: body.poseQ.position.yQ / HOUSE_POSITION_Q,
      z: body.poseQ.position.zQ / HOUSE_POSITION_Q,
    }
    : definition.position;
  const rotation = body
    ? new THREE.Quaternion(
      body.poseQ.rotation.xQ / HOUSE_ROTATION_Q,
      body.poseQ.rotation.yQ / HOUSE_ROTATION_Q,
      body.poseQ.rotation.zQ / HOUSE_ROTATION_Q,
      body.poseQ.rotation.wQ / HOUSE_ROTATION_Q,
    ).normalize()
    : new THREE.Quaternion(
      definition.rotation.x,
      definition.rotation.y,
      definition.rotation.z,
      definition.rotation.w,
    ).normalize();
  const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
  return Object.freeze({
    minX: centre.x - definition.halfExtents.x,
    maxX: centre.x + definition.halfExtents.x,
    minY: centre.y - definition.halfExtents.y,
    maxY: centre.y + definition.halfExtents.y,
    minZ: centre.z - definition.halfExtents.z,
    maxZ: centre.z + definition.halfExtents.z,
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
  });
}

function worldRevision(sheds: readonly RuntimeShed[], house: RuntimeHouseDestruction | null): number {
  return sheds.reduce((sum, shed) => sum + shed.state.revision, house?.state.revision ?? 0);
}

export class InteractiveWorldRuntime {
  readonly root = new THREE.Group();
  private readonly sheds: RuntimeShed[];
  private readonly house: RuntimeHouseDestruction | null;
  private collisionView: InteractiveWorldCollisionView;
  private disposed = false;

  constructor(
    readonly arenaId: ShedArenaId,
    private matchEpoch: number,
    placements: readonly ShedPlacement[],
    private hostAuthority: boolean,
    definition: DestructibleShedDefinition = FIELD_SHED_DEFINITION,
    retireGeometryAfterFence?: (geometry: THREE.BufferGeometry) => void,
    houseDefinitions: readonly HouseFragmentDefinition[] = [],
  ) {
    if (placements.some((placement) => placement.arenaId !== arenaId || placement.definitionId !== definition.id)) {
      throw new TypeError('Interactive-world placement does not match arena/definition');
    }
    if (new Set(placements.map((placement) => placement.id)).size !== placements.length) {
      throw new TypeError('Duplicate interactive-world placement id');
    }
    this.root.name = `interactive-world:${arenaId}`;
    this.root.userData.dynamic = true;
    this.sheds = placements.map((placement) => {
      const state = createInitialShedState(definition, placement, matchEpoch);
      const presentation = new DestructibleShedPresentation(
        definition,
        placement,
        state,
        retireGeometryAfterFence,
      );
      this.root.add(presentation.root);
      return { placement, definition, state, presentation };
    });
    if (houseDefinitions.length > 0) {
      if (arenaId !== 'atomic-acres') throw new TypeError('House destruction is Atomic Acres only');
      const state = createInitialHouseDestructionState(houseDefinitions, matchEpoch);
      const presentation = new HouseDestructionPresentation(houseDefinitions, state);
      this.root.add(presentation.root);
      this.house = { definitions: houseDefinitions, state, presentation };
    } else {
      this.house = null;
    }
    this.collisionView = this.rebuildCollisionView();
  }

  setHostAuthority(hostAuthority: boolean): void {
    this.hostAuthority = hostAuthority;
  }

  hasHostAuthority(): boolean {
    return this.hostAuthority;
  }

  private rebuildCollisionView(): InteractiveWorldCollisionView {
    const movementColliders: Box2[] = [];
    const dynamicColliders: Array<Readonly<{ id: string; bounds: Box2 }>> = [];
    const ballisticSurfaces: BallisticSurface[] = [];
    for (const shed of this.sheds) {
      for (const surface of shed.definition.surfaces) {
        const surfaceState = shed.state.surfaces.find((candidate) => candidate.surfaceId === surface.id);
        if (!surfaceState || surfaceState.stage === 'detached') continue;
        const bounds = surfaceBounds(surfaceFrame(surface, shed.placement, shed.state));
        movementColliders.push(bounds);
        dynamicColliders.push(Object.freeze({ id: `${shed.placement.id}:${surface.id}`, bounds }));
        ballisticSurfaces.push(Object.freeze({
          id: `${shed.placement.id}:${surface.id}`,
          name: `destructible shed ${surface.id}`,
          bounds,
          material: FIELD_SHED_BALLISTIC_MATERIAL_ID,
          classification: 'explicit' as const,
          destructibleSurface: Object.freeze({
            definitionId: shed.definition.id,
            placementId: shed.placement.id,
            surfaceId: surface.id,
          }),
        }));
      }
      for (const body of shed.state.majorDebris) {
        const bounds = majorDebrisBounds(shed, body);
        movementColliders.push(bounds);
        dynamicColliders.push(Object.freeze({ id: `${shed.placement.id}:debris:${body.chunkId}`, bounds }));
        ballisticSurfaces.push(Object.freeze({
          id: `${shed.placement.id}:debris:${body.chunkId}`,
          name: `destructible shed debris ${body.chunkId}`,
          bounds,
          material: FIELD_SHED_BALLISTIC_MATERIAL_ID,
          classification: 'explicit' as const,
          majorDebris: Object.freeze({ placementId: shed.placement.id, chunkId: body.chunkId }),
        }));
      }
    }
    if (this.house) {
      for (const definition of this.house.definitions) {
        const fragment = this.house.state.fragments.find((candidate) => candidate.fragmentId === definition.id);
        if (!fragment) continue;
        const body = this.house.state.majorDebris.find((candidate) => candidate.fragmentId === definition.id);
        const bounds = houseFragmentBounds(definition, body);
        if (fragment.stage !== 'detached') {
          const id = `house-fragment:${definition.id}`;
          movementColliders.push(bounds);
          dynamicColliders.push(Object.freeze({ id, bounds }));
          ballisticSurfaces.push(Object.freeze({
            id,
            name: `preauthored house ${definition.role} ${definition.id}`,
            bounds,
            material: definition.ballisticMaterial,
            classification: 'explicit' as const,
            houseFragment: Object.freeze({
              definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
              fragmentId: definition.id,
            }),
          }));
          continue;
        }
        if (!body) continue;
        const id = houseBodyId(definition.id);
        movementColliders.push(bounds);
        dynamicColliders.push(Object.freeze({ id, bounds }));
        ballisticSurfaces.push(Object.freeze({
          id,
          name: `persistent house major debris ${definition.id}`,
          bounds,
          material: definition.ballisticMaterial,
          classification: 'explicit' as const,
          houseMajorDebris: Object.freeze({
            definitionSetId: HOUSE_DESTRUCTION_DEFINITION_SET_ID,
            fragmentId: definition.id,
          }),
        }));
      }
    }
    return Object.freeze({
      revision: worldRevision(this.sheds, this.house),
      movementColliders: Object.freeze(movementColliders),
      dynamicColliders: Object.freeze(dynamicColliders),
      ballisticSurfaces: Object.freeze(ballisticSurfaces),
    });
  }

  private shedStateFitsSharedBudget(shed: RuntimeShed, state: ShedState): boolean {
    const otherShedBodies = this.sheds.reduce(
      (sum, candidate) => sum + (candidate === shed ? 0 : candidate.state.majorDebris.length),
      0,
    );
    return otherShedBodies + state.majorDebris.length <= SHARED_MAJOR_DEBRIS_BUDGET.shed;
  }

  private commit(shed: RuntimeShed, result: ShedMutationResult): ShedMutationResult {
    if (!result.accepted) return result;
    if (!this.shedStateFitsSharedBudget(shed, result.state)) {
      return Object.freeze({ accepted: false, reason: 'shared-major-body-cap', state: shed.state });
    }
    shed.state = result.state;
    shed.presentation.sync(shed.state);
    this.collisionView = this.rebuildCollisionView();
    return result;
  }

  private commitHouse(result: HouseDestructionMutationResult): HouseDestructionMutationResult {
    if (!this.house || !result.accepted) return result;
    if (result.state.majorDebris.length > SHARED_MAJOR_DEBRIS_BUDGET.house) {
      return Object.freeze({ accepted: false, reason: 'shared-major-body-cap', state: this.house.state });
    }
    this.house.state = result.state;
    this.house.presentation.sync(result.state);
    this.collisionView = this.rebuildCollisionView();
    return result;
  }

  collisions(): InteractiveWorldCollisionView {
    return this.collisionView;
  }

  collisionSnapshot(): InteractiveWorldCollisionSnapshot {
    const body = Object.freeze({
      schemaVersion: 1 as const,
      arenaId: this.arenaId,
      matchEpoch: this.matchEpoch,
      revision: worldRevision(this.sheds, this.house),
      staticDefinitionId: `${this.arenaId}-static-v65`,
      consumers: FIELD_SHED_DEFINITION.consumers,
      sheds: Object.freeze(this.sheds.map((shed) => shed.state)
        .sort((left, right) => left.placementId.localeCompare(right.placementId))),
      houseDestruction: this.house?.state ?? null,
    });
    return Object.freeze({ ...body, hashAlgorithm: 'sha256', hash: canonicalSha256(body) });
  }

  stateEnvelope(): InteractiveWorldStateEnvelope {
    const sheds = Object.freeze(this.sheds.map((shed) => shed.state)
      .sort((left, right) => left.placementId.localeCompare(right.placementId)));
    const body = Object.freeze({
      schemaVersion: 1,
      arenaId: this.arenaId,
      matchEpoch: this.matchEpoch,
      revision: worldRevision(this.sheds, this.house),
      sheds,
      houseDestruction: this.house?.state ?? null,
    });
    return Object.freeze({
      ...body,
      hashAlgorithm: 'sha256',
      hash: interactiveWorldEnvelopeHash(body),
    });
  }

  applyAuthoritativeEnvelope(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    if (!isInteractiveWorldStateEnvelope(value)) return false;
    const envelope = value;
    if (envelope.arenaId !== this.arenaId
      || envelope.matchEpoch !== this.matchEpoch
      || envelope.sheds.length !== this.sheds.length) return false;
    const states = envelope.sheds as ShedState[];
    const houseState = envelope.houseDestruction;
    if (new Set(states.map((state) => state.placementId)).size !== states.length
      || states.some((state) => state.arenaId !== this.arenaId || state.matchEpoch !== this.matchEpoch)
      || states.reduce((sum, state) => sum + state.revision, houseState?.revision ?? 0) !== envelope.revision
      || states.reduce((sum, state) => sum + state.majorDebris.length, 0) > SHARED_MAJOR_DEBRIS_BUDGET.shed
      || Number(envelope.revision) < worldRevision(this.sheds, this.house)
      || (this.house === null) !== (houseState === null)) return false;
    if (this.house && houseState && (!houseDestructionStateMatchesDefinitions(houseState, this.house.definitions)
      || houseState.majorDebris.length > SHARED_MAJOR_DEBRIS_BUDGET.house
      || houseState.revision < this.house.state.revision)) return false;
    for (const shed of this.sheds) {
      const state = states.find((candidate) => candidate.placementId === shed.placement.id);
      if (!state || state.shedId !== shed.definition.id) return false;
    }
    for (const shed of this.sheds) {
      shed.state = states.find((candidate) => candidate.placementId === shed.placement.id)!;
      shed.presentation.sync(shed.state);
    }
    if (this.house && houseState) {
      this.house.state = houseState;
      this.house.presentation.sync(houseState);
    }
    this.collisionView = this.rebuildCollisionView();
    return true;
  }

  step(tick: number): boolean {
    let changed = false;
    for (const shed of this.sheds) {
      const next = advanceShedDoor(shed.state, tick);
      if (next === shed.state) continue;
      shed.state = next;
      shed.presentation.sync(next);
      changed = true;
    }
    if (changed) this.collisionView = this.rebuildCollisionView();
    return changed;
  }

  nearestDoor(actorPosition: Point3): InteractiveWorldDoorCandidate | null {
    let nearest: InteractiveWorldDoorCandidate | null = null;
    for (const shed of this.sheds) {
      const doorDefinition = shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId)!;
      const centre = surfaceFrame(doorDefinition, shed.placement, shed.state).centre;
      const distance = Math.hypot(
        centre.x - actorPosition.x,
        centre.y - actorPosition.y,
        centre.z - actorPosition.z,
      );
      if (!nearest || distance < nearest.distance) {
        nearest = Object.freeze({ placementId: shed.placement.id, centre: Object.freeze({ ...centre }), distance });
      }
    }
    return nearest;
  }

  doorCollisionStates(): readonly InteractiveWorldDoorCollisionState[] {
    return Object.freeze(this.sheds.map((shed) => {
      const door = shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId)!;
      return Object.freeze({
        placementId: shed.placement.id,
        bounds: surfaceBounds(surfaceFrame(door, shed.placement, shed.state)),
        phase: shed.state.door.phase,
        blockedBy: shed.state.door.blockedBy,
        resumePolicy: shed.state.door.resumePolicy,
      });
    }));
  }

  nextInteractionSequence(placementId: string, actorId: string): number | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === placementId);
    if (!shed) return null;
    const prior = shed.state.interactionSequences.find((entry) => entry.actorId === actorId)?.sequence ?? 0;
    return prior + 1;
  }

  interactDoor(request: Readonly<{
    placementId: string;
    actorId: string;
    actorAlive: boolean;
    actorPosition: Point3;
    sequence: number;
    tick: number;
    hasLineOfSight: (from: Point3, to: Point3, collision: InteractiveWorldCollisionView) => boolean;
  }>): ShedMutationResult | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
    if (!shed) return null;
    const doorDefinition = shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId)!;
    const centre = surfaceFrame(doorDefinition, shed.placement, shed.state).centre;
    const distance = Math.hypot(
      centre.x - request.actorPosition.x,
      centre.y - request.actorPosition.y,
      centre.z - request.actorPosition.z,
    );
    const result = admitShedDoorInteraction(shed.state, {
      isHost: this.hostAuthority,
      matchEpoch: this.matchEpoch,
      expectedRevision: shed.state.revision,
      actorId: request.actorId,
      actorAlive: request.actorAlive,
      sequence: request.sequence,
      distance,
      hasLineOfSight: request.hasLineOfSight(request.actorPosition, centre, this.collisionView),
      tick: request.tick,
    });
    return this.commit(shed, result);
  }

  interactNearestDoor(request: Readonly<{
    actorId: string;
    actorAlive: boolean;
    actorPosition: Point3;
    sequence: number;
    tick: number;
    hasLineOfSight: (from: Point3, to: Point3, collision: InteractiveWorldCollisionView) => boolean;
  }>): ShedMutationResult | null {
    const nearest = this.nearestDoor(request.actorPosition);
    if (!nearest) return null;
    return this.interactDoor({
      ...request,
      placementId: nearest.placementId,
    });
  }

  pushDoorFromPlayerContact(request: Readonly<{
    placementId: string;
    actorId: string;
    tick: number;
  }>): ShedMutationResult | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
    if (!shed) return null;
    return this.commit(shed, pushShedDoorFromPlayerContact(shed.state, {
      isHost: this.hostAuthority,
      expectedRevision: shed.state.revision,
      actorId: request.actorId,
      tick: request.tick,
    }));
  }

  blockDoor(request: Readonly<{
    placementId: string;
    tick: number;
    kind: 'player' | 'major-debris' | 'bullet';
    entityId: string;
  }>): ShedMutationResult | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
    if (!shed) return null;
    return this.commit(shed, blockShedDoor(shed.state, {
      isHost: this.hostAuthority,
      expectedRevision: shed.state.revision,
      tick: request.tick,
      blocker: { kind: request.kind, entityId: request.entityId },
    }));
  }

  resumeDoor(placementId: string, tick: number): ShedMutationResult | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === placementId);
    if (!shed) return null;
    return this.commit(shed, resumeShedDoorWhenClear(shed.state, {
      isHost: this.hostAuthority,
      expectedRevision: shed.state.revision,
      tick,
    }));
  }

  applyHouseBulletImpact(request: Readonly<{
    surface: BallisticSurface;
    damageQ: number;
    penetrationEnergyQ: number;
    impulseQ?: QuantizedVector;
  }>): HouseDestructionMutationResult | null {
    if (request.surface.houseMajorDebris) {
      if (!this.house
        || request.surface.houseMajorDebris.definitionSetId !== HOUSE_DESTRUCTION_DEFINITION_SET_ID) return null;
      return this.commitHouse(impulseHouseMajorDebris(this.house.state, {
        isHost: this.hostAuthority,
        expectedRevision: this.house.state.revision,
        fragmentId: request.surface.houseMajorDebris.fragmentId,
        impulseQ: request.impulseQ ?? {
          xQ: 0,
          yQ: Math.min(50_000, request.penetrationEnergyQ * 20),
          zQ: 0,
        },
      }));
    }
    if (!request.surface.houseFragment
      || !this.house
      || request.surface.houseFragment.definitionSetId !== HOUSE_DESTRUCTION_DEFINITION_SET_ID) return null;
    return this.commitHouse(applyHouseFragmentDamage(this.house.definitions, this.house.state, {
      isHost: this.hostAuthority,
      matchEpoch: this.matchEpoch,
      expectedRevision: this.house.state.revision,
      fragmentId: request.surface.houseFragment.fragmentId,
      damageQ: request.damageQ,
    }));
  }

  applyBulletImpact(request: Readonly<{
    surface: BallisticSurface;
    point: Point3;
    tick: number;
    damageQ: number;
    penetrationEnergyQ: number;
    radiusUQ: number;
    radiusVQ: number;
    impulseQ?: QuantizedVector;
  }>): ShedMutationResult | null {
    if (request.surface.majorDebris) {
      const shed = this.sheds.find((candidate) => candidate.placement.id === request.surface.majorDebris?.placementId);
      if (!shed) return null;
      return this.commit(shed, impulseMajorShedDebris(shed.state, {
        isHost: this.hostAuthority,
        expectedRevision: shed.state.revision,
        chunkId: request.surface.majorDebris.chunkId,
        source: 'bullet',
        impulseQ: request.impulseQ ?? { xQ: 0, yQ: Math.min(50_000, request.penetrationEnergyQ * 20), zQ: 0 },
      }));
    }
    const identity = request.surface.destructibleSurface;
    if (!identity) return null;
    const shed = this.sheds.find((candidate) => candidate.placement.id === identity.placementId);
    const surface = shed?.definition.surfaces.find((candidate) => candidate.id === identity.surfaceId);
    if (!shed || !surface || identity.definitionId !== shed.definition.id) return null;
    const coordinates = panelCoordinates(surfaceFrame(surface, shed.placement, shed.state), request.point);
    const impact = applyShedSheetImpact(shed.definition, shed.state, {
      isHost: this.hostAuthority,
      matchEpoch: this.matchEpoch,
      expectedRevision: shed.state.revision,
      surfaceId: surface.id,
      uQ: coordinates.uQ,
      vQ: coordinates.vQ,
      radiusUQ: request.radiusUQ,
      radiusVQ: request.radiusVQ,
      damageQ: request.damageQ,
      penetrationEnergyQ: request.penetrationEnergyQ,
    });
    const impactedState = impact.accepted ? impact.state : shed.state;
    if (surface.role === 'door'
      && impactedState.door.phase !== 'blocked'
      && impactedState.door.direction !== 'stationary') {
      const blocked = blockShedDoor(impactedState, {
        isHost: this.hostAuthority,
        expectedRevision: impactedState.revision,
        tick: request.tick,
        blocker: {
          kind: 'bullet',
          entityId: `bullet-${this.matchEpoch}-${impactedState.revision + 1}`,
        },
      });
      if (blocked.accepted) return this.commit(shed, blocked);
    }
    return this.commit(shed, impact);
  }

  applyExplosion(request: Readonly<{
    placementId: string;
    surfaceId: string;
    damageQ: number;
    uQ?: number;
    vQ?: number;
    radiusQ?: number;
  }>): ShedMutationResult | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
    if (!shed) return null;
    return this.commit(shed, applyShedExplosion(shed.definition, shed.state, {
      isHost: this.hostAuthority,
      matchEpoch: this.matchEpoch,
      expectedRevision: shed.state.revision,
      surfaceId: request.surfaceId,
      damageQ: request.damageQ,
      uQ: request.uQ,
      vQ: request.vQ,
      radiusQ: request.radiusQ,
    }));
  }

  applyHouseFragmentDamage(request: Readonly<{
    fragmentId: string;
    damageQ: number;
    expectedRevision?: number;
    matchEpoch?: number;
  }>): HouseDestructionMutationResult | null {
    if (!this.house) return null;
    return this.commitHouse(applyHouseFragmentDamage(this.house.definitions, this.house.state, {
      isHost: this.hostAuthority,
      matchEpoch: request.matchEpoch ?? this.matchEpoch,
      expectedRevision: request.expectedRevision ?? this.house.state.revision,
      fragmentId: request.fragmentId,
      damageQ: request.damageQ,
    }));
  }

  applyExplosionAt(request: Readonly<{
    origin: Point3;
    radius: number;
    maximumDamageQ: number;
    /** Optional shed-only calibration; houses retain maximumDamageQ. */
    shedMaximumDamageQ?: number;
    shedBlastClass?: ShedStructuralBlastClass;
  }>): number {
    if (!this.hostAuthority
      || ![request.origin.x, request.origin.y, request.origin.z, request.radius, request.maximumDamageQ,
        request.shedMaximumDamageQ ?? request.maximumDamageQ].every(Number.isFinite)
      || request.radius <= 0
      || request.maximumDamageQ < 1
      || (request.shedMaximumDamageQ ?? request.maximumDamageQ) < 1) return 0;
    const shedMaximumDamageQ = request.shedMaximumDamageQ ?? request.maximumDamageQ;
    let mutations = 0;
    for (const shed of this.sheds) {
      if (request.shedBlastClass) {
        const localOrigin = inverseTransformPoint(request.origin, shed.placement);
        const shedDistance = Math.hypot(localOrigin.x, Math.max(0, localOrigin.y - 1.5), localOrigin.z);
        // Owner requirement: a saturation blast that lands on or beside the shed
        // must bring it down on its own - no walking up to nudge the wreckage.
        // The generous buffer means a carpet-bomb corridor across the shed's
        // position collapses it even when individual bombs land a few metres out.
        if (shedDistance <= request.radius + 5) {
          const structural = applyShedStructuralBlast(shed.definition, shed.state, {
            isHost: this.hostAuthority,
            matchEpoch: this.matchEpoch,
            expectedRevision: shed.state.revision,
            blastId: `${request.shedBlastClass}-${this.matchEpoch}-${shed.state.revision + 1}`,
            blastClass: request.shedBlastClass,
            originLocal: localOrigin,
          });
          if (structural.accepted && this.shedStateFitsSharedBudget(shed, structural.state)) {
            this.commit(shed, structural);
            mutations += 1;
            continue;
          }
        }
      }
      let nextState = shed.state;
      let shedMutations = 0;
      for (const surface of shed.definition.surfaces) {
        const state = nextState.surfaces.find((candidate) => candidate.surfaceId === surface.id);
        if (!state || state.stage === 'detached') continue;
        const impact = closestPanelPoint(surfaceFrame(surface, shed.placement, nextState), request.origin);
        if (impact.distance > request.radius) continue;
        const damageQ = Math.max(1, Math.round(shedMaximumDamageQ * (1 - impact.distance / request.radius)));
        const result = applyShedExplosion(shed.definition, nextState, {
          isHost: this.hostAuthority,
          matchEpoch: this.matchEpoch,
          expectedRevision: nextState.revision,
          surfaceId: surface.id,
          damageQ,
          uQ: impact.uQ,
          vQ: impact.vQ,
        });
        if (!result.accepted || !this.shedStateFitsSharedBudget(shed, result.state)) continue;
        nextState = result.state;
        shedMutations += 1;
      }
      if (shedMutations > 0) {
        const result = this.commit(shed, Object.freeze({ accepted: true, reason: 'accepted', state: nextState }));
        if (result.accepted) mutations += shedMutations;
      }
    }
    if (this.house) {
      for (const definition of this.house.definitions) {
        const fragment = this.house.state.fragments.find((candidate) => candidate.fragmentId === definition.id);
        if (!fragment || fragment.stage === 'detached') continue;
        const distance = Math.hypot(
          definition.position.x - request.origin.x,
          definition.position.y - request.origin.y,
          definition.position.z - request.origin.z,
        );
        if (distance > request.radius) continue;
        const result = this.applyHouseFragmentDamage({
          fragmentId: definition.id,
          damageQ: Math.max(1, Math.round(request.maximumDamageQ * (1 - distance / request.radius))),
        });
        if (result?.accepted) mutations += 1;
      }
    }
    return mutations;
  }

  majorDebrisPhysicsBodies(): readonly MajorDebrisBodyDefinition[] {
    const shedBodies = this.sheds.flatMap((shed) => shed.state.majorDebris.map((body) => {
      const localPosition = {
        x: body.poseQ.position.xQ / 1_000,
        y: body.poseQ.position.yQ / 1_000,
        z: body.poseQ.position.zQ / 1_000,
      };
      const localRotation = new THREE.Quaternion(
        body.poseQ.rotation.xQ / SHED_PANEL_COORD_Q,
        body.poseQ.rotation.yQ / SHED_PANEL_COORD_Q,
        body.poseQ.rotation.zQ / SHED_PANEL_COORD_Q,
        body.poseQ.rotation.wQ / SHED_PANEL_COORD_Q,
      ).normalize();
      const yawRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shed.placement.yaw);
      const rotation = yawRotation.multiply(localRotation);
      const linearVelocity = rotateY({
        x: body.velocityQ.xQ / 1_000,
        y: body.velocityQ.yQ / 1_000,
        z: body.velocityQ.zQ / 1_000,
      }, shed.placement.yaw);
      const angularVelocity = rotateY({
        x: body.angularVelocityQ.xQ / 1_000,
        y: body.angularVelocityQ.yQ / 1_000,
        z: body.angularVelocityQ.zQ / 1_000,
      }, shed.placement.yaw);
      const extents = shedMajorChunkExtents(shed.definition, body.chunkId);
      return Object.freeze({
        id: `${shed.placement.id}:debris:${body.chunkId}`,
        position: Object.freeze(transformPoint(localPosition, shed.placement)),
        rotation: Object.freeze({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
        halfExtents: Object.freeze({ x: extents.halfU, y: extents.halfV, z: extents.halfThickness }),
        linearVelocity: Object.freeze(linearVelocity),
        angularVelocity: Object.freeze(angularVelocity),
        sleeping: body.sleeping,
      });
    }));
    const houseBodies = this.house?.state.majorDebris.map((body) => {
      const definition = this.house!.definitions.find((candidate) => candidate.id === body.fragmentId)!;
      return Object.freeze({
        id: houseBodyId(body.fragmentId),
        position: Object.freeze({
          x: body.poseQ.position.xQ / HOUSE_POSITION_Q,
          y: body.poseQ.position.yQ / HOUSE_POSITION_Q,
          z: body.poseQ.position.zQ / HOUSE_POSITION_Q,
        }),
        rotation: Object.freeze({
          x: body.poseQ.rotation.xQ / HOUSE_ROTATION_Q,
          y: body.poseQ.rotation.yQ / HOUSE_ROTATION_Q,
          z: body.poseQ.rotation.zQ / HOUSE_ROTATION_Q,
          w: body.poseQ.rotation.wQ / HOUSE_ROTATION_Q,
        }),
        halfExtents: definition.halfExtents,
        linearVelocity: Object.freeze({
          x: body.velocityQ.xQ / HOUSE_POSITION_Q,
          y: body.velocityQ.yQ / HOUSE_POSITION_Q,
          z: body.velocityQ.zQ / HOUSE_POSITION_Q,
        }),
        angularVelocity: Object.freeze({
          x: body.angularVelocityQ.xQ / HOUSE_POSITION_Q,
          y: body.angularVelocityQ.yQ / HOUSE_POSITION_Q,
          z: body.angularVelocityQ.zQ / HOUSE_POSITION_Q,
        }),
        sleeping: body.sleeping,
      });
    }) ?? [];
    const bodies = [...shedBodies, ...houseBodies].sort((left, right) => left.id.localeCompare(right.id));
    if (shedBodies.length > SHARED_MAJOR_DEBRIS_BUDGET.shed
      || houseBodies.length > SHARED_MAJOR_DEBRIS_BUDGET.house
      || bodies.length > SHARED_MAJOR_DEBRIS_BUDGET.shed + SHARED_MAJOR_DEBRIS_BUDGET.house) {
      throw new TypeError('Interactive-world major debris exceeds shared source partitions');
    }
    return Object.freeze(bodies);
  }

  shedMajorBodyCount(): number {
    return this.sheds.reduce((sum, shed) => sum + shed.state.majorDebris.length, 0);
  }

  houseMajorBodyCount(): number {
    return this.house?.state.majorDebris.length ?? 0;
  }

  hasDetachedProfileOwnedHouseFragment(): boolean {
    if (!this.house) return false;
    return this.house.definitions.some((definition) => definition.profileOwnedPresentation
      && this.house!.state.detachedFragmentIds.includes(definition.id));
  }

  setExternalHouseProfilePresentationActive(active: boolean): void {
    this.house?.presentation.setExternalProfileOwnsStaticFragments(active);
  }

  housePresentationRaycastMeshes(): readonly THREE.InstancedMesh[] {
    return this.house?.presentation.raycastMeshes() ?? Object.freeze([]);
  }

  adoptMajorDebrisPhysics(snapshots: readonly MajorDebrisBodySnapshot[]): boolean {
    if (!this.hostAuthority || snapshots.length > SHARED_MAJOR_DEBRIS_BUDGET.total) return false;
    let changed = false;
    for (const shed of this.sheds) {
      const bodies = shed.state.majorDebris.map((body) => {
        const id = `${shed.placement.id}:debris:${body.chunkId}`;
        const snapshot = snapshots.find((candidate) => candidate.id === id);
        if (!snapshot) return null;
        const localPosition = inverseTransformPoint(snapshot.position, shed.placement);
        const worldRotation = new THREE.Quaternion(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w).normalize();
        const inverseYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -shed.placement.yaw);
        const localRotation = inverseYaw.multiply(worldRotation).normalize();
        const linearVelocity = rotateY(snapshot.linearVelocity, -shed.placement.yaw);
        const angularVelocity = rotateY(snapshot.angularVelocity, -shed.placement.yaw);
        return Object.freeze({
          chunkId: body.chunkId,
          poseQ: Object.freeze({
            position: Object.freeze({
              xQ: Math.round(localPosition.x * 1_000),
              yQ: Math.round(localPosition.y * 1_000),
              zQ: Math.round(localPosition.z * 1_000),
            }),
            rotation: Object.freeze({
              xQ: Math.round(localRotation.x * SHED_PANEL_COORD_Q),
              yQ: Math.round(localRotation.y * SHED_PANEL_COORD_Q),
              zQ: Math.round(localRotation.z * SHED_PANEL_COORD_Q),
              wQ: Math.round(localRotation.w * SHED_PANEL_COORD_Q),
            }),
          }),
          velocityQ: Object.freeze({
            xQ: Math.round(linearVelocity.x * 1_000),
            yQ: Math.round(linearVelocity.y * 1_000),
            zQ: Math.round(linearVelocity.z * 1_000),
          }),
          angularVelocityQ: Object.freeze({
            xQ: Math.round(angularVelocity.x * 1_000),
            yQ: Math.round(angularVelocity.y * 1_000),
            zQ: Math.round(angularVelocity.z * 1_000),
          }),
          sleeping: snapshot.sleeping,
          flat: snapshot.flat,
        });
      });
      if (bodies.some((body) => body === null)) return false;
      const result = synchronizeMajorShedDebris(shed.state, {
        isHost: true,
        expectedRevision: shed.state.revision,
        bodies: bodies as ShedState['majorDebris'],
      });
      if (!result.accepted) return false;
      if (result.state !== shed.state) {
        this.commit(shed, result);
        changed = true;
      }
    }
    if (this.house) {
      const bodies = this.house.state.majorDebris.map((body): HouseMajorDebrisState | null => {
        const snapshot = snapshots.find((candidate) => candidate.id === houseBodyId(body.fragmentId));
        if (!snapshot) return null;
        const rotation = new THREE.Quaternion(
          snapshot.rotation.x,
          snapshot.rotation.y,
          snapshot.rotation.z,
          snapshot.rotation.w,
        ).normalize();
        return Object.freeze({
          fragmentId: body.fragmentId,
          poseQ: Object.freeze({
            position: Object.freeze({
              xQ: Math.round(snapshot.position.x * HOUSE_POSITION_Q),
              yQ: Math.round(snapshot.position.y * HOUSE_POSITION_Q),
              zQ: Math.round(snapshot.position.z * HOUSE_POSITION_Q),
            }),
            rotation: Object.freeze({
              xQ: Math.round(rotation.x * HOUSE_ROTATION_Q),
              yQ: Math.round(rotation.y * HOUSE_ROTATION_Q),
              zQ: Math.round(rotation.z * HOUSE_ROTATION_Q),
              wQ: Math.round(rotation.w * HOUSE_ROTATION_Q),
            }),
          }),
          velocityQ: Object.freeze({
            xQ: Math.round(snapshot.linearVelocity.x * HOUSE_POSITION_Q),
            yQ: Math.round(snapshot.linearVelocity.y * HOUSE_POSITION_Q),
            zQ: Math.round(snapshot.linearVelocity.z * HOUSE_POSITION_Q),
          }),
          angularVelocityQ: Object.freeze({
            xQ: Math.round(snapshot.angularVelocity.x * HOUSE_POSITION_Q),
            yQ: Math.round(snapshot.angularVelocity.y * HOUSE_POSITION_Q),
            zQ: Math.round(snapshot.angularVelocity.z * HOUSE_POSITION_Q),
          }),
          sleeping: snapshot.sleeping,
          flat: snapshot.flat,
        });
      });
      if (bodies.some((body) => body === null)) return false;
      const result = synchronizeHouseMajorDebris(this.house.state, {
        isHost: true,
        expectedRevision: this.house.state.revision,
        bodies: bodies as HouseMajorDebrisState[],
      });
      if (!result.accepted) return false;
      if (result.state !== this.house.state) {
        this.commitHouse(result);
        changed = true;
      }
    }
    return changed || snapshots.length === 0;
  }

  readonly apertureQuery: BallisticApertureQuery = (surface, point) => {
    const identity = surface.destructibleSurface;
    if (!identity) return false;
    const shed = this.sheds.find((candidate) => candidate.placement.id === identity.placementId);
    if (!shed || identity.definitionId !== shed.definition.id) return false;
    const surfaceDefinition = shed.definition.surfaces.find((candidate) => candidate.id === identity.surfaceId);
    if (!surfaceDefinition) return false;
    if (surfaceDefinition.role !== 'door') {
      return shedApertureContainsWorldPoint(shed.definition, shed.placement, shed.state, identity.surfaceId, point);
    }
    const coordinates = panelCoordinates(surfaceFrame(surfaceDefinition, shed.placement, shed.state), point);
    const surfaceState = shed.state.surfaces.find((candidate) => candidate.surfaceId === identity.surfaceId);
    return surfaceState?.apertures.some((aperture) => {
      const du = (coordinates.uQ - aperture.uQ) / aperture.radiusUQ;
      const dv = (coordinates.vQ - aperture.vQ) / aperture.radiusVQ;
      return du * du + dv * dv <= 1;
    }) ?? false;
  };

  reset(nextMatchEpoch: number): void {
    if (!Number.isSafeInteger(nextMatchEpoch) || nextMatchEpoch <= this.matchEpoch) throw new TypeError('Interactive-world epoch must advance');
    for (const shed of this.sheds) {
      shed.state = resetShedState(shed.state, nextMatchEpoch, shed.definition, shed.placement);
      shed.presentation.sync(shed.state);
    }
    if (this.house) {
      this.house.state = resetHouseDestructionState(this.house.state, this.house.definitions, nextMatchEpoch);
      this.house.presentation.sync(this.house.state);
    }
    this.matchEpoch = nextMatchEpoch;
    this.collisionView = this.rebuildCollisionView();
  }

  telemetry(): InteractiveWorldRuntimeTelemetry {
    const states = this.sheds.map((shed) => shed.state);
    return Object.freeze({
      arenaId: this.arenaId,
      matchEpoch: this.matchEpoch,
      revision: worldRevision(this.sheds, this.house),
      sheds: this.sheds.length,
      apertures: states.reduce((sum, state) => sum + state.surfaces.reduce((surfaceSum, surface) => surfaceSum + surface.apertures.length, 0), 0),
      dents: states.reduce((sum, state) => sum + state.surfaces.reduce((surfaceSum, surface) => surfaceSum + surface.dents.length, 0), 0),
      detachedChunks: states.reduce((sum, state) => sum + state.detachedChunkIds.length, 0),
      awakeMajorBodies: states.reduce((sum, state) => sum + state.majorDebris.filter((body) => !body.sleeping).length, 0)
        + (this.house?.state.majorDebris.filter((body) => !body.sleeping).length ?? 0),
      movementColliders: this.collisionView.movementColliders.length,
      ballisticSurfaces: this.collisionView.ballisticSurfaces.length,
      presentationDraws: this.sheds.reduce((sum, shed) => sum + shed.presentation.telemetry(shed.state).activeDraws, 0)
        + (this.house?.presentation.telemetry().activeDraws ?? 0),
      presentationRetiredGeometries: this.sheds.reduce(
        (sum, shed) => sum + shed.presentation.telemetry(shed.state).retiredGeometries,
        0,
      ),
      houseFragments: this.house?.definitions.length ?? 0,
      houseDetachedFragments: this.house?.state.detachedFragmentIds.length ?? 0,
      houseMajorBodies: this.house?.state.majorDebris.length ?? 0,
      majorBodiesTotal: this.shedMajorBodyCount() + this.houseMajorBodyCount(),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sheds.forEach((shed) => shed.presentation.dispose());
    this.house?.presentation.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
