import * as THREE from 'three';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

const PARTICLES_PER_EMISSION = 8;
const MIN_STREAM_DISTANCE_M = 0.35;
export const FLAMETHROWER_GROUND_FIRE_DURATION_MS = 5_000;
const GROUND_FIRE_POOL_CAPACITY = 24;

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
  private cursor = 0;
  private groundCursor = 0;
  private sequence = 0;
  private emissions = 0;
  private particlesSpawned = 0;
  private poolExhaustions = 0;
  private maximumActive = 0;
  private lastDistanceM = 0;
  private prewarmGeneration = -1;

  constructor(scene: THREE.Scene, flattenMaterials: boolean) {
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
      new THREE.IcosahedronGeometry(0.13, 1),
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
    if (!Number.isFinite(now) || !start.toArray().every(Number.isFinite) || !end.toArray().every(Number.isFinite)) return false;
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
    for (let index = 0; index < PARTICLES_PER_EMISSION; index += 1) {
      if (this.activeCount() >= FLAMETHROWER_EFFECT.maximumActiveParticles) {
        this.poolExhaustions += 1;
        break;
      }
      const slot = this.nextInactiveSlot();
      if (slot === null) {
        this.poolExhaustions += 1;
        break;
      }
      const phase = (index + 1) / (PARTICLES_PER_EMISSION + 1);
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
      this.mesh.setColorAt(
        slot,
        this.colour.setHSL(0.045 + phase * 0.045, 1, 0.56 + (1 - phase) * 0.18),
      );
      emitted += 1;
    }
    this.particlesSpawned += emitted;
    this.maximumActive = Math.max(this.maximumActive, this.activeCount());
    this.light.position.copy(start);
    this.light.visible = emitted > 0;
    this.mesh.instanceColor!.needsUpdate = true;
    this.writeMatrices();
    return emitted > 0;
  }

  /** Retained bounded scorch-flame pool used by the authoritative ground-fire lane. */
  igniteGround(point: THREE.Vector3, now: number): boolean {
    if (!Number.isFinite(now) || !point.toArray().every(Number.isFinite)) return false;
    let slot = -1;
    for (let index = 0; index < this.groundActive.length; index += 1) {
      if (this.groundActive[index] === 0) continue;
      const offset = index * 3;
      const dx = this.groundPositions[offset] - point.x;
      const dz = this.groundPositions[offset + 2] - point.z;
      if (dx * dx + dz * dz <= 0.8 * 0.8) {
        slot = index;
        break;
      }
    }
    if (slot < 0) {
      slot = this.groundActive.findIndex((active) => active === 0);
      if (slot < 0) slot = this.groundCursor;
      this.groundCursor = (slot + 1) % this.groundActive.length;
      this.groundSpawnedAt[slot] = now;
    }
    const offset = slot * 3;
    this.groundActive[slot] = 1;
    this.groundPositions[offset] = point.x;
    this.groundPositions[offset + 1] = point.y + 0.035;
    this.groundPositions[offset + 2] = point.z;
    this.groundExpiresAt[slot] = now + FLAMETHROWER_GROUND_FIRE_DURATION_MS;
    this.writeGroundMatrices(now);
    return true;
  }

  update(deltaSeconds: number, now = performance.now()): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.1) return;
    const deltaMs = deltaSeconds * 1_000;
    let remaining = 0;
    for (let slot = 0; slot < this.active.length; slot += 1) {
      if (this.active[slot] === 0) continue;
      this.agesMs[slot] += deltaMs;
      if (this.agesMs[slot] >= this.lifetimesMs[slot]) {
        this.active[slot] = 0;
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
    }
    this.light.visible = remaining > 0;
    if (remaining > 0) {
      this.light.position.lerp(this.emitterPosition, Math.min(1, deltaSeconds * 18));
      this.light.intensity = 11 + Math.sin(this.sequence * 2.41 + remaining) * 2.2;
    }
    this.writeMatrices();
    this.writeGroundMatrices(now);
  }

  clear(): void {
    this.active.fill(0);
    this.agesMs.fill(0);
    this.lifetimesMs.fill(0);
    this.groundActive.fill(0);
    this.groundSpawnedAt.fill(0);
    this.groundExpiresAt.fill(0);
    this.light.visible = false;
    this.writeMatrices();
    this.writeGroundMatrices(0);
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, sceneGeneration: number): Promise<void> {
    if (this.prewarmGeneration === sceneGeneration) return;
    camera.updateWorldMatrix(true, false);
    const state = {
      active: this.active.slice(), positions: this.positions.slice(), velocities: this.velocities.slice(),
      agesMs: this.agesMs.slice(), lifetimesMs: this.lifetimesMs.slice(),
      cursor: this.cursor, sequence: this.sequence, emissions: this.emissions,
      particlesSpawned: this.particlesSpawned, poolExhaustions: this.poolExhaustions,
      maximumActive: this.maximumActive, lastDistanceM: this.lastDistanceM,
      lightVisible: this.light.visible, lightIntensity: this.light.intensity,
      lightPosition: this.light.position.clone(),
    };
    const start = camera.getWorldPosition(new THREE.Vector3());
    const end = start.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 8);
    this.emit(start, end, performance.now());
    this.light.visible = true;
    this.light.intensity = Number(this.light.userData.baseIntensity ?? 14);
    try {
      await runtime.compileAndRender(this.root, camera, this.root.parent as THREE.Scene);
      this.prewarmGeneration = sceneGeneration;
    } finally {
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
      this.light.visible = state.lightVisible;
      this.light.intensity = state.lightIntensity;
      this.light.position.copy(state.lightPosition);
      this.writeMatrices();
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
    prewarmGeneration: number;
  }> {
    return Object.freeze({
      capacity: this.active.length,
      active: this.activeCount(),
      maximumActive: this.maximumActive,
      emissions: this.emissions,
      particlesSpawned: this.particlesSpawned,
      poolExhaustions: this.poolExhaustions,
      lastDistanceM: this.lastDistanceM,
      childCount: this.root.children.length,
      groundFireActive: this.groundActive.reduce((count, active) => count + active, 0),
      prewarmGeneration: this.prewarmGeneration,
    });
  }

  private activeCount(): number {
    let count = 0;
    for (const active of this.active) count += active;
    return count;
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
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeGroundMatrices(now: number): void {
    for (let slot = 0; slot < this.groundActive.length; slot += 1) {
      if (this.groundActive[slot] !== 0 && now >= this.groundExpiresAt[slot]) this.groundActive[slot] = 0;
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
    }
    this.groundMesh.instanceMatrix.needsUpdate = true;
  }
}
