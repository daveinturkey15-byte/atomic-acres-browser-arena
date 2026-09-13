/**
 * HF-375 regression: the two farcrysis boot costs that a unit test can hold.
 *
 * WHAT BROKE. farcrysis booted on the real WebGPU route in ~51 s against High
 * Seas' ~24 s. Measuring the arena-transition profiler in installed Chrome put
 * essentially all of the arena-specific excess in two places:
 *
 *   coverage-submit-fence   farcrysis 16563 ms   high-seas 1122 ms
 *   arena-construction      farcrysis  2979 ms   high-seas  246 ms
 *
 * Every other phase (shared gameplay assets, effect prewarm, weapon catalog)
 * is arena-independent and matched between the two.
 *
 * This file guards the two causes that are structural rather than incidental.
 * It cannot create a WebGPU device, but both causes are visible in the scene
 * graph the arena builds, which is what actually drove the cost.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';

/**
 * A canvas stub that RETAINS what was drawn. The other farcrysis suites use a
 * write-only proxy, which is fine for counting textures but cannot see the
 * pixels — and the pixels are the thing the noise change had to leave alone.
 */
function recordingDocument(): { puts: Array<{ width: number; height: number; data: Uint8ClampedArray }> } {
  const puts: Array<{ width: number; height: number; data: Uint8ClampedArray }> = [];
  const gradient = () => ({ addColorStop: vi.fn() });
  const makeContext = (canvas: unknown): CanvasRenderingContext2D => {
    const state: Record<PropertyKey, unknown> = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif', canvas,
    };
    return new Proxy(state, {
      get(target, prop) {
        if (prop === 'createImageData') {
          return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (prop === 'putImageData') {
          return (image: { width: number; height: number; data: Uint8ClampedArray }) => {
            puts.push({ width: image.width, height: image.height, data: image.data });
          };
        }
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
        if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (typeof prop === 'string') {
          if (!(prop in target)) target[prop] = vi.fn();
          return target[prop];
        }
        return undefined;
      },
      set(target, prop, value) { target[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
  };
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => {
      const element: Record<string, unknown> = {
        width: 0, height: 0, style: {},
        setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
      };
      element.getContext = () => makeContext(element);
      return element;
    },
    createElementNS: (_ns: string, _tagName: string) => ({
      width: 0, height: 0, style: {}, src: '',
      setAttribute: () => undefined, removeAttribute: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: { renderBackend: 'webgpu' } },
    body: { appendChild: () => undefined },
  });
  vi.stubGlobal('HTMLCanvasElement', class {});
  return { puts };
}

/** FNV-1a over the byte buffer — stable across platforms and Node versions. */
function digest(bytes: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

describe('HF-375 farcrysis boot cost', () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * `arena-construction` was 2979 ms, and a CPU profile put ~80% of it inside
   * ONE expression: `valueNoise`'s `Math.sin` of an argument around 1e11, which
   * V8 can only evaluate through full Payne-Hanek argument reduction. It is
   * reached four times per octave per pixel across fourteen 512x512 procedural
   * fallback maps.
   *
   * The fix memoises it on the integer lattice, which is a pure-performance
   * change: same arguments, same double, same bytes. That is the property this
   * pins. If a future change to the noise moves these bytes it is an ART change
   * to the fallback textures, not an optimisation — update the digests
   * deliberately and look at the arena, do not "fix the test".
   */
  it('generates byte-identical procedural fallback textures', () => {
    const { puts } = recordingDocument();
    buildFarcrysis(new THREE.Scene());

    // Beach sand is the first thing ensureTextures generates: colour map, then
    // its roughness map, both 512x512. Select by size rather than by index so
    // an unrelated smaller canvas appearing earlier cannot silently shift which
    // texture is being pinned. Only these two are pinned — that is enough,
    // because every procedural map in the file runs through the same noise.
    const sand = puts.filter((put) => put.width === 512 && put.height === 512);
    expect(sand.length).toBeGreaterThanOrEqual(2);
    expect(digest(sand[0].data)).toBe('434a0cf0');
    expect(digest(sand[1].data)).toBe('68c6db34');
    // Generous: this builds the whole arena, and it must still pass on the slow
    // pre-memo path if anyone ever reverts the noise change to compare.
  }, 120_000);

  /**
   * The arena adds its own sun ON TOP of the engine sun the visual definition
   * creates, and both cast. That is deliberate — the Pass 76 regrade tuned the
   * arena's 2.1 against the engine's 3.1 — but the arena's map was set to
   * 4096x4096, making farcrysis the only arena in the game that asked a driver
   * for a 4096 shadow map, and it did so for a light pointing in EXACTLY the
   * same direction as the engine's (both [-18, 22, 25], both aimed at the arena
   * centre). The engine caps its own map at the graphics profile's 2048.
   *
   * No arena light may exceed that engine cap: a second shadow map of the same
   * sun has no business being four times the resolution of the first.
   */
  it('asks for no shadow map larger than the engine profile cap', () => {
    recordingDocument();
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const ENGINE_QUALITY_SHADOW_MAP_SIZE = 2048; // render-profile.ts 'blender'
    const casters: Array<{ name: string; size: number }> = [];
    scene.traverse((object) => {
      const light = object as THREE.Light & { shadow?: THREE.LightShadow; castShadow?: boolean };
      if (!light.isLight || light.castShadow !== true || !light.shadow) return;
      casters.push({ name: light.name || light.type, size: light.shadow.mapSize.width });
    });

    expect(casters.length).toBeGreaterThan(0);
    for (const caster of casters) {
      expect(
        caster.size,
        `farcrysis light '${caster.name}' requests a ${caster.size}x${caster.size} shadow map; `
        + `the engine sun for this arena is capped at ${ENGINE_QUALITY_SHADOW_MAP_SIZE} (HF-375)`,
      ).toBeLessThanOrEqual(ENGINE_QUALITY_SHADOW_MAP_SIZE);
    }
  }, 120_000);
});
