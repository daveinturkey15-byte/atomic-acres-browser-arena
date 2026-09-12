/**
 * Source 45 — Trellis.2 / Pixal3D as core ComfyUI nodes: the mesh
 * post-processing chain that cleans a generated shell.
 *
 * What is NOT here, and why. The generator stage is unavailable by decision,
 * not by accident: the weights are ~9.95 GB, are not installed on this machine,
 * and installing them is an owner decision; the register also forbids queueing
 * work on the owner's running ComfyUI beyond a single authorised bounded test.
 * No ComfyUI was contacted by this lane. So no image-to-3D generation is
 * performed, simulated or claimed.
 *
 * What IS demonstrable is the other half of the announcement, and it is the
 * half that is pure deterministic geometry: the rebuilt 3D pipeline's mesh
 * post-processing. The node implementations were read at the register's pin
 * (comfyanonymous/ComfyUI @ 0e65cb907193cf1013bda474593eb48d8c53d848,
 * comfy_extras/nodes_mesh_postprocess.py, 149,326 B retrieved) — Python over
 * torch and scipy.ndimage, no CUDA extensions, which is what makes the chain
 * inspectable at all. Licences read as files at their pins: TRELLIS.2 MIT
 * (Microsoft), Pixal3D MIT (Tencent).
 *
 * The chain, restated and implemented here in TypeScript from scratch:
 *   VoxelToMesh -> WeldVertices -> FillHoles -> MeshSmoothNormals
 *
 * Verified against that pinned file 2026-09-12: `WeldVertices`, `FillHoles` and
 * `MeshSmoothNormals` are classes in it; `VoxelToMesh` is NOT — it is named by
 * the documented node chain but lives in another module that was not fetched,
 * so its implementation is unseen and only its stated role is used here. The
 * ordering claim is upstream's own: `WeldVertices` describes itself as a
 * "pre-pass before FillHoles, DecimateMesh, or any topology-aware op".
 *
 * BEFORE is the raw voxel shell: every face its own four vertices, a hole
 * punched through it, hard faceting. AFTER is the same shell through the chain.
 */

import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

const N = 14;
const CELL = 0.12;

export type RawMesh = { positions: number[]; indices: number[] };

/** VoxelToMesh: emit the outward face of every solid cell with an empty neighbour. */
export function voxelToMesh(
  occupied: (x: number, y: number, z: number) => boolean,
  size: number,
  cell: number,
): RawMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const faces: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  const half = (size * cell) / 2;
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let z = 0; z < size; z += 1) {
        if (!occupied(x, y, z)) continue;
        for (const [nx, ny, nz] of faces) {
          if (occupied(x + nx, y + ny, z + nz)) continue;
          const cx = x * cell - half + cell / 2;
          const cy = y * cell - half + cell / 2;
          const cz = z * cell - half + cell / 2;
          // Two in-plane axes for this face direction.
          const ax: [number, number, number] = nx !== 0 ? [0, 1, 0] : [1, 0, 0];
          const ay: [number, number, number] = nz !== 0 ? [0, 1, 0] : [0, 0, 1];
          const base = positions.length / 3;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
            positions.push(
              cx + (nx * cell) / 2 + ((ax[0] * sx + ay[0] * sy) * cell) / 2,
              cy + (ny * cell) / 2 + ((ax[1] * sx + ay[1] * sy) * cell) / 2,
              cz + (nz * cell) / 2 + ((ax[2] * sx + ay[2] * sy) * cell) / 2,
            );
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  return { positions, indices };
}

/** WeldVertices: collapse coincident vertices within a tolerance. */
export function weldVertices(mesh: RawMesh, tolerance = 1e-4): RawMesh {
  const keyOf = (i: number) =>
    [0, 1, 2]
      .map((axis) => Math.round(mesh.positions[i * 3 + axis] / tolerance))
      .join('|');
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Int32Array(mesh.positions.length / 3);
  for (let i = 0; i < mesh.positions.length / 3; i += 1) {
    const key = keyOf(i);
    let target = map.get(key);
    if (target === undefined) {
      target = positions.length / 3;
      map.set(key, target);
      positions.push(
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1],
        mesh.positions[i * 3 + 2],
      );
    }
    remap[i] = target;
  }
  return { positions, indices: mesh.indices.map((index) => remap[index]) };
}

/**
 * FillHoles: an edge used by exactly one triangle is a boundary edge. Chain the
 * boundary edges into loops and fan-fill each loop from its first vertex.
 */
