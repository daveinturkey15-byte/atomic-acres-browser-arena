/**
 * map3/weather-system.ts — M3.WEATHER.1a: Map 3's one map-wide weather system.
 *
 * Corridor 5 ("seasons, weather & torrential storms") built good precipitation
 * machinery — instanced billboard rain/snow, gale slant, ground splash rings,
 * a lightning driver — and then trapped it in one 14-metre bay. This module
 * lifts that machinery out so a match can be played in the rain:
 *
 *   - one weather state (`Map3WeatherId`) and one update (`Map3WeatherController`),
 *   - the reusable TSL builders corridor 5 now consumes instead of owning,
 *   - shared uniforms other code reads without importing the controller.
 *
 * Repo contract: three/webgpu NodeMaterials with TSL expressions only.
 * No ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 *
 * Budget: the map-wide rig adds exactly 2 draw calls (one precipitation layer,
 * one splash layer — one draw call per layer, never per particle) plus one
 * shadowless PointLight for lightning. No per-frame allocation in update().
 *
 * Skill applications (cited in REPORT.md):
 * - webgpu-tsl-arena-forging §7: every custom path is a TSL node graph;
 *   instanced layers stay one pipeline each; no legacy material survives.
 * - photoreal-procedural-scene-forge §4 rule 2: wetness/sky/fog are DERIVED
 *   from one weather state by relaxation, never hand-tuned per frame.
 * - threejs-frame-loop-audit: severity follows the render loop — update()
 *   allocates nothing, mutates preallocated state, and all geometry/attribute
 *   fills happen once at build.
 */

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  abs, attribute, cameraPosition, clamp, cross, float, mix,
  normalize, positionLocal, sin, smoothstep, uniform, uv, vec2,
  vec3, vec4,
} = TSL as unknown as Record<string, any>;

/* ------------------------------------------------------------------ */
/* 1. The state                                                        */
/* ------------------------------------------------------------------ */

/** The five map-wide weather states. Severity order is NOT this order. */
export type Map3WeatherId = 'clear' | 'overcast' | 'rain' | 'storm' | 'snow';

export const MAP3_WEATHER_IDS: readonly Map3WeatherId[] = Object.freeze([
  'clear', 'overcast', 'rain', 'storm', 'snow',
]);

export function isMap3WeatherId(value: string): value is Map3WeatherId {
  return (MAP3_WEATHER_IDS as readonly string[]).includes(value);
}
/**
 * Hex -> linear vec3 components, the same conversion foliage-material.ts
 * `rgb()` performs (`new THREE.Color(hex)` in the working space). Computed
 * once at build; the frame loop never touches it.
 */
function lin(hex: THREE.ColorRepresentation): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}


/**
 * Severity rung per state. Snow and rain precipitate equally hard; the storm
 * stands alone at the top. Tests pin the ORDER (storm darkest/densest, clear
 * calmest), never these literals.
 */
const SEVERITY: Readonly<Record<Map3WeatherId, number>> = Object.freeze({
  clear: 0, overcast: 1, rain: 2, snow: 2, storm: 3,
});

export function map3WeatherSeverity(id: Map3WeatherId): number {
  return SEVERITY[id];
}

/** One row of the frozen weather contract. */
export interface Map3WeatherPreset {
  /** Fraction of the precipitation layer visible, 0..1. */
  precipitationRate: number;
  /** Wetness the ground relaxes toward, 0..1. */
  wetnessTarget: number;
  /** Base wind speed in metres per second (see windVector units below). */
  windSpeedMps: number;
  /**
   * Wind bearing in radians in the XZ plane: x = cos(bearing), z = sin(bearing).
   * The vector points where the wind blows TOWARD.
   */
  windBearingRadians: number;
  /** Extra gust amplitude as a fraction of base speed. */
  gustFraction: number;
  /** Fraction of precipitation drawn as snow rather than rain streaks. */
  snowAmount: number;
  /** Lightning driver enabled. */
  lightning: boolean;
  /** Sky tint multiplier (white = untouched clear sky). */
  skyTint: THREE.ColorRepresentation;
  /** Fog closes in by this factor (1 = clear-day range). */
  fogDensityScale: number;
  /** Sky-darkening amount driving palettes, 0..1. */
  skyDarken: number;
}

