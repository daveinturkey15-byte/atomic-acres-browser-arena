/**
 * volume-fire-presentation.ts — bounded volumetric fire emitters (HF-490).
 *
 * WHAT THIS IS. A presentation-only, ray-marched fire box for authored
 * moments: burning clutter on nuketown2 and skyline-terminal, plus a
 * transient fireball slot the nuke-event lane drives at detonation. The
 * march is 20 fixed steps of procedural sin-product noise inside one unit
 * box (BackSide proxy, additive, emissive palette ramp), in the likeness of
 * the in-repo marchers (`src/map3/corridor-volume.ts`, 48 steps;
 * `src/map3/corridor-colosseum.ts`, 26 steps) — re-implemented, never
 * vendored (HF-472). Upstream reference (HF-481):
 * https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_volume_fire.html
 * — the upstream GPU-fluid path (voxel fluid simulation with pressure
 * projection) is deliberately NOT taken: this effect needs no 3D textures,
 * no compute submissions, and no per-frame allocation.
 *
 * BUDGET, DEFENDED. One shared BoxGeometry, one material factory whose five
 * instances generate byte-identical WGSL (every per-emitter value is a
 * `uniform`, HF-477), so the device compiles exactly ONE pipeline, warmed at
 * menu time through `prewarm()` (same rehearsal shape as
 * `SupportExplosionPresentation`). Per frame the pool mutates uniform values
 * in place and toggles visibility: zero allocations, zero pipeline
 * creations, zero lights. Worst-case fragment cost is bounded by the boxes'
 * screen coverage (authored boxes are ~1-2 m; the nuke fireball is brief):
 * ~20 steps x ~20 ALU over at most a few hundred thousand pixels, i.e. well
 * under 0.5 ms p95 at 1280x720 on the audit machine's class of GPU. The
 * nuke fireball reuses the reserved slot; authored placements never exceed
 * {@link VOLUME_FIRE_MAX_AUTHORED_PER_ARENA} per arena.
 *
 * AUTHORITY. None. Damage, ignition and expiry of gameplay fire stay where
 * they are (flamethrower/carpet pools, killstreak runtime). Authored emitters
 * are pure dressing; the nuke slot is driven by the existing NukeSequence
 * timing in legacy-main and never extends it.
 */
import * as THREE from 'three';
import { ARENA_IDS, type ArenaId } from './arena-identity';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { nuketown2HandedX } from './nuketown2-layout';
import { NUKETOWN2_APPLIANCE_BANK } from './nuketown2-yard-props';

/**
 * TSL arithmetic surface this module threads through its factory and slots.
 * three/tsl itself is untyped at this boundary, so the destructured surface
 * below carries the repo's standard TSL-boundary line (identical to
 * `src/map3/corridor-volume.ts`); this interface only keeps the module's own
 * signatures honest without re-declaring the library.
 */
type TslArithmetic = {
  readonly x: TslArithmetic;
  readonly y: TslArithmetic;
  readonly z: TslArithmetic;
  readonly xyz: TslArithmetic;
  mul(other: unknown): TslArithmetic;
  div(other: unknown): TslArithmetic;
  add(other: unknown): TslArithmetic;
  sub(other: unknown): TslArithmetic;
  addAssign(other: unknown): void;
  toVar(): TslArithmetic;
};
type TslUniform<T> = TslArithmetic & { value: T };
const {
  Fn, Loop, abs, cameraPosition, clamp, cos, float, length, max, min,
  mix, normalize, positionWorld, sin, smoothstep, uniform, vec3, vec4,
} = TSL as unknown as Record<string, any>;

/** Fixed march length: inside the briefed 16-24 step band, cheapest end. */
export const VOLUME_FIRE_MARCH_STEPS = 20;
/** Authored-moment ceiling per arena (brief budget: <= 4). */
export const VOLUME_FIRE_MAX_AUTHORED_PER_ARENA = 4;
/** Pool capacity: four authored slots plus one reserved nuke-fireball slot. */
export const VOLUME_FIRE_POOL_CAPACITY = VOLUME_FIRE_MAX_AUTHORED_PER_ARENA + 1;
/** Reserved slot index the nuke-event lane drives; never used by authored sync. */
export const VOLUME_FIRE_NUKE_SLOT = VOLUME_FIRE_MAX_AUTHORED_PER_ARENA;
/** Arenas with authored placements (tests pin this roster and the ceiling). */
/** Nuke fireball lifetime driver: growth ramp and trailing decay, ms. */
export const VOLUME_FIRE_NUKE_GROW_MS = 400;
export const VOLUME_FIRE_NUKE_DECAY_MS = 1_200;
/** Player-facing tier carried by the `volumeFire` graphics control. */
export type VolumeFireTier = 'off' | 'low' | 'high';

