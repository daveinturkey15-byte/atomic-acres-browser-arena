/**
 * src/sky/cloud-deck.ts — FIX lane VOLUMETRIC CLOUDS.
 *
 * One InstancedMesh of billboarded anisotropic Gaussian lobes. Opacity is a
 * closed-form optical-depth integral (no raymarch, no texture, 0 samplers),
 * shaded by 3 Beer-Lambert sun taps and a dual-lobe Henyey-Greenstein phase.
 *
 * Technique note: the *method* (procedural Gaussian cloud structure, analytic
 * extinction, approximate sampled lighting) was observed via INTAKE-OBSERVED
 * section 8 (`clouds-in-motion.pages.dev` method page + captured frames) and
 * is re-implemented here from first principles. No site code, art, or prose
 * is copied. The TSL instancing/billboard idiom (`attribute('aX','vec3')`,
 * `MeshBasicNodeMaterial`, `fog = false`) is reused verbatim from the
 * existing convention in `src/map3/sky.ts` — no second convention is added.
 *
 * Weather is CONSUMED, never redefined: `CloudWeatherInputs` takes the Map 3
 * authority (`skyTint`, `fogDensityScale` from `src/map3/weather-system.ts`)
 * and the Nuke Town runtime read (`fogDensityMultiplier`, `skyDarkenAmount`
 * from `src/weather/weather-state.ts`) as plain values with neutral defaults.
 * Both adapters below are `import type`-only, so this module adds zero
 * load-time cost to arenas that never create a deck: construction happens
 * only inside `createCloudDeck()`, never at import.
 */

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Map3WeatherPreset } from '../map3/weather-system';
import type { WeatherSample } from '../weather/weather-state';

/** One cast boundary; see the note in map3/foliage-material.ts. */
const {
  attribute, dot, exp, float, uv, vec3,
} = TSL as unknown as Record<string, any>;

/** Grep anchor proving the deck reaches the shipped bundle (see REPORT.md). */
export const CLOUD_DECK_REACHABILITY_MARKER = 'aa-cloud-deck-v1';

/* ------------------------------------------------------------------ */
/* Budget contract                                                     */
/* ------------------------------------------------------------------ */

/** The deck draws in exactly this many draw calls (one InstancedMesh). */
export const CLOUD_DECK_DRAW_CALLS = 1;
/** The deck's TSL graph samples no textures. */
export const CLOUD_DECK_SAMPLER_COUNT = 0;
/**
 * Added GPU frame-time budget at 1080p (ms). Argued by construction (128
 * small billboards, ~15 ALU/fragment, no texture fetch, no overdraw loop),
 * NOT measured — headless has no presentable frame loop here. Marked OPEN in
 * REPORT.md until the coordinator measures it on hardware.
 */
export const CLOUD_DECK_FRAME_MS_BUDGET = 1.2;
/** Default lobe count (worst-case fragment load is bounded by this). */
export const CLOUD_DECK_DEFAULT_LOBES = 128;
/** Hard cap: the preallocated sort index is a Uint16Array-sized lane. */
export const CLOUD_DECK_MAX_LOBES = 256;
/** Transparent-lobe resort rate (Hz). Above this the sort costs more than the seam it fixes. */
export const CLOUD_DECK_SORT_HZ = 4;
export const CLOUD_DECK_SORT_INTERVAL_MS = 1000 / CLOUD_DECK_SORT_HZ;

/* ------------------------------------------------------------------ */
/* Closed-form Gaussian optics (pure, CPU, fully tested)               */
/* ------------------------------------------------------------------ */

/**
 * Complementary error function, Abramowitz-Stegun 7.1.26 (|err| < 1.2e-7).
 * Needed for the half-line Gaussian integral below; Math has no erfc.
 */
export function gaussianErfc(x: number): number {
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.5 * ax);
  const tau = t * Math.exp(
    -ax * ax - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
      + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587
        + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? tau : 2 - tau;
}

