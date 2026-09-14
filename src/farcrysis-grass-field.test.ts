/**
 * HF-396 contract tests for the Farcrysis instanced tropical grass field.
 *
 * Pins the five contracts the module claims in its header:
 *   1. DETERMINISM — placement is seeded, so every peer builds byte-identical
 *      instance matrices (HF-360 lesson: Math.random placement desynced peers).
 *   2. COMBAT-SAFETY BOUND — no blade exceeds 0.42 m, blades never root under
 *      water or inside authored structure footprints, density is cell-bounded.
 *   3. PIPELINE DISCIPLINE (HF-374) — every chunk shares ONE material
 *      instance, so the field adds exactly ONE distinct WebGPU program.
 *   4. WEBGL2 GATE — on the compat route the field stays on plain standard
 *      materials (same rule vegetation's _applyTslFoliage follows).
 *   5. ZERO-ALLOCATION LOD — the animator only flips visibility booleans and
 *      is deterministic per camera position.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import {
  animateGrassField,
  buildFarcrysisGrassField,
  createGrassBladeGeometry,
  FARCRYSIS_GRASS_CHUNK_GRID,
  FARCRYSIS_GRASS_DRAW_DISTANCE_M,
  FARCRYSIS_GRASS_PLACEMENT_HALF_M,
  FARCRYSIS_GRASS_MAX_HEIGHT_M,
  FARCRYSIS_GRASS_MIN_SPACING_M,
  grassPlacementAllowed,
} from './farcrysis-grass-field';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from './farcrysis-terrain-authority';
import { tslResetWindUniforms } from './farcrysis-tsl-foliage';

function fakeCanvasContext() {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<string | symbol, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif',
  };
  return new Proxy(state, {
    get(target, property) {
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return gradient;
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(renderBackend?: string): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
    }),
    documentElement: { dataset: renderBackend ? { renderBackend } : {} },
  });
}

interface BladeRow {
  x: number;
  y: number;
  z: number;
  scaleY: number;
}

/** Pull world translation + Y scale out of each instance matrix column-major. */
function readBlades(mesh: THREE.InstancedMesh): BladeRow[] {
  const array = mesh.instanceMatrix.array as ArrayLike<number>;
  const rows: BladeRow[] = [];
  for (let i = 0; i < mesh.count; i += 1) {
    const o = i * 16;
    rows.push({ x: array[o + 12]!, y: array[o + 13]!, z: array[o + 14]!, scaleY: array[o + 5]! });
  }
  return rows;
}

