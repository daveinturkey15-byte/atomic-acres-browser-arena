/**
 * NaN-scan integrity test for the farcrysis arena geometry.
 *
 * Boot smoke reference: pass74-arena-boot-smoke (farcrysis) logged
 * "THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN"
 * three times on boot, i.e. three geometries carry NaN positions.
 *
 * This test builds every farcrysis geometry and scans each position
 * attribute for NaN so offenders are located exactly at unit level.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';

function fakeCanvasContext() {
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
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = vi.fn();
        return target[prop];
      }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: {} as Record<string, string> },
    body: { appendChild: () => undefined },
  });
}

function collectGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const found: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    const anyObj = obj as unknown as { geometry?: THREE.BufferGeometry };
    if (anyObj.geometry) {
      found.push(anyObj.geometry);
    }
  });
  return found;
}

describe('farcrysis geometry position integrity', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('every position attribute in the built arena is finite (no NaN)', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);
    const geometries = collectGeometries(scene);
    expect(geometries.length).toBeGreaterThan(0);

    const bad: string[] = [];
    for (const geom of geometries) {
      const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!pos) continue;
      let nanCount = 0;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i] as number)) nanCount++;
      }
      if (nanCount > 0) {
        bad.push(`${geom.type}#${geom.id}: ${nanCount} non-finite of ${pos.count} verts`);
      }
    }
    expect(bad, `NaN positions in:\n${bad.join('\n')}`).toEqual([]);
  });
});
