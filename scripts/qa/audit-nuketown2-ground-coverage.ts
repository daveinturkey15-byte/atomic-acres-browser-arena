#!/usr/bin/env tsx
/**
 * HF-536 night-defects-3a — GROUND COVERAGE: where does nuketown2 have no
 * floor at all?
 *
 * The render sweep (scripts/qa/sweep-nuketown2-seethrough.mjs, background
 * repainted so "nothing was drawn" is unambiguous) found large regions of pure
 * background BELOW the horizon from ordinary standing positions in the street
 * and inside both houses. That is the owner's "you can see through floors".
 *
 * This audit finds the same thing statically and names the rectangle. It
 * rasterizes every UPWARD-FACING triangle in the arena that lies within the
 * ground band onto a CELL_M grid over NUKETOWN2_BOUNDS, then reports the cells
 * nothing covers. Triangles, not bounding boxes: the ground dressing is merged
 * by `batchPresentationOnlyBoxes`, so a batch's AABB is the union of tiles
 * scattered across the map and would report cover that does not exist.
 *
 * Usage: tsx scripts/qa/audit-nuketown2-ground-coverage.ts [--out FILE] [--cell 0.25] [--margin <m>]
 * `--margin <m>` widens the rasterised box beyond NUKETOWN2_BOUNDS by <m> metres
 * on every side (default 0, so the existing call is unchanged).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import * as THREE from 'three';
import { buildNuketown2 } from '../../src/nuketown2-arena';
import { NUKETOWN2_BOUNDS } from '../../src/nuketown2-layout';

const cellIndex = process.argv.indexOf('--cell');
export const CELL_M = cellIndex >= 0 ? Number(process.argv[cellIndex + 1]) : 0.25;
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const marginIndex = process.argv.indexOf('--margin');
const parsedMargin = marginIndex >= 0 ? Number(process.argv[marginIndex + 1]) : 0;
export const MARGIN_M = Number.isFinite(parsedMargin) && parsedMargin >= 0 ? parsedMargin : 0;

/** A surface below this is under the world; above it, it is a roof or a shelf. */
export const GROUND_BAND_MIN_Y = -1.5;
export const GROUND_BAND_MAX_Y = 1.2;
/** A triangle whose normal is this far from straight up is a wall, not a floor. */
const UP_DOT = 0.5;

export type GroundGap = {
  x0: number; x1: number; z0: number; z1: number;
  cells: number;
  areaM2: number;
};

export type GroundCoverage = {
  cell: number;
  cellsTotal: number;
  cellsCovered: number;
  cellsUncovered: number;
  uncoveredAreaM2: number;
  gaps: GroundGap[];
};