describe('farcrysis grass field (HF-396)', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => {
    vi.unstubAllGlobals();
    tslResetWindUniforms();
  });

  it('blade geometry is finite, indexed in range, and matches the height bound', () => {
    const geometry = createGrassBladeGeometry();
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(position.count).toBeGreaterThan(0);
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
    }
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i++) {
      expect(index.getX(i)).toBeLessThan(position.count);
    }
    // No vertex rises above the combat-safety bound.
    let maxY = -Infinity;
    for (let i = 0; i < position.count; i++) maxY = Math.max(maxY, position.getY(i));
    expect(maxY).toBeLessThanOrEqual(FARCRYSIS_GRASS_MAX_HEIGHT_M);
  });

  it('placement is dry, gentle, outside footprints, and spacing-bounded', () => {
    expect(grassPlacementAllowed(0, 0)).toBe(false);        // station core footprint
    expect(grassPlacementAllowed(48, -48)).toBe(false);     // seaplane disc (HF-396 live coords)
    expect(grassPlacementAllowed(200, 200)).toBe(false);    // outside bounds
    expect(grassPlacementAllowed(NaN, 5)).toBe(false);
    // Deep interior plateau admits grass.
    expect(grassPlacementAllowed(-12, -12)).toBe(true);
    // The expanded field must admit the OUTER interior the old +/-26 m
    // placement half-extent left bare (HF-396: island is now +/-64 m).
    expect(grassPlacementAllowed(-40, 8)).toBe(true);
    expect(FARCRYSIS_GRASS_MIN_SPACING_M).toBeGreaterThan(0.15);
  });

  it('builds a dense field that never breaks the concealment bound', () => {
    const root = new THREE.Group();
    const stats = buildFarcrysisGrassField(root);

    // HF-396: the field tracks the 128 m island. The old +/-26 m placement
    // half-extent bounded candidates at (52/0.33)^2 ~= 24.8k, so 80k is
    // unreachably red on the pre-expansion module and pins the rescale.
    expect(stats.blades).toBeGreaterThan(80_000); // a FIELD across the whole island
    let outer = 0;
    root.traverse((node) => {
      if (!(node instanceof THREE.InstancedMesh)) return;
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < node.count; i += 1) {
        node.getMatrixAt(i, matrix);
        const e = matrix.elements;
        if (Math.abs(e[12]) > 26 || Math.abs(e[14]) > 26) outer += 1;
      }
    });
    // Majority of the field must live OUTSIDE the old +/-26 m extent
    // (measured 80.9k of 103.6k post-expansion; 0 on the old module).
    expect(outer).toBeGreaterThan(60_000);
    expect(stats.chunks).toBeLessThanOrEqual(16);
    expect(stats.maxDrawCalls).toBeLessThanOrEqual(16);

    let seen = 0;
    root.traverse((node) => {
      if (!(node instanceof THREE.InstancedMesh)) return;
      expect(node.name.startsWith('farcrysis-grass-chunk-')).toBe(true);
      for (const blade of readBlades(node)) {
        seen += 1;
        const ground = farcrysisTerrainHeight(blade.x, blade.z);
        // Rooted at the terrain seat (with sink tolerance), never floating high.
        expect(blade.y).toBeGreaterThanOrEqual(ground - 0.05);
        expect(blade.y).toBeLessThan(ground + 0.02);
        // Scaled tip can never breach the concealment cap.
        expect(blade.scaleY * FARCRYSIS_GRASS_MAX_HEIGHT_M).toBeLessThanOrEqual(FARCRYSIS_GRASS_MAX_HEIGHT_M);
        // Never roots below the lagoon waterline.
        expect(blade.y).toBeGreaterThan(FARCRYSIS_WATER_LEVEL + 0.05);
        // Never inside the station-core keep-out rect.
        expect(Math.abs(blade.x) > 6.8 || Math.abs(blade.z) > 6.8).toBe(true);
      }
    });
    expect(seen).toBe(stats.blades);
  }, 120_000);

  it('is deterministic — two builds produce identical instance matrices', () => {
    const first = new THREE.Group();
    const second = new THREE.Group();
    const statsA = buildFarcrysisGrassField(first);
    const statsB = buildFarcrysisGrassField(second);
    expect(statsB.blades).toBe(statsA.blades);
    expect(statsB.triangles).toBe(statsA.triangles);
    const meshesA: THREE.InstancedMesh[] = [];
    const meshesB: THREE.InstancedMesh[] = [];
    first.traverse((n) => { if ((n as THREE.InstancedMesh).isInstancedMesh) meshesA.push(n as THREE.InstancedMesh); });
    second.traverse((n) => { if ((n as THREE.InstancedMesh).isInstancedMesh) meshesB.push(n as THREE.InstancedMesh); });
    expect(meshesB.length).toBe(meshesA.length);
    for (let m = 0; m < meshesA.length; m += 1) {
      const a = meshesA[m].instanceMatrix.array as ArrayLike<number>;
      const b = meshesB[m].instanceMatrix.array as ArrayLike<number>;
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i += 1) expect(b[i]).toBe(a[i]);
    }
  }, 240_000);

  it('shares ONE material across every chunk (one extra WebGPU program, HF-374)', () => {
    const root = new THREE.Group();
    buildFarcrysisGrassField(root);
    const materials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) materials.add(node.material as THREE.Material);
    });
    expect(materials.size).toBe(1);
    // Named cast: isNodeMaterial is a three.js runtime flag the static type omits.
    const material = materials.values().next().value as THREE.Material & { isNodeMaterial?: boolean };
    expect(material.isNodeMaterial).toBe(true);
  });

  it('keeps the WebGL2 compat route on plain standard materials', () => {
    stubCanvasDocument('webgl2');
    const root = new THREE.Group();
    buildFarcrysisGrassField(root);
    root.traverse((node) => {
      if (!(node instanceof THREE.InstancedMesh)) return;
      const material = node.material as THREE.MeshStandardMaterial & { isNodeMaterial?: boolean };
      expect(material.isNodeMaterial).not.toBe(true);
      expect(material.type).toBe('MeshStandardMaterial');
    });
  });

  it('distance LOD toggles chunk visibility with zero state churn', () => {
    const root = new THREE.Group();
    buildFarcrysisGrassField(root);
    const camera = new THREE.Object3D();

    camera.position.set(0, 2, 0); // centre: every chunk within draw distance
    animateGrassField(camera);
    let visibleNear = 0;
    root.children.forEach((c) => { if (c.visible) visibleNear += 1; });
    expect(visibleNear).toBe(root.children.length);

    camera.position.set(500, 2, 500); // far beyond any in-play distance
    animateGrassField(camera);
    root.children.forEach((c) => expect(c.visible).toBe(false));

    // Camera at the north edge: near chunks visible, far chunks culled.
    camera.position.set(0, 2, FARCRYSIS_GRASS_DRAW_DISTANCE_M * 0.98);
    animateGrassField(camera);
    let visibleMid = 0;
    let hiddenMid = 0;
    root.children.forEach((c) => { if (c.visible) visibleMid += 1; else hiddenMid += 1; });
    expect(visibleMid).toBeGreaterThan(0);
    expect(hiddenMid).toBeGreaterThan(0);

    animateGrassField(null); // defensive: show everything
    root.children.forEach((c) => expect(c.visible).toBe(true));
  });
});

