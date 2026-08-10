import * as THREE from 'three';
import {
  FLARE_PROJECTILE_EFFECT,
  flareBurnDamage,
} from './special-weapon-effects';
import {
  FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
  FLARE_BURN_PULSE_COUNT,
  FLARE_BURN_PULSE_INTERVAL_MS,
  advanceFlareAuthorityCheckpointThroughDowntime,
  isFlareAuthorityContinuationCheckpoint,
  type FlareAuthorityContinuationEntity,
  type FlareAuthorityContinuationCheckpoint,
} from './flare-authority-checkpoint';
import {
  FLARE_PRESENTATION_SCHEMA_VERSION,
  canonicalizeFlarePresentationReplicas,
  flarePresentationReplicaKey,
  isFlarePresentationStateMessage,
  type FlarePresentationReplicaSnapshot,
  type FlarePresentationStateMessage,
} from './flare-presentation-protocol';
import type { Team } from './protocol';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export type FlareProjectileTarget = Readonly<{
  id: string;
  lifeId: number;
  kind: 'player' | 'bot' | 'practice-target';
  position: THREE.Vector3;
  radiusM: number;
}>;

export type FlareProjectileImpact = Readonly<{
  ownerId: string;
  ownerTeam: Team;
  actionNonce: number;
  authority: boolean;
  point: THREE.Vector3;
  target: FlareProjectileTarget | null;
  directDamage: number;
}>;

export type FlareBurnPulse = Readonly<{
  ownerId: string;
  ownerTeam: Team;
  actionNonce: number;
  point: THREE.Vector3;
  target: FlareProjectileTarget;
  damage: number;
  pulseIndex: number;
}>;

export type FlareProjectileExpiry = Readonly<{
  ownerId: string;
  ownerTeam: Team;
  actionNonce: number;
  authority: boolean;
  point: THREE.Vector3;
}>;

export type FlareProjectileCallbacks = Readonly<{
  /** Earliest collision fraction in [0,1], or null when the segment is clear. */
  worldCollisionFraction: (start: THREE.Vector3, delta: THREE.Vector3, radiusM: number) => number | null;
  withinBounds: (point: THREE.Vector3) => boolean;
  hostileTargets: (ownerId: string, ownerTeam: Team) => readonly FlareProjectileTarget[];
  burnLineOfSight: (point: THREE.Vector3, target: FlareProjectileTarget) => boolean;
  onImpact: (impact: FlareProjectileImpact) => void;
  onBurnPulse: (pulse: FlareBurnPulse) => void;
  onExpire: (expiry: FlareProjectileExpiry) => void;
}>;

const EMPTY_FLARE_PROJECTILE_TARGETS: readonly FlareProjectileTarget[] = Object.freeze([]);

type FlareEntity = {
  root: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  lightIntensity: number;
  velocity: THREE.Vector3;
  ownerId: string;
  ownerTeam: Team;
  authority: boolean;
  actionNonce: number;
  phase: 'idle' | 'flight' | 'burn';
  spawnedAt: number;
  impactedAt: number;
  expiresAt: number;
  nextBurnPulseAt: number;
  burnPulseIndex: number;
};

export type FlareActiveReplicaInspection = FlarePresentationReplicaSnapshot & Readonly<{
  authority: boolean;
}>;

export type FlarePresentationReconcileResult = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'stale' | 'invalid';
  created: number;
  updated: number;
  released: number;
  skippedExpired: number;
  skippedAuthority: number;
  poolExhaustions: number;
}>;

export type FlareAuthorityRestoreResult = Readonly<{
  accepted: boolean;
  restored: number;
  skippedExpired: number;
  skippedBurnPulses: number;
  poolExhaustions: number;
}>;

export function flareSegmentSphereFraction(
  start: THREE.Vector3,
  delta: THREE.Vector3,
  centre: THREE.Vector3,
  radiusM: number,
): number | null {
  if (!Number.isFinite(radiusM) || radiusM <= 0 || delta.lengthSq() <= 1e-12) return null;
  const offsetX = start.x - centre.x;
  const offsetY = start.y - centre.y;
  const offsetZ = start.z - centre.z;
  const a = delta.lengthSq();
  const b = 2 * (offsetX * delta.x + offsetY * delta.y + offsetZ * delta.z);
  const c = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radiusM * radiusM;
  if (c <= 0) return 0;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  if (far >= 0 && far <= 1) return far;
  return null;
}