export type Vec3 = readonly [number, number, number];

export interface CloudLobe {
  /** Lobe centre, metres, world space. */
  center: Vec3;
  /** Anisotropic radii (rx, ry, rz), metres. All > 0. */
  radii: Vec3;
  /** Extinction density at the core. 0 = clear air. */
  sigma: number;
}

/**
 * Closed-form optical depth along the HALF-line origin + s*dir, s in [0,inf):
 *   tau = sigma * exp(-Q/2) / sqrt(A) * sqrt(pi/2) * erfc(u0/sqrt(2))
 * where A, B, C are the quadratic coefficients of |q(s)|^2 in ellipsoid
 * space and Q = C - B^2/4A. No marching, no loop — one erfc.
 */
export function gaussianRayOpticalDepth(
  lobe: CloudLobe, origin: Vec3, dir: Vec3,
): number {
  if (lobe.sigma <= 0) return 0;
  const [cx, cy, cz] = lobe.center;
  const [rx, ry, rz] = lobe.radii;
  const ox = origin[0] - cx;
  const oy = origin[1] - cy;
  const oz = origin[2] - cz;
  const dx = dir[0];
  const dy = dir[1];
  const dz = dir[2];
  const A = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
  if (!(A > 1e-12)) return 0;
  const B = 2 * ((ox * dx) / (rx * rx) + (oy * dy) / (ry * ry) + (oz * dz) / (rz * rz));
  const C = (ox * ox) / (rx * rx) + (oy * oy) / (ry * ry) + (oz * oz) / (rz * rz);
  const Q = C - (B * B) / (4 * A);
  const u0 = B / (2 * Math.sqrt(A));
  return (
    (lobe.sigma * Math.exp(-0.5 * Q) * Math.sqrt(Math.PI / 2)
      * gaussianErfc(u0 / Math.SQRT2)) / Math.sqrt(A)
  );
}

/**
 * Closed-form optical depth along the FULL line through the lobe along dir
 * (the view ray). B and C vanish for a centred ray; the general form is kept
 * so off-centre fragment offsets use the same function as the tests.
 */
export function gaussianFullOpticalDepth(
  sigma: number, radii: Vec3, dir: Vec3, offset: Vec3 = [0, 0, 0],
): number {
  if (sigma <= 0) return 0;
  const [rx, ry, rz] = radii;
  const A = (dir[0] * dir[0]) / (rx * rx)
    + (dir[1] * dir[1]) / (ry * ry) + (dir[2] * dir[2]) / (rz * rz);
  if (!(A > 1e-12)) return 0;
  const B = 2 * ((offset[0] * dir[0]) / (rx * rx)
    + (offset[1] * dir[1]) / (ry * ry) + (offset[2] * dir[2]) / (rz * rz));
  const C = (offset[0] * offset[0]) / (rx * rx)
    + (offset[1] * offset[1]) / (ry * ry) + (offset[2] * offset[2]) / (rz * rz);
  const Q = C - (B * B) / (4 * A);
  return sigma * Math.exp(-0.5 * Q) * Math.sqrt((2 * Math.PI) / A);
}

/** Beer-Lambert transmittance for an optical depth. */
export function beerLambertTransmittance(tau: number): number {
  return Math.exp(-Math.max(0, tau));
}

/* ------------------------------------------------------------------ */
/* Sun taps + phase                                                    */
/* ------------------------------------------------------------------ */

/**
 * Number of Beer-Lambert taps along the sun ray. Three fixed analytic taps
 * (the probe point plus two forward offsets); NOT a march — the count is a
 * constant and each tap is the closed form above.
 */
export const CLOUD_DECK_SUN_TAPS = 3;

/** Tap offsets along the sun direction, in units of the lobe's mean radius. */
const SUN_TAP_OFFSETS = [0, 0.9, 1.8] as const;

