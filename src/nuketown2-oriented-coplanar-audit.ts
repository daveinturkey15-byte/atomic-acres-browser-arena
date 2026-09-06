/**
 * nuketown2-oriented-coplanar-audit.ts — HF-536 night-defects-2.
 *
 * WHY THIS EXISTS. `nuketown2-coplanar-audit.ts` scans AXIS-ALIGNED TOP FACES
 * only. Its own report footer names the price: 103 meshes are UNAUDITED —
 * every rotated mesh (the 20 turning-head kerb segments, both roof-deck rakes,
 * the 6 solar panels, the 4 stair stringers, the 2 handrails), every
 * InstancedMesh (lawn regions, avenue sectors, the forest ring) and every
 * non-parametric mesh (hedges, planters, merged vehicle bodies, mountains).
 * The owner named "kerbs vs road" and "roof courses" as the places he sees
 * z-fighting, and BOTH of those live in the unaudited set — so the instrument
 * reporting "FINDINGS: 0" was never evidence about them.
 *
 * WHAT THIS SCAN DOES. It works on FACES, not on top planes, so orientation
 * stops mattering:
 *
 *   - Every BoxGeometry mesh, whatever its rotation, contributes its six real
 *     world-space quad faces (`kind: 'exact-obb'`), built by pushing the box
 *     corners through `matrixWorld`. A kerb segment yawed 18 degrees and the
 *     road slab it sits on are compared on their real planes.
 *   - Every InstancedMesh is EXPANDED: each instance matrix is composed with
 *     the mesh's world matrix. Box-geometry instances give exact faces;
 *     everything else gives its transformed bounding box.
 *   - Every non-box mesh (BufferGeometry hedges, cylinders, icosahedra, merged
 *     vehicle shells, the mountain backdrop) contributes the six faces of its
 *     WORLD AABB, tagged `kind: 'aabb-approx'`. That is declared, not hidden:
 *     an AABB face is a bound, not a surface, so a pair in which either side is
 *     approximate is reported as `approx-candidate` and NEVER as a finding.
 *     Findings are only ever raised between two exact faces.
 *
 * THE RACE TEST (all three must hold, per the brief):
 *   1. planes parallel within `PARALLEL_TOLERANCE_DEGREES` (1 deg),
 *   2. separation measured ALONG THE SHARED NORMAL within
 *      `ORIENTED_COPLANAR_NEAR_METERS` (0.03 m) — not along y, which is what
 *      made the axis-aligned scan blind to a pitched roof course,
 *   3. the two faces' footprints overlap when projected onto the shared plane,
 *      by at least `ORIENTED_MIN_RACE_AREA_M2`.
 *
 * FACING. Two faces pointing the SAME way race for the same depth samples and
 * both draw: that is the z-fight the owner sees. Two faces pointing at each
 * OTHER (a solid resting on a solid) only race when the inward-facing one is
 * actually drawn, i.e. when its material is not `THREE.FrontSide` — so
 * back-to-back pairs are classified separately and only raised when a
 * double-sided or back-side material makes them visible. That is JOB 3's
 * see-through defect class, seen from the depth side.
 *
 * COST. Surfels are bucketed into a uniform spatial grid, and two surfels
 * belonging to the same InstancedMesh are never paired against each other (one
 * mesh, one material, one geometry — a class, reported as a count). Without
 * both guards the ~66k surfels this arena produces are a 2-billion-pair scan.
 */

import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';

/** Two parallel faces this close along their shared normal race for depth. */
export const ORIENTED_COPLANAR_NEAR_METERS = 0.03;
/** Face normals within this angle count as the same plane orientation. */
export const PARALLEL_TOLERANCE_DEGREES = 1;
/** Below this shared area a pair is construction contact, not a surface race. */
export const ORIENTED_MIN_RACE_AREA_M2 = 0.02;
/** Uniform broad-phase cell size, metres. */
const GRID_CELL_METERS = 2;

const PARALLEL_DOT = Math.cos((PARALLEL_TOLERANCE_DEGREES * Math.PI) / 180);

export type SurfelKind = 'exact-obb' | 'aabb-approx';

/**
 * The oriented box the face belongs to. Six surfels share one of these, and it
 * is what makes the OCCLUSION test possible: a face lying a couple of
 * centimetres behind another body's face is only a race if it is not buried
 * INSIDE that body. Nuke Town's interiors are lined with 20 mm drywall panels
 * laid straight onto the structural walls; without this test every one of those
 * linings reported as a finding against the wall it hides.
 */