/** Fixed-capacity projectile and burn-light system; no runtime mesh allocation. */
export class FlareProjectileSystem {
  readonly root = new THREE.Group();
  private readonly entities: FlareEntity[] = [];
  private readonly light: THREE.PointLight;
  private readonly admittedKeys = new Set<string>();
  private readonly activeByKey = new Map<string, FlareEntity>();
  private spawnCount = 0;
  private impactCount = 0;
  private burnPulseCount = 0;
  private poolExhaustions = 0;
  private readonly start = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly next = new THREE.Vector3();
  private readonly flightDirection = new THREE.Vector3();
  private readonly projectileForward = new THREE.Vector3(0, 0, -1);
  private readonly targetCacheOwnerIds = new Array<string>(FLARE_PROJECTILE_EFFECT.poolCapacity);
  private readonly targetCacheOwnerTeams = new Uint8Array(FLARE_PROJECTILE_EFFECT.poolCapacity);
  private readonly targetCacheValues = new Array<readonly FlareProjectileTarget[]>(FLARE_PROJECTILE_EFFECT.poolCapacity);
  private targetCacheCount = 0;
  private lifecycleRevision = 0;
  private prewarmGeneration = -1;
  private authoritySnapshotSeq = 0;
  private lastReplicaSnapshotSeq = -1;
  private lastReplicaSampledAtHostTimeMs = Number.NEGATIVE_INFINITY;
  private replicaReconciliations = 0;
  private replicaCreates = 0;
  private replicaUpdates = 0;
  private replicaReleases = 0;
  private replicaRejectedSnapshots = 0;
  private lightWrites = 0;

  constructor(
    scene: THREE.Scene,
    flattenMaterials: boolean,
    private readonly dynamicLightsEnabled = true,
  ) {
    this.root.name = 'signal-flare-projectile-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    // Three r185 invalidates the scene LightsNode when visible light membership
    // changes. One retained light at zero idle intensity keeps that graph stable
    // without making all twelve pooled flares permanent shader inputs.
    this.light = new THREE.PointLight(0xff4a24, 0, 9, 2);
    this.light.name = 'signal-flare-bounded-light';
    this.light.castShadow = false;
    this.light.visible = dynamicLightsEnabled;
    this.light.userData.baseIntensity = flattenMaterials ? 0 : 18;
    this.root.add(this.light);
    const coreGeometry = new THREE.SphereGeometry(0.095, 10, 7);
    const haloGeometry = new THREE.SphereGeometry(0.24, 10, 7);
    for (let index = 0; index < FLARE_PROJECTILE_EFFECT.poolCapacity; index += 1) {
      const root = new THREE.Group();
      root.name = `signal-flare-${index + 1}`;
      root.visible = false;
      root.userData.presentationOnly = true;
      const core = new THREE.Mesh(coreGeometry, new THREE.MeshBasicMaterial({
        color: 0xfff0cf,
        toneMapped: false,
      }));
      const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({
        color: 0xff3a1d,
        transparent: true,
        opacity: flattenMaterials ? 0.34 : 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      halo.userData.baseOpacity = flattenMaterials ? 0.34 : 0.5;
      core.name = 'signal-flare-core';
      halo.name = 'signal-flare-halo';
      root.add(halo, core);
      this.root.add(root);
      this.entities.push({
        root, core, halo, lightIntensity: 0, velocity: new THREE.Vector3(), ownerId: '', ownerTeam: 0,
        authority: false, actionNonce: 0, phase: 'idle', spawnedAt: 0, impactedAt: 0,
        expiresAt: 0, nextBurnPulseAt: 0, burnPulseIndex: 0,
      });
    }
  }

  spawn(input: Readonly<{
    ownerId: string;
    ownerTeam: Team;
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    authority: boolean;
    actionNonce: number;
    now: number;
  }>): boolean {
    const key = flarePresentationReplicaKey(input);
    if (!input.ownerId || input.ownerId.length > 80 || this.admittedKeys.has(key) || this.activeByKey.has(key)
      || !Number.isSafeInteger(input.actionNonce) || input.actionNonce < 0
      || !Number.isFinite(input.now) || !finiteVector3(input.origin)
      || !finiteVector3(input.direction) || input.direction.lengthSq() < 0.999 ** 2) return false;
    let available: FlareEntity | null = null;
    for (const entity of this.entities) {
      if (entity.phase !== 'idle') continue;
      available = entity;
      break;
    }
    if (!available) {
      this.poolExhaustions += 1;
      return false;
    }
    this.admittedKeys.add(key);
    while (this.admittedKeys.size > 128) this.admittedKeys.delete(this.admittedKeys.values().next().value!);
    available.root.position.copy(input.origin);
    available.root.visible = true;
    available.root.scale.setScalar(1);
    available.velocity.copy(input.direction).normalize().multiplyScalar(FLARE_PROJECTILE_EFFECT.speedMps);
    available.ownerId = input.ownerId;
    available.ownerTeam = input.ownerTeam;
    available.authority = input.authority;
    available.actionNonce = input.actionNonce;
    available.phase = 'flight';
    available.spawnedAt = input.now;
    available.impactedAt = 0;
    available.expiresAt = input.now + FLARE_PROJECTILE_EFFECT.maximumFlightMs;
    available.nextBurnPulseAt = 0;
    available.burnPulseIndex = 0;
    available.halo.scale.setScalar(1);
    const haloMaterial = available.halo.material;
    if (haloMaterial instanceof THREE.MeshBasicMaterial) {
      haloMaterial.opacity = Number(available.halo.userData.baseOpacity ?? 0.5);
    }
    available.lightIntensity = Number(this.light.userData.baseIntensity ?? 0);
    this.activeByKey.set(key, available);
    this.spawnCount += 1;
    this.lifecycleRevision += 1;
    this.syncSharedLight();
    return true;
  }

  update(deltaSeconds: number, now: number, callbacks: FlareProjectileCallbacks): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.1 || !Number.isFinite(now)) return;
    this.targetCacheCount = 0;
    for (const entity of this.entities) {
      if (entity.phase === 'idle') continue;
      const needsTargets = entity.phase === 'flight'
        || (entity.authority && entity.nextBurnPulseAt <= now && entity.nextBurnPulseAt <= entity.expiresAt);
      const targets = needsTargets
        ? this.targetsForUpdate(entity.ownerId, entity.ownerTeam, callbacks)
        : EMPTY_FLARE_PROJECTILE_TARGETS;
      if (entity.phase === 'flight') this.updateFlight(entity, deltaSeconds, now, targets, callbacks);
      if (entity.phase === 'burn') this.updateBurn(entity, now, targets, callbacks);
    }
    this.syncSharedLight();
  }

