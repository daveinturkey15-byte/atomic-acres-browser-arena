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
import {
  activeWeatherPresentation,
  advanceWeatherOverrideClock,
  type WeatherPresentationRuntime,
} from './weather-settings';
import type { WindSample } from './wind-field';

export type RainQualityTier = 'low' | 'high' | 'ultra';

export type RainBudget = Readonly<{ streaks: number; splashes: number }>;

/**
 * Instance ceilings per quality tier.
 *
 * PASS 78 RAISED THESE, WITH A MEASUREMENT RATHER THAN A HUNCH. The Pass 76
 * figures (260/760/1400) were set against an unmeasured worry that more drops
 * would cost readability. They did not: a live WebGPU capture of `?weather=
 * storm` on high-seas at 760 streaks and the full 0.34 opacity measured
 * `sightlineObscuration` at 1.47% against a 5% ceiling, i.e. the old budget was
 * spending a third of the readability envelope and shipping a storm that read
 * as drizzle.
 *
 * The new figures keep the arithmetic proof intact - `assertRainCombatSafety`
 * evaluates the WORST case, the ultra ceiling at the opacity ceiling, and
 * throws at construction if it ever leaves the envelope - while giving the
 * heavy states enough drops to actually read as weather. The gust sheets then
 * remove a further tenth or so on top, so the drawn figure is below the proven
 * one at every density.
 */
export const RAIN_BUDGET: Readonly<Record<RainQualityTier, RainBudget>> = Object.freeze({
  low: Object.freeze({ streaks: 420, splashes: 32 }),
  high: Object.freeze({ streaks: 1300, splashes: 72 }),
  ultra: Object.freeze({ streaks: 2000, splashes: 120 }),
});

/** Tiers mild-first. The promotion walk in `effectiveBudget` reads this. */
const RAIN_TIER_ORDER: readonly RainQualityTier[] = Object.freeze(['low', 'high', 'ultra']);

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

/**
 * DEPTH STRATIFICATION — Pass 78.
 *
 * Rain where every drop is the same size reads as a flat overlay pasted on the
 * lens, which is exactly the note the owner audit left. Real rain has a near
 * layer of fat bright streaks and a far layer that dissolves into haze, and the
 * cue the eye uses for that is SIZE VARIANCE, not count.
 *
 * Each drop draws one size class from its seed and keeps it for the whole
 * match, so the volume has structure that survives the toroidal wrap: a fat
 * drop stays fat when it re-enters through the ceiling.
 */
export const RAIN_STRATA = Object.freeze({
  /** Thinnest, shortest drop. Reads as distant haze. */
  minSizeScale: 0.55,
  /** Fattest, longest drop. Reads as a near streak. */
  maxSizeScale: 1.5,
  /** Bias toward the thin end: a volume of fat drops is a curtain, not rain. */
  distributionExponent: 1.8,
} as const);

/**
 * GUST SHEETS — Pass 78.
 *
 * The single biggest reason rain reads as an overlay is that its density is
 * uniform: every square metre of the volume has the same number of drops
 * forever, so there is nothing for the eye to track. Real rain arrives in
 * SHEETS that travel downwind, and a squall is mostly the gaps between them.
 *
 * The sheet field is two incommensurate spatial bands read along the wind
 * bearing and advected by a phase accumulated from `windSpeed * dt`. Advecting
 * by accumulated speed rather than by `time * windSpeed` is what keeps the
 * sheets from jumping when the gust envelope changes: the phase is continuous
 * across a speed change, which a product of time and speed is not.
 *
 * Drops in a deep trough are culled outright rather than dimmed. That is both
 * the honest look (a gap between sheets is empty air) and a real fill-rate
 * saving at the top of the density slider.
 */
