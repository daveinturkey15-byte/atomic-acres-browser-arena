import * as THREE from 'three';

export type SkyBackdropPreset = 'sunset-farmland' | 'industrial-night' | 'airport-dawn' | 'indoor-range';

type GradientStop = readonly [offset: number, css: string];

/**
 * Owner-directed per-arena sky gradients.
 *
 * This is a `scene.background` equirectangular gradient rather than dome
 * geometry, so it is identical on the WebGPU path and the WebGL2 compatibility
 * path (Firefox / Safari have no WebGPU by default). It is drawn behind every
 * object, so it can never be frustum-clipped by the 180 m camera far plane nor
 * washed out by the gameplay fog band - both of which previously left arenas
 * with no visible sky at all.
 */
const SKY_BACKDROP_GRADIENTS: Readonly<Record<SkyBackdropPreset, readonly GradientStop[]>> = Object.freeze({
  // Deep sunset: indigo zenith through violet and a broad burnt-orange band
  // into a glowing gold horizon. Owner wanted a much richer Atomic Acres sky.
  'sunset-farmland': Object.freeze([
    [0, '#150d38'],
    [0.18, '#2c1654'],
    [0.38, '#5c2566'],
    [0.55, '#9c3a5e'],
    [0.68, '#d4553f'],
    [0.8, '#f07f36'],
    [0.9, '#fca94a'],
    [1, '#ffd98a'],
  ] as const),
  // True night: near-black zenith with a faint aurora-green horizon lift.
  'industrial-night': Object.freeze([
    [0, '#04070f'],
    [0.42, '#0a1526'],
    [0.74, '#13314a'],
    [0.92, '#1c5157'],
    [1, '#27706a'],
  ] as const),
  // Plain bright day for the terminal apron.
  'airport-dawn': Object.freeze([
    [0, '#3f86c9'],
    [0.44, '#79b6e0'],
    [0.78, '#bcd9ec'],
    [1, '#e6eff5'],
  ] as const),
  // Interior range: flat dark ceiling tone, no visible sky.
  'indoor-range': Object.freeze([
    [0, '#151d22'],
    [1, '#232f36'],
  ] as const),
});

/**
 * Per-preset cloud fields baked into the backdrop so every backend (WebGPU and
 * WebGL2/Firefox alike) gets a real sky with clouds, not a flat gradient.
 * Bands are vertical fractions of the texture (0 = zenith, 1 = horizon).
 */
const SKY_BACKDROP_CLOUDS: Readonly<Record<SkyBackdropPreset, Readonly<{
  count: number;
  bandTop: number;
  bandBottom: number;
  rgb: [number, number, number];
  alpha: number;
  scale: number;
} | null>>> = Object.freeze({
  'sunset-farmland': Object.freeze({ count: 26, bandTop: 0.42, bandBottom: 0.82, rgb: [255, 176, 122] as [number, number, number], alpha: 0.5, scale: 1 }),
  'industrial-night': Object.freeze({ count: 10, bandTop: 0.5, bandBottom: 0.8, rgb: [70, 96, 120] as [number, number, number], alpha: 0.22, scale: 1.2 }),
  'airport-dawn': Object.freeze({ count: 30, bandTop: 0.34, bandBottom: 0.86, rgb: [255, 255, 255] as [number, number, number], alpha: 0.62, scale: 1 }),
  'indoor-range': null,
});

function skyRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Per-preset sun disc baked into the backdrop. x is a horizontal fraction of the
 * texture width, y a vertical fraction (0 = zenith, 1 = horizon).
 */
const SKY_BACKDROP_SUN: Readonly<Record<SkyBackdropPreset, Readonly<{
  x: number;
  y: number;
  coreRgb: [number, number, number];
  glowRgb: [number, number, number];
  coreRadius: number;
  glowRadius: number;
} | null>>> = Object.freeze({
  'sunset-farmland': Object.freeze({ x: 0.3, y: 0.86, coreRgb: [255, 236, 190] as [number, number, number], glowRgb: [255, 158, 64] as [number, number, number], coreRadius: 26, glowRadius: 120 }),
  'industrial-night': null,
  'airport-dawn': Object.freeze({ x: 0.72, y: 0.62, coreRgb: [255, 252, 240] as [number, number, number], glowRgb: [255, 240, 205] as [number, number, number], coreRadius: 20, glowRadius: 90 }),
  'indoor-range': null,
});

