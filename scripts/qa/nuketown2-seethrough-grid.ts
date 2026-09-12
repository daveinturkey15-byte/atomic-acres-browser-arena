#!/usr/bin/env tsx
/**
 * HF-536 night-defects-3a — the eye-position GRID for the see-through sweep.
 *
 * Owner, 2026-09-06: "textures missing you can see through floors and assets".
 * The sweep that answers that has to stand where a PLAYER stands, everywhere,
 * so this file derives the stand-points from the arena's own colliders rather
 * than from a hand-typed roster. (Hardcoded rosters are how this repo has
 * previously shipped green gates that never looked at the new geometry.)
 *
 * For each 2 m grid cell it collects the solid Y intervals under that cell,
 * and treats every interval TOP - plus the ground at y=0 - as a floor. A floor
 * is a stand-point when there is `HEADROOM_M` of clear air above it, which is
 * the same admission a player's capsule gets. The eye goes `EYE_M` above it.
 *
 * Region tags come from the exported layout constants (house / garage spans,
 * street half width), mirrored through `nuketown2HandedX` exactly once, so the
 * tags cannot drift from the geometry.
 *
 * Usage: tsx scripts/qa/nuketown2-seethrough-grid.ts [--out FILE] [--step 2]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { buildNuketown2 } from '../../src/nuketown2-arena';
import {
  nuketown2HandedX,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_GARAGE_SPAN,
  NUKETOWN2_UPPER_Y0,
  NUKETOWN2_STREET_HALF_WIDTH,
  NUKETOWN2_BOUNDS,
} from '../../src/nuketown2-layout';

export const EYE_M = 1.6;
/** A capsule needs this much clear air above a floor before a player can stand. */
export const HEADROOM_M = 1.75;
/** Above this the stand-point is a roof, which this sweep does not own. */
export const MAX_FLOOR_Y = NUKETOWN2_UPPER_Y0 + 0.8;

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const stepIndex = process.argv.indexOf('--step');
const STEP = stepIndex >= 0 ? Number(process.argv[stepIndex + 1]) : 2;

type Interval = { min: number; max: number };

export type EyePosition = {
  x: number;
  z: number;
  floorY: number;
  eyeY: number;
  region: string;
};

/** World-frame span of one house, for the requested side (+1 north, -1 south). */
function houseSpan(side: 1 | -1) {
  const centreX = nuketown2HandedX(NUKETOWN2_HOUSE_LAYOUT[0]!.x) * side;
  const frontZ = NUKETOWN2_HOUSE_FRONT_Z * side;
  const backZ = (NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH) * side;
  return {
    x0: centreX - NUKETOWN2_HOUSE_WIDTH / 2,
    x1: centreX + NUKETOWN2_HOUSE_WIDTH / 2,
    z0: Math.min(frontZ, backZ),
    z1: Math.max(frontZ, backZ),
  };
}

function garageSpan(side: 1 | -1) {
  const a = nuketown2HandedX(NUKETOWN2_GARAGE_SPAN.x0) * side;
  const b = nuketown2HandedX(NUKETOWN2_GARAGE_SPAN.x1) * side;
  // The garage is flush with the house at the back and set forward of the
  // house front by GARAGE_SETBACK; both edges are recoverable from the layout.
  const frontZ = (NUKETOWN2_HOUSE_FRONT_Z - 6) * side;
  const backZ = (NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH) * side;
  return {
    x0: Math.min(a, b),
    x1: Math.max(a, b),
    z0: Math.min(frontZ, backZ),
    z1: Math.max(frontZ, backZ),
  };
}

function inSpan(span: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): boolean {
  return x >= span.x0 && x <= span.x1 && z >= span.z0 && z <= span.z1;
}