export type SurfelBody = {
  cx: number; cy: number; cz: number;
  /** Column axes of the body's rotation, unit length. */
  ax: readonly [number, number, number];
  ay: readonly [number, number, number];
  az: readonly [number, number, number];
  hx: number; hy: number; hz: number;
  seeThrough: boolean;
  /**
   * True when the box is the AABB BOUND of a non-box mesh rather than the mesh
   * itself. A bound never occludes: the mountain backdrop's AABB encloses the
   * whole arena, and treating it as solid dismissed every finding on the map.
   */
  approx: boolean;
};

/** Is `p`, nudged `eps` inside, strictly within the body? */
export function pointInsideBody(body: SurfelBody, x: number, y: number, z: number, eps: number): boolean {
  const dx = x - body.cx;
  const dy = y - body.cy;
  const dz = z - body.cz;
  const px = dx * body.ax[0] + dy * body.ax[1] + dz * body.ax[2];
  const py = dx * body.ay[0] + dy * body.ay[1] + dz * body.ay[2];
  const pz = dx * body.az[0] + dy * body.az[1] + dz * body.az[2];
  return Math.abs(px) < body.hx - eps && Math.abs(py) < body.hy - eps && Math.abs(pz) < body.hz - eps;
}

export type Surfel = {
  /** Owning mesh name (instances append `#index`). */
  name: string;
  /** Stable id of the owning mesh — instances of one mesh share it. */
  sourceId: string;
  kind: SurfelKind;
  materialId: string;
  materialName: string;
  polygonOffsetFactor: number;
  presentationOnly: boolean;
  seeThrough: boolean;
  /** `material.side`, so back-to-back races can be judged honestly. */
  side: THREE.Side;
  /** Unit outward normal in world space. */
  nx: number; ny: number; nz: number;
  /** Plane constant: dot(normal, anyPointOnFace). */
  d: number;
  /** The four world corners, in order. */
  corners: readonly (readonly [number, number, number])[];
  /** The oriented box this face bounds. */
  body: SurfelBody;
  /** Face centre. */
  cx: number; cy: number; cz: number;
  area: number;
  /** World AABB of the face, for the broad phase. */
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
};

export type OrientedVerdict =
  | 'oriented-finding'
  | 'oriented-back-to-back-finding'
  | 'oriented-fenced'
  | 'oriented-same-material'
  | 'oriented-contact'
  | 'oriented-buried'
  | 'approx-candidate';

export type OrientedRow = {
  classification: OrientedVerdict;
  /** Separation along the shared normal, metres. */
  gap: number;
  /** Shared area on the plane, m2. */
  overlap: number;
  /** Screen-relevance rank; higher is more likely to be seen by a player. */
  score: number;
  /** World centroid of the shared region — the point the occlusion test asks about. */
  shared: readonly [number, number, number];
  first: Surfel;
  second: Surfel;
};

export type OrientedAudit = {
  surfels: number;
  exactSurfels: number;
  approxSurfels: number;
  meshes: number;
  instancesExpanded: number;
  rows: OrientedRow[];
  counts: Record<OrientedVerdict, number>;
};

type SurfelBase = Omit<Surfel,
  'nx' | 'ny' | 'nz' | 'd' | 'corners' | 'cx' | 'cy' | 'cz' | 'area' | 'body'
  | 'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ'>;

const BOX_FACE_AXES: readonly (readonly [0 | 1 | 2, 1 | -1])[] = Object.freeze([
  [0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1],
]);

const FACE_CORNER_SIGNS: readonly (readonly [number, number])[] = Object.freeze([
  [-1, -1], [1, -1], [1, 1], [-1, 1],
]);

