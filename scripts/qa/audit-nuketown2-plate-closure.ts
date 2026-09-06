#!/usr/bin/env tsx
/**
 * HF-536 night-defects-3a — CLOSURE TRUTH for the "single-sided plate" list.
 *
 * The previous lane's static audit reported 38 FrontSide plates "reachable
 * from both sides" and inferred a see-through defect. That inference has a
 * PREMISE, and this script tests the premise instead of trusting it:
 *
 *   A FrontSide material only produces a hole when the geometry actually
 *   LACKS the face you are looking at. On a CLOSED box every one of the six
 *   faces exists and every one of them points OUTWARD, so a viewer on any
 *   side sees a front face. `side: FrontSide` on a closed convex solid is
 *   correct, standard, and can never be see-through.
 *
 * So for every finding this script measures, from the built scene:
 *   - geometry constructor and index/position counts,
 *   - triangle count (12 = closed box),
 *   - how many of the six axis directions have at least one triangle whose
 *     geometric (winding-derived) normal points that way in WORLD space.
 *
 * A body with 6/6 outward face directions present is CLOSED: the audit's
 * premise does not hold for it and no fix is owed. A body missing a direction
 * is a real hole and is reported as such.
 *
 * It also checks the presentation batcher: `batchPresentationOnlyBoxes` merges
 * whole cloned BoxGeometries, so it must preserve the triangle total exactly.
 * That is measured here (before/after triangle sums), not assumed.
 *
 * Usage: tsx scripts/qa/audit-nuketown2-plate-closure.ts [--out FILE]
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import * as THREE from 'three';
import { buildNuketown2 } from '../../src/nuketown2-arena';

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const listIndex = process.argv.indexOf('--list');
const listPath = listIndex >= 0 ? process.argv[listIndex + 1] : undefined;

/** Read FINDING names out of the previous lane's plate report. */
function findingNames(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^FINDING (.+?) thickness=/.exec(line);
    if (match) names.push(match[1]!);
  }
  return names;
}

const AXES: readonly (readonly [string, THREE.Vector3])[] = [
  ['+x', new THREE.Vector3(1, 0, 0)],
  ['-x', new THREE.Vector3(-1, 0, 0)],
  ['+y', new THREE.Vector3(0, 1, 0)],
  ['-y', new THREE.Vector3(0, -1, 0)],
  ['+z', new THREE.Vector3(0, 0, 1)],
  ['-z', new THREE.Vector3(0, 0, -1)],
];

type Closure = {
  name: string;
  geometry: string;
  triangles: number;
  /** World-space axis directions covered by at least one outward-facing triangle. */
  directions: string[];
  closed: boolean;
  side: string;
  visible: boolean;
  batched: boolean;
};

function sideName(material: THREE.Material): string {
  if (material.side === THREE.DoubleSide) return 'DoubleSide';
  if (material.side === THREE.BackSide) return 'BackSide';
  return 'FrontSide';
}

/** Face directions actually present, derived from triangle winding in world space. */
function measureClosure(mesh: THREE.Mesh): { triangles: number; directions: string[] } {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) return { triangles: 0, directions: [] };
  mesh.updateWorldMatrix(true, false);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  // ROTATION HONESTY: a stair stringer is rotated about z, so four of its six
  // faces no longer point along a world axis. Classifying against world axes
  // would call a perfectly closed box "2/6 faces" - which is a CLASSIFIER
  // artefact, not a hole. Closure is therefore measured in the body's OWN
  // world-rotated basis: a closed box has six distinct face normals forming
  // three antipodal pairs, whatever its orientation.
  const basis: readonly (readonly [string, THREE.Vector3])[] = AXES.map(([label, axis]) => [
    label,
    axis.clone().applyMatrix3(normalMatrix).normalize(),
  ] as const);
  const covered = new Set<string>();
  let triangles = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const i0 = index ? index.getX(i) : i;
    const i1 = index ? index.getX(i + 1) : i + 1;
    const i2 = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, i0);
    b.fromBufferAttribute(position, i1);
    c.fromBufferAttribute(position, i2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    if (normal.lengthSq() === 0) continue;
    normal.applyMatrix3(normalMatrix).normalize();
    triangles += 1;
    for (const [label, axis] of basis) {
      // A box face normal is exact in its own basis; 0.99 is numerical slack.
      if (normal.dot(axis) > 0.99) covered.add(label);
    }
  }
  return { triangles, directions: [...covered] };
}

const scene = new THREE.Scene();
const map = buildNuketown2(scene);
const root = map.root;