function paintSun(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  const sun = SKY_BACKDROP_SUN[preset];
  if (!sun) return;
  const cx = sun.x * width;
  const cy = sun.y * height;
  const [gr, gg, gb] = sun.glowRgb;
  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, sun.glowRadius);
  glow.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0.85)`);
  glow.addColorStop(0.4, `rgba(${gr}, ${gg}, ${gb}, 0.32)`);
  glow.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(cx, cy, sun.glowRadius, 0, Math.PI * 2);
  context.fill();
  const [cr, cg, cb] = sun.coreRgb;
  const core = context.createRadialGradient(cx, cy, 0, cx, cy, sun.coreRadius);
  core.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 1)`);
  core.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, 0.9)`);
  core.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  context.fillStyle = core;
  context.beginPath();
  context.arc(cx, cy, sun.coreRadius, 0, Math.PI * 2);
  context.fill();
}

function paintClouds(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  const config = SKY_BACKDROP_CLOUDS[preset];
  if (!config) return;
  const random = skyRandom(preset.length * 7919 + 13);
  const [r, g, b] = config.rgb;
  const sun = SKY_BACKDROP_SUN[preset];
  for (let index = 0; index < config.count; index += 1) {
    const cx = random() * width;
    const cy = (config.bandTop + random() * (config.bandBottom - config.bandTop)) * height;
    const puffs = 5 + Math.floor(random() * 5);
    const baseRadius = (18 + random() * 30) * config.scale;
    // Clouds nearer the sun pick up its warm light for a lit-edge look.
    const sunLift = sun ? Math.max(0, 1 - Math.hypot(cx - sun.x * width, cy - sun.y * height) / (sun.glowRadius * 2.2)) : 0;
    for (let puff = 0; puff < puffs; puff += 1) {
      const px = cx + (random() - 0.5) * baseRadius * 3.4;
      const py = cy + (random() - 0.5) * baseRadius * 0.9;
      const radius = baseRadius * (0.5 + random() * 0.7);
      const density = config.alpha * (0.4 + random() * 0.6);
      const lr = Math.min(255, Math.round(r + (255 - r) * sunLift * 0.5));
      const lg = Math.min(255, Math.round(g + (255 - g) * sunLift * 0.35));
      const lb = Math.min(255, Math.round(b + (255 - b) * sunLift * 0.2));
      const blob = context.createRadialGradient(px, py, 0, px, py, radius);
      blob.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, ${density.toFixed(3)})`);
      blob.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      context.fillStyle = blob;
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function gradientTexture(preset: SkyBackdropPreset): THREE.Texture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sky backdrop requires a 2D context');
  const gradient = context.createLinearGradient(0, 0, 0, height);
  for (const [offset, css] of SKY_BACKDROP_GRADIENTS[preset]) gradient.addColorStop(offset, css);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  paintSun(context, preset, width, height);
  paintClouds(context, preset, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `pass66-sky-backdrop-${preset}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const backdropCache = new Map<SkyBackdropPreset, THREE.Texture>();

export function skyBackdropPreset(preset: string): SkyBackdropPreset {
  return preset === 'sunset-farmland' || preset === 'industrial-night'
    || preset === 'airport-dawn' || preset === 'indoor-range'
    ? preset
    : 'airport-dawn';
}

/**
 * Applies the arena's sky gradient as the scene background on every renderer
 * backend. Textures are cached per preset, so repeated map switches never
 * allocate another canvas upload.
 */
export function applySkyBackdrop(scene: THREE.Scene, preset: string): THREE.Texture {
  const resolved = skyBackdropPreset(preset);
  let texture = backdropCache.get(resolved);
  if (!texture) {
    texture = gradientTexture(resolved);
    backdropCache.set(resolved, texture);
  }
  scene.background = texture;
  scene.userData.pass66SkyBackdropPreset = resolved;
  return texture;
}

/** Terminal teardown only; never call while a frame may still sample these. */
export function disposeSkyBackdrops(): void {
  for (const texture of backdropCache.values()) texture.dispose();
  backdropCache.clear();
}
