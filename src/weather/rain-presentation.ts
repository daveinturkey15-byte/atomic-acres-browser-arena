/**
 * rain-presentation.ts — Pass 76: the rain you can still fight in.
 *
 * WHY THIS SHAPE
 * The naive rain build is one mesh per drop and a spawn/despawn pool. At the
 * densities that read as a storm that is a thousand draw calls and a thousand
 * matrix uploads a frame, and it is the single fastest way to turn a 144 fps
 * arena into a 40 fps one. So:
 *
 *   - EXACTLY ONE InstancedMesh carries every streak. One draw, one instance
 *     buffer, one material. Splash rings are a second (and last) instanced
 *     draw. Two draws total, at every density, on every arena.
 *   - Drops are never spawned or destroyed. They live in a box that RIDES the
 *     camera and wrap toroidally inside it: a drop that falls out of the bottom
 *     reappears at the top, a drop the player walks away from wraps around in
 *     front of them. Rain is therefore always dense exactly where the player is
 *     and costs literally nothing anywhere else, because nowhere else exists.
 *   - Streaks are axis-billboards: the quad's long axis is pinned to the drop's
 *     real velocity (gravity plus wind shear) and it spins about that axis to
 *     face the camera. That is why the rain leans with the wind field instead
 *     of falling straight down through a gale.
 *
 * COMBAT READABILITY IS A HARD BUDGET, NOT A TASTE SETTING
 * Rain that hides a torso at 30 m is a broken feature no matter how good it
 * looks in a screenshot. Three mechanical guards, all in RAIN_READABILITY:
 *   1. Opacity is CAPPED at 0.34 even in a full storm, and scales down with
 *      rain rate below that.
 *   2. While ADS, a cylinder around the aim axis is emptied of streaks
 *      entirely, and the remaining rain drops to a third of its opacity. You
 *      never lose a target behind a drop you were looking through.
 *   3. Drops closer than ~1.1 m to the lens are culled — at that range a streak
 *      is a full-screen smear, which is a blindfold, not weather.
 * The fourth guard lives in weather-state.ts: heavy states are authored as the
 * shortest spells in the table.
 *
 * BATCHER SAFETY
 * `root.userData.dynamic = true`. art-kit.ts batchStaticMeshes now skips
 * InstancedMesh explicitly (it used to clone their geometry and hide the
 * source, which deleted 2000+ instanced Farcrysis plants), but relying on that
 * one guard alone would be careless: the dynamic flag is the belt to its
 * braces, and it is the flag every other dynamic root in the repo already sets
 * (house-destruction-presentation.ts, interactive-world-runtime.ts, map.ts).
 *
 * NO CUSTOM SHADERS, BY CHOICE
 * Streak and ring artwork are procedural DataTextures on stock materials. That
 * costs a little CPU on the instance matrices and buys total renderer
 * portability: nothing here can fail to compile on the WebGL2 compatibility
 * route or on the native-WebGPU route, because there is nothing here to
 * compile. No external assets either — both textures are computed from maths.
 */

import * as THREE from 'three';
import { isSoftwareWebGLRenderer } from '../atomic-signal';
import type { RenderProfile } from '../render-profile';
import type { WeatherSample } from './weather-state';
import type { WindSample } from './wind-field';

export type RainQualityTier = 'low' | 'high' | 'ultra';

export type RainBudget = Readonly<{ streaks: number; splashes: number }>;

/**
 * Instance ceilings per quality tier. `high` is the shipped default and is
 * deliberately under a thousand: past that the extra drops land behind other
 * drops and buy nothing but fill rate.
 */
export const RAIN_BUDGET: Readonly<Record<RainQualityTier, RainBudget>> = Object.freeze({
  low: Object.freeze({ streaks: 260, splashes: 24 }),
  high: Object.freeze({ streaks: 760, splashes: 56 }),
  ultra: Object.freeze({ streaks: 1400, splashes: 96 }),
});

/** Buffers are allocated once at the ceiling so quality changes stay live. */
export const RAIN_MAX_STREAKS = Math.max(...Object.values(RAIN_BUDGET).map((entry) => entry.streaks));
export const RAIN_MAX_SPLASHES = Math.max(...Object.values(RAIN_BUDGET).map((entry) => entry.splashes));