/**
 * Sun transmittance at a probe point: the most-shadowed of CLOUD_DECK_SUN_TAPS
 * closed-form half-line taps wins. Each tap already integrates the FULL ray to
 * the sun, so averaging them would dilute a deep shadow with the clear air
 * beside it; the conservative shadow is what keeps the falsifiable ratio
 * above 4. `useBeerLambert = false` is the ablation switch (photoreal forge
 * §5): it forces full transmission and collapses the ratio to 1.
 */
export function lobeSunTransmittance(
  lobe: CloudLobe, probe: Vec3, sunDirection: Vec3, useBeerLambert = true,
): number {
  if (!useBeerLambert || lobe.sigma <= 0) return 1;
  const rMean = (lobe.radii[0] + lobe.radii[1] + lobe.radii[2]) / 3;
  let maxTau = 0;
  for (let i = 0; i < SUN_TAP_OFFSETS.length; i += 1) {
    const s = SUN_TAP_OFFSETS[i]! * rMean;
    const origin: Vec3 = [
      probe[0] + sunDirection[0] * s,
      probe[1] + sunDirection[1] * s,
      probe[2] + sunDirection[2] * s,
    ];
    const tau = gaussianRayOpticalDepth(lobe, origin, sunDirection);
    if (tau > maxTau) maxTau = tau;
  }
  return beerLambertTransmittance(maxTau);
}

/** Single-lobe Henyey-Greenstein phase. */
export function henyeyGreensteinPhase(cosTheta: number, g: number): number {
  const denom = 1 + g * g - 2 * g * cosTheta;
  return ((1 - g * g) / (4 * Math.PI * Math.pow(Math.max(denom, 1e-6), 1.5)));
}

/** Forward and backward lobe asymmetries for cloud droplets. */
export const CLOUD_HG_FORWARD_G = 0.65;
export const CLOUD_HG_BACKWARD_G = -0.28;
export const CLOUD_HG_FORWARD_WEIGHT = 0.75;

/** Dual-lobe phase, normalised by the isotropic mean so O(1) views read O(1). */
export function dualHenyeyGreensteinPhase(cosTheta: number): number {
  const clamped = Math.min(1, Math.max(-1, cosTheta));
  const phase = CLOUD_HG_FORWARD_WEIGHT * henyeyGreensteinPhase(clamped, CLOUD_HG_FORWARD_G)
    + (1 - CLOUD_HG_FORWARD_WEIGHT) * henyeyGreensteinPhase(clamped, CLOUD_HG_BACKWARD_G);
  return phase * 4 * Math.PI;
}

/** Normalised sun weight; the shadow-side floor keeps enemies readable (§6: re-metered, not photographic). */
export const CLOUD_SUN_WEIGHT = 1;
export const CLOUD_AMBIENT_FLOOR = 0.05;

/**
 * Incident radiance at a probe point: transmitted sun times phase plus the
 * readability floor. With sigma = 0 both probes agree exactly, so the ratio
 * below is exactly 1.
 */
export function lobeIncidentRadiance(
  lobe: CloudLobe, probe: Vec3, sunDirection: Vec3, viewDirection: Vec3,
  useBeerLambert = true,
): number {
  const sunLen = Math.hypot(sunDirection[0], sunDirection[1], sunDirection[2]);
  const viewLen = Math.hypot(viewDirection[0], viewDirection[1], viewDirection[2]);
  if (!(sunLen > 1e-9) || !(viewLen > 1e-9)) return CLOUD_AMBIENT_FLOOR;
  const cosTheta = (sunDirection[0] * viewDirection[0]
    + sunDirection[1] * viewDirection[1] + sunDirection[2] * viewDirection[2])
    / (sunLen * viewLen);
  const transmission = lobeSunTransmittance(lobe, probe, sunDirection, useBeerLambert);
  return CLOUD_SUN_WEIGHT * dualHenyeyGreensteinPhase(cosTheta) * transmission
    + CLOUD_AMBIENT_FLOOR;
}

