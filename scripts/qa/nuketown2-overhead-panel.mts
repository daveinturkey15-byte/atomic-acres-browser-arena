#!/usr/bin/env tsx
/**
 * The BUILT panel of §8 in `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`,
 * printed from `buildNuketown2()`'s OWN colliders and spawn table.
 *
 * WHY THIS FILE IS TRACKED. §8 used to say "regenerate with
 * `npx tsx artifacts/nuketown2-overlay.mts`", and `artifacts/` is gitignored:
 * the tool the document named as its own reproduction step was not in the
 * repository, so the panel beside the measured reference could not be checked
 * by anyone who had not run the lane that wrote it. It is here now.
 *
 * The cell grid is the schematic's: 1.5 m along the street (one row) by 3 m
 * across it (one column), in the same world frame, so the two panels can be
 * read side by side without either being rescaled.
 *
 *   npx tsx scripts/qa/nuketown2-overhead-panel.mts
 */
import * as THREE from 'three';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_SPAWN_LAYOUT,
  NUKETOWN2_STREET_HALF_WIDTH,
  buildNuketown2,
} from '../../src/nuketown2-arena';

type Cell = { x0: number; x1: number; z0: number; z1: number };

const ROW_M = 1.5;
const COL_M = 3;

const map = buildNuketown2(new THREE.Scene());

/** Every solid box mesh, with its plan footprint and its authored name. */
const bodies = map.root.children
  .filter((node): node is THREE.Mesh => {
    const mesh = node as THREE.Mesh;
    return mesh.isMesh === true
      && mesh.userData.presentationOnly !== true
      && (mesh.geometry as THREE.BoxGeometry).parameters !== undefined;
  })
  .map((mesh) => {
    const p = (mesh.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
    return {
      name: mesh.name,
      x0: mesh.position.x - p.width / 2,
      x1: mesh.position.x + p.width / 2,
      z0: mesh.position.z - p.depth / 2,
      z1: mesh.position.z + p.depth / 2,
      top: mesh.position.y + p.height / 2,
    };
  });

const overlaps = (a: Cell, b: Cell): boolean => (
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.25
  && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.5
);

/** §8's legend, in priority order: the tallest, most structural thing wins. */
const GLYPHS: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
  [/\bhouse (wall|front|back|upper|stair|partition|roof|floor)/u, 'H'],
  [/\bgarage /u, 'G'],
  [/street-vehicle truck/u, 'T'],
  [/street-vehicle coach/u, 'C'],
  [/street-vehicle head car/u, 'c'],
  [/\b(car|verge|yard|path|street)\b/u, 'o'],
]);

function glyph(cell: Cell): string {
  for (const [pattern, mark] of GLYPHS) {
    if (bodies.some((body) => pattern.test(body.name) && body.top > 0.35 && overlaps(cell, body))) return mark;
  }
  return '.';
}

const spawns = [...NUKETOWN2_SPAWN_LAYOUT[0]!, ...NUKETOWN2_SPAWN_LAYOUT[1]!];

const rows: string[] = [];
for (let row = 0; row < (NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX) / ROW_M; row += 1) {
  const x1 = NUKETOWN2_BOUNDS.maxX - row * ROW_M;
  const x0 = x1 - ROW_M;
  let line = '';
  for (let col = 0; col < (NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ) / COL_M; col += 1) {
    const z0 = NUKETOWN2_BOUNDS.minZ + col * COL_M;
    const z1 = z0 + COL_M;
    const cell: Cell = { x0, x1, z0, z1 };
    let mark = glyph(cell);
    if (mark === '.' && spawns.some(([sx, sz]) => sx > x0 && sx <= x1 && sz > z0 && sz <= z1)) mark = 's';
    // The carriageway is presentation-only (see `street()`), so it is drawn
    // from the section rather than found among the solids.
    if (mark === '.' && Math.abs((z0 + z1) / 2) <= NUKETOWN2_STREET_HALF_WIDTH) mark = '=';
    line += mark;
  }
  rows.push(`${String(Math.round((x0 + x1) / 2)).padStart(4, ' ')}|${line}|`);
}

console.log('H house   G garage   T moving truck (open)   C coach (closed)   c car');
console.log('= road    o prop     s spawn      (the perimeter wall is the frame, not a prop)');
console.log(`cell = ${ROW_M} m along the street (rows) x ${COL_M} m across it (columns)`);
console.log(`    z ${NUKETOWN2_BOUNDS.minZ} ${'-'.repeat(20)} ${NUKETOWN2_BOUNDS.maxZ}`);
for (const line of rows) console.log(line);
