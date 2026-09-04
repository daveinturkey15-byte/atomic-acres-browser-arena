/**
 * HF-395/396 SQUARE-SHORE contract — the layers the shoreline suite does NOT
 * cover: enhanced palms, detail rocks/litter/reeds and the art-layer boulders,
 * litter, driftwood and lagoon sparkle.
 *
 * These layers still sampled CIRCULAR radii after HF-396 grew the island to
 * +/-64 m (FARCRYSIS_BOUNDS). A circular ring of radius r only hugs the square
 * shore along the four axis faces; on the corner diagonals its Chebyshev
 * distance collapses to r/sqrt(2), stranding beach species up to
 * ~64 - 60*0.707 ~= 22 m inland of the real waterline. Every expectation here
 * is derived from FARCRYSIS_BOUNDS + FARCRYSIS_SHORE + FARCRYSIS_WATER_LEVEL —
 * the same authority the builders derive from.
 *
 * Pins (each RED against the pre-conversion circular samplers):
 *   (a) enhanced palms: every placement inside a shore-edge band; beach palms
 *       reach the CORNER beaches (chebyshev > 50, impossible for r <= 60);
 *   (b) detail reeds straddle the actual waterline on every azimuth;
 *   (c) detail rocks/floor litter reach the near-corner interior
 *       (chebyshev > 45 / > 50 — the old 20-36 / 10-36 rings never can);
 *   (d) art shore boulders + beach litter + driftwood sit in their sand /
 *       waterline edge bands on every azimuth;
 *   (e) cliff rocks track the transition band including corners;
 *   (f) lagoon sparkles sit OVER WATER everywhere (the old corner points
 *       rendered at water height over dry island interior);
 *   (g) placement stays deterministic across builds.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import { enhancedPalmPlacements } from './farcrysis-palms-enhanced';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_WATER_LEVEL, FARCRYSIS_SHORE } from './farcrysis-terrain-authority';

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

// --- authority-derived zone arithmetic --------------------------------------
const ARENA_HALF = FARCRYSIS_BOUNDS.maxX;
/** Waterline edge distance (metres inward from the square boundary face). */
const WATERLINE_EDGE = FARCRYSIS_SHORE.descentStartDist
  - (FARCRYSIS_SHORE.joinHeight - FARCRYSIS_WATER_LEVEL) / FARCRYSIS_SHORE.shelfSlope;
const INLAND_DEPTH = ARENA_HALF - WATERLINE_EDGE;
const REED_BAND: Readonly<[number, number]> = [WATERLINE_EDGE - 3.8, WATERLINE_EDGE + 5.2];

/** The bands the converted builders must place within (mirrors their code). */
const PALM_BEACH_BAND: Readonly<[number, number]> = [
  WATERLINE_EDGE + 0.5,
  WATERLINE_EDGE + INLAND_DEPTH * 0.25,
];
const PALM_JUNGLE_BAND: Readonly<[number, number]> = [
  WATERLINE_EDGE + INLAND_DEPTH * 0.35,
  ARENA_HALF - 2,
];
const SHORE_BOULDER_BAND: Readonly<[number, number]> = [WATERLINE_EDGE - 2.5, WATERLINE_EDGE + 4.5];
const CLIFF_ROCK_BAND: Readonly<[number, number]> = [
  WATERLINE_EDGE + INLAND_DEPTH * 0.06,
  WATERLINE_EDGE + INLAND_DEPTH * 0.35,
];
const LITTER_BAND: Readonly<[number, number]> = [1.2, 8.5]; // dry coral sand
const DRIFTWOOD_BAND: Readonly<[number, number]> = [1.8, 7.5]; // strand line
const SPARKLE_OFFSHORE_MAX_M = 15;

const BEACH_PALM_COUNT = 32;

const chebyshev = (x: number, z: number): number => Math.max(Math.abs(x), Math.abs(z));
const edgeOf = (x: number, z: number): number => ARENA_HALF - chebyshev(x, z);

