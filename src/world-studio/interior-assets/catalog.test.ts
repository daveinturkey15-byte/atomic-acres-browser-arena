import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { HOUSE_HALF_DEPTH, HOUSE_HALF_WIDTH, GROUND_FLOOR_Y as HOUSE_GROUND_FLOOR_Y } from '../architecture/house';
import { STUDIO_HOUSES, createStudioArchitecture } from '../architecture';
import { createStudioInteriors, type StudioInteriorAnchor } from '../interiors';
import {
  GROUND_FLOOR_Y,
  INTERIOR_ANCHOR_REFERENCE,
  INTERIOR_HERO_ASSET_PATH,
  interiorHousePlacement,
  resolveInteriorAssetUrl,
  resolveInteriorHeroUrl,
} from './index';
import {
  INTERIOR_ASSETS,
  INTERIOR_HERO_ID,
  INTERIOR_PROP_IDS,
  getInteriorAsset,
  interiorSelectionBounds,
  publishedAnchorIdsFor,
  selectInteriorAssetPaths,
  selectInteriorAssets,
} from './catalog';

/**
 * Catalog-consistency tests for the ten shipped interior GLBs.
 *
 * Everything here is measured from the bytes in `public/` or read from `house.ts`; nothing is
 * asserted against the Blender script's own report, because the script reporting its own census
 * is the thing under test. No renderer, no browser, no GPU, no Blender: these open files and do
 * arithmetic.
 */

const repoFile = (relative: string): string =>
  fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

const ASSET_DIR = 'public/assets/world-studio/blender/interiors';

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    matrix?: number[];
  }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors?: { min?: number[]; max?: number[]; count: number }[];
  images?: { name?: string; mimeType?: string; bufferView: number }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  materials?: unknown[];
  cameras?: unknown[];
  extensionsRequired?: string[];
  extensions?: { KHR_lights_punctual?: { lights?: unknown[] } };
}

/** Reads the JSON chunk of a binary glTF. Header is 12 bytes, then an 8-byte chunk header. */
function readGlbJson(path: string): GltfJson {
  const glb = readFileSync(repoFile(path));
  expect(glb.readUInt32LE(0), `${path} is not a GLB`).toBe(0x46546c67);
  expect(glb.readUInt32LE(4), `${path} glTF container version`).toBe(2);
  const jsonLength = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
}

/** One embedded image, identified by content so the same PNG in two files is recognisable. */
interface EmbeddedImage {
  name: string;
  bytes: number;
  sha256: string;
}

/**
 * Reads the images each GLB carries inside its BIN chunk. Every texture in this set is embedded,
 * not referenced by URI, so a file's transfer cost is its geometry plus its own copy of every map
 * its materials use — and two files that use the same map each carry it in full.
 */
function readEmbeddedImages(path: string): EmbeddedImage[] {
  const glb = readFileSync(repoFile(path));
  const jsonLength = glb.readUInt32LE(12);
  const binStart = 20 + jsonLength;
  const binLength = glb.readUInt32LE(binStart);
  const bin = glb.subarray(binStart + 8, binStart + 8 + binLength);
  const json = JSON.parse(glb.subarray(20, binStart).toString('utf8')) as GltfJson;
  const views = json.bufferViews ?? [];
  return (json.images ?? []).map((image) => {
    const view = views[image.bufferView];
    const start = view.byteOffset ?? 0;
    const payload = bin.subarray(start, start + view.byteLength);
    expect(payload.byteLength, `${path} image ${image.name} truncated`).toBe(view.byteLength);
    return {
      name: image.name ?? '(unnamed)',
      bytes: view.byteLength,
      sha256: createHash('sha256').update(payload).digest('hex'),
    };
  });
}

interface Measured {
  box: THREE.Box3;
  triangles: number;
  meshNodes: number;
  meshes: number;
  materials: number;
  cameras: number;
  lights: number;
  extensionsRequired: readonly string[];
}

/**
 * Composes node transforms down the scene graph and unions each primitive's transformed local
 * AABB. Accessor `min`/`max` are mesh-local, so skipping the nodes reports roughly +/-2.22 m for
 * a 14 m room — this is the same correction `inspect_glb.py` documents, redone in the runtime's
 * own maths rather than trusted from the Python.
 */
function measure(gltf: GltfJson): Measured {
  const box = new THREE.Box3();
  const nodes = gltf.nodes ?? [];
  const meshes = gltf.meshes ?? [];
  const accessors = gltf.accessors ?? [];
  let meshNodes = 0;

  const walk = (index: number, parent: THREE.Matrix4): void => {
    const node = nodes[index];
    const local = new THREE.Matrix4();
    if (node.matrix) {
      // glTF stores column-major, which is exactly what Matrix4.fromArray consumes.
      local.fromArray(node.matrix);
    } else {
      local.compose(
        new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
        new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
      );
    }
    const world = new THREE.Matrix4().multiplyMatrices(parent, local);
    if (node.mesh !== undefined) {
      meshNodes += 1;
      for (const primitive of meshes[node.mesh].primitives) {
        const position = accessors[primitive.attributes.POSITION];
        const localBox = new THREE.Box3(
          new THREE.Vector3().fromArray(position.min ?? []),
          new THREE.Vector3().fromArray(position.max ?? []),
        );
        box.union(localBox.applyMatrix4(world));
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };

  for (const root of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) walk(root, new THREE.Matrix4());

  let triangles = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives) {
      const accessor =
        primitive.indices !== undefined ? accessors[primitive.indices] : accessors[primitive.attributes.POSITION];
      triangles += accessor.count / 3;
    }
  }

  return {
    box,
    triangles,
    meshNodes,
    meshes: meshes.length,
    materials: (gltf.materials ?? []).length,
    cameras: (gltf.cameras ?? []).length,
    lights: (gltf.extensions?.KHR_lights_punctual?.lights ?? []).length,
    extensionsRequired: gltf.extensionsRequired ?? [],
  };
}

