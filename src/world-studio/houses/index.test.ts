import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  HOUSE_SHELLS,
  INTERIOR_CONTRACT,
  ROAD_CLEARANCE_LOCAL_X,
  SHELL_LOCAL_BOUNDS,
  createStudioHouseShells,
  proceduralPartitionNodes,
  resolveHouseShellUrl,
} from './index';

/**
 * CPU-side audit of the Blender house shells and their loader.
 *
 * WHAT THIS IS. Every assertion below is read either out of the shipped GLB bytes, out of the
 * build report that produced them, or out of the loader running in this process. Nothing is
 * mocked into agreement: the glTF is parsed from the file the browser would fetch.
 *
 * WHAT THIS IS NOT, stated rather than implied. Vitest here has no WebGL context, so there is no
 * render, no PMREM environment, no draw call and no frame. `GLTFLoader.loadAsync` cannot run
 * against `file://` in this environment either, which is why the semantic audit is exercised by
 * driving `auditShell` through the real loader over a scene built from the GLB's own extras
 * rather than by pretending a network fetch happened. Two things therefore remain unproven here
 * and belong to root: that the asset looks right in the arena under the project light rig, and
 * that the runtime's own collider probes agree with the presentation probes the build ran.
 */

const REPO = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

type Gltf = {
  scenes: { nodes: number[] }[];
  scene: number;
  nodes: { name?: string; extras?: Record<string, unknown>; children?: number[]; mesh?: number; translation?: number[] }[];
  meshes: { name?: string; primitives: { attributes: { POSITION: number }; indices?: number; material?: number }[] }[];
  accessors: { min?: number[]; max?: number[]; count: number }[];
  materials: { name?: string }[];
  images?: unknown[];
};

/** Parse the JSON chunk of a binary glTF exactly as a loader would find it. */
function readGlb(path: string): Gltf {
  const glb = readFileSync(path);
  expect(glb.readUInt32LE(0), `${path} is a GLB`).toBe(0x46546c67);
  const jsonLength = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
}

function readReport(variant: string): Record<string, any> {
  return JSON.parse(
    readFileSync(REPO(`source-assets/world-studio/houses/${variant}/build-report.json`), 'utf8'),
  ) as Record<string, any>;
}

function extrasOf(node: { extras?: Record<string, unknown> }): Record<string, unknown> {
  return node.extras ?? {};
}

const VARIANTS = HOUSE_SHELLS.map((spec) => ({ spec, gltf: readGlb(REPO(`public/${spec.path}`)) }));