/** The camera-riding volume drops wrap inside. Metres. */
export const RAIN_VOLUME = Object.freeze({
  /** Half extent on X and Z. */
  radiusM: 21,
  /** Ceiling above the camera. */
  aboveM: 17,
  /** Floor below the camera; deep enough to cover a drop down a stairwell. */
  belowM: 5,
} as const);

/** The combat-readability contract. Every number here is a gameplay guard. */
export const RAIN_READABILITY = Object.freeze({
  /** Hard ceiling on streak material opacity. Never exceeded, at any density. */
  maxOpacity: 0.34,
  /** Floor of the opacity ramp, as a fraction of maxOpacity, at first drizzle. */
  minOpacityFraction: 0.4,
  /** Streak opacity multiplier at full ADS. */
  adsOpacityScale: 0.34,
  /** Radius (m) of the cylinder around the aim axis emptied of streaks in ADS. */
  adsClearRadiusM: 1.35,
  /** How far down the aim axis that cylinder extends (m). */
  adsClearRangeM: 16,
  /** Drops nearer than this to the lens are culled outright (m). */
  nearCullM: 1.1,
  /** Splash rings stay well under the streaks; they are a hint, not an effect. */
  splashMaxOpacity: 0.22,
} as const);

/** Streak geometry and motion. */
export const RAIN_STREAK = Object.freeze({
  widthM: 0.028,
  /** Streak length = speed * this. A ~1/22 s smear, i.e. a camera shutter. */
  smearSeconds: 0.046,
  minLengthM: 0.3,
  maxLengthM: 1.25,
  /** Terminal fall speed range (m/s) before the rain-rate scale. */
  minFallSpeedMps: 7.5,
  maxFallSpeedMps: 13.5,
  /**
   * Fraction of the wind vector a drop actually carries sideways. Full wind
   * would lay a storm flat and shear streaks off screen; 0.55 leans hard
   * enough to read the wind direction without losing the vertical.
   */
  windShear: 0.55,
} as const);

/** Splash ring impostor lifecycle. */
export const RAIN_SPLASH = Object.freeze({
  /** Rings are scattered inside this radius of the camera (m). */
  scatterRadiusM: 12,
  minRadiusM: 0.05,
  maxRadiusM: 0.42,
  minLifeSeconds: 0.24,
  maxLifeSeconds: 0.46,
  /** Lifted off the ground plane so the ring never z-fights the floor. */
  groundLiftM: 0.02,
} as const);

/**
 * How wet ground reads. Water fills the surface microstructure: the albedo
 * goes DOWN and the roughness goes DOWN too, which is what produces the sheen.
 * Raising roughness with wetness would make wet tarmac chalkier than dry
 * tarmac — the same inversion the reflectionQuality control's description in
 * graphics-settings-registry.ts calls out as "backwards".
 */
export const WETNESS_RESPONSE = Object.freeze({
  /** Albedo multiplier at wetness 1. */
  albedoScaleAtFullWet: 0.58,
  /** Absolute roughness subtracted at wetness 1. */
  roughnessDropAtFullWet: 0.46,
  /** Absolute metalness added at wetness 1 (a thin water film is specular). */
  metalnessLiftAtFullWet: 0.05,
  /** Roughness is never driven below this; a mirror floor reads as a bug. */
  minRoughness: 0.06,
} as const);

export type WetSurfaceResponse = Readonly<{ albedoScale: number; roughness: number; metalness: number }>;

/**
 * Pure wetness response. Kept free of THREE so the material direction is
 * testable without constructing a renderer.
 */
export function wetSurfaceResponse(
  dryRoughness: number,
  dryMetalness: number,
  wetness: number,
): WetSurfaceResponse {
  const wet = clamp01(wetness);
  const roughness = Math.max(
    WETNESS_RESPONSE.minRoughness,
    dryRoughness - WETNESS_RESPONSE.roughnessDropAtFullWet * wet,
  );
  return Object.freeze({
    albedoScale: 1 - (1 - WETNESS_RESPONSE.albedoScaleAtFullWet) * wet,
    roughness,
    metalness: Math.min(1, dryMetalness + WETNESS_RESPONSE.metalnessLiftAtFullWet * wet),
  });
}