  hasActiveProjectiles(): boolean {
    for (const entity of this.entities) {
      if (entity.phase !== 'idle') return true;
    }
    return false;
  }

  requiresWorldSnapshot(now: number): boolean {
    if (!Number.isFinite(now)) return false;
    for (const entity of this.entities) {
      if (entity.phase === 'flight') return true;
      if (entity.phase === 'burn' && entity.authority
        && entity.nextBurnPulseAt <= now && entity.nextBurnPulseAt <= entity.expiresAt) return true;
    }
    return false;
  }

  lifecycleRevisionValue(): number {
    return this.lifecycleRevision;
  }

  burnPulseRevisionValue(): number {
    return this.burnPulseCount;
  }

  clear(): void {
    for (const entity of this.entities) this.release(entity);
    this.admittedKeys.clear();
    this.activeByKey.clear();
    this.authoritySnapshotSeq = 0;
    this.lastReplicaSnapshotSeq = -1;
    this.lastReplicaSampledAtHostTimeMs = Number.NEGATIVE_INFINITY;
    this.syncSharedLight();
  }

  inspectActiveReplicas(now: number): readonly FlareActiveReplicaInspection[] {
    if (!Number.isFinite(now)) return Object.freeze([]);
    const replicas = this.entities
      .filter((entity) => entity.phase !== 'idle' && entity.expiresAt > now)
      .map((entity) => Object.freeze({
        ownerId: entity.ownerId,
        ownerTeam: entity.ownerTeam,
        actionNonce: entity.actionNonce,
        phase: entity.phase as 'flight' | 'burn',
        position: Object.freeze(entity.root.position.toArray() as [number, number, number]),
        velocity: entity.phase === 'flight'
          ? Object.freeze(entity.velocity.toArray() as [number, number, number])
          : null,
        remainingMs: entity.expiresAt - now,
        authority: entity.authority,
      }))
      .sort((left, right) => {
        if (left.ownerId < right.ownerId) return -1;
        if (left.ownerId > right.ownerId) return 1;
        return left.actionNonce - right.actionNonce;
      });
    return Object.freeze(replicas);
  }

  exportAuthorityPresentationReplicas(now: number): readonly FlarePresentationReplicaSnapshot[] {
    const canonical = canonicalizeFlarePresentationReplicas(
      this.inspectActiveReplicas(now)
        .filter((replica) => replica.authority)
        .map(({ authority: _authority, ...replica }) => replica),
    );
    return canonical ?? Object.freeze([]);
  }

  createAuthorityPresentationState(input: Readonly<{
    by: string;
    matchEpoch: number;
    weaponGeneration: number;
    sampledAtHostTimeMs: number;
    nonce: number;
  }>): FlarePresentationStateMessage | null {
    if (this.authoritySnapshotSeq >= Number.MAX_SAFE_INTEGER) return null;
    const message: FlarePresentationStateMessage = Object.freeze({
      type: 'flare-presentation-state',
      schemaVersion: FLARE_PRESENTATION_SCHEMA_VERSION,
      by: input.by,
      matchEpoch: input.matchEpoch,
      weaponGeneration: input.weaponGeneration,
      snapshotSeq: this.authoritySnapshotSeq + 1,
      sampledAtHostTimeMs: input.sampledAtHostTimeMs,
      flares: this.exportAuthorityPresentationReplicas(input.sampledAtHostTimeMs),
      nonce: input.nonce,
    });
    if (!isFlarePresentationStateMessage(message)) return null;
    this.authoritySnapshotSeq = message.snapshotSeq;
    return message;
  }