export function pushBoxFaces(
  out: Surfel[],
  base: SurfelBase,
  half: readonly [number, number, number],
  matrix: THREE.Matrix4,
): void {
  const local = new THREE.Vector3();
  const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
  const e = matrix.elements;
  const axisOf = (i: number): readonly [number, number, number] => {
    const x = e[i * 4]!;
    const y = e[i * 4 + 1]!;
    const z = e[i * 4 + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
  };
  const scaleOf = (i: number): number => Math.hypot(e[i * 4]!, e[i * 4 + 1]!, e[i * 4 + 2]!);
  const body: SurfelBody = {
    cx: origin.x, cy: origin.y, cz: origin.z,
    ax: axisOf(0), ay: axisOf(1), az: axisOf(2),
    hx: half[0] * scaleOf(0), hy: half[1] * scaleOf(1), hz: half[2] * scaleOf(2),
    seeThrough: base.seeThrough,
    approx: base.kind === 'aabb-approx',
  };
  for (const [axis, sign] of BOX_FACE_AXES) {
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    const corners: [number, number, number][] = [];
    for (const [su, sv] of FACE_CORNER_SIGNS) {
      const xyz: [number, number, number] = [0, 0, 0];
      xyz[axis] = sign * half[axis];
      xyz[u] = su * half[u];
      xyz[v] = sv * half[v];
      local.set(xyz[0], xyz[1], xyz[2]).applyMatrix4(matrix);
      corners.push([local.x, local.y, local.z]);
    }
    // Normal from the face's own edges — correct under any transform,
    // including the mirroring a handed half applies.
    const p0 = corners[0]!;
    const p1 = corners[1]!;
    const p3 = corners[3]!;
    const e1 = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const e2 = new THREE.Vector3(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    const normal = new THREE.Vector3().crossVectors(e1, e2);
    const area = normal.length();
    if (!(area > 1e-9)) continue;
    normal.multiplyScalar(1 / area);
    let centreX = 0;
    let centreY = 0;
    let centreZ = 0;
    for (const corner of corners) {
      centreX += corner[0] / 4;
      centreY += corner[1] / 4;
      centreZ += corner[2] / 4;
    }
    // Orient outward: away from the body centre.
    if (normal.x * (centreX - origin.x) + normal.y * (centreY - origin.y)
      + normal.z * (centreZ - origin.z) < 0) normal.multiplyScalar(-1);
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;
    for (const corner of corners) {
      minX = Math.min(minX, corner[0]); maxX = Math.max(maxX, corner[0]);
      minY = Math.min(minY, corner[1]); maxY = Math.max(maxY, corner[1]);
      minZ = Math.min(minZ, corner[2]); maxZ = Math.max(maxZ, corner[2]);
    }
    out.push({
      ...base,
      body,
      nx: normal.x, ny: normal.y, nz: normal.z,
      d: normal.x * centreX + normal.y * centreY + normal.z * centreZ,
      corners,
      cx: centreX, cy: centreY, cz: centreZ,
      area,
      minX, maxX, minY, maxY, minZ, maxZ,
    });
  }
}

function pushAabbFaces(
  out: Surfel[],
  base: SurfelBase,
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
): void {
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const local = geometry.boundingBox;
  if (local === null) return;
  const world = local.clone().applyMatrix4(matrix);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  world.getSize(size);
  world.getCenter(centre);
  // A flat card (a grass quad, a decal plane) has a degenerate axis; give it a
  // hair of thickness so its two useful faces still exist.
  const half: [number, number, number] = [
    Math.max(size.x, 1e-4) / 2,
    Math.max(size.y, 1e-4) / 2,
    Math.max(size.z, 1e-4) / 2,
  ];
  pushBoxFaces(out, base, half, new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z));
}

function boxHalfExtents(geometry: THREE.BufferGeometry): [number, number, number] | undefined {
  const p = (geometry as THREE.BoxGeometry).parameters as
    { width?: number; height?: number; depth?: number } | undefined;
  if (p?.width === undefined || p.height === undefined || p.depth === undefined) return undefined;
  return [p.width / 2, p.height / 2, p.depth / 2];
}

export function collectSurfels(root: THREE.Object3D): {
  surfels: Surfel[]; meshes: number; instancesExpanded: number;
} {
  root.updateMatrixWorld(true);
  const surfels: Surfel[] = [];
  let meshes = 0;
  let instancesExpanded = 0;
  const instanceMatrix = new THREE.Matrix4();
  const composed = new THREE.Matrix4();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // Batch meshes are audited through their hidden source nodes, exactly as
    // the axis-aligned scan does, so nothing is counted twice.
    if (mesh.userData.sourceMeshes !== undefined) return;
    // Collision-only bodies (the four stair ramps) are never drawn, so they
    // cannot race anything for depth. The axis-aligned scan excludes them for
    // the same reason; without this line the house stair ramp "z-fights" the
    // drywall it is deliberately buried in.
    if (mesh.userData.collisionOnly === true) return;
    meshes += 1;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const base: Omit<SurfelBase, 'kind' | 'name'> = {
      sourceId: mesh.uuid,
      materialId: materials.map((entry) => entry.uuid).join('|'),
      materialName: materials.map((entry) => (entry as THREE.Material & { name?: string }).name || entry.type).join('|'),
      polygonOffsetFactor: Math.min(...materials.map((entry) => entry.polygonOffsetFactor ?? 0)),
      presentationOnly: mesh.userData.presentationOnly === true,
      seeThrough: materials.some((entry) => entry.transparent === true),
      side: (materials[0]?.side ?? THREE.FrontSide) as THREE.Side,
    };
    const label = mesh.name || mesh.type;
    const half = boxHalfExtents(mesh.geometry);
    const instanced = mesh as THREE.InstancedMesh;
    if (instanced.isInstancedMesh === true) {
      for (let i = 0; i < instanced.count; i += 1) {
        instanced.getMatrixAt(i, instanceMatrix);
        composed.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
        instancesExpanded += 1;
        if (half !== undefined) {
          pushBoxFaces(surfels, { ...base, name: `${label}#${i}`, kind: 'exact-obb' }, half, composed);
        } else {
          pushAabbFaces(surfels, { ...base, name: `${label}#${i}`, kind: 'aabb-approx' }, mesh.geometry, composed);
        }
      }
      return;
    }
    if (half !== undefined) {
      pushBoxFaces(surfels, { ...base, name: label, kind: 'exact-obb' }, half, mesh.matrixWorld);
      return;
    }
    pushAabbFaces(surfels, { ...base, name: label, kind: 'aabb-approx' }, mesh.geometry, mesh.matrixWorld);
  });
  return { surfels, meshes, instancesExpanded };
}