export type VolumeFireEmitterSpec = Readonly<{
  label: string;
  /** World-space centre of the fire box. */
  position: readonly [number, number, number];
  /** Box half extents in metres (the march gate derives from these). */
  halfExtents: readonly [number, number, number];
  /** Per-emitter noise/flicker phase. Must stay a uniform (HF-477). */
  seed: number;
  tintHex: number;
  /** Base emissive intensity, pre-tier-scale. Must stay a uniform (HF-477). */
  intensity: number;
}>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function nuketown2VolumeFireSpecs(): readonly VolumeFireEmitterSpec[] {
  const bank = NUKETOWN2_APPLIANCE_BANK;
  const northX = nuketown2HandedX(bank.x);
  const y = 0.95 + 0.55;
  const half: readonly [number, number, number] = [0.95, 0.55, 0.45];
  const north: readonly [number, number, number] = [northX, y, bank.z];
  const south: readonly [number, number, number] = [-northX, y, -bank.z];
  return Object.freeze([
    Object.freeze({
      label: 'nuketown2 north lawn appliance bank fire',
      position: north,
      halfExtents: half, seed: 3.1, tintHex: 0xfff3e0, intensity: 1.15,
    }),
    Object.freeze({
      label: 'nuketown2 south lawn appliance bank fire',
      position: south,
      halfExtents: half, seed: 7.7, tintHex: 0xffe9cf, intensity: 1.15,
    }),
  ]);
}

/**
 * skyline-terminal authored placements: fire over two tarmac luggage carts.
 * Derived from the cart table in `src/additional-maps.ts`
 * (`for (const [x, z] of [[-8, 14], [8, 14], ...])`,
 * `box(builder, 'skyline-luggage-cart', [x, 0.6, z], [2.4, 1.2, 1.6], ...)`):
 * the symmetric inner pair, fire centre at cart-top (1.2 m) + 0.5 m.
 */
function skylineTerminalVolumeFireSpecs(): readonly VolumeFireEmitterSpec[] {
  const carts: ReadonlyArray<readonly [number, number]> = [[-8, 14], [8, 14]];
  return Object.freeze(carts.map(([x, z], index): VolumeFireEmitterSpec => {
    const position: readonly [number, number, number] = [x, 1.7, z];
    const halfExtents: readonly [number, number, number] = [1.0, 0.5, 0.7];
    return Object.freeze({
      label: `skyline-terminal luggage cart fire ${index}`,
      position,
      halfExtents,
      seed: 5.3 + index * 4.1,
      tintHex: 0xffedcf,
      intensity: 1.0,
    });
  }));
}
const VOLUME_FIRE_PLACEMENT_FACTORIES: Readonly<Partial<Record<ArenaId, () => readonly VolumeFireEmitterSpec[]>>> = Object.freeze({
  nuketown2: nuketown2VolumeFireSpecs,
  'skyline-terminal': skylineTerminalVolumeFireSpecs,
});
/** Authored placement IDs projected from the canonical arena catalog. */
export const VOLUME_FIRE_AUTHORED_ARENAS: readonly ArenaId[] = Object.freeze(
  ARENA_IDS.filter((arenaId) => VOLUME_FIRE_PLACEMENT_FACTORIES[arenaId] !== undefined),
);
const EMPTY_VOLUME_FIRE_PLACEMENTS: readonly VolumeFireEmitterSpec[] = Object.freeze([]);
/** Authored placements for an arena id; empty for arenas without fire moments. */
export function volumeFireAuthoredPlacements(arenaId: string): readonly VolumeFireEmitterSpec[] {
  const factory = VOLUME_FIRE_PLACEMENT_FACTORIES[arenaId as ArenaId];
  return factory ? factory() : EMPTY_VOLUME_FIRE_PLACEMENTS;
}