  reconcilePresentationState(
    message: FlarePresentationStateMessage,
    currentHostTimeMs: number,
    localNow = performance.now(),
  ): FlarePresentationReconcileResult {
    const reject = (reason: 'stale' | 'invalid'): FlarePresentationReconcileResult => {
      this.replicaRejectedSnapshots += 1;
      return Object.freeze({
        accepted: false, reason, created: 0, updated: 0, released: 0,
        skippedExpired: 0, skippedAuthority: 0, poolExhaustions: 0,
      });
    };
    if (!isFlarePresentationStateMessage(message)
      || !Number.isFinite(currentHostTimeMs) || !Number.isFinite(localNow)
      || currentHostTimeMs < message.sampledAtHostTimeMs - 250) return reject('invalid');
    if (message.snapshotSeq <= this.lastReplicaSnapshotSeq
      || message.sampledAtHostTimeMs < this.lastReplicaSampledAtHostTimeMs) return reject('stale');
    const transportAgeMs = Math.max(0, currentHostTimeMs - message.sampledAtHostTimeMs);
    const prepared: Array<Readonly<{
      snapshot: FlarePresentationReplicaSnapshot;
      position: THREE.Vector3;
      velocity: THREE.Vector3 | null;
      remainingMs: number;
    }>> = [];
    let skippedExpired = 0;
    for (const snapshot of message.flares) {
      const remainingMs = snapshot.remainingMs - transportAgeMs;
      if (remainingMs <= 0) {
        skippedExpired += 1;
        continue;
      }
      const position = new THREE.Vector3(...snapshot.position);
      const velocity = snapshot.velocity ? new THREE.Vector3(...snapshot.velocity) : null;
      if (snapshot.phase === 'flight' && velocity) {
        let advanceMs = transportAgeMs;
        while (advanceMs > 0) {
          const stepSeconds = Math.min(50, advanceMs) / 1_000;
          velocity.y -= FLARE_PROJECTILE_EFFECT.gravityMps2 * stepSeconds;
          position.addScaledVector(velocity, stepSeconds);
          advanceMs -= stepSeconds * 1_000;
        }
      }
      if (!position.toArray().every(Number.isFinite)
        || velocity && !velocity.toArray().every(Number.isFinite)) return reject('invalid');
      prepared.push(Object.freeze({ snapshot, position, velocity, remainingMs }));
    }

    const activeKeys = new Set(prepared.map(({ snapshot }) => flarePresentationReplicaKey(snapshot)));
    let released = 0;
    for (const entity of this.entities) {
      if (entity.phase === 'idle' || entity.authority
        || activeKeys.has(flarePresentationReplicaKey(entity))) continue;
      this.release(entity);
      released += 1;
    }

    let created = 0;
    let updated = 0;
    let skippedAuthority = 0;
    let poolExhaustions = 0;
    for (const entry of prepared) {
      const key = flarePresentationReplicaKey(entry.snapshot);
      let entity = this.activeByKey.get(key);
      if (entity?.authority) {
        skippedAuthority += 1;
        continue;
      }
      if (!entity) {
        entity = this.entities.find((candidate) => candidate.phase === 'idle');
        if (!entity) {
          this.poolExhaustions += 1;
          poolExhaustions += 1;
          continue;
        }
        const previouslyAdmitted = this.admittedKeys.has(key);
        this.admittedKeys.add(key);
        while (this.admittedKeys.size > 128) this.admittedKeys.delete(this.admittedKeys.values().next().value!);
        this.activeByKey.set(key, entity);
        if (previouslyAdmitted) {
          // The event lane may have already presented and locally retired this
          // identity before a newer reliable snapshot arrives. Restore its
          // presentation without counting a second logical flare.
          updated += 1;
        } else {
          this.spawnCount += 1;
          created += 1;
        }
      } else {
        updated += 1;
      }
      this.applyPresentationReplica(entity, entry.snapshot, entry.position, entry.velocity, entry.remainingMs, localNow);
    }
    this.lastReplicaSnapshotSeq = message.snapshotSeq;
    this.lastReplicaSampledAtHostTimeMs = message.sampledAtHostTimeMs;
    this.replicaReconciliations += 1;
    this.replicaCreates += created;
    this.replicaUpdates += updated;
    this.replicaReleases += released;
    this.syncSharedLight();
    return Object.freeze({
      accepted: true, reason: 'accepted', created, updated, released,
      skippedExpired, skippedAuthority, poolExhaustions,
    });
  }

  checkpointAuthority(now: number): FlareAuthorityContinuationCheckpoint | null {
    if (!Number.isFinite(now)) return null;
    const effects = this.entities
      .filter((entity) => entity.authority && entity.phase !== 'idle' && entity.expiresAt > now)
      .map((entity) => Object.freeze({
        ownerId: entity.ownerId,
        ownerTeam: entity.ownerTeam,
        actionNonce: entity.actionNonce,
        phase: entity.phase as 'flight' | 'burn',
        position: Object.freeze(entity.root.position.toArray() as [number, number, number]),
        velocity: entity.phase === 'flight'
          ? Object.freeze(entity.velocity.toArray() as [number, number, number])
          : null,
        remainingMs: entity.expiresAt - now,
        nextBurnPulseRemainingMs: entity.phase === 'burn' && entity.burnPulseIndex < FLARE_BURN_PULSE_COUNT
          ? Math.max(0, entity.nextBurnPulseAt - now)
          : null,
        burnPulseIndex: entity.phase === 'burn' ? entity.burnPulseIndex : 0,
      }))
      .sort((left, right) => {
        if (left.ownerId < right.ownerId) return -1;
        if (left.ownerId > right.ownerId) return 1;
        return left.actionNonce - right.actionNonce;
      });
    const checkpoint = Object.freeze({
      schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
      snapshotSeq: this.authoritySnapshotSeq,
      effects: Object.freeze(effects),
    });
    return isFlareAuthorityContinuationCheckpoint(checkpoint) ? checkpoint : null;
  }

