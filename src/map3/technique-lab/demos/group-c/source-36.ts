/**
 * Source 36 — Needle Mesh Baker: highpoly -> lowpoly remesh with an attribute
 * bake from the highpoly, demonstrated on the register's own free lane.
 *
 * WHAT THE SOURCE IS. A proprietary hosted browser (WebGPU) webapp with no
 * public source repository, a non-commercial free tier, and a separately-sold
 * licence for exactly the browser-automation path an agent lane would use.
 * Nothing of it is used, run or purchased here, and nothing here is its
 * implementation. What is public is the method it advertises and that the
 * register records: reduce a highpoly by VOXEL REMESHING, expose the voxel
 * size as the SILHOUETTE CONTROL, then BAKE a highpoly attribute onto the
 * lowpoly so the reduced mesh keeps detail it no longer has geometry for.
 *
 * WHAT THIS EXHIBIT ADDS, AND THE CLAIM IT DOES NOT MAKE. The register's own
 * decision line on this row is "local Blender remesh+bake remains the free
 * lane", and that free lane had never actually been executed by this lane. It
 * has now: `scripts/technique-lab/group-c/blender/remesh_bake.py` authors a
 * sculpt-dense highpoly in headless Blender 5.1.2, reduces it with Blender's
 * own OpenVDB voxel remesher at a 0.22 m voxel, and transfers the highpoly's
 * smooth normals onto the result by nearest-surface BVH lookup with
 * barycentric interpolation. The geometry below IS that run's output, carried
 * as quantised typed data so the factory needs no loader, no fetch and no
 * external asset. This is OUR adaptation of the free lane. The upstream product
 * demonstrably does NOT use Blender — it is a client-side web app — and no
 * such claim is made or implied anywhere in this file.
 *
 * THE THREE PANELS, and why there are three rather than two. A highpoly beside
 * a baked lowpoly cannot show what the bake bought, because the un-baked
 * lowpoly is never on screen. So:
 *
 *   LEFT   highpoly, 5,120 triangles — what Blender authored.
 *   MIDDLE the remeshed lowpoly, 924 triangles, shaded by its OWN geometric
 *          normals: what the reduction alone leaves you with.
 *   RIGHT  the same 924 triangles, shaded by the normals baked off the
 *          highpoly: the same silhouette, the highpoly's surface direction.
 *
 * Middle and right are the identical geometry and the identical material. The
 * only difference between them is the normal attribute, which is the whole
 * claim of an attribute bake, isolated.
 */

import { SOURCE_36_BLENDER_REMESH } from './assets/source-36-blender-remesh';
import {
  countDraws,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

type RemeshResult = {
  positions: Float32Array;
  bakedNormals: Float32Array;
  indices: number[];
  sourceTriangles: number;
  outputTriangles: number;
  occupiedCells: number;
};

/**
 * Vertex-clustering voxel remesh, the browser-side equivalent of the offline
 * step above: `cellSize` is the silhouette control, a vertex is replaced by
 * the centroid of everything sharing its cell, and the highpoly normals are
 * averaged into the replacing cell. Kept and exercised by the CPU check
 * because it is the form this technique takes when it has to run at runtime;
 * the exhibit itself shows the Blender output, which is the register's
 * recommended lane and a genuinely better remesher.
 *
 * Exported so a CPU check can run it without constructing a scene.
 */
export function voxelRemesh(
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
  triangles: ArrayLike<number>,
  cellSize: number,
): RemeshResult {
  const cellOf = (index: number): string => {
    const x = Math.floor(positions[index * 3] / cellSize);
    const y = Math.floor(positions[index * 3 + 1] / cellSize);
    const z = Math.floor(positions[index * 3 + 2] / cellSize);
    return `${x}|${y}|${z}`;
  };

  const cellIndexByKey = new Map<string, number>();
  const accumulated: Array<{
    px: number; py: number; pz: number;
    nx: number; ny: number; nz: number;
    count: number;
  }> = [];
  const vertexToCell = new Int32Array(positions.length / 3);

  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const key = cellOf(vertex);
    let cell = cellIndexByKey.get(key);
    if (cell === undefined) {
      cell = accumulated.length;
      cellIndexByKey.set(key, cell);
      accumulated.push({ px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, count: 0 });
    }
    const bucket = accumulated[cell];
    bucket.px += positions[vertex * 3];
    bucket.py += positions[vertex * 3 + 1];
    bucket.pz += positions[vertex * 3 + 2];
    bucket.nx += normals[vertex * 3];
    bucket.ny += normals[vertex * 3 + 1];
    bucket.nz += normals[vertex * 3 + 2];
    bucket.count += 1;
    vertexToCell[vertex] = cell;
  }

  const outPositions = new Float32Array(accumulated.length * 3);
  const outNormals = new Float32Array(accumulated.length * 3);
  for (let cell = 0; cell < accumulated.length; cell += 1) {
    const bucket = accumulated[cell];
    outPositions[cell * 3] = bucket.px / bucket.count;
    outPositions[cell * 3 + 1] = bucket.py / bucket.count;
    outPositions[cell * 3 + 2] = bucket.pz / bucket.count;
    const length = Math.hypot(bucket.nx, bucket.ny, bucket.nz) || 1;
    outNormals[cell * 3] = bucket.nx / length;
    outNormals[cell * 3 + 1] = bucket.ny / length;
    outNormals[cell * 3 + 2] = bucket.nz / length;
  }

  const indices: number[] = [];
  for (let triangle = 0; triangle < triangles.length; triangle += 3) {
    const a = vertexToCell[triangles[triangle]];
    const b = vertexToCell[triangles[triangle + 1]];
    const c = vertexToCell[triangles[triangle + 2]];
    // A triangle whose corners landed in one or two cells has no area left.
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }

  return {
    positions: outPositions,
    bakedNormals: outNormals,
    indices,
    sourceTriangles: triangles.length / 3,
    outputTriangles: indices.length / 3,
    occupiedCells: accumulated.length,
  };
}