export function fillHoles(mesh: RawMesh): { mesh: RawMesh; loopsFilled: number } {
  const useCount = new Map<string, number>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const key = edgeKey(mesh.indices[i + a], mesh.indices[i + b]);
      useCount.set(key, (useCount.get(key) ?? 0) + 1);
    }
  }
  const adjacency = new Map<number, number[]>();
  for (const [key, count] of useCount) {
    if (count !== 1) continue;
    const [a, b] = key.split(':').map(Number);
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }

  const indices = [...mesh.indices];
  const visited = new Set<number>();
  let loopsFilled = 0;
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let current = start;
    let previous = -1;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      loop.push(current);
      const next = (adjacency.get(current) ?? []).find((candidate) => candidate !== previous
        && !visited.has(candidate));
      previous = current;
      if (next === undefined) break;
      current = next;
    }
    if (loop.length < 3) continue;
    for (let i = 1; i < loop.length - 1; i += 1) {
      indices.push(loop[0], loop[i], loop[i + 1]);
    }
    loopsFilled += 1;
  }
  return { mesh: { positions: mesh.positions, indices }, loopsFilled };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-45-mesh-postprocess-chain';
  const { before, after } = beforeAfterPanels(THREE, 2.6);

  const centre = (N - 1) / 2;
  // A generated-shell stand-in: a hollow blob with a bite taken out of it, the
  // sort of boundary a voxel-decoded surface arrives with.
  const occupied = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return false;
    const radius = Math.hypot(x - centre, y - centre, z - centre);
    if (radius > centre * 0.92) return false;
    if (radius < centre * 0.55) return false;
    // The hole: a punched channel that leaves an open boundary loop.
    if (Math.hypot(x - centre, z - centre) < 2.2 && y > centre) return false;
    return true;
  };

  const raw = voxelToMesh(occupied, N, CELL);
  const welded = weldVertices(raw);
  const filled = fillHoles(welded);

  function toGeometry(mesh: RawMesh, smooth: boolean): import('three').BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(mesh.positions), 3),
    );
    geometry.setIndex(mesh.indices);
    // MeshSmoothNormals: shared vertices average their face normals, which only
    // works because WeldVertices ran first. That ordering is the point.
    if (smooth) geometry.computeVertexNormals();
    else geometry.computeVertexNormals();
    return geometry;
  }

  const rawMesh = new THREE.Mesh(
    toGeometry(raw, false),
    new THREE.MeshStandardMaterial({
      color: 0x9e8f7a,
      roughness: 0.85,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  rawMesh.name = 'raw-voxel-shell';
  before.add(rawMesh);

  const cleanMesh = new THREE.Mesh(
    toGeometry(filled.mesh, true),
    new THREE.MeshStandardMaterial({
      color: 0x9e8f7a,
      roughness: 0.72,
      flatShading: false,
      side: THREE.DoubleSide,
    }),
  );
  cleanMesh.name = 'welded-filled-smoothed';
  after.add(cleanMesh);

  root.add(before, after);
  const draws = countDraws(root);

  let elapsed = 0;
  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed += dt;
      before.rotation.y = elapsed * 0.4;
      after.rotation.y = elapsed * 0.4;
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 45,
      title: 'Generated-shell post-processing: surface, WeldVertices, FillHoles, SmoothNormals',
      method:
        'A voxel field is surfaced by emitting the outward face of every solid cell with an empty '
        + 'neighbour; coincident vertices are welded within a tolerance; edges used by exactly '
        + 'one triangle are chained into boundary loops and fan-filled; then vertex normals are '
        + 'averaged, which only produces smooth shading because the weld ran first. The before '
        + 'panel is the same shell with none of it applied.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/comfyui/status/2094561833638404449',
        'https://blog.comfy.org/p/trellis2-and-pixal3d-are-now-native',
        'https://raw.githubusercontent.com/comfyanonymous/ComfyUI/0e65cb907193cf1013bda474593eb48d8c53d848/comfy_extras/nodes_mesh_postprocess.py',
      ],
      limitation:
        'THE GENERATOR IS ABSENT. No Trellis.2 or Pixal3D inference runs, no weights are '
        + 'installed (~9.95 GB, an owner decision), no ComfyUI instance was contacted, and no '
        + 'image-to-3D claim is made — the input voxel field is authored by this file. The PBR '
        + 'bake stage (BakeTextureFromVoxel, BakeNormalMapFromMesh, BakeAmbientOcclusion, '
        + 'UnwrapMesh) is NOT implemented: there is no UV atlas, no normal map and no AO here. '
        + 'Only three of the four named nodes were inspected at the pin: WeldVertices, FillHoles '
        + 'and MeshSmoothNormals are classes in that file, VoxelToMesh is not — it belongs to '
        + 'another module that was never fetched, so the surfacing step follows its documented '
        + 'role and NOT its unseen implementation. '
        + 'These are independent TypeScript reimplementations, not ports of the Python nodes, '
        + 'and DecimateMesh/RemeshMesh are not included (source 36 carries a clustering '
        + 'reduction separately). The DINOv3 attribution condition the register flags applies to '
        + 'the generator route, not to this exhibit.',
      localLights: [],
      counters: {
        rawVertices: raw.positions.length / 3,
        weldedVertices: welded.positions.length / 3,
        rawTriangles: raw.indices.length / 3,
        filledTriangles: filled.mesh.indices.length / 3,
        boundaryLoopsFilled: filled.loopsFilled,
        meshes: draws.meshes,
      },
    },
  };
}

export default createDemo;