/**
 * Fixed lobe field pinning the brief's ratio. One fat stratocumulus lobe,
 * high noon-ish sun, side view: the top probe looks at thin air toward the
 * sun while the base probe looks through the whole lobe. Both probes share
 * the view direction, so the phase cancels and the ratio is pure
 * Beer-Lambert — deleting that term collapses it to exactly 1.
 */
export const FIXED_RATIO_LOBE: CloudLobe = Object.freeze({
  center: Object.freeze([0, 0, 0]),
  radii: Object.freeze([9, 3.2, 6.5]),
  sigma: 0.6,
} as unknown as CloudLobe);

export const FIXED_RATIO_SUN: Vec3 = Object.freeze([0.2425, 0.9701, 0.1455]) as unknown as Vec3;
export const FIXED_RATIO_VIEW: Vec3 = Object.freeze([0.995, 0.05, 0.0995]) as unknown as Vec3;
export const FIXED_RATIO_TOP: Vec3 = Object.freeze([0, 3.2, 0]) as unknown as Vec3;
export const FIXED_RATIO_BASE: Vec3 = Object.freeze([0, -3.2, 0]) as unknown as Vec3;

/** Minimum sun-top / shadow-base radiance ratio with extinction enabled. */
export const CLOUD_RADIANCE_RATIO_MIN = 4;

/**
 * Radiance(sun-facing top) / radiance(shadow-side base) at the fixed field.
 * Must be >= 4 with Beer-Lambert, and exactly 1 (+/-1e-6) at sigma = 0.
 */
export function fixedFieldRadianceRatio(options: {
  sigma?: number;
  useBeerLambert?: boolean;
} = {}): number {
  const lobe: CloudLobe = {
    center: FIXED_RATIO_LOBE.center,
    radii: FIXED_RATIO_LOBE.radii,
    sigma: options.sigma ?? FIXED_RATIO_LOBE.sigma,
  };
  const useBeerLambert = options.useBeerLambert ?? true;
  const top = lobeIncidentRadiance(lobe, FIXED_RATIO_TOP, FIXED_RATIO_SUN, FIXED_RATIO_VIEW, useBeerLambert);
  const base = lobeIncidentRadiance(lobe, FIXED_RATIO_BASE, FIXED_RATIO_SUN, FIXED_RATIO_VIEW, useBeerLambert);
  return top / base;
}

/* ------------------------------------------------------------------ */
/* Fragment mirror (what the TSL graph evaluates per pixel)            */
/* ------------------------------------------------------------------ */

/** Quad half-extent in Gaussian sigmas; the rim reads ~e^-8 there. */
export const CLOUD_QUAD_SIGMA_EXTENT = 2;

/**
 * CPU mirror of the fragment opacity: 2D Gaussian in quad space times the
 * lobe's peak view optical depth, finished with 1 - exp(-tau). The TSL
 * graph in `createCloudDeckMaterial` evaluates exactly this.
 */
export function quadFragmentOpacity(
  quadU: number, quadV: number, peakTau: number,
): number {
  const E = CLOUD_QUAD_SIGMA_EXTENT;
  const qx = (quadU * 2 - 1) * E;
  const qy = (quadV * 2 - 1) * E;
  const tau = peakTau * Math.exp(-0.5 * (qx * qx + qy * qy));
  return 1 - Math.exp(-Math.max(0, tau));
}

/**
 * Peak view optical depth of a lobe: full-line integral along the view
 * direction through the lobe centre. Anisotropy enters through A, so a lobe
 * seen edge-on reads denser than face-on — no per-lobe texture needed.
 */
export function lobePeakViewTau(lobe: CloudLobe, viewDirection: Vec3): number {
  return gaussianFullOpticalDepth(lobe.sigma, lobe.radii, viewDirection);
}