/** One material factory for every slot: identical graph, per-slot uniforms. */
function createVolumeFireMaterial(
  clock: TslUniform<number>,
  seed: TslUniform<number>,
  intensity: TslUniform<number>,
  tint: TslUniform<THREE.Color>,
  half: TslUniform<THREE.Vector3>,
  invWorld: TslUniform<THREE.Matrix4>,
  growth: TslUniform<number>,
): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  mat.name = 'volume-fire-emitter-material';
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.BackSide;
  mat.blending = THREE.AdditiveBlending;
  mat.fog = false;
  const steps = VOLUME_FIRE_MARCH_STEPS;
  mat.colorNode = Fn(() => {
    const ro: TslArithmetic = invWorld.mul(vec4(cameraPosition, 1)).xyz.toVar();
    const exit: TslArithmetic = invWorld.mul(vec4(positionWorld, 1)).xyz;
    const seg = exit.sub(ro);
    const dist = min(length(seg), float(30));
    const rd: TslArithmetic = normalize(seg).toVar();
    const stepLen = dist.div(float(steps));
    const acc: TslArithmetic = vec3(0, 0, 0).toVar();
    const travelled: TslArithmetic = stepLen.mul(0.5).toVar();
    Loop(steps, () => {
      const p = ro.add(rd.mul(travelled));
      // Soft box gate from the per-emitter half extents (uniform, HF-477).
      const gx = float(1).sub(smoothstep(half.x.mul(0.72), half.x, abs(p.x)));
      const gy = float(1).sub(smoothstep(half.y.mul(0.72), half.y, abs(p.y)));
      const gz = float(1).sub(smoothstep(half.z.mul(0.72), half.z, abs(p.z)));
      const gate = gx.mul(gy).mul(gz);
      // Flame body: 0 at the tip, 1 at the base; wide base, narrow tip.
      const h = clamp(p.y.add(half.y).div(max(half.y.mul(2), float(1e-4))), float(0), float(1));
      const fromBase = float(1).sub(h);
      const body = fromBase.mul(fromBase).mul(float(0.35).add(fromBase.mul(0.65)));
      // Two-octave procedural churn, advected upward, seeded per emitter.
      const t1 = clock.mul(1.7).add(seed.mul(3.3));
      const t2 = clock.mul(2.3).add(seed.mul(1.7));
      const rise = clock.mul(2.4);
      const n1 = sin(p.x.mul(2.6).add(seed).add(t1))
        .mul(cos(p.y.mul(3.4).sub(rise).add(t2)))
        .mul(sin(p.z.mul(2.6).sub(seed).add(t1.mul(0.7))));
      const n2 = sin(p.x.mul(6.0).sub(t2)).mul(cos(p.z.mul(5.4).add(t1))).mul(sin(p.y.mul(6.8).add(rise.mul(1.6))));
      const churn = n1.mul(0.65).add(n2.mul(0.35)).mul(0.5).add(0.5);
      const density = gate.mul(body).mul(float(0.45).add(churn.mul(0.9)));
      // Temperature: hottest at the base, carried up by the churn.
      const temp = clamp(fromBase.mul(0.65).add(churn.mul(0.35)), float(0), float(1));
      const ember = vec3(0.45, 0.05, 0.005);
      const blaze = vec3(1.0, 0.42, 0.06);
      const white = vec3(1.0, 0.88, 0.62);
      const col = mix(mix(ember, blaze, clamp(temp.mul(1.7), float(0), float(1))), white, clamp(temp.sub(0.6).mul(2.5), float(0), float(1)));
      const flicker = sin(clock.mul(9).add(seed.mul(17))).mul(0.12).add(1);
      acc.addAssign(col.mul(density).mul(stepLen).mul(intensity).mul(growth).mul(flicker));
      travelled.addAssign(stepLen);
    });
    return tint.mul(clamp(acc.mul(0.5), float(0), float(1.2)));
  })();
  return mat;
}

type VolumeFireSlot = {
  mesh: THREE.Mesh<THREE.BoxGeometry, MeshBasicNodeMaterial>;
  seed: TslUniform<number>;
  intensity: TslUniform<number>;
  tint: TslUniform<THREE.Color>;
  half: TslUniform<THREE.Vector3>;
  invWorld: TslUniform<THREE.Matrix4>;
  growth: TslUniform<number>;
  authored: boolean;
  active: boolean;
  baseIntensity: number;
  startsAtMs: number;
  expiresAtMs: number;
};

/**
 * Fixed-capacity pool: authored slots plus one reserved nuke-fireball slot.
 * Every GPU resource exists before combat; acquire/spawn only mutates slot
 * state, and update() only mutates uniform values and visibility.
 */
