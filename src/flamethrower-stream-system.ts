import * as THREE from 'three';
import type { Team } from './protocol';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

// Hardware keeps the accepted four-particle silhouette. Proven software
// adapters use two broader retained particles: this halves their additive
// overdraw and live matrix uploads without changing the authoritative trace,
// ground-fire pool, duration, range or hardware presentation.
const HARDWARE_PARTICLES_PER_EMISSION = 4;
const SOFTWARE_PARTICLES_PER_EMISSION = 2;
const MIN_STREAM_DISTANCE_M = 0.35;
export const FLAMETHROWER_GROUND_FIRE_DURATION_MS = 5_000;
const GROUND_FIRE_POOL_CAPACITY = 24;

export const FLAMETHROWER_GROUND_FIRE_MERGE_RADIUS_M = 0.8;

/**
 * A software adapter already draws the retained, spatially merged ground-fire
 * pool. Do not additionally expand every independent authority pulse into the
 * generic impact-particle/decal pool; that duplicate presentation scales with
 * authority entries even though damage and pulse timing remain independent.
 */
export function flamethrowerPulseImpactPresentationEnabled(softwareAdapter: boolean): boolean {
  return !softwareAdapter;
}

type MutableGroundFire = {
  active: boolean;
  ownerId: string;
  ownerTeam: Team;
  point: THREE.Vector3;
  actionNonce: number;
  sequence: number;
  expiresAt: number;
  nextPulseAt: number;
};

export type FlamethrowerGroundFire = Readonly<MutableGroundFire>;

/**
 * Fixed-capacity authority pool for napalm patches. Every admitted ignition
 * retains its own pulse timing and point, preserving the host damage contract;
 * the separate presentation pool spatially merges their visuals.
 */
export class FlamethrowerGroundFirePool {
  private readonly entries: MutableGroundFire[];
  private readonly dueIndices: Uint8Array;
  private activeEntries = 0;
  private nextSequence = 0;

  constructor(capacity = GROUND_FIRE_POOL_CAPACITY) {
    const boundedCapacity = Number.isSafeInteger(capacity) && capacity > 0 ? capacity : GROUND_FIRE_POOL_CAPACITY;
    this.entries = Array.from({ length: boundedCapacity }, () => ({
      active: false,
      ownerId: '',
      ownerTeam: 0 as Team,
      point: new THREE.Vector3(),
      actionNonce: 0,
      sequence: 0,
      expiresAt: 0,
      nextPulseAt: 0,
    }));
    this.dueIndices = new Uint8Array(boundedCapacity);
  }

  ignite(input: Readonly<{
    ownerId: string;
    ownerTeam: Team;
    point: THREE.Vector3;
    actionNonce: number;
    now: number;
    durationMs: number;
    pulseIntervalMs: number;
  }>): 'created' | 'exhausted' | 'invalid' {
    if (!input.ownerId || !Number.isSafeInteger(input.actionNonce)
      || !finiteVector3(input.point) || !Number.isFinite(input.now)
      || !Number.isFinite(input.durationMs) || input.durationMs <= 0
      || !Number.isFinite(input.pulseIntervalMs) || input.pulseIntervalMs <= 0) return 'invalid';
    let entry: MutableGroundFire | null = null;
    for (const candidate of this.entries) {
      if (candidate.active) continue;
      entry = candidate;
      break;
    }
    if (!entry) return 'exhausted';
    entry.active = true;
    entry.ownerId = input.ownerId;
    entry.ownerTeam = input.ownerTeam;
    entry.point.copy(input.point);
    entry.actionNonce = input.actionNonce;
    entry.sequence = ++this.nextSequence;
    entry.expiresAt = input.now + input.durationMs;
    entry.nextPulseAt = input.now + input.pulseIntervalMs;
    this.activeEntries += 1;
    return 'created';
  }

