/**
 * HF-395/HF-396 vegetation shoreline contract.
 *
 * The Pass 69/76 extended vegetation layers were authored against the old
 * +/-32 m island and kept sampling CIRCULAR radii <= 31.5 m after HF-396
 * grew the island to +/-64 m — stranding beach species up to ~30 m inland
 * of the real shore. These tests pin the CORRECTED behaviour:
 *
 *   (a) shoreline species (beach grass, pebbles, scrub, driftwood) sit in an
 *       EDGE-DISTANCE band measured from the SQUARE shore (the terrain
 *       authority's Chebyshev convention), on dry sand above the waterline;
 *   (b) the bands follow the square shoreline — instances reach the corner
 *       diagonals, which no circular radius <= 31.5 can (the red proof);
 *   (c) mangroves straddle the actual waterline;
 *   (d) cave-adjacent ferns cluster at the CURRENT cave entrance [52, 32],
 *       not the pre-rescale [26, 16];
 *   (e) placement stays deterministic across builds.
 *
 * Every expectation is derived from FARCRYSIS_BOUNDS + FARCRYSIS_SHORE +
 * FARCRYSIS_WATER_LEVEL — the same authority the builder derives from — so
 * if the island ever changes extent again these tests track it instead of
 * silently re-staling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL, FARCRYSIS_SHORE } from './farcrysis-terrain-authority';

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

function instanceOrigins(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i += 1) {
    m.fromArray(mesh.instanceMatrix.array, i * 16);
    m.decompose(p, q, s);
    out.push(p.clone());
  }
  return out;
}

// --- derived zone arithmetic (mirrors the builder's derivation, from the
// --- same authority constants — an independent cross-check, not a copy) ----
const ARENA_HALF = FARCRYSIS_BOUNDS.maxX;
const WATERLINE_EDGE = FARCRYSIS_SHORE.descentStartDist
  - (FARCRYSIS_SHORE.joinHeight - FARCRYSIS_WATER_LEVEL) / FARCRYSIS_SHORE.shelfSlope;
const INLAND_DEPTH = ARENA_HALF - WATERLINE_EDGE;
const BEACH_BAND: Readonly<[number, number]> = [
  WATERLINE_EDGE + 0.6,
  WATERLINE_EDGE + INLAND_DEPTH * 0.16,
];
const STRAND_BAND: Readonly<[number, number]> = [WATERLINE_EDGE + 0.5, WATERLINE_EDGE + 6];
const COCONUT_BAND: Readonly<[number, number]> = [
  WATERLINE_EDGE + 0.6,
  WATERLINE_EDGE + INLAND_DEPTH * 0.34,
];
const MANGROVE_BAND: Readonly<[number, number]> = [WATERLINE_EDGE - 3.5, WATERLINE_EDGE + 3.5];

/** Chebyshev distance from origin — the square-shore coordinate. */
const chebyshev = (x: number, z: number): number => Math.max(Math.abs(x), Math.abs(z));
/** Shore-edge distance of a world point (metres inward from the boundary). */
const edgeOf = (x: number, z: number): number => ARENA_HALF - chebyshev(x, z);

interface LayerBand {
  name: string;
  band: Readonly<[number, number]>;
  minimumCount: number;
  /** Dry-land layers must seat above the gameplay water level. */
  dry: boolean;
}

const SHORELINE_LAYERS: LayerBand[] = [
  { name: 'farcrysis-vege-beach-grass', band: BEACH_BAND, minimumCount: 100, dry: true },
  { name: 'farcrysis-vege-beach-pebbles', band: BEACH_BAND, minimumCount: 30, dry: true },
  { name: 'farcrysis-vege-beach-scrub-bushes', band: BEACH_BAND, minimumCount: 18, dry: true },
  { name: 'farcrysis-vege-driftwood-logs', band: STRAND_BAND, minimumCount: 20, dry: true },
];