function expectBand(label: string, x: number, z: number, band: Readonly<[number, number]>): void {
  const edge = edgeOf(x, z);
  expect(edge, `${label} inland of its band at ${x.toFixed(1)},${z.toFixed(1)} (edge ${edge.toFixed(1)} m, band max ${band[1].toFixed(1)})`)
    .toBeLessThanOrEqual(band[1] + 1e-6);
  expect(edge, `${label} seaward of its band at ${x.toFixed(1)},${z.toFixed(1)} (edge ${edge.toFixed(1)} m, band min ${band[0].toFixed(1)})`)
    .toBeGreaterThanOrEqual(band[0] - 1e-6);
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

/** Collect every scene object whose name starts with `prefix`. */
function byPrefix(root: THREE.Object3D, prefix: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((obj) => { if (obj.name.startsWith(prefix)) out.push(obj); });
  return out;
}

let scene: THREE.Scene;

describe('HF-395/396 square-shore contract (palms, detail, art)', () => {
  beforeEach(() => {
    stubCanvasDocument();
    scene = new THREE.Scene();
    buildFarcrysis(scene);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('enhanced palms: every placement in its shore-edge band', () => {
    const placements = enhancedPalmPlacements();
    placements.forEach((p, i) => {
      const band = i < BEACH_PALM_COUNT ? PALM_BEACH_BAND : PALM_JUNGLE_BAND;
      expectBand(`palm #${i} (${i < BEACH_PALM_COUNT ? 'beach' : 'jungle'})`, p.x, p.z, band);
      // Bounds sanity: never outside the playfield margin.
      expect(Math.abs(p.x)).toBeLessThanOrEqual(ARENA_HALF - 1);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(ARENA_HALF - 1);
    });
  });

  it('enhanced palms: beach palms reach the CORNER beaches (red proof vs circular rings)', () => {
    const cornerBeachPalms = enhancedPalmPlacements()
      .slice(0, BEACH_PALM_COUNT)
      .filter((p) => chebyshev(p.x, p.z) > 50);
    // A circular beach ring of radius <= 60 collapses to chebyshev <= ~42 on
    // the diagonals, so the old sampler could never satisfy this.
    expect(cornerBeachPalms.length, 'no beach palm on any corner beach').toBeGreaterThanOrEqual(4);
  });

  it('enhanced palms stay deterministic across builds', () => {
    const a = enhancedPalmPlacements();
    const b = enhancedPalmPlacements();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i].x).toBe(b[i].x);
      expect(a[i].z).toBe(b[i].z);
    }
  });

  it('detail reeds straddle the actual waterline on every azimuth', () => {
    const reeds = byPrefix(scene, 'farcrysis-detail-reed-');
    expect(reeds.length, 'expected a full reed population').toBeGreaterThanOrEqual(40);
    for (const reed of reeds) {
      expectBand('reed', reed.position.x, reed.position.z, REED_BAND);
    }
  });

  it('detail rocks reach the near-corner jungle interior', () => {
    const rocks = byPrefix(scene, 'farcrysis-detail-rock-');
    expect(rocks.length).toBeGreaterThanOrEqual(8);
    const maxCheb = Math.max(...rocks.map((r) => chebyshev(r.position.x, r.position.z)));
    // Old 20-36 m ring caps at chebyshev 36 — never reaches the corner interior.
    expect(maxCheb, `rocks never leave the mid-island ring (max chebyshev ${maxCheb.toFixed(1)})`)
      .toBeGreaterThan(37.5);
  });

  it('jungle floor litter spans the whole interior including corners', () => {
    const mesh = scene.getObjectByName('farcrysis-detail-floor-litter') as THREE.InstancedMesh | undefined;
    expect(mesh, 'floor litter missing').toBeDefined();
    const chebs = instanceOrigins(mesh!).map((o) => chebyshev(o.x, o.z));
    const maxCheb = Math.max(...chebs);
    // Old 10-36 m ring caps at chebyshev 36.
    expect(maxCheb, `litter never reaches the corner interior (max chebyshev ${maxCheb.toFixed(1)})`)
      .toBeGreaterThan(50);
  });

  it('art shore boulders hug the waterline on every azimuth', () => {
    const mesh = scene.getObjectByName('farcrysis-shore-boulders') as THREE.InstancedMesh | undefined;
    expect(mesh, 'shore boulders missing').toBeDefined();
    for (const origin of instanceOrigins(mesh!)) {
      expectBand('shore boulder', origin.x, origin.z, SHORE_BOULDER_BAND);
    }
  });
  it('art boulders carry their tint as per-instance colour on one shared family material', () => {
    // Luna review (PASS 95 slice 2): the three boulder sets share ONE white
    // material and ONE geometry; each set's tint rides the approved
    // per-instance path (`instanceColor`, the varyInstanceColors idiom), never
    // a baked geometry `color` attribute and never three material objects.
    const expectedTint: Record<string, number> = {
      'farcrysis-cliff-rocks': 0x716b60,
      'farcrysis-interior-boulders': 0x7a7268,
      'farcrysis-shore-boulders': 0x6d655c,
    };
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    const tint = new THREE.Color();
    for (const [name, hex] of Object.entries(expectedTint)) {
      const mesh = scene.getObjectByName(name) as THREE.InstancedMesh | undefined;
      expect(mesh, `${name} missing`).toBeDefined();
      const material = mesh!.material as THREE.MeshStandardMaterial;
      expect(material.vertexColors, `${name} must not use baked vertex colours`).toBe(false);
      materials.add(mesh!.material as THREE.Material);
      geometries.add(mesh!.geometry as THREE.BufferGeometry);
      expect(mesh!.geometry.getAttribute('color'), `${name} must not carry a baked color attribute`).toBeUndefined();
      expect(mesh!.instanceColor, `${name} has no per-instance colour`).toBeTruthy();
      tint.setHex(hex);
      const array = mesh!.instanceColor!.array as ArrayLike<number>;
      for (let i = 0; i < mesh!.count; i += 1) {
        expect(array[i * 3], `${name} instance ${i} red`).toBeCloseTo(tint.r, 5);
        expect(array[i * 3 + 1], `${name} instance ${i} green`).toBeCloseTo(tint.g, 5);
        expect(array[i * 3 + 2], `${name} instance ${i} blue`).toBeCloseTo(tint.b, 5);
      }
    }
    expect(materials.size, 'boulder sets stopped sharing one material').toBe(1);
    expect(geometries.size, 'boulder sets stopped sharing one geometry').toBe(1);
  });

  it('cliff rocks track the transition band including the corner diagonals', () => {
    const mesh = scene.getObjectByName('farcrysis-cliff-rocks') as THREE.InstancedMesh | undefined;
    expect(mesh, 'cliff rocks missing').toBeDefined();
    const origins = instanceOrigins(mesh!);
    for (const origin of origins) {
      expectBand('cliff rock', origin.x, origin.z, CLIFF_ROCK_BAND);
    }
    // Corner coverage: at least one rock deep into a diagonal transition.
    const maxCheb = Math.max(...origins.map((o) => chebyshev(o.x, o.z)));
    expect(maxCheb, `cliff ring never rounds a corner (max chebyshev ${maxCheb.toFixed(1)}, shore at ${(ARENA_HALF - CLIFF_ROCK_BAND[0]).toFixed(1)})`)
      .toBeGreaterThanOrEqual(ARENA_HALF - CLIFF_ROCK_BAND[0] - 2.5);
  });

  it('beach litter sits on dry sand on every azimuth', () => {
    const litter = byPrefix(scene, 'farcrysis-beach-litter-');
    expect(litter.length).toBeGreaterThanOrEqual(30);
    for (const item of litter) {
      expectBand('beach litter', item.position.x, item.position.z, LITTER_BAND);
    }
  });

  it('driftwood sits on the strand line on every azimuth', () => {
    const logs = byPrefix(scene, 'farcrysis-driftwood-');
    expect(logs.length).toBeGreaterThanOrEqual(6);
    for (const log of logs) {
      expectBand('driftwood', log.position.x, log.position.z, DRIFTWOOD_BAND);
    }
  });

  it('lagoon sparkles float OVER WATER everywhere, corners included', () => {
    const points = scene.getObjectByName('farcrysis-art-water-sparkle') as THREE.Points | undefined;
    expect(points, 'water sparkle missing').toBeDefined();
    const pos = points!.geometry.getAttribute('position') as THREE.BufferAttribute;
    let overWater = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const edge = edgeOf(x, z);
      expect(edge, `sparkle ${i} renders inboard of the waterline at ${x.toFixed(1)},${z.toFixed(1)} (edge ${edge.toFixed(1)})`)
        .toBeLessThanOrEqual(WATERLINE_EDGE - 0.3);
      expect(edge, `sparkle ${i} drifted far offshore (edge ${edge.toFixed(1)})`)
        .toBeGreaterThanOrEqual(WATERLINE_EDGE - SPARKLE_OFFSHORE_MAX_M);
      overWater += 1;
    }
    expect(overWater).toBeGreaterThan(0);
  });

  // --- HF-395 square-shore band fixes (farcrysis-rebuild lane) -------------

  it('wet-sand band STRADDLES the waterline (old band lay wholly offshore)', () => {
    const wet = scene.getObjectByName('farcrysis-water-wetsand') as THREE.Mesh | undefined;
    expect(wet, 'wet-sand band missing').toBeDefined();
    const pos = wet!.geometry.getAttribute('position') as THREE.BufferAttribute;
    let maxCheb = 0;
    let minCheb = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const c = chebyshev(pos.getX(i), pos.getZ(i));
      maxCheb = Math.max(maxCheb, c);
      minCheb = Math.min(minCheb, c);
    }
    // Band spans edge distances [WATERLINE_EDGE - 2.5, WATERLINE_EDGE + 3.5],
    // i.e. Chebyshev [ARENA_HALF - WATERLINE_EDGE - 3.5, ARENA_HALF - WATERLINE_EDGE + 2.5].
    const shoreCheb = ARENA_HALF - WATERLINE_EDGE;
    expect(minCheb).toBeCloseTo(shoreCheb - 3.5, 3);
    expect(maxCheb).toBeCloseTo(shoreCheb + 2.5, 3);
    // The old band (edge 0..8, Chebyshev 56..64) sat ENTIRELY seaward of the
    // waterline at Chebyshev shoreCheb; pin the inland straddle: the band's
    // dry-sand side must cross shoreCheb (lower Chebyshev = further inland).
    expect(minCheb, 'wet-sand band has no dry-sand reach inland of the waterline').toBeLessThan(shoreCheb);
  });

  it('shallow lens reaches past the square waterline (old lens stopped mid-lagoon)', () => {
    const shallow = scene.getObjectByName('farcrysis-water-shallow') as THREE.Mesh | undefined;
    expect(shallow, 'shallow lens missing').toBeDefined();
    shallow!.geometry.computeBoundingBox();
    const bbox = shallow!.geometry.boundingBox!;
    const halfExtent = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) / 2;
    // Waterline sits at Chebyshev ARENA_HALF - WATERLINE_EDGE = INLAND_DEPTH
    // from the origin; the lens half-extent must clear it with margin.
    expect(halfExtent, `shallow lens half-extent ${halfExtent.toFixed(1)} stops short of the waterline at ${INLAND_DEPTH.toFixed(1)}`)
      .toBeGreaterThanOrEqual(INLAND_DEPTH + 2);
  });

  it('jungle undergrowth cards span the FULL interior (old scatter stayed within circular 32 m)', () => {
    const cards = scene.getObjectByName('farcrysis-undergrowth-leaf-cards') as THREE.InstancedMesh | undefined;
    expect(cards, 'undergrowth leaf cards missing').toBeDefined();
    const origins = instanceOrigins(cards!);
    expect(origins.length).toBeGreaterThan(60);
    for (const o of origins) {
      expect(edgeOf(o.x, o.z), `undergrowth card left the jungle interior (edge ${edgeOf(o.x, o.z).toFixed(1)})`)
        .toBeGreaterThanOrEqual(14);
    }
    const maxCheb = Math.max(...origins.map((o) => chebyshev(o.x, o.z)));
    // The old circular 14-32 m draw capped every clump at Chebyshev ~32;
    // the edge band [14, ARENA_HALF-4] reaches Chebyshev 50, deep into the
    // outer jungle.
    expect(maxCheb, `undergrowth never reaches the outer jungle (max chebyshev ${maxCheb.toFixed(1)})`)
      .toBeGreaterThan(45);
  });

  it('sand depth gradient hugs the square shore (old ring was circular)', () => {
    const grad = scene.getObjectByName('farcrysis-water-fx-sand-depth-gradient') as THREE.Mesh | undefined;
    expect(grad, 'sand depth gradient missing').toBeDefined();
    const pos = grad!.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const edge = edgeOf(pos.getX(i), pos.getZ(i));
      // Every rim vertex sits on one of the two band edges; a circular ring
      // would place diagonal vertices up to sqrt(2) further inboard.
      const offInner = Math.abs(edge - (WATERLINE_EDGE - 0.4));
      const offOuter = Math.abs(edge - (WATERLINE_EDGE - 44));
      expect(Math.min(offInner, offOuter), `gradient vertex ${i} off the square band edges (edge ${edge.toFixed(2)})`)
        .toBeLessThan(0.5);
    }
  });
});
