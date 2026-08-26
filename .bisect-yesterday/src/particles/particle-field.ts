/**
 * particle-field.ts — HF-371: one instanced draw, one family, no allocations.
 *
 * WHAT A FIELD IS
 * A `ParticleField` is one family's entire existence: one `InstancedMesh`, one
 * material, one procedural sprite, and a fixed pool of particles held in
 * parallel typed arrays. There is no per-particle object, no `THREE.Object3D`
 * per particle, and no spawn/destroy. The naive build — a `Sprite` per particle
 * added to and removed from the scene — is how a 144 fps arena becomes a 40 fps
 * one, and it is the single most common way a particle feature ships broken.
 *
 * THE FIVE PROPERTIES THAT MAKE IT CHEAP
 *
 * 1. ONE DRAW PER FAMILY. `mesh.count` is set to the live population each
 *    frame, so an idle arena submits four draws of a handful of instances and a
 *    busy one submits four draws of many. Never five. The draw count cannot
 *    vary with what is happening in the match, because nothing in this file can
 *    create a mesh after `build()`.
 *
 * 2. ZERO PER-FRAME ALLOCATION. Every buffer is sized at the family's ceiling
 *    in the constructor. The update loop touches only preallocated scratch
 *    (`scratchMatrix`, `scratchPosition`, `scratchQuaternion`, `scratchScale`)
 *    and raw `Float32Array` slots. That is also why `emitParticle` takes
 *    eighteen scalar arguments rather than an options object: an options object
 *    per particle per burst is an allocation per particle per burst.
 *
 * 3. SWAP-REMOVE COMPACTION. Dead particles are replaced by the last live one
 *    and the population shrinks. Live instances are therefore always contiguous
 *    at the front of the buffer, so `mesh.count` alone excludes the dead and
 *    the GPU never processes a degenerate instance it did not need to.
 *
 * 4. NO GROWTH, EVER. A burst into a full pool evicts a rotating slot instead
 *    of allocating. A firefight cannot make this system allocate, and it cannot
 *    make it drop an event silently either — the event lands, something older
 *    goes.
 *
 * 5. NO CUSTOM SHADERS. Sprites are procedural `DataTexture`s on stock
 *    materials, so nothing here can fail to compile on the WebGL2 compatibility
 *    route or the required native-WebGPU route. Per-instance fade is achieved
 *    by PREMULTIPLYING the instance colour under additive blending, where black
 *    is exactly transparent — which is the reason the soft families are
 *    additive, and the reason `grit` (which is alpha-tested and has no
 *    per-instance alpha available) fades by scale instead.
 *
 * WHERE THE COMBAT GUARDS ARE APPLIED
 * In this loop, for every particle of every family, with no bypass parameter.
 * See `combat-readability.ts` for the contract; this file is the enforcement.
 *
 * DETERMINISM, HONESTLY STATED
 * Each field owns a `DeterministicRng` forked from the runtime seed, so the
 * initial ambient scatter is identical on every peer and a given event burst is
 * reproducible from a given field state. The stream is consumed by respawns,
 * whose timing depends on frame rate, so two peers' ambient dust DIVERGES over
 * a match. That is intentional and harmless: nothing in this module is read by
 * gameplay, authority, or replication. Where determinism has to be exact —
 * wind, weather — the shared closed-form fields already provide it, and this
 * module consumes them rather than rolling its own.
 */

import * as THREE from 'three';
import { DeterministicRng } from '../deterministic-rng';
import {
  PARTICLE_READABILITY,
  centreVisibility,
  clamp01,
  particleScreenLoad,
  sightlineVisibility,
  visibilityToScaleGate,
} from './combat-readability';
import { familyCapacityCeiling, type ParticleFamilySpec, type ParticleSprite } from './particle-catalog';

/** Largest frame step integrated. A backgrounded tab hands back seconds. */
export const PARTICLE_MAX_STEP_SECONDS = 0.1;