describe('HF-395/396 vegetation shoreline contract', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps every shoreline species inside its shore-edge band, on dry sand', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    for (const { name, band, dry } of SHORELINE_LAYERS) {
      const mesh = scene.getObjectByName(name) as THREE.InstancedMesh | undefined;
      expect(mesh, `${name} missing from the built arena`).toBeDefined();
      for (const origin of instanceOrigins(mesh!)) {
        const edge = edgeOf(origin.x, origin.z);
        expect(edge, `${name} instance inland of its band at ${origin.x.toFixed(1)},${origin.z.toFixed(1)} (edge ${edge.toFixed(1)} m, band min ${band[0].toFixed(1)})`)
          .toBeGreaterThanOrEqual(band[0] - 1e-6);
        expect(edge, `${name} instance seaward of its band at ${origin.x.toFixed(1)},${origin.z.toFixed(1)}`)
          .toBeLessThanOrEqual(band[1] + 1e-6);
        if (dry) {
          expect(origin.y, `${name} instance seated below the waterline at ${origin.x.toFixed(1)},${origin.z.toFixed(1)}`)
            .toBeGreaterThanOrEqual(FARCRYSIS_WATER_LEVEL);
        }
      }
    }
  });

  it('follows the SQUARE shoreline: beach species reach the corner diagonals', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    for (const { name, band } of SHORELINE_LAYERS) {
      const mesh = scene.getObjectByName(name) as THREE.InstancedMesh;
      const origins = instanceOrigins(mesh);
      const chebs = origins.map((o) => chebyshev(o.x, o.z));
      const maxCheb = Math.max(...chebs);
      const minCheb = Math.min(...chebs);
      // The band in Chebyshev space: the square shore sits at chebyshev =
      // ARENA_HALF - edge. A circular legacy radius of <= 31.5 can never
      // exceed chebyshev 31.5 — this assertion is the red proof.
      expect(maxCheb, `${name} never reaches the square shore (max chebyshev ${maxCheb.toFixed(1)}, expected near ${ARENA_HALF - band[0]})`)
        .toBeGreaterThanOrEqual(ARENA_HALF - band[0] - 2.5);
      expect(minCheb, `${name} crosses the boundary face (min chebyshev ${minCheb.toFixed(1)})`)
        .toBeGreaterThanOrEqual(ARENA_HALF - band[1] - 2.5);
    }
  });

  it('straddles the waterline with mangroves', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const trunks = scene.getObjectByName('farcrysis-vege-mangrove-trunks') as THREE.InstancedMesh | undefined;
    expect(trunks, 'mangrove trunks missing').toBeDefined();
    const origins = instanceOrigins(trunks!);
    expect(origins.length).toBeGreaterThanOrEqual(12);
    for (const origin of origins) {
      const edge = edgeOf(origin.x, origin.z);
      expect(edge, `mangrove off the waterline at ${origin.x.toFixed(1)},${origin.z.toFixed(1)} (edge ${edge.toFixed(1)})`)
        .toBeGreaterThanOrEqual(MANGROVE_BAND[0] - 1e-6);
      expect(edge).toBeLessThanOrEqual(MANGROVE_BAND[1] + 1e-6);
    }
  });

  it('clusters cave-adjacent ferns at the CURRENT cave entrance [52, 32]', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const ferns = scene.getObjectByName('farcrysis-vege-large-ferns') as THREE.InstancedMesh | undefined;
    expect(ferns, 'large ferns missing').toBeDefined();
    const nearCave = instanceOrigins(ferns!)
      .filter((o) => Math.hypot(o.x - 52, o.z - 32) < 6);
    expect(nearCave.length, 'no large ferns near the moved cave entrance').toBeGreaterThanOrEqual(2);
  });

  it('places coconut palms across the beach-to-jungle edge band', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const trunks = scene.getObjectByName('farcrysis-vege-coconut-trunks') as THREE.InstancedMesh | undefined;
    expect(trunks, 'coconut trunks missing').toBeDefined();
    for (const origin of instanceOrigins(trunks!)) {
      const edge = edgeOf(origin.x, origin.z);
      expect(edge, `coconut palm inland at ${origin.x.toFixed(1)},${origin.z.toFixed(1)} (edge ${edge.toFixed(1)})`)
        .toBeGreaterThanOrEqual(COCONUT_BAND[0] - 1e-6);
      expect(edge).toBeLessThanOrEqual(COCONUT_BAND[1] + 1e-6);
    }
  });

  it('seats shoreline species on the terrain authority and stays deterministic', () => {
    const first = new THREE.Scene();
    buildFarcrysis(first);
    const second = new THREE.Scene();
    buildFarcrysis(second);

    for (const { name, minimumCount } of SHORELINE_LAYERS) {
      const a = first.getObjectByName(name) as THREE.InstancedMesh;
      const b = second.getObjectByName(name) as THREE.InstancedMesh;
      expect(a.count, `${name} count`).toBeGreaterThanOrEqual(minimumCount);
      expect(a.count, `${name} count differs between builds`).toBe(b.count);
      expect(
        Buffer.compare(
          Buffer.from(a.instanceMatrix.array.buffer as ArrayBuffer),
          Buffer.from(b.instanceMatrix.array.buffer as ArrayBuffer),
        ),
        `${name} placement differs between builds`,
      ).toBe(0);
      // Seating: every origin Y equals the authority surface (+ layer offset).
      for (const origin of instanceOrigins(a)) {
        expect(origin.y, `${name} instance off the authority surface at ${origin.x.toFixed(1)},${origin.z.toFixed(1)}`)
          .toBeGreaterThanOrEqual(farcrysisTerrainHeight(origin.x, origin.z) - 0.05);
      }
    }
  });
});