const preset = (
  precipitationRate: number, wetnessTarget: number,
  windSpeedMps: number, windBearingRadians: number, gustFraction: number,
  snowAmount: number, lightning: boolean, skyTint: THREE.ColorRepresentation,
  fogDensityScale: number, skyDarken: number,
): Map3WeatherPreset => Object.freeze({
  precipitationRate, wetnessTarget, windSpeedMps, windBearingRadians,
  gustFraction, snowAmount, lightning, skyTint, fogDensityScale, skyDarken,
});

export const MAP3_WEATHER_PRESETS: Readonly<Record<Map3WeatherId, Map3WeatherPreset>> = Object.freeze({
  clear: preset(0, 0, 2.2, 0.6, 0.35, 0, false, 0xffffff, 1.0, 0),
  overcast: preset(0.02, 0.25, 4.5, 0.75, 0.4, 0, false, 0xb9c2c9, 1.35, 0.45),
  rain: preset(0.55, 0.8, 7.5, 0.9, 0.5, 0, false, 0x9aa7b5, 1.6, 0.62),
  storm: preset(1.0, 1.0, 14.0, 1.05, 0.55, 0, true, 0x6d7a8c, 2.1, 0.85),
  snow: preset(0.5, 0.35, 5.5, 2.2, 0.45, 1, false, 0xcfd9e4, 1.8, 0.5),
});

export function map3WeatherPreset(id: Map3WeatherId): Map3WeatherPreset {
  return MAP3_WEATHER_PRESETS[id];
}

/* ------------------------------------------------------------------ */
/* 2. Deterministic pin — every state reachable for capture            */
/* ------------------------------------------------------------------ */

/**
 * Resolve a pinned weather state from a URL query string. Accepts
 * `?map3weather=storm` (preferred) or `?weather=storm`; the last recognised
 * parameter wins; matching is case-insensitive; unknown values resolve to
 * null (never a default — a typo must not silently become a storm).
 * Pure: takes the string, reads nothing global, so tests own it.
 */
export function resolveMap3WeatherPin(search: string): Map3WeatherId | null {
  const q = search.startsWith('?') ? search.slice(1) : search;
  let pinned: Map3WeatherId | null = null;
  for (const part of q.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key !== 'map3weather' && key !== 'weather') continue;
    const value = decodeURIComponent(part.slice(eq + 1)).trim().toLowerCase();
    if (isMap3WeatherId(value)) pinned = value;
  }
  return pinned;
}

/** Read the pin from the live page URL when there is one. Never throws. */
export function resolveMap3WeatherPinFromEnvironment(): Map3WeatherId | null {
  try {
    if (typeof window !== 'undefined' && typeof window.location?.search === 'string') {
      return resolveMap3WeatherPin(window.location.search);
    }
  } catch { /* headless / QA harness without a location — unpinned */ }
  return null;
}

/* ------------------------------------------------------------------ */
/* 3. The controller — one state, one update, no allocation            */
/* ------------------------------------------------------------------ */

/** Relaxation rates. Wetness soaks faster than it dries — the asymmetry is
 * what lets a shower leave a mark for a minute after the sky clears. */
export const MAP3_WEATHER_TAU = Object.freeze({
  wetUpSeconds: 18, wetDownSeconds: 55,
  precipitationSeconds: 1.8, skySeconds: 5, fogSeconds: 5, windSeconds: 3.5,
});

/** The displayed (ramped) weather values. Mutated in place, never replaced. */
export interface Map3WeatherDisplayed {
  wetness: number;
  precipitationRate: number;
  skyDarken: number;
  fogDensityScale: number;
  snowAmount: number;
  stormAmount: number;
  windX: number;
  windZ: number;
  windSpeed: number;
}