/**
 * Bypass reasons, matching atmosphere-system.ts atmosphereBypassReason exactly.
 * The compat/WebGL2 route and software renderers get NO rain rather than a
 * degraded rain — the same call bloomQuality and ambientOcclusion make when
 * they resolve to 'off' on the compat preset. Rain is presentation-only, so
 * dropping it changes nothing a peer can observe in gameplay state.
 */
export function rainBypassReason(profile: RenderProfile, rendererLabel: string, query: string | null): string | null {
  if (query === 'off') return 'query-disabled';
  if (profile === 'compat') return 'compat-profile';
  if (isSoftwareWebGLRenderer(rendererLabel) && query !== 'on') return 'software-renderer';
  return null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function hash32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function unit(hash: number): number {
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * Maps `value` into [low, high). The toroidal wrap the whole design rests on:
 * a drop that leaves one face of the volume re-enters through the opposite one,
 * which is why nothing is ever spawned or destroyed.
 */
function wrapRange(value: number, low: number, high: number): number {
  const span = high - low;
  return value - Math.floor((value - low) / span) * span;
}

/**
 * Vertical rain streak: a bright core that tapers at both ends with soft
 * horizontal shoulders. Computed, not loaded — the repo ships no image assets,
 * and a DataTexture also means no DOM, so this constructs under test.
 */
function createStreakTexture(): THREE.DataTexture {
  const width = 8;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    // Taper hard at the leading end, gently at the trailing end: a falling
    // drop's smear is brighter where it has just been.
    const along = Math.sin(Math.PI * v) ** 0.65 * (0.55 + 0.45 * v);
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const across = Math.cos(Math.PI * (u - 0.5)) ** 2.2;
      const alpha = clamp01(along * across);
      const index = (y * width + x) * 4;
      data[index] = 226;
      data[index + 1] = 238;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'pass76-rain-streak-procedural';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Splash ring impostor: a soft annulus, empty in the middle. */
function createSplashRingTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const radius = Math.hypot(dx, dy) * 2;
      const ring = Math.exp(-(((radius - 0.74) / 0.16) ** 2));
      const alpha = radius > 1 ? 0 : clamp01(ring);
      const index = (y * size + x) * 4;
      data[index] = 236;
      data[index + 1] = 246;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'pass76-rain-splash-ring-procedural';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export type RainPresentationOptions = Readonly<{
  profile: RenderProfile;
  rendererLabel: string;
  /** `?rain=` override, mirroring the atmosphere query guard. */
  query?: string | null;
  quality?: RainQualityTier;
  /** Seeds drop scatter. Visual only, but seeded so replays/tests match. */
  seed?: number;
}>;

export type RainUpdateOptions = Readonly<{
  /** 0..1 from weaponView.adsProgress(). Drives the aim-axis clearance. */
  adsProgress?: number;
  /** World Y the splash rings sit on. */
  groundY?: number;
  /** Adaptive-quality density trim, 0..1. */
  densityScale?: number;
}>;

export type RainTelemetry = Readonly<{
  pass: 76;
  enabled: boolean;
  bypassReason: string | null;
  profile: RenderProfile;
  quality: RainQualityTier;
  /** Instanced draws submitted. Two is the design ceiling. */
  instancedDraws: number;
  /** Non-instanced meshes under the root. Must be zero. */
  looseMeshes: number;
  streakInstances: number;
  splashInstances: number;
  streakOpacity: number;
  wetness: number;
  wetSurfaces: number;
  rainRate: number;
  windSpeed: number;
  perFrameAllocations: 0;
}>;

type DrySurfaceSnapshot = Readonly<{ color: THREE.Color; roughness: number; metalness: number }>;

/**
 * Two instanced draws, a camera-riding volume, and a wetness parameter.
 * Lifecycle mirrors the other scene systems: construct, build(scene) once the
 * scene exists, update() per frame, dispose() on arena retirement.
 */
export class RainPresentation {
  readonly root = new THREE.Group();

  private readonly bypass: string | null;
  private readonly profile: RenderProfile;
  private readonly seed: number;
  private quality: RainQualityTier;

  private streaks: THREE.InstancedMesh | null = null;
  private splashes: THREE.InstancedMesh | null = null;
  private streakGeometry: THREE.PlaneGeometry | null = null;
  private splashGeometry: THREE.PlaneGeometry | null = null;
  private streakMaterial: THREE.MeshBasicMaterial | null = null;
  private splashMaterial: THREE.MeshBasicMaterial | null = null;
  private streakTexture: THREE.DataTexture | null = null;
  private splashTexture: THREE.DataTexture | null = null;

  // Drop state, world space. Parallel arrays rather than objects: this is the
  // only per-frame hot loop in the module and it must not allocate.
  private readonly dropX = new Float32Array(RAIN_MAX_STREAKS);
  private readonly dropY = new Float32Array(RAIN_MAX_STREAKS);
  private readonly dropZ = new Float32Array(RAIN_MAX_STREAKS);
  private readonly dropFall = new Float32Array(RAIN_MAX_STREAKS);
  private readonly dropShear = new Float32Array(RAIN_MAX_STREAKS);

  private readonly splashX = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashZ = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashAge = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashLife = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashCycle = new Uint32Array(RAIN_MAX_SPLASHES);

  private readonly wetSurfaces = new Map<THREE.MeshStandardMaterial, DrySurfaceSnapshot>();

  // Scratch. Reused every frame so telemetry can honestly report zero
  // per-frame allocations, the same claim AtmosphereSystem makes.
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchCameraPosition = new THREE.Vector3();
  private readonly scratchForward = new THREE.Vector3();
  private readonly scratchRelative = new THREE.Vector3();
  private readonly scratchAxis = new THREE.Vector3();
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchNormal = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();
  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  private built = false;
  private disposed = false;
  private centred = false;
  private streakInstances = 0;
  private splashInstances = 0;
  private wetness = 0;
  private rainRate = 0;
  private windSpeed = 0;

  constructor(options: RainPresentationOptions) {
    this.profile = options.profile;
    this.quality = options.quality ?? 'high';
    this.seed = Math.trunc(finite(options.seed ?? 0, 0)) >>> 0;
    this.bypass = rainBypassReason(options.profile, options.rendererLabel, options.query ?? null);
    this.root.name = 'pass76-weather-rain';
    // The batcher must never touch this root: its children are InstancedMeshes
    // and batching one collapses every instance to a single stray at the origin.
    this.root.userData.dynamic = true;
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.seedDrops();
  }

  /** Deterministic scatter. No Math.random anywhere in the module. */
  private seedDrops(): void {
    const root = hash32(this.seed ^ 0x77616574);
    for (let index = 0; index < RAIN_MAX_STREAKS; index += 1) {
      const base = hash32(root ^ Math.imul(index + 1, 0x9e3779b9));
      this.dropX[index] = (unit(base) * 2 - 1) * RAIN_VOLUME.radiusM;
      this.dropY[index] = unit(hash32(base ^ 0x2545f491)) * (RAIN_VOLUME.aboveM + RAIN_VOLUME.belowM) - RAIN_VOLUME.belowM;
      this.dropZ[index] = (unit(hash32(base ^ 0x85ebca6b)) * 2 - 1) * RAIN_VOLUME.radiusM;
      this.dropFall[index] = RAIN_STREAK.minFallSpeedMps
        + unit(hash32(base ^ 0xc2b2ae35)) * (RAIN_STREAK.maxFallSpeedMps - RAIN_STREAK.minFallSpeedMps);
      // A little per-drop shear spread: perfectly parallel rain looks printed.
      this.dropShear[index] = 0.85 + unit(hash32(base ^ 0x27d4eb2f)) * 0.3;
    }
    for (let index = 0; index < RAIN_MAX_SPLASHES; index += 1) {
      this.splashCycle[index] = 0;
      this.respawnSplash(index, 0, 0);
      // Stagger the opening ages so the first frame is not one synchronised
      // ring pulse across the whole floor.
      this.splashAge[index] = unit(hash32(root ^ Math.imul(index + 1, 0x165667b1))) * this.splashLife[index];
    }
  }

  private respawnSplash(index: number, cameraX: number, cameraZ: number): void {
    this.splashCycle[index] = (this.splashCycle[index] + 1) >>> 0;
    const base = hash32(hash32(this.seed ^ 0x53504c53) ^ Math.imul(index + 1, 0x9e3779b9) ^ Math.imul(this.splashCycle[index], 0x85ebca6b));
    const angle = unit(base) * Math.PI * 2;
    // sqrt keeps the scatter area-uniform instead of piling rings on the player.
    const radius = Math.sqrt(unit(hash32(base ^ 0xc2b2ae35))) * RAIN_SPLASH.scatterRadiusM;
    this.splashX[index] = cameraX + Math.cos(angle) * radius;
    this.splashZ[index] = cameraZ + Math.sin(angle) * radius;
    this.splashAge[index] = 0;
    this.splashLife[index] = RAIN_SPLASH.minLifeSeconds
      + unit(hash32(base ^ 0x27d4eb2f)) * (RAIN_SPLASH.maxLifeSeconds - RAIN_SPLASH.minLifeSeconds);
  }

  /** Builds the two instanced draws and attaches the root. Idempotent. */
  build(scene: THREE.Object3D): void {
    if (this.built || this.disposed) return;
    this.built = true;
    if (this.bypass) {
      // Attach the (empty) root anyway so arena teardown has one thing to find
      // whether or not rain was admitted, exactly like AtmosphereSystem.
      scene.add(this.root);
      return;
    }

    this.streakTexture = createStreakTexture();
    this.streakGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.streakGeometry.name = 'pass76-rain-streak-quad';
    this.streakMaterial = new THREE.MeshBasicMaterial({
      name: 'pass76-rain-streak',
      map: this.streakTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
    });
    const streaks = new THREE.InstancedMesh(this.streakGeometry, this.streakMaterial, RAIN_MAX_STREAKS);
    streaks.name = 'pass76-rain-streaks';
    streaks.count = 0;
    // The volume rides the camera, so it is always on screen; culling it costs
    // a bounds test that can only ever answer "visible".
    streaks.frustumCulled = false;
    streaks.castShadow = false;
    streaks.receiveShadow = false;
    streaks.renderOrder = 12;
    streaks.userData.presentationOnly = true;
    streaks.userData.blocksShots = false;
    streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.streaks = streaks;
    this.root.add(streaks);

    this.splashTexture = createSplashRingTexture();
    this.splashGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    // Baked flat at build time so per-instance matrices stay scale+translate.
    this.splashGeometry.rotateX(-Math.PI / 2);
    this.splashGeometry.name = 'pass76-rain-splash-quad';
    this.splashMaterial = new THREE.MeshBasicMaterial({
      name: 'pass76-rain-splash-ring',
      map: this.splashTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // A splash is a specular highlight on wet ground, so it adds light. It is
      // capped hard (splashMaxOpacity) precisely because additive cannot be
      // allowed to bloom out a bright floor.
      blending: THREE.AdditiveBlending,
      fog: true,
      toneMapped: true,
    });
    const splashes = new THREE.InstancedMesh(this.splashGeometry, this.splashMaterial, RAIN_MAX_SPLASHES);
    splashes.name = 'pass76-rain-splashes';
    splashes.count = 0;
    splashes.frustumCulled = false;
    splashes.castShadow = false;
    splashes.receiveShadow = false;
    splashes.renderOrder = 11;
    splashes.userData.presentationOnly = true;
    splashes.userData.blocksShots = false;
    splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    splashes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RAIN_MAX_SPLASHES * 3), 3);
    splashes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.splashes = splashes;
    this.root.add(splashes);

    scene.add(this.root);
  }

  setQuality(quality: RainQualityTier): void {
    this.quality = quality;
  }

  /**
   * Ground materials that should darken and gloss with rain. Their dry values
   * are snapshotted here and restored on dispose, so a wet arena that is torn
   * down never leaves a permanently dark material behind in a shared cache.
   */
  registerWetSurface(material: THREE.MeshStandardMaterial): void {
    if (this.disposed || this.wetSurfaces.has(material)) return;
    this.wetSurfaces.set(material, Object.freeze({
      color: material.color.clone(),
      roughness: material.roughness,
      metalness: material.metalness,
    }));
  }

  /** Restores every registered surface to its dry values and forgets them. */
  clearWetSurfaces(): void {
    for (const [material, dry] of this.wetSurfaces) {
      material.color.copy(dry.color);
      material.roughness = dry.roughness;
      material.metalness = dry.metalness;
    }
    this.wetSurfaces.clear();
  }

  private applyWetness(wetness: number): void {
    for (const [material, dry] of this.wetSurfaces) {
      const response = wetSurfaceResponse(dry.roughness, dry.metalness, wetness);
      material.color.copy(dry.color).multiplyScalar(response.albedoScale);
      material.roughness = response.roughness;
      material.metalness = response.metalness;
    }
  }

  /**
   * One frame. `weather` and `wind` come straight from weather-state.ts and
   * wind-field.ts — this class never decides what the weather is, it only
   * draws it.
   */
  update(
    dt: number,
    camera: THREE.Camera,
    weather: WeatherSample,
    wind: WindSample,
    options: RainUpdateOptions = {},
  ): void {
    if (this.disposed) return;
    this.wetness = clamp01(finite(weather.wetness, 0));
    this.rainRate = clamp01(finite(weather.rainRate, 0));
    this.windSpeed = Math.max(0, finite(wind.speed, 0));
    // Wetness outlives the rain by design, so it is applied even when the
    // streak pass is bypassed or the sky has already cleared.
    this.applyWetness(this.wetness);

    const streaks = this.streaks;
    const splashes = this.splashes;
    if (!streaks || !splashes || !this.streakMaterial || !this.splashMaterial) return;

    // A hidden tab hands back a multi-second dt; letting that through would
    // teleport every drop through the floor in one step.
    const step = Math.min(0.1, Math.max(0, finite(dt, 0)));
    const density = clamp01(finite(options.densityScale ?? 1, 1));
    const ads = clamp01(finite(options.adsProgress ?? 0, 0));
    const groundY = finite(options.groundY ?? 0, 0);
    const budget = RAIN_BUDGET[this.quality];

    camera.getWorldPosition(this.scratchCameraPosition);
    camera.getWorldDirection(this.scratchForward);
    const cameraX = this.scratchCameraPosition.x;
    const cameraY = this.scratchCameraPosition.y;
    const cameraZ = this.scratchCameraPosition.z;

    if (!this.centred) {
      // First frame: the seeded scatter is around the origin, so slide it onto
      // the camera before anything integrates. Without this the player spawns
      // in a hole in the rain.
      for (let index = 0; index < RAIN_MAX_STREAKS; index += 1) {
        this.dropX[index] += cameraX;
        this.dropY[index] += cameraY;
        this.dropZ[index] += cameraZ;
      }
      for (let index = 0; index < RAIN_MAX_SPLASHES; index += 1) {
        this.splashX[index] += cameraX;
        this.splashZ[index] += cameraZ;
      }
      this.centred = true;
    }

    const targetStreaks = Math.min(budget.streaks, Math.round(budget.streaks * this.rainRate * density));
    const targetSplashes = Math.min(budget.splashes, Math.round(budget.splashes * this.rainRate * density));
    this.streakInstances = targetStreaks;
    this.splashInstances = targetSplashes;
    streaks.count = targetStreaks;
    splashes.count = targetSplashes;

    const opacityRamp = RAIN_READABILITY.minOpacityFraction
      + (1 - RAIN_READABILITY.minOpacityFraction) * this.rainRate;
    const adsScale = 1 - (1 - RAIN_READABILITY.adsOpacityScale) * ads;
    this.streakMaterial.opacity = Math.min(
      RAIN_READABILITY.maxOpacity,
      RAIN_READABILITY.maxOpacity * opacityRamp,
    ) * adsScale;
    this.splashMaterial.opacity = RAIN_READABILITY.splashMaxOpacity * this.rainRate * adsScale;

    if (targetStreaks > 0) {
      this.updateStreaks(streaks, step, cameraX, cameraY, cameraZ, wind, ads, targetStreaks);
    }
    if (targetSplashes > 0) {
      this.updateSplashes(splashes, step, cameraX, cameraZ, groundY, targetSplashes);
    }
  }

  private updateStreaks(
    streaks: THREE.InstancedMesh,
    step: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    wind: WindSample,
    ads: number,
    count: number,
  ): void {
    // Heavier rain falls faster; drizzle hangs. Scales the per-drop terminal
    // speed rather than replacing it, so the spread survives.
    const fallScale = 0.75 + 0.45 * this.rainRate;
    const windX = finite(wind.x, 0) * RAIN_STREAK.windShear;
    const windZ = finite(wind.z, 0) * RAIN_STREAK.windShear;
    const clearRadius = RAIN_READABILITY.adsClearRadiusM * ads;
    const clearRadiusSquared = clearRadius * clearRadius;
    const nearCullSquared = RAIN_READABILITY.nearCullM * RAIN_READABILITY.nearCullM;

    for (let index = 0; index < count; index += 1) {
      const shear = this.dropShear[index];
      const driftX = windX * shear;
      const driftZ = windZ * shear;
      const fall = this.dropFall[index] * fallScale;

      let x = this.dropX[index] + driftX * step;
      let y = this.dropY[index] - fall * step;
      let z = this.dropZ[index] + driftZ * step;

      // Toroidal wrap in camera-local space: this is what keeps the rain dense
      // around the player forever without a single spawn or despawn.
      const relX = wrapRange(x - cameraX, -RAIN_VOLUME.radiusM, RAIN_VOLUME.radiusM);
      const relZ = wrapRange(z - cameraZ, -RAIN_VOLUME.radiusM, RAIN_VOLUME.radiusM);
      const relY = wrapRange(y - cameraY, -RAIN_VOLUME.belowM, RAIN_VOLUME.aboveM);
      x = cameraX + relX;
      y = cameraY + relY;
      z = cameraZ + relZ;
      this.dropX[index] = x;
      this.dropY[index] = y;
      this.dropZ[index] = z;

      const distanceSquared = relX * relX + relY * relY + relZ * relZ;
      if (distanceSquared < nearCullSquared) {
        streaks.setMatrixAt(index, this.zeroMatrix);
        continue;
      }
      if (clearRadius > 0) {
        // Empty a cylinder along the aim axis so ADS never loses a target
        // behind a drop the player is looking straight through.
        const forwardDistance = relX * this.scratchForward.x
          + relY * this.scratchForward.y
          + relZ * this.scratchForward.z;
        if (forwardDistance > 0.2 && forwardDistance < RAIN_READABILITY.adsClearRangeM) {
          const perpendicularSquared = distanceSquared - forwardDistance * forwardDistance;
          if (perpendicularSquared < clearRadiusSquared) {
            streaks.setMatrixAt(index, this.zeroMatrix);
            continue;
          }
        }
      }

      // Axis billboard: long axis along the true velocity, spun about that axis
      // to face the camera.
      this.scratchAxis.set(driftX, -fall, driftZ);
      const speed = this.scratchAxis.length();
      if (speed < 1e-4) {
        streaks.setMatrixAt(index, this.zeroMatrix);
        continue;
      }
      this.scratchAxis.multiplyScalar(1 / speed);
      this.scratchRelative.set(relX, relY, relZ);
      this.scratchRight.crossVectors(this.scratchAxis, this.scratchRelative);
      const rightLength = this.scratchRight.length();
      if (rightLength < 1e-5) {
        // Drop sits exactly on the view axis; any perpendicular will do.
        this.scratchRight.set(1, 0, 0).cross(this.scratchAxis);
        if (this.scratchRight.lengthSq() < 1e-8) this.scratchRight.set(0, 0, 1).cross(this.scratchAxis);
        this.scratchRight.normalize();
      } else {
        this.scratchRight.multiplyScalar(1 / rightLength);
      }
      this.scratchNormal.crossVectors(this.scratchRight, this.scratchAxis).normalize();

      const length = Math.min(
        RAIN_STREAK.maxLengthM,
        Math.max(RAIN_STREAK.minLengthM, speed * RAIN_STREAK.smearSeconds),
      );
      this.scratchRight.multiplyScalar(RAIN_STREAK.widthM);
      this.scratchAxis.multiplyScalar(length);
      this.scratchMatrix.makeBasis(this.scratchRight, this.scratchAxis, this.scratchNormal);
      this.scratchMatrix.setPosition(x, y, z);
      streaks.setMatrixAt(index, this.scratchMatrix);
    }
    streaks.instanceMatrix.needsUpdate = true;
  }

  private updateSplashes(
    splashes: THREE.InstancedMesh,
    step: number,
    cameraX: number,
    cameraZ: number,
    groundY: number,
    count: number,
  ): void {
    const instanceColor = splashes.instanceColor;
    for (let index = 0; index < count; index += 1) {
      this.splashAge[index] += step;
      if (this.splashAge[index] >= this.splashLife[index]) this.respawnSplash(index, cameraX, cameraZ);
      const life = Math.max(1e-3, this.splashLife[index]);
      const progress = clamp01(this.splashAge[index] / life);
      // Rings open fast then ease, and fade on a square so the tail is quiet.
      const radius = RAIN_SPLASH.minRadiusM
        + (RAIN_SPLASH.maxRadiusM - RAIN_SPLASH.minRadiusM) * Math.sqrt(progress);
      const fade = (1 - progress) * (1 - progress);
      this.scratchMatrix.makeScale(radius, 1, radius);
      this.scratchMatrix.setPosition(
        this.splashX[index],
        groundY + RAIN_SPLASH.groundLiftM,
        this.splashZ[index],
      );
      splashes.setMatrixAt(index, this.scratchMatrix);
      if (instanceColor) {
        this.scratchColor.setScalar(fade);
        instanceColor.setXYZ(index, this.scratchColor.r, this.scratchColor.g, this.scratchColor.b);
      }
    }
    splashes.instanceMatrix.needsUpdate = true;
    if (instanceColor) instanceColor.needsUpdate = true;
  }

  /** Context loss reuploads the instance buffers, mirroring AtmosphereSystem. */
  handleContextRestored(): void {
    if (this.streaks) this.streaks.instanceMatrix.needsUpdate = true;
    if (this.splashes) {
      this.splashes.instanceMatrix.needsUpdate = true;
      if (this.splashes.instanceColor) this.splashes.instanceColor.needsUpdate = true;
    }
    if (this.streakMaterial) this.streakMaterial.needsUpdate = true;
    if (this.splashMaterial) this.splashMaterial.needsUpdate = true;
  }

  telemetry(): RainTelemetry {
    let instancedDraws = 0;
    let looseMeshes = 0;
    for (const child of this.root.children) {
      if ((child as THREE.InstancedMesh).isInstancedMesh) instancedDraws += 1;
      else if ((child as THREE.Mesh).isMesh) looseMeshes += 1;
    }
    return {
      pass: 76,
      enabled: this.streaks !== null,
      bypassReason: this.bypass,
      profile: this.profile,
      quality: this.quality,
      instancedDraws,
      looseMeshes,
      streakInstances: this.streakInstances,
      splashInstances: this.splashInstances,
      streakOpacity: this.streakMaterial?.opacity ?? 0,
      wetness: this.wetness,
      wetSurfaces: this.wetSurfaces.size,
      rainRate: this.rainRate,
      windSpeed: this.windSpeed,
      perFrameAllocations: 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearWetSurfaces();
    this.root.removeFromParent();
    this.root.clear();
    this.streakGeometry?.dispose();
    this.splashGeometry?.dispose();
    this.streakMaterial?.dispose();
    this.splashMaterial?.dispose();
    this.streakTexture?.dispose();
    this.splashTexture?.dispose();
    this.streaks = null;
    this.splashes = null;
    this.streakGeometry = null;
    this.splashGeometry = null;
    this.streakMaterial = null;
    this.splashMaterial = null;
    this.streakTexture = null;
    this.splashTexture = null;
  }
}
