import * as THREE from 'three';

export type SkyBackdropPreset = 'sunset-farmland' | 'industrial-night' | 'airport-dawn' | 'indoor-range';

export const SKY_BACKDROP_TEXTURE_SIZE = Object.freeze({ width: 2_048, height: 1_024 });
export const ATOMIC_ACRES_GENERATED_SKY_ASSET_URL = './assets/original/skies/atomic-acres-sunset.webp';
export const ATOMIC_ACRES_GENERATED_SKY_PROVENANCE_PATH = 'source-assets/skies/atomic-acres-sunset.provenance.json';
export const RUSTWORKS_GENERATED_SKY_ASSET_URL = './assets/original/skies/rustworks-industrial-night.webp';
export const RUSTWORKS_GENERATED_SKY_PROVENANCE_PATH = 'source-assets/skies/rustworks-industrial-night.provenance.json';
export const TERMINAL_GENERATED_SKY_ASSET_URL = './assets/original/skies/terminal-airport-dawn.webp';
export const TERMINAL_GENERATED_SKY_PROVENANCE_PATH = 'source-assets/skies/terminal-airport-dawn.provenance.json';
export const SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS = 4_000;

export type SkyBackdropStatus = 'procedural-ready' | 'asset-loading' | 'asset-ready' | 'procedural-fallback';

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
export const SKY_BACKDROP_CLOUDS: Readonly<Record<SkyBackdropPreset, Readonly<{
  count: number;
  bandTop: number;
  bandBottom: number;
  rgb: [number, number, number];
  shadowRgb: [number, number, number];
  alpha: number;
  scale: number;
} | null>>> = Object.freeze({
  'sunset-farmland': Object.freeze({
    count: 34, bandTop: 0.18, bandBottom: 0.56,
    rgb: [255, 188, 142] as [number, number, number], shadowRgb: [74, 42, 91] as [number, number, number],
    alpha: 0.56, scale: 0.72,
  }),
  'industrial-night': Object.freeze({
    count: 16, bandTop: 0.2, bandBottom: 0.54,
    rgb: [72, 101, 128] as [number, number, number], shadowRgb: [8, 18, 34] as [number, number, number],
    alpha: 0.26, scale: 0.82,
  }),
  'airport-dawn': Object.freeze({
    count: 38, bandTop: 0.12, bandBottom: 0.55,
    rgb: [255, 255, 255] as [number, number, number], shadowRgb: [105, 140, 167] as [number, number, number],
    alpha: 0.66, scale: 0.68,
  }),
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
export const SKY_BACKDROP_SUN: Readonly<Record<SkyBackdropPreset, Readonly<{
  x: number;
  y: number;
  coreRgb: [number, number, number];
  glowRgb: [number, number, number];
  coreRadius: number;
  glowRadius: number;
} | null>>> = Object.freeze({
  'sunset-farmland': Object.freeze({ x: 0.3, y: 0.5, coreRgb: [255, 236, 190] as [number, number, number], glowRgb: [255, 158, 64] as [number, number, number], coreRadius: 18, glowRadius: 92 }),
  'industrial-night': null,
  'airport-dawn': Object.freeze({ x: 0.72, y: 0.38, coreRgb: [255, 252, 240] as [number, number, number], glowRgb: [255, 240, 205] as [number, number, number], coreRadius: 14, glowRadius: 70 }),
  'indoor-range': null,
});

function paintSun(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  const sun = SKY_BACKDROP_SUN[preset];
  if (!sun) return;
  const cx = sun.x * width;
  const cy = sun.y * height;
  const resolutionScale = width / 512;
  const glowRadius = sun.glowRadius * resolutionScale;
  const coreRadius = sun.coreRadius * resolutionScale;
  const [gr, gg, gb] = sun.glowRgb;
  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  glow.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0.85)`);
  glow.addColorStop(0.4, `rgba(${gr}, ${gg}, ${gb}, 0.32)`);
  glow.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  context.fill();
  const [cr, cg, cb] = sun.coreRgb;
  const core = context.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
  core.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 1)`);
  core.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, 0.9)`);
  core.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  context.fillStyle = core;
  context.beginPath();
  context.arc(cx, cy, coreRadius, 0, Math.PI * 2);
  context.fill();
}

function paintNightDetails(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  if (preset !== 'industrial-night') return;
  const random = skyRandom(8_611);
  // A soft Milky-Way band gives the night map large-scale structure without a
  // low-resolution panorama or a billboard edge.
  context.save();
  context.translate(width * 0.58, height * 0.2);
  context.rotate(-0.16);
  context.scale(1, 0.18);
  const galaxy = context.createRadialGradient(0, 0, 0, 0, 0, width * 0.43);
  galaxy.addColorStop(0, 'rgba(116, 145, 180, 0.16)');
  galaxy.addColorStop(0.42, 'rgba(72, 99, 137, 0.1)');
  galaxy.addColorStop(1, 'rgba(40, 58, 88, 0)');
  context.fillStyle = galaxy;
  context.beginPath();
  context.arc(0, 0, width * 0.43, 0, Math.PI * 2);
  context.fill();
  context.restore();
  for (let index = 0; index < 520; index += 1) {
    const x = random() * width;
    const y = random() * height * 0.53;
    const radius = 0.45 + random() * (index % 37 === 0 ? 1.8 : 0.9);
    const alpha = 0.28 + random() * 0.62;
    context.fillStyle = `rgba(218, 232, 255, ${alpha.toFixed(3)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function paintWrappedCloudPuff(
  context: CanvasRenderingContext2D,
  width: number,
  x: number,
  y: number,
  radius: number,
  horizontalScale: number,
  rotation: number,
  rgb: readonly [number, number, number],
  alpha: number,
): void {
  const [r, g, b] = rgb;
  for (const wrap of [-width, 0, width]) {
    const wrappedX = x + wrap;
    if (wrappedX + radius * horizontalScale < 0 || wrappedX - radius * horizontalScale > width) continue;
    context.save();
    context.translate(wrappedX, y);
    context.rotate(rotation);
    context.scale(horizontalScale, 1);
    const blob = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    blob.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
    blob.addColorStop(0.58, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.72).toFixed(3)})`);
    blob.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    context.fillStyle = blob;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function paintClouds(context: CanvasRenderingContext2D, preset: SkyBackdropPreset, width: number, height: number): void {
  const config = SKY_BACKDROP_CLOUDS[preset];
  if (!config) return;
  const random = skyRandom(preset.length * 7919 + 13);
  const [r, g, b] = config.rgb;
  const sun = SKY_BACKDROP_SUN[preset];
  const resolutionScale = width / 512;
  for (let index = 0; index < config.count; index += 1) {
    const cx = random() * width;
    const cy = (config.bandTop + random() * (config.bandBottom - config.bandTop)) * height;
    const puffs = 7 + Math.floor(random() * 6);
    const baseRadius = (18 + random() * 30) * config.scale * resolutionScale;
    const bankRotation = (random() - 0.5) * 0.16;
    // Clouds nearer the sun pick up its warm light for a lit-edge look.
    const sunLift = sun ? Math.max(0, 1 - Math.hypot(cx - sun.x * width, cy - sun.y * height) / (sun.glowRadius * resolutionScale * 2.2)) : 0;
    for (let puff = 0; puff < puffs; puff += 1) {
      const px = cx + (random() - 0.5) * baseRadius * 3.4;
      const py = cy + (random() - 0.5) * baseRadius * 0.9;
      const radius = baseRadius * (0.5 + random() * 0.7);
      const density = config.alpha * (0.4 + random() * 0.6);
      const lr = Math.min(255, Math.round(r + (255 - r) * sunLift * 0.5));
      const lg = Math.min(255, Math.round(g + (255 - g) * sunLift * 0.35));
      const lb = Math.min(255, Math.round(b + (255 - b) * sunLift * 0.2));
      const horizontalScale = 1.25 + random() * 1.35;
      paintWrappedCloudPuff(
        context, width, px, py + radius * 0.18, radius * 1.04, horizontalScale, bankRotation,
        config.shadowRgb, density * 0.64,
      );
      paintWrappedCloudPuff(
        context, width, px, py - radius * 0.08, radius, horizontalScale, bankRotation,
        [lr, lg, lb], density,
      );
    }
  }
}

function configureEquirectangularTexture(texture: THREE.Texture, name: string): THREE.Texture {
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // The equirectangular azimuth is periodic. Clamp-to-edge left a full
  // background triangle sampling one edge whenever the review camera crossed
  // the 0/1 longitude boundary, which read as a translucent wedge in both
  // renderer backends even though the source edge join itself was clean.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function gradientTexture(preset: SkyBackdropPreset): THREE.Texture {
  const { width, height } = SKY_BACKDROP_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sky backdrop requires a 2D context');
  const gradient = context.createLinearGradient(0, 0, 0, height);
  for (const [offset, css] of SKY_BACKDROP_GRADIENTS[preset]) gradient.addColorStop(offset, css);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  paintNightDetails(context, preset, width, height);
  paintSun(context, preset, width, height);
  paintClouds(context, preset, width, height);
  return configureEquirectangularTexture(
    new THREE.CanvasTexture(canvas),
    `pass66-sky-backdrop-${preset}`,
  );
}

const backdropCache = new Map<SkyBackdropPreset, THREE.Texture>();
const generatedSkyTextures = new Map<SkyBackdropPreset, THREE.Texture>();
const generatedSkyRequests = new Map<SkyBackdropPreset, Promise<THREE.Texture | null>>();
let backdropLifetime = 0;
const sceneBackdropAdmissions = new WeakMap<THREE.Scene, Readonly<{
  application: number;
  settled: Promise<SkyBackdropStatus>;
}>>();

function sceneBackdropStatus(scene: THREE.Scene): SkyBackdropStatus {
  const status = scene.userData.pass66SkyBackdropStatus;
  return status === 'asset-loading' || status === 'asset-ready' || status === 'procedural-fallback'
    ? status
    : 'procedural-ready';
}

export function skyBackdropPreset(preset: string): SkyBackdropPreset {
  return preset === 'sunset-farmland' || preset === 'industrial-night'
    || preset === 'airport-dawn' || preset === 'indoor-range'
    ? preset
    : 'airport-dawn';
}

export function skyBackdropAssetForPreset(preset: string): string | null {
  const resolved = skyBackdropPreset(preset);
  if (resolved === 'sunset-farmland') return ATOMIC_ACRES_GENERATED_SKY_ASSET_URL;
  if (resolved === 'industrial-night') return RUSTWORKS_GENERATED_SKY_ASSET_URL;
  if (resolved === 'airport-dawn') return TERMINAL_GENERATED_SKY_ASSET_URL;
  return null;
}

function requestGeneratedSkyTexture(
  preset: SkyBackdropPreset,
  assetUrl: string,
): Promise<THREE.Texture | null> {
  const loaded = generatedSkyTextures.get(preset);
  if (loaded) return Promise.resolve(loaded);
  const pending = generatedSkyRequests.get(preset);
  if (pending) return pending;
  const requestLifetime = backdropLifetime;
  let request: Promise<THREE.Texture | null>;
  request = new Promise((resolve) => {
    try {
      new THREE.ImageLoader().load(
        assetUrl,
        (image) => {
          const texture = new THREE.Texture(image);
          configureEquirectangularTexture(texture, `pass66-generated-sky-backdrop-${preset}`);
          // All sampler/mapping state is final before this single upload
          // version is exposed to either renderer backend. TextureLoader
          // marks its placeholder once internally and our former onLoad
          // configuration marked it a second time; a WebGPU backend could
          // observe both versions and reject the duplicate initialization.
          texture.needsUpdate = true;
          if (requestLifetime !== backdropLifetime) {
            texture.dispose();
            resolve(null);
            return;
          }
          generatedSkyTextures.set(preset, texture);
          resolve(texture);
        },
        undefined,
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
  generatedSkyRequests.set(preset, request);
  void request.then(() => {
    if (generatedSkyRequests.get(preset) === request) generatedSkyRequests.delete(preset);
  });
  return request;
}

/**
 * Applies the arena's procedural sky immediately on every renderer backend.
 * Each outdoor arena then admits its selected high-detail source asynchronously.
 * A failed or stale decode leaves the procedural CanvasTexture in place, so sky
 * enhancement can never block arena admission or replace the frame with white.
 */
export function applySkyBackdrop(
  scene: THREE.Scene,
  preset: string,
  recordSelectedAssetRequest?: (url: string) => void,
): THREE.Texture {
  const resolved = skyBackdropPreset(preset);
  let texture = backdropCache.get(resolved);
  if (!texture) {
    texture = gradientTexture(resolved);
    backdropCache.set(resolved, texture);
  }
  scene.background = texture;
  scene.userData.pass66SkyBackdropPreset = resolved;
  const application = Number(scene.userData.pass66SkyBackdropApplication ?? 0) + 1;
  scene.userData.pass66SkyBackdropApplication = application;
  scene.userData.pass66SkyBackdropStatus = 'procedural-ready' satisfies SkyBackdropStatus;
  scene.userData.pass66SkyBackdropSource = 'procedural-canvas';
  scene.userData.pass66SkyBackdropAssetUrl = null;
  sceneBackdropAdmissions.delete(scene);

  const assetUrl = skyBackdropAssetForPreset(resolved);
  if (assetUrl) {
    scene.userData.pass66SkyBackdropStatus = 'asset-loading' satisfies SkyBackdropStatus;
    scene.userData.pass66SkyBackdropAssetUrl = assetUrl;
    recordSelectedAssetRequest?.(assetUrl);
    const settled = requestGeneratedSkyTexture(resolved, assetUrl).then((loaded): SkyBackdropStatus => {
      if (scene.userData.pass66SkyBackdropApplication !== application
        || scene.userData.pass66SkyBackdropPreset !== resolved) return sceneBackdropStatus(scene);
      if (!loaded) {
        scene.userData.pass66SkyBackdropStatus = 'procedural-fallback' satisfies SkyBackdropStatus;
        return 'procedural-fallback';
      }
      scene.background = loaded;
      scene.userData.pass66SkyBackdropStatus = 'asset-ready' satisfies SkyBackdropStatus;
      scene.userData.pass66SkyBackdropSource = 'generated-equirectangular-webp';
      return 'asset-ready';
    });
    sceneBackdropAdmissions.set(scene, Object.freeze({ application, settled }));
  }
  return texture;
}

/**
 * Seals the selected backdrop before native-WebGPU presentation prewarm. Each
 * generated image is local and normally settles immediately; the bound prevents
 * a corrupt/stalled decode from blocking map admission. On timeout the current
 * application is invalidated, so a late decode may populate the shared cache
 * for a later map switch but cannot mutate the already-compiled live scene.
 */
export async function waitForSkyBackdropAdmission(
  scene: THREE.Scene,
  timeoutMs = SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS,
): Promise<SkyBackdropStatus> {
  const admission = sceneBackdropAdmissions.get(scene);
  if (!admission) return sceneBackdropStatus(scene);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return admission.settled;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    admission.settled.then((status) => Object.freeze({ timedOut: false as const, status })),
    new Promise<Readonly<{ timedOut: true; status: SkyBackdropStatus }>>((resolve) => {
      timeout = setTimeout(() => resolve(Object.freeze({ timedOut: true, status: 'procedural-fallback' })), timeoutMs);
    }),
  ]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (!outcome.timedOut) return outcome.status;

  if (scene.userData.pass66SkyBackdropApplication === admission.application) {
    // Bump the application generation before the outstanding request settles.
    // Its completion can warm the process cache, but the stale continuation is
    // now forbidden from replacing this scene's admitted procedural backdrop.
    scene.userData.pass66SkyBackdropApplication = admission.application + 1;
    scene.userData.pass66SkyBackdropStatus = 'procedural-fallback' satisfies SkyBackdropStatus;
    scene.userData.pass66SkyBackdropSource = 'procedural-canvas';
  }
  if (sceneBackdropAdmissions.get(scene) === admission) sceneBackdropAdmissions.delete(scene);
  return 'procedural-fallback';
}

/** Terminal teardown only; never call while a frame may still sample these. */
export function disposeSkyBackdrops(): void {
  backdropLifetime += 1;
  generatedSkyRequests.clear();
  for (const texture of generatedSkyTextures.values()) texture.dispose();
  generatedSkyTextures.clear();
  for (const texture of backdropCache.values()) texture.dispose();
  backdropCache.clear();
}