function relaxDisplayed(value: number, target: number, dt: number, tau: number): number {
  if (dt <= 0) return value;
  if (tau <= 0) return target;
  return value + (target - value) * (1 - Math.exp(-dt / tau));
}

export class Map3WeatherController {
  target: Map3WeatherId;
  pinned: Map3WeatherId | null;
  /** Mutated in place by update(); read it, never replace it. */
  readonly displayed: Map3WeatherDisplayed;
  private elapsed = 0;

  constructor(initial: Map3WeatherId = 'clear', pin: Map3WeatherId | null = null) {
    this.target = initial;
    this.pinned = pin;
    const row = map3WeatherPreset(pin ?? initial);
    this.displayed = {
      wetness: row.wetnessTarget,
      precipitationRate: row.precipitationRate,
      skyDarken: row.skyDarken,
      fogDensityScale: row.fogDensityScale,
      snowAmount: row.snowAmount,
      stormAmount: (pin ?? initial) === 'storm' ? 1 : 0,
      windX: Math.cos(row.windBearingRadians) * row.windSpeedMps,
      windZ: Math.sin(row.windBearingRadians) * row.windSpeedMps,
      windSpeed: row.windSpeedMps,
    };
  }

  /** Effective target: a pin beats any setTarget until unpinned. */
  get effectiveTarget(): Map3WeatherId {
    return this.pinned ?? this.target;
  }

  setTarget(id: Map3WeatherId): void {
    this.target = id;
  }

  pinTo(id: Map3WeatherId | null): void {
    this.pinned = id;
  }

  /**
   * Advance the ramp by dt seconds. Transitions RAMP, never cut: after one
   * frame the displayed values have moved a fraction of the way, and only a
   * long update converges. Returns the same object every call.
   */
  update(dtSeconds: number): Map3WeatherDisplayed {
    const d = this.displayed;
    if (dtSeconds <= 0) return d;
    this.elapsed += dtSeconds;
    const row = map3WeatherPreset(this.effectiveTarget);
    const wetTau = row.wetnessTarget > d.wetness
      ? MAP3_WEATHER_TAU.wetUpSeconds : MAP3_WEATHER_TAU.wetDownSeconds;
    d.wetness = relaxDisplayed(d.wetness, row.wetnessTarget, dtSeconds, wetTau);
    d.precipitationRate = relaxDisplayed(
      d.precipitationRate, row.precipitationRate, dtSeconds, MAP3_WEATHER_TAU.precipitationSeconds);
    d.skyDarken = relaxDisplayed(
      d.skyDarken, row.skyDarken, dtSeconds, MAP3_WEATHER_TAU.skySeconds);
    d.fogDensityScale = relaxDisplayed(
      d.fogDensityScale, row.fogDensityScale, dtSeconds, MAP3_WEATHER_TAU.fogSeconds);
    d.snowAmount = relaxDisplayed(
      d.snowAmount, row.snowAmount, dtSeconds, MAP3_WEATHER_TAU.skySeconds);
    const stormTarget = this.effectiveTarget === 'storm' ? 1 : 0;
    d.stormAmount = relaxDisplayed(
      d.stormAmount, stormTarget, dtSeconds, MAP3_WEATHER_TAU.precipitationSeconds);
    // Deterministic gusts: two incommensurate sines of accumulated time, so a
    // pinned storm screenshot at elapsed T is reproducible frame for frame.
    const gust = Math.sin(this.elapsed * 0.5) * 0.6 + Math.sin(this.elapsed * 1.31 + 2.1) * 0.4;
    const speed = row.windSpeedMps * (1 + gust * row.gustFraction);
    const wx = Math.cos(row.windBearingRadians) * speed;
    const wz = Math.sin(row.windBearingRadians) * speed;
    d.windX = relaxDisplayed(d.windX, wx, dtSeconds, MAP3_WEATHER_TAU.windSeconds);
    d.windZ = relaxDisplayed(d.windZ, wz, dtSeconds, MAP3_WEATHER_TAU.windSeconds);
    d.windSpeed = Math.sqrt(d.windX * d.windX + d.windZ * d.windZ);
    return d;
  }
}

