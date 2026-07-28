import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { SMOKE_VOLUME_LIFETIME_MS } from './smoke-authority';

export const SMOKE_PRESENTATION_CARD_COUNT = 3;
export const SMOKE_PRESENTATION_LIFETIME_MS = SMOKE_VOLUME_LIFETIME_MS;
export const SMOKE_PRESENTATION_GROW_MS = 900;
export const SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY = 12;
const SMOKE_ALPHA_TEXTURE_SIZE = 64;

export type SmokePresentationEnvelope = Readonly<{
  active: boolean;
  growth: number;
  coreOpacity: number;
  edgeOpacity: number;
  lifetimeProgress: number;
}>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

type MutableSmokePresentationEnvelope = {
  active: boolean;
  growth: number;
  coreOpacity: number;
  edgeOpacity: number;
  lifetimeProgress: number;
};

function writeSmokePresentationEnvelope(
  target: MutableSmokePresentationEnvelope,
  nowMs: number,
  startsAtMs: number,
  expiresAtMs: number,
): MutableSmokePresentationEnvelope {
  const lifetimeMs = Math.max(1, expiresAtMs - startsAtMs);
  const ageMs = nowMs - startsAtMs;
  const remainingMs = expiresAtMs - nowMs;
  if (ageMs < 0 || remainingMs <= 0) {
    target.active = false;
    target.growth = 0;
    target.coreOpacity = 0;
    target.edgeOpacity = 0;
    target.lifetimeProgress = clamp01(ageMs / lifetimeMs);
    return target;
  }
  const growth = Math.max(0.12, clamp01(ageMs / SMOKE_PRESENTATION_GROW_MS));
  const release = clamp01(ageMs / 280);
  const decay = clamp01(remainingMs / 2_000);
  const density = release * decay;
  target.active = true;
  target.growth = growth;
  // Authority decides whether smoke blocks sight. Presentation density stays
  // below a solid shell so entering one volume cannot become a flat whiteout;
  // overlapping volumes still converge to deliberately dense obscuration.
  target.coreOpacity = 0.42 * density;
  target.edgeOpacity = 0.22 * density;
  target.lifetimeProgress = clamp01(ageMs / lifetimeMs);
  return target;
}

export function smokePresentationEnvelopeAt(
  nowMs: number,
  startsAtMs: number,
  expiresAtMs: number,
): SmokePresentationEnvelope {
  return Object.freeze({ ...writeSmokePresentationEnvelope(
    { active: false, growth: 0, coreOpacity: 0, edgeOpacity: 0, lifetimeProgress: 0 },
    nowMs,
    startsAtMs,
    expiresAtMs,
  ) });
}

function smokeNoise(x: number, y: number, seed: number): number {
  const first = Math.sin(x * 0.173 + y * 0.117 + seed * 1.91);
  const second = Math.sin(x * 0.071 - y * 0.193 + seed * 3.17);
  const third = Math.sin((x + y) * 0.049 + seed * 5.23);
  return clamp01(0.5 + first * 0.22 + second * 0.18 + third * 0.1);
}

