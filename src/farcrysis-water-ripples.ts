/**
 * farcrysis-water-ripples.ts — HF-394 "the water needs to look better".
 *
 * Procedural, fully deterministic ripple detail shared by every farcrysis
 * water surface (lagoon plane, inline deep/shallow layers, vista ocean).
 *
 * Why a normal map and not displaced geometry: the visible lagoon plane sits
 * at the ONE authored waterline (water-authoring FARCRYSIS_WATER.level,
 * host-authoritative and profile-invariant) and the gameplay buoyancy field
 * (sampleOcean) runs on the simulation clock while this presentation layer
 * runs on performance.now(). Displacing the authored waterline on a different
 * timebase would visibly disagree with the player's own bob; shading detail
 * cannot. Normal maps cost two extra texture fetches per water fragment —
 * zero new draw calls, zero new full-screen passes, so the HF-374
 * first-presentation fence is not stressed.
 *
 * Determinism contract: rippleHeight()/rippleNormalDerivative() are pure
 * functions of their arguments with NO Math.random and no clock input, so
 * the generated texture is byte-identical every boot and in every test.
 *
 * Presentation only — no colliders, no gameplay authority.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tileable ripple height field
// ---------------------------------------------------------------------------

type RippleBand = Readonly<{
  /** Integer height-field cycles across the tile in U (texture X). */
  uCycles: number;
  /** Integer cycles in V (texture Z). Integer cycles ⇒ seamless wrapping. */
  vCycles: number;
  /** Relative amplitude (unnormalised; the field self-normalises). */
  amplitude: number;
  phase: number;
}>;

/**
 * Four crossing swell directions with descending amplitude — the same
 * layered-spectrum idea as the authoritative OCEAN_BANDS table, but this is
 * pure shading detail at centimetre scale and feeds NO physics consumer.
 * Deliberately NOT a uniform sine grid: directions cross so the interference
 * never reads as a repeating diamond.
 */
export const WATER_RIPPLE_BANDS: readonly RippleBand[] = Object.freeze([
  Object.freeze({ uCycles: 2, vCycles: 5, amplitude: 1.0, phase: 0.0 }),
  Object.freeze({ uCycles: 5, vCycles: -3, amplitude: 0.62, phase: 1.7 }),
  Object.freeze({ uCycles: -7, vCycles: 4, amplitude: 0.38, phase: 4.1 }),
  Object.freeze({ uCycles: 11, vCycles: 8, amplitude: 0.22, phase: 2.6 }),
]);

/** Height of the tileable ripple field at unit-tile coordinates (u, v). */
export function rippleHeight(u: number, v: number): number {
  let h = 0;
  for (const band of WATER_RIPPLE_BANDS) {
    h += band.amplitude
      * Math.sin(2 * Math.PI * (band.uCycles * u + band.vCycles * v) + band.phase);
  }
  return h;
}

/** Analytic partial derivatives (dh/du, dh/dv) of rippleHeight at (u, v). */
export function rippleNormalDerivative(u: number, v: number): Readonly<{ du: number; dv: number }> {
  let du = 0;
  let dv = 0;
  for (const band of WATER_RIPPLE_BANDS) {
    const c = band.amplitude
      * Math.cos(2 * Math.PI * (band.uCycles * u + band.vCycles * v) + band.phase)
      * 2 * Math.PI;
    du += c * band.uCycles;
    dv += c * band.vCycles;
  }
  return { du, dv };
}

// ---------------------------------------------------------------------------
// Tangent-space normal texture
// ---------------------------------------------------------------------------

const RIPPLE_TEXTURE_SIZE = 256;
/** Bake-time bump strength applied to the gradient before normalisation. */
const RIPPLE_BAKE_STRENGTH = 0.85;

let cachedCanvas: HTMLCanvasElement | null | undefined;

function createRippleCanvas(): HTMLCanvasElement | null {
  if (cachedCanvas !== undefined) return cachedCanvas;
  cachedCanvas = null;
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = RIPPLE_TEXTURE_SIZE;
    canvas.height = RIPPLE_TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const image = ctx.createImageData(RIPPLE_TEXTURE_SIZE, RIPPLE_TEXTURE_SIZE);
    const data = image.data;
    for (let py = 0; py < RIPPLE_TEXTURE_SIZE; py++) {
      const v = py / RIPPLE_TEXTURE_SIZE;
      for (let px = 0; px < RIPPLE_TEXTURE_SIZE; px++) {
        const u = px / RIPPLE_TEXTURE_SIZE;
        // Sample the derivative half a texel in so the wrap seam uses the
        // neighbouring tile's value — keeps the seam invisible.
        const eps = 1 / RIPPLE_TEXTURE_SIZE;
        const { du, dv } = rippleNormalDerivative(u + eps / 2, v + eps / 2);
        // Left-handed tangent space used by three.js normal maps: +X red,
        // +Y green (flipped with normalScale.x/y sign conventions), +Z out.
        const invLen = 1 / Math.hypot(RIPPLE_BAKE_STRENGTH * du, RIPPLE_BAKE_STRENGTH * dv, 1);
        const nx = -RIPPLE_BAKE_STRENGTH * du * invLen;
        const ny = -RIPPLE_BAKE_STRENGTH * dv * invLen;
        const nz = invLen;
        const o = (py * RIPPLE_TEXTURE_SIZE + px) * 4;
        data[o + 0] = Math.round((nx * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    cachedCanvas = canvas;
    return canvas;
  } catch {
    return null;
  }
}

export type WaterRippleTexture = Readonly<{
  texture: THREE.CanvasTexture;
}>;

/**
 * A ripple normal texture instance. Callers choose their own repeat/scale;
 * pass the returned texture to registerScrollingWaterTexture() so the shared
 * animateWaterFX hook scrolls it.
 * Returns null-safe: headless environments simply omit the map.
 */
export function createWaterRippleTexture(
  repeatX: number,
  repeatY: number,
): WaterRippleTexture | null {
  const canvas = createRippleCanvas();
  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return { texture };
}

// ---------------------------------------------------------------------------
// Scroll animation registry
// ---------------------------------------------------------------------------

type ScrollingTexture = Readonly<{ tex: THREE.Texture; speedU: number; speedV: number }>;

/**
 * Bounded registry of textures scrolled by animateWaterFX. Caps at 32 so
 * repeated arena rebuilds (review copies, hot reload) can never grow it
 * without bound; oldest entries drop out and are garbage-collected with
 * their scene.
 */
const MAX_SCROLLING_TEXTURES = 32;
const scrollingTextures: ScrollingTexture[] = [];

export function registerScrollingWaterTexture(
  texture: THREE.Texture,
  speedU: number,
  speedV: number,
): void {
  if (scrollingTextures.some((entry) => entry.tex === texture)) return;
  scrollingTextures.push({ tex: texture, speedU, speedV });
  if (scrollingTextures.length > MAX_SCROLLING_TEXTURES) scrollingTextures.shift();
}

/** Test hook: how many textures are currently registered for scrolling. */
export function scrollingWaterTextureCount(): number {
  return scrollingTextures.length;
}

/**
 * Advance every registered texture along its own drift direction. Two
 * surfaces sharing one texture instance share one offset — give each
 * material its own createWaterRippleTexture() instance when speeds differ.
 */
export function animateWaterRippleTextures(timeSeconds: number): void {
  for (const { tex, speedU, speedV } of scrollingTextures) {
    tex.offset.set(
      ((timeSeconds * speedU) % 1 + 1) % 1,
      ((timeSeconds * speedV) % 1 + 1) % 1,
    );
    if (tex.matrixAutoUpdate) tex.updateMatrix();
  }
}
