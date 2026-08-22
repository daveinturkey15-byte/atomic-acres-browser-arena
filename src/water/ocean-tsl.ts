/**
 * ocean-tsl.ts — WebGPU/TSL ocean presentation factory.
 *
 * HF-358: this is the missing presentation half of the shared ocean. It builds
 * the Pass64 WebGPU water surface from water-authoring.ts's per-arena
 * WaterBodyDefinition and displaces/normal-shades it with the ONE frozen
 * Gerstner band table from ocean-spectrum.ts — the exact table the CPU
 * buoyancy sampler (sampleOcean) reads, proven by oceanSpectrumFingerprint()
 * stamped into mesh.userData.
 *
 * Authority notes:
 * - Vertical displacement is a literal transcription of sampleOcean()'s
 *   summed sin phase field, so GPU-visible crests and CPU buoyancy describe
 *   one sea. Horizontal Gerstner chop is PRESENTATION-ONLY at
 *   OCEAN_CHOP_PRESENTATION_GAIN (never fed back into gameplay sampling).
 * - No gameplay decisions happen here: this module is renderer-side only and
 *   never mutates the body definition.
 */

import * as THREE from 'three';
import {
  DoubleSide,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import {
  color,
  cos,
  dot,
  float,
  max,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import {
  OCEAN_BANDS,
  OCEAN_CHOP_PRESENTATION_GAIN,
  OCEAN_REFERENCE_AMPLITUDE,
  OCEAN_STEEPNESS_GAIN,
  OCEAN_TOTAL_STEEPNESS,
  OCEAN_SPECTRUM_AUTHORITY_ID,
  oceanSpectrumFingerprint,
} from './ocean-spectrum';
import { minimumSurfaceSegments } from './water-quality';
import type { WaterBodyDefinition } from './water-authoring';

export type OceanTslWater = Readonly<{
  mesh: THREE.Mesh;
  /** Live amplitude uniform (presentation gain only; never changes sea state semantics). */
  waveAmplitudeUniform: { value: number };
  animationTimeUniform: { value: number };
}>;

/** Presentation-only amplitude authored for a body: reference amplitude times the host-authoritative scale. */
export function oceanAmplitudeForBody(body: WaterBodyDefinition): number {
  return OCEAN_REFERENCE_AMPLITUDE * body.amplitudeScale;
}

/**
 * Builds the WebGPU water mesh for one authored body. The caller owns
 * visibility scheduling; the mesh starts visible (bodies only exist where
 * water is authored).
 */
export function createOceanTslWater(
  body: WaterBodyDefinition,
  options?: { amplitude?: number; pipelineId?: string },
): OceanTslWater {
  // Dense cells retain curvature in the shortest band (water-quality rule);
  // the historical 256-segment near plane comfortably exceeds the minimum.
  const segments = Math.max(256, minimumSurfaceSegments(body.nearSize, 22));
  const geometry = new THREE.PlaneGeometry(body.nearSize, body.nearSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, body.level, 0);
  const material = new MeshStandardNodeMaterial({
    transparent: false,
    opacity: 1,
    depthWrite: true,
    roughness: 1,
    metalness: 0,
    side: DoubleSide,
  });
  const animationTime = uniform(0);
  const waveAmplitude = uniform(options?.amplitude ?? oceanAmplitudeForBody(body));

  // One frozen band table: identical constants to ocean-spectrum.sampleOcean().
  // HF-358 parity contract — CPU buoyancy and this displacement MUST agree.
  const samples = OCEAN_BANDS.map((band) => {
    const phase = positionLocal.x.mul(band.directionX * band.waveNumber)
      .add(positionLocal.z.mul(band.directionZ * band.waveNumber))
      .sub(animationTime.mul(band.angularFrequency))
      .add(band.phase);
    const scaledAmplitude = waveAmplitude.mul(band.weight);
    const phaseCos = cos(phase).mul(scaledAmplitude);
    return {
      height: sin(phase).mul(scaledAmplitude),
      slopeX: phaseCos.mul(float(band.waveNumber * band.directionX)),
      slopeZ: phaseCos.mul(float(band.waveNumber * band.directionZ)),
      // Presentation-only lateral chop (vertical field above stays authoritative).
      chopX: phaseCos.mul(float((OCEAN_CHOP_PRESENTATION_GAIN / OCEAN_STEEPNESS_GAIN) * band.steepness * band.directionX)),
      chopZ: phaseCos.mul(float((OCEAN_CHOP_PRESENTATION_GAIN / OCEAN_STEEPNESS_GAIN) * band.steepness * band.directionZ)),
    };
  });
  let height = samples[0].height;
  let slopeX = samples[0].slopeX;
  let slopeZ = samples[0].slopeZ;
  let chopX = samples[0].chopX;
  let chopZ = samples[0].chopZ;
  for (let index = 1; index < samples.length; index += 1) {
    height = height.add(samples[index].height);
    slopeX = slopeX.add(samples[index].slopeX);
    slopeZ = slopeZ.add(samples[index].slopeZ);
    chopX = chopX.add(samples[index].chopX);
    chopZ = chopZ.add(samples[index].chopZ);
  }
  material.positionNode = positionLocal.add(vec3(chopX.negate(), height, chopZ.negate()));
  // Analytic derivatives of the SAME vertical field the CPU sampler integrates,
  // so lighting/specular, visible displacement and buoyancy describe one sea.
  const oceanNormalLocal = vec3(slopeX.negate(), 1, slopeZ.negate()).normalize();
  material.normalNode = transformNormalToView(oceanNormalLocal);
  const slope = vec2(slopeX, slopeZ).length();
  const normalizedCrest = height.div(max(waveAmplitude, float(0.001))).mul(0.5).add(0.5);
  const crestFoam = smoothstep(float(0.88), float(1.28), normalizedCrest)
    .mul(smoothstep(float(0.06), float(0.2), slope));
  const shimmer = sin(positionWorld.x.mul(0.071)
    .add(positionWorld.z.mul(0.093))
    .add(animationTime.mul(0.45))).mul(0.5).add(0.5);
  const foamBreakup = smoothstep(float(0.58), float(0.92), shimmer);
  const authoredFoam = crestFoam.mul(foamBreakup);
  const darkWater = mix(color(body.palette.deep), color(body.palette.shallow), shimmer.mul(0.22).add(slope.mul(1.35)).min(1));
  const keyLight = body.night
    ? vec3(0.25, 0.85, 0.35).normalize()
    : vec3(0.45, 0.72, -0.22).normalize();
  const keyFacing = dot(oceanNormalLocal, keyLight).max(0).mul(0.44).add(0.56);
  const authoredWater = mix(darkWater, color(body.palette.foam), authoredFoam.mul(0.68)).mul(keyFacing);
  // Bounded emissive presentation keeps the analytic-normal readability without
  // letting key lights bloom into a white bar (pre-HF-358 behaviour retained).
  material.colorNode = color(0x010407);
  material.roughnessNode = float(1);
  material.metalnessNode = float(0);
  material.emissiveNode = authoredWater.mul(0.58);
  if (options?.pipelineId) material.userData.tslPipelineId = options.pipelineId;

  const water = new THREE.Mesh(geometry, material);
  water.name = 'Pass 64 TSL perimeter water';
  water.visible = true;
  water.receiveShadow = true;
  water.renderOrder = -5;
  water.frustumCulled = false;
  water.userData.animationTimeUniform = animationTime;
  water.userData.waveAmplitudeUniform = waveAmplitude;
  water.userData.waveBands = OCEAN_BANDS.length;
  water.userData.waveAmplitude = waveAmplitude.value;
  water.userData.waveAuthority = OCEAN_SPECTRUM_AUTHORITY_ID;
  water.userData.waveNormalAuthority = OCEAN_SPECTRUM_AUTHORITY_ID;
  water.userData.oceanSpectrumFingerprint = oceanSpectrumFingerprint();
  water.userData.surfaceSegments = segments;
  water.userData.totalSteepness = OCEAN_TOTAL_STEEPNESS;
  water.userData.waterBody = body;
  water.userData.swimmable = body.swimmable;

  // Curved low-cost skirt carrying the sea past the dense displaced square
  // (prevents the plane edge reading as a flat stripe at player eye height).
  const horizonRadius = body.horizonRadius;
  const horizonInnerRadius = 0.1;
  const horizonGeometry = new THREE.RingGeometry(horizonInnerRadius, horizonRadius, 192, 24);
  horizonGeometry.rotateX(-Math.PI / 2);
  const horizonPositions = horizonGeometry.getAttribute('position') as THREE.BufferAttribute;
  const curvatureDrop = Math.max(24, body.nearSize * 0.09375);
  const curvatureStart = body.nearSize * 0.4375;
  for (let index = 0; index < horizonPositions.count; index += 1) {
    const x = horizonPositions.getX(index);
    const z = horizonPositions.getZ(index);
    const radius = Math.hypot(x, z);
    const progress = THREE.MathUtils.clamp(
      (radius - curvatureStart) / (horizonRadius - curvatureStart),
      0,
      1,
    );
    horizonPositions.setY(index, body.level - 4 - Math.pow(progress, 1.7) * curvatureDrop);
  }
  horizonPositions.needsUpdate = true;
  horizonGeometry.computeVertexNormals();
  const horizonMaterial = new THREE.MeshBasicMaterial({
    color: body.palette.deep,
    side: THREE.DoubleSide,
    depthWrite: true,
    fog: false,
    toneMapped: true,
  });
  const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
  // Rustworks keeps its historical horizon mesh name (regression guard);
  // other bodies use the generic registry-driven name.
  horizon.name = body.arenaId === 'rustworks-1v1'
    ? 'Pass 66 curved RustRig ocean horizon'
    : 'Pass 66 curved ocean horizon';
  horizon.renderOrder = -6;
  horizon.frustumCulled = false;
  horizon.userData.horizonRadius = horizonRadius;
  horizon.userData.radialSegments = 24;
  horizon.userData.curvatureDrop = curvatureDrop;
  water.add(horizon);
  return Object.freeze({
    mesh: water,
    waveAmplitudeUniform: waveAmplitude,
    animationTimeUniform: animationTime,
  });
}