export function auditNuketown2GroundCoverage(cell = CELL_M, root?: THREE.Object3D, margin = 0): GroundCoverage {
  let target = root;
  if (target === undefined) {
    const scene = new THREE.Scene();
    target = buildNuketown2(scene).root;
  }
  target.updateMatrixWorld(true);

  const x0 = NUKETOWN2_BOUNDS.minX - margin;
  const z0 = NUKETOWN2_BOUNDS.minZ - margin;
  const nx = Math.ceil((NUKETOWN2_BOUNDS.maxX + margin - x0) / cell);
  const nz = Math.ceil((NUKETOWN2_BOUNDS.maxZ + margin - z0) / cell);
  const covered = new Uint8Array(nx * nz);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const markTriangle = () => {
    // Conservative fill: mark every cell the triangle's own XZ bounds touch.
    // Slightly over-marks a diagonal edge, which can only HIDE a gap, never
    // invent one - so any gap this audit reports is real.
    const minX = Math.min(a.x, b.x, c.x);
    const maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z);
    const maxZ = Math.max(a.z, b.z, c.z);
    const i0 = Math.max(0, Math.floor((minX - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((maxX - x0) / cell));
    const j0 = Math.max(0, Math.floor((minZ - z0) / cell));
    const j1 = Math.min(nz - 1, Math.floor((maxZ - z0) / cell));
    for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) covered[j * nx + i] = 1;
  };

  const consider = (mesh: THREE.Mesh, matrix: THREE.Matrix4) => {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(matrix);
      b.fromBufferAttribute(position, i1).applyMatrix4(matrix);
      c.fromBufferAttribute(position, i2).applyMatrix4(matrix);
      const lowest = Math.min(a.y, b.y, c.y);
      const highest = Math.max(a.y, b.y, c.y);
      if (highest < GROUND_BAND_MIN_Y || lowest > GROUND_BAND_MAX_Y) continue;
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      if (normal.lengthSq() === 0) continue;
      normal.normalize();
      if (Math.abs(normal.y) < UP_DOT) continue;
      markTriangle();
    }
  };

  const instanceMatrix = new THREE.Matrix4();
  target.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // A hidden source of a static batch is drawn by the batch, not by itself.
    if (mesh.visible === false) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material | undefined;
    if (material?.transparent === true) return;
    const instanced = mesh as THREE.InstancedMesh;
    if (instanced.isInstancedMesh === true) {
      for (let i = 0; i < instanced.count; i += 1) {
        instanced.getMatrixAt(i, instanceMatrix);
        consider(mesh, new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix));
      }
      return;
    }
    consider(mesh, mesh.matrixWorld);
  });

  // Group uncovered cells into rectangles by flood fill, so the report names
  // regions a person can go and look at rather than thousands of cells.
  const seen = new Uint8Array(covered.length);
  const stack: number[] = [];
  const gaps: GroundGap[] = [];
  let cellsUncovered = 0;
  for (let start = 0; start < covered.length; start += 1) {
    if (covered[start] === 1) { continue; }
    cellsUncovered += 1;
    if (seen[start] === 1) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let minI = nx; let maxI = 0; let minJ = nz; let maxJ = 0; let size = 0;
    while (stack.length > 0) {
      const at = stack.pop()!;
      size += 1;
      const i = at % nx;
      const j = (at - i) / nx;
      if (i < minI) minI = i; if (i > maxI) maxI = i;
      if (j < minJ) minJ = j; if (j > maxJ) maxJ = j;
      const push = (next: number, ok: boolean) => {
        if (ok && covered[next] === 0 && seen[next] === 0) { seen[next] = 1; stack.push(next); }
      };
      push(at - 1, i > 0);
      push(at + 1, i + 1 < nx);
      push(at - nx, j > 0);
      push(at + nx, j + 1 < nz);
    }
    gaps.push({
      x0: Number((x0 + minI * cell).toFixed(2)),
      x1: Number((x0 + (maxI + 1) * cell).toFixed(2)),
      z0: Number((z0 + minJ * cell).toFixed(2)),
      z1: Number((z0 + (maxJ + 1) * cell).toFixed(2)),
      cells: size,
      areaM2: Number((size * cell * cell).toFixed(2)),
    });
  }
  gaps.sort((left, right) => right.areaM2 - left.areaM2);
  return {
    cell,
    cellsTotal: covered.length,
    cellsCovered: covered.length - cellsUncovered,
    cellsUncovered,
    uncoveredAreaM2: Number((cellsUncovered * cell * cell).toFixed(2)),
    gaps,
  };
}

if (process.argv[1]?.endsWith('audit-nuketown2-ground-coverage.ts')) {
  const audit = auditNuketown2GroundCoverage(CELL_M, undefined, MARGIN_M);
  const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const lines = [
    '# nuketown2 GROUND COVERAGE (HF-536 night-defects-3a)',
    `# head ${sha} · generated ${new Date().toISOString()} · cell ${audit.cell} m · margin ${MARGIN_M} m`,
    `# bounds x[${NUKETOWN2_BOUNDS.minX},${NUKETOWN2_BOUNDS.maxX}] z[${NUKETOWN2_BOUNDS.minZ},${NUKETOWN2_BOUNDS.maxZ}]`
    + ` · box x[${NUKETOWN2_BOUNDS.minX - MARGIN_M},${NUKETOWN2_BOUNDS.maxX + MARGIN_M}]`
    + ` z[${NUKETOWN2_BOUNDS.minZ - MARGIN_M},${NUKETOWN2_BOUNDS.maxZ + MARGIN_M}]`,
    `# cells ${audit.cellsCovered}/${audit.cellsTotal} covered · UNCOVERED ${audit.cellsUncovered}`
    + ` = ${audit.uncoveredAreaM2} m2 in ${audit.gaps.length} regions`,
    '',
    ...audit.gaps.slice(0, 40).map((gap) => (
      `GAP area=${gap.areaM2}m2 cells=${gap.cells}`
      + ` x[${gap.x0},${gap.x1}] z[${gap.z0},${gap.z1}]`
    )),
    '',
  ];
  const report = lines.join('\n');
  if (outPath) {
    const out = resolve(outPath);
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, report);
    console.log(`written: ${out}`);
  }
  console.log(report);
  process.exitCode = audit.cellsUncovered === 0 ? 0 : 1;
}
