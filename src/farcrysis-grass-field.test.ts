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
import {
  animateGrassField,
  buildFarcrysisGrassField,
  createGrassBladeGeometry,
  FARCRYSIS_GRASS_DRAW_DISTANCE_M,
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
    expect(grassPlacementAllowed(24, -24)).toBe(false);     // seaplane disc
    expect(grassPlacementAllowed(200, 200)).toBe(false);    // outside bounds
    expect(grassPlacementAllowed(NaN, 5)).toBe(false);
    // Deep interior plateau admits grass.
    expect(grassPlacementAllowed(-12, -12)).toBe(true);
    expect(FARCRYSIS_GRASS_MIN_SPACING_M).toBeGreaterThan(0.15);
  });

  it('builds a dense field that never breaks the concealment bound', () => {
    const root = new THREE.Group();
    const stats = buildFarcrysisGrassField(root);

    expect(stats.blades).toBeGreaterThan(20_000); // a FIELD, not tufts
    expect(stats.chunks).toBeGreaterThan(0);
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