interface CatalogRow {
  id: string;
  assetUrl: string;
  kind: string;
  sha256: string;
  presentationOnly: boolean;
  metrics: { objects: number; triangles: number; vertices: number; bytes: number; materials: string[] };
}

const shippedCatalog = JSON.parse(readFileSync(repoFile(`${ASSET_DIR}/catalog.json`), 'utf8')) as {
  assets: CatalogRow[];
  limitations: string[];
};

const measured = new Map(INTERIOR_ASSETS.map((asset) => [asset.id, measure(readGlbJson(`public/${asset.path}`))]));
const rows = new Map(shippedCatalog.assets.map((row) => [row.id, row]));

/** Built at most once: two tests need the real anchors, and the build is the slow part of this file. */
let architectureOnce: ReturnType<typeof createStudioArchitecture> | undefined;
const builtArchitecture = (): ReturnType<typeof createStudioArchitecture> =>
  (architectureOnce ??= createStudioArchitecture());

// Read from the shipped configs, never spelled by hand: the anchor prefix is the house `id`
// (`teal-house`), not its `side` (`teal`), and confusing the two is what wave 3 got wrong.
const TEAL_HOUSE_ID = STUDIO_HOUSES.find((house) => house.side === 'teal')!.id;
const YELLOW_HOUSE_ID = STUDIO_HOUSES.find((house) => house.side === 'yellow')!.id;

/**
 * three 0.185.1's GLTFLoader implements these natively, so a required extension in this list
 * needs no decoder registration. Anything else would load as an error at runtime.
 */
const LOADER_SUPPORTED_EXTENSIONS = new Set(['KHR_texture_transform', 'KHR_materials_emissive_strength']);

describe('interior asset catalog', () => {
  it('names exactly the ten rows the build shipped, with the same ids and paths', () => {
    expect(INTERIOR_ASSETS).toHaveLength(10);
    expect(shippedCatalog.assets).toHaveLength(10);
    expect(INTERIOR_ASSETS.map((a) => a.id)).toEqual(shippedCatalog.assets.map((r) => r.id));
    for (const asset of INTERIOR_ASSETS) {
      const row = rows.get(asset.id);
      expect(row, `${asset.id} missing from catalog.json`).toBeDefined();
      expect(asset.path).toBe(row!.assetUrl);
      expect(asset.kind).toBe(row!.kind);
      expect(row!.presentationOnly).toBe(true);
    }
    // Exactly one composition; the rest are props.
    expect(INTERIOR_ASSETS.filter((a) => a.kind === 'composition').map((a) => a.id)).toEqual([INTERIOR_HERO_ID]);
    expect(INTERIOR_PROP_IDS).toHaveLength(9);
    // The hero path the loader defaults to is the hero row, not a second spelling of it.
    expect(INTERIOR_HERO_ASSET_PATH).toBe(getInteriorAsset(INTERIOR_HERO_ID).path);
  });

  it('resolves to files that are on disk and still match their pinned hashes', () => {
    for (const asset of INTERIOR_ASSETS) {
      const bytes = readFileSync(repoFile(`public/${asset.path}`));
      const row = rows.get(asset.id)!;
      expect(bytes.byteLength, `${asset.id} size`).toBe(row.metrics.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), `${asset.id} sha256`).toBe(row.sha256);
    }
  });

  it('carries no preview rig and requires only extensions this loader implements', () => {
    for (const asset of INTERIOR_ASSETS) {
      const stats = measured.get(asset.id)!;
      expect(stats.cameras, `${asset.id} cameras`).toBe(0);
      expect(stats.lights, `${asset.id} punctual lights`).toBe(0);
      for (const extension of stats.extensionsRequired) {
        expect(LOADER_SUPPORTED_EXTENSIONS.has(extension), `${asset.id} requires ${extension}`).toBe(true);
      }
    }
  });

  it('pins bounds that the shipped geometry still measures, in the house-local frame', () => {
    for (const asset of INTERIOR_ASSETS) {
      const { box } = measured.get(asset.id)!;
      for (let axis = 0; axis < 3; axis += 1) {
        expect(box.min.getComponent(axis), `${asset.id} min[${axis}]`).toBeCloseTo(asset.bounds.min[axis], 3);
        expect(box.max.getComponent(axis), `${asset.id} max[${axis}]`).toBeCloseTo(asset.bounds.max[axis], 3);
      }
    }
  });

  it('keeps every asset inside the published house envelope', () => {
    for (const asset of INTERIOR_ASSETS) {
      expect(asset.bounds.min[0], `${asset.id} -X`).toBeGreaterThanOrEqual(-HOUSE_HALF_WIDTH);
      expect(asset.bounds.max[0], `${asset.id} +X`).toBeLessThanOrEqual(HOUSE_HALF_WIDTH);
      expect(asset.bounds.min[2], `${asset.id} -Z`).toBeGreaterThanOrEqual(-HOUSE_HALF_DEPTH);
      expect(asset.bounds.max[2], `${asset.id} +Z`).toBeLessThanOrEqual(HOUSE_HALF_DEPTH);
    }
  });

  it('never rises above the storey it dresses', () => {
    // Ground-floor dressing only: nothing may reach the upper floor slab at y = 3.3 local.
    for (const asset of INTERIOR_ASSETS) {
      expect(asset.bounds.max[1], `${asset.id} height`).toBeLessThan(3.3);
    }
  });

  it('records the 5.4 mm dip below the floor plane rather than claiming y >= 0', () => {
    // Four props bevel slightly through y = 0. This is cosmetically invisible and it is real;
    // an integrator assuming a strictly non-negative set would be assuming something false.
    const dipping = INTERIOR_ASSETS.filter((a) => a.bounds.min[1] < 0).map((a) => a.id);
    expect(dipping).toEqual([
      INTERIOR_HERO_ID,
      'interior-prop-sofa',
      'interior-prop-coffee-table',
      'interior-prop-credenza',
      'interior-prop-armchair',
    ]);
    const deepest = Math.min(...INTERIOR_ASSETS.map((a) => a.bounds.min[1]));
    expect(deepest).toBeCloseTo(-0.0054, 4);
    // Still well inside the 80 mm the loader lifts the set by, so nothing pokes through the slab.
    expect(Math.abs(deepest)).toBeLessThan(GROUND_FLOOR_Y);
  });
});