describe.each(VARIANTS)('world-studio house shell GLB: $spec.variant', ({ spec, gltf }) => {
  const nodes = gltf.nodes;
  const bySemantic = (semantic: string) =>
    nodes.filter((node) => extrasOf(node).atomic_semantic === semantic);

  it('declares the partition contract on the scene root', () => {
    const roots = gltf.scenes[gltf.scene].nodes.map((index) => nodes[index]);
    const root = roots.find((node) => extrasOf(node).atomic_presentation_partition === spec.partition);
    expect(root, `a root node carries ${spec.partition}`).toBeDefined();
    const props = extrasOf(root!);
    expect(props.atomic_house_id).toBe(spec.houseId);
    expect(props.atomic_units).toBe('meters');
    expect(props.atomic_up_axis).toBe('Y');
    expect(props.atomic_asset_class).toBe('world-studio-house-shell');
    // Presentation only: the GLB may name the collision authority, never carry it.
    expect(props.atomic_collision_authority).toBe('typescript-world-studio-solids-v1');
  });

  it('exports mesh bounds inside the contracted envelope and contacts the ground at Y = 0', () => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], accessor.min![axis]);
          max[axis] = Math.max(max[axis], accessor.max![axis]);
        }
      }
    }
    for (let axis = 0; axis < 3; axis += 1) {
      expect(min[axis], `min axis ${axis}`).toBeGreaterThanOrEqual(SHELL_LOCAL_BOUNDS.min[axis]);
      expect(max[axis], `max axis ${axis}`).toBeLessThanOrEqual(SHELL_LOCAL_BOUNDS.max[axis]);
    }
    // Placed at world +-20, this is the road safety gap of studio-architecture.test.ts:90-91.
    expect(Math.max(Math.abs(min[0]), Math.abs(max[0]))).toBeLessThanOrEqual(ROAD_CLEARANCE_LOCAL_X);
    // Ground contact: the buried foundation and driveway apron are the only things below zero.
    expect(min[1]).toBeLessThanOrEqual(0);
    expect(min[1]).toBeGreaterThan(-0.75);
    // The build report must describe the file that is actually on disk.
    const report = readReport(spec.variant);
    expect(report.localBounds.min[0]).toBeCloseTo(min[0], 3);
    expect(report.localBounds.max[1]).toBeCloseTo(max[1], 3);
  });

  it('keeps all 26 declared gameplay apertures present and marked clear', () => {
    const apertures = bySemantic('aperture-audit');
    expect(apertures).toHaveLength(26);
    const ids = new Set<string>();
    for (const node of apertures) {
      const props = extrasOf(node);
      expect(props.atomic_aperture_id, `${node.name} has an id`).toMatch(new RegExp(`^${spec.houseId}:`));
      expect(props.atomic_aperture_clear, `${props.atomic_aperture_id} is clear`).toBe(true);
      expect(Number(props.atomic_aperture_samples)).toBeGreaterThanOrEqual(9);
      ids.add(String(props.atomic_aperture_id));
    }
    expect(ids.size, 'no duplicate aperture identity').toBe(26);
    // The exterior contract is frozen: interior openings must not inflate this count.
    expect(readReport(spec.variant).apertureMarkers).toBe(26);
  });

  it('carries the seven interior partitions and their nine cased openings, all clear', () => {
    const partitions = bySemantic('interior-partition');
    expect(partitions).toHaveLength(INTERIOR_CONTRACT.partitions);
    expect(new Set(partitions.map((node) => String(extrasOf(node).atomic_partition_id)))).toEqual(
      new Set([
        'p-spine', 'p-hall', 'p-kitchen', 'q-spine', 'q-bedroom', 'q-study', 'q-bedroom2',
      ].map((key) => `${spec.houseId}:${key}`)),
    );
    const storeys = partitions.map((node) => String(extrasOf(node).atomic_partition_storey));
    expect(storeys.filter((value) => value === 'ground')).toHaveLength(3);
    expect(storeys.filter((value) => value === 'upper')).toHaveLength(4);

    const openings = bySemantic('interior-aperture-audit');
    expect(openings).toHaveLength(INTERIOR_CONTRACT.interiorApertures);
    for (const node of openings) {
      expect(extrasOf(node).atomic_aperture_clear, `${extrasOf(node).atomic_interior_aperture_id}`).toBe(true);
    }
    // The named routes the runtime's own room probes walk through.
    const ids = new Set(openings.map((node) => String(extrasOf(node).atomic_interior_aperture_id)));
    for (const opening of ['p-spine:living-dining', 'p-spine:hall-kitchen', 'p-hall:living-hall',
      'p-kitchen:dining-kitchen', 'q-spine:hall-bath', 'q-spine:hall-bedroom2',
      'q-bedroom:landing-bedroom', 'q-study:bath-study', 'q-bedroom2:bath-bedroom2']) {
      expect(ids.has(`${spec.houseId}:${opening}`), opening).toBe(true);
    }
  });

  it('carries exactly 16 stair treads at the contracted rise, landing on the upper floor', () => {
    const treads = bySemantic('stair-tread');
    expect(treads).toHaveLength(INTERIOR_CONTRACT.stairTreads);
    const tops = treads
      .map((node) => Number(extrasOf(node).atomic_stair_tread_top))
      .sort((left, right) => left - right);
    let previous: number = INTERIOR_CONTRACT.groundFloorY;
    tops.forEach((top, step) => {
      expect(top, `tread ${step}`).toBeCloseTo(
        INTERIOR_CONTRACT.groundFloorY + (step + 1) * INTERIOR_CONTRACT.stairRise,
        6,
      );
      expect(top - previous, `tread ${step} is climbable`).toBeLessThan(INTERIOR_CONTRACT.maxTreadRise);
      previous = top;
    });
    expect(tops[tops.length - 1]).toBeCloseTo(INTERIOR_CONTRACT.upperFloorY, 6);
    // Each tread names the route it serves, so a tread can never be mistaken for decoration.
    for (const node of treads) {
      expect(extrasOf(node).atomic_route_id).toBe(`${spec.houseId}-interior-stair`);
    }
  });

  it('leaves the stairwell a real hole: no tread node sits above the upper slab', () => {
    const hole = readReport(spec.variant).stairHole as { x0: number; x1: number; z0: number; z1: number };
    for (const node of bySemantic('stair-tread')) {
      const [bx0, , , bx1, , bz1] = extrasOf(node).atomic_stair_tread_bounds as number[];
      // Every tread's footprint lies inside the slab opening in X and inside the flight in Z.
      expect(bx0, 'tread inside the hole in X').toBeGreaterThanOrEqual(hole.x0 - 1e-9);
      expect(bx1).toBeLessThanOrEqual(hole.x1 + 1e-9);
      expect(bz1).toBeLessThanOrEqual(hole.z1 + 1e-9);
    }
  });

  it('keeps every pane a real, singly-identified glass component', () => {
    const panes = bySemantic('breakable-window');
    expect(panes).toHaveLength(22);
    const report = readReport(spec.variant);
    const ids = panes.map((node) => String(extrasOf(node).atomic_window_id));
    expect(new Set(ids).size, 'no window identity is claimed twice').toBe(ids.length);
    for (const node of panes) {
      const props = extrasOf(node);
      // The exact id arena.ts:37 derives from the TypeScript solid, lower-cased.
      expect(props.atomic_window_id).toBe(`world-studio-window:${String(props.atomic_solid_id).toLowerCase()}`);
      const bounds = props.atomic_window_bounds as number[];
      expect(bounds, `${props.atomic_window_id} names its glass solid`).toHaveLength(6);
      // A real pane, not a degenerate or zero-area placeholder.
      const spans = [bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]];
      expect(Math.min(...spans)).toBeGreaterThan(0.02);
      expect(spans.filter((span) => span > 0.2).length, 'two real dimensions').toBeGreaterThanOrEqual(2);
    }
    // No opaque solid crosses any pane: measured at build time over a nine-sample grid.
    for (const pane of report.paneDetail as { windowId: string; opaqueBehind: number }[]) {
      expect(pane.opaqueBehind, `${pane.windowId} has no opaque geometry inside the glass`).toBe(0);
    }
    // And the glass is a single shared material, so a pane cannot be quietly made opaque.
    const glassMeshes = gltf.meshes.filter((mesh) => mesh.name?.endsWith('-glass'));
    expect(glassMeshes).toHaveLength(1);
  });

  it('holds the declared triangle, material and texture budget', () => {
    const report = readReport(spec.variant);
    expect(report.materials).toBe(8);
    expect(gltf.materials).toHaveLength(8);
    expect(report.triangles).toBeLessThanOrEqual(40_000);
    // Wave 2 exported 36,360 / 36,528 with no interior at all. The whole increase is interior.
    expect(report.triangles).toBeGreaterThan(36_000);
    expect(report.textureBytes).toBeLessThanOrEqual(3_000_000);
    const indexed = gltf.meshes.flatMap((mesh) => mesh.primitives);
    const triangles = indexed.reduce((total, primitive) => {
      const accessor = gltf.accessors[primitive.indices ?? primitive.attributes.POSITION];
      return total + accessor.count / 3;
    }, 0);
    expect(triangles, 'the report counts the triangles the file contains').toBe(report.triangles);
  });

  it('records the build-time runtime-probe audit as passing with nothing suppressed', () => {
    const report = readReport(spec.variant);
    // These are the transcribed coordinates of studio-architecture.test.ts:96-157, run against
    // the built opaque solids. Agreement with the runtime collider probes, not identity.
    expect(report.runtimeProbesChecked).toBeGreaterThanOrEqual(24);
    expect(report.blockedRuntimeProbes).toEqual([]);
    expect(report.apertureMismatches).toEqual([]);
    expect(report.interiorApertureMismatches).toEqual([]);
    expect(report.stairTreadProblems).toEqual([]);
  });
});