/* ------------------------------------------------------------------ */
/* Weather inputs (consumed, never redefined)                          */
/* ------------------------------------------------------------------ */

export interface CloudWeatherInputs {
  /** Sky tint multiplier; white is zero-effect. */
  tint: Vec3;
  /** Fog closes in by this factor; 1 is a clear-day range. */
  fogDensityScale: number;
  /** Sky-darkening amount driving palettes, 0..1. */
  skyDarken: number;
  /** Wind multiplier scaling deck drift; 1 is neutral. */
  windScale: number;
}

export const NEUTRAL_CLOUD_WEATHER: CloudWeatherInputs = Object.freeze({
  tint: Object.freeze([1, 1, 1]),
  fogDensityScale: 1,
  skyDarken: 0,
  windScale: 1,
} as unknown as CloudWeatherInputs);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function tintFromHexOrRgb(value: number | Vec3): Vec3 {
  if (typeof value !== 'number') return value;
  const color = new THREE.Color(value);
  return [color.r, color.g, color.b];
}

/**
 * Map 3 authority adapter. Takes `skyTint` + `fogDensityScale` (+ `skyDarken`
 * for the storm blend) from a `Map3WeatherPreset`; every field falls back to
 * its neutral default when absent.
 */
export function cloudWeatherFromMap3Preset(
  preset: Partial<Pick<Map3WeatherPreset, 'skyTint' | 'fogDensityScale' | 'skyDarken'>>,
): CloudWeatherInputs {
  return {
    tint: preset.skyTint === undefined
      ? NEUTRAL_CLOUD_WEATHER.tint
      : tintFromHexOrRgb(preset.skyTint as number | Vec3),
    fogDensityScale: preset.fogDensityScale ?? 1,
    skyDarken: clamp01(preset.skyDarken ?? 0),
    windScale: NEUTRAL_CLOUD_WEATHER.windScale,
  };
}

/**
 * Nuke Town runtime adapter. `WeatherSample` carries no tint, so the tint
 * stays neutral white; fog/darken ride the sample's multipliers.
 */
export function cloudWeatherFromWeatherSample(
  sample: Partial<Pick<WeatherSample, 'fogDensityMultiplier' | 'skyDarkenAmount' | 'windMultiplier'>>,
): CloudWeatherInputs {
  return {
    tint: NEUTRAL_CLOUD_WEATHER.tint,
    fogDensityScale: sample.fogDensityMultiplier ?? 1,
    skyDarken: clamp01(sample.skyDarkenAmount ?? 0),
    windScale: sample.windMultiplier ?? 1,
  };
}

/* ------------------------------------------------------------------ */
/* Deck field generation (seeded, lazy — nothing runs at import)       */
/* ------------------------------------------------------------------ */