/* ------------------------------------------------------------------ */
/* 4. Shared uniforms — read without importing the controller          */
/* ------------------------------------------------------------------ */

/**
 * The live weather uniforms. The controller publishes here via
 * publishMap3WeatherShared(); street-cell.ts, sky.ts and the grass lane read
 * these nodes/objects without ever importing a controller.
 *
 * CROSS-LANE (day3-map3-grass): `windVector` is a THREE.Vector3 in METRES PER
 * SECOND on the XZ plane (y is always 0), mutated in place every frame. Read
 * `.x`/`.z` directly; never replace the object.
 */
export const map3WeatherShared = {
  /** Seconds since the rig started; drives precipitation fall and gusts. */
  time: uniform(0),
  /** Ground wetness, 0 (dry) .. 1 (saturated). */
  wetness: uniform(0),
  /** Fraction of the precipitation layer visible, 0..1. */
  precipitationRate: uniform(0),
  /** Sky tint multiplier; white at clear. */
  skyTint: uniform(new THREE.Color(0xffffff)),
  /** Sky-darkening amount driving palettes, 0..1. */
  skyDarken: uniform(0),
  /** Fog closes in by this factor; 1 at clear. */
  fogDensityScale: uniform(1),
  /** 0 = rain streaks, 1 = snow blobs. */
  snowAmount: uniform(0),
  /** 0 = calm, 1 = full storm slant/speed. */
  stormAmount: uniform(0),
  /** Wind for shaders, m/s on XZ. */
  windFlat: uniform(new THREE.Vector2(2.2 * Math.cos(0.6), 2.2 * Math.sin(0.6))),
  /** Wind for CPU readers (grass lane), m/s on XZ, y = 0. Mutated in place. */
  windVector: new THREE.Vector3(2.2 * Math.cos(0.6), 0, 2.2 * Math.sin(0.6)),
  /** Lightning flash envelope, 0 or 1 (driven by driveMap3Lightning). */
  flash: uniform(0),
};

const setNum = (n: unknown, v: number): void => {
  (n as unknown as { value: number }).value = v;
};

/** Publish one controller step into the shared uniforms. No allocation. */
export function publishMap3WeatherShared(
  d: Map3WeatherDisplayed, elapsedSeconds: number,
  target: Map3WeatherId,
): void {
  setNum(map3WeatherShared.time, elapsedSeconds);
  setNum(map3WeatherShared.wetness, d.wetness);
  setNum(map3WeatherShared.precipitationRate, d.precipitationRate);
  setNum(map3WeatherShared.skyDarken, d.skyDarken);
  setNum(map3WeatherShared.fogDensityScale, d.fogDensityScale);
  setNum(map3WeatherShared.snowAmount, d.snowAmount);
  setNum(map3WeatherShared.stormAmount, d.stormAmount);
  (map3WeatherShared.skyTint as unknown as { value: THREE.Color }).value.set(
    map3WeatherPreset(target).skyTint);
  const flat = (map3WeatherShared.windFlat as unknown as { value: THREE.Vector2 }).value;
  flat.set(d.windX, d.windZ);
  map3WeatherShared.windVector.set(d.windX, 0, d.windZ);
}

/**
 * Debug hook for deterministic capture: `window.__MAP3WEATHER.pin('storm')`.
 * The rig consults `controller.pinned` every frame, so pinning takes effect
 * (via the ramp) without a reload. Never throws headless.
 */
export function installMap3WeatherDebugHook(controller: Map3WeatherController): void {
  try {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__MAP3WEATHER = {
      pin: (id: string) => {
        if (isMap3WeatherId(id)) { controller.pinTo(id); return true; }
        return false;
      },
      unpin: () => controller.pinTo(null),
      set: (id: string) => {
        if (isMap3WeatherId(id)) { controller.setTarget(id); return true; }
        return false;
      },
      state: () => controller.effectiveTarget,
    };
  } catch { /* no window — nothing to hook */ }
}

/* ------------------------------------------------------------------ */
/* 5. Reusable machinery (moved out of corridor-weather.ts)             */
/* ------------------------------------------------------------------ */

