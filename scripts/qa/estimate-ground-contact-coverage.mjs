#!/usr/bin/env tsx
/**
 * estimate-ground-contact-coverage.mjs — DAY-3 GRASS-CONTACT lane (fix-grass).
 *
 * Headless CPU instrument (rows B/C): directional ray fan through the lower
 * half of one frame per footprint — 8 named yard footprints at a prone /
 * crouch / standing eye, each aimed across its lawn at the rect centre on
 * the same z-side (±35° yaw window, grazing pitches). Measures the fraction
 * of rays that reach the ground plate without meeting vegetation.
 *
 * Frame, not surround: an earlier full-circle (360° yaw) cut scored
 * surround density instead of frame composition — every off-lawn glance at a
 * fence, path or house diluted the number (pooled 0.834 -> 0.768, movement
 * 0.066 < the 0.10 row-B floor). A frame looks one way; the fan does too.
 *
 * It traces against the INSTANCE MATRICES AND GEOMETRY THE BUILDER ACTUALLY
 * RETURNS (THREE.Raycaster over the built InstancedMeshes read out of the
 * built subtree) — never against a placement model re-derived here. The only
 * thing this script authors is the eye fan and the fixture rectangles; the
 * vegetation it measures comes out of buildNuketownRebuildLawnField.
 *
 * Baseline discipline (rows B/C): `--no-contact` raycasts the blade field
 * alone. That is a valid baseline for the DELTA because the blade field is
 * byte-identical pre/post change (verified: blade instanceMatrix hash on the
 * pre-change sha matches; sha printed in the header). The absolute baseline
 * is additionally re-run on the pre-change worktree; both numbers go to
 * REPORT.md.
 *
 * LOD honesty note: the tier's distance LOD is a GPU vertex-graph collapse,
 * invisible to a CPU raycast, so far-field occlusion is overstated here and
 * row B reads construction coverage. Row D (coordinator, real capture)
 * remains the scene-level verdict.
 *
 * Usage:
 *   tsx scripts/qa/estimate-ground-contact-coverage.mjs --arena nuketown2 --eye 0.61
 *   tsx scripts/qa/estimate-ground-contact-coverage.mjs --arena nuketown2 --eye 1.70 --no-contact
 *
 * No GPU, no lock, no browser.
 */
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import {
  buildNuketownRebuildLawnField,
  nuketown2LawnReviewEyePositions,
} from '../../src/nuketown-lawn-field.ts';

const CONTACT_MARKER = 'nt-grasscontact-thatch-v1';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(name);
}

const arena = arg('--arena', 'nuketown2');
if (arena !== 'nuketown2') {
  console.error(`estimate-ground-contact-coverage: only --arena nuketown2 is supported (got ${arena})`);
  process.exit(2);
}
const eyeH = Number(arg('--eye', '0.61'));
if (!Number.isFinite(eyeH) || eyeH <= 0 || eyeH > 3) {
  console.error(`estimate-ground-contact-coverage: --eye must be a height in metres (got ${arg('--eye', '')})`);
  process.exit(2);
}
const noContact = flag('--no-contact');