export const RAIN_SHEETS = Object.freeze({
  /** Radians of phase per metre along the wind bearing. ~26 m per sheet. */
  spatialFrequency: 0.24,
  /** Second band, deliberately irrational against the first so they never
   *  repeat into a travelling stripe — the same argument wind-field.ts makes
   *  for its gust periods. */
  secondBandRatio: Math.SQRT2 * 1.31,
  /** Share of the sheet signal carried by the long band. */
  primaryWeight: 0.62,
  /** Metres of sheet travel per metre of wind travel. */
  travelFraction: 0.85,
  /**
   * Trough depth in a full gust. This has to be deep enough that the trough
   * actually falls under `cullBelow`, or the sheets are a brightness ripple
   * rather than structure: 1 - gustDepth is the floor of the local density, so
   * anything shallower than that can never carve a gap at all.
   */
  gustDepth: 0.9,
  /** Trough depth at a dead lull. Still air thins, it never tears holes. */
  calmDepth: 0.3,
  /** Below this local density a drop is culled rather than drawn thin. */
  cullBelow: 0.18,
} as const);

/**
 * LIGHTNING PRESENTATION — Pass 78.
 *
 * The schedule, the cap and the thunder timing all live in weather-state.ts;
 * this is only how a flash is drawn. Two channels, both bounded:
 *
 *   1. A hemisphere light under this system's own root. It is added ONCE at
 *      build with `intensity = 0` and never added or removed again, so a flash
 *      is a uniform write and can never trigger a pipeline rebuild mid-match.
 *      Hemisphere, not directional: a strike lights the whole sky, and a
 *      hemisphere light casts no shadows, so it adds no shadow-map cost and
 *      cannot move a single existing shadow.
 *   2. A lift on the rain's own BRIGHTNESS, because the thing a flash most
 *      obviously lights up is the rain in front of you.
 *
 * WHY BRIGHTNESS AND NOT OPACITY. The first build of this lifted the streak
 * material's opacity, and a live capture showed why that was wrong twice over:
 * heavy rain already sits ON the 0.34 opacity ceiling, so the lift was clamped
 * straight back off in exactly the states lightning exists in - a dead knob -
 * and raising alpha is the one thing that WOULD have cost readability, because
 * alpha is what attenuates the target behind the streak. Colour is not: with
 * ordinary source-alpha blending the background is attenuated by alpha alone,
 * so a brighter streak adds light without occluding anything further.
 *
 * COMBAT SAFETY. Both channels only ever ADD light, both are capped, and the
 * flash cannot outlast WEATHER_LIGHTNING.flashSeconds. A hemisphere light lifts
 * the target and its background together, so contrast survives; measured on a
 * live WebGPU capture, lit geometry rose 2.6% at a 0.245 flash, and the sky
 * dome - which is unlit background - did not move at all. Nothing darkens, so
 * no silhouette that renders today can be lost to a strike.
 */