function radialAlphaTexture(
  name: string,
  size = SMOKE_ALPHA_TEXTURE_SIZE,
  seed = 1,
  feather = 0.52,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const radial = clamp01((1 - radius) / feather);
      const billow = 0.56 + smokeNoise(x, y, seed) * 0.44;
      const alpha = Math.round(radial * radial * billow * 255);
      // Three samples the green channel of RGB/RGBA alpha maps and ignores the
      // alpha channel. Keep the mask grayscale so WebGL and WebGPU agree.
      data[offset] = alpha;
      data[offset + 1] = alpha;
      data[offset + 2] = alpha;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = name;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Two draw calls per volume: two bounded batches of deterministic soft density cards. */
export class SmokeVolumePresentation {
  readonly root = new THREE.Group();
  private readonly innerGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly edgeGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly innerAlphaTexture = radialAlphaTexture('smoke-grenade-inner-noise-alpha', SMOKE_ALPHA_TEXTURE_SIZE, 11, 0.58);
  private readonly edgeAlphaTexture = radialAlphaTexture('smoke-grenade-soft-radial-alpha', SMOKE_ALPHA_TEXTURE_SIZE, 29, 0.42);
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly edgeMaterial: THREE.MeshBasicMaterial;
  private readonly innerCards: THREE.InstancedMesh;
  private readonly cards: THREE.InstancedMesh;
  private disposed = false;
  private active = false;
  private startsAtMs = 0;
  private expiresAtMs = 0;
  private radiusM = 0;
  private disturbedAtMs = Number.NEGATIVE_INFINITY;
  private disturbance = 0;
  private qualityScale = 1;
  private crowdingCardLimit = SMOKE_PRESENTATION_CARD_COUNT;
  private crowdingEdgeVisible = true;
  private crowdedCluster = false;
  private readonly disturbanceDirection = new THREE.Vector3();
  private readonly envelope: MutableSmokePresentationEnvelope = {
    active: false, growth: 0, coreOpacity: 0, edgeOpacity: 0, lifetimeProgress: 0,
  };
  private readonly cardMatrix = new THREE.Matrix4();
  private readonly cardQuaternion = new THREE.Quaternion();
  private readonly cardScale = new THREE.Vector3(1, 0.82, 1);
  private readonly innerCardScale = new THREE.Vector3(0.82, 0.68, 1);
  private readonly cardPosition = new THREE.Vector3();

  constructor() {
    this.root.name = 'smoke-grenade-volume-presentation';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.coreMaterial = new THREE.MeshBasicMaterial({
      name: 'smoke-grenade-inner-density', color: 0x707a76, alphaMap: this.innerAlphaTexture,
      transparent: true, opacity: 0, depthWrite: false, alphaTest: 0.012,
      side: THREE.DoubleSide, toneMapped: false,
    });
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      name: 'smoke-grenade-soft-edge', color: 0xaeb9b4, alphaMap: this.edgeAlphaTexture,
      transparent: true, opacity: 0, depthWrite: false, alphaTest: 0.015,
      side: THREE.DoubleSide, toneMapped: false,
    });
    // Transparent DoubleSide materials otherwise render back and front passes,
    // doubling density and draw calls for every card batch.
    this.coreMaterial.forceSinglePass = true;
    this.edgeMaterial.forceSinglePass = true;
    this.innerCards = new THREE.InstancedMesh(this.innerGeometry, this.coreMaterial, SMOKE_PRESENTATION_CARD_COUNT);
    this.innerCards.name = 'smoke-grenade-inner-density-cards';
    this.innerCards.renderOrder = 18;
    this.cards = new THREE.InstancedMesh(this.edgeGeometry, this.edgeMaterial, SMOKE_PRESENTATION_CARD_COUNT);
    this.cards.name = 'smoke-grenade-soft-edge-cards';
    this.cards.renderOrder = 19;
    for (let index = 0; index < SMOKE_PRESENTATION_CARD_COUNT; index += 1) {
      const yaw = index * Math.PI / SMOKE_PRESENTATION_CARD_COUNT;
      this.cardPosition.set((index - 1) * 0.045, index === 1 ? 0.055 : -0.025, 0);
      this.cardQuaternion.setFromEuler(new THREE.Euler(0, yaw + 0.24, index === 2 ? -0.14 : 0.08));
      this.cardMatrix.compose(this.cardPosition, this.cardQuaternion, this.innerCardScale);
      this.innerCards.setMatrixAt(index, this.cardMatrix);
      this.cardPosition.set((1 - index) * 0.035, index === 0 ? 0.04 : -0.015, 0);
      this.cardQuaternion.setFromEuler(new THREE.Euler(0, yaw, index === 2 ? 0.18 : -0.05));
      this.cardMatrix.compose(this.cardPosition, this.cardQuaternion, this.cardScale);
      this.cards.setMatrixAt(index, this.cardMatrix);
    }
    this.innerCards.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.innerCards.instanceMatrix.needsUpdate = true;
    this.cards.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.cards.instanceMatrix.needsUpdate = true;
    this.root.add(this.innerCards, this.cards);
    this.root.visible = false;
  }

  activate(
    position: Readonly<{ x: number; y: number; z: number }>,
    startsAtMs: number,
    expiresAtMs: number,
    radiusM: number,
  ): void {
    if (this.disposed) return;
    this.active = true;
    this.startsAtMs = startsAtMs;
    this.expiresAtMs = expiresAtMs;
    this.radiusM = Math.max(0, radiusM);
    this.disturbedAtMs = Number.NEGATIVE_INFINITY;
    this.disturbance = 0;
    this.innerCards.position.set(0, 0, 0);
    this.innerCards.rotation.z = 0;
    this.cards.position.set(0, 0, 0);
    this.cards.rotation.z = 0;
    this.root.position.set(position.x, position.y, position.z);
    this.update(startsAtMs);
  }

  update(nowMs: number): boolean {
    if (!this.active || this.disposed) return false;
    const envelope = writeSmokePresentationEnvelope(this.envelope, nowMs, this.startsAtMs, this.expiresAtMs);
    this.root.visible = envelope.active;
    if (!this.root.visible) return false;
    this.innerCards.visible = true;
    this.cards.visible = this.crowdingEdgeVisible;
    this.root.scale.setScalar(this.radiusM * envelope.growth);
    this.root.rotation.y = envelope.lifetimeProgress * Math.PI * 0.42;
    this.root.rotation.z = Math.sin(envelope.lifetimeProgress * Math.PI * 2) * 0.035;
    const disturbanceAge = Math.max(0, nowMs - this.disturbedAtMs);
    const disturbancePulse = disturbanceAge < 900 ? this.disturbance * (1 - disturbanceAge / 900) : 0;
    this.innerCards.position.copy(this.disturbanceDirection).multiplyScalar(disturbancePulse * 0.42);
    this.cards.position.copy(this.disturbanceDirection).multiplyScalar(-disturbancePulse * 0.26);
    this.innerCards.rotation.z = disturbancePulse * 0.18;
    this.cards.rotation.z = -disturbancePulse * 0.14;
    const densityScale = 0.72 + this.qualityScale * 0.28;
    // Compensate for the crowded-cluster two-card fill budget with density,
    // which is cheap and keeps overlapping smoke at least as obscuring as one
    // isolated three-card volume without restoring the discarded overdraw.
    const crowdedDensityScale = this.crowdedCluster ? 1.65 : 1;
    this.coreMaterial.opacity = envelope.coreOpacity * densityScale * crowdedDensityScale * (1 - disturbancePulse * 0.78);
    this.edgeMaterial.opacity = envelope.edgeOpacity * densityScale * crowdedDensityScale * (1 - disturbancePulse * 0.48);
    return true;
  }

  setQualityScale(scale: number): void {
    this.qualityScale = THREE.MathUtils.clamp(Number.isFinite(scale) ? scale : 1, 0.35, 1);
    this.applyCardBudget();
  }

  setCrowdingBudget(cardLimit: number, edgeVisible: boolean, crowdedCluster = false): void {
    this.crowdingCardLimit = THREE.MathUtils.clamp(
      Math.floor(Number.isFinite(cardLimit) ? cardLimit : SMOKE_PRESENTATION_CARD_COUNT),
      1,
      SMOKE_PRESENTATION_CARD_COUNT,
    );
    this.crowdingEdgeVisible = edgeVisible;
    this.crowdedCluster = crowdedCluster;
    this.cards.visible = this.root.visible && edgeVisible;
    this.applyCardBudget();
  }

  overlaps(other: SmokeVolumePresentation): boolean {
    if (!this.active || !other.active || this.disposed || other.disposed) return false;
    const overlapDistance = Math.min(this.radiusM, other.radiusM) * 0.75;
    return this.root.position.distanceToSquared(other.root.position) <= overlapDistance * overlapDistance;
  }

  private applyCardBudget(): void {
    // The normal adaptive high-quality scale settles around 0.8. Two crossed
    // cards can expose a camera-aligned seam at that scale, while the third
    // card adds no draw call and only four transparent triangles per volume.
    // Keep the one-card fallback for genuinely constrained profiles. Three or
    // more tightly overlapping volumes already mask one another's camera seam,
    // so cap those redundant inner/edge bases at two cards as well as sharing
    // the edge batch. This bounds near-camera transparent fill without taking
    // the third card away from the isolated smoke silhouette that needs it.
    const qualityCards = this.qualityScale >= 0.7 ? 3 : 1;
    const cardCount = Math.min(qualityCards, this.crowdingCardLimit);
    this.innerCards.count = cardCount;
    this.cards.count = cardCount;
  }

  disturb(direction: Readonly<{ x: number; y: number; z: number }>, strength: number, nowMs: number): void {
    if (!this.active || this.disposed) return;
    this.disturbanceDirection.set(direction.x, direction.y, direction.z);
    if (this.disturbanceDirection.lengthSq() > 1e-8) this.disturbanceDirection.normalize();
    this.disturbance = clamp01(strength);
    this.disturbedAtMs = nowMs;
  }

  deactivate(): void {
    this.active = false;
    this.root.visible = false;
    this.coreMaterial.opacity = 0;
    this.edgeMaterial.opacity = 0;
    this.innerCards.position.set(0, 0, 0);
    this.innerCards.rotation.z = 0;
    this.cards.position.set(0, 0, 0);
    this.cards.rotation.z = 0;
  }

  isActive(): boolean {
    return this.active && this.root.visible && !this.disposed;
  }

  telemetry(): Readonly<{ active: boolean; drawCalls: number; cards: number; qualityScale: number; crowded: boolean; coreOpacity: number; edgeOpacity: number; triangles: number }> {
    return Object.freeze({
      active: this.isActive(),
      drawCalls: this.isActive() ? 1 + Number(this.cards.visible) : 0,
      cards: this.cards.count,
      qualityScale: this.qualityScale,
      crowded: this.crowdedCluster,
      coreOpacity: this.coreMaterial.opacity,
      edgeOpacity: this.edgeMaterial.opacity,
      triangles: (this.innerCards.count + this.cards.count) * 2,
    });
  }

  /** Terminal renderer teardown only; never call from live expiry/match clear. */
  terminalDispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.innerGeometry.dispose();
    this.edgeGeometry.dispose();
    this.coreMaterial.dispose();
    this.edgeMaterial.dispose();
    this.innerAlphaTexture.dispose();
    this.edgeAlphaTexture.dispose();
    this.root.visible = false;
  }
}