  restoreAuthorityCheckpoint(
    checkpoint: FlareAuthorityContinuationCheckpoint,
    downtimeMs: number,
    now: number,
  ): FlareAuthorityRestoreResult {
    const advanced = advanceFlareAuthorityCheckpointThroughDowntime(checkpoint, downtimeMs);
    if (!advanced || !Number.isFinite(now)) {
      return Object.freeze({
        accepted: false, restored: 0, skippedExpired: 0,
        skippedBurnPulses: 0, poolExhaustions: 0,
      });
    }
    this.clear();
    this.authoritySnapshotSeq = advanced.checkpoint.snapshotSeq;
    let restored = 0;
    let poolExhaustions = 0;
    for (const effect of advanced.checkpoint.effects) {
      const entity = this.entities.find((candidate) => candidate.phase === 'idle');
      if (!entity) {
        this.poolExhaustions += 1;
        poolExhaustions += 1;
        continue;
      }
      const key = flarePresentationReplicaKey(effect);
      this.admittedKeys.add(key);
      this.activeByKey.set(key, entity);
      this.applyAuthorityCheckpointEntity(entity, effect, now);
      restored += 1;
    }
    this.syncSharedLight();
    return Object.freeze({
      accepted: true,
      restored,
      skippedExpired: advanced.skippedExpired,
      skippedBurnPulses: advanced.skippedBurnPulses,
      poolExhaustions,
    });
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, sceneGeneration: number): Promise<void> {
    if (this.prewarmGeneration === sceneGeneration) return;
    await this.withStagedFirstShotPresentation(camera, async () => {
      const scene = this.root.parent as THREE.Scene;
      await runtime.compileAndRender(
        runtime.backend === 'webgl2' && this.dynamicLightsEnabled ? scene : this.root,
        camera,
        scene,
      );
    });
    this.prewarmGeneration = sceneGeneration;
  }

  /**
   * Stage the complete retained first-shot visual without admitting authority.
   * WebGL compatibility deliberately keeps the PointLight out of its shader
   * graph, but the emissive core and halo must still be submitted against the
   * final match scene before the first live flare.
   */
  async withStagedFirstShotPresentation(
    camera: THREE.Camera,
    action: () => Promise<void>,
  ): Promise<void> {
    await this.withStagedVisualPresentation(camera, false, action);
  }

  /** Stage the retained impact/burn appearance against the constant shared light graph. */
  async withStagedImpactBurnPresentation(
    camera: THREE.Camera,
    action: () => Promise<void>,
  ): Promise<void> {
    await this.withStagedVisualPresentation(camera, true, action);
  }

  private async withStagedVisualPresentation(
    camera: THREE.Camera,
    burn: boolean,
    action: () => Promise<void>,
  ): Promise<void> {
    const entity = this.entities[0];
    if (!entity) return action();
    const priorVisible = entity.root.visible;
    const priorPosition = entity.root.position.clone();
    const priorQuaternion = entity.root.quaternion.clone();
    const priorScale = entity.root.scale.clone();
    const priorCoreVisible = entity.core.visible;
    const priorHaloVisible = entity.halo.visible;
    const priorHaloScale = entity.halo.scale.clone();
    const haloMaterial = entity.halo.material;
    const priorHaloOpacity = haloMaterial instanceof THREE.MeshBasicMaterial ? haloMaterial.opacity : null;
    const priorEntityLightIntensity = entity.lightIntensity;
    const priorLightIntensity = this.light.intensity;
    const priorLightPosition = this.light.position.clone();
    const priorLightWrites = this.lightWrites;
    camera.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
    entity.root.position.copy(cameraPosition).addScaledVector(cameraDirection, 4);
    entity.root.quaternion.identity();
    entity.root.scale.setScalar(1);
    entity.root.visible = true;
    entity.core.visible = true;
    entity.halo.visible = true;
    entity.halo.scale.setScalar(burn ? 1.8 : 1);
    if (haloMaterial instanceof THREE.MeshBasicMaterial) {
      haloMaterial.opacity = burn ? 0.52 : Number(entity.halo.userData.baseOpacity ?? 0.5);
    }
    entity.lightIntensity = Number(this.light.userData.baseIntensity ?? 0);
    if (this.dynamicLightsEnabled) {
      this.light.position.copy(entity.root.position);
      this.light.intensity = entity.lightIntensity;
      this.lightWrites += 1;
    }
    try {
      await action();
    } finally {
      entity.root.visible = priorVisible;
      entity.root.position.copy(priorPosition);
      entity.root.quaternion.copy(priorQuaternion);
      entity.root.scale.copy(priorScale);
      entity.core.visible = priorCoreVisible;
      entity.halo.visible = priorHaloVisible;
      entity.halo.scale.copy(priorHaloScale);
      if (haloMaterial instanceof THREE.MeshBasicMaterial && priorHaloOpacity !== null) {
        haloMaterial.opacity = priorHaloOpacity;
      }
      entity.lightIntensity = priorEntityLightIntensity;
      this.light.intensity = priorLightIntensity;
      this.light.position.copy(priorLightPosition);
      this.lightWrites = priorLightWrites;
    }
  }