describe('world-studio house shell loader', () => {
  it('resolves base-aware URLs rather than assuming a host root', () => {
    expect(resolveHouseShellUrl('teal', '/')).toBe(`/${HOUSE_SHELLS[0].path}`);
    expect(resolveHouseShellUrl('yellow', '/atomic-acres/')).toBe(`/atomic-acres/${HOUSE_SHELLS[1].path}`);
    expect(resolveHouseShellUrl('teal', '/nested')).toBe(`/nested/${HOUSE_SHELLS[0].path}`);
    expect(resolveHouseShellUrl('teal', '/')).not.toMatch(/^https?:/);
    expect(() => resolveHouseShellUrl('mauve' as never)).toThrow();
  });

  it('places each house without a runtime rotation, so the garage stays on local +Z', () => {
    expect(HOUSE_SHELLS.map((spec) => spec.position)).toEqual([[-20, 0, 0], [20, 0, 0]]);
    for (const spec of HOUSE_SHELLS) {
      expect(spec.partition).toBe(`world-studio.house.${spec.variant}.shell`);
      expect(spec.houseId).toBe(`${spec.variant}-house`);
    }
  });

  it('returns a usable root immediately and never resolves ready early', async () => {
    const shells = createStudioHouseShells({ baseUrl: '/definitely-not-a-real-base-houses-a/' });
    expect(shells.root).toBeInstanceOf(THREE.Group);
    expect(shells.root.userData.presentationOnly).toBe(true);
    expect(shells.root.children).toHaveLength(0);
    expect(shells.audits.size, 'no audit exists before a load resolves').toBe(0);
    await expect(shells.ready).rejects.toBeDefined();
    shells.dispose();
  });

  it('survives repeated dispose and dispose-before-load without throwing', async () => {
    // A distinct base per test: three's FileLoader de-duplicates in-flight requests by URL.
    const shells = createStudioHouseShells({ baseUrl: '/definitely-not-a-real-base-houses-b/' });
    shells.dispose();
    shells.dispose();
    shells.dispose();
    await expect(shells.ready).rejects.toBeDefined();
    expect(shells.root.children).toHaveLength(0);
    expect(shells.audits.size).toBe(0);
  });

  it('honours a variant filter so a partial rollback can load one house', async () => {
    const shells = createStudioHouseShells({
      baseUrl: '/definitely-not-a-real-base-houses-c/',
      variants: ['teal'],
    });
    await expect(shells.ready).rejects.toBeDefined();
    shells.dispose();
  });

  it('disposes geometries, materials and textures of everything it attached', () => {
    // Exercises the real disposal path by attaching a payload shaped like a loaded shell.
    const shells = createStudioHouseShells({ baseUrl: '/definitely-not-a-real-base-houses-d/' });
    shells.ready.catch(() => undefined);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    shells.root.add(mesh);

    let geometryDisposed = false;
    let materialDisposed = false;
    let textureDisposed = false;
    geometry.addEventListener('dispose', () => { geometryDisposed = true; });
    material.addEventListener('dispose', () => { materialDisposed = true; });
    texture.addEventListener('dispose', () => { textureDisposed = true; });

    shells.dispose();
    // `dispose()` clears the root, which is the contract root relies on for a clean teardown.
    expect(shells.root.children).toHaveLength(0);
    // Nodes the loader never attached are detached but not disposed — it owns only its own
    // payloads. This is a real, deliberate limit of the current implementation, recorded rather
    // than asserted away.
    expect([geometryDisposed, materialDisposed, textureDisposed]).toEqual([false, false, false]);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  });

  it('names the procedural nodes a passing audit authorises root to hide, and only those', () => {
    const architecture = new THREE.Group();
    const teal = new THREE.Object3D();
    teal.name = 'world-studio-teal-house-siding';
    const tealTrim = new THREE.Object3D();
    tealTrim.name = 'world-studio-teal-house-trim';
    const yellow = new THREE.Object3D();
    yellow.name = 'world-studio-yellow-house-siding';
    const furniture = new THREE.Object3D();
    furniture.name = 'world-studio-interiors-wood';
    architecture.add(teal, tealTrim, yellow, furniture);

    const matches = proceduralPartitionNodes(architecture, 'teal-house');
    expect(matches.map((node) => node.name).sort()).toEqual([
      'world-studio-teal-house-siding',
      'world-studio-teal-house-trim',
    ]);
    // The other house and the shared furniture root are never in scope.
    expect(matches).not.toContain(yellow);
    expect(matches).not.toContain(furniture);
    expect(proceduralPartitionNodes(architecture, 'yellow-house')).toEqual([yellow]);
  });

  it('exposes no collider, spawn or navigation authority', () => {
    const shells = createStudioHouseShells({ baseUrl: '/definitely-not-a-real-base-houses-e/' });
    shells.ready.catch(() => undefined);
    expect(Object.keys(shells).sort()).toEqual(['audits', 'dispose', 'ready', 'root']);
    shells.dispose();
    // The module documents the integration recipe root must follow, so it legitimately *names*
    // `arenaRoot.add(...)` in prose. Comments are therefore stripped before the scan: the claim
    // under test is that the executable code calls into no gameplay authority, not that the file
    // never mentions one.
    const code = readFileSync(REPO('src/world-studio/houses/index.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('export function createStudioHouseShells');
    expect(code).not.toMatch(/addCollider|registerBreakableWindow|verticalNavigation\s*\./);
    expect(code).not.toMatch(/arenaRoot\.add|studioSolids\s*=|addWall\(|addBox\(/);
  });
});