describe('hero/prop partition', () => {
  it('sums the nine props to exactly the hero composition', () => {
    const hero = rows.get(INTERIOR_HERO_ID)!;
    const props = INTERIOR_PROP_IDS.map((id) => rows.get(id)!);
    expect(props.reduce((n, r) => n + r.metrics.objects, 0)).toBe(hero.metrics.objects);
    expect(props.reduce((n, r) => n + r.metrics.triangles, 0)).toBe(hero.metrics.triangles);
    expect(props.reduce((n, r) => n + r.metrics.vertices, 0)).toBe(hero.metrics.vertices);
    // Measured from the containers too, so this is not just the report agreeing with itself.
    const heroStats = measured.get(INTERIOR_HERO_ID)!;
    const propTriangles = INTERIOR_PROP_IDS.reduce((n, id) => n + measured.get(id)!.triangles, 0);
    const propNodes = INTERIOR_PROP_IDS.reduce((n, id) => n + measured.get(id)!.meshNodes, 0);
    expect(propTriangles).toBe(heroStats.triangles);
    expect(propNodes).toBe(heroStats.meshNodes);
    // One mesh per node in every file: no instancing, so node counts are object counts.
    for (const asset of INTERIOR_ASSETS) {
      const stats = measured.get(asset.id)!;
      expect(stats.meshNodes, `${asset.id} mesh nodes`).toBe(stats.meshes);
    }
  });

  it('unions the nine prop AABBs to the hero AABB on all six faces', () => {
    // The decisive evidence that the props are slices of the hero rather than additions to it:
    // if any prop had been re-originned, or any hero object left out, a face would not meet.
    const union = interiorSelectionBounds(INTERIOR_PROP_IDS);
    const hero = getInteriorAsset(INTERIOR_HERO_ID).bounds;
    for (let axis = 0; axis < 3; axis += 1) {
      expect(union.min[axis], `union min[${axis}]`).toBeCloseTo(hero.min[axis], 4);
      expect(union.max[axis], `union max[${axis}]`).toBeCloseTo(hero.max[axis], 4);
    }
  });

  it('refuses to load the hero together with any prop', () => {
    expect(() => selectInteriorAssets([INTERIOR_HERO_ID, 'interior-prop-sofa'])).toThrow(/would draw that furniture twice/);
    expect(() => selectInteriorAssets([INTERIOR_HERO_ID, ...INTERIOR_PROP_IDS])).toThrow();
    // Each alone is fine, and so is any subset of props.
    expect(selectInteriorAssetPaths([INTERIOR_HERO_ID])).toEqual([INTERIOR_HERO_ASSET_PATH]);
    expect(selectInteriorAssetPaths(['interior-prop-sofa', 'interior-prop-area-rug'])).toHaveLength(2);
    expect(selectInteriorAssetPaths(INTERIOR_PROP_IDS)).toHaveLength(9);
  });

  it('rejects an unknown id, a duplicate and an empty selection instead of loading nothing', () => {
    expect(() => selectInteriorAssets([])).toThrow(/empty/);
    expect(() => selectInteriorAssets(['interior-prop-hammock'])).toThrow(/Unknown interior asset/);
    expect(() => selectInteriorAssets(['interior-prop-sofa', 'interior-prop-sofa'])).toThrow(/twice/);
    expect(() => getInteriorAsset('nope')).toThrow(/Unknown interior asset/);
  });

  it('returns a selection in catalog order regardless of how it was asked for', () => {
    const shuffled = ['interior-prop-accents', 'interior-prop-sofa', 'interior-prop-coffee-table'];
    expect(selectInteriorAssets(shuffled).map((a) => a.id)).toEqual([
      'interior-prop-sofa',
      'interior-prop-coffee-table',
      'interior-prop-accents',
    ]);
  });
});