  telemetry(): Readonly<{
    capacity: number;
    active: number;
    flying: number;
    burning: number;
    spawnCount: number;
    impactCount: number;
    burnPulseCount: number;
    poolExhaustions: number;
    prewarmGeneration: number;
    authoritySnapshotSeq: number;
    lastReplicaSnapshotSeq: number;
    replicaReconciliations: number;
    replicaCreates: number;
    replicaUpdates: number;
    replicaReleases: number;
    replicaRejectedSnapshots: number;
    visibleEffects: number;
    boundedLightCount: 1;
    boundedLightVisible: boolean;
    boundedLightIntensity: number;
    boundedLightWrites: number;
  }> {
    return Object.freeze({
      capacity: this.entities.length,
      active: this.entities.filter((entity) => entity.phase !== 'idle').length,
      flying: this.entities.filter((entity) => entity.phase === 'flight').length,
      burning: this.entities.filter((entity) => entity.phase === 'burn').length,
      spawnCount: this.spawnCount,
      impactCount: this.impactCount,
      burnPulseCount: this.burnPulseCount,
      poolExhaustions: this.poolExhaustions,
      prewarmGeneration: this.prewarmGeneration,
      authoritySnapshotSeq: this.authoritySnapshotSeq,
      lastReplicaSnapshotSeq: this.lastReplicaSnapshotSeq,
      replicaReconciliations: this.replicaReconciliations,
      replicaCreates: this.replicaCreates,
      replicaUpdates: this.replicaUpdates,
      replicaReleases: this.replicaReleases,
      replicaRejectedSnapshots: this.replicaRejectedSnapshots,
      visibleEffects: this.entities.filter((entity) => entity.root.visible).length,
      boundedLightCount: 1,
      boundedLightVisible: this.light.visible,
      boundedLightIntensity: this.light.intensity,
      boundedLightWrites: this.lightWrites,
    });
  }

  private resetVisibleAppearance(entity: FlareEntity): void {
    entity.root.visible = true;
    entity.root.scale.setScalar(1);
    entity.halo.scale.setScalar(1);
    const haloMaterial = entity.halo.material;
    if (haloMaterial instanceof THREE.MeshBasicMaterial) {
      haloMaterial.opacity = Number(entity.halo.userData.baseOpacity ?? 0.5);
    }
    entity.lightIntensity = Number(this.light.userData.baseIntensity ?? 0);
  }

  private applyBurnAppearance(entity: FlareEntity, progress: number): void {
    const bounded = Math.max(0, Math.min(1, progress));
    entity.halo.scale.setScalar(1.8 + bounded * 1.6);
    const haloMaterial = entity.halo.material;
    if (haloMaterial instanceof THREE.MeshBasicMaterial) haloMaterial.opacity = (1 - bounded) * 0.52;
    entity.lightIntensity = Number(this.light.userData.baseIntensity ?? 18) * (1 - bounded);
  }

  private applyPresentationReplica(
    entity: FlareEntity,
    snapshot: FlarePresentationReplicaSnapshot,
    position: THREE.Vector3,
    velocity: THREE.Vector3 | null,
    remainingMs: number,
    now: number,
  ): void {
    const previousPhase = entity.phase;
    this.resetVisibleAppearance(entity);
    entity.root.position.copy(position);
    entity.ownerId = snapshot.ownerId;
    entity.ownerTeam = snapshot.ownerTeam;
    entity.authority = false;
    entity.actionNonce = snapshot.actionNonce;
    entity.phase = snapshot.phase;
    if (previousPhase !== entity.phase) this.lifecycleRevision += 1;
    entity.expiresAt = now + remainingMs;
    if (snapshot.phase === 'flight' && velocity) {
      entity.velocity.copy(velocity);
      entity.spawnedAt = now - (FLARE_PROJECTILE_EFFECT.maximumFlightMs - remainingMs);
      entity.impactedAt = 0;
      entity.nextBurnPulseAt = 0;
      entity.burnPulseIndex = 0;
      this.flightDirection.copy(entity.velocity).normalize();
      entity.root.quaternion.setFromUnitVectors(this.projectileForward, this.flightDirection);
      return;
    }
    entity.velocity.set(0, 0, 0);
    entity.impactedAt = now - (FLARE_PROJECTILE_EFFECT.burnDurationMs - remainingMs);
    entity.nextBurnPulseAt = Number.POSITIVE_INFINITY;
    entity.burnPulseIndex = Math.min(
      FLARE_BURN_PULSE_COUNT,
      Math.floor((FLARE_PROJECTILE_EFFECT.burnDurationMs - remainingMs) / FLARE_BURN_PULSE_INTERVAL_MS),
    );
    this.applyBurnAppearance(entity, (now - entity.impactedAt) / FLARE_PROJECTILE_EFFECT.burnDurationMs);
  }

