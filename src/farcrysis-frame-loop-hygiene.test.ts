/**
 * Frame-loop hygiene contract for the Farcrysis arena.
 *
 * Two defect classes are pinned here, both found by the Pass 80 frame-loop
 * audit and both invisible to every other suite because they only appear on
 * the SECOND arena build or on the SECOND animated frame:
 *
 *   (a) Rebuild leaks. The animated subsystems keep module-level registries
 *       (`_lodPairs`, `_vines`, `_reeds`, `_foamWashRings`) so their frame
 *       drivers do not have to traverse the scene graph. None of them used
 *       to reset on rebuild, so every arena reload / rematch / map switch
 *       back to farcrysis APPENDED the new arena's entries to the torn-down
 *       one's. The stale entries pinned disposed geometry alive and grew the
 *       per-frame loop linearly with the number of rebuilds, writing
 *       transforms to detached objects.
 *
 *   (b) Time-invariant per-frame work. The wave surface's vertex colours
 *       carry `swellDepthFactor`, which depends only on the vertex's base XZ
 *       and therefore never changes. The frame loop recomputed it for all 625
 *       vertices (a terrain sample each), rewrote a byte-identical colour
 *       buffer, and flagged it for GPU re-upload — every frame, forever.
 *
 * Both contracts are mechanical: registry counts must be identical across two
 * builds, and the colour attribute's upload version must not advance while
 * the position attribute's does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { farcrysisVegetationLodPairCount } from './farcrysis-vegetation';
import { farcrysisDetailAnimationCounts } from './farcrysis-detail';
import {
  farcrysisWaterFxFoamRingCount,
  animateWaterFX,
  waveSurfaceDisplacement,
  swellDepthFactor,
} from './farcrysis-water-fx';

// --- canvas-free document stub (same shape the other farcrysis suites use) --
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

function registrySnapshot() {
  return {
    lodPairs: farcrysisVegetationLodPairCount(),
    foamRings: farcrysisWaterFxFoamRingCount(),
    ...farcrysisDetailAnimationCounts(),
  };
}

describe('farcrysis frame-loop hygiene', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  // (a) Rebuild leaks.
  it('does not accumulate animation registries across arena rebuilds', () => {
    buildFarcrysis(new THREE.Scene());
    const first = registrySnapshot();

    // Every registry must actually be carrying work, or this test would pass
    // vacuously against a build that registered nothing at all.
    expect(first.lodPairs).toBeGreaterThan(0);
    expect(first.vines).toBeGreaterThan(0);
    expect(first.reeds).toBeGreaterThan(0);
    expect(first.foamRings).toBeGreaterThan(0);

    buildFarcrysis(new THREE.Scene());
    const second = registrySnapshot();
    buildFarcrysis(new THREE.Scene());
    const third = registrySnapshot();

    // Identical, not doubled and not tripled: the registries describe the
    // arena that is mounted, never the ones that were torn down.
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  // (b) Time-invariant per-frame work.
  it('never re-uploads the time-invariant wave colour buffer', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const wave = arena.root.getObjectByName('farcrysis-water-fx-wave-surface') as THREE.Mesh
      ?? scene.getObjectByName('farcrysis-water-fx-wave-surface') as THREE.Mesh;
    expect(wave, 'wave surface mesh').toBeTruthy();

    const posAttr = wave.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = wave.geometry.attributes.color as THREE.BufferAttribute;

    // The colours must already be populated at build time — the shore blend
    // dies to zero ashore and saturates offshore, so a flat buffer would mean
    // the depth grading never reached the GPU at all.
    const written: number[] = [];
    for (let i = 0; i < colAttr.count; i++) written.push(colAttr.getX(i));
    expect(Math.min(...written)).toBeCloseTo(0, 6);
    expect(Math.max(...written)).toBeGreaterThan(0.9);

    const colVersionAtBuild = colAttr.version;
    const posVersionAtBuild = posAttr.version;

    animateWaterFX(1.0);
    animateWaterFX(2.5);
    animateWaterFX(4.0);

    // Positions are genuinely animated and must be re-uploaded...
    expect(posAttr.version).toBeGreaterThan(posVersionAtBuild);
    // ...colours are constant and must not be.
    expect(colAttr.version).toBe(colVersionAtBuild);

    // And the colours still hold the depth factor they were built with.
    for (let i = 0; i < colAttr.count; i++) {
      expect(colAttr.getX(i)).toBeCloseTo(written[i], 6);
    }
  });

  it('drives wave displacement identically through the cached depth path', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const wave = arena.root.getObjectByName('farcrysis-water-fx-wave-surface') as THREE.Mesh
      ?? scene.getObjectByName('farcrysis-water-fx-wave-surface') as THREE.Mesh;
    const posAttr = wave.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = wave.geometry.attributes.color as THREE.BufferAttribute;

    const time = 3.75;
    animateWaterFX(time);

    // The cached per-vertex depth factor the loop reads must equal a fresh
    // `swellDepthFactor` sample, and the displacement it produces must equal
    // the public pure function to the last bit.
    for (let i = 0; i < posAttr.count; i++) {
      const bx = posAttr.getX(i);
      const bz = posAttr.getZ(i);
      expect(colAttr.getX(i)).toBeCloseTo(swellDepthFactor(bx, bz), 6);
      expect(posAttr.getY(i)).toBeCloseTo(waveSurfaceDisplacement(bx, bz, time), 6);
    }
  });
});
