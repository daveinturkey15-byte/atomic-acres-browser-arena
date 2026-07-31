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
  // Deep sunset: violet zenith into burnt orange at the horizon.
  'sunset-farmland': Object.freeze([
    [0, '#2a1a4d'],
    [0.34, '#6c3b7a'],
    [0.62, '#c8613f'],
    [0.84, '#f2a15a'],
    [1, '#f6d2a1'],
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

function gradientTexture(preset: SkyBackdropPreset): THREE.Texture {
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sky backdrop requires a 2D context');
  const gradient = context.createLinearGradient(0, 0, 0, height);
  for (const [offset, css] of SKY_BACKDROP_GRADIENTS[preset]) gradient.addColorStop(offset, css);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, height);
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
