import * as THREE from 'three';

export const SMOKE_PRESENTATION_CARD_COUNT = 3;
export const SMOKE_PRESENTATION_LIFETIME_MS = 12_000;
export const SMOKE_PRESENTATION_GROW_MS = 900;
export const SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY = 12;

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
  target.coreOpacity = 0.78 * density;
  target.edgeOpacity = 0.3 * density;
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

function radialAlphaTexture(size = 32): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const alpha = clamp01((1 - radius) / 0.34);
      data[offset] = 198;
      data[offset + 1] = 207;
      data[offset + 2] = 202;
      data[offset + 3] = Math.round(alpha * alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'smoke-grenade-soft-radial-alpha';
  texture.needsUpdate = true;
  return texture;
}

/** Two draw calls per volume: a dense low-poly core and three instanced soft cards. */
export class SmokeVolumePresentation {
  readonly root = new THREE.Group();
  private readonly coreGeometry = new THREE.IcosahedronGeometry(1, 2);
  private readonly cardGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly alphaTexture = radialAlphaTexture();
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly edgeMaterial: THREE.MeshBasicMaterial;
  private readonly core: THREE.Mesh;
  private readonly cards: THREE.InstancedMesh;
  private disposed = false;
  private active = false;
  private startsAtMs = 0;
  private expiresAtMs = 0;
  private radiusM = 0;
  private disturbedAtMs = Number.NEGATIVE_INFINITY;
  private disturbance = 0;
  private readonly disturbanceDirection = new THREE.Vector3();
  private readonly envelope: MutableSmokePresentationEnvelope = {
    active: false, growth: 0, coreOpacity: 0, edgeOpacity: 0, lifetimeProgress: 0,
  };
  private readonly cardMatrix = new THREE.Matrix4();
  private readonly cardQuaternion = new THREE.Quaternion();
  private readonly cardScale = new THREE.Vector3(1, 0.78, 1);
  private readonly cardPosition = new THREE.Vector3();

  constructor() {
    this.root.name = 'smoke-grenade-volume-presentation';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.coreMaterial = new THREE.MeshBasicMaterial({
      name: 'smoke-grenade-opaque-core', color: 0x7f8985, transparent: true,
      opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      name: 'smoke-grenade-soft-edge', color: 0xc6cfca, alphaMap: this.alphaTexture,
      transparent: true, opacity: 0, depthWrite: false, alphaTest: 0.015,
      side: THREE.DoubleSide,
    });
    this.core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    this.core.name = 'smoke-grenade-dense-core';
    this.core.scale.set(0.72, 0.6, 0.72);
    this.core.renderOrder = 18;
    this.cards = new THREE.InstancedMesh(this.cardGeometry, this.edgeMaterial, SMOKE_PRESENTATION_CARD_COUNT);
    this.cards.name = 'smoke-grenade-soft-edge-cards';
    this.cards.renderOrder = 19;
    for (let index = 0; index < SMOKE_PRESENTATION_CARD_COUNT; index += 1) {
      this.cardQuaternion.setFromEuler(new THREE.Euler(0, index * Math.PI / SMOKE_PRESENTATION_CARD_COUNT, index === 2 ? 0.18 : 0));
      this.cardMatrix.compose(this.cardPosition, this.cardQuaternion, this.cardScale);
      this.cards.setMatrixAt(index, this.cardMatrix);
    }
    this.cards.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.cards.instanceMatrix.needsUpdate = true;
    this.root.add(this.core, this.cards);
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
    this.core.position.set(0, 0, 0);
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
    this.root.scale.setScalar(this.radiusM * envelope.growth);
    this.root.rotation.y = envelope.lifetimeProgress * Math.PI * 0.42;
    this.root.rotation.z = Math.sin(envelope.lifetimeProgress * Math.PI * 2) * 0.035;
    const disturbanceAge = Math.max(0, nowMs - this.disturbedAtMs);
    const disturbancePulse = disturbanceAge < 900 ? this.disturbance * (1 - disturbanceAge / 900) : 0;
    this.core.position.copy(this.disturbanceDirection).multiplyScalar(disturbancePulse * 0.28);
    this.cards.position.copy(this.disturbanceDirection).multiplyScalar(-disturbancePulse * 0.18);
    this.cards.rotation.z = disturbancePulse * 0.14;
    this.coreMaterial.opacity = envelope.coreOpacity * (1 - disturbancePulse * 0.34);
    this.edgeMaterial.opacity = envelope.edgeOpacity * (1 - disturbancePulse * 0.16);
    return true;
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
    this.core.position.set(0, 0, 0);
    this.cards.position.set(0, 0, 0);
    this.cards.rotation.z = 0;
  }

