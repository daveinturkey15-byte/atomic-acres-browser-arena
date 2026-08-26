/**
 * Pass 76 visual-dressing contract tests for the Farcrysis arena.
 *
 * The visual audit rebuilt the arena's dressing (palms, drums, crates,
 * sandbags, LOD impostors) around shared InstancedMesh draws while keeping
 * every collider the gameplay layer already owned. These tests pin the
 * three contracts that rebuild rests on:
 *
 *   (a) the static batcher must NEVER collapse an InstancedMesh — doing so
 *       batched exactly one copy at the origin and hid the source, which is
 *       how the entire instanced jungle vanished on the WebGL2 route;
 *   (b) rebuilt visuals keep their collider agreement: gameplay palm trunks
 *       use the enhanced-palm proxy idiom, fuel drums are 0.6 m x 0.9 m with
 *       colliders shrunk to match, and every collision proxy stays invisible
 *       yet raycastable;
 *   (c) the vegetation LOD swap only fires far outside the arena (players at
 *       corner spawns are ~38 m from centre and must see full detail).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { batchStaticMeshes } from './art-kit';
import { buildFarcrysis } from './farcrysis';
import { setVegetationLOD } from './farcrysis-vegetation';
import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';
import { FUEL_DRUM_HEIGHT, FUEL_DRUM_RADIUS } from './farcrysis-physics';
import { TRUNK_HEIGHT } from './farcrysis-palms-enhanced';
import type { Box2 } from './collision';

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

describe('farcrysis pass-76 visual dressing', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  // (a) The batcher bug that deleted the jungle.
  it('static batching leaves InstancedMesh sources visible and unbatched', () => {
    const root = new THREE.Group();
    root.name = 'instancing-fixture';
    const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 }));
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2f6b2a }),
      8,
    );
    const spread = new THREE.Matrix4();
    for (let i = 0; i < 8; i += 1) {
      spread.makeTranslation(i * 3, 0, 0);
      instanced.setMatrixAt(i, spread);
    }
    root.add(plain, instanced);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'preserve');

    // The plain mesh batches as before; the instanced mesh is untouched.
    expect(stats.sourceMeshes).toBe(1);
    expect(plain.visible).toBe(false);
    expect(instanced.visible).toBe(true);
    expect(instanced.userData.staticBatchRendered).toBeUndefined();
  });

  it('keeps every farcrysis instanced vegetation layer out of batches', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    batchStaticMeshes(arena.root, arena.root, () => '', 'preserve');

    const swallowed: string[] = [];
    arena.root.traverse((node) => {
      if ((node as THREE.InstancedMesh).isInstancedMesh && node.userData.staticBatchRendered === true) {
        swallowed.push(node.name || node.type);
      }
    });
    expect(swallowed, `instanced layers swallowed by the batcher:\n${swallowed.join('\n')}`).toEqual([]);
  });

  // (b) Collider agreement for the rebuilt visuals.
  it('authors gameplay palm colliders with the enhanced-palm proxy idiom', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2 }>;

    const palmColliders = audit.filter((entry) => entry.id.startsWith('farcrysis-palm-trunk-'));
    expect(palmColliders.length).toBe(8);
    for (const { id, bounds } of palmColliders) {
      // 0.6 m square footprint (the HF-360 enhanced-palm trunk idiom).
      expect(bounds.maxX - bounds.minX, `${id} footprint X`).toBeCloseTo(0.6, 5);
      expect(bounds.maxZ - bounds.minZ, `${id} footprint Z`).toBeCloseTo(0.6, 5);
      // Base seated on the terrain authority; height tracks a scaled trunk.
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cz = (bounds.minZ + bounds.maxZ) / 2;
      expect(Math.abs((bounds.minY ?? 0) - farcrysisTerrainHeight(cx, cz)), `${id} seating`).toBeLessThanOrEqual(0.05);
      const height = (bounds.maxY ?? 0) - (bounds.minY ?? 0);
      expect(height, `${id} height`).toBeGreaterThanOrEqual(TRUNK_HEIGHT * 0.9);
      expect(height, `${id} height`).toBeLessThanOrEqual(TRUNK_HEIGHT * 1.25);
    }

    // The consolidated visual layer exists as instanced draws.
    expect(arena.root.getObjectByName('farcrysis-gameplay-palm-trunks')).toBeInstanceOf(THREE.InstancedMesh);
    expect(arena.root.getObjectByName('farcrysis-gameplay-palm-fronds')).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('sizes every fuel-drum collider to the 0.6 m x 0.9 m drum', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: Box2 }>;

    const drums = audit.filter((entry) => /^farcrysis-(barrel-\d+|throwback-barrel-collider-)/.test(entry.id));
    expect(drums.length).toBeGreaterThanOrEqual(25);
    for (const { id, bounds } of drums) {
      expect(bounds.maxX - bounds.minX, `${id} width`).toBeCloseTo(FUEL_DRUM_RADIUS * 2, 5);
      expect((bounds.maxY ?? 0) - (bounds.minY ?? 0), `${id} height`).toBeCloseTo(FUEL_DRUM_HEIGHT, 5);
    }

    // Shared drum visuals exist (interactable + throwback prefixes).
    expect(arena.root.getObjectByName('farcrysis-interactable-drum-bodies')).toBeInstanceOf(THREE.InstancedMesh);
    expect(arena.root.getObjectByName('farcrysis-throwback-drum-bodies')).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('keeps every collision proxy invisible but raycastable', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);
    const raycastSet = new Set(arena.raycastMeshes);

    let proxies = 0;
    arena.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || node.userData.collisionProxy !== true) return;
      proxies += 1;
      expect(node.visible, `${node.name} must stay invisible`).toBe(false);
    });
    // Crates + barrels + sandbags + logs + rocks + palms + throwbacks all
    // route through proxies now — there must be a substantial population and
    // the named interactable proxies must still be raycast targets.
    expect(proxies).toBeGreaterThan(80);
    const crate01 = arena.root.getObjectByName('farcrysis-crate-01');
    expect(crate01).toBeTruthy();
    expect(raycastSet.has(crate01 as THREE.Mesh)).toBe(true);

    // And the rebuilt instanced visual families are present.
    for (const name of [
      'farcrysis-interactable-crates',
      'farcrysis-interactable-sandbags',
      'farcrysis-interactable-fallen-logs',
      'farcrysis-interactable-boulders',
    ]) {
      expect(arena.root.getObjectByName(name), `expected ${name}`).toBeInstanceOf(THREE.InstancedMesh);
    }
  });

  // (c) LOD threshold: full detail for every in-arena camera.
  it('keeps near vegetation visible at corner-spawn camera distances', () => {
    const scene = new THREE.Scene();
    const arena = buildFarcrysis(scene);

    const nearLayer = arena.root.getObjectByName('farcrysis-vege-palm-trunks') as THREE.InstancedMesh;
    const farLayer = arena.root.getObjectByName('farcrysis-vege-palm-imposters') as THREE.InstancedMesh;
    expect(nearLayer).toBeTruthy();
    expect(farLayer).toBeTruthy();

    // A corner spawn stands ~38 m from the arena centre — full detail.
    setVegetationLOD(45);
    expect(nearLayer.visible).toBe(true);
    expect(farLayer.visible).toBe(false);

    // Menu fly-bys and review orbits beyond 80 m get the cheap impostors.
    setVegetationLOD(100);
    expect(nearLayer.visible).toBe(false);
    expect(farLayer.visible).toBe(true);

    // Restore near state so later suites see the default.
    setVegetationLOD(10);
  });
});