export interface CloudDeckFieldOptions {
  lobeCount?: number;
  seed?: number;
  /** Half-extent of the deck rectangle (x), metres. */
  halfExtentX?: number;
  /** Half-extent of the deck rectangle (z), metres. */
  halfExtentZ?: number;
  /** Deck mid-height, metres. */
  height?: number;
  /** Vertical spread around the mid-height, metres. */
  heightSpread?: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/** Seeded stratocumulus lobe field: wide flat lobes, dense cores. */
export function generateCloudLobes(options: CloudDeckFieldOptions = {}): CloudLobe[] {
  const count = Math.min(
    Math.max(1, Math.floor(options.lobeCount ?? CLOUD_DECK_DEFAULT_LOBES)),
    CLOUD_DECK_MAX_LOBES,
  );
  const random = mulberry32(options.seed ?? 1337);
  const hx = options.halfExtentX ?? 320;
  const hz = options.halfExtentZ ?? 220;
  const height = options.height ?? 150;
  const spread = options.heightSpread ?? 22;
  const lobes: CloudLobe[] = [];
  for (let i = 0; i < count; i += 1) {
    lobes.push({
      center: [
        (random() * 2 - 1) * hx,
        height + (random() * 2 - 1) * spread,
        (random() * 2 - 1) * hz,
      ],
      radii: [
        8 + random() * 12,
        2.5 + random() * 2.5,
        6 + random() * 6,
      ],
      sigma: 0.35 + random() * 0.35,
    });
  }
  return lobes;
}

/* ------------------------------------------------------------------ */
/* Material: one sampler-free TSL graph                                */
/* ------------------------------------------------------------------ */

export interface CloudDeckUniforms {
  sunColor: { value: THREE.Color };
  ambientColor: { value: THREE.Color };
  /** Dual-HG phase for the current view-sun angle (one value: deck is far). */
  phase: { value: number };
  /** Weather tint: skyTint darkened toward storm. Written by applyCloudWeather. */
  tint: { value: THREE.Color };
}

/**
 * One sampler-free TSL graph shared by every lobe in the deck. Per-lobe data
 * rides the `aCloud` instanced attribute (x = peak view tau, y = sun shade);
 * per-frame data rides uniforms. Anisotropy comes from the non-uniform
 * instance scale, so the fragment stays an isotropic closed form.
 */
export function createCloudDeckMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: CloudDeckUniforms;
} {
  const material = new MeshBasicNodeMaterial();
  material.name = `cloud-deck-${CLOUD_DECK_REACHABILITY_MARKER}`;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fog = false;

  const uniforms: CloudDeckUniforms = {
    sunColor: { value: new THREE.Color(0xfff2d8).convertSRGBToLinear() },
    ambientColor: { value: new THREE.Color(0x8fa3b8).convertSRGBToLinear() },
    phase: { value: 1 },
    tint: { value: new THREE.Color(0xffffff) },
  };

  const cloud = attribute('aCloud', 'vec2');
  const peakTau = cloud.x;
  const shade = cloud.y;

  // Closed-form 2D Gaussian in quad space; see quadFragmentOpacity().
  const centred = uv().sub(0.5).mul(2);
  const r2 = dot(centred, centred);
  const gauss = exp(r2.mul(-0.5 * CLOUD_QUAD_SIGMA_EXTENT * CLOUD_QUAD_SIGMA_EXTENT));
  const tau = peakTau.mul(gauss);
  material.opacityNode = float(1).sub(exp(tau.mul(-1)));

  // Incident radiance: transmitted sun times phase, plus the floor — then weather tint.
  const sun = vec3(uniforms.sunColor).mul(uniforms.phase).mul(shade);
  const incident = sun.add(vec3(uniforms.ambientColor));
  material.colorNode = incident.mul(vec3(uniforms.tint));
  return { material, uniforms };
}

/**
 * Publish weather inputs into deck uniforms. Pure tint math on the CPU; the
 * fog-density opacity response rides the per-lobe peak tau in shadeTick().
 * Neutral inputs are exactly zero-effect (white tint in, same tint out).
 */
export function applyCloudWeather(
  uniforms: CloudDeckUniforms, inputs: CloudWeatherInputs,
): void {
  const dim = 1 - 0.5 * clamp01(inputs.skyDarken);
  uniforms.tint.value.setRGB(
    inputs.tint[0] * dim, inputs.tint[1] * dim, inputs.tint[2] * dim,
  );
}

/** Fog-density response applied to the per-lobe peak tau. */
export function fogPeakTauScale(fogDensityScale: number): number {
  return 1 + 0.2 * Math.max(0, fogDensityScale - 1);
}

/* ------------------------------------------------------------------ */
/* Deck: one InstancedMesh, ≤4 Hz sort, no per-frame allocation         */
/* ------------------------------------------------------------------ */

export type CloudDeckQuality = 'off' | 'low' | 'high';

export interface CloudDeckOptions extends CloudDeckFieldOptions {
  quality?: CloudDeckQuality;
}

