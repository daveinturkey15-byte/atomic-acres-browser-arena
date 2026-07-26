import * as THREE from 'three';
import type { BallisticApertureQuery, BallisticSurface } from './ballistics';
import type { Box2, Point3 } from './collision';
import {
  SHED_ANGLE_Q,
  SHED_PANEL_COORD_Q,
  admitShedDoorInteraction,
  advanceShedDoor,
  applyShedExplosion,
  applyShedSheetImpact,
  blockShedDoor,
  createInitialShedState,
  createWorldCollisionSnapshot,
  isShedState,
  impulseMajorShedDebris,
  resetShedState,
  resumeShedDoorWhenClear,
  shedApertureContainsWorldPoint,
  type DestructibleShedDefinition,
  type SheetSurfaceDefinition,
  type ShedMutationResult,
  type ShedPlacement,
  type ShedState,
  type WorldCollisionSnapshot,
  type QuantizedVector,
} from './destructible-world';
import {
  DestructibleShedPresentation,
  FIELD_SHED_DEFINITION,
} from './destructible-shed-presentation';

export type InteractiveWorldCollisionView = Readonly<{
  revision: number;
  movementColliders: readonly Box2[];
  ballisticSurfaces: readonly BallisticSurface[];
}>;

export type InteractiveWorldRuntimeTelemetry = Readonly<{
  arenaId: ShedPlacement['arenaId'];
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
}>;

export type InteractiveWorldStateEnvelope = Readonly<{
  schemaVersion: 1;
  arenaId: ShedPlacement['arenaId'];
  matchEpoch: number;
  revision: number;
  sheds: readonly ShedState[];
  hashAlgorithm: 'sha256';
  hash: string;
}>;

type RuntimeShed = {
  placement: ShedPlacement;
  definition: DestructibleShedDefinition;
  state: ShedState;
  presentation: DestructibleShedPresentation;
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
  return Object.freeze({
    minX: centre.x - 0.625,
    maxX: centre.x + 0.625,
    minY: centre.y - 0.06,
    maxY: centre.y + 0.06,
    minZ: centre.z - 0.875,
    maxZ: centre.z + 0.875,
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
  });
}

function worldRevision(sheds: readonly RuntimeShed[]): number {
  return sheds.reduce((sum, shed) => sum + shed.state.revision, 0);
}

export class InteractiveWorldRuntime {
  readonly root = new THREE.Group();
  private readonly sheds: RuntimeShed[];
  private collisionView: InteractiveWorldCollisionView;
  private disposed = false;

  constructor(
    readonly arenaId: ShedPlacement['arenaId'],
    private matchEpoch: number,
    placements: readonly ShedPlacement[],
    readonly hostAuthority: boolean,
    definition: DestructibleShedDefinition = FIELD_SHED_DEFINITION,
  ) {
    if (placements.some((placement) => placement.arenaId !== arenaId || placement.definitionId !== definition.id)) {
      throw new TypeError('Interactive-world placement does not match arena/definition');
    }
    if (new Set(placements.map((placement) => placement.id)).size !== placements.length) {
      throw new TypeError('Duplicate interactive-world placement id');
    }
    this.root.name = `interactive-world:${arenaId}`;
    this.sheds = placements.map((placement) => {
      const state = createInitialShedState(definition, placement, matchEpoch);
      const presentation = new DestructibleShedPresentation(definition, placement, state);
      this.root.add(presentation.root);
      return { placement, definition, state, presentation };
    });
    this.collisionView = this.rebuildCollisionView();
  }