export class VolumeFirePresentationPool {
  readonly root = new THREE.Group();
  private readonly slots: VolumeFireSlot[] = [];
  private readonly clock: TslUniform<number> = uniform(0);
  private tier: VolumeFireTier = 'high';
  private tierScale = 1;
  private emitted = 0;
  private overflowReuses = 0;
  private gpuPrewarmGeneration: number | null = null;
  private gpuPrewarmPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.root.name = 'volume-fire-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (let index = 0; index < VOLUME_FIRE_POOL_CAPACITY; index += 1) {
      const seed: TslUniform<number> = uniform(1 + index * 2.3);
      const intensity: TslUniform<number> = uniform(1);
      const tint: TslUniform<THREE.Color> = uniform(new THREE.Color(0xfff3e0));
      const half: TslUniform<THREE.Vector3> = uniform(new THREE.Vector3(1, 0.5, 1));
      const invWorld: TslUniform<THREE.Matrix4> = uniform(new THREE.Matrix4());
      const growth: TslUniform<number> = uniform(1);
      const material = createVolumeFireMaterial(this.clock, seed, intensity, tint, half, invWorld, growth);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = index === VOLUME_FIRE_NUKE_SLOT ? 'volume-fire-nuke-fireball' : `volume-fire-authored-${index}`;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      mesh.userData.presentationOnly = true;
      mesh.raycast = () => undefined;
      this.root.add(mesh);
      this.slots.push({
        mesh, seed, intensity, tint, half, invWorld, growth,
        authored: false, active: false, baseIntensity: 1,
        startsAtMs: 0, expiresAtMs: Number.POSITIVE_INFINITY,
      });
    }
  }

  /** Player tier: 'off' hides the whole stage; low/high rescale intensity. */
  applyVolumeFireTier(tier: VolumeFireTier): void {
    this.tier = tier;
    this.tierScale = tier === 'off' ? 0 : tier === 'low' ? 0.55 : 1;
    this.root.visible = tier !== 'off' && !this.disposed;
    for (const slot of this.slots) {
      slot.intensity.value = slot.baseIntensity * this.tierScale;
      if (!slot.active || tier === 'off') slot.mesh.visible = false;
      else slot.mesh.visible = true;
    }
  }

  private poseSlot(slot: VolumeFireSlot, spec: VolumeFireEmitterSpec): void {
    slot.mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
    slot.mesh.scale.set(spec.halfExtents[0] * 2, spec.halfExtents[1] * 2, spec.halfExtents[2] * 2);
    slot.mesh.updateWorldMatrix(true, false);
    slot.seed.value = spec.seed;
    slot.baseIntensity = spec.intensity;
    slot.intensity.value = spec.intensity * this.tierScale;
    slot.tint.value.setHex(spec.tintHex);
    slot.half.value.set(spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2]);
    slot.invWorld.value.copy(slot.mesh.matrixWorld).invert();
    slot.growth.value = 1;
    slot.active = true;
    slot.authored = true;
    slot.startsAtMs = 0;
    slot.expiresAtMs = Number.POSITIVE_INFINITY;
    slot.mesh.visible = this.tier !== 'off';
  }

  /**
   * Replace authored slots with an arena's placements (menu-time/arena
   * transition only; never the combat frame). Unknown arenas clear to none.
   */
  syncArena(arenaId: string): void {
    for (let index = 0; index < VOLUME_FIRE_MAX_AUTHORED_PER_ARENA; index += 1) {
      const slot = this.slots[index];
      if (slot === undefined) continue;
      slot.active = false;
      slot.authored = false;
      slot.mesh.visible = false;
    }
    const placements = volumeFireAuthoredPlacements(arenaId);
    const count = Math.min(placements.length, VOLUME_FIRE_MAX_AUTHORED_PER_ARENA);
    for (let index = 0; index < count; index += 1) {
      const slot = this.slots[index];
      const spec = placements[index];
      if (slot === undefined || spec === undefined) continue;
      this.poseSlot(slot, spec);
    }
  }

  /**
   * Nuke-event lane entry: transient fireball on the reserved slot.
   * Overwrites any previous fireball; returns false only when disposed.
   */
  spawnNukeFireball(
    position: readonly [number, number, number],
    radiusM: number,
    heightM: number,
    startsAtMs: number,
    expiresAtMs: number,
  ): boolean {
    if (this.disposed) return false;
    const slot = this.slots[VOLUME_FIRE_NUKE_SLOT];
    if (slot === undefined) return false;
    if (slot.active) this.overflowReuses += 1;
    const radius = Math.max(0.5, Number.isFinite(radiusM) ? radiusM : 4);
    const height = Math.max(0.5, Number.isFinite(heightM) ? heightM : 6);
    slot.mesh.position.set(position[0], position[1], position[2]);
    slot.mesh.scale.set(radius * 2, height, radius * 2);
    slot.mesh.updateWorldMatrix(true, false);
    slot.seed.value = 11.3;
    slot.baseIntensity = 2.2;
    slot.intensity.value = 2.2 * this.tierScale;
    slot.tint.value.setHex(0xffd9a0);
    slot.half.value.set(radius, height / 2, radius);
    slot.invWorld.value.copy(slot.mesh.matrixWorld).invert();
    slot.startsAtMs = startsAtMs;
    slot.expiresAtMs = Math.max(startsAtMs + 1, expiresAtMs);
    slot.active = true;
    slot.authored = false;
    slot.mesh.visible = this.tier !== 'off';
    this.emitted += 1;
    return true;
  }

  releaseNukeFireball(): void {
    const slot = this.slots[VOLUME_FIRE_NUKE_SLOT];
    if (slot === undefined) return;
    slot.active = false;
    slot.mesh.visible = false;
  }

  /**
   * Per-frame driver. Mutates uniform values and visibility only — no
   * allocation, no pipeline work, safe to call every frame.
   */
  update(nowMs: number): void {
    if (this.disposed || this.tier === 'off' || !this.root.visible) return;
    this.clock.value = nowMs / 1_000;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      if (nowMs >= slot.expiresAtMs) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      if (!slot.authored) {
        const ageMs = nowMs - slot.startsAtMs;
        const remainingMs = slot.expiresAtMs - nowMs;
        const grow = clamp01(ageMs / VOLUME_FIRE_NUKE_GROW_MS);
        const decay = clamp01(remainingMs / VOLUME_FIRE_NUKE_DECAY_MS);
        slot.growth.value = Math.max(0.12, grow) * decay;
      }
      slot.mesh.visible = true;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.authored = false;
      slot.mesh.visible = false;
      slot.growth.value = 1;
    }
  }

  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.disposed) return;
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      const pending = this.gpuPrewarmPromise;
      try {
        await pending;
      } catch {
        if (this.gpuPrewarmPromise === pending) this.gpuPrewarmPromise = null;
      }
      if (this.gpuPrewarmGeneration === sceneGeneration) return;
    }
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
    if (!(parentScene instanceof THREE.Scene)) throw new Error('Volume fire presentation must be attached to a scene before prewarm');
    const objectStates = new Map<THREE.Object3D, Readonly<{
      visible: boolean;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
    }>>();
    this.root.traverse((node) => {
      objectStates.set(node, Object.freeze({
        visible: node.visible,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      }));
    });
    camera.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const wasRootVisible = this.root.visible;
    this.root.visible = true;
    // Representative pose per slot so the one shared pipeline compiles here,
    // at menu time, and never on the combat frame.
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (slot === undefined) continue;
      const target = cameraPosition.clone()
        .addScaledVector(forward, 24)
        .addScaledVector(right, (index - (this.slots.length - 1) / 2) * 5.2)
        .addScaledVector(up, ((index % 2) - 0.5) * 3.1);
      slot.mesh.position.copy(this.root.worldToLocal(target.clone()));
      slot.mesh.scale.set(2, 1.4, 2);
      slot.mesh.visible = true;
      slot.growth.value = 1;
    }
    try {
      await runtime.compileAndRender(this.root, camera, parentScene);
      this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      for (const [node, state] of objectStates) {
        node.visible = state.visible;
        node.position.copy(state.position);
        node.quaternion.copy(state.quaternion);
        node.scale.copy(state.scale);
      }
      this.root.visible = wasRootVisible;
      for (const slot of this.slots) {
        if (!slot.active) slot.mesh.visible = false;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((node) => {
      const holder = node as unknown as { material?: THREE.Material | THREE.Material[]; geometry?: THREE.BufferGeometry };
      if (holder.geometry) geometries.add(holder.geometry);
      const nodeMaterials = Array.isArray(holder.material) ? holder.material : holder.material ? [holder.material] : [];
      for (const material of nodeMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.root.removeFromParent();
    this.slots.length = 0;
  }

  telemetry(): {
    active: number; authored: number; capacity: number; emitted: number;
    overflowReuses: number; dynamicLights: number; prewarmed: boolean;
  } {
    return {
      active: this.slots.reduce((count, slot) => count + Number(slot.active), 0),
      authored: this.slots.reduce((count, slot) => count + Number(slot.active && slot.authored), 0),
      capacity: this.slots.length,
      emitted: this.emitted,
      overflowReuses: this.overflowReuses,
      dynamicLights: 0,
      prewarmed: this.gpuPrewarmGeneration !== null,
    };
  }
}
