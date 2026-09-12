/**
 * Source 36 — Needle Mesh Baker: browser highpoly -> lowpoly remesh with an
 * attribute bake from the highpoly.
 *
 * The product itself is a proprietary hosted webapp with no public source
 * repository, a non-commercial free tier and a separately-sold licence for the
 * browser-automation path an agent lane would use. Nothing of it is used, run
 * or purchased here. What is public — and what this scene demonstrates — is the
 * method it advertises and that the register records: reduce a highpoly mesh by
 * VOXEL REMESHING (cluster vertices into grid cells, one output vertex per
 * occupied cell, drop triangles that collapse), expose the grid spacing as the
 * SILHOUETTE CONTROL, and then BAKE a highpoly attribute onto the lowpoly so
 * the reduced mesh keeps detail it no longer has geometry for.
 *
 * BEFORE is the highpoly. AFTER is the remeshed lowpoly carrying the highpoly's
 * averaged normal direction baked into a vertex-colour attribute — the cheap,
 * inspectable stand-in for the product's normal/ORM map bake. Both counts are
 * in `metadata.counters`, so the reduction claim is a number a CPU check reads
 * rather than an impression.
 */

import {
  beforeAfterPanels,
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
 * Voxel remesh by vertex clustering. `cellSize` is the silhouette control: a
 * larger cell merges more distant features and rounds the silhouette off, a
 * smaller one preserves it and costs triangles. The error the decimation is
 * driven by is positional — a vertex is replaced by the centroid of everything
 * sharing its cell — which is the cheapest honest form of the idea.
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
    // The bake: the highpoly's own normals are averaged into the cell that
    // will replace them, so the lowpoly vertex carries the direction the
    // highpoly surface faced there even though that surface is gone.
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

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-36-voxel-remesh-bake';
  const { before, after } = beforeAfterPanels(THREE, 2.6);

  // A deterministic highpoly: a subdivided icosahedron pushed around so the
  // remesh has real surface detail to lose and to bake.
  const highGeometry = new THREE.IcosahedronGeometry(1, 5);
  const highPositions = highGeometry.getAttribute('position');
  for (let i = 0; i < highPositions.count; i += 1) {
    const x = highPositions.getX(i);
    const y = highPositions.getY(i);
    const z = highPositions.getZ(i);
    const wobble =
      1
      + 0.11 * Math.sin(x * 6.1 + seed * 0.7)
      * Math.sin(y * 5.3 - seed * 0.3)
      * Math.sin(z * 4.8 + 1.7);
    highPositions.setXYZ(i, x * wobble, y * wobble, z * wobble);
  }
  highGeometry.computeVertexNormals();

  const highMesh = new THREE.Mesh(
    highGeometry,
    new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.6, metalness: 0.05 }),
  );
  highMesh.name = 'highpoly';
  before.add(highMesh);

  const positionArray = highPositions.array as Float32Array;
  const normalArray = highGeometry.getAttribute('normal').array as Float32Array;
  const indexAttribute = highGeometry.getIndex();
  const triangleArray = indexAttribute
    ? (indexAttribute.array as ArrayLike<number>)
    : Array.from({ length: highPositions.count }, (_value, index) => index);

  const remesh = voxelRemesh(positionArray, normalArray, triangleArray, 0.2);

  const lowGeometry = new THREE.BufferGeometry();
  lowGeometry.setAttribute('position', new THREE.BufferAttribute(remesh.positions, 3));
  lowGeometry.setIndex(remesh.indices);
  // The baked highpoly normal, encoded into the colour channel. This is the
  // demonstrable form of "detail survives the reduction": the lowpoly's own
  // geometric normals are blockier than what it displays.
  const baked = new Float32Array(remesh.bakedNormals.length);
  for (let i = 0; i < baked.length; i += 1) baked[i] = remesh.bakedNormals[i] * 0.5 + 0.5;
  lowGeometry.setAttribute('color', new THREE.BufferAttribute(baked, 3));
  lowGeometry.computeVertexNormals();

  const lowMesh = new THREE.Mesh(
    lowGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 }),
  );
  lowMesh.name = 'lowpoly-remeshed';
  after.add(lowMesh);

  root.add(before, after);
  const draws = countDraws(root);
  const reduction = 1 - remesh.outputTriangles / remesh.sourceTriangles;

  let elapsed = 0;
  return {
    root,
    update: (_time: number, dt: number) => {
      // Both halves turn together so the silhouette difference is the only
      // difference the eye has to do work on.
      elapsed += dt;
      before.rotation.y = elapsed * 0.35;
      after.rotation.y = elapsed * 0.35;
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 36,
      title: 'Voxel remesh with a highpoly attribute bake',
      method:
        'Vertex-clustering voxel remesh at a settable grid spacing (the silhouette control): one '
        + 'output vertex per occupied cell at the cell centroid, triangles that collapse into a '
        + 'cell are dropped, and the highpoly normals are averaged into the cell that replaces '
        + 'them so the reduced mesh still displays detail its geometry no longer carries.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/hybridherbst/status/2093299068441092380',
        'https://mesh-baker.needle.tools/',
        'https://engine.needle.tools/docs/products/needle-mesh-baker',
      ],
      limitation:
        'The product was not used, run or purchased and has no public source, so nothing here is '
        + 'its implementation. Clustering is a positional-error decimation, not the product\'s '
        + 'error-driven edge collapse; the bake is into vertex colours, not a UV-unwrapped '
        + 'normal/ORM texture set with tangent correctness; there is no UV atlas and no ORM. The '
        + 'product\'s TRELLIS client-side GENERATION stage is absent entirely.',
      localLights: [],
      counters: {
        highpolyTriangles: remesh.sourceTriangles,
        lowpolyTriangles: remesh.outputTriangles,
        occupiedCells: remesh.occupiedCells,
        reductionPercent: Math.round(reduction * 1000) / 10,
        meshes: draws.meshes,
      },
    },
  };
}

export default createDemo;