  private rebuildCollisionView(): InteractiveWorldCollisionView {
    const movementColliders: Box2[] = [];
    const ballisticSurfaces: BallisticSurface[] = [];
    for (const shed of this.sheds) {
      for (const surface of shed.definition.surfaces) {
        const surfaceState = shed.state.surfaces.find((candidate) => candidate.surfaceId === surface.id);
        if (!surfaceState || surfaceState.stage === 'detached') continue;
        const bounds = surfaceBounds(surfaceFrame(surface, shed.placement, shed.state));
        movementColliders.push(bounds);
        ballisticSurfaces.push(Object.freeze({
          id: `${shed.placement.id}:${surface.id}`,
          name: `destructible shed ${surface.id}`,
          bounds,
          material: 'thin-metal' as const,
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
        ballisticSurfaces.push(Object.freeze({
          id: `${shed.placement.id}:debris:${body.chunkId}`,
          name: `destructible shed debris ${body.chunkId}`,
          bounds,
          material: 'thin-metal' as const,
          classification: 'explicit' as const,
          majorDebris: Object.freeze({ placementId: shed.placement.id, chunkId: body.chunkId }),
        }));
      }
    }
    return Object.freeze({
      revision: worldRevision(this.sheds),
      movementColliders: Object.freeze(movementColliders),
      ballisticSurfaces: Object.freeze(ballisticSurfaces),
    });
  }

  private commit(shed: RuntimeShed, result: ShedMutationResult): ShedMutationResult {
    if (!result.accepted) return result;
    shed.state = result.state;
    shed.presentation.sync(shed.state);
    this.collisionView = this.rebuildCollisionView();
    return result;
  }

  collisions(): InteractiveWorldCollisionView {
    return this.collisionView;
  }

  collisionSnapshot(): WorldCollisionSnapshot {
    return createWorldCollisionSnapshot(
      this.arenaId,
      `${this.arenaId}-static-v65`,
      this.sheds.map((shed) => shed.state),
    );
  }

  stateEnvelope(): InteractiveWorldStateEnvelope {
    const sheds = Object.freeze(this.sheds.map((shed) => shed.state));
    const snapshot = createWorldCollisionSnapshot(this.arenaId, `${this.arenaId}-static-v65`, sheds);
    return Object.freeze({
      schemaVersion: 1,
      arenaId: this.arenaId,
      matchEpoch: this.matchEpoch,
      revision: worldRevision(this.sheds),
      sheds,
      hashAlgorithm: 'sha256',
      hash: snapshot.hash,
    });
  }

  applyAuthoritativeEnvelope(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const envelope = value as Partial<InteractiveWorldStateEnvelope> & Record<string, unknown>;
    const keys = Object.keys(envelope).sort();
    if (keys.join('|') !== ['arenaId', 'matchEpoch', 'revision', 'schemaVersion', 'sheds', 'hashAlgorithm', 'hash'].sort().join('|')
      || envelope.schemaVersion !== 1
      || envelope.arenaId !== this.arenaId
      || envelope.matchEpoch !== this.matchEpoch
      || !Number.isSafeInteger(envelope.revision)
      || envelope.hashAlgorithm !== 'sha256'
      || typeof envelope.hash !== 'string'
      || !/^[a-f0-9]{64}$/.test(envelope.hash)
      || !Array.isArray(envelope.sheds)
      || envelope.sheds.length !== this.sheds.length
      || !envelope.sheds.every(isShedState)) return false;
    const states = envelope.sheds as ShedState[];
    if (new Set(states.map((state) => state.placementId)).size !== states.length
      || states.some((state) => state.arenaId !== this.arenaId || state.matchEpoch !== this.matchEpoch)
      || states.reduce((sum, state) => sum + state.revision, 0) !== envelope.revision
      || Number(envelope.revision) < worldRevision(this.sheds)) return false;
    const candidateHash = createWorldCollisionSnapshot(this.arenaId, `${this.arenaId}-static-v65`, states).hash;
    if (candidateHash !== envelope.hash) return false;
    for (const shed of this.sheds) {
      const state = states.find((candidate) => candidate.placementId === shed.placement.id);
      if (!state || state.shedId !== shed.definition.id) return false;
    }
    for (const shed of this.sheds) {
      shed.state = states.find((candidate) => candidate.placementId === shed.placement.id)!;
      shed.presentation.sync(shed.state);
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

  interactNearestDoor(request: Readonly<{
    actorId: string;
    actorAlive: boolean;
    actorPosition: Point3;
    sequence: number;
    tick: number;
    hasLineOfSight: (from: Point3, to: Point3, collision: InteractiveWorldCollisionView) => boolean;
  }>): ShedMutationResult | null {
    let nearest: { shed: RuntimeShed; centre: Point3; distance: number } | null = null;
    for (const shed of this.sheds) {
      const doorDefinition = shed.definition.surfaces.find((surface) => surface.id === shed.definition.doorSurfaceId)!;
      const centre = surfaceFrame(doorDefinition, shed.placement, shed.state).centre;
      const distance = Math.hypot(
        centre.x - request.actorPosition.x,
        centre.y - request.actorPosition.y,
        centre.z - request.actorPosition.z,
      );
      if (!nearest || distance < nearest.distance) nearest = { shed, centre, distance };
    }
    if (!nearest) return null;
    const result = admitShedDoorInteraction(nearest.shed.state, {
      isHost: this.hostAuthority,
      matchEpoch: this.matchEpoch,
      expectedRevision: nearest.shed.state.revision,
      actorId: request.actorId,
      actorAlive: request.actorAlive,
      sequence: request.sequence,
      distance: nearest.distance,
      hasLineOfSight: request.hasLineOfSight(request.actorPosition, nearest.centre, this.collisionView),
      tick: request.tick,
    });
    return this.commit(nearest.shed, result);
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

  applyBulletImpact(request: Readonly<{
    surface: BallisticSurface;
    point: Point3;
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
    return this.commit(shed, applyShedSheetImpact(shed.definition, shed.state, {
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
    }));
  }

  applyExplosion(request: Readonly<{
    placementId: string;
    surfaceId: string;
    damageQ: number;
  }>): ShedMutationResult | null {
    const shed = this.sheds.find((candidate) => candidate.placement.id === request.placementId);
    if (!shed) return null;
    return this.commit(shed, applyShedExplosion(shed.definition, shed.state, {
      isHost: this.hostAuthority,
      matchEpoch: this.matchEpoch,
      expectedRevision: shed.state.revision,
      surfaceId: request.surfaceId,
      damageQ: request.damageQ,
    }));
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
    this.matchEpoch = nextMatchEpoch;
    this.collisionView = this.rebuildCollisionView();
  }

  telemetry(): InteractiveWorldRuntimeTelemetry {
    const states = this.sheds.map((shed) => shed.state);
    return Object.freeze({
      arenaId: this.arenaId,
      matchEpoch: this.matchEpoch,
      revision: worldRevision(this.sheds),
      sheds: this.sheds.length,
      apertures: states.reduce((sum, state) => sum + state.surfaces.reduce((surfaceSum, surface) => surfaceSum + surface.apertures.length, 0), 0),
      dents: states.reduce((sum, state) => sum + state.surfaces.reduce((surfaceSum, surface) => surfaceSum + surface.dents.length, 0), 0),
      detachedChunks: states.reduce((sum, state) => sum + state.detachedChunkIds.length, 0),
      awakeMajorBodies: states.reduce((sum, state) => sum + state.majorDebris.filter((body) => !body.sleeping).length, 0),
      movementColliders: this.collisionView.movementColliders.length,
      ballisticSurfaces: this.collisionView.ballisticSurfaces.length,
      presentationDraws: this.sheds.reduce((sum, shed) => sum + shed.presentation.telemetry(shed.state).activeDraws, 0),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sheds.forEach((shed) => shed.presentation.dispose());
    this.root.removeFromParent();
    this.root.clear();
  }
}