export type SmokeVolumePresentationLease = Readonly<{ slot: number; generation: number }>;

/**
 * Fixed prewarmed pool. Live expiry/clear only deactivates slots, avoiding the
 * destroyed submitted-buffer failure mode observed in Pass 64 WebGPU.
 */
export class SmokeVolumePresentationPool {
  readonly root = new THREE.Group();
  private readonly slots: Array<{ presentation: SmokeVolumePresentation; generation: number }> = [];
  private cursor = 0;
  private emissions = 0;
  private recycled = 0;
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;
  private disposed = false;
  private disposalFinalized = false;

  constructor(private readonly scene: THREE.Scene, capacity = SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY) {
    this.root.name = 'smoke-grenade-volume-presentation-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    const boundedCapacity = Math.max(1, Math.min(SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY, Math.floor(capacity)));
    for (let index = 0; index < boundedCapacity; index += 1) {
      const presentation = new SmokeVolumePresentation();
      presentation.root.name = `smoke-grenade-volume-presentation-${index + 1}`;
      this.root.add(presentation.root);
      this.slots.push({ presentation, generation: 0 });
    }
  }

  /**
   * Compiles and uploads every fixed smoke slot before combat. Each slot owns
   * its own radial alpha texture, materials and geometry, so staging only one
   * representative would leave later pool emissions with first-use GPU work.
   */
  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, sceneGeneration = 0): Promise<void> {
    if (this.disposed) throw new Error('Cannot prewarm a disposed smoke presentation pool');
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    if (this.gpuPrewarmPromise) return this.gpuPrewarmPromise;
    const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
    this.gpuPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
    }
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
  ): Promise<void> {
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene) || parentScene !== this.scene) {
      throw new Error('Smoke presentation pool must be attached to its scene before prewarm');
    }
    const objectStates = new Map<THREE.Object3D, Readonly<{
      visible: boolean;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      frustumCulled: boolean;
    }>>();
    const rootVisible = this.root.visible;
    const rootFrustumCulled = this.root.frustumCulled;
    this.root.visible = true;
    this.root.frustumCulled = false;
    for (const { presentation } of this.slots) {
      presentation.root.traverse((node) => {
        objectStates.set(node, Object.freeze({
          visible: node.visible,
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          scale: node.scale.clone(),
          frustumCulled: node.frustumCulled,
        }));
        node.visible = true;
        node.frustumCulled = false;
      });
    }
    camera.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const columns = 4;
    for (let index = 0; index < this.slots.length; index += 1) {
      const presentation = this.slots[index]!.presentation;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const target = cameraPosition.clone()
        .addScaledVector(forward, 24)
        .addScaledVector(right, (column - 1.5) * 3)
        .addScaledVector(up, (row - 1) * 3);
      const localTarget = this.root.worldToLocal(target);
      // Exercise the live 4.2 m envelope, including non-zero alpha and the
      // current instanced-card count. An inactive transparent slot can compile
      // successfully while leaving its first useful fragment work deferred.
      presentation.activate(localTarget, 0, SMOKE_PRESENTATION_LIFETIME_MS, 4.2);
      presentation.update(SMOKE_PRESENTATION_GROW_MS);
      presentation.root.traverse((node) => { node.frustumCulled = false; });
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      if (!this.disposed) this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      for (const { presentation } of this.slots) presentation.deactivate();
      for (const [node, state] of objectStates) {
        node.visible = state.visible;
        node.position.copy(state.position);
        node.quaternion.copy(state.quaternion);
        node.scale.copy(state.scale);
        node.frustumCulled = state.frustumCulled;
      }
      this.root.visible = rootVisible;
      this.root.frustumCulled = rootFrustumCulled;
    }
  }

  emit(
    position: Readonly<{ x: number; y: number; z: number }>,
    startsAtMs: number,
    expiresAtMs: number,
    radiusM: number,
  ): SmokeVolumePresentationLease {
    let slotIndex = this.slots.findIndex(({ presentation }) => !presentation.isActive());
    if (slotIndex < 0) {
      slotIndex = this.cursor++ % this.slots.length;
      this.recycled += 1;
    }
    const slot = this.slots[slotIndex]!;
    slot.generation += 1;
    slot.presentation.activate(position, startsAtMs, expiresAtMs, radiusM);
    this.rebalanceOverlappingVolumes();
    this.emissions += 1;
    return Object.freeze({ slot: slotIndex, generation: slot.generation });
  }

  update(lease: SmokeVolumePresentationLease, nowMs: number): boolean {
    const slot = this.slots[lease.slot];
    return Boolean(slot && slot.generation === lease.generation && slot.presentation.update(nowMs));
  }

  release(lease: SmokeVolumePresentationLease): void {
    const slot = this.slots[lease.slot];
    if (slot?.generation === lease.generation) {
      slot.presentation.deactivate();
      this.rebalanceOverlappingVolumes();
    }
  }

  disturb(
    lease: SmokeVolumePresentationLease,
    direction: Readonly<{ x: number; y: number; z: number }>,
    strength: number,
    nowMs: number,
  ): void {
    const slot = this.slots[lease.slot];
    if (slot?.generation === lease.generation) slot.presentation.disturb(direction, strength, nowMs);
  }

  clear(): void {
    for (const slot of this.slots) slot.presentation.deactivate();
    this.rebalanceOverlappingVolumes();
  }

  setQualityScale(scale: number): void {
    for (const slot of this.slots) slot.presentation.setQualityScale(scale);
  }

  private rebalanceOverlappingVolumes(): void {
    const active = this.slots
      .map(({ presentation }, slot) => ({ presentation, slot }))
      .filter(({ presentation }) => presentation.isActive());
    const remaining = new Set(active.map(({ slot }) => slot));
    for (const entry of active) {
      if (!remaining.has(entry.slot)) continue;
      const component = [entry];
      remaining.delete(entry.slot);
      for (let cursor = 0; cursor < component.length; cursor += 1) {
        const member = component[cursor]!;
        for (const candidate of active) {
          if (!remaining.has(candidate.slot) || !member.presentation.overlaps(candidate.presentation)) continue;
          remaining.delete(candidate.slot);
          component.push(candidate);
        }
      }
      component.sort((left, right) => left.slot - right.slot);
      const crowded = component.length >= 3;
      for (const [index, member] of component.entries()) {
        member.presentation.setCrowdingBudget(
          crowded ? 2 : SMOKE_PRESENTATION_CARD_COUNT,
          !crowded || index === 0,
          crowded,
        );
      }
    }
    for (const { presentation } of this.slots) {
      if (!presentation.isActive()) presentation.setCrowdingBudget(SMOKE_PRESENTATION_CARD_COUNT, true, false);
    }
  }

  telemetry(): Readonly<{ capacity: number; active: number; emissions: number; recycled: number; liveDisposals: 0; cardsPerVolume: number; qualityScale: number; crowdedVolumes: number; visibleDrawCalls: number }> {
    const presentations = this.slots.map(({ presentation }) => presentation.telemetry());
    const activePresentations = presentations.filter((presentation) => presentation.active);
    const sample = activePresentations[0] ?? presentations[0];
    return Object.freeze({
      capacity: this.slots.length,
      active: this.slots.reduce((count, { presentation }) => count + Number(presentation.isActive()), 0),
      emissions: this.emissions,
      recycled: this.recycled,
      liveDisposals: 0,
      cardsPerVolume: sample?.cards ?? 0,
      qualityScale: sample?.qualityScale ?? 0,
      crowdedVolumes: activePresentations.filter((presentation) => presentation.crowded).length,
      visibleDrawCalls: activePresentations.reduce((sum, presentation) => sum + presentation.drawCalls, 0),
    });
  }

  /** Must be routed through the renderer's fenced terminal-retirement path. */
  terminalDispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pendingPrewarm = this.gpuPrewarmPromise;
    if (pendingPrewarm) {
      void pendingPrewarm.catch(() => undefined).finally(() => this.finalizeTerminalDispose());
      return;
    }
    this.finalizeTerminalDispose();
  }

  private finalizeTerminalDispose(): void {
    if (this.disposalFinalized) return;
    this.disposalFinalized = true;
    for (const slot of this.slots) slot.presentation.terminalDispose();
    this.slots.length = 0;
    this.root.removeFromParent();
  }
}