describe('anchor agreement with house.ts', () => {
  const houseSource = readFileSync(repoFile('src/world-studio/architecture/house.ts'), 'utf8');

  /**
   * Only the literal forms `house.ts` currently uses. An unrecognised form fails loudly rather
   * than being skipped: a false alarm after a harmless rewrite is the safe direction for a drift
   * guard, and eval-ing arbitrary source text is not.
   */
  const YAW_FORMS: Record<string, number> = {
    '0': 0,
    'Math.PI / 2': Math.PI / 2,
    '-Math.PI / 2': -Math.PI / 2,
    'Math.PI': Math.PI,
    '-Math.PI': -Math.PI,
  };

  it('still reads the same five ground-floor anchors out of house.ts', () => {
    for (const [id, reference] of Object.entries(INTERIOR_ANCHOR_REFERENCE)) {
      const match = new RegExp(
        `anchor\\('${id}', '[a-z0-9]+', (-?[\\d.]+), ([A-Z_]+), (-?[\\d.]+), (.+?), \\[(-?[\\d.]+), (-?[\\d.]+)\\]\\);`,
      ).exec(houseSource);
      expect(match, `house.ts no longer declares anchor('${id}', ...)`).not.toBeNull();
      const [, lx, floor, lz, yawSource, width, depth] = match!;
      expect(Number(lx), `${id} lx`).toBe(reference.lx);
      expect(Number(lz), `${id} lz`).toBe(reference.lz);
      expect([Number(width), Number(depth)], `${id} footprint`).toEqual([...reference.footprint]);
      // Every dressed anchor sits on the ground floor; an upper-floor one would not be this set's.
      expect(floor, `${id} storey`).toBe('GROUND_FLOOR_Y');
      expect(Object.keys(YAW_FORMS), `${id} yaw is written as an unrecognised expression: ${yawSource}`).toContain(
        yawSource,
      );
      expect(YAW_FORMS[yawSource], `${id} yaw`).toBeCloseTo(reference.yaw, 12);
    }
  });

  it('lifts the set by the floor height house.ts publishes', () => {
    expect(GROUND_FLOOR_Y).toBe(HOUSE_GROUND_FLOOR_Y);
  });

  it('maps five props to anchors and leaves four honestly unanchored', () => {
    const anchored = INTERIOR_ASSETS.filter((a) => a.kind === 'prop' && a.anchorId !== null);
    expect(anchored.map((a) => [a.id, a.anchorId])).toEqual([
      ['interior-prop-sofa', 'sofa'],
      ['interior-prop-coffee-table', 'coffee-table'],
      // Two ids deliberately differ from their prop name; a name-based filter would miss these.
      ['interior-prop-credenza', 'tv-unit'],
      ['interior-prop-kitchen-run', 'kitchen-run'],
      ['interior-prop-dinette', 'dining-table'],
    ]);
    expect(anchored.map((a) => a.anchorId).sort()).toEqual(Object.keys(INTERIOR_ANCHOR_REFERENCE).sort());
    expect(INTERIOR_ASSETS.filter((a) => a.kind === 'prop' && a.anchorId === null).map((a) => a.id)).toEqual([
      'interior-prop-armchair',
      'interior-prop-fridge',
      'interior-prop-area-rug',
      'interior-prop-accents',
    ]);
  });

  it('names the published anchor ids to filter, per house, not a bare suffix', () => {
    expect(publishedAnchorIdsFor(TEAL_HOUSE_ID, [INTERIOR_HERO_ID])).toEqual([
      'teal-house-sofa',
      'teal-house-coffee-table',
      'teal-house-tv-unit',
      'teal-house-kitchen-run',
      'teal-house-dining-table',
    ]);
    // A prop subset only claims its own anchors, and the unanchored props claim none.
    expect(publishedAnchorIdsFor(TEAL_HOUSE_ID, ['interior-prop-sofa', 'interior-prop-area-rug'])).toEqual([
      'teal-house-sofa',
    ]);
    expect(publishedAnchorIdsFor(TEAL_HOUSE_ID, ['interior-prop-accents'])).toEqual([]);
    // house.ts composes `${houseId}-${anchorId}`, so the yellow house is never caught by accident.
    expect(houseSource).toContain('id: `${id}-${anchorId}`');
    expect(publishedAnchorIdsFor(YELLOW_HOUSE_ID, [INTERIOR_HERO_ID])).not.toContain('teal-house-sofa');
  });

  it('produces ids the built architecture actually publishes, not a plausible-looking one', () => {
    // CORRECTION (wave 4). Every earlier example - this test, the `catalog.ts` comment, ADAPTER M4
    // and the HANDOFF wiring note - wrote the house id as `teal` and the filter target as
    // `teal-sofa`. `house.ts` never emits that id: `STUDIO_HOUSES[0].id` is `teal-house`, and the
    // anchor is published as `teal-house-sofa`. `side` is `teal`, which is what the examples were
    // reading. A filter built from the old example matches nothing, throws nothing, and leaves all
    // five procedural pieces standing inside the Blender furniture - the exact double-draw M4
    // exists to prevent. Bound to the real build here so the example cannot drift again.
    const anchors = builtArchitecture().root.userData.furnitureAnchors as { id: string }[];
    const published = new Set(anchors.map((anchor) => anchor.id));
    expect(published.has('teal-sofa'), 'the id every earlier example told root to filter').toBe(false);
    expect(published.has('teal-house-sofa'), 'the id house.ts really publishes').toBe(true);
    for (const houseId of [TEAL_HOUSE_ID, YELLOW_HOUSE_ID]) {
      for (const id of publishedAnchorIdsFor(houseId, [INTERIOR_HERO_ID])) {
        expect(published.has(id), `${id} is not published by the built architecture`).toBe(true);
      }
    }
    // And the five this set dresses are a strict subset: the upper-floor and garage anchors stay.
    expect(publishedAnchorIdsFor(TEAL_HOUSE_ID, [INTERIOR_HERO_ID])).toHaveLength(5);
    expect(anchors.filter((anchor) => anchor.id.startsWith(`${TEAL_HOUSE_ID}-`)).length).toBeGreaterThan(5);
  });

  it('places each anchored prop over the anchor footprint it dresses', () => {
    for (const asset of INTERIOR_ASSETS) {
      if (asset.kind !== 'prop' || asset.anchorId === null) continue;
      const anchor = INTERIOR_ANCHOR_REFERENCE[asset.anchorId as keyof typeof INTERIOR_ANCHOR_REFERENCE];
      const centreX = (asset.bounds.min[0] + asset.bounds.max[0]) / 2;
      const centreZ = (asset.bounds.min[2] + asset.bounds.max[2]) / 2;
      // Geometry centres are not anchor points - a sofa's back is thicker than its front - so
      // this is a containment claim, not an equality one: the anchor is under its own prop.
      expect(anchor.lx, `${asset.id} anchor X inside bounds`).toBeGreaterThanOrEqual(asset.bounds.min[0]);
      expect(anchor.lx, `${asset.id} anchor X inside bounds`).toBeLessThanOrEqual(asset.bounds.max[0]);
      expect(anchor.lz, `${asset.id} anchor Z inside bounds`).toBeGreaterThanOrEqual(asset.bounds.min[2]);
      expect(anchor.lz, `${asset.id} anchor Z inside bounds`).toBeLessThanOrEqual(asset.bounds.max[2]);
      expect(Math.abs(centreX - anchor.lx), `${asset.id} X drift from anchor`).toBeLessThan(0.6);
      expect(Math.abs(centreZ - anchor.lz), `${asset.id} Z drift from anchor`).toBeLessThan(0.6);
    }
  });

  it('orients each anchored prop the way its anchor yaw says', () => {
    // The long side of the footprint runs along Z at yaw +/-PI/2 and along X at yaw 0. If a
    // re-export dropped a yaw, the 4.4 m kitchen run would turn and cross the room.
    for (const asset of INTERIOR_ASSETS) {
      if (asset.kind !== 'prop' || asset.anchorId === null) continue;
      const anchor = INTERIOR_ANCHOR_REFERENCE[asset.anchorId as keyof typeof INTERIOR_ANCHOR_REFERENCE];
      const [long, short] = anchor.footprint;
      if (long === short) continue;
      const spanX = asset.bounds.max[0] - asset.bounds.min[0];
      const spanZ = asset.bounds.max[2] - asset.bounds.min[2];
      const turned = Math.abs(Math.abs(anchor.yaw) - Math.PI / 2) < 1e-9;
      // Stated as which measured axis is longer rather than as a match to `long`, because the
      // measured spans do not equal the declared footprint - see the overhang pin below. The
      // sofa passes by only 0.30 m instead of the 1.30 m its footprint implies, because the
      // plinth defect widens X; that margin is the defect showing through, not slack.
      if (turned) expect(spanZ, `${asset.id} long side along Z`).toBeGreaterThan(spanX);
      else expect(spanX, `${asset.id} long side along X`).toBeGreaterThan(spanZ);
      expect(Math.max(spanX, spanZ), `${asset.id} long side is the long one`).toBeGreaterThan(short);
    }
  });

  it('pins how far each anchored prop overhangs its published footprint', () => {
    // The procedural kit REFUSES to exceed an anchor footprint: `createStudioInteriors` throws
    // "Furniture exceeds anchor footprint". The Blender set is under no such constraint and four
    // of the five anchored props exceed theirs. Three are ordinary furniture reality - sofa arms,
    // dinette chairs, a worktop lip. One is a defect, pinned separately below. None of it is
    // weakened here: the measured overhang is recorded so that a change to it fails this test.
    const overhang: Record<string, readonly [number, number]> = {
      'interior-prop-sofa': [1.3, 0.31],
      'interior-prop-coffee-table': [0.14, -0.1726],
      'interior-prop-credenza': [-0.018, -0.04],
      'interior-prop-kitchen-run': [0.014, 0.04],
      'interior-prop-dinette': [0.7508, 1.1108],
    };
    for (const [id, expected] of Object.entries(overhang)) {
      const asset = getInteriorAsset(id);
      const anchor = INTERIOR_ANCHOR_REFERENCE[asset.anchorId as keyof typeof INTERIOR_ANCHOR_REFERENCE];
      const turned = Math.abs(Math.abs(anchor.yaw) - Math.PI / 2) < 1e-9;
      const [width, depth] = anchor.footprint;
      const declared = turned ? [depth, width] : [width, depth];
      expect(asset.bounds.max[0] - asset.bounds.min[0] - declared[0], `${id} X overhang`).toBeCloseTo(expected[0], 3);
      expect(asset.bounds.max[2] - asset.bounds.min[2] - declared[1], `${id} Z overhang`).toBeCloseTo(expected[1], 3);
    }
  });

  it('pins the sofa plinth double-rotation defect until a re-export fixes it', () => {
    // DEFECT, open. `build_interiors.py:417` sets `frame.rotation_euler.z = yaw` and then
    // `_rotate_group` at :478 does `+= yaw` over every part, so `sofa-frame` alone receives the
    // yaw twice: -180 deg instead of -90. Its 2.20 x 0.88 m walnut plinth therefore lies
    // crosswise under a sofa whose body runs along Z, protruding about 0.64 m past the arms at
    // each end and accounting for the whole of that 1.30 m X overhang above.
    //
    // Not fixed here: correcting the script without re-running Blender would make every pinned
    // sha256 describe geometry the script no longer produces, and this lane may not run Blender.
    // Measured from the shipped container, not from the source, so it cannot be argued away.
    const gltf = readGlbJson('public/assets/world-studio/blender/interiors/interior-prop-sofa.glb');
    const yawOf = (rotation: number[] | undefined): number => {
      const [, y, , w] = rotation ?? [0, 0, 0, 1];
      return (2 * Math.atan2(y, w) * 180) / Math.PI;
    };
    const nodes = gltf.nodes ?? [];
    const frame = nodes.find((node) => (node as { name?: string }).name === 'sofa-frame');
    expect(frame, 'sofa-frame node').toBeDefined();
    expect(Math.abs(yawOf(frame!.rotation)), 'sofa-frame yaw, degrees').toBeCloseTo(180, 2);
    // Every other part carries the single -90 the anchor asks for. The four legs sit at
    // -89.36 and -90.64: that is their authored +/-0.03 splay, not a second rotation.
    const others = nodes.filter((node) => (node as { name?: string }).name !== 'sofa-frame');
    expect(others).toHaveLength(15);
    for (const node of others) {
      const name = (node as { name?: string }).name ?? '';
      const drift = Math.abs(yawOf(node.rotation) + 90);
      expect(drift, `${name} yaw drift from -90 deg`).toBeLessThan(name.startsWith('sofa-leg') ? 0.7 : 1e-4);
    }
  });

  it('leaves the hall route clear', () => {
    // Published free route: house-local X 0..2, Z 0..8. Tested against props only - the hero is
    // the union of all nine, so its AABB necessarily spans the corridor and says nothing.
    for (const id of INTERIOR_PROP_IDS) {
      const { min, max } = getInteriorAsset(id).bounds;
      const overlapsX = max[0] > 0 && min[0] < 2;
      const overlapsZ = max[2] > 0 && min[2] < 8;
      expect(overlapsX && overlapsZ, `${id} intrudes into the hall route`).toBe(false);
    }
  });
});