  private applyAuthorityCheckpointEntity(
    entity: FlareEntity,
    effect: FlareAuthorityContinuationEntity,
    now: number,
  ): void {
    const previousPhase = entity.phase;
    this.resetVisibleAppearance(entity);
    entity.root.position.set(...effect.position);
    entity.ownerId = effect.ownerId;
    entity.ownerTeam = effect.ownerTeam;
    entity.authority = true;
    entity.actionNonce = effect.actionNonce;
    entity.phase = effect.phase;
    if (previousPhase !== entity.phase) this.lifecycleRevision += 1;
    entity.expiresAt = now + effect.remainingMs;
    entity.burnPulseIndex = effect.burnPulseIndex;
    if (effect.phase === 'flight') {
      entity.velocity.set(...effect.velocity!);
      entity.spawnedAt = now - (FLARE_PROJECTILE_EFFECT.maximumFlightMs - effect.remainingMs);
      entity.impactedAt = 0;
      entity.nextBurnPulseAt = 0;
      this.flightDirection.copy(entity.velocity).normalize();
      entity.root.quaternion.setFromUnitVectors(this.projectileForward, this.flightDirection);
      return;
    }
    entity.velocity.set(0, 0, 0);
    entity.impactedAt = now - (FLARE_PROJECTILE_EFFECT.burnDurationMs - effect.remainingMs);
    entity.nextBurnPulseAt = effect.nextBurnPulseRemainingMs === null
      ? Number.POSITIVE_INFINITY
      : now + effect.nextBurnPulseRemainingMs;
    this.applyBurnAppearance(entity, (now - entity.impactedAt) / FLARE_PROJECTILE_EFFECT.burnDurationMs);
  }

  private updateFlight(
    entity: FlareEntity,
    deltaSeconds: number,
    now: number,
    targets: readonly FlareProjectileTarget[],
    callbacks: FlareProjectileCallbacks,
  ): void {
    this.start.copy(entity.root.position);
    entity.velocity.y -= FLARE_PROJECTILE_EFFECT.gravityMps2 * deltaSeconds;
    this.delta.copy(entity.velocity).multiplyScalar(deltaSeconds);
    let collisionFraction = callbacks.worldCollisionFraction(this.start, this.delta, FLARE_PROJECTILE_EFFECT.collisionRadiusM);
    if (collisionFraction !== null && (!Number.isFinite(collisionFraction) || collisionFraction < 0 || collisionFraction > 1)) {
      collisionFraction = null;
    }
    let target: FlareProjectileTarget | null = null;
    let targetFraction = Number.POSITIVE_INFINITY;
    for (const candidate of targets) {
      const fraction = flareSegmentSphereFraction(
        this.start,
        this.delta,
        candidate.position,
        candidate.radiusM + FLARE_PROJECTILE_EFFECT.collisionRadiusM,
      );
      if (fraction !== null && fraction < targetFraction) {
        targetFraction = fraction;
        target = candidate;
      }
    }
    const worldFraction = collisionFraction ?? Number.POSITIVE_INFINITY;
    const hitFraction = Math.min(worldFraction, targetFraction);
    if (hitFraction <= 1) {
      if (hitFraction <= 1) entity.root.position.copy(this.start).addScaledVector(this.delta, hitFraction);
      this.beginBurn(entity, now, targetFraction <= worldFraction ? target : null, callbacks);
      return;
    }
    this.next.copy(this.start).add(this.delta);
    if (now >= entity.expiresAt || !callbacks.withinBounds(this.next)) {
      entity.root.position.copy(this.next);
      callbacks.onExpire(Object.freeze({
        ownerId: entity.ownerId,
        ownerTeam: entity.ownerTeam,
        actionNonce: entity.actionNonce,
        authority: entity.authority,
        point: this.next.clone(),
      }));
      this.release(entity);
      return;
    }
    entity.root.position.add(this.delta);
    this.flightDirection.copy(entity.velocity).normalize();
    entity.root.quaternion.setFromUnitVectors(this.projectileForward, this.flightDirection);
  }