// --- The offline artefact ---------------------------------------------------

function decodeBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Int16 positions about a centre/extent, back to metres. */
export function decodePositions(
  text: string,
  centre: readonly [number, number, number],
  extent: number,
): Float32Array {
  const bytes = decodeBytes(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (view.getInt16(i * 2, true) / 32767) * extent + centre[i % 3];
  }
  return out;
}

/** Int8 unit normals, renormalised after quantisation. */
export function decodeNormals(text: string): Float32Array {
  const bytes = decodeBytes(text);
  const out = new Float32Array(bytes.byteLength);
  for (let i = 0; i < out.length; i += 3) {
    const x = (bytes[i] << 24 >> 24) / 127;
    const y = (bytes[i + 1] << 24 >> 24) / 127;
    const z = (bytes[i + 2] << 24 >> 24) / 127;
    const length = Math.hypot(x, y, z) || 1;
    out[i] = x / length;
    out[i + 1] = y / length;
    out[i + 2] = z / length;
  }
  return out;
}

export function decodeIndices(text: string): Uint16Array {
  const bytes = decodeBytes(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint16Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getUint16(i * 2, true);
  return out;
}

/**
 * How far the baked normal departs from the lowpoly's own geometric normal,
 * per vertex, in degrees. This IS the bake's contribution: a bake whose output
 * matched the reduced geometry everywhere would be doing nothing at all.
 *
 * `flipped` counts vertices where the two point into opposite hemispheres —
 * the known failure mode of a nearest-surface transfer with no cage and no ray
 * cast, where at a thin feature the closest point lies on the far wall. It is
 * reported rather than clamped away, and it is currently zero.
 */
export function compareNormals(
  baked: ArrayLike<number>,
  geometric: ArrayLike<number>,
): { maxDegrees: number; meanDegrees: number; flipped: number } {
  let maxDegrees = 0;
  let total = 0;
  let flipped = 0;
  const count = baked.length / 3;
  for (let i = 0; i < count; i += 1) {
    const dot = Math.max(-1, Math.min(1,
      baked[i * 3] * geometric[i * 3]
      + baked[i * 3 + 1] * geometric[i * 3 + 1]
      + baked[i * 3 + 2] * geometric[i * 3 + 2]));
    const degrees = (Math.acos(dot) * 180) / Math.PI;
    if (degrees > maxDegrees) maxDegrees = degrees;
    if (dot < 0) flipped += 1;
    total += degrees;
  }
  return { maxDegrees, meanDegrees: total / count, flipped };
}

const PANEL_SEPARATION = 2.75;

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const asset = SOURCE_36_BLENDER_REMESH;
  const root = new THREE.Group();
  root.name = 'source-36-blender-voxel-remesh-bake';

  const highPositions = decodePositions(
    asset.highpoly.positions,
    asset.highpoly.positionCentre,
    asset.highpoly.positionExtent,
  );
  const highNormals = decodeNormals(asset.highpoly.normals);
  const highIndices = decodeIndices(asset.highpoly.indices);
  const lowPositions = decodePositions(
    asset.lowpoly.positions,
    asset.lowpoly.positionCentre,
    asset.lowpoly.positionExtent,
  );
  const bakedNormals = decodeNormals(asset.lowpoly.bakedNormals);
  const lowIndices = decodeIndices(asset.lowpoly.indices);

  const highGeometry = new THREE.BufferGeometry();
  highGeometry.setAttribute('position', new THREE.BufferAttribute(highPositions, 3));
  highGeometry.setAttribute('normal', new THREE.BufferAttribute(highNormals, 3));
  highGeometry.setIndex(new THREE.BufferAttribute(highIndices, 1));

  // The reduction alone: same positions and triangles, normals recomputed from
  // the reduced surface itself.
  const rawGeometry = new THREE.BufferGeometry();
  rawGeometry.setAttribute('position', new THREE.BufferAttribute(lowPositions, 3));
  rawGeometry.setIndex(new THREE.BufferAttribute(lowIndices, 1));
  rawGeometry.computeVertexNormals();
  const geometricNormals = rawGeometry.getAttribute('normal').array as Float32Array;

  // The reduction plus the bake. Positions and indices are shared with the
  // panel to its left on purpose; only the normal attribute differs.
  const bakedGeometry = new THREE.BufferGeometry();
  bakedGeometry.setAttribute('position', new THREE.BufferAttribute(lowPositions.slice(), 3));
  bakedGeometry.setAttribute('normal', new THREE.BufferAttribute(bakedNormals, 3));
  bakedGeometry.setIndex(new THREE.BufferAttribute(lowIndices.slice(), 1));

  const comparison = compareNormals(bakedNormals, geometricNormals);

  const surface = () => new THREE.MeshStandardMaterial({
    color: 0x9aa4b0,
    roughness: 0.62,
    metalness: 0.05,
  });

  const stations: Array<[string, import('three').BufferGeometry, number]> = [
    ['highpoly-blender-authored', highGeometry, -PANEL_SEPARATION],
    ['lowpoly-own-normals', rawGeometry, 0],
    ['lowpoly-baked-normals', bakedGeometry, PANEL_SEPARATION],
  ];
  const pivots: Array<import('three').Group> = [];
  for (const [name, geometry, x] of stations) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.x = x;
    const mesh = new THREE.Mesh(geometry, surface());
    mesh.name = `${name}-mesh`;
    pivot.add(mesh);
    root.add(pivot);
    pivots.push(pivot);
  }

  const draws = countDraws(root);
  const reduction = 1 - asset.counts.lowpolyTriangles / asset.counts.highpolyTriangles;

  let elapsed = 0;
  return {
    root,
    update: (_time: number, dt: number) => {
      // All three turn together, so the silhouette difference on the left and
      // the shading difference on the right are the only work for the eye.
      elapsed += dt;
      for (const pivot of pivots) pivot.rotation.y = elapsed * 0.35;
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 36,
      title: 'Voxel remesh with a highpoly attribute bake',
      method:
        'A sculpt-dense highpoly authored in headless Blender is reduced by Blender\'s OpenVDB '
        + 'voxel remesher at a 0.22 m voxel — the voxel size IS the silhouette control — and the '
        + 'highpoly\'s smooth normals are transferred onto the result by nearest-surface BVH '
        + 'lookup with barycentric interpolation. Three panels: the highpoly, the reduced mesh '
        + 'shaded by its own normals, and the same reduced mesh shaded by the baked ones, so the '
        + 'bake\'s contribution is isolated as the only difference between the last two.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/hybridherbst/status/2093299068441092380',
        'https://mesh-baker.needle.tools/',
        'https://engine.needle.tools/docs/products/needle-mesh-baker',
      ],
      limitation:
        'The product was not used, run or purchased and has no public source, so nothing here is '
        + 'its implementation, and the Blender lane demonstrated here is the REGISTER\'s '
        + 'recommended free alternative — upstream is a browser WebGPU app and does not use '
        + 'Blender. The bake is a normal transfer only: no UV atlas, no normal/ORM TEXTURE set, '
        + 'no tangents, so the product\'s "correct tangents" claim is neither reproduced nor '
        + 'tested. Nearest-surface transfer has no cage and casts no rays, so at a thin feature '
        + 'the closest point can lie on the far wall; measured against the normals this scene '
        + 'actually replaces, no vertex flipped (bakeFlippedVertices 0, max 11.0 degrees). '
        + 'Blender\'s own bake-time record carries a single 97.7 degree outlier measured against '
        + 'ITS vertex normals, which does not reproduce here — cause unresolved, retained in the '
        + 'provenance record and NOT claimed as a transfer flip. Reduction here is '
        + '82 percent, not the product\'s advertised 99 percent, and its client-side TRELLIS '
        + 'GENERATION stage is absent entirely. Geometry is quantised to Int16 positions and Int8 '
        + 'normals for portability, which is itself a small loss.',
      localLights: [],
      counters: {
        highpolyTriangles: asset.counts.highpolyTriangles,
        lowpolyTriangles: asset.counts.lowpolyTriangles,
        reductionPercent: Math.round(reduction * 1000) / 10,
        voxelSize: asset.voxelSize,
        bakeMaxDeviationDegrees: Math.round(comparison.maxDegrees * 100) / 100,
        bakeMeanDeviationDegrees: Math.round(comparison.meanDegrees * 100) / 100,
        bakeFlippedVertices: comparison.flipped,
        meshes: draws.meshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