function signedArea(poly: readonly (readonly [number, number])[]): number {
  let acc = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    acc += a[0] * b[1] - b[0] * a[1];
  }
  return acc / 2;
}

/**
 * Convex-polygon intersection of two faces in the shared plane's 2D basis
 * (Sutherland-Hodgman). Returns the area AND the world-space centroid of the
 * shared region, which is the point the third-body occlusion test asks about.
 */
export function sharedArea(first: Surfel, second: Surfel): { area: number; centre: [number, number, number] } {
  const n = new THREE.Vector3(first.nx, first.ny, first.nz);
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const origin = new THREE.Vector3(first.cx, first.cy, first.cz);
  const u = new THREE.Vector3().crossVectors(helper, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const project = (corners: readonly (readonly [number, number, number])[]): [number, number][] => corners.map(
    (c) => [
      (c[0] - origin.x) * u.x + (c[1] - origin.y) * u.y + (c[2] - origin.z) * u.z,
      (c[0] - origin.x) * v.x + (c[1] - origin.y) * v.y + (c[2] - origin.z) * v.z,
    ] as [number, number],
  );
  let subject: (readonly [number, number])[] = project(first.corners);
  const clipRaw = project(second.corners);
  // A mirrored transform flips winding; normalise so the clipper's inside test
  // is stable for both quads.
  if (signedArea(subject) < 0) subject = [...subject].reverse();
  const clipper = signedArea(clipRaw) < 0 ? [...clipRaw].reverse() : clipRaw;
  for (let i = 0; i < clipper.length && subject.length > 0; i += 1) {
    const a = clipper[i]!;
    const b = clipper[(i + 1) % clipper.length]!;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const inside = (p: readonly [number, number]): number => ex * (p[1] - a[1]) - ez * (p[0] - a[0]);
    const next: [number, number][] = [];
    for (let j = 0; j < subject.length; j += 1) {
      const cur = subject[j]!;
      const prev = subject[(j + subject.length - 1) % subject.length]!;
      const curIn = inside(cur) >= 0;
      const prevIn = inside(prev) >= 0;
      if (curIn) {
        if (!prevIn) {
          const t = inside(prev) / (inside(prev) - inside(cur));
          next.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
        }
        next.push([cur[0], cur[1]]);
      } else if (prevIn) {
        const t = inside(prev) / (inside(prev) - inside(cur));
        next.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
      }
    }
    subject = next;
  }
  if (subject.length < 3) return { area: 0, centre: [first.cx, first.cy, first.cz] };
  let su = 0;
  let sv = 0;
  for (const point of subject) { su += point[0] / subject.length; sv += point[1] / subject.length; }
  return {
    area: Math.abs(signedArea(subject)),
    centre: [
      origin.x + u.x * su + v.x * sv,
      origin.y + u.y * su + v.y * sv,
      origin.z + u.z * su + v.z * sv,
    ],
  };
}

/**
 * Screen relevance, so the fix list is ranked by what a player can actually
 * see rather than by raw area. A pair scores its shared area, weighted by
 * whether the face is inside the play box and inside the owner's eye band.
 */
export function screenScore(first: Surfel, second: Surfel, overlap: number): number {
  const y = (first.cy + second.cy) / 2;
  const x = (first.cx + second.cx) / 2;
  const z = (first.cz + second.cz) / 2;
  // Nuke Town's playable core; anything outside it is backdrop.
  if (Math.abs(x) > 40 || Math.abs(z) > 30 || y > 9 || y < -1) return 0;
  const upward = Math.max(first.ny, second.ny);
  // A pair of DOWN-facing bases sitting on the ground slab (its top is y = 0)
  // is under the world; a player never sees it. Rank it zero rather than
  // hiding it — the row still prints, it just stops crowding the fix list.
  if (upward < -0.7 && y <= 0.05) return 0;
  // Ground planes and low vertical faces are what a 1.6 m eye sweeps over.
  const band = y <= 4 ? 1 : y <= 7 ? 0.5 : 0.2;
  const facing = upward > 0.7 ? 1 : Math.abs(upward) < 0.3 ? 0.8 : 0.4;
  return overlap * band * facing;
}

export function auditNuketown2Oriented(root?: THREE.Object3D): OrientedAudit {
  let target = root;
  if (target === undefined) {
    const scene = new THREE.Scene();
    target = buildNuketown2(scene).root;
  }
  const { surfels, meshes, instancesExpanded } = collectSurfels(target);
  // Uniform-grid broad phase on the face AABBs.
  const buckets = new Map<string, number[]>();
  const cell = (value: number): number => Math.floor(value / GRID_CELL_METERS);
  surfels.forEach((surfel, index) => {
    for (let ix = cell(surfel.minX); ix <= cell(surfel.maxX); ix += 1) {
      for (let iy = cell(surfel.minY); iy <= cell(surfel.maxY); iy += 1) {
        for (let iz = cell(surfel.minZ); iz <= cell(surfel.maxZ); iz += 1) {
          const key = `${ix},${iy},${iz}`;
          const list = buckets.get(key);
          if (list === undefined) buckets.set(key, [index]);
          else list.push(index);
        }
      }
    }
  });
  const seen = new Set<number>();
  const rows: OrientedRow[] = [];
  for (const list of buckets.values()) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const ia = list[a]!;
        const ib = list[b]!;
        const first = surfels[ia]!;
        const second = surfels[ib]!;
        // One InstancedMesh against itself is one material and one geometry: a
        // class, not a pair. Never itemised.
        if (first.sourceId === second.sourceId) continue;
        const dot = first.nx * second.nx + first.ny * second.ny + first.nz * second.nz;
        const sameFacing = dot >= PARALLEL_DOT;
        const opposed = dot <= -PARALLEL_DOT;
        if (!sameFacing && !opposed) continue;
        // Separation ALONG THE SHARED NORMAL — the whole point of this scan.
        const gap = Math.abs(first.d - (opposed ? -second.d : second.d));
        if (gap > ORIENTED_COPLANAR_NEAR_METERS) continue;
        const pairKey = ia < ib ? ia * surfels.length + ib : ib * surfels.length + ia;
        if (seen.has(pairKey)) continue;
        const shared = sharedArea(first, second);
        const overlap = shared.area;
        if (overlap <= 0) continue;
        seen.add(pairKey);
        // OCCLUSION. For a same-facing pair the face with the LARGER plane
        // constant is in front, and the overlap region lies inside that front
        // face by construction — so the rear face is hidden there whenever the
        // front BODY is opaque and reaches back at least as far as the rear
        // plane. Nuke Town lines its structural walls with 20 mm drywall
        // panels laid straight on: 0.02 m gap, 0.02 m panel, wall face fully
        // covered. Without this test every one of those linings reported as a
        // finding against the wall it hides. Exactly coplanar faces (gap 0)
        // have no front and are never dismissed here.
        if (sameFacing && gap > 1e-6) {
          const front = first.d > second.d ? first : second;
          if (!front.body.seeThrough && !front.body.approx) {
            const body = front.body;
            const thickness = 2 * (
              Math.abs(front.nx * body.ax[0] + front.ny * body.ax[1] + front.nz * body.ax[2]) * body.hx
              + Math.abs(front.nx * body.ay[0] + front.ny * body.ay[1] + front.nz * body.ay[2]) * body.hy
              + Math.abs(front.nx * body.az[0] + front.ny * body.az[1] + front.nz * body.az[2]) * body.hz
            );
            if (thickness >= gap - 1e-6) continue;
          }
        }
        const approx = first.kind === 'aabb-approx' || second.kind === 'aabb-approx';
        const fenced = first.polygonOffsetFactor < 0 || second.polygonOffsetFactor < 0;
        const sameMaterial = first.materialId === second.materialId;
        const drawnBothSides = first.side !== THREE.FrontSide || second.side !== THREE.FrontSide;
        let classification: OrientedVerdict;
        if (approx) classification = 'approx-candidate';
        else if (overlap < ORIENTED_MIN_RACE_AREA_M2) classification = 'oriented-contact';
        // FACING IS DECIDED BEFORE MATERIAL. Two faces pointing at each other
        // are a solid resting on a solid: the inward one is back-face culled
        // unless its material is drawn from both sides. Classifying by
        // material first put every same-material butt joint (adjoining ground
        // tiles, a roof cap on its body) into `oriented-same-material`, which
        // reads as "a race we argued away" instead of "not a race".
        else if (opposed) classification = drawnBothSides ? 'oriented-back-to-back-finding' : 'oriented-contact';
        else if (fenced) classification = 'oriented-fenced';
        else if (sameMaterial) classification = 'oriented-same-material';
        else classification = 'oriented-finding';
        rows.push({
          classification,
          gap,
          overlap,
          score: screenScore(first, second, overlap),
          shared: shared.centre,
          first,
          second,
        });
      }
    }
  }
  // THIRD-BODY OCCLUSION. A race only matters if a view ray can reach the
  // shared plane. Two faces both pointing INTO a wall (a kitchen cabinet's back
  // coplanar with the drywall it stands on) and two down-facing bases both
  // sitting on the ground slab are geometrically coplanar and cosmetically
  // invisible. The point just OUTSIDE the shared plane, along the shared
  // normal, is the whole test: inside any other opaque body, nothing draws.
  // Run only on findings — 141 rows against ~1.1k bodies is free, the same
  // test over every pair is not.
  const bodies: SurfelBody[] = [];
  const seenBodies = new Set<SurfelBody>();
  for (const surfel of surfels) {
    if (surfel.body.seeThrough || surfel.body.approx || seenBodies.has(surfel.body)) continue;
    seenBodies.add(surfel.body);
    bodies.push(surfel.body);
  }
  for (const row of rows) {
    if (row.classification !== 'oriented-finding' && row.classification !== 'oriented-back-to-back-finding') continue;
    const probeX = row.shared[0] + row.first.nx * 1e-3;
    const probeY = row.shared[1] + row.first.ny * 1e-3;
    const probeZ = row.shared[2] + row.first.nz * 1e-3;
    for (const body of bodies) {
      if (body === row.first.body || body === row.second.body) continue;
      if (pointInsideBody(body, probeX, probeY, probeZ, 1e-4)) { row.classification = 'oriented-buried'; break; }
    }
  }
  rows.sort((left, right) => right.score - left.score || right.overlap - left.overlap);
  const counts = {
    'oriented-finding': 0,
    'oriented-back-to-back-finding': 0,
    'oriented-fenced': 0,
    'oriented-same-material': 0,
    'oriented-contact': 0,
    'oriented-buried': 0,
    'approx-candidate': 0,
  } as Record<OrientedVerdict, number>;
  for (const row of rows) counts[row.classification] += 1;
  return {
    surfels: surfels.length,
    exactSurfels: surfels.filter((surfel) => surfel.kind === 'exact-obb').length,
    approxSurfels: surfels.filter((surfel) => surfel.kind === 'aabb-approx').length,
    meshes,
    instancesExpanded,
    rows,
    counts,
  };
}