/** Lobe budget by graphics tier. `compat` adds nothing. */
export function cloudDeckLobeCountFor(quality: CloudDeckQuality): number {
  if (quality === 'off') return 0;
  if (quality === 'low') return 64;
  return CLOUD_DECK_DEFAULT_LOBES;
}

let liveCloudDeckCount = 0;
/** Import-side-effect probe: creating a deck is the only thing that raises this. */
export function getLiveCloudDeckCount(): number {
  return liveCloudDeckCount;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

/**
 * The deck. Owns one InstancedMesh (one draw call), one shared TSL material
 * (0 samplers), and preallocated sort/depth scratch. `update()` runs every
 * frame and allocates nothing; `shadeTick()` (peak tau + shade + depth sort)
 * runs at most every 250 ms and allocates nothing either.
 */
export class CloudDeck {
  readonly mesh: THREE.InstancedMesh;
  readonly material: MeshBasicNodeMaterial;
  readonly uniforms: CloudDeckUniforms;
  readonly lobes: CloudLobe[];
  /** Draw order: instance slot i draws lobes[order[i]]. Preallocated. */
  readonly order: Uint16Array;
  /** Per-lobe view depth scratch. Preallocated. */
  readonly depths: Float32Array;
  /** Per-lobe base peak tau (view-independent part). Preallocated. */
  private readonly basePeakTau: Float32Array;
  private readonly shadeAttr: THREE.InstancedBufferAttribute;
  private lastShadeMs = Number.NEGATIVE_INFINITY;
  private quality: CloudDeckQuality;
  private disposed = false;

  constructor(options: CloudDeckOptions = {}) {
    const lobes = generateCloudLobes(options);
    this.lobes = lobes;
    this.quality = options.quality ?? 'high';
    const built = createCloudDeckMaterial();
    this.material = built.material;
    this.uniforms = built.uniforms;

    const geometry = new THREE.PlaneGeometry(1, 1);
    const shade = new Float32Array(lobes.length * 2);
    this.shadeAttr = new THREE.InstancedBufferAttribute(shade, 2);
    this.shadeAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aCloud', this.shadeAttr);

    this.mesh = new THREE.InstancedMesh(
      geometry, this.material, Math.max(lobes.length, 1),
    );
    this.mesh.name = `cloud-deck-${CLOUD_DECK_REACHABILITY_MARKER}`;
    this.mesh.frustumCulled = false;
    // Transparent deck: far lobes must draw first; the ≤4 Hz sort owns this.
    this.mesh.renderOrder = 8;
    this.mesh.userData.presentationOnly = true;
    this.mesh.userData.blocksShots = false;
    this.mesh.userData.reachability = CLOUD_DECK_REACHABILITY_MARKER;

    this.order = new Uint16Array(lobes.length);
    this.depths = new Float32Array(lobes.length);
    this.basePeakTau = new Float32Array(lobes.length);
    for (let i = 0; i < lobes.length; i += 1) {
      this.order[i] = i;
      const lobe = lobes[i]!;
      const rMean = (lobe.radii[0] + lobe.radii[1] + lobe.radii[2]) / 3;
      this.basePeakTau[i] = lobe.sigma * Math.sqrt(2 * Math.PI) * rMean;
      shade[i * 2] = this.basePeakTau[i];
      shade[i * 2 + 1] = 1;
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.applyQuality();
    liveCloudDeckCount += 1;
  }

  /** Visible lobe count for the current quality tier. */
  get count(): number {
    return this.mesh.count;
  }

  setQuality(quality: CloudDeckQuality): void {
    this.quality = quality;
    this.applyQuality();
  }

  private applyQuality(): void {
    const wanted = cloudDeckLobeCountFor(this.quality);
    this.mesh.count = Math.min(wanted, this.lobes.length);
    this.mesh.visible = wanted > 0;
  }

  /**
   * Per-frame: drift the field, billboard every visible lobe at the camera,
   * write matrices in `order` sequence. Scratch objects only — no allocation.
   */
  update(
    camera: THREE.Camera, sunDirection: Vec3, weather: CloudWeatherInputs,
    nowMs: number, dtSeconds: number,
  ): void {
    if (this.disposed || !this.mesh.visible) return;
    this.shadeTick(camera, sunDirection, weather, nowMs);
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    const drift = 1.35 * weather.windScale * dt;
    const hx = 340;
    _q.copy(camera.quaternion);
    const n = this.mesh.count;
    for (let slot = 0; slot < n; slot += 1) {
      const lobe = this.lobes[this.order[slot]!]!;
      const c = lobe.center as [number, number, number];
      c[0] += drift;
      if (c[0] > hx) c[0] -= hx * 2;
      _p.set(c[0], c[1], c[2]);
      const E = CLOUD_QUAD_SIGMA_EXTENT;
      _s.set(lobe.radii[0] * E, lobe.radii[1] * E, 1);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(slot, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * ≤4 Hz: recompute per-lobe peak tau (view-dependent) + sun shade, rewrite
   * the `aCloud` attribute, and resort far-first into the preallocated index
   * array (insertion sort — N ≤ 256, no allocation). Returns true when it ran.
   */
  shadeTick(
    camera: THREE.Camera, sunDirection: Vec3, weather: CloudWeatherInputs,
    nowMs: number,
  ): boolean {
    if (this.disposed || !this.mesh.visible) return false;
    if (nowMs - this.lastShadeMs < CLOUD_DECK_SORT_INTERVAL_MS) return false;
    this.lastShadeMs = nowMs;
    applyCloudWeather(this.uniforms, weather);

    camera.getWorldDirection(_v);
    const view: Vec3 = [_v.x, _v.y, _v.z];
    const sunLen = Math.hypot(sunDirection[0], sunDirection[1], sunDirection[2]);
    const viewLen = Math.hypot(view[0], view[1], view[2]);
    const cosTheta = sunLen > 1e-9 && viewLen > 1e-9
      ? (sunDirection[0] * view[0] + sunDirection[1] * view[1] + sunDirection[2] * view[2])
        / (sunLen * viewLen)
      : 0;
    this.uniforms.phase.value = dualHenyeyGreensteinPhase(cosTheta);

    const fogScale = fogPeakTauScale(weather.fogDensityScale);
    const data = this.shadeAttr.array as Float32Array;
    const cam = camera.position;
    const n = this.lobes.length;
    for (let i = 0; i < n; i += 1) {
      const lobe = this.lobes[i]!;
      data[i * 2] = lobePeakViewTau(lobe, view) * fogScale;
      data[i * 2 + 1] = lobeSunTransmittance(lobe, lobe.center, sunDirection, true);
      const dx = lobe.center[0] - cam.x;
      const dy = lobe.center[1] - cam.y;
      const dz = lobe.center[2] - cam.z;
      this.depths[i] = dx * view[0] + dy * view[1] + dz * view[2];
    }
    this.shadeAttr.needsUpdate = true;

    // Insertion sort of `order` by depth, far (small depth) first. The mesh
    // draws slots 0..count-1, and update() fills slot i from order[i].
    const order = this.order;
    for (let i = 0; i < n; i += 1) order[i] = i;
    for (let i = 1; i < n; i += 1) {
      const key = order[i]!;
      const keyDepth = this.depths[key]!;
      let j = i - 1;
      while (j >= 0 && this.depths[order[j]!]! > keyDepth) {
        order[j + 1] = order[j]!;
        j -= 1;
      }
      order[j + 1] = key;
    }
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    liveCloudDeckCount -= 1;
  }
}

/** Lazy factory: the ONLY place that allocates GPU-side deck resources. */
export function createCloudDeck(options: CloudDeckOptions = {}): CloudDeck {
  return new CloudDeck(options);
}
