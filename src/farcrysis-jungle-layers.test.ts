/**
 * HF-396/HF-398 layered-jungle contract tests.
 *
 * The layered jungle section (#37 emergent canopy, #38 midstorey clumps,
 * #39 undergrowth carpet) must be:
 *
 *   (a) PRESENT and dense enough to read as tiers in the built arena;
 *   (b) terrain-constrained through the single authority — every instance
 *       SEATED on farcrysisTerrainHeight, REJECTED on slopes steeper than
 *       its layer threshold and below the authored waterline + margin;
 *   (c) relationally placed where claimed — midstorey clumps cluster around
 *       the emergent trunks, not independently scattered;
 *   (d) deterministic — two builds produce byte-identical instance matrices
 *       (networked-state rule: no Math.random anywhere in placement);
 *   (e) presentation-only — no new colliders, cover or raycast surfaces.
 *
 * These tests assert what the builder PRODUCES (decomposed instance
 * matrices re-checked against the terrain authority), not what it was
 * given — the failure mode that let untested systems ship invisible.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import {
  farcrysisTerrainSlope,
} from './farcrysis-vegetation';
import {
  farcrysisTerrainHeight,
  FARCRYSIS_WATER_LEVEL,
  FARCRYSIS_SHORE,
} from './farcrysis-terrain-authority';

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

/** World-space instance origins of an InstancedMesh, decomposed from matrices. */
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

const EMERGENT_NAMES = [
  'farcrysis-vege-emergent-trunks',
  'farcrysis-vege-emergent-crowns-lower',
  'farcrysis-vege-emergent-crowns-upper',
];
const MIDSTOREY_NAME = 'farcrysis-vege-midstorey-clumps';
const CARPET_NAME = 'farcrysis-vege-undergrowth-carpet';