/**
 * HF-396 residual: grass coverage from the corner spawns.
 *
 * The field is built across the whole island, but the LOD used to cull whole
 * 27 m chunks on their CENTRE distance. Measured from the real spawn at
 * (-52,-52): only 4 of 16 chunks survived, so three quarters of the island's
 * grass was absent from the frame the player starts in, and the nearest culled
 * chunk carried grass 52 m from the camera — well inside the arena's fog near
 * plane at 78 m (src/rendering/arenas/farcrysis.ts fog: near 78, far 200), so
 * the boundary was a hard visible edge rather than a haze-out.
 *
 * These cases pin the two halves of the fix, mirroring the vegetation suite's
 * corner-spawn case at src/farcrysis-visual-dressing.test.ts:184-205 (the
 * existing LOD case only asserted "some visible, some hidden", which 4 of 16
 * satisfies perfectly).
 */
describe('farcrysis grass corner-spawn coverage (HF-396)', () => {
  beforeEach(() => {
    stubCanvasDocument();
    tslResetWindUniforms();
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Half-extent of one LOD chunk on each axis. */
  const chunkHalf = FARCRYSIS_GRASS_PLACEMENT_HALF_M / FARCRYSIS_GRASS_CHUNK_GRID;

  /** Chunk index -> [min, max] on one axis, from the module's own grid. */
  function chunkSpan(index: number): [number, number] {
    const min = -FARCRYSIS_GRASS_PLACEMENT_HALF_M + index * chunkHalf * 2;
    return [min, min + chunkHalf * 2];
  }

  function chunkIndices(mesh: THREE.Object3D): [number, number] {
    const match = /farcrysis-grass-chunk-(\d+)-(\d+)$/.exec(mesh.name);
    if (!match) throw new Error(`not a grass chunk: ${mesh.name}`);
    return [Number(match[1]), Number(match[2])];
  }

  /** Shortest XZ distance from a camera to a chunk's footprint. */
  function distanceToChunk(mesh: THREE.Object3D, camX: number, camZ: number): number {
    const [ix, iz] = chunkIndices(mesh);
    const [minX, maxX] = chunkSpan(ix);
    const [minZ, maxZ] = chunkSpan(iz);
    const dx = Math.max(minX - camX, 0, camX - maxX);
    const dz = Math.max(minZ - camZ, 0, camZ - maxZ);
    return Math.hypot(dx, dz);
  }

  it('keeps most of the field drawn from every authored spawn', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);

    const chunks: THREE.Object3D[] = [];
    arena.root.traverse((node) => {
      if (node.name.startsWith('farcrysis-grass-chunk-')) chunks.push(node);
    });
    expect(chunks.length).toBe(16);

    const camera = new THREE.Object3D();
    const spawns = [...arena.spawns[0], ...arena.spawns[1]];
    expect(spawns.length).toBeGreaterThanOrEqual(8);

    for (const spawn of spawns) {
      camera.position.set(spawn.x, spawn.y, spawn.z);
      animateGrassField(camera);
      const visible = chunks.filter((c) => c.visible).length;
      // Centre-distance culling scored 4/16 here. Bounds culling at the fog
      // near plane scores 9/16 at the worst spawn (-52,-52) and 13/16 at the
      // inboard spawns; anything under 9 is a regression of this fix.
      expect(
        visible,
        `only ${visible}/16 grass chunks drawn from spawn (${spawn.x}, ${spawn.z})`,
      ).toBeGreaterThanOrEqual(9);
    }
  });

  it('culls on chunk BOUNDS, not chunk centre', () => {
    const root = new THREE.Group();
    buildFarcrysisGrassField(root);
    const camera = new THREE.Object3D();

    // The corner spawn. The chunk covering the arena centre has its CENTRE
    // 92.6 m away (culled by a centre test at any sane draw distance) but its
    // nearest edge only 73.5 m away — grass the player can plainly see.
    camera.position.set(-52, 1.7, -52);
    animateGrassField(camera);

    for (const chunk of root.children) {
      const near = distanceToChunk(chunk, -52, -52);
      if (near <= FARCRYSIS_GRASS_DRAW_DISTANCE_M) {
        expect(chunk.visible, `${chunk.name} is ${near.toFixed(1)} m away and must draw`).toBe(true);
      } else {
        expect(chunk.visible, `${chunk.name} is ${near.toFixed(1)} m away and must cull`).toBe(false);
      }
    }
  });

  it('cuts the field no closer than the arena fog begins', () => {
    // src/rendering/arenas/farcrysis.ts authors fog { near: 78, far: 200 }.
    // With bounds culling, the nearest grass a cull can remove is exactly
    // FARCRYSIS_GRASS_DRAW_DISTANCE_M away, so the boundary only ever falls
    // where the fog has already started to hide it. Dropping the draw
    // distance below the fog near plane re-opens the visible edge.
    expect(FARCRYSIS_GRASS_DRAW_DISTANCE_M).toBeGreaterThanOrEqual(78);
  });
});