/** fract(sin()) hash — the same formula leaf-geometry.ts uses, kept here so
 * owned files never import the grass lane's module for one hash. */
export function m3hash11(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Round up: precipitation fall height, metres. Shared by both layers. */
export const MAP3_PRECIP_HEIGHT = 14;

/**
 * Fill precipitation attributes in the corridor's seasonal-bay distribution:
 * 55% storm bay, 25% winter bay, 20% summer shower. Corridor 5 keeps this
 * exact spread as its regression check; the map-wide rig uses the uniform
 * fill below instead.
 */
export function fillBayPrecipitation(
  origin: Float32Array, seeds: Float32Array,
  count: number, widthM: number, bayLenM: number, seedBase = 0,
): void {
  const BAY = bayLenM;
  for (let i = 0; i < count; i++) {
    const k = i + seedBase;
    const h0 = m3hash11(k * 1.37);
    const h1 = m3hash11(k * 3.71 + 11);
    const h2 = m3hash11(k * 7.13 + 29);
    origin[i * 3] = (h0 - 0.5) * widthM;
    origin[i * 3 + 1] = h1 * MAP3_PRECIP_HEIGHT;
    let zSample: number;
    if (h2 < 0.55) {
      zSample = -(BAY * 1.5 + (m3hash11(k * 9.17) - 0.5) * BAY * 1.6);
    } else if (h2 < 0.80) {
      zSample = -(BAY * 3.0 + (m3hash11(k * 9.17) - 0.5) * BAY * 1.0);
    } else {
      zSample = -(BAY * 1.0 + (m3hash11(k * 9.17) - 0.5) * BAY * 1.0);
    }
    origin[i * 3 + 2] = zSample;
    seeds[i] = h0 * 97 + h1 * 31;
  }
}

/** Fill precipitation attributes uniformly over a map rectangle. */
export function fillUniformPrecipitation(
  origin: Float32Array, seeds: Float32Array,
  count: number, cx: number, cz: number, wM: number, dM: number,
): void {
  for (let i = 0; i < count; i++) {
    const h0 = m3hash11(i * 1.37 + 3.1);
    const h1 = m3hash11(i * 3.71 + 11.7);
    origin[i * 3] = cx + (h0 - 0.5) * wM;
    origin[i * 3 + 1] = h1 * MAP3_PRECIP_HEIGHT;
    origin[i * 3 + 2] = cz + (m3hash11(i * 7.13 + 29.3) - 0.5) * dM;
    seeds[i] = h0 * 97 + h1 * 31;
  }
}

/** The unit billboard quad both precipitation layers share. */
export function createPrecipQuad(): { positions: Float32Array; uvs: Float32Array } {
  return {
    positions: new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0,
      -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
  };
}

/**
 * Corridor-5 precipitation material: bay-indexed rain/snow/storm, verbatim the
 * graph corridor-weather.ts shipped — moved, not rewritten, so the seasonal
 * bays render exactly as they did.
 */
export function createBayPrecipitationMaterial(
  time: unknown, flash: unknown, bayLenM: number,
): MeshBasicNodeMaterial {
  const rainMat = new MeshBasicNodeMaterial();
  rainMat.transparent = true;
  rainMat.depthWrite = false;
  rainMat.side = THREE.DoubleSide;
  rainMat.fog = false;
  {
    const o = attribute('aOrigin', 'vec3');
    const s = attribute('aSeed', 'float');
    const t = time;
    const BAY = bayLenM;
    const bay = clamp(o.z.negate().div(float(BAY)), float(0.0), float(4.0));
    const isSnow = smoothstep(float(2.7), float(3.2), bay);
    const isStorm = smoothstep(float(1.3), float(1.8), bay)
      .mul(float(1.0).sub(smoothstep(float(2.6), float(3.0), bay)));
    const speed = mix(mix(float(11.0), float(22.0), isStorm), float(1.8), isSnow);
    const raw = (t as any).mul(speed).add(s);
    const fall = raw.sub(raw.div(float(14.0)).floor().mul(float(14.0)));
    const y = float(14.0).sub(fall);
    // Wind turbulence & storm slant (shared wind, corridor-local gust phase).
    const windGust = sin((t as any).mul(1.6).add(o.z.mul(0.2))).mul(0.5).add(0.5);
    const stormSlant = isStorm.mul(float(3.6).add(windGust.mul(1.8))).mul(float(1.0).sub(y.div(14.0)));
    const snowWander = sin((t as any).mul(0.9).add(s)).mul(isSnow.mul(0.65));
    const centre = vec3(o.x.add(snowWander).add(stormSlant), y, o.z.add(snowWander.mul(0.5)));
    const toCam = normalize(cameraPosition.sub(centre));
    const right = normalize(cross(vec3(0, 1, 0), toCam));
    const up = cross(toCam, right);
    const wide = mix(mix(float(0.012), float(0.018), isStorm), float(0.055), isSnow);
    const tall = mix(mix(float(0.38), float(0.68), isStorm), float(0.055), isSnow);
    rainMat.positionNode = centre
      .add(right.mul(positionLocal.x.mul(wide)))
      .add(up.mul(positionLocal.y.mul(tall)));
    const d = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const round = float(1.0).sub(smoothstep(float(0.32), float(1.0), d));
    const streak = float(1.0).sub(smoothstep(float(0.15), float(1.0), abs(uv().x.sub(0.5)).mul(2.0)));
    const shape = mix(streak, round, isSnow);
    const inWeather = smoothstep(float(0.4), float(0.8), bay);
    const flashBoost = (flash as any).mul(isStorm).mul(0.8);
    const baseTint = mix(vec3(...lin(0xaad0e4)), vec3(...lin(0xf2f6f9)), isSnow);
    const finalTint = mix(baseTint, vec3(...lin(0xffffff)), flashBoost);
    rainMat.colorNode = vec4(
      finalTint,
      shape.mul(inWeather).mul(mix(mix(float(0.45), float(0.85), isStorm), float(0.92), isSnow)),
    );
  }
  return rainMat;
}

/**
 * Map-wide precipitation material: the same streak/round shaping and the same
 * fall/slant physics, but storm-vs-snow comes from the shared weather state
 * (ramped, never cut) instead of the bay index. One draw call per layer.
 */
export function createUniformPrecipitationMaterial(
  time: unknown, flash: unknown, stormNode: unknown, snowNode: unknown,
  rateNode: unknown,
): MeshBasicNodeMaterial {
  const rainMat = new MeshBasicNodeMaterial();
  rainMat.transparent = true;
  rainMat.depthWrite = false;
  rainMat.side = THREE.DoubleSide;
  rainMat.fog = false;
  {
    const o = attribute('aOrigin', 'vec3');
    const s = attribute('aSeed', 'float');
    const t = time;
    const isSnow = snowNode as any;
    const isStorm = stormNode as any;
    const speed = mix(mix(float(11.0), float(22.0), isStorm), float(1.8), isSnow);
    const raw = (t as any).mul(speed).add(s);
    const fall = raw.sub(raw.div(float(14.0)).floor().mul(float(14.0)));
    const y = float(14.0).sub(fall);
    const windGust = sin((t as any).mul(1.6).add(o.z.mul(0.2))).mul(0.5).add(0.5);
    const stormSlant = isStorm.mul(float(3.6).add(windGust.mul(1.8))).mul(float(1.0).sub(y.div(14.0)));
    const snowWander = sin((t as any).mul(0.9).add(s)).mul(isSnow.mul(0.65));
    const centre = vec3(o.x.add(snowWander).add(stormSlant), y, o.z.add(snowWander.mul(0.5)));
    const toCam = normalize(cameraPosition.sub(centre));
    const right = normalize(cross(vec3(0, 1, 0), toCam));
    const up = cross(toCam, right);
    const wide = mix(mix(float(0.012), float(0.018), isStorm), float(0.055), isSnow);
    const tall = mix(mix(float(0.38), float(0.68), isStorm), float(0.055), isSnow);
    rainMat.positionNode = centre
      .add(right.mul(positionLocal.x.mul(wide)))
      .add(up.mul(positionLocal.y.mul(tall)));
    const d = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const round = float(1.0).sub(smoothstep(float(0.32), float(1.0), d));
    const streak = float(1.0).sub(smoothstep(float(0.15), float(1.0), abs(uv().x.sub(0.5)).mul(2.0)));
    const shape = mix(streak, round, isSnow);
    const flashBoost = (flash as any).mul(isStorm).mul(0.8);
    const baseTint = mix(vec3(...lin(0xaad0e4)), vec3(...lin(0xf2f6f9)), isSnow);
    const finalTint = mix(baseTint, vec3(...lin(0xffffff)), flashBoost);
    rainMat.colorNode = vec4(
      finalTint,
      shape.mul(rateNode as any).mul(mix(mix(float(0.45), float(0.85), isStorm), float(0.92), isSnow)),
    );
  }
  return rainMat;
}
/** Fill splash-ring centres over a rectangle. */
export function fillSplashCentres(
  pos: Float32Array, seeds: Float32Array,
  count: number, cx: number, cz: number, wM: number, dM: number, y = 0.05,
): void {
  for (let i = 0; i < count; i++) {
    const h0 = m3hash11(i * 2.31 + 5);
    const h1 = m3hash11(i * 5.17 + 17);
    pos[i * 3] = cx + (h0 - 0.5) * wM;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = cz + (h1 - 0.5) * dM;
    seeds[i] = m3hash11(i * 13.7) * 100.0;
  }
}

/** Expanding ground ripple rings — the corridor's verbatim graph. */
export function createSplashMaterial(time: unknown): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;
  mat.fog = false;
  {
    const c = attribute('aCenter', 'vec3');
    const s = attribute('aSeed', 'float');
    const t = time;
    const progress = (t as any).mul(3.6).add(s).sub((t as any).mul(3.6).add(s).floor());
    const radius = progress.mul(0.16);
    mat.positionNode = (c as any).add(positionLocal.mul(radius));
    const dist = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const ring = smoothstep(float(0.5), float(0.85), dist)
      .mul(float(1.0).sub(smoothstep(float(0.88), float(1.0), dist)));
    const alpha = float(1.0).sub(progress).mul(0.7);
    mat.colorNode = vec4(vec3(...lin(0xd2e8f4)), ring.mul(alpha));
  }
  return mat;
}