describe('HF-396/398 layered jungle', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('terrain slope helper reads flat core pad and the authored HF-393 shore profile', () => {
    // Core pad is authored flat at y=0 inside Chebyshev 7.
    expect(farcrysisTerrainSlope(3, 3)).toBeLessThan(0.02);
    // Wade shelf band (outerDropDist <= dist < descentStartDist): one gentle
    // authored grade, exactly FARCRYSIS_SHORE.shelfSlope rise/run.
    expect(farcrysisTerrainSlope(57, 0)).toBeGreaterThan(FARCRYSIS_SHORE.shelfSlope * 0.98);
    expect(farcrysisTerrainSlope(57, 0)).toBeLessThan(FARCRYSIS_SHORE.shelfSlope * 1.02);
    // Outer drop band (dist < outerDropDist): steeper, but EXACTLY the
    // authored (shelfEnd - edgeHeight) / outerDropDist grade — derived from
    // the authority constants, never a magic number. This replaced the
    // retired pre-HF-393 1:1 chute ("you fall down into the water").
    const shelfEnd = FARCRYSIS_SHORE.joinHeight
      - FARCRYSIS_SHORE.shelfSlope * (FARCRYSIS_SHORE.descentStartDist - FARCRYSIS_SHORE.outerDropDist);
    const authoredGrade = (FARCRYSIS_SHORE.edgeHeight - shelfEnd) / FARCRYSIS_SHORE.outerDropDist;
    expect(farcrysisTerrainSlope(63.5, 0)).toBeGreaterThan(authoredGrade * 0.98);
    expect(farcrysisTerrainSlope(63.5, 0)).toBeLessThan(authoredGrade * 1.02);
  });

  it('builds all three jungle tiers with meaningful density', () => {
    const scene = new THREE.Scene();
    const map = buildFarcrysis(scene);

    const found = new Map<string, THREE.InstancedMesh>();
    scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && EMERGENT_NAMES.includes(object.name)
        || object instanceof THREE.InstancedMesh && (object.name === MIDSTOREY_NAME || object.name === CARPET_NAME)) {
        found.set(object.name, object);
      }
    });
    for (const name of [...EMERGENT_NAMES, MIDSTOREY_NAME, CARPET_NAME]) {
      const mesh = found.get(name);
      expect(mesh, `${name} missing from the built arena`).toBeDefined();
      expect(mesh!.count, `${name} too sparse to read as a tier`).toBeGreaterThanOrEqual(60);
      void map;
    }
    // The emergent tier must tower over the broadleaf canopy (~8 m): its
    // trunk geometry alone spans 11.5 m before per-instance scaling.
    const trunkGeom = found.get(EMERGENT_NAMES[0]!)!.geometry;
    trunkGeom.computeBoundingBox();
    const trunkHeight = trunkGeom.boundingBox!.max.y - trunkGeom.boundingBox!.min.y;
    expect(trunkHeight).toBeGreaterThanOrEqual(11);
  });

  it('seats every tier on the terrain authority and honours slope/water constraints', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const limits: Array<{ name: string; maxSlope: number; minAboveWater: number }> = [
      ...EMERGENT_NAMES.map((name) => ({ name, maxSlope: 0.36, minAboveWater: 0.59 })),
      { name: MIDSTOREY_NAME, maxSlope: 0.56, minAboveWater: 0.34 },
      { name: CARPET_NAME, maxSlope: 0.76, minAboveWater: 0.13 },
    ];
    for (const { name, maxSlope, minAboveWater } of limits) {
      const mesh = scene.getObjectByName(name) as THREE.InstancedMesh | undefined;
      expect(mesh, name).toBeDefined();
      for (const origin of instanceOrigins(mesh!)) {
        const expected = farcrysisTerrainHeight(origin.x, origin.z);
        expect(origin.y, `${name} instance floated/sank at ${origin.x},${origin.z}`)
          .toBeCloseTo(expected, 1);
        expect(
          origin.y,
          `${name} instance below the waterline margin at ${origin.x},${origin.z}`,
        ).toBeGreaterThanOrEqual(FARCRYSIS_WATER_LEVEL + minAboveWater - 1e-6);
        expect(
          farcrysisTerrainSlope(origin.x, origin.z),
          `${name} instance on a too-steep slope at ${origin.x},${origin.z}`,
        ).toBeLessThanOrEqual(maxSlope);
      }
    }
  });

  it('clusters midstorey clumps relationally under the emergent crowns', () => {
    const scene = new THREE.Scene();
    buildFarcrysis(scene);

    const trunks = scene.getObjectByName(EMERGENT_NAMES[0]!) as THREE.InstancedMesh;
    const midstorey = scene.getObjectByName(MIDSTOREY_NAME) as THREE.InstancedMesh;
    const anchors = instanceOrigins(trunks);
    const clumps = instanceOrigins(midstorey);

    // At least half the clumps sit within 8 m of an emergent trunk —
    // independent fill covers the rest, the relational pass dominates.
    let clustered = 0;
    for (const clump of clumps) {
      if (anchors.some((a) => Math.hypot(a.x - clump.x, a.z - clump.z) < 8)) clustered += 1;
    }
    expect(clustered / clumps.length).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps undergrowth carpet clear of every spawn point', () => {
    const scene = new THREE.Scene();
    const map = buildFarcrysis(scene);

    const carpet = scene.getObjectByName(CARPET_NAME) as THREE.InstancedMesh;
    const spawns = map.spawns[0].concat(map.spawns[1]);
    for (const origin of instanceOrigins(carpet)) {
      for (const spawn of spawns) {
        expect(Math.hypot(origin.x - spawn.x, origin.z - spawn.z),
          `undergrowth carpet inside spawn clearance at ${origin.x},${origin.z}`)
          .toBeGreaterThanOrEqual(3.19);
      }
    }
  });

  it('adds no colliders, physical cover or raycast surfaces for the tiers', () => {
    const scene = new THREE.Scene();
    const map = buildFarcrysis(scene);

    const tierNames = new Set([...EMERGENT_NAMES, MIDSTOREY_NAME, CARPET_NAME]);
    // ArenaMap.colliders are anonymous Box2s — they have no name channel.
    // Every collider originates from the builder's NAMED box()/cover() call,
    // so a tier collider would necessarily also surface as a named tier mesh
    // in raycastMeshes/physicalCover; both channels are checked below. To
    // keep the collider channel itself pinned, every tier InstancedMesh found
    // in the graph must additionally carry the presentation-only marker and
    // must NOT appear (by identity) in the raycast or collider-adjacent
    // registration lists.
    for (const id of map.physicalCover.map((cover) => cover.id)) {
      expect(tierNames.has(id), id).toBe(false);
    }
    for (const name of map.raycastMeshes.filter((o) => o.name !== '').map((o) => o.name)) {
      expect(tierNames.has(name), name).toBe(false);
    }
    const tierMeshes: THREE.InstancedMesh[] = [];
    map.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && tierNames.has(object.name)) tierMeshes.push(object);
    });
    expect(tierMeshes.length).toBeGreaterThanOrEqual(EMERGENT_NAMES.length + 2);
    for (const mesh of tierMeshes) {
      expect(mesh.userData.farcrysisArt, mesh.name).toBe(true);
      expect(map.raycastMeshes.includes(mesh), mesh.name).toBe(false);
    }
  });

  it('places every tier deterministically across builds', () => {
    const first = new THREE.Scene();
    buildFarcrysis(first);
    const second = new THREE.Scene();
    buildFarcrysis(second);

    for (const name of [...EMERGENT_NAMES, MIDSTOREY_NAME, CARPET_NAME]) {
      const a = first.getObjectByName(name) as THREE.InstancedMesh;
      const b = second.getObjectByName(name) as THREE.InstancedMesh;
      expect(a.count, name).toBe(b.count);
      expect(Buffer.compare(Buffer.from(a.instanceMatrix.array.buffer as ArrayBuffer), Buffer.from(b.instanceMatrix.array.buffer as ArrayBuffer)), `${name} placement differs between builds`)
        .toBe(0);
    }
  });
});