export const RAIN_LIGHTNING = Object.freeze({
  /**
   * Peak added hemisphere intensity at flash 1. Authored arena hemisphere
   * intensities run 0.55-1.05, so this is about 1.5x one arena's ambient,
   * added for at most a quarter of a second.
   */
  peakLightIntensity: 1.6,
  /** Cool white from above, near-black from below: a sky flash, not a lamp. */
  skyColor: 0xdfe9ff,
  groundColor: 0x0a0d14,
  /** Streak colour multiplier added at flash 1. Alpha is never touched. */
  streakBrightnessLift: 0.85,
  /** Splash rings are additive, so they take the same lift directly. */
  splashBrightnessLift: 0.5,
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
  /**
   * Fallback floor height, as a drop below the camera. The frame loop passes no
   * `groundY`, so every ring used to sit on world y=0 - which on a ship's deck
   * or any raised arena floor is UNDER the geometry, i.e. the splash pass was
   * running its whole budget somewhere nobody could see it. Standing eye height
   * is the cheapest honest estimate of the surface the player is standing on
   * and it needs no collision query.
   */
  assumedEyeHeightM: 1.7,
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

/**
 * COMBAT SAFETY, AS ARITHMETIC.
 *
 * The opacity ceiling bounds one streak. What actually decides whether a torso
 * at 30 m is still readable is the EXPECTED FRACTION OF A SIGHTLINE the whole
 * volume removes, and that is a number, not an opinion:
 *
 *   coverage = numberDensity x projectedStreakArea x pathLength x opacity
 *
 * The camera-riding volume is the only rain that exists, so the path length a
 * sightline can spend inside rain is bounded by the volume's own footprint —
 * a target beyond it is seen through no rain at all. Streaks are billboarded
 * to face the camera, so their projected area is width x length at the
 * fattest size class.
 *
 * The sheet field only ever removes drops, so the real figure is below this.
 */
export function rainSightlineObscuration(streaks: number, opacity: number): number {
  const volumeM3 = (2 * RAIN_VOLUME.radiusM) ** 2 * (RAIN_VOLUME.aboveM + RAIN_VOLUME.belowM);
  const numberDensity = Math.max(0, streaks) / volumeM3;
  const projectedAreaM2 = RAIN_STREAK.widthM * RAIN_STREAK.maxLengthM * RAIN_STRATA.maxSizeScale;
  const pathM = 2 * RAIN_VOLUME.radiusM;
  return Math.min(1, numberDensity * projectedAreaM2 * pathM * Math.max(0, opacity));
}

/**
 * The bound this lane enforces: at the maximum shipped weather settings, rain
 * may remove at most 5% of the light along a sightline through the whole
 * volume. Everything else — the aim-cylinder clearance, the lens cull, the
 * authored shortness of heavy states — sits on top of this, not instead of it.
 */
export const RAIN_MAX_SIGHTLINE_OBSCURATION = 0.05;

/**
 * Fails closed, in the shape `assertDepthOfFieldCombatSafety` uses: the bound
 * is a build failure rather than a comment. Called at construction, so a
 * density or geometry edit that breaks readability cannot reach a match.
 */
export function assertRainCombatSafety(): void {
  const worst = rainSightlineObscuration(RAIN_MAX_STREAKS, RAIN_READABILITY.maxOpacity);
  if (worst > RAIN_MAX_SIGHTLINE_OBSCURATION) {
    throw new Error(
      `Rain readability failed closed: worst-case sightline obscuration ${(worst * 100).toFixed(2)}% `
      + `exceeds the ${(RAIN_MAX_SIGHTLINE_OBSCURATION * 100).toFixed(0)}% ceiling`,
    );
  }
  if (RAIN_READABILITY.maxOpacity > 0.4) {
    throw new Error(`Rain streak opacity ceiling left the readability envelope: ${RAIN_READABILITY.maxOpacity}`);
  }
}

/** Ceiling on materials the scene scan may adopt. A bound, not a hope. */
export const WETNESS_MAX_ADOPTED_SURFACES = 128;

/** Seconds between scene scans while the ground is wet. */
export const WETNESS_SCAN_SECONDS = 2.5;

/** Below this wetness nothing is scanned and nothing is written. */
export const WETNESS_SCAN_FLOOR = 0.02;

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
  /**
   * The player's weather settings. Omitted means "read the published runtime",
   * which is how the running game gets them without the frame loop knowing
   * this system has settings at all; tests pass one explicitly and never touch
   * the latch. See weather-settings.ts.
   */
  presentation?: WeatherPresentationRuntime;
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
  /** Surfaces adopted by the scene scan rather than registered by a caller. */
  autoAdoptedWetSurfaces: number;
  rainRate: number;
  windSpeed: number;
  /** The player's resolved weather settings, so a receipt can show them. */
  weatherIntensity: WeatherPresentationRuntime['intensity'];
  rainDensity: number;
  windStrength: number;
  lightningEnabled: boolean;
  /** 0..1 flash currently being drawn, and the strike it belongs to. */
  lightningFlash: number;
  lightningStrikeIndex: number;
  /** Expected fraction of a sightline the current rain removes. */
  sightlineObscuration: number;
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
  /** Per-drop size class. Drawn once from the seed and never re-rolled. */
  private readonly dropSize = new Float32Array(RAIN_MAX_STREAKS);

  private readonly splashX = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashZ = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashAge = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashLife = new Float32Array(RAIN_MAX_SPLASHES);
  private readonly splashCycle = new Uint32Array(RAIN_MAX_SPLASHES);

  private readonly wetSurfaces = new Map<THREE.MeshStandardMaterial, DrySurfaceSnapshot>();
  private sceneRoot: THREE.Object3D | null = null;
  private autoAdopted = 0;
  private wetScanCountdown = 0;
  private flashLight: THREE.HemisphereLight | null = null;
  /** Advected sheet phase (rad). Accumulated from speed, never from raw time. */
  private sheetPhase = 0;

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
  private lightningFlash = 0;
  private lightningStrikeIndex = -1;
  private presentation: WeatherPresentationRuntime = activeWeatherPresentation();

  constructor(options: RainPresentationOptions) {
    this.profile = options.profile;
    this.quality = options.quality ?? 'high';
    this.seed = Math.trunc(finite(options.seed ?? 0, 0)) >>> 0;
    this.bypass = rainBypassReason(options.profile, options.rendererLabel, options.query ?? null);
    // The readability bound is arithmetic, so it is checked here rather than
    // trusted: a geometry or budget edit that breaks it cannot reach a match.
    assertRainCombatSafety();
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
      // Size class, biased toward the thin end so the volume has far more haze
      // than curtain. Same seed, same class, for the whole match.
      const sizeRoll = unit(hash32(base ^ 0x1b873593)) ** RAIN_STRATA.distributionExponent;
      this.dropSize[index] = RAIN_STRATA.minSizeScale
        + sizeRoll * (RAIN_STRATA.maxSizeScale - RAIN_STRATA.minSizeScale);
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
    this.sceneRoot = scene;
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

    // Added ONCE, at zero intensity, before any arena material compiles. From
    // here on a flash is a uniform write on an already-built light, which is
    // why lightning cannot cause a mid-match pipeline rebuild. It goes in LAST
    // so the two instanced draws stay the first two children - the batcher and
    // the telemetry census both walk this root.
    const flashLight = new THREE.HemisphereLight(RAIN_LIGHTNING.skyColor, RAIN_LIGHTNING.groundColor, 0);
    flashLight.name = 'pass78-weather-lightning-flash';
    flashLight.userData.presentationOnly = true;
    this.flashLight = flashLight;
    this.root.add(flashLight);

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

  /**
   * Adopts the arena's own world surfaces so wetness actually reaches the
   * picture.
   *
   * WHY A SCAN. `registerWetSurface` shipped with no production caller, which
   * made the whole wetness response dead code: the ground never darkened,
   * however hard it rained. The arena builders do not know this system exists,
   * and the frame loop does not hand it materials, so the only honest way to
   * close that gap from inside this module is to go and find them.
   *
   * WHAT IT WILL TOUCH, AND WHAT IT WILL NOT. Only meshes carrying
   * `userData.impactSurface` — the marker every arena builder already puts on
   * world geometry you can shoot. That is exactly the set that should look wet
   * and it structurally excludes the viewmodel, other players, the HUD and this
   * system's own instanced draws, none of which carry it. Transparent materials
   * are skipped (glass does not soak) and the adopted count is capped.
   *
   * WHEN. Only while the ground is actually wet, and at most once every
   * `WETNESS_SCAN_SECONDS` — a traversal is the same order of cost as
   * `GraphicsRefinementSystem.refine`, which the renderer already runs on every
   * settings apply, but it has no business running every frame.
   */
  adoptWetSurfacesFromScene(root: THREE.Object3D | null = this.sceneRoot): number {
    if (this.disposed || !root) return 0;
    let adopted = 0;
    root.traverse((node) => {
      if (this.wetSurfaces.size >= WETNESS_MAX_ADOPTED_SURFACES) return;
      if (typeof node.userData.impactSurface !== 'string') return;
      const mesh = node as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent) continue;
        if (this.wetSurfaces.has(material)) continue;
        if (this.wetSurfaces.size >= WETNESS_MAX_ADOPTED_SURFACES) break;
        this.registerWetSurface(material);
        adopted += 1;
      }
    });
    this.autoAdopted += adopted;
    return adopted;
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

  /**
   * The instance ceiling actually in force: the pinned tier, or the first tier
   * above it that can hold what the density slider asked for.
   */
  private effectiveBudget(pinned: RainBudget): RainBudget {
    const wanted = pinned.streaks * this.presentation.rainDensity;
    if (wanted <= pinned.streaks) return pinned;
    for (let index = RAIN_TIER_ORDER.indexOf(this.quality) + 1; index < RAIN_TIER_ORDER.length; index += 1) {
      const candidate = RAIN_BUDGET[RAIN_TIER_ORDER[index]];
      if (candidate.streaks >= wanted) return candidate;
    }
    return RAIN_BUDGET.ultra;
  }

  /**
   * Keeps the adopted-surface set fresh without paying for a traversal every
   * frame. Scans only while the ground is wet, at most every
   * WETNESS_SCAN_SECONDS, and once immediately when rain first lands so the
   * first shower of a match does not run dry for two and a half seconds.
   */
  private refreshWetSurfaces(step: number): void {
    if (this.wetness < WETNESS_SCAN_FLOOR || !this.sceneRoot) {
      this.wetScanCountdown = 0;
      return;
    }
    if (this.wetScanCountdown > 0) {
      this.wetScanCountdown -= step;
      return;
    }
    this.wetScanCountdown = WETNESS_SCAN_SECONDS;
    this.adoptWetSurfacesFromScene(this.sceneRoot);
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
    this.presentation = options.presentation ?? activeWeatherPresentation();
    this.wetness = clamp01(finite(weather.wetness, 0));
    this.rainRate = clamp01(finite(weather.rainRate, 0));
    this.windSpeed = Math.max(0, finite(wind.speed, 0));
    this.lightningFlash = this.presentation.lightning ? clamp01(finite(weather.lightning?.flash ?? 0, 0)) : 0;
    this.lightningStrikeIndex = weather.lightning?.strikeIndex ?? -1;
    // A hidden tab hands back a multi-second dt; letting that through would
    // teleport every drop through the floor in one step.
    const step = Math.min(0.1, Math.max(0, finite(dt, 0)));
    // The `?weather=` override has no match clock of its own; this is the one
    // that drives its lightning. Accumulated frame time, never a wall clock.
    advanceWeatherOverrideClock(step);
    // Wetness outlives the rain by design, so it is applied even when the
    // streak pass is bypassed or the sky has already cleared.
    this.refreshWetSurfaces(step);
    this.applyWetness(this.wetness);
    if (this.flashLight) this.flashLight.intensity = this.lightningFlash * RAIN_LIGHTNING.peakLightIntensity;

    const streaks = this.streaks;
    const splashes = this.splashes;
    if (!streaks || !splashes || !this.streakMaterial || !this.splashMaterial) return;

    const density = clamp01(finite(options.densityScale ?? 1, 1)) * this.presentation.rainDensity;
    const ads = clamp01(finite(options.adsProgress ?? 0, 0));
    const pinnedBudget = RAIN_BUDGET[this.quality];
    // A player asking for MORE rain than the authored density is deliberately
    // opting above the tier the caller pinned, so the INSTANCE CEILING may rise
    // to meet them. Without this the top half of the density slider did nothing
    // in heavy rain: the count saturated against a tier chosen before the
    // control existed. The promotion only ever goes upward, only above 1.00x,
    // and never past the ultra ceiling that `assertRainCombatSafety` computes
    // the readability proof at.
    const budget = this.effectiveBudget(pinnedBudget);
    // Sheets are advected by accumulated wind travel. Using time x speed would
    // make the pattern jump backwards whenever the gust envelope eased.
    this.sheetPhase += this.windSpeed * RAIN_SHEETS.travelFraction * RAIN_SHEETS.spatialFrequency * step;

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

    const targetStreaks = Math.min(budget.streaks, Math.round(pinnedBudget.streaks * this.rainRate * density));
    const targetSplashes = Math.min(budget.splashes, Math.round(pinnedBudget.splashes * this.rainRate * density));
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
    // The flash brightens the rain WITHOUT touching alpha, so the readability
    // budget above is untouched by it - see RAIN_LIGHTNING for why that is the
    // only version of this that both works and is safe.
    this.streakMaterial.color.setScalar(1 + this.lightningFlash * RAIN_LIGHTNING.streakBrightnessLift);
    this.splashMaterial.opacity = RAIN_READABILITY.splashMaxOpacity * this.rainRate * adsScale;

    // Resolved AFTER the camera, because the fallback is derived from it.
    const groundY = options.groundY !== undefined
      ? finite(options.groundY, 0)
      : cameraY - RAIN_SPLASH.assumedEyeHeightM;

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
    // Sheet bearing: the direction the gust fronts travel. A dead calm has no
    // bearing to speak of, so fall back to +X and let calmDepth keep the
    // structure shallow.
    const windMagnitude = Math.hypot(finite(wind.x, 0), finite(wind.z, 0));
    const bearingX = windMagnitude > 1e-3 ? finite(wind.x, 0) / windMagnitude : 1;
    const bearingZ = windMagnitude > 1e-3 ? finite(wind.z, 0) / windMagnitude : 0;
    const sheetDepth = RAIN_SHEETS.calmDepth
      + (RAIN_SHEETS.gustDepth - RAIN_SHEETS.calmDepth) * clamp01(finite(wind.gust, 0));
    const secondFrequency = RAIN_SHEETS.spatialFrequency * RAIN_SHEETS.secondBandRatio;
    const secondPhase = this.sheetPhase * RAIN_SHEETS.secondBandRatio;
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

      // Local sheet density. Two incommensurate bands read along the wind
      // bearing: a drop in a trough is not there at all, which is what turns a
      // uniform curtain into rain that arrives in waves.
      const along = relX * bearingX + relZ * bearingZ;
      const primary = Math.sin(along * RAIN_SHEETS.spatialFrequency - this.sheetPhase);
      const secondary = Math.sin(along * secondFrequency - secondPhase + this.dropShear[index]);
      const sheet = (primary * RAIN_SHEETS.primaryWeight + secondary * (1 - RAIN_SHEETS.primaryWeight)) * 0.5 + 0.5;
      const localDensity = 1 - sheetDepth * (1 - sheet);
      if (localDensity < RAIN_SHEETS.cullBelow) {
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

      // Size class and sheet density both act on the streak's footprint rather
      // than on a colour: it keeps every drop on the same stock material and
      // the same two draws, and a thinner streak reads as a dimmer one anyway.
      const sizeScale = this.dropSize[index] * localDensity;
      const length = Math.min(
        RAIN_STREAK.maxLengthM * RAIN_STRATA.maxSizeScale,
        Math.max(RAIN_STREAK.minLengthM * RAIN_STRATA.minSizeScale, speed * RAIN_STREAK.smearSeconds * sizeScale),
      );
      this.scratchRight.multiplyScalar(RAIN_STREAK.widthM * sizeScale);
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
      // Rings are a wet-ground specular hint, so they need wet ground: dry
      // ground gets none, and a flash briefly lights the ones that are there.
      const fade = (1 - progress) * (1 - progress)
        * clamp01(this.wetness * 1.4)
        * (1 + this.lightningFlash * RAIN_LIGHTNING.splashBrightnessLift);
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
      autoAdoptedWetSurfaces: this.autoAdopted,
      rainRate: this.rainRate,
      windSpeed: this.windSpeed,
      weatherIntensity: this.presentation.intensity,
      rainDensity: this.presentation.rainDensity,
      windStrength: this.presentation.windStrength,
      lightningEnabled: this.presentation.lightning,
      lightningFlash: this.lightningFlash,
      lightningStrikeIndex: this.lightningStrikeIndex,
      sightlineObscuration: rainSightlineObscuration(this.streakInstances, this.streakMaterial?.opacity ?? 0),
      perFrameAllocations: 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearWetSurfaces();
    this.flashLight?.dispose();
    this.flashLight = null;
    this.sceneRoot = null;
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
