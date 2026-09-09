/**
 * PASS 84 (lane C) regression: farcrysis instanced layers share one WebGPU
 * program per material variant instead of one per instance count.
 *
 * WHAT BROKE. On the real WebGPU route the first fenced farcrysis submission
 * created 217 render pipelines from 196 distinct vertex shader modules and did
 * not complete inside the 12 s admission fence ("WebGPU queue completion
 * exceeded 12000 ms for submission 1"); the selection rolled back and the
 * stuck submission then failed the next arena's fence as well. Atomic Acres
 * creates 75 pipelines in the same phase and admits.
 *
 * WHY. three r185 keeps an InstancedMesh's matrices in a uniform array while
 * `instanceMatrix.count * 64` fits the uniform-buffer limit, and declares that
 * array in WGSL as `array<mat4x4<f32>, COUNT>` — the allocated capacity is
 * part of the shader text. 108 farcrysis layers were allocated at their exact
 * placement counts, so identical materials compiled to different programs and
 * pipelines, twice (scene pass and shadow pass). Above the limit three uses
 * instanced vertex attributes whose shader carries no count.
 *
 * WHAT THIS GUARDS. Every farcrysis InstancedMesh is allocated through
 * `farcrysisInstancedMesh`, which pads capacity onto the shared count-free
 * path while `count` keeps the authored instance count. A unit test cannot
 * create a WebGPU device, but the capacity is exactly the quantity three bakes
 * into the shader, so pinning it pins the program count.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { FARCRYSIS_INSTANCE_SHARED_CAPACITY, farcrysisInstancedMesh } from './farcrysis-instancing';
import { tslResetWindUniforms } from './farcrysis-tsl-foliage';

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (typeof prop === 'string') { if (!(prop in target)) target[prop] = vi.fn(); return target[prop]; }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(renderBackend: string): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    createElementNS: (_ns: string, _tagName: string) => ({
      width: 0, height: 0, style: {}, src: '',
      setAttribute: () => undefined, removeAttribute: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: { renderBackend } },
    body: { appendChild: () => undefined },
  });
  vi.stubGlobal('HTMLCanvasElement', class {});
}

/** The default WebGPU maxUniformBufferBindingSize; 64 bytes per mat4. */
const UNIFORM_PATH_MAX_INSTANCES = 65536 / 64;

describe('farcrysis instanced layers share count-free WebGPU programs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pads capacity onto the attribute path and keeps the authored count', () => {
    const mesh = farcrysisInstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 7);
    expect(mesh.count).toBe(7);
    expect(mesh.instanceMatrix.count).toBe(FARCRYSIS_INSTANCE_SHARED_CAPACITY);
    expect(FARCRYSIS_INSTANCE_SHARED_CAPACITY).toBeGreaterThan(UNIFORM_PATH_MAX_INSTANCES);
    const large = farcrysisInstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 4000);
    expect(large.count).toBe(4000);
    expect(large.instanceMatrix.count).toBe(4000);
  });

  it('allocates every arena instanced mesh above the uniform-array path', () => {
    tslResetWindUniforms();
    stubCanvasDocument('webgpu');
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const layers: Array<{ name: string; count: number; capacity: number }> = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      layers.push({ name: object.name || '(unnamed)', count: object.count, capacity: object.instanceMatrix.count });
    });
    // The guard has to be looking at a real arena, not an empty scene.
    expect(layers.length).toBeGreaterThanOrEqual(60);

    const onUniformPath = layers.filter((layer) => layer.capacity <= UNIFORM_PATH_MAX_INSTANCES);
    expect(
      onUniformPath.map((layer) => `${layer.name}:${layer.capacity}`),
      'these layers would compile a per-count WGSL uniform array (one program and one pipeline each, twice with shadows)',
    ).toEqual([]);

    // Layers that fit the shared capacity must all share it, so a device with
    // a larger uniform limit still sees one program per material variant.
    const sharedCapacities = new Set(
      layers.filter((layer) => layer.count <= FARCRYSIS_INSTANCE_SHARED_CAPACITY).map((layer) => layer.capacity),
    );
    expect([...sharedCapacities]).toEqual([FARCRYSIS_INSTANCE_SHARED_CAPACITY]);

    // Padding is capacity only: the authored instance counts are untouched.
    for (const layer of layers) {
      expect(layer.count, layer.name).toBeGreaterThan(0);
      expect(layer.count, layer.name).toBeLessThanOrEqual(layer.capacity);
    }
  }, 120_000);
});
