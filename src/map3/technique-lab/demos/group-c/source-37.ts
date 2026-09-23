/**
 * Source 37 — fable-test: coordinate-convention conversion and visible
 * cache-build progress before playtest.
 *
 * Licence: MIT, read as a file at the pin (SamG-Coder/fable-test @
 * bfa60fb9e0fae613585344b4e5f8b034d2dcd481, LICENSE, 1,061 B, "Copyright (c)
 * 2026 SamG"). The register's decision for this row is archive-reference only,
 * and this lane keeps to that: no integration, no code taken, and — critically
 * — none of the source project's subject matter, which is parsed from a user's
 * own installed commercial game. The scene below is built from synthetic data
 * this file generates.
 *
 * The two transferable atoms, both demonstrated:
 *   1. CONVENTION CONVERSION AT THE BOUNDARY. The upstream data is Z-up and in
 *      centimetres; the renderer is Y-up and in metres. The conversion belongs
 *      in one function at the ingest boundary, not sprinkled through the scene
 *      graph. BEFORE shows the failure this prevents — the same records fed
 *      straight in, so the level lies on its side at a hundred times scale.
 *      AFTER shows them through the converter.
 *   2. CACHE-BUILD PROGRESS BEFORE PLAYTEST. A long prepare step that shows no
 *      progress is indistinguishable from a hang. `update` drives a progress
 *      bar over a simulated cache build and the after-panel's records only
 *      appear as their cache entries complete.
 */

import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  range,
  type Demo,
  type DemoContext,
} from './shared';

/** A record in the upstream convention: Z-up, centimetres. Synthetic. */
export type SourceRecord = {
  name: string;
  /** Centre in source space: x, y (horizontal), z (UP), all centimetres. */
  position: [number, number, number];
  /** Extent in source space, centimetres. */
  size: [number, number, number];
};

export type ConvertedRecord = {
  name: string;
  /** Y-up metres. */
  position: [number, number, number];
  size: [number, number, number];
};

/**
 * The whole convention conversion, in one place. Z-up centimetres to Y-up
 * metres is a swap of the last two axes with a handedness-preserving negation,
 * plus a scale of 1/100. Exported so a CPU check can assert it directly.
 */
export function convertZupCentimetres(record: SourceRecord): ConvertedRecord {
  const [x, y, z] = record.position;
  const [sx, sy, sz] = record.size;
  const CENTIMETRES_PER_METRE = 100;
  return {
    name: record.name,
    position: [x / CENTIMETRES_PER_METRE, z / CENTIMETRES_PER_METRE, -y / CENTIMETRES_PER_METRE],
    size: [sx / CENTIMETRES_PER_METRE, sz / CENTIMETRES_PER_METRE, sy / CENTIMETRES_PER_METRE],
  };
}

function buildRecords(seed: number): SourceRecord[] {
  const rng = createRng(seed);
  const records: SourceRecord[] = [];
  for (let i = 0; i < 9; i += 1) {
    const width = range(rng, 60, 150);
    const depth = range(rng, 60, 150);
    const height = range(rng, 80, 260);
    records.push({
      name: `block-${i}`,
      position: [range(rng, -110, 110), range(rng, -110, 110), height / 2],
      size: [width, depth, height],
    });
  }
  return records;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-37-convention-conversion';
  const { before, after } = beforeAfterPanels(THREE, 3.4);

  const records = buildRecords(seed);
  const converted = records.map(convertZupCentimetres);

  // BEFORE — source records used as if they were already Y-up metres. This is
  // the specific bug the boundary converter exists to make impossible; it is
  // scaled down here only so the failure stays inside the exhibit.
  const wrongMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c5a5a,
    roughness: 0.85,
    metalness: 0,
  });
  const wrongScale = 0.01;
  for (const record of records) {
    const geometry = new THREE.BoxGeometry(
      record.size[0] * wrongScale,
      record.size[1] * wrongScale,
      record.size[2] * wrongScale,
    );
    const mesh = new THREE.Mesh(geometry, wrongMaterial);
    mesh.name = `unconverted-${record.name}`;
    mesh.position.set(
      record.position[0] * wrongScale,
      record.position[1] * wrongScale,
      record.position[2] * wrongScale,
    );
    before.add(mesh);
  }

  // AFTER — the same records through the boundary converter, revealed in cache
  // order as the simulated cache build completes.
  const rightMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f8ea0,
    roughness: 0.78,
    metalness: 0.04,
  });
  const cachedMeshes: import('three').Mesh[] = [];
  for (const record of converted) {
    const geometry = new THREE.BoxGeometry(record.size[0], record.size[1], record.size[2]);
    const mesh = new THREE.Mesh(geometry, rightMaterial);
    mesh.name = `converted-${record.name}`;
    mesh.position.set(record.position[0], record.position[1], record.position[2]);
    mesh.visible = false;
    after.add(mesh);
    cachedMeshes.push(mesh);
  }

  // The progress bar: a fill that grows across a track. It is geometry, not a
  // DOM overlay, because this exhibit owns no page chrome.
  const trackGeometry = new THREE.BoxGeometry(2.4, 0.06, 0.06);
  const track = new THREE.Mesh(
    trackGeometry,
    new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 1 }),
  );
  track.position.set(0, -0.35, 1.5);
  after.add(track);

  const fillGeometry = new THREE.BoxGeometry(1, 0.08, 0.08);
  const fill = new THREE.Mesh(
    fillGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x74c69d,
      emissive: 0x1d3a2c,
      roughness: 0.5,
    }),
  );
  fill.position.set(0, -0.35, 1.5);
  after.add(fill);

  root.add(before, after);
  const draws = countDraws(root);

  const CACHE_BUILD_SECONDS = 4;
  let elapsed = 0;
  let completed = 0;

  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed = (elapsed + dt) % (CACHE_BUILD_SECONDS + 1.5);
      const progress = Math.min(1, elapsed / CACHE_BUILD_SECONDS);
      fill.scale.x = Math.max(0.0001, progress * 2.4);
      fill.position.x = -1.2 + (progress * 2.4) / 2;
      completed = Math.floor(progress * cachedMeshes.length);
      for (let i = 0; i < cachedMeshes.length; i += 1) {
        cachedMeshes[i].visible = i < completed;
      }
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 37,
      title: 'Z-up centimetres to Y-up metres at the ingest boundary, with cache-build progress',
      method:
        'One boundary function converts upstream Z-up centimetre records into Y-up metre scene '
        + 'records (axis swap with a handedness-preserving negation, divide by 100); the scene '
        + 'graph never sees source units. A simulated cache build reveals each converted record '
        + 'only as its entry completes, behind a visible progress fill, so a long prepare step is '
        + 'never mistaken for a hang.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/samgcoder/status/2093773310203191312',
        'https://github.com/SamG-Coder/fable-test',
        'https://raw.githubusercontent.com/SamG-Coder/fable-test/bfa60fb9e0fae613585344b4e5f8b034d2dcd481/LICENSE',
      ],
      limitation:
        'The source project\'s subject is a user\'s own installed commercial game; no BIG/LEV/TNG '
        + 'asset, format parser or byte of that data is present or reproduced here — the records '
        + 'are generated by this file from the seed. No ASP.NET server, no streaming, no real '
        + 'cache: the progress pass is simulated on a timer, so this demonstrates the UX contract '
        + 'and the conversion, not at-scale WebGPU scene streaming.',
      localLights: [],
      counters: {
        records: records.length,
        cacheBuildSeconds: CACHE_BUILD_SECONDS,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