  private beginBurn(
    entity: FlareEntity,
    now: number,
    target: FlareProjectileTarget | null,
    callbacks: FlareProjectileCallbacks,
  ): void {
    entity.phase = 'burn';
    entity.impactedAt = now;
    entity.expiresAt = now + FLARE_PROJECTILE_EFFECT.burnDurationMs;
    entity.nextBurnPulseAt = now + FLARE_BURN_PULSE_INTERVAL_MS;
    entity.burnPulseIndex = 0;
    entity.velocity.set(0, 0, 0);
    entity.halo.scale.setScalar(1.8);
    this.impactCount += 1;
    this.lifecycleRevision += 1;
    callbacks.onImpact(Object.freeze({
      ownerId: entity.ownerId,
      ownerTeam: entity.ownerTeam,
      actionNonce: entity.actionNonce,
      authority: entity.authority,
      point: entity.root.position.clone(),
      target,
      directDamage: target && entity.authority ? FLARE_PROJECTILE_EFFECT.directDamage : 0,
    }));
  }

  private updateBurn(
    entity: FlareEntity,
    now: number,
    targets: readonly FlareProjectileTarget[],
    callbacks: FlareProjectileCallbacks,
  ): void {
    const progress = Math.max(0, Math.min(1, (now - entity.impactedAt) / FLARE_PROJECTILE_EFFECT.burnDurationMs));
    entity.halo.scale.setScalar(1.8 + progress * 1.6);
    const haloMaterial = entity.halo.material;
    if (haloMaterial instanceof THREE.MeshBasicMaterial) haloMaterial.opacity = (1 - progress) * 0.52;
    entity.lightIntensity = Number(this.light.userData.baseIntensity ?? 18) * (1 - progress);
    while (entity.authority && entity.nextBurnPulseAt <= now && entity.nextBurnPulseAt <= entity.expiresAt) {
      entity.burnPulseIndex += 1;
      for (const target of targets) {
        const distance = entity.root.position.distanceTo(target.position);
        const totalDamage = flareBurnDamage(distance);
        if (totalDamage <= 0 || !callbacks.burnLineOfSight(entity.root.position, target)) continue;
        callbacks.onBurnPulse(Object.freeze({
          ownerId: entity.ownerId,
          ownerTeam: entity.ownerTeam,
          actionNonce: entity.actionNonce,
          point: entity.root.position.clone(),
          target,
          damage: totalDamage / FLARE_BURN_PULSE_COUNT,
          pulseIndex: entity.burnPulseIndex,
        }));
        this.burnPulseCount += 1;
      }
      entity.nextBurnPulseAt += FLARE_BURN_PULSE_INTERVAL_MS;
    }
    if (now >= entity.expiresAt) this.release(entity);
  }

  private release(entity: FlareEntity): void {
    const wasActive = entity.phase !== 'idle';
    if (entity.ownerId) this.activeByKey.delete(flarePresentationReplicaKey(entity));
    entity.phase = 'idle';
    entity.root.visible = false;
    entity.root.position.set(0, 0, 0);
    entity.root.quaternion.identity();
    entity.root.scale.setScalar(1);
    entity.ownerId = '';
    entity.ownerTeam = 0;
    entity.authority = false;
    entity.actionNonce = 0;
    entity.spawnedAt = 0;
    entity.impactedAt = 0;
    entity.expiresAt = 0;
    entity.nextBurnPulseAt = 0;
    entity.burnPulseIndex = 0;
    entity.velocity.set(0, 0, 0);
    entity.lightIntensity = 0;
    if (wasActive) this.lifecycleRevision += 1;
  }

  private syncSharedLight(): void {
    // Concurrent flares retain emissive cores/halos; the bounded world light
    // follows the strongest live flare without changing scene-light membership.
    let selected: FlareEntity | null = null;
    for (const entity of this.entities) {
      if (entity.phase === 'idle' || entity.lightIntensity <= 0) continue;
      if (!selected || entity.lightIntensity > selected.lightIntensity) selected = entity;
    }
    const intensity = this.dynamicLightsEnabled ? selected?.lightIntensity ?? 0 : 0;
    let changed = false;
    if (this.light.intensity !== intensity) {
      this.light.intensity = intensity;
      changed = true;
    }
    if (selected && !this.light.position.equals(selected.root.position)) {
      this.light.position.copy(selected.root.position);
      changed = true;
    }
    if (changed) this.lightWrites += 1;
  }

  private targetsForUpdate(
    ownerId: string,
    ownerTeam: Team,
    callbacks: FlareProjectileCallbacks,
  ): readonly FlareProjectileTarget[] {
    for (let index = 0; index < this.targetCacheCount; index += 1) {
      if (this.targetCacheOwnerIds[index] === ownerId && this.targetCacheOwnerTeams[index] === ownerTeam) {
        return this.targetCacheValues[index]!;
      }
    }
    const targets = callbacks.hostileTargets(ownerId, ownerTeam);
    const slot = this.targetCacheCount;
    this.targetCacheOwnerIds[slot] = ownerId;
    this.targetCacheOwnerTeams[slot] = ownerTeam;
    this.targetCacheValues[slot] = targets;
    this.targetCacheCount += 1;
    return targets;
  }
}

function finiteVector3(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
