/**
 * technique-lab/demos/group-a/_shared.ts — the small amount of machinery every
 * group-A demo needs, and nothing else.
 *
 * Deliberate non-goals, because the lab host owns them: no renderer, no
 * requestAnimationFrame loop, no event listeners, no scene-level fog, camera,
 * tone mapping or ambient/directional lighting. A demo returns a `Group`, an
 * optional `update(time, dt)` the host may call, and a `dispose()` that must
 * release every GPU resource the demo created.
 *
 * Repo contract observed: no `ShaderMaterial`, no `RawShaderMaterial`, no
 * `onBeforeCompile`. Everything here is built from core Three materials, which
 * the WebGPU renderer supports through its own node translation, plus
 * `DataTexture` for procedurally generated maps.
 */

import type * as THREE_NS from 'three';

export type ThreeNamespace = typeof THREE_NS;

export interface DemoContext {
  THREE: ThreeNamespace;
  seed: number;
}

export type Adaptation = 'exact' | 'adapted' | 'blocked';

export interface DemoMetadata {
  sourceId: number;
  title: string;
  method: string;
  adaptation: Adaptation;
  sources: string[];
  limitation?: string;
  /** Local positioned lights this demo creates, named so the host can audit them. */
  localLights?: string[];
  /** Counters a CPU check can assert against without a renderer. */
  counters?: Record<string, number>;
}

export interface Demo {
  root: THREE_NS.Group;
  update?: (time: number, dt: number) => void;
  dispose: () => void;
  metadata: DemoMetadata;
}

/**
 * mulberry32 — 32-bit, no dependencies, identical sequence for identical seed.
 * Every demo draws from this and never from `Math.random`, so two runs of the
 * same seed produce byte-identical geometry.
 */
export function makeRng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise with smooth interpolation, seeded per demo. */
export function makeValueNoise(seed: number): (x: number, y: number) => number {
  const size = 64;
  const rng = makeRng(seed);
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i += 1) table[i] = rng();
  const at = (ix: number, iy: number) =>
    table[(((iy % size) + size) % size) * size + (((ix % size) + size) % size)];
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * A disposal registry. Every demo registers what it creates; `dispose()` then
 * has nothing to discover by traversal and cannot miss a render target or a
 * texture that is referenced by a material rather than by the scene graph.
 *
 * This is the "missing disposal" HIGH-severity finding from source 9 applied to
 * the lab itself rather than only demonstrated inside source 9's demo.
 */
export class DisposalRegistry {
  private readonly items: Array<{ dispose: () => void }> = [];
  private disposed = false;

  track<T extends { dispose: () => void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  trackAll<T extends { dispose: () => void }>(items: T[]): T[] {
    for (const item of items) this.items.push(item);
    return items;
  }

  get size(): number {
    return this.items.length;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  run(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items) item.dispose();
    this.items.length = 0;
  }
}

/**
 * Detach a subtree from its parent without disposing it — used by the
 * before/after demos, where both halves stay alive so they can be compared.
 */
export function labelPlate(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  colour: number,
  width = 0.9,
  height = 0.12,
): THREE_NS.Mesh {
  const geometry = registry.track(new THREE.PlaneGeometry(width, height));
  const material = registry.track(
    new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, side: THREE.DoubleSide }),
  );
  return new THREE.Mesh(geometry, material);
}

/**
 * Build an RGBA `DataTexture` from a per-texel callback. Procedural textures
 * are the shared spine of sources 7, 8 and 17: "zero external assets" means the
 * bytes are computed here, deterministically, and never fetched.
 */
export function makeDataTexture(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  size: number,
  fill: (x: number, y: number, out: [number, number, number, number]) => void,
): THREE_NS.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const out: [number, number, number, number] = [0, 0, 0, 255];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 255;
      fill(x, y, out);
      const i = (y * size + x) * 4;
      data[i] = out[0];
      data[i + 1] = out[1];
      data[i + 2] = out[2];
      data[i + 3] = out[3];
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return registry.track(texture);
}

/** Sum the triangle count of a subtree. Used by the CPU checks and by metadata. */
export function countTriangles(root: THREE_NS.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    const mesh = object as THREE_NS.Mesh & { isMesh?: boolean; isInstancedMesh?: boolean; count?: number };
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry as THREE_NS.BufferGeometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    if (!position) return;
    const per = index ? index.count / 3 : position.count / 3;
    triangles += per * (mesh.isInstancedMesh ? (mesh.count ?? 1) : 1);
  });
  return Math.round(triangles);
}

/** Count drawable nodes (meshes, instanced meshes, points, lines). */
export function countDrawables(root: THREE_NS.Object3D): number {
  let drawables = 0;
  root.traverse((object) => {
    const any = object as { isMesh?: boolean; isPoints?: boolean; isLine?: boolean };
    if (any.isMesh || any.isPoints || any.isLine) drawables += 1;
  });
  return drawables;
}

/**
 * Assert that every finite number in a geometry really is finite. A NaN in a
 * position buffer is invisible to a unit test that only counts vertices and is
 * the standard way a procedural generator silently produces an empty draw.
 */
export function geometryIsFinite(geometry: THREE_NS.BufferGeometry): boolean {
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name);
    const array = attribute.array as ArrayLike<number>;
    for (let i = 0; i < array.length; i += 1) {
      if (!Number.isFinite(array[i])) return false;
    }
  }
  return true;
}

export function subtreeIsFinite(root: THREE_NS.Object3D): boolean {
  let ok = true;
  root.traverse((object) => {
    const mesh = object as THREE_NS.Mesh & { isMesh?: boolean };
    if (mesh.isMesh && mesh.geometry) {
      if (!geometryIsFinite(mesh.geometry as THREE_NS.BufferGeometry)) ok = false;
    }
  });
  return ok;
}

/**
 * Side-by-side comparison rig. `before` sits left of origin, `after` right, with
 * a coloured plate under each so the difference is inspectable rather than
 * asserted in prose.
 */
export function sideBySide(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  before: THREE_NS.Object3D,
  after: THREE_NS.Object3D,
  separation = 2.2,
): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'comparison';
  before.position.x -= separation / 2;
  after.position.x += separation / 2;

  const beforePlate = labelPlate(THREE, registry, 0x8a2f2f, separation * 0.42, 0.08);
  beforePlate.rotation.x = -Math.PI / 2;
  beforePlate.position.set(-separation / 2, 0.002, separation * 0.34);
  beforePlate.name = 'plate:before';

  const afterPlate = labelPlate(THREE, registry, 0x2f8a4a, separation * 0.42, 0.08);
  afterPlate.rotation.x = -Math.PI / 2;
  afterPlate.position.set(separation / 2, 0.002, separation * 0.34);
  afterPlate.name = 'plate:after';

  before.name = before.name || 'before';
  after.name = after.name || 'after';
  group.add(before, after, beforePlate, afterPlate);
  return group;
}