  update(now: number, pulseIntervalMs: number, onPulse: (fire: FlamethrowerGroundFire) => void): void {
    if (!Number.isFinite(now) || !Number.isFinite(pulseIntervalMs) || pulseIntervalMs <= 0) return;
    let dueCount = 0;
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index]!;
      if (!entry.active) continue;
      if (now >= entry.expiresAt) {
        this.release(entry);
        continue;
      }
      if (now < entry.nextPulseAt) continue;
      let insertion = dueCount;
      while (insertion > 0
        && this.entries[this.dueIndices[insertion - 1]!]!.sequence < entry.sequence) {
        this.dueIndices[insertion] = this.dueIndices[insertion - 1]!;
        insertion -= 1;
      }
      this.dueIndices[insertion] = index;
      dueCount += 1;
    }
    for (let index = 0; index < dueCount; index += 1) {
      const entry = this.entries[this.dueIndices[index]!]!;
      entry.nextPulseAt = now + pulseIntervalMs;
      onPulse(entry);
    }
  }

  clear(): void {
    for (const entry of this.entries) this.release(entry);
    this.nextSequence = 0;
  }

  activeCount(): number {
    return this.activeEntries;
  }

  capacity(): number {
    return this.entries.length;
  }

  private release(entry: MutableGroundFire): void {
    if (!entry.active) return;
    entry.active = false;
    entry.ownerId = '';
    entry.ownerTeam = 0;
    entry.actionNonce = 0;
    entry.sequence = 0;
    entry.expiresAt = 0;
    entry.nextPulseAt = 0;
    this.activeEntries -= 1;
  }
}