/**
 * Extra downward acceleration (m/s^2) ambient families carry at full rain,
 * scaled by the frame's `rainRate`. Physically it is the rain load: impact
 * and drag of a thousand drops per second drive suspended dust out of the air
 * and weigh falling debris down. Bounded so even a storm cannot turn motes
 * into sleet — terminal drift stays under ~1 m/s against the template drag.
 */
export const RAIN_AMBIENT_SINK_MPS2 = 0.35;

/** Bound on registered light shafts, so the mote brightening cost is stateable. */
export const PARTICLE_MAX_LIGHT_SHAFTS = 6;

/**
 * Per-frame inputs shared by every field. The runtime owns exactly one of these
 * and mutates it in place; it is never constructed inside a frame.
 */
export type ParticleFrameContext = {
  cameraX: number; cameraY: number; cameraZ: number;
  forwardX: number; forwardY: number; forwardZ: number;
  cameraQuaternion: THREE.Quaternion;
  /** Shared wind field sample at the camera, m/s. */
  windX: number; windZ: number;
  /** Aim-down-sights progress 0..1; widens the protected centre cone. */
  adsProgress: number;
  /**
   * Rain intensity 0..1 from the shared weather sample this frame. The field
   * uses it two ways: ambient families gain a downward "rain load" (dust is
   * beaten out of the air, falling debris is weighed down), and the runtime
   * thins the mote population against it. Zero in clear weather, so every
   * existing caller and test keeps its exact behaviour.
   */
  rainRate: number;
  /** Global 0..1 taste/accessibility scale. */
  intensityScale: number;
  /** Aggregate-load thinning from the previous frame. */
  loadScale: number;
  /** Seconds since the runtime started; drives flutter and swirl phases. */
  elapsedSeconds: number;
  /** Protected eye-to-enemy sightlines, packed xyz. */
  protectedTargets: Float32Array;
  protectedCount: number;
  /** Light shafts motes brighten inside: origin, unit axis, radius. */
  shaftOrigins: Float32Array;
  shaftAxes: Float32Array;
  shaftRadii: Float32Array;
  shaftCount: number;
  shaftResponse: number;
};

/** Allocates the one shared context. Called once, never per frame. */
export function createParticleFrameContext(): ParticleFrameContext {
  return {
    cameraX: 0, cameraY: 0, cameraZ: 0,
    forwardX: 0, forwardY: 0, forwardZ: -1,
    cameraQuaternion: new THREE.Quaternion(),
    windX: 0, windZ: 0,
    rainRate: 0,
    adsProgress: 0,
    intensityScale: 1,
    loadScale: 1,
    elapsedSeconds: 0,
    protectedTargets: new Float32Array(PARTICLE_READABILITY.maxProtectedTargets * 3),
    protectedCount: 0,
    shaftOrigins: new Float32Array(PARTICLE_MAX_LIGHT_SHAFTS * 3),
    shaftAxes: new Float32Array(PARTICLE_MAX_LIGHT_SHAFTS * 3),
    shaftRadii: new Float32Array(PARTICLE_MAX_LIGHT_SHAFTS),
    shaftCount: 0,
    shaftResponse: 0,
  };
}

/** The camera-riding volume ambient families wrap inside. */
export type ParticleVolume = { radiusM: number; aboveM: number; belowM: number };

export type ParticleFieldTelemetry = Readonly<{
  id: string;
  /** Always 1. A family is a draw; that is the whole design. */
  instancedDraws: 1;
  capacity: number;
  live: number;
  /** Instances submitted this frame. Equals the live population. */
  submitted: number;
  /** Of those, the ones with a non-degenerate quad after the guards. */
  visible: number;
  /** Highest opacity any single particle reached after the guards. */
  peakOpacity: number;
  /** Particles suppressed by the centre cone / sightline guards this frame. */
  guardSuppressed: number;
  perFrameAllocations: 0;
}>;

const ROLL_AXIS = new THREE.Vector3(0, 0, 1);

