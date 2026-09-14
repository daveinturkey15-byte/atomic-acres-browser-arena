/**
 * HF-398 mountain backdrop ring contract tests.
 *
 * The cadle.gg audit that opened this lane found NO mountain system: beyond
 * the playfield there was only open ocean, five low island silhouettes and
 * sky. These tests pin what the mountain module PRODUCES in the BUILT arena —
 * not its inputs — with the four properties that make it shippable:
 *
 *   (a) WIRED — the ring exists as real geometry inside the built arena scene
 *       (buildFarcrysis -> applyFarcrysisArtwork -> applyMountains). A module
 *       imported by nothing is the project's #1 failure mode; this test fails
 *       if the wiring is ever dropped.
 *   (b) OUTSIDE the authoritative playfield — every vertex sits beyond
 *       FARCRYSIS_BOUNDS + margin, so the presentation can never present
 *       walkable-looking ground the physics world does not own.
 *   (c) SEATED IN THE OCEAN — bases sink below the ocean plane and wave
 *       trough, peaks stay under the authored cap, no NaNs.
 *   (d) DETERMINISTIC and CHEAP — byte-identical geometry across builds (the
 *       networked-state rule) in ONE merged mesh under a fixed triangle cap.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { applyMountains } from './farcrysis-mountains';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';

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

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: (_id: string) => null,
    documentElement: { dataset: { renderBackend: 'webgpu' } },
    body: { appendChild: () => undefined },
  });
}

const MOUNTAIN_NAME = 'farcrysis-mountains';

/** 2 m beyond the boundary so no flank ever looms over reachable seabed. */
const BOUNDS_MARGIN_M = 2;
/** Authored peak cap: tallest massif (62 m) on its sunk base (-1.6 m). */
const PEAK_CAP_Y = 61;

describe('HF-398 farcrysis mountain backdrop', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('is wired into the built arena as tagged presentation-only geometry', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === MOUNTAIN_NAME) meshes.push(object);
    });
    expect(meshes.length, 'mountain ring missing from the built arena — wiring dropped').toBe(1);
    const mesh = meshes[0];
    expect(mesh.userData.farcrysisArt).toBe(true);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.visible).toBe(true);
  });

  it('builds ONE merged mesh under a fixed triangle budget', () => {
    const scene = new THREE.Scene();
    const mesh = applyMountains(scene);
    expect(mesh).not.toBeNull();
    expect(mesh).toBe(scene.getObjectByName(MOUNTAIN_NAME));
    const geometry = mesh!.geometry;
    expect(geometry.getAttribute('position').count % 3).toBe(0); // merged triangles, not points
    // Nine displaced cones at 18x9 segments merge to a few thousand triangles
    // against the arena's 1.1M budget — the cap only trips if someone swaps
    // the authoring for dense terrain meshes.
    expect(geometry.index!.count / 3).toBeLessThan(10_000);
  });

  it('keeps every vertex outside the authoritative playfield', () => {
    const scene = new THREE.Scene();
    const mesh = applyMountains(scene)!;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const boundHalf = Math.max(FARCRYSIS_BOUNDS.maxX, -FARCRYSIS_BOUNDS.minX);
    let minRadius = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      minRadius = Math.min(minRadius, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    expect(minRadius).toBeGreaterThan(boundHalf + BOUNDS_MARGIN_M);
  });

  it('seats massifs in the ocean: sunk bases, capped peaks, clean data', () => {
    const scene = new THREE.Scene();
    const mesh = applyMountains(scene)!;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
      maxY = Math.max(maxY, y);
      minY = Math.min(minY, y);
    }
    // Ocean plane sits at -0.62 and the lagoon trough reaches -0.59: bases
    // below -1.6 can never float free of the water surface.
    expect(minY).toBeLessThan(-1.5);
    expect(maxY).toBeLessThan(PEAK_CAP_Y);
  });

  it('is deterministic across builds — byte-identical positions and colors', () => {
    const a = applyMountains(new THREE.Scene())!;
    const b = applyMountains(new THREE.Scene())!;
    const pa = a.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pb = b.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pa.count).toBe(pb.count);
    expect(Buffer.from(pa.array.buffer as ArrayBuffer).equals(Buffer.from(pb.array.buffer as ArrayBuffer))).toBe(true);
    const ca = a.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cb = b.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(Buffer.from(ca.array.buffer as ArrayBuffer).equals(Buffer.from(cb.array.buffer as ArrayBuffer))).toBe(true);
  });

  it('is idempotent — a second call never duplicates the ring', () => {
    const scene = new THREE.Scene();
    const first = applyMountains(scene)!;
    const second = applyMountains(scene);
    expect(second).toBe(first);
    let count = 0;
    scene.traverse((object) => {
      if (object.name === MOUNTAIN_NAME) count += 1;
    });
    expect(count).toBe(1);
  });
});
