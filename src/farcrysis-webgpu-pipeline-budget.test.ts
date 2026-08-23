/**
 * HF-374 regression: the farcrysis arena's WebGPU shader-pipeline budget.
 *
 * WHAT BROKE. The owner could not boot farcrysis while playing. Every
 * automated boot check in this repo is headless, and headless Chromium here
 * cannot create a WebGPU device, so "six arenas green" only ever proved the
 * WebGL2 compatibility route — and `_applyTslFoliage` is skipped entirely on
 * WebGL2. On the real WebGPU route the arena built ONE distinct TSL node graph
 * per foliage layer (86 of them), because every layer baked its own colour,
 * dapple strength and bounding-box-derived sway height into the graph as
 * literal nodes, and three keys a shader program by node-object identity.
 *
 * Arena admission forces a single full-coverage draw with frustum culling
 * disabled and then fences the GPU queue for 12 s (legacy-main
 * `coverage-submit-fence`). Realising ~86 fresh WGSL programs and pipelines
 * inside that one submission never completed:
 *
 *   [Farcrysis map selection failed] Error: WebGPU queue completion exceeded
 *   12000 ms for submission 22
 *
 * and because the same stuck submission then failed every later fence, no
 * arena could be selected afterwards either — the session was dead, which is
 * exactly what "i couldnt get farcrysis to boot" looked like.
 *
 * WHAT THIS GUARDS. Distinct node graphs are distinct pipelines. A unit test
 * cannot create a WebGPU device, but it CAN count the graphs the arena builds,
 * which is the quantity that actually blew the budget. It also pins the WebGL2
 * gate, because losing that gate is how this cost would reach the compat route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { TSL_FOLIAGE_MAX_DISTINCT_GRAPHS, tslResetWindUniforms } from './farcrysis-tsl-foliage';

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif',
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData') {
        return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
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
}

/** `renderBackend` drives the one backend gate inside _applyTslFoliage. */
function stubCanvasDocument(renderBackend?: string): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: renderBackend === undefined ? {} : { renderBackend } },
    body: { appendChild: () => undefined },
  });
}

type NodeMaterialLike = THREE.Material & {
  isNodeMaterial?: boolean;
  customProgramCacheKey: () => string;
};

/**
 * Every node material in the arena, keyed the way three keys a shader program:
 * `NodeMaterial.customProgramCacheKey()` is literally what the renderer feeds
 * into its node-builder cache, so one distinct value here is one WGSL program
 * and one pipeline family on the device.
 */
function nodeMaterialProgramKeys(root: THREE.Object3D): string[] {
  const keys: string[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    const holder = object as unknown as { material?: THREE.Material | THREE.Material[] };
    const materials = Array.isArray(holder.material)
      ? holder.material
      : holder.material ? [holder.material] : [];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      const candidate = material as NodeMaterialLike;
      if (candidate.isNodeMaterial !== true) continue;
      keys.push(candidate.customProgramCacheKey());
    }
  });
  return keys;
}

describe('HF-374 farcrysis WebGPU pipeline budget', () => {
  beforeEach(() => tslResetWindUniforms());
  afterEach(() => vi.unstubAllGlobals());

  it('builds many foliage node materials but only a bounded number of programs', () => {
    stubCanvasDocument('webgpu');
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const keys = nodeMaterialProgramKeys(scene);
    const distinct = new Set(keys);

    // Sharing has to be real: the arena must still author foliage node
    // materials in bulk, otherwise a future change that silently drops the
    // whole TSL layer would pass this test by building nothing.
    expect(keys.length).toBeGreaterThanOrEqual(40);
    // ...and they must collapse onto a bounded set of programs. At the time of
    // the fix this is 5 for 86 materials; the ceiling is the bucket ladder.
    expect(
      distinct.size,
      `farcrysis built ${distinct.size} distinct WebGPU node-material programs from `
      + `${keys.length} materials; arena admission must realise every one of them inside a `
      + 'single fenced coverage submission (HF-374)',
    ).toBeLessThanOrEqual(TSL_FOLIAGE_MAX_DISTINCT_GRAPHS);
    // The ratio is the actual protection — one program per layer is the bug.
    expect(distinct.size).toBeLessThan(keys.length / 4);
  });

  it('leaves the WebGL2 compatibility route on plain standard materials', () => {
    stubCanvasDocument('webgl2');
    const scene = new THREE.Scene();
    buildFarcrysis(scene);
    // WebGLRenderer cannot compile MeshStandardNodeMaterial in this repo's
    // compat path, so the gate must keep node materials off it entirely.
    expect(nodeMaterialProgramKeys(scene)).toEqual([]);
  });
});