/** The flat ground quad the splash rings expand on. */
export function createSplashQuad(): { positions: Float32Array; uvs: Float32Array } {
  return {
    positions: new Float32Array([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
      -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
  };
}

/**
 * Double-sine lightning trigger, moved verbatim from corridor-weather.ts.
 * Returns the strike strength (0 at rest); writes the light + flash envelope
 * in place. No allocation.
 */
export function driveMap3Lightning(
  elapsedSeconds: number,
  light: { intensity: number },
  flash: { value: number },
  enabled: boolean,
): void {
  if (!enabled) {
    light.intensity = 0;
    flash.value = 0;
    return;
  }
  const a = Math.sin(elapsedSeconds * 0.37);
  const b = Math.sin(elapsedSeconds * 1.31 + 2.1);
  const strike = Math.max(0, a * b - 0.86) * 7;
  light.intensity = strike * 160;
  flash.value = strike > 0.05 ? 1.0 : 0.0;
}

/* ------------------------------------------------------------------ */
/* 6. The map-wide rig                                                 */
/* ------------------------------------------------------------------ */

export type Map3WeatherTier = 'full' | 'low';

export interface Map3WeatherRigOptions {
  seed?: number;
  /** 'low' degrades to today's behaviour: no new meshes, clear look. */
  tier?: Map3WeatherTier;
  /** Square extent of the precipitation field in metres. */
  extentM?: number;
  precipitationCount?: number;
  splashCount?: number;
  initial?: Map3WeatherId;
}

export interface Map3WeatherRig {
  group: THREE.Group;
  controller: Map3WeatherController;
  /** Added draw calls when tier is full: exactly 2. */
  stats: { draws: number; objects: number };
  update(elapsedSeconds: number, dtSeconds: number): void;
  dispose(): void;
}

export function createMap3WeatherRig(options: Map3WeatherRigOptions = {}): Map3WeatherRig {
  const tier = options.tier ?? 'full';
  const pin = resolveMap3WeatherPinFromEnvironment();
  const initial = pin ?? options.initial ?? 'clear';
  const controller = new Map3WeatherController(
    tier === 'low' ? 'clear' : initial, tier === 'low' ? 'clear' : pin);
  const group = new THREE.Group();
  group.name = 'map3-weather-rig';
  const disposables: Array<{ dispose(): void }> = [];
  let draws = 0;

  if (tier === 'full') {
    const extent = options.extentM ?? 200;
    const pCount = options.precipitationCount ?? 6000;
    const originAttr = new Float32Array(pCount * 3);
    const seedAttr = new Float32Array(pCount);
    fillUniformPrecipitation(originAttr, seedAttr, pCount, 0, 0, extent, extent);
    const quad = createPrecipQuad();
    const rainGeo = new THREE.InstancedBufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(quad.positions, 3));
    rainGeo.setAttribute('uv', new THREE.BufferAttribute(quad.uvs, 2));
    rainGeo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(originAttr, 3));
    rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));
    rainGeo.instanceCount = pCount;
    rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, 0), extent);
    const rainMat = createUniformPrecipitationMaterial(
      map3WeatherShared.time, map3WeatherShared.flash,
      map3WeatherShared.stormAmount, map3WeatherShared.snowAmount,
      map3WeatherShared.precipitationRate);
    const rain = new THREE.Mesh(rainGeo, rainMat);
    rain.name = 'map3-weather-precipitation';
    rain.frustumCulled = false;
    rain.renderOrder = 6;
    group.add(rain);
    disposables.push(rainGeo, rainMat);

    const sCount = options.splashCount ?? 300;
    const splashPos = new Float32Array(sCount * 3);
    const splashSeed = new Float32Array(sCount);
    fillSplashCentres(splashPos, splashSeed, sCount, 0, 0, extent, extent);
    const squad = createSplashQuad();
    const splashGeo = new THREE.InstancedBufferGeometry();
    splashGeo.setAttribute('position', new THREE.BufferAttribute(squad.positions, 3));
    splashGeo.setAttribute('uv', new THREE.BufferAttribute(squad.uvs, 2));
    splashGeo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(splashPos, 3));
    splashGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(splashSeed, 1));
    splashGeo.instanceCount = sCount;
    splashGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), extent);
    const splashMat = createSplashMaterial(map3WeatherShared.time);
    const splash = new THREE.Mesh(splashGeo, splashMat);
    splash.name = 'map3-weather-splash-rings';
    splash.frustumCulled = false;
    splash.renderOrder = 6;
    group.add(splash);
    disposables.push(splashGeo, splashMat);
    draws = 2;
  }

  const flash = new THREE.PointLight(0xdce8ff, 0, 120, 1.4);
  flash.position.set(0, 16, 0);
  group.add(flash);

  installMap3WeatherDebugHook(controller);
  let elapsed = 0;

  return {
    group,
    controller,
    stats: { draws, objects: tier === 'full' ? 2 : 0 },
    update(elapsedSeconds: number, dtSeconds: number): void {
      elapsed = elapsedSeconds;
      const d = controller.update(dtSeconds);
      publishMap3WeatherShared(d, elapsed, controller.effectiveTarget);
      const row = map3WeatherPreset(controller.effectiveTarget);
      driveMap3Lightning(
        elapsedSeconds,
        flash as unknown as { intensity: number },
        map3WeatherShared.flash as unknown as { value: number },
        tier === 'full' && row.lightning && d.stormAmount > 0.03,
      );
      if (tier === 'low') {
        (map3WeatherShared.flash as unknown as { value: number }).value = 0;
        flash.intensity = 0;
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