describe('interior URL and house placement', () => {
  it('resolves base-aware URLs rather than assuming a host root', () => {
    expect(resolveInteriorHeroUrl('/')).toBe(`/${INTERIOR_HERO_ASSET_PATH}`);
    expect(resolveInteriorHeroUrl('/atomic-acres/')).toBe(`/atomic-acres/${INTERIOR_HERO_ASSET_PATH}`);
    // A base without a trailing slash must still produce exactly one separator.
    expect(resolveInteriorHeroUrl('/nested')).toBe(`/nested/${INTERIOR_HERO_ASSET_PATH}`);
    expect(resolveInteriorHeroUrl('/')).not.toMatch(/^https?:/);
    expect(resolveInteriorHeroUrl()).toContain(INTERIOR_HERO_ASSET_PATH);
  });

  it('resolves every catalog id to the same URL the hero helper produces', () => {
    expect(resolveInteriorAssetUrl(INTERIOR_HERO_ID, '/atomic-acres/')).toBe(
      resolveInteriorHeroUrl('/atomic-acres/'),
    );
    for (const asset of INTERIOR_ASSETS) {
      const url = resolveInteriorAssetUrl(asset.id, '/atomic-acres/');
      expect(url).toBe(`/atomic-acres/${asset.path}`);
      expect(url).not.toMatch(/\/\/assets/);
    }
    expect(() => resolveInteriorAssetUrl('interior-prop-hammock')).toThrow(/Unknown interior asset/);
  });

  it('derives the world transform from the two numbers house.ts uses', () => {
    const teal = interiorHousePlacement({ centreX: -20, frontSign: 1 });
    expect(teal.position).toEqual([-20, GROUND_FLOOR_Y, 0]);
    expect(teal.mirrored).toBe(false);
    expect(teal.headingRadians).toBe(0);

    // The mirrored house is a reflection across X, not a half turn: Z must be unchanged. A yaw of
    // PI would map house-local (x, z) to (-x, -z) and put the kitchen run at the wrong end.
    const yellow = interiorHousePlacement({ centreX: 20, frontSign: -1 });
    expect(yellow.mirrored).toBe(true);
    expect(yellow.headingRadians).toBe(0);
    expect(yellow.position).toEqual([20, GROUND_FLOOR_Y, 0]);

    // Agreement with house.ts's own wx(): centreX + frontSign * lx, z unchanged.
    const anchorLx = INTERIOR_ANCHOR_REFERENCE['kitchen-run'].lx;
    const mirroredPoint = new THREE.Vector3(anchorLx, 0, INTERIOR_ANCHOR_REFERENCE['kitchen-run'].lz);
    mirroredPoint.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...yellow.position),
        new THREE.Quaternion(),
        new THREE.Vector3(yellow.mirrored ? -1 : 1, 1, 1),
      ),
    );
    expect(mirroredPoint.x).toBeCloseTo(20 + -1 * anchorLx, 6);
    expect(mirroredPoint.z).toBeCloseTo(INTERIOR_ANCHOR_REFERENCE['kitchen-run'].lz, 6);
  });
});