function finiteVector3(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

type FlamethrowerPresentationState = Readonly<{
  active: Uint8Array;
  positions: Float32Array;
  velocities: Float32Array;
  agesMs: Float32Array;
  lifetimesMs: Float32Array;
  cursor: number;
  sequence: number;
  emissions: number;
  particlesSpawned: number;
  poolExhaustions: number;
  maximumActive: number;
  lastDistanceM: number;
  activeParticles: number;
  activeGroundFires: number;
  groundActive: Uint8Array;
  groundPositions: Float32Array;
  groundSpawnedAt: Float64Array;
  groundExpiresAt: Float64Array;
  groundCursor: number;
  groundFireMerges: number;
  particleMatrixWrites: number;
  groundMatrixWrites: number;
  direction: THREE.Vector3;
  side: THREE.Vector3;
  emitterPosition: THREE.Vector3;
  lightVisible: boolean;
  lightIntensity: number;
  lightPosition: THREE.Vector3;
}>;

/** Fixed-capacity first/third-person flame stream with no live mesh creation. */
export class FlamethrowerStreamSystem {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly groundMesh: THREE.InstancedMesh;
  private readonly light: THREE.PointLight;
  private readonly active = new Uint8Array(FLAMETHROWER_EFFECT.poolCapacity);
  private readonly positions = new Float32Array(FLAMETHROWER_EFFECT.poolCapacity * 3);
  private readonly velocities = new Float32Array(FLAMETHROWER_EFFECT.poolCapacity * 3);
  private readonly agesMs = new Float32Array(FLAMETHROWER_EFFECT.poolCapacity);
  private readonly lifetimesMs = new Float32Array(FLAMETHROWER_EFFECT.poolCapacity);
  private readonly dummy = new THREE.Object3D();
  private readonly groundActive = new Uint8Array(GROUND_FIRE_POOL_CAPACITY);
  private readonly groundPositions = new Float32Array(GROUND_FIRE_POOL_CAPACITY * 3);
  private readonly groundSpawnedAt = new Float64Array(GROUND_FIRE_POOL_CAPACITY);
  private readonly groundExpiresAt = new Float64Array(GROUND_FIRE_POOL_CAPACITY);
  private readonly groundDummy = new THREE.Object3D();
  private readonly direction = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly emitterPosition = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly particlesPerEmission: number;
  private cursor = 0;
  private groundCursor = 0;
  private sequence = 0;
  private emissions = 0;
  private particlesSpawned = 0;
  private poolExhaustions = 0;
  private maximumActive = 0;
  private activeParticles = 0;
  private activeGroundFires = 0;
  private particleMatrixWrites = 0;
  private groundMatrixWrites = 0;
  private groundFireMerges = 0;
  private lastDistanceM = 0;
  private prewarmGeneration = -1;

  constructor(scene: THREE.Scene, flattenMaterials: boolean, private readonly softwareAdapter = false) {
    this.particlesPerEmission = softwareAdapter
      ? SOFTWARE_PARTICLES_PER_EMISSION
      : HARDWARE_PARTICLES_PER_EMISSION;
    this.root.name = 'flamethrower-stream-pool';
    this.root.userData.presentationOnly = true;
    const material = new THREE.MeshBasicMaterial({
      color: 0xff8a2b,
      transparent: true,
      opacity: flattenMaterials ? 0.72 : 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexColors: true,
    });
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.17, 1),
      material,
      FLAMETHROWER_EFFECT.poolCapacity,
    );
    this.mesh.name = 'flamethrower-stream-instanced-flame';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData.presentationOnly = true;
    this.groundMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.82, 14),
      new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: flattenMaterials ? 0.42 : 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      GROUND_FIRE_POOL_CAPACITY,
    );
    this.groundMesh.name = 'flamethrower-ground-fire-pool';
    this.groundMesh.frustumCulled = false;
    this.groundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.groundMesh.userData.presentationOnly = true;
    this.light = new THREE.PointLight(0xff6a22, flattenMaterials ? 0 : 14, 7, 2);
    this.light.name = 'flamethrower-bounded-stream-light';
    this.light.castShadow = false;
    this.light.visible = false;
    this.root.add(this.mesh, this.groundMesh, this.light);
    scene.add(this.root);
    this.writeMatrices();
    this.writeGroundMatrices(0);
  }

  emit(start: THREE.Vector3, end: THREE.Vector3, now: number): boolean {
    if (!Number.isFinite(now) || !finiteVector3(start) || !finiteVector3(end)) return false;
    this.direction.copy(end).sub(start);
    const distance = Math.min(FLAMETHROWER_EFFECT.rangeM, this.direction.length());
    if (distance < MIN_STREAM_DISTANCE_M) return false;
    this.direction.normalize();
    this.side.crossVectors(this.direction, this.up);
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    else this.side.normalize();
    this.emitterPosition.copy(start);
    this.lastDistanceM = distance;
    this.emissions += 1;
    this.sequence += 1;
    let emitted = 0;
    for (let index = 0; index < this.particlesPerEmission; index += 1) {
      if (this.activeParticles >= FLAMETHROWER_EFFECT.maximumActiveParticles) {
        this.poolExhaustions += 1;
        break;
      }
      const slot = this.nextInactiveSlot();
      if (slot === null) {
        this.poolExhaustions += 1;
        break;
      }
      const phase = (index + 1) / (this.particlesPerEmission + 1);
      const wave = Math.sin(this.sequence * 2.17 + index * 1.73);
      const lateral = wave * FLAMETHROWER_EFFECT.streamRadiusM * (0.22 + phase * 0.48);
      const offset = slot * 3;
      this.positions[offset] = start.x + this.direction.x * distance * phase + this.side.x * lateral;
      this.positions[offset + 1] = start.y + this.direction.y * distance * phase + phase * phase * 0.24;
      this.positions[offset + 2] = start.z + this.direction.z * distance * phase + this.side.z * lateral;
      const speed = 7.5 + (1 - phase) * 4.5;
      this.velocities[offset] = this.direction.x * speed + this.side.x * wave * 0.7;
      this.velocities[offset + 1] = this.direction.y * speed + 0.45 + phase * 0.8;
      this.velocities[offset + 2] = this.direction.z * speed + this.side.z * wave * 0.7;
      this.agesMs[slot] = phase * 90;
      this.lifetimesMs[slot] = FLAMETHROWER_EFFECT.particleLifetimeMs * (0.78 + phase * 0.22);
      this.active[slot] = 1;
      this.activeParticles += 1;
      this.mesh.setColorAt(
        slot,
        this.colour.setHSL(0.045 + phase * 0.045, 1, 0.56 + (1 - phase) * 0.18),
      );
      emitted += 1;
      this.writeParticleMatrix(slot);
    }
    this.particlesSpawned += emitted;
    this.maximumActive = Math.max(this.maximumActive, this.activeParticles);
    this.light.position.copy(start);
    this.light.visible = emitted > 0;
    this.mesh.instanceColor!.needsUpdate = true;
    if (emitted > 0) this.mesh.instanceMatrix.needsUpdate = true;
    return emitted > 0;
  }

  /** Retained bounded scorch-flame pool used by the authoritative ground-fire lane. */
  igniteGround(point: THREE.Vector3, now: number): boolean {
    if (!Number.isFinite(now) || !finiteVector3(point)) return false;
    let slot = -1;
    for (let index = 0; index < this.groundActive.length; index += 1) {
      if (this.groundActive[index] === 0) continue;
      if (now >= this.groundExpiresAt[index]) {
        this.groundActive[index] = 0;
        this.activeGroundFires -= 1;
        this.writeGroundMatrix(index, now);
        continue;
      }
      const offset = index * 3;
      const dx = this.groundPositions[offset] - point.x;
      const dz = this.groundPositions[offset + 2] - point.z;
      if (dx * dx + dz * dz <= 0.8 * 0.8) {
        slot = index;
        this.groundFireMerges += 1;
        break;
      }
    }
    if (slot < 0) {
      slot = this.groundActive.findIndex((active) => active === 0);
      if (slot < 0) slot = this.groundCursor;
      this.groundCursor = (slot + 1) % this.groundActive.length;
      this.groundSpawnedAt[slot] = now;
      if (this.groundActive[slot] === 0) this.activeGroundFires += 1;
    }
    const offset = slot * 3;
    this.groundActive[slot] = 1;
    this.groundPositions[offset] = point.x;
    this.groundPositions[offset + 1] = point.y + 0.035;
    this.groundPositions[offset + 2] = point.z;
    this.groundExpiresAt[slot] = now + FLAMETHROWER_GROUND_FIRE_DURATION_MS;
    this.writeGroundMatrix(slot, now);
    this.groundMesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  update(deltaSeconds: number, now = performance.now()): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.1) return;
    const deltaMs = deltaSeconds * 1_000;
    let remaining = 0;
    let particleMatricesChanged = false;
    for (let slot = 0; slot < this.active.length; slot += 1) {
      if (this.active[slot] === 0) continue;
      this.agesMs[slot] += deltaMs;
      if (this.agesMs[slot] >= this.lifetimesMs[slot]) {
        this.active[slot] = 0;
        this.activeParticles -= 1;
        this.writeParticleMatrix(slot);
        particleMatricesChanged = true;
        continue;
      }
      const offset = slot * 3;
      this.velocities[offset] *= 0.988;
      this.velocities[offset + 1] += 1.1 * deltaSeconds;
      this.velocities[offset + 2] *= 0.988;
      this.positions[offset] += this.velocities[offset] * deltaSeconds;
      this.positions[offset + 1] += this.velocities[offset + 1] * deltaSeconds;
      this.positions[offset + 2] += this.velocities[offset + 2] * deltaSeconds;
      remaining += 1;
      this.writeParticleMatrix(slot);
      particleMatricesChanged = true;
    }
    this.light.visible = remaining > 0;
    if (remaining > 0) {
      this.light.position.lerp(this.emitterPosition, Math.min(1, deltaSeconds * 18));
      this.light.intensity = 11 + Math.sin(this.sequence * 2.41 + remaining) * 2.2;
    }
    if (particleMatricesChanged) this.mesh.instanceMatrix.needsUpdate = true;
    this.updateGroundMatrices(now);
  }

  clear(): void {
    this.active.fill(0);
    this.agesMs.fill(0);
    this.lifetimesMs.fill(0);
    this.groundActive.fill(0);
    this.groundSpawnedAt.fill(0);
    this.groundExpiresAt.fill(0);
    this.light.visible = false;
    this.activeParticles = 0;
    this.activeGroundFires = 0;
    this.writeMatrices();
    this.writeGroundMatrices(0);
  }

  private capturePresentationState(): FlamethrowerPresentationState {
    return {
      active: this.active.slice(), positions: this.positions.slice(), velocities: this.velocities.slice(),
      agesMs: this.agesMs.slice(), lifetimesMs: this.lifetimesMs.slice(),
      cursor: this.cursor, sequence: this.sequence, emissions: this.emissions,
      particlesSpawned: this.particlesSpawned, poolExhaustions: this.poolExhaustions,
      maximumActive: this.maximumActive, lastDistanceM: this.lastDistanceM,
      activeParticles: this.activeParticles, activeGroundFires: this.activeGroundFires,
      groundActive: this.groundActive.slice(), groundPositions: this.groundPositions.slice(),
      groundSpawnedAt: this.groundSpawnedAt.slice(), groundExpiresAt: this.groundExpiresAt.slice(),
      groundCursor: this.groundCursor, groundFireMerges: this.groundFireMerges,
      particleMatrixWrites: this.particleMatrixWrites, groundMatrixWrites: this.groundMatrixWrites,
      direction: this.direction.clone(), side: this.side.clone(), emitterPosition: this.emitterPosition.clone(),
      lightVisible: this.light.visible, lightIntensity: this.light.intensity,
      lightPosition: this.light.position.clone(),
    };
  }

  private stageFirstShotPresentation(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false);
    const start = camera.getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const now = performance.now();
    this.emit(start, start.clone().addScaledVector(direction, 8), now);
    this.igniteGround(start.clone().addScaledVector(direction, 2.4), now);
    this.light.visible = true;
    this.light.intensity = Number(this.light.userData.baseIntensity ?? 14);
  }

  private restorePresentationState(state: FlamethrowerPresentationState): void {
    this.active.set(state.active);
    this.positions.set(state.positions);
    this.velocities.set(state.velocities);
    this.agesMs.set(state.agesMs);
    this.lifetimesMs.set(state.lifetimesMs);
    this.cursor = state.cursor;
    this.sequence = state.sequence;
    this.emissions = state.emissions;
    this.particlesSpawned = state.particlesSpawned;
    this.poolExhaustions = state.poolExhaustions;
    this.maximumActive = state.maximumActive;
    this.lastDistanceM = state.lastDistanceM;
    this.activeParticles = state.activeParticles;
    this.activeGroundFires = state.activeGroundFires;
    this.groundActive.set(state.groundActive);
    this.groundPositions.set(state.groundPositions);
    this.groundSpawnedAt.set(state.groundSpawnedAt);
    this.groundExpiresAt.set(state.groundExpiresAt);
    this.groundCursor = state.groundCursor;
    this.groundFireMerges = state.groundFireMerges;
    this.direction.copy(state.direction);
    this.side.copy(state.side);
    this.emitterPosition.copy(state.emitterPosition);
    this.light.visible = state.lightVisible;
    this.light.intensity = state.lightIntensity;
    this.light.position.copy(state.lightPosition);
    this.writeMatrices();
    this.writeGroundMatrices(0);
    // Matrix restoration is presentation housekeeping, not live effect work.
    // Preserve the externally receipted counters exactly across prewarm.
    this.particleMatrixWrites = state.particleMatrixWrites;
    this.groundMatrixWrites = state.groundMatrixWrites;
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, sceneGeneration: number): Promise<void> {
    if (this.prewarmGeneration === sceneGeneration) return;
    const state = this.capturePresentationState();
    this.stageFirstShotPresentation(camera);
    try {
      await runtime.compileAndRender(this.root, camera, this.root.parent as THREE.Scene);
      this.prewarmGeneration = sceneGeneration;
    } finally {
      this.restorePresentationState(state);
    }
  }

  /** Stage one complete retained stream, ground patch and light without authority side effects. */
  async withStagedFirstShotPresentation(
    camera: THREE.Camera,
    action: () => Promise<void>,
  ): Promise<void> {
    const state = this.capturePresentationState();
    this.stageFirstShotPresentation(camera);
    try {
      await action();
    } finally {
      this.restorePresentationState(state);
    }
  }

  telemetry(): Readonly<{
    capacity: number;
    active: number;
    maximumActive: number;
    emissions: number;
    particlesSpawned: number;
    poolExhaustions: number;
    lastDistanceM: number;
    childCount: number;
    groundFireActive: number;
    groundFireMerges: number;
    particleMatrixWrites: number;
    groundMatrixWrites: number;
    prewarmGeneration: number;
    particlesPerEmission: number;
    softwareAdapter: boolean;
  }> {
    return Object.freeze({
      capacity: this.active.length,
      active: this.activeParticles,
      maximumActive: this.maximumActive,
      emissions: this.emissions,
      particlesSpawned: this.particlesSpawned,
      poolExhaustions: this.poolExhaustions,
      lastDistanceM: this.lastDistanceM,
      childCount: this.root.children.length,
      groundFireActive: this.activeGroundFires,
      groundFireMerges: this.groundFireMerges,
      particleMatrixWrites: this.particleMatrixWrites,
      groundMatrixWrites: this.groundMatrixWrites,
      prewarmGeneration: this.prewarmGeneration,
      particlesPerEmission: this.particlesPerEmission,
      softwareAdapter: this.softwareAdapter,
    });
  }

  private nextInactiveSlot(): number | null {
    for (let offset = 0; offset < this.active.length; offset += 1) {
      const slot = (this.cursor + offset) % this.active.length;
      if (this.active[slot] !== 0) continue;
      this.cursor = (slot + 1) % this.active.length;
      return slot;
    }
    return null;
  }

  private writeMatrices(): void {
    for (let slot = 0; slot < this.active.length; slot += 1) {
      this.writeParticleMatrix(slot);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeParticleMatrix(slot: number): void {
    if (this.active[slot] === 0) {
      this.dummy.position.set(0, -10_000, 0);
      this.dummy.scale.setScalar(0.0001);
    } else {
      const offset = slot * 3;
      const progress = Math.min(1, this.agesMs[slot] / Math.max(1, this.lifetimesMs[slot]));
      const scale = 0.62 + Math.sin(progress * Math.PI) * 1.7;
      this.dummy.position.set(this.positions[offset], this.positions[offset + 1], this.positions[offset + 2]);
      this.dummy.scale.set(scale * 0.75, scale, scale * 0.75);
    }
    this.dummy.rotation.set(0, this.sequence * 0.13 + slot * 0.31, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(slot, this.dummy.matrix);
    this.particleMatrixWrites += 1;
  }

  private updateGroundMatrices(now: number): void {
    let matricesChanged = false;
    for (let slot = 0; slot < this.groundActive.length; slot += 1) {
      if (this.groundActive[slot] === 0) continue;
      if (now >= this.groundExpiresAt[slot]) {
        this.groundActive[slot] = 0;
        this.activeGroundFires -= 1;
      }
      this.writeGroundMatrix(slot, now);
      matricesChanged = true;
    }
    if (matricesChanged) this.groundMesh.instanceMatrix.needsUpdate = true;
  }

  private writeGroundMatrices(now: number): void {
    for (let slot = 0; slot < this.groundActive.length; slot += 1) this.writeGroundMatrix(slot, now);
    this.groundMesh.instanceMatrix.needsUpdate = true;
  }

  private writeGroundMatrix(slot: number, now: number): void {
    if (this.groundActive[slot] === 0) {
      this.groundDummy.position.set(0, -10_000, 0);
      this.groundDummy.scale.setScalar(0.0001);
    } else {
      const offset = slot * 3;
      const ageMs = Math.max(0, now - this.groundSpawnedAt[slot]);
      const remaining = Math.max(0, this.groundExpiresAt[slot] - now);
      const fade = Math.min(1, ageMs / 180, remaining / 420);
      const pulse = 0.92 + Math.sin(now * 0.011 + slot * 1.7) * 0.08;
      this.groundDummy.position.set(
        this.groundPositions[offset],
        this.groundPositions[offset + 1],
        this.groundPositions[offset + 2],
      );
      this.groundDummy.scale.setScalar(fade * pulse);
    }
    this.groundDummy.rotation.set(-Math.PI / 2, 0, 0);
    this.groundDummy.updateMatrix();
    this.groundMesh.setMatrixAt(slot, this.groundDummy.matrix);
    this.groundMatrixWrites += 1;
  }
}