export function buildSeeThroughGrid(step = STEP): { positions: EyePosition[]; bounds: Record<string, number> } {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);

  // Occupancy comes from the movement colliders, which is exactly what stops a
  // player. Rotated bodies contribute their world AABB: that over-covers, so a
  // stand-point is never invented where a rotated ramp actually is.
  const solids = map.colliders.map((collider) => {
    const c = collider as unknown as {
      minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
      rotation?: [number, number, number];
    };
    if (!c.rotation) return c;
    const box = new THREE.Box3(
      new THREE.Vector3(c.minX, c.minY, c.minZ),
      new THREE.Vector3(c.maxX, c.maxY, c.maxZ),
    );
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const matrix = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(...c.rotation))
      .setPosition(centre);
    const rotated = new THREE.Box3()
      .setFromCenterAndSize(new THREE.Vector3(), size)
      .applyMatrix4(matrix);
    return {
      minX: rotated.min.x, maxX: rotated.max.x,
      minY: rotated.min.y, maxY: rotated.max.y,
      minZ: rotated.min.z, maxZ: rotated.max.z,
    };
  });

  // Playable bounds, DERIVED: the yards run to the back fence and the verges to
  // the lamp line, both of which are colliders. Anything beyond is backdrop.
  let maxAbsX = 0;
  let maxAbsZ = 0;
  for (const solid of solids) {
    const spanX = Math.max(Math.abs(solid.minX), Math.abs(solid.maxX));
    const spanZ = Math.max(Math.abs(solid.minZ), Math.abs(solid.maxZ));
    // Ignore the arena shell / backdrop bodies: anything wider than 90 m.
    if (solid.maxX - solid.minX > 90 || solid.maxZ - solid.minZ > 90) continue;
    if (spanX < 60) maxAbsX = Math.max(maxAbsX, spanX);
    if (spanZ < 60) maxAbsZ = Math.max(maxAbsZ, spanZ);
  }
  // CLAMP TO THE ARENA (HF-536 night-defects-3a). The collider extents run out
  // to the decorative tree belt at x=+/-28, which is BEYOND the perimeter wall
  // at NUKETOWN2_BOUNDS.minX/maxX - and out there the ground slab simply ends,
  // so an eye placed in the belt sees background under its feet. That is not a
  // defect a player can ever meet: it is outside the playable box, behind a
  // solid wall. Measured before this clamp: 89,639 background pixels below the
  // horizon at (-28, 1.6, 0), and the same at every belt cell.
  const boundX = Math.min(Math.ceil(maxAbsX), Math.floor(Math.min(-NUKETOWN2_BOUNDS.minX, NUKETOWN2_BOUNDS.maxX)) - 1);
  const boundZ = Math.min(Math.ceil(maxAbsZ), Math.floor(Math.min(-NUKETOWN2_BOUNDS.minZ, NUKETOWN2_BOUNDS.maxZ)) - 1);

  const houses = { north: houseSpan(1), south: houseSpan(-1) };
  const garages = { north: garageSpan(1), south: garageSpan(-1) };
  const streetHalf = NUKETOWN2_STREET_HALF_WIDTH;
  const houseBackAbsZ = Math.abs(NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH);

  const positions: EyePosition[] = [];
  for (let x = -boundX; x <= boundX; x += step) {
    for (let z = -boundZ; z <= boundZ; z += step) {
      const stack: Interval[] = [];
      for (const solid of solids) {
        if (x <= solid.minX || x >= solid.maxX) continue;
        if (z <= solid.minZ || z >= solid.maxZ) continue;
        stack.push({ min: solid.minY, max: solid.maxY });
      }
      stack.sort((a, b) => a.min - b.min);
      const floors = new Set<number>([0]);
      for (const interval of stack) floors.add(Number(interval.max.toFixed(3)));
      for (const floorY of [...floors].sort((a, b) => a - b)) {
        if (floorY > MAX_FLOOR_Y) continue;
        const bodyMin = floorY + 0.05;
        const bodyMax = floorY + HEADROOM_M;
        let blocked = false;
        for (const interval of stack) {
          if (interval.max > bodyMin && interval.min < bodyMax) { blocked = true; break; }
        }
        if (blocked) continue;
        const upper = floorY > NUKETOWN2_UPPER_Y0 - 0.6;
        let region = 'verge';
        if (inSpan(houses.north, x, z)) region = `house-north-${upper ? 'upper' : 'ground'}`;
        else if (inSpan(houses.south, x, z)) region = `house-south-${upper ? 'upper' : 'ground'}`;
        else if (inSpan(garages.north, x, z)) region = `garage-north${upper ? '-roof' : ''}`;
        else if (inSpan(garages.south, x, z)) region = `garage-south${upper ? '-roof' : ''}`;
        else if (Math.abs(z) <= streetHalf) region = 'street';
        else if (Math.abs(z) > houseBackAbsZ) region = z < 0 ? 'yard-north' : 'yard-south';
        positions.push({
          x, z,
          floorY,
          eyeY: Number((floorY + EYE_M).toFixed(3)),
          region,
        });
      }
    }
  }
  return { positions, bounds: { boundX, boundZ, step } };
}

if (process.argv[1] && process.argv[1].endsWith('nuketown2-seethrough-grid.ts')) {
  const grid = buildSeeThroughGrid();
  const byRegion = new Map<string, number>();
  for (const position of grid.positions) {
    byRegion.set(position.region, (byRegion.get(position.region) ?? 0) + 1);
  }
  const summary = {
    generated: new Date().toISOString(),
    step: grid.bounds.step,
    boundX: grid.bounds.boundX,
    boundZ: grid.bounds.boundZ,
    eyeHeight: EYE_M,
    headroom: HEADROOM_M,
    total: grid.positions.length,
    byRegion: Object.fromEntries([...byRegion].sort((a, b) => b[1] - a[1])),
    positions: grid.positions,
  };
  if (outPath) {
    const out = resolve(outPath);
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2));
    console.log(`written: ${out}`);
  }
  console.log(`[grid] ${grid.positions.length} eye positions, step ${grid.bounds.step} m,`
    + ` bounds +/-${grid.bounds.boundX} x +/-${grid.bounds.boundZ}`);
  for (const [region, count] of [...byRegion].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${region.padEnd(22)} ${count}`);
  }
}