let headSha = 'unknown';
try {
  headSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch { /* detached trees still measure */ }

// Representative rebuild-lawn footprint (same rectangles as the lane's vitest
// fixture): two 28 x 13 m yard lawns. Eyes stand on real review positions;
// rays do the rest, so eyes outside the rects still count.
const DRESSING = [
  { id: 'probe-north', material: 'lawn', x0: -14, x1: 14, z0: -36, z1: -23, paired: false },
  { id: 'probe-south', material: 'lawn', x0: -14, x1: 14, z0: 23, z1: 36, paired: false },
];
const RECT_CENTRES = [
  { x: 0, z: -29.5 },
  { x: 0, z: 29.5 },
];

// 8 named yard footprints: review eye positions in the yard band (|z| >= 22),
// where the lawn actually is. World-correct (already handedness-mirrored).
const FOOTPRINTS = nuketown2LawnReviewEyePositions()
  .filter(([, z]) => Math.abs(z) >= 22)
  .slice(0, 8)
  .map(([x, z], i) => ({ name: `yard-fp-${i}`, x, z }));
if (FOOTPRINTS.length !== 8) {
  console.error(`estimate-ground-contact-coverage: expected 8 yard footprints, found ${FOOTPRINTS.length}`);
  process.exit(2);
}

// One frame per footprint: yaw window around the aim at the same-side rect
// centre, grazing-to-steep pitches covering the frame's lower half.
const YAW_HALF_DEG = 35;
const YAW_STEPS = 13;
const PITCHES_DEG = [-2, -6, -12, -20, -30];

const parent = new THREE.Group();
const field = buildNuketownRebuildLawnField(parent, {
  dressing: DRESSING,
  keepOuts: [],
  keepOutCircles: [],
});
parent.updateMatrixWorld(true);

const bladeMeshes = [...field.meshes];
const contactMeshes = [];
const litterMeshes = [];
field.group.traverse((node) => {
  // Duck-typed: tsx can load two copies of three (ESM in src, CJS here), so
  // instanceof is unreliable across the boundary; isInstancedMesh is set by
  // the constructor on every copy.
  if (node?.isInstancedMesh === true && node.name.includes(CONTACT_MARKER)) {
    contactMeshes.push(node);
    if (node.name.includes('-litter-')) litterMeshes.push(node);
  }
});
const thatchMeshes = contactMeshes.filter((m) => !litterMeshes.includes(m));
const occluders = noContact ? [...bladeMeshes] : [...bladeMeshes, ...contactMeshes];

// Blade-field identity hash: proves the --no-contact run is the pre-change
// blade field (the blade renderer is untouched by this lane).
let bladeHash = 0;
for (const mesh of bladeMeshes) {
  const arr = mesh.instanceMatrix.array;
  for (let i = 0; i < arr.length; i += 1) {
    bladeHash = (((bladeHash * 31) | 0) + ((arr[i] * 1e6) | 0)) | 0;
  }
}

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = false;
const platePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function tierOf(object) {
  if (!object) return 'plate';
  if (object.name.includes(CONTACT_MARKER)) {
    return object.name.includes('-litter-') ? 'litter' : 'thatch';
  }
  return 'blades';
}

const perFootprint = [];
let pooledRays = 0;
let pooledPlate = 0;
const pooledOccluded = { thatch: 0, litter: 0, blades: 0 };

for (const fp of FOOTPRINTS) {
  const eye = new THREE.Vector3(fp.x, eyeH, fp.z);
  const centre = RECT_CENTRES.reduce((a, b) =>
    Math.abs(b.z - fp.z) < Math.abs(a.z - fp.z) ? b : a,
  );
  const aimYaw = Math.atan2(centre.z - fp.z, centre.x - fp.x);
  let rays = 0;
  let plate = 0;
  const occluded = { thatch: 0, litter: 0, blades: 0 };
  for (let y = 0; y < YAW_STEPS; y += 1) {
    const yaw = aimYaw + ((y / (YAW_STEPS - 1)) * 2 - 1) * ((YAW_HALF_DEG * Math.PI) / 180);
    for (const pitchDeg of PITCHES_DEG) {
      const pitch = (pitchDeg * Math.PI) / 180;
      const dir = new THREE.Vector3(
        Math.cos(pitch) * Math.cos(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.sin(yaw),
      );
      raycaster.set(eye, dir);
      raycaster.far = Infinity;
      const hits = raycaster.intersectObjects(occluders, false);
      const plateDist = raycaster.ray.distanceToPlane(platePlane);
      const vegDist = hits.length > 0 ? hits[0].distance : Infinity;
      rays += 1;
      if (plateDist !== null && plateDist < vegDist) {
        plate += 1;
      } else {
        const tier = tierOf(hits[0]?.object ?? null);
        if (tier !== 'plate') occluded[tier] += 1;
        else plate += 1;
      }
    }
  }
  pooledRays += rays;
  pooledPlate += plate;
  for (const k of Object.keys(pooledOccluded)) pooledOccluded[k] += occluded[k];
  perFootprint.push({
    name: fp.name, x: fp.x, z: fp.z, aimX: centre.x, aimZ: centre.z,
    rays, plate, fraction: plate / rays, occluded,
  });
}

const pooled = pooledPlate / pooledRays;
const contactBuilt = contactMeshes.reduce((n, m) => n + m.count, 0);

console.log(`# ground-contact coverage — arena=${arena} eye=${eyeH}m sha=${headSha} mode=${noContact ? 'blade-only' : 'full'}`);
console.log(`# bladeHash=${bladeHash} bladeInstances=${bladeMeshes.reduce((n, m) => n + m.count, 0)} contactInstances=${contactBuilt} (thatch=${thatchMeshes.reduce((n, m) => n + m.count, 0)} litter=${litterMeshes.reduce((n, m) => n + m.count, 0)})`);
for (const fp of perFootprint) {
  console.log(
    `${fp.name} x=${fp.x.toFixed(2)} z=${fp.z.toFixed(2)} aim=(${fp.aimX.toFixed(1)},${fp.aimZ.toFixed(1)}) plate=${fp.plate}/${fp.rays} fraction=${fp.fraction.toFixed(3)} ` +
    `occluded={thatch:${fp.occluded.thatch},litter:${fp.occluded.litter},blades:${fp.occluded.blades}}`,
  );
}
console.log(`POOLED plate-visible fraction=${pooled.toFixed(4)} (${pooledPlate}/${pooledRays})`);
console.log(`POOLED occlusion share={thatch:${pooledOccluded.thatch},litter:${pooledOccluded.litter},blades:${pooledOccluded.blades}}`);
console.log(JSON.stringify({
  arena, eyeH, headSha, mode: noContact ? 'blade-only' : 'full', bladeHash, pooled, pooledRays, pooledPlate,
  pooledOccluded, contactBuilt,
  perFootprint: perFootprint.map((fp) => ({ name: fp.name, fraction: fp.fraction, occluded: fp.occluded })),
}));