/**
 * Cost of a selection, measured from the embedded image payloads.
 *
 * The hero and the props draw the same 182 objects, so the choice between them looks free. It is
 * not: every GLB embeds its own copy of every map its materials use, and nothing is shared across
 * files at runtime. These tests measure that, because an integrator picking "just the props I want"
 * over the hero is silently choosing the more expensive route in both transfer and VRAM.
 */
describe('transfer and texture cost of a selection', () => {
  const imagesById = new Map(
    INTERIOR_ASSETS.map((asset) => [asset.id, readEmbeddedImages(`public/${asset.path}`)] as const),
  );
  /** Content hash -> the ids of every file embedding that exact image. */
  const filesPerImage = new Map<string, string[]>();
  for (const [id, images] of imagesById) {
    for (const image of images) {
      filesPerImage.set(image.sha256, [...(filesPerImage.get(image.sha256) ?? []), id]);
    }
  }
  const fileBytes = (id: string): number => rows.get(id)!.metrics.bytes;
  const imageBytes = (id: string): number => imagesById.get(id)!.reduce((n, i) => n + i.bytes, 0);
  const sum = (ids: readonly string[], of: (id: string) => number): number =>
    ids.reduce((n, id) => n + of(id), 0);

  it('embeds every texture, so a file carries its own maps and references nothing external', () => {
    // A URI-referenced image would make these numbers meaningless and would also need a second
    // request the loader contract says nothing about.
    for (const asset of INTERIOR_ASSETS) {
      const json = readGlbJson(`public/${asset.path}`);
      for (const image of json.images ?? []) {
        expect(image.bufferView, `${asset.id} image ${image.name} is not embedded`).toBeTypeOf('number');
        expect(image.mimeType, `${asset.id} image ${image.name} mime`).toBe('image/png');
      }
      expect(imagesById.get(asset.id)!).toHaveLength((json.images ?? []).length);
    }
  });

  it('holds 12 distinct images as 34 copies across the ten files', () => {
    expect(filesPerImage.size, 'distinct images by content').toBe(12);
    expect(sum([...imagesById.keys()], (id) => imagesById.get(id)!.length), 'embedded copies').toBe(34);
    // The hero is the only file that carries the whole set, exactly once each.
    expect(imagesById.get(INTERIOR_HERO_ID)!).toHaveLength(12);
    expect(new Set(imagesById.get(INTERIOR_HERO_ID)!.map((i) => i.sha256)).size).toBe(12);
    // Every image a prop carries is one of the hero's: the props add no map of their own.
    const heroImages = new Set(imagesById.get(INTERIOR_HERO_ID)!.map((i) => i.sha256));
    for (const id of INTERIOR_PROP_IDS) {
      for (const image of imagesById.get(id)!) {
        expect(heroImages.has(image.sha256), `${id} carries ${image.name}, which the hero lacks`).toBe(true);
      }
    }
    // The fridge is the one prop with no texture at all; its enamel is a factor-only material.
    expect(imagesById.get('interior-prop-fridge')!).toHaveLength(0);
  });

  it('costs 51% more to load the nine props than the hero they exactly partition', () => {
    const hero = fileBytes(INTERIOR_HERO_ID);
    const props = sum(INTERIOR_PROP_IDS, fileBytes);
    expect(hero, 'hero transfer bytes').toBe(4_603_156);
    expect(props, 'nine-prop transfer bytes').toBe(6_968_664);
    expect(props / hero, 'props cost relative to hero').toBeCloseTo(1.514, 3);

    // And the whole of that difference is duplicated texture, not extra geometry: the props draw
    // the identical 33184 triangles. 30917 bytes of the gap is per-file container and JSON
    // overhead for eight additional files.
    const imageGap = sum(INTERIOR_PROP_IDS, imageBytes) - imageBytes(INTERIOR_HERO_ID);
    expect(props - hero, 'transfer penalty').toBe(2_365_508);
    expect(imageGap, 'duplicated image payload').toBe(2_334_591);
    expect(imageGap / (props - hero), 'share of the penalty that is duplicated texture').toBeGreaterThan(0.98);
  });

  it('uploads the same pixels once per file, because nothing is shared between GLBs', () => {
    // Each file is a separate GLTFLoader parse, so an image embedded in six files becomes six
    // THREE.Texture objects and six GPU uploads. This is also *why* per-file disposal is safe:
    // `disposeSubtree` can free a prop's textures without touching another prop's.
    const walnut = [...filesPerImage.entries()].find(
      ([sha]) => imagesById.get(INTERIOR_HERO_ID)!.find((i) => i.sha256 === sha)?.name === 'interior-walnut-albedo',
    );
    expect(walnut, 'interior-walnut-albedo').toBeDefined();
    expect(walnut![1], 'files embedding the walnut albedo').toEqual([
      INTERIOR_HERO_ID,
      'interior-prop-sofa',
      'interior-prop-coffee-table',
      'interior-prop-credenza',
      'interior-prop-armchair',
      'interior-prop-accents',
    ]);
    // Selecting the whole prop set uploads 22 textures for 12 distinct images; the hero uploads 12.
    const propCopies = sum(INTERIOR_PROP_IDS, (id) => imagesById.get(id)!.length);
    const propDistinct = new Set(INTERIOR_PROP_IDS.flatMap((id) => imagesById.get(id)!.map((i) => i.sha256)));
    expect(propCopies, 'textures created by loading all nine props').toBe(22);
    expect(propDistinct.size, 'distinct images among them').toBe(12);
    expect(imagesById.get(INTERIOR_HERO_ID)!).toHaveLength(12);
  });
});

