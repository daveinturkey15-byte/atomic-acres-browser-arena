/**
 * Shared helpers for technique-lab group C (stable source IDs 35-50).
 *
 * Constraints every demo in this folder honours, from the group-C brief:
 *   - no renderer, no requestAnimationFrame loop, no event listeners;
 *   - no global fog, global lights, camera or tone mapping;
 *   - local positioned lights only where the technique itself is about lights,
 *     and then named in the demo's metadata;
 *   - deterministic from the supplied seed, bounded mesh/draw/texture counts,
 *     and disposal that actually releases what the demo created.
 */

import { hash11 } from '../../../noise';

export type DemoContext = {
  THREE: typeof import('three');
  seed: number;
};

export type DemoAdaptation = 'exact' | 'adapted' | 'blocked';

export type DemoMetadata = {
  sourceId: number;
  title: string;
  method: string;
  adaptation: DemoAdaptation;
  sources: string[];
  limitation?: string;
  /** Local positioned lights this demo creates, if any. Empty for most. */
  localLights?: string[];
  /** Counters a CPU check can assert against without a GPU. */
  counters?: Record<string, number>;
};

export type Demo = {
  root: import('three').Group;
  update?: (time: number, dt: number) => void;
  dispose: () => void;
  metadata: DemoMetadata;
};

/**
 * Deterministic scalar stream. Built on the repository's existing CPU hash
 * (`src/map3/noise.ts` `hash11`) rather than a second private hash, so a demo
 * seeded here and a world feature seeded there move together.
 */
export function createRng(seed: number): () => number {
  let cursor = seed * 0.618033988749895 + 1;
  return () => {
    cursor += 1;
    return hash11(cursor);
  };
}

/** Deterministic value in [min, max). */
export function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Disposes every geometry and material reachable from `root` exactly once, plus
 * any extra disposables the demo registered. Textures owned by a material are
 * released too, because a demo that generates its own DataTexture must not leak
 * it when the lab swaps exhibits.
 */
export function disposeTree(
  root: import('three').Object3D,
  extra: Array<{ dispose: () => void }> = [],
): void {
  const seenGeometry = new Set<unknown>();
  const seenMaterial = new Set<unknown>();
  root.traverse((object: any) => {
    const geometry = object.geometry;
    if (geometry && !seenGeometry.has(geometry)) {
      seenGeometry.add(geometry);
      geometry.dispose?.();
    }
    const material = object.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of materials) {
      if (seenMaterial.has(entry)) continue;
      seenMaterial.add(entry);
      for (const value of Object.values(entry)) {
        if (value && typeof value === 'object' && (value as any).isTexture) {
          (value as any).dispose?.();
        }
      }
      entry.dispose?.();
    }
  });
  for (const disposable of extra) disposable.dispose();
  root.clear();
}

/**
 * Two side-by-side panels so a technique's before/after is one inspectable
 * object rather than two exhibits. Returns groups already positioned; the demo
 * fills them. `separation` is the centre-to-centre distance in metres.
 */
export function beforeAfterPanels(
  THREE: typeof import('three'),
  separation = 3.2,
): { before: import('three').Group; after: import('three').Group } {
  const before = new THREE.Group();
  before.name = 'before';
  before.position.x = -separation / 2;
  const after = new THREE.Group();
  after.name = 'after';
  after.position.x = separation / 2;
  return { before, after };
}

/** Counts meshes and instanced draws under a root, for bounded-cost checks. */
export function countDraws(root: import('three').Object3D): {
  meshes: number;
  instancedMeshes: number;
  instances: number;
  triangles: number;
} {
  let meshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let triangles = 0;
  root.traverse((object: any) => {
    if (!object.isMesh && !object.isInstancedMesh && !object.isLineSegments) return;
    const geometry = object.geometry;
    const indexed = geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0;
    const perInstance = Math.floor(indexed / 3);
    if (object.isInstancedMesh) {
      instancedMeshes += 1;
      instances += object.count;
      triangles += perInstance * object.count;
    } else if (object.isMesh) {
      meshes += 1;
      triangles += perInstance;
    }
  });
  return { meshes, instancedMeshes, instances, triangles };
}

/**
 * Writes a per-vertex colour attribute by evaluating `shade` at each vertex in
 * local space. Several group-C techniques are colour/physics terms whose whole
 * point is a value at a position; evaluating them on the CPU into vertex
 * colours keeps the demo renderer-agnostic and — more usefully here — makes the
 * term assertable by a CPU check instead of only by eye.
 */
export function paintVertices(
  THREE: typeof import('three'),
  geometry: import('three').BufferGeometry,
  shade: (x: number, y: number, z: number) => [number, number, number],
): void {
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const [r, g, b] = shade(position.getX(i), position.getY(i), position.getZ(i));
    colours[i * 3] = r;
    colours[i * 3 + 1] = g;
    colours[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}
