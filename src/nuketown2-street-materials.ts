/**
 * nuketown2-street-materials.ts — procedural TSL carriageway, kerbs, aprons and markings.
 *
 * Procedural Three.js WebGPU / TSL materials for Nuke Town Rebuild (nuketown2).
 * Strictly procedural: no imported textures, images, meshes or LUTs.
 * Built per open-world-city-art-loop (SKILL.md §4 & §6):
 *   1. Carriageway: aggregate speckle, cold-patch repairs with sharp edges,
 *      longitudinal tar seams, ridged crack network, and kerb-side channel staining.
 *   2. Kerbs: top face with chipped nose and grit; vertical face with water streaks.
 *   3. Aprons (driveways): scored concrete slab joints, tonal variance, tire tracks.
 *   4. Worn dashes: dirty warm-white lane markings with aggregate bite-through and wear.
 *   5. Distance falloff: high-frequency terms step down between 22 m and 46 m.
 */
import type { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fbm2, ridgedFbm2, valueNoise2 } from './map3/noise';
import { createNuketown2IndirectMaterial } from './rendering/lighting/indirect-term';

/** Cast boundary for TSL DSL runtime helpers */
const {
  abs,
  clamp,
  cameraPosition,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  positionWorld,
  smoothstep,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/** Distance falloff helper: fades fine terms out between 22 m and 46 m */
function cameraDetailFactor() {
  const dist = length(positionWorld.sub(cameraPosition));
  return smoothstep(float(46), float(22), dist);
}

/**
 * Carriageway asphalt material.
 * Street runs along X (x from -42 to +42); transverse is Z (z from -5.3 to +5.3).
 * Turning head opens at [-8, 8] in X and [-8, 8] in Z.
 */
export function createNuketown2AsphaltMaterial(): MeshStandardNodeMaterial {
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.96,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-asphalt-road';
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const p = positionWorld;
  const detail = cameraDetailFactor();

  // Aggregate: high-frequency chip in the asphalt surface
  const aggregate = fbm2(vec2(p.x.mul(8.0), p.z.mul(8.0)), 3)
    .sub(0.5)
    .mul(0.028)
    .mul(detail);

  // Cold-patch repairs: thresholded hard blobs so edges read as cut trenches
  const patchField = fbm2(vec2(p.x.mul(0.085).add(17.3), p.z.mul(0.085).add(41.1)), 3);
  const patch = smoothstep(float(0.545), float(0.575), patchField);

  // Tar seams: longitudinal joints and wandering cross-joints
  const wobble = fbm2(vec2(p.x.mul(0.5), p.z.mul(0.5)), 2).sub(0.5).mul(0.24);
  const seamLong = min(
    abs(p.z.add(wobble).sub(float(2.4))),
    abs(p.z.add(wobble).add(float(2.4))),
  );
  const seamCross = abs(fract(p.x.div(6.0).add(wobble.mul(0.05))).sub(0.5)).mul(6.0);
  const seam = max(
    smoothstep(float(0.075), float(0.012), seamLong),
    smoothstep(float(0.085), float(0.015), seamCross),
  );

  // Crack network: ridged fBM creates sharp knife-edge fissures
  const crack = smoothstep(
    float(0.925),
    float(0.992),
    ridgedFbm2(vec2(p.x.mul(3.0), p.z.mul(3.0)), 3),
  ).mul(detail);

  // Kerb-side channel staining: water, road grit, and tire grime accumulate near z = +/- 5.3
  const channel = smoothstep(float(4.3), float(5.3), abs(p.z)).mul(0.55);

  const baseAsphalt = vec3(0.065, 0.068, 0.072);
  mat.colorNode = baseAsphalt
    .add(aggregate)
    .sub(patch.mul(vec3(0.022, 0.022, 0.020)))
    .sub(seam.mul(vec3(0.038, 0.038, 0.040)))
    .sub(crack.mul(vec3(0.030, 0.030, 0.032)))
    .sub(channel.mul(vec3(0.018, 0.018, 0.016)));

  mat.roughnessNode = float(0.96)
    .sub(channel.mul(0.18))
    .sub(seam.mul(0.25))
    .sub(patch.mul(0.12));

  return mat;
}

/**
 * Worn centre-line road dashes.
 * Weathered dirty warm-white with aggregate bite-through and edge degradation.
 */
export function createNuketown2DashMaterial(): MeshStandardNodeMaterial {
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.88,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-trim-decal';
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;

  const p = positionWorld;
  const detail = cameraDetailFactor();

  // Paint wear pattern: irregular chipping where tires bite the aggregate
  const wear = clamp(
    fbm2(vec2(p.x.mul(2.2), p.z.mul(2.2)), 3).mul(2.1).sub(0.55),
    0,
    1,
  ).mul(
    clamp(
      fbm2(vec2(p.x.mul(8.0).add(5.1), p.z.mul(8.0).add(3.7)), 2).mul(1.8).sub(0.4),
      0,
      1,
    ),
  );

  const aggregate = fbm2(vec2(p.x.mul(8.0), p.z.mul(8.0)), 2).sub(0.5).mul(0.04).mul(detail);
  const dirtyPaint = vec3(0.64, 0.62, 0.56)
    .sub(fbm2(vec2(p.x.mul(6.0), p.z.mul(6.0)), 2).mul(0.10))
    .sub(aggregate.mul(2.0));
  const underlyingAsphalt = vec3(0.065, 0.068, 0.072);

  mat.colorNode = mix(underlyingAsphalt, dirtyPaint, wear);
  mat.roughnessNode = float(0.82).add(wear.mul(0.08));

  return mat;
}

/**
 * Kerb material with split top / face response:
 * chipped nose, concrete aggregate, vertical water streaks on vertical face.
 */
export function createNuketown2KerbMaterial(): MeshStandardNodeMaterial {
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.94,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-kerb';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const detail = cameraDetailFactor();

  const kerbGrit = fbm2(vec2(p.x.mul(6.0), p.z.mul(6.0)), 2).sub(0.5).mul(0.04);
  const streak = valueNoise2(vec2(p.x.mul(2.8), float(0))).mul(0.5).add(0.5);
  const faceStain = smoothstep(float(0.15), float(-0.02), p.y).mul(streak).mul(0.04);
  const chip = smoothstep(float(0.65), float(0.88), fbm2(vec2(p.x.mul(4.0), p.z.mul(4.0)), 2)).mul(detail);

  mat.colorNode = vec3(0.18, 0.176, 0.165)
    .add(kerbGrit)
    .sub(faceStain)
    .sub(chip.mul(vec3(0.025, 0.025, 0.023)));

  mat.roughnessNode = float(0.92).sub(chip.mul(0.08));

  return mat;
}

/**
 * Driveway apron material:
 * poured concrete slabs with joint lines, tonal variance between slabs, and oil/tire darkening.
 */
export function createNuketown2DriveMaterial(): MeshStandardNodeMaterial {
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.94,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-drive-decal';
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const p = positionWorld;
  const detail = cameraDetailFactor();

  const su = p.x.div(2.5);
  const sv = p.z.div(3.0);
  const joint = max(
    smoothstep(float(0.47), float(0.498), abs(fract(su).sub(0.5))),
    smoothstep(float(0.47), float(0.498), abs(fract(sv).sub(0.5))),
  );

  const slabTone = valueNoise2(vec2(floor(su), floor(sv)).add(vec2(0.5, 0.5)))
    .sub(0.5)
    .mul(0.025);
  const grit = fbm2(vec2(p.x.mul(5.0), p.z.mul(5.0)), 3)
    .sub(0.5)
    .mul(0.025)
    .mul(detail);

  // Tire track / driveway center darkening:
  // North driveway is centered near x = 6.75; south driveway is near x = -6.75
  const tireTrack = smoothstep(float(1.4), float(0.3), abs(abs(p.x).sub(float(6.75)))).mul(0.035);

  mat.colorNode = vec3(0.155, 0.152, 0.145)
    .add(slabTone)
    .add(grit)
    .sub(joint.mul(0.035))
    .sub(tireTrack);

  mat.roughnessNode = float(0.94).sub(tireTrack.mul(0.1));

  return mat;
}