/**
 * Why the collision loss in ADAPTER M3 is forced rather than merely likely.
 *
 * Wave 3 wrote "decide the collision question before filtering anything", which reads as though an
 * alternative to filtering exists — hide the procedural meshes, keep their solids. It does not.
 * This measures the procedural kit's actual shape so the handoff cannot recommend an impossible
 * integration. Nothing here modifies the procedural kit; it is read and asserted against.
 */
describe('the procedural kit offers no way to keep collision without geometry', () => {
  it('merges furniture per role across both houses, so no anchor has a mesh of its own', () => {
    const anchors = builtArchitecture().root.userData.furnitureAnchors as StudioInteriorAnchor[];
    const interiors = createStudioInteriors(anchors);

    // `solid.mesh` is a merged *per-role* mesh (`index.ts:157`), never a per-anchor one: geometry
    // for every anchor of both houses sharing a role is merged into a single Mesh at `:147`.
    const meshes = new Set(interiors.solids.map((solid) => solid.mesh));
    expect(meshes.size, 'distinct meshes across all solids').toBeLessThan(anchors.length);
    for (const mesh of meshes) expect(interiors.root.children, 'a merged role mesh').toContain(mesh);
    expect(interiors.solids.length, 'solids').toBeGreaterThan(meshes.size);

    // The decisive point: the mesh carrying the teal sofa also carries other anchors' furniture,
    // including the *yellow* house's. `solid.mesh.visible = false` is therefore not a way to hide
    // one anchor - it would blank furniture this set does not dress, in a house it never touches.
    const anchorIds = anchors.map((anchor) => anchor.id);
    const anchorOf = (solidId: string): string | undefined =>
      anchorIds.find((anchorId) => solidId.startsWith(`${anchorId}-`));
    const sofaSolid = interiors.solids.find((solid) => anchorOf(solid.id) === `${TEAL_HOUSE_ID}-sofa`);
    expect(sofaSolid, 'a solid belonging to the teal sofa').toBeDefined();
    const sharing = new Set(
      interiors.solids.filter((solid) => solid.mesh === sofaSolid!.mesh).map((solid) => anchorOf(solid.id)),
    );
    expect(sharing.size, 'anchors sharing the teal sofa mesh').toBeGreaterThan(1);
    expect(
      [...sharing].some((id) => id?.startsWith(`${YELLOW_HOUSE_ID}-`)),
      'the teal sofa shares its mesh with the yellow house',
    ).toBe(true);

    // Therefore removing the five dressed anchors' geometry means removing them from the input
    // array, which removes their solids with it. That is M3, and it is unavoidable without
    // changing the procedural kit - which is not this lane's to change.
    const dressed = new Set(publishedAnchorIdsFor(TEAL_HOUSE_ID, [INTERIOR_HERO_ID]));
    const lost = interiors.solids.filter((solid) =>
      [...dressed].some((anchorId) => solid.id.startsWith(`${anchorId}-`)),
    );
    expect(lost.length, 'ballistic solids lost by filtering the five dressed anchors').toBeGreaterThan(0);

    // Solid ids are `${anchorId}-${part}`, hyphen-joined. The footprint *error message* uses a
    // slash (`${a.id}/${name}`), so a filter written from that message splitting on '/' recovers
    // the whole id and matches nothing.
    expect(lost.every((solid) => !solid.id.includes('/')), 'solid ids contain no slash').toBe(true);
  });
});

describe('what this catalog does not claim', () => {
  it('exposes no collider, spawn or navigation authority', () => {
    for (const key of Object.keys(getInteriorAsset(INTERIOR_HERO_ID))) {
      expect(key).not.toMatch(/collider|collision|spawn|navigation|solid|patrol/i);
    }
    expect(Object.keys(getInteriorAsset(INTERIOR_HERO_ID)).sort()).toEqual(['anchorId', 'bounds', 'id', 'kind', 'path']);
  });

  it('keeps the shipped catalog honest about what has never run', () => {
    // These limitations are load-bearing: they are the reason a thumbnail here is not acceptance.
    // If a later build drops them, that is a claim being quietly upgraded and should fail here.
    expect(shippedCatalog.limitations.join(' ')).toMatch(/Presentation only/);
    expect(shippedCatalog.limitations.join(' ')).toMatch(/not a runtime capture/);
    expect(shippedCatalog.limitations.join(' ')).toMatch(/Not yet loaded by the runtime/);
  });
});