  isActive(): boolean {
    return this.active && this.root.visible && !this.disposed;
  }

  telemetry(): Readonly<{ active: boolean; drawCalls: 2; cards: number; coreOpacity: number; edgeOpacity: number; triangles: number }> {
    return Object.freeze({
      active: this.isActive(),
      drawCalls: 2,
      cards: this.cards.count,
      coreOpacity: this.coreMaterial.opacity,
      edgeOpacity: this.edgeMaterial.opacity,
      triangles: (this.coreGeometry.index ? this.coreGeometry.index.count / 3 : this.coreGeometry.getAttribute('position').count / 3)
        + this.cards.count * 2,
    });
  }

  /** Terminal renderer teardown only; never call from live expiry/match clear. */
  terminalDispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.coreGeometry.dispose();
    this.cardGeometry.dispose();
    this.coreMaterial.dispose();
    this.edgeMaterial.dispose();
    this.alphaTexture.dispose();
    this.root.visible = false;
  }
}

export type SmokeVolumePresentationLease = Readonly<{ slot: number; generation: number }>;

/**
 * Fixed prewarmed pool. Live expiry/clear only deactivates slots, avoiding the
 * destroyed submitted-buffer failure mode observed in Pass 64 WebGPU.
 */
export class SmokeVolumePresentationPool {
  private readonly slots: Array<{ presentation: SmokeVolumePresentation; generation: number }> = [];
  private cursor = 0;
  private emissions = 0;
  private recycled = 0;

  constructor(private readonly scene: THREE.Scene, capacity = SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY) {
    const boundedCapacity = Math.max(1, Math.min(SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY, Math.floor(capacity)));
    for (let index = 0; index < boundedCapacity; index += 1) {
      const presentation = new SmokeVolumePresentation();
      presentation.root.name = `smoke-grenade-volume-presentation-${index + 1}`;
      scene.add(presentation.root);
      this.slots.push({ presentation, generation: 0 });
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
    this.emissions += 1;
    return Object.freeze({ slot: slotIndex, generation: slot.generation });
  }

  update(lease: SmokeVolumePresentationLease, nowMs: number): boolean {
    const slot = this.slots[lease.slot];
    return Boolean(slot && slot.generation === lease.generation && slot.presentation.update(nowMs));
  }

  release(lease: SmokeVolumePresentationLease): void {
    const slot = this.slots[lease.slot];
    if (slot?.generation === lease.generation) slot.presentation.deactivate();
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
  }

  telemetry(): Readonly<{ capacity: number; active: number; emissions: number; recycled: number; liveDisposals: 0 }> {
    return Object.freeze({
      capacity: this.slots.length,
      active: this.slots.reduce((count, { presentation }) => count + Number(presentation.isActive()), 0),
      emissions: this.emissions,
      recycled: this.recycled,
      liveDisposals: 0,
    });
  }

  /** Must be routed through the renderer's fenced terminal-retirement path. */
  terminalDispose(): void {
    for (const slot of this.slots) slot.presentation.terminalDispose();
    this.slots.length = 0;
    this.scene.remove(...this.scene.children.filter((child) => child.name.startsWith('smoke-grenade-volume-presentation-')));
  }
}