const wanted = new Set(listPath ? findingNames(listPath) : []);
const byName = new Map<string, THREE.Mesh>();
let totalTriangles = 0;
let batchTriangles = 0;
let sourceHiddenTriangles = 0;
root.traverse((node) => {
  if (!(node instanceof THREE.Mesh)) return;
  byName.set(node.name, node);
  const geometry = node.geometry;
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const tris = index ? index.count / 3 : position ? position.count / 3 : 0;
  totalTriangles += tris;
  if (node.userData.staticBatchRendered === true && node.visible) batchTriangles += tris;
  if (node.userData.staticBatchRendered === true && !node.visible) sourceHiddenTriangles += tris;
});

const rows: Closure[] = [];
for (const name of wanted) {
  const mesh = byName.get(name);
  if (!mesh) {
    rows.push({ name, geometry: 'MISSING', triangles: 0, directions: [], closed: false, side: '-', visible: false, batched: false });
    continue;
  }
  const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
  const { triangles, directions } = measureClosure(mesh);
  rows.push({
    name,
    geometry: mesh.geometry.type,
    triangles,
    directions: directions.sort(),
    closed: directions.length === 6,
    side: sideName(material),
    visible: mesh.visible,
    batched: mesh.userData.staticBatchRendered === true,
  });
}

// Arena-wide: every mesh, is any body NOT closed in the six axis directions?
type OpenBody = { name: string; geometry: string; triangles: number; directions: string[]; side: string };
const openBodies: OpenBody[] = [];
let boxMeshes = 0;
let nonBoxMeshes = 0;
root.traverse((node) => {
  if (!(node instanceof THREE.Mesh)) return;
  if (node.userData.staticBatchRendered === true && !node.visible) return; // hidden source of a batch
  const geometry = node.geometry;
  if (geometry instanceof THREE.BoxGeometry) boxMeshes += 1; else nonBoxMeshes += 1;
  if (!(geometry instanceof THREE.BoxGeometry)) return;
  const material = Array.isArray(node.material) ? node.material[0]! : node.material;
  if (material.transparent === true || (material as THREE.MeshStandardMaterial).opacity < 1) return;
  const { triangles, directions } = measureClosure(node);
  if (directions.length < 6) {
    openBodies.push({ name: node.name, geometry: geometry.type, triangles, directions: directions.sort(), side: sideName(material) });
  }
});

const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const closedCount = rows.filter((row) => row.closed).length;
const lines = [
  '# nuketown2 PLATE CLOSURE truth (HF-536 night-defects-3a)',
  `# head ${sha} · generated ${new Date().toISOString()}`,
  '# A FrontSide material is only see-through where the face is ABSENT.',
  '# "directions" = world axis directions covered by an outward-facing triangle.',
  `# audited findings: ${rows.length} · CLOSED (6/6 faces, premise does not hold): ${closedCount}`,
  `# OPEN (a real missing face): ${rows.length - closedCount}`,
  `# arena: box meshes drawn=${boxMeshes} non-box drawn=${nonBoxMeshes} · open box bodies arena-wide: ${openBodies.length}`,
  `# batcher triangle conservation: hidden sources=${sourceHiddenTriangles} merged batches=${batchTriangles}`
  + ` · ${sourceHiddenTriangles === batchTriangles ? 'CONSERVED (no face dropped)' : 'MISMATCH - the batcher changed the triangle count'}`,
  '',
  ...rows.map((row) => (
    `${row.closed ? 'CLOSED ' : 'OPEN   '} ${row.name} geom=${row.geometry} tris=${row.triangles}`
    + ` faces=${row.directions.length}/6 [${row.directions.join(' ')}] side=${row.side}`
    + ` visible=${row.visible} batched=${row.batched}`
  )),
  '',
  ...(openBodies.length
    ? ['# ARENA-WIDE OPEN BOX BODIES', ...openBodies.map((body) => `OPENBODY ${body.name} tris=${body.triangles} faces=${body.directions.length}/6 [${body.directions.join(' ')}] side=${body.side}`)]
    : ['# ARENA-WIDE: every drawn opaque box body carries all six outward faces.']),
  '',
];
const report = lines.join('\n');
if (outPath !== undefined) {
  const out = resolve(outPath);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, report);
  console.log(`written: ${out}`);
}
console.log(report);
// Exit 1 only if a REAL hole exists.
process.exitCode = (rows.length - closedCount) === 0 && openBodies.length === 0 ? 0 : 1;