function proceduralSprite(size: number, kind: ParticleSprite): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - centre) / centre;
      const ny = (y - centre) / centre;
      let alpha = 0;
      if (kind === 'dot') {
        // Squared falloff: bright core, long soft skirt, no visible edge.
        const distance = Math.min(1, Math.hypot(nx, ny));
        const intensity = 1 - distance;
        alpha = intensity * intensity;
      } else if (kind === 'smoke') {
        // A perturbed disc. Two incommensurate angular harmonics break the
        // circle so a puff does not read as a blurred ball, and a low-frequency
        // mottle keeps the interior from looking like a gradient swatch.
        const angle = Math.atan2(ny, nx);
        const distance = Math.hypot(nx, ny);
        const lobed = distance * (1 + 0.17 * Math.sin(angle * 3 + 0.9) + 0.11 * Math.sin(angle * 5 - 1.7));
        const body = Math.max(0, 1 - lobed);
        const mottle = 0.82 + 0.18 * Math.sin(nx * 5.3 + 1.2) * Math.sin(ny * 4.1 - 0.6);
        alpha = body * body * mottle;
      } else if (kind === 'flake') {
        // An ellipse with a brighter midrib: enough to read as a leaf or a torn
        // scrap of foam at the two-to-six pixel sizes these are drawn at.
        const ex = nx / 0.58;
        const ey = ny;
        const distance = Math.hypot(ex, ey);
        const body = Math.max(0, 1 - distance);
        const rib = 1 + 0.5 * Math.max(0, 1 - Math.abs(ex) * 3.2);
        alpha = Math.min(1, body * 1.25 * rib);
      } else {
        // Chip: hard-edged and irregular, for an alpha-tested material. No soft
        // skirt at all, because alphaTest would quantise it into a halo.
        const angle = Math.atan2(ny, nx);
        const distance = Math.hypot(nx, ny);
        const edge = 0.78 + 0.2 * Math.sin(angle * 4 + 0.7) + 0.08 * Math.sin(angle * 7 - 2.1);
        alpha = distance <= edge ? 1 : 0;
      }
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(clamp01(alpha) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `hf371-particle-${kind}`;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Sprite resolution per kind. Small on purpose: these are 2-40 px on screen. */
const SPRITE_SIZE: Readonly<Record<ParticleSprite, number>> = Object.freeze({
  dot: 32, smoke: 48, flake: 32, chip: 16,
});

export class ParticleField {
  readonly spec: ParticleFamilySpec;
  readonly capacity: number;

  private mesh: THREE.InstancedMesh | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private texture: THREE.DataTexture | null = null;

  // Particle state. Parallel arrays, never objects: this is the only hot loop
  // in the module and it must not allocate.
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly radius0: Float32Array;
  private readonly radius1: Float32Array;
  private readonly colorR: Float32Array;
  private readonly colorG: Float32Array;
  private readonly colorB: Float32Array;
  private readonly peak: Float32Array;
  private readonly drag: Float32Array;
  private readonly buoyancy: Float32Array;
  private readonly windPull: Float32Array;
  private readonly flutter: Float32Array;
  private readonly roll: Float32Array;
  private readonly spin: Float32Array;
  private readonly phase: Float32Array;

  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchQuaternion = new THREE.Quaternion();
  private readonly scratchRoll = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3(1, 1, 1);
  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  private rng: DeterministicRng;

  private live = 0;
  private visible = 0;
  private evictCursor = 0;
  private peakOpacity = 0;
  private guardSuppressed = 0;
  private ambientTarget = 0;
  private disposed = false;

  private volume: ParticleVolume = { radiusM: 20, aboveM: 12, belowM: 4 };

  constructor(spec: ParticleFamilySpec, seed: number) {
    this.spec = spec;
    this.capacity = familyCapacityCeiling(spec.id);
    this.rng = new DeterministicRng(seed).fork(`particles/${spec.id}`);

    const size = this.capacity;
    this.px = new Float32Array(size);
    this.py = new Float32Array(size);
    this.pz = new Float32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.vz = new Float32Array(size);
    this.age = new Float32Array(size);
    this.life = new Float32Array(size);
    this.radius0 = new Float32Array(size);
    this.radius1 = new Float32Array(size);
    this.colorR = new Float32Array(size);
    this.colorG = new Float32Array(size);
    this.colorB = new Float32Array(size);
    this.peak = new Float32Array(size);
    this.drag = new Float32Array(size);
    this.buoyancy = new Float32Array(size);
    this.windPull = new Float32Array(size);
    this.flutter = new Float32Array(size);
    this.roll = new Float32Array(size);
    this.spin = new Float32Array(size);
    this.phase = new Float32Array(size);
  }

  /** Deterministic 0..1 draw from this field's own stream. */
  random(): number {
    return this.rng.next();
  }

  /** Symmetric deterministic draw in [-1, 1). */
  randomSigned(): number {
    return this.rng.next() * 2 - 1;
  }

  get liveCount(): number { return this.live; }
  get visibleCount(): number { return this.visible; }

  /**
   * World position of live particle `index`, written into `target`.
   *
   * The instance matrix is NOT a usable read-back for this: a particle the
   * readability guards suppressed is written as a zero matrix, so its matrix
   * claims the world origin while the particle is alive and somewhere else
   * entirely. Diagnostics and tests need the simulation state, not the drawing
   * of it, and conflating the two is how a guard looks like a teleport bug.
   */
  positionAt(index: number, target: THREE.Vector3): THREE.Vector3 {
    if (index < 0 || index >= this.live) return target.set(Number.NaN, Number.NaN, Number.NaN);
    return target.set(this.px[index], this.py[index], this.pz[index]);
  }

  setVolume(radiusM: number, aboveM: number, belowM: number): void {
    this.volume.radiusM = Math.max(1, radiusM);
    this.volume.aboveM = Math.max(0.5, aboveM);
    this.volume.belowM = Math.max(0.5, belowM);
  }

  /** Live population an ambient family maintains. Ignored by event families. */
  setAmbientTarget(count: number): void {
    this.ambientTarget = Math.max(0, Math.min(this.capacity, Math.round(count)));
  }

  /** Builds the single instanced draw and parents it. Idempotent. */
  build(parent: THREE.Object3D): void {
    if (this.mesh || this.disposed) return;
    const spec = this.spec;
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.texture = proceduralSprite(SPRITE_SIZE[spec.sprite], spec.sprite);

    const additive = spec.blending === 'additive';
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: 0xffffff,
      transparent: additive,
      opacity: 1,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      // Additive fragments must not tint toward fog colour: fog ADDS under
      // additive blending, which turns distant dust into a bright smear.
      fog: !additive,
      depthWrite: !additive,
      depthTest: true,
      alphaTest: additive ? 0 : 0.5,
      side: THREE.FrontSide,
    });

    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    mesh.name = `hf371-particles-${spec.id}`;
    mesh.count = 0;
    mesh.renderOrder = spec.renderOrder;
    // Instances live anywhere in the arena; the mesh's own bounding sphere is
    // meaningless, so per-object frustum culling would pop the whole family.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    // The static batcher must never touch an InstancedMesh: batching one
    // collapses every instance onto a single stray at the origin.
    mesh.userData.dynamic = true;

    // Prewarm the colour buffer at build rather than on first tint, matching
    // destructible-shed-presentation.ts, so the first burst does not stall on
    // a fresh attribute upload mid-firefight.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
    mesh.userData.instanceColorPrewarmed = true;

    for (let index = 0; index < this.capacity; index += 1) {
      mesh.setMatrixAt(index, this.zeroMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.mesh = mesh;
    parent.add(mesh);
  }

  /** The instanced mesh, for tests and telemetry. Null before `build`. */
  get instancedMesh(): THREE.InstancedMesh | null { return this.mesh; }

  /**
   * Adds one particle.
   *
   * Eighteen scalars rather than a parameter object, deliberately: a burst
   * emits up to a dozen particles and an object literal per particle is an
   * allocation per particle. The call sites are all inside `index.ts`, which
   * translates catalog recipes into these arguments.
   */
  emitParticle(
    x: number, y: number, z: number,
    velocityX: number, velocityY: number, velocityZ: number,
    lifeSeconds: number,
    radiusStart: number, radiusEnd: number,
    red: number, green: number, blue: number,
    opacity: number,
    dragPerSecond: number,
    buoyancyMps2: number,
    windPull: number,
    flutterMps: number,
    spinRadiansPerSecond: number,
  ): void {
    if (this.disposed || !(lifeSeconds > 0)) return;
    let index: number;
    if (this.live < this.capacity) {
      index = this.live;
      this.live += 1;
    } else {
      // Full: evict a rotating slot. Never allocate, never drop the event.
      index = this.evictCursor % this.capacity;
      this.evictCursor = (this.evictCursor + 1) % this.capacity;
    }
    this.px[index] = x;
    this.py[index] = y;
    this.pz[index] = z;
    this.vx[index] = velocityX;
    this.vy[index] = velocityY;
    this.vz[index] = velocityZ;
    this.age[index] = 0;
    this.life[index] = lifeSeconds;
    this.radius0[index] = radiusStart;
    this.radius1[index] = radiusEnd;
    this.colorR[index] = red;
    this.colorG[index] = green;
    this.colorB[index] = blue;
    this.peak[index] = Math.min(this.spec.maxOpacity, clamp01(opacity));
    this.drag[index] = Math.max(0, dragPerSecond);
    this.buoyancy[index] = buoyancyMps2;
    this.windPull[index] = clamp01(windPull);
    this.flutter[index] = Math.max(0, flutterMps);
    this.roll[index] = this.rng.next() * Math.PI * 2;
    this.spin[index] = spinRadiansPerSecond;
    this.phase[index] = this.rng.next() * Math.PI * 2;
  }

  /** Drops every live particle without touching the pool's allocation. */
  clear(): void {
    this.live = 0;
    this.visible = 0;
    if (this.mesh) this.mesh.count = 0;
  }

  /**
   * Rekeys this family's deterministic stream for a new match and drops every
   * live particle. Same fork scheme the constructor uses, so reseeding with a
   * seed reproduces exactly the layout that seed would have produced fresh —
   * which is what lets the runtime take its air from `hostId:matchEpoch` per
   * match instead of whatever seed it was constructed with.
   */
  reseed(seed: number): void {
    this.rng = new DeterministicRng(seed).fork(`particles/${this.spec.id}`);
    this.clear();
  }

  private swapRemove(index: number): void {
    const last = this.live - 1;
    if (index !== last) {
      this.px[index] = this.px[last];
      this.py[index] = this.py[last];
      this.pz[index] = this.pz[last];
      this.vx[index] = this.vx[last];
      this.vy[index] = this.vy[last];
      this.vz[index] = this.vz[last];
      this.age[index] = this.age[last];
      this.life[index] = this.life[last];
      this.radius0[index] = this.radius0[last];
      this.radius1[index] = this.radius1[last];
      this.colorR[index] = this.colorR[last];
      this.colorG[index] = this.colorG[last];
      this.colorB[index] = this.colorB[last];
      this.peak[index] = this.peak[last];
      this.drag[index] = this.drag[last];
      this.buoyancy[index] = this.buoyancy[last];
      this.windPull[index] = this.windPull[last];
      this.flutter[index] = this.flutter[last];
      this.roll[index] = this.roll[last];
      this.spin[index] = this.spin[last];
      this.phase[index] = this.phase[last];
    }
    this.live = last;
  }

  /**
   * Ambient respawn: places a particle at a fresh point in the camera-riding
   * volume and gives it a fresh life. Ambient families never die out; they
   * churn, which is what keeps the field from reading as a fixed lattice.
   */
  private respawnAmbient(index: number, context: ParticleFrameContext, spreadAge: boolean): void {
    const volume = this.volume;
    const x = context.cameraX + this.randomSigned() * volume.radiusM;
    const z = context.cameraZ + this.randomSigned() * volume.radiusM;
    const y = context.cameraY - volume.belowM + this.rng.next() * (volume.aboveM + volume.belowM);
    this.px[index] = x;
    this.py[index] = y;
    this.pz[index] = z;
    this.age[index] = spreadAge ? this.rng.next() * this.life[index] : 0;
    this.roll[index] = this.rng.next() * Math.PI * 2;
    this.phase[index] = this.rng.next() * Math.PI * 2;
  }

  /** Seeds or trims the ambient population toward `setAmbientTarget`. */
  private maintainAmbient(context: ParticleFrameContext, template: AmbientTemplate): void {
    while (this.live > this.ambientTarget) this.swapRemove(this.live - 1);
    while (this.live < this.ambientTarget) {
      const index = this.live;
      this.live += 1;
      const lifeSpan = template.lifeSeconds * (0.65 + this.rng.next() * 0.7);
      this.life[index] = lifeSpan;
      this.radius0[index] = template.radiusM * (0.65 + this.rng.next() * 0.8);
      this.radius1[index] = this.radius0[index];
      const tint = this.rng.next();
      this.colorR[index] = template.warmR + (template.coolR - template.warmR) * tint;
      this.colorG[index] = template.warmG + (template.coolG - template.warmG) * tint;
      this.colorB[index] = template.warmB + (template.coolB - template.warmB) * tint;
      this.peak[index] = Math.min(this.spec.maxOpacity, template.opacity * (0.6 + this.rng.next() * 0.7));
      this.drag[index] = template.dragPerSecond;
      this.buoyancy[index] = template.buoyancyMps2;
      this.windPull[index] = template.windPull;
      this.flutter[index] = template.flutterMps;
      this.spin[index] = template.spinRadiansPerSecond * this.randomSigned();
      this.vx[index] = 0;
      this.vy[index] = template.buoyancyMps2 >= 0 ? 0.1 : -0.1;
      this.vz[index] = 0;
      this.respawnAmbient(index, context, true);
    }
  }

  /**
   * Integrates, guards and uploads the family. Returns this field's
   * contribution to the aggregate screen load, which the runtime feeds back as
   * `loadScale` on the next frame.
   */
  update(dtSeconds: number, context: ParticleFrameContext, template: AmbientTemplate | null): number {
    const mesh = this.mesh;
    if (this.disposed || !mesh) return 0;

    const step = Math.min(PARTICLE_MAX_STEP_SECONDS, Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0));
    if (this.spec.ambient && template) this.maintainAmbient(context, template);

    this.peakOpacity = 0;
    this.guardSuppressed = 0;
    let load = 0;
    let visible = 0;

    const obscuring = this.spec.obscuring;
    const premultiplied = this.spec.blending === 'additive';
    const ceiling = this.spec.maxOpacity;
    // The aggregate load budget thins only the families that can actually
    // obscure. Thinning fine motes because smoke is heavy would trade a real
    // combat problem for a cosmetic one.
    const intensity = clamp01(context.intensityScale) * (obscuring ? clamp01(context.loadScale) : 1);
    const nearCullSq = PARTICLE_READABILITY.nearCullM * PARTICLE_READABILITY.nearCullM;
    const colorArray = mesh.instanceColor ? (mesh.instanceColor.array as Float32Array) : null;
    const volume = this.volume;
    const wrapHeight = volume.aboveM + volume.belowM;

    let index = 0;
    while (index < this.live) {
      const nextAge = this.age[index] + step;
      if (nextAge >= this.life[index]) {
        if (this.spec.ambient && template) {
          // Ambient particles churn rather than dying out.
          this.age[index] = 0;
          this.respawnAmbient(index, context, false);
        } else {
          this.swapRemove(index);
          continue;
        }
      } else {
        this.age[index] = nextAge;
      }

      const normalizedAge = this.age[index] / this.life[index];

      // --- integrate -------------------------------------------------------
      const relax = Math.min(1, this.drag[index] * step);
      const pull = this.windPull[index];
      this.vx[index] += (context.windX * pull - this.vx[index]) * relax;
      this.vz[index] += (context.windZ * pull - this.vz[index]) * relax;
      // Rain load: while it rains, ambient matter is driven downward. Event
      // families (smoke, grit) are untouched — their recipes own their motion.
      this.vy[index] += this.buoyancy[index] * step
        - (this.spec.ambient ? clamp01(context.rainRate) * RAIN_AMBIENT_SINK_MPS2 : 0) * step;
      // Vertical relaxation is half the horizontal: dust settles slowly, which
      // is the difference between suspended particulate and falling gravel.
      this.vy[index] -= this.vy[index] * relax * 0.5;

      const flutterAmplitude = this.flutter[index];
      if (flutterAmplitude > 0) {
        const wobble = context.elapsedSeconds * 2.7 + this.phase[index];
        this.px[index] += Math.sin(wobble) * flutterAmplitude * step;
        this.pz[index] += Math.cos(wobble * 0.83) * flutterAmplitude * step;
      }

      this.px[index] += this.vx[index] * step;
      this.py[index] += this.vy[index] * step;
      this.pz[index] += this.vz[index] * step;

      // --- wrap ambient families into the camera-riding volume --------------
      if (this.spec.ambient) {
        let dx = this.px[index] - context.cameraX;
        let dz = this.pz[index] - context.cameraZ;
        const dy = this.py[index] - context.cameraY;
        if (dx > volume.radiusM) dx -= volume.radiusM * 2;
        else if (dx < -volume.radiusM) dx += volume.radiusM * 2;
        if (dz > volume.radiusM) dz -= volume.radiusM * 2;
        else if (dz < -volume.radiusM) dz += volume.radiusM * 2;
        this.px[index] = context.cameraX + dx;
        this.pz[index] = context.cameraZ + dz;
        if (dy > volume.aboveM) this.py[index] -= wrapHeight;
        else if (dy < -volume.belowM) this.py[index] += wrapHeight;
      }

      // --- envelope --------------------------------------------------------
      // Rise over the first eighth of life, decay quadratically after. A linear
      // decay reads as a light being switched off; the quadratic reads as
      // dispersal.
      const rise = normalizedAge < 0.125 ? normalizedAge * 8 : 1;
      const decay = 1 - normalizedAge;
      const envelope = rise * decay * decay;
      const radius = this.radius0[index] + (this.radius1[index] - this.radius0[index]) * normalizedAge;

      // --- combat guards, applied to every particle, with no bypass ---------
      const relX = this.px[index] - context.cameraX;
      const relY = this.py[index] - context.cameraY;
      const relZ = this.pz[index] - context.cameraZ;
      const distanceSq = relX * relX + relY * relY + relZ * relZ;
      let visibility = 1;
      if (distanceSq < nearCullSq) {
        visibility = 0;
      } else {
        const along = relX * context.forwardX + relY * context.forwardY + relZ * context.forwardZ;
        const perpSq = Math.max(0, distanceSq - along * along);
        visibility = centreVisibility(along, Math.sqrt(perpSq), context.adsProgress, obscuring);
        if (visibility > 0 && obscuring && context.protectedCount > 0) {
          const targets = context.protectedTargets;
          for (let target = 0; target < context.protectedCount; target += 1) {
            const base = target * 3;
            visibility = Math.min(visibility, sightlineVisibility(
              this.px[index], this.py[index], this.pz[index],
              context.cameraX, context.cameraY, context.cameraZ,
              targets[base], targets[base + 1], targets[base + 2],
            ));
            if (visibility <= 0) break;
          }
        }
      }

      let alpha = Math.min(ceiling, this.peak[index] * envelope * intensity * visibility);

      // Motes brighten where authored light shafts are, which is what "dust in
      // a shaft of light" actually is: the same dust, lit. Skipped entirely
      // when no shaft is registered.
      if (context.shaftCount > 0 && context.shaftResponse > 0 && !obscuring && this.spec.sprite === 'dot') {
        let boost = 0;
        for (let shaft = 0; shaft < context.shaftCount; shaft += 1) {
          const base = shaft * 3;
          const ox = this.px[index] - context.shaftOrigins[base];
          const oy = this.py[index] - context.shaftOrigins[base + 1];
          const oz = this.pz[index] - context.shaftOrigins[base + 2];
          const alongAxis = ox * context.shaftAxes[base] + oy * context.shaftAxes[base + 1] + oz * context.shaftAxes[base + 2];
          const offSq = Math.max(0, (ox * ox + oy * oy + oz * oz) - alongAxis * alongAxis);
          const shaftRadius = context.shaftRadii[shaft];
          if (offSq < shaftRadius * shaftRadius) {
            const closeness = 1 - Math.sqrt(offSq) / shaftRadius;
            if (closeness > boost) boost = closeness;
          }
        }
        if (boost > 0) alpha = Math.min(ceiling, alpha * (1 + context.shaftResponse * boost));
      }

      if (visibility < 1) this.guardSuppressed += 1;
      if (alpha > this.peakOpacity) this.peakOpacity = alpha;
      if (obscuring) load += particleScreenLoad(alpha, radius, distanceSq);

      // --- write the instance ---------------------------------------------
      let drawRadius = radius;
      if (premultiplied) {
        if (alpha < PARTICLE_READABILITY.minDrawAlpha) drawRadius = 0;
      } else {
        // No per-instance alpha available: the guards act on scale, and the
        // envelope shrinks the chip out instead of fading it.
        drawRadius *= (0.5 + 0.5 * envelope) * visibilityToScaleGate(visibility);
        if (distanceSq < nearCullSq) drawRadius = 0;
      }

      if (drawRadius > 0) {
        this.scratchPosition.set(this.px[index], this.py[index], this.pz[index]);
        this.scratchRoll.setFromAxisAngle(ROLL_AXIS, this.roll[index] + this.spin[index] * context.elapsedSeconds);
        this.scratchQuaternion.copy(context.cameraQuaternion).multiply(this.scratchRoll);
        const diameter = drawRadius * 2;
        this.scratchScale.set(diameter, diameter, 1);
        this.scratchMatrix.compose(this.scratchPosition, this.scratchQuaternion, this.scratchScale);
        visible += 1;
      } else {
        this.scratchMatrix.copy(this.zeroMatrix);
      }
      mesh.setMatrixAt(index, this.scratchMatrix);

      if (colorArray) {
        // Premultiplying the instance colour by alpha IS the per-instance fade
        // under additive blending, where black is exactly transparent.
        const scale = premultiplied ? alpha : 1;
        const base = index * 3;
        colorArray[base] = this.colorR[index] * scale;
        colorArray[base + 1] = this.colorG[index] * scale;
        colorArray[base + 2] = this.colorB[index] * scale;
      }

      index += 1;
    }

    mesh.count = this.live;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.visible = visible;
    return load;
  }

  telemetry(): ParticleFieldTelemetry {
    return Object.freeze({
      id: this.spec.id,
      instancedDraws: 1,
      capacity: this.capacity,
      live: this.live,
      submitted: this.live,
      visible: this.visible,
      peakOpacity: Number(this.peakOpacity.toFixed(4)),
      guardSuppressed: this.guardSuppressed,
      perFrameAllocations: 0,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh?.removeFromParent();
    this.mesh?.dispose();
    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.texture = null;
    this.live = 0;
    this.visible = 0;
  }
}

/**
 * The per-arena authoring an ambient family respawns against. Held by the
 * runtime as one mutable object per ambient family and rewritten on arena
 * change, so switching arena costs no allocation and no rebuild.
 */
export type AmbientTemplate = {
  lifeSeconds: number;
  radiusM: number;
  warmR: number; warmG: number; warmB: number;
  coolR: number; coolG: number; coolB: number;
  opacity: number;
  dragPerSecond: number;
  buoyancyMps2: number;
  windPull: number;
  flutterMps: number;
  spinRadiansPerSecond: number;
};

export function createAmbientTemplate(): AmbientTemplate {
  return {
    lifeSeconds: 10,
    radiusM: 0.02,
    warmR: 1, warmG: 1, warmB: 1,
    coolR: 1, coolG: 1, coolB: 1,
    opacity: 0.1,
    dragPerSecond: 1,
    buoyancyMps2: 0,
    windPull: 0.5,
    flutterMps: 0,
    spinRadiansPerSecond: 0,
  };
}
