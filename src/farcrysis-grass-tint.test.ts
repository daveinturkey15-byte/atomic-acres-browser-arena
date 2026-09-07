import * as THREE from 'three';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildFarcrysis } from './farcrysis';

/**
 * The grass field shipped 87,280 blades sharing exactly ONE colour value.
 * That is the clearest single tell of cheap foliage: a real sward is never one
 * green, and at gameplay distance the eye reads the variance long before it
 * resolves an individual blade.
 *
 * Per-instance tint rides the existing InstancedMesh draw, so it costs no
 * extra draw call, program or material - which also means nothing else in the
 * frame budget will ever flag its removal. Hence this gate.
 */
function stubCanvasDocument(): void {
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'createImageData') {
        return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      }
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined });
      }
      if (property === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set() { return true; },
  });
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0, style: {}, getContext: () => context,
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    createElementNS: () => ({
      width: 0, height: 0, style: {}, src: '',
      setAttribute: () => undefined, removeAttribute: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined,
    }),
    getElementById: () => null,
    documentElement: { dataset: { renderBackend: 'webgpu' } },
    body: { appendChild: () => undefined },
  });
  vi.stubGlobal('HTMLCanvasElement', class {});
}

describe('farcrysis grass per-instance tint', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('gives every grass chunk real colour variance, not one flat green', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);

    const chunks: THREE.InstancedMesh[] = [];
    arena.root.traverse((node) => {
      if ((node as THREE.InstancedMesh).isInstancedMesh && node.name.startsWith('farcrysis-grass-chunk-')) {
        chunks.push(node as THREE.InstancedMesh);
      }
    });
    expect(chunks.length, 'grass chunks').toBeGreaterThan(0);

    let sampled = 0;
    for (const chunk of chunks) {
      expect(chunk.instanceColor, `${chunk.name} has no instance colour`).toBeTruthy();
      const array = chunk.instanceColor!.array as ArrayLike<number>;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < array.length; i += 1) {
        if (array[i] < min) min = array[i];
        if (array[i] > max) max = array[i];
        sampled += 1;
      }
      // A flat field gives max-min === 0. Require a spread wide enough to read
      // as clumping rather than dithering.
      expect(max - min, `${chunk.name} colour spread`).toBeGreaterThan(0.08);
      // material.color MULTIPLIES and is capped at white, so a factor above 1
      // cannot brighten anything - it just silently clips. Keep inside the band.
      expect(max, `${chunk.name} tint must not exceed 1.0`).toBeLessThanOrEqual(1.0);
      expect(min, `${chunk.name} darkest blade must still read as lit grass`).toBeGreaterThan(0.3);
    }
    expect(sampled, 'tint channels sampled').toBeGreaterThan(10_000);
  }, 300_000);
});
