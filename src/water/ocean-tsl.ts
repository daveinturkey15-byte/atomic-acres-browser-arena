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
  abs,
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
import { waterBodyId, type WaterBodyDefinition } from './water-authoring';

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
 * Stage-1 PBR material constants (graphics register: MATERIAL RESPONSE only —
 * positionNode and OCEAN_BANDS math are untouched; buoyancy parity HF-358).
 */
/** Roughness for flat water: tight GGX lobe so directional light yields real sun/moon glints. */
export const OCEAN_ROUGHNESS_FLAT = 0.15;
/** Roughness ceiling at maximum wave slope: broad, never mirror-sharp (bloom safety). */
export const OCEAN_ROUGHNESS_ROUGH = 0.62;
/** Slope magnitude treated as "fully rough" when mapping wave slope -> roughness. */
export const OCEAN_SLOPE_FULL_ROUGHNESS = 1.2;
/**
 * Albedo share of the authored look moved out of emissive so directional
 * lights shape the surface. Emissive keeps the authored deep-water glow
 * (night arenas must not go black). ALBEDO + EMISSIVE <= 1 keeps every
 * authored term strictly below the grade-chain bloom threshold (> 1.0 linear,
 * lowest profile 1.08) reserved for TRUE emitters.
 */
export const OCEAN_ALBEDO_SCALE = 0.62;
export const OCEAN_EMISSIVE_SCALE = 0.38;

/**
 * Slope-modulated roughness (stage-1 PBR): steeper local Gerstner slope means
 * rougher micro-facets, i.e. broader glints on choppy crests and tight glossy
 * reflections on calm water. Uses the analytic normals already computed from
 * the SAME frozen band table the CPU buoyancy sampler reads.
 */
export function oceanRoughnessFromSlope(slopeMagnitude: number): number {
  const t = Math.min(1, Math.max(0, slopeMagnitude / OCEAN_SLOPE_FULL_ROUGHNESS));
  return OCEAN_ROUGHNESS_FLAT + (OCEAN_ROUGHNESS_ROUGH - OCEAN_ROUGHNESS_FLAT) * t;
}

/**
 * Builds the WebGPU water mesh for one authored body. The caller owns
 * visibility scheduling; the mesh starts visible (bodies only exist where
 * water is authored).
 */
export function createOceanTslWater(
  body: WaterBodyDefinition,
  options?: { amplitude?: number; pipelineId?: string; name?: string },
): OceanTslWater {
  // HF-420: a pool or pond is the SAME module with different data. `shape`
  // makes the surface a finite, centred rectangle instead of the historical
  // square near plane at the arena origin; nothing about the shader graph
  // changes, so every body still compiles into one shared water pipeline.
  const shape = body.shape ?? null;
  const sizeX = shape ? shape.sizeX : body.nearSize;
  const sizeZ = shape ? shape.sizeZ : body.nearSize;
  // Dense cells retain curvature in the shortest band (water-quality rule);
  // the historical 256-segment near plane comfortably exceeds the minimum.
  // A pond is metres across, not hundreds: tessellating it to 256 would spend
  // 131k triangles on a surface whose longest displaced wavelength dwarfs it.
  const segmentsX = shape
    ? Math.max(8, minimumSurfaceSegments(sizeX, 22))
    : Math.max(256, minimumSurfaceSegments(body.nearSize, 22));
  const segmentsZ = shape
    ? Math.max(8, minimumSurfaceSegments(sizeZ, 22))
    : segmentsX;
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(shape ? shape.centerX : 0, body.level, shape ? shape.centerZ : 0);
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
  // Slope-modulated roughness (stage-1 PBR): steeper local Gerstner slope ->
  // rougher micro-facets -> broader glints; calm water stays glossy at
  // OCEAN_ROUGHNESS_FLAT. Mirrors oceanRoughnessFromSlope() on the TSL graph.
  const roughnessFromSlope = float(OCEAN_ROUGHNESS_FLAT).add(
    float(OCEAN_ROUGHNESS_ROUGH).sub(OCEAN_ROUGHNESS_FLAT).mul(
      slope.div(OCEAN_SLOPE_FULL_ROUGHNESS).clamp(0, 1),
    ),
  );
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
  // HF-37x stage-1 PBR response (graphics register: material response only —
  // positionNode above stays the frozen sampleOcean transcription).
  //
  // Roughness is SLOPE-MODULATED using the analytic Gerstner normals already
  // computed above: a steeper local slope means micro-facet spread, so glints
  // broaden instead of sharpening into aliasing sparkles. Flat water keeps a
  // tight, glossy 0.15 roughness so directional sun/moon light produces real
  // specular response; steep choppy slopes open up toward 0.62.
  material.roughnessNode = roughnessFromSlope;
  material.metalnessNode = float(0);
  // The authored look moves OUT of emissive-only into albedo so directional
  // lights shape the surface (previously colorNode was near-black and the whole
  // look lived in emissiveNode with zero specular response). A REDUCED
  // emissive term (OCEAN_EMISSIVE_SCALE) retains the authored deep-water glow
  // so night arenas (rustworks) do not go black under the grade chain.
  //
  // Bloom-threshold contract (HF-362, grade-profile.ts): profile thresholds
  // are 1.08..1.15 linear and fail-closed asserted > 1.0. Every
  // material-authored term is bounded: palette channels are <= 1 by
  // construction, keyFacing <= 1, and the mix/smoothstep chains are convex
  // combinations, so authoredWater <= 1. With OCEAN_ALBEDO_SCALE + 
  // OCEAN_EMISSIVE_SCALE <= 1, the summed static terms stay <= 1.0 linear,
  // strictly below the lowest profile threshold 1.08. Specular cannot bridge
  // the gap because roughness floors at OCEAN_ROUGHNESS_FLAT = 0.15 (no
  // mirror-sharp delta lobe) — true emitters above 1.0 remain reserved.
  material.colorNode = authoredWater.mul(OCEAN_ALBEDO_SCALE);
  material.emissiveNode = authoredWater.mul(OCEAN_EMISSIVE_SCALE);
  const dryFootprintMask = uniform(body.dryFootprintMask === 'rectangular' ? 1 : 0);
  const islandHalf = uniform(new THREE.Vector2(body.island.halfX + 0.8, body.island.halfZ + 0.8));
  const normalizedDryFootprint = max(
    abs(positionWorld.x).div(islandHalf.x),
    abs(positionWorld.z).div(islandHalf.y),
  );
  const outsideDryFootprint = smoothstep(float(0.965), float(0.975), normalizedDryFootprint);
  material.opacityNode = mix(float(1), outsideDryFootprint, dryFootprintMask);
  material.alphaTestNode = float(0.5);
  if (options?.pipelineId) material.userData.tslPipelineId = options.pipelineId;

  const water = new THREE.Mesh(geometry, material);
  water.name = options?.name
    ?? (shape ? `Pass 64 TSL water pool ${waterBodyId(body)}` : 'Pass 64 TSL perimeter water');
  water.visible = true;
  water.receiveShadow = true;
  water.renderOrder = -5;
  water.frustumCulled = false;
  water.userData.animationTimeUniform = animationTime;
  water.userData.waveAmplitudeUniform = waveAmplitude;
  water.userData.dryFootprintMaskUniform = dryFootprintMask;
  water.userData.islandHalfUniform = islandHalf;
  water.userData.waveBands = OCEAN_BANDS.length;
  water.userData.waveAmplitude = waveAmplitude.value;
  water.userData.waveAuthority = OCEAN_SPECTRUM_AUTHORITY_ID;
  water.userData.waveNormalAuthority = OCEAN_SPECTRUM_AUTHORITY_ID;
  water.userData.oceanSpectrumFingerprint = oceanSpectrumFingerprint();
  water.userData.surfaceSegments = segmentsX;
  water.userData.surfaceSegmentsZ = segmentsZ;
  water.userData.waterBodyId = waterBodyId(body);
  water.userData.waterShape = shape;
  water.userData.totalSteepness = OCEAN_TOTAL_STEEPNESS;
  water.userData.waterBody = body;
  water.userData.swimmable = body.swimmable;
  water.userData.waterLevel = body.level;
  water.userData.nearSize = body.nearSize;
  water.userData.presentationOwner = body.presentationOwner;
  water.userData.dryFootprintMask = body.dryFootprintMask;

  // Curved low-cost skirt carrying the sea past the dense displaced square
  // (prevents the plane edge reading as a flat stripe at player eye height).
  // A pond authors `horizonRadius: 0`: there is no horizon to carry, and a
  // 3.2 km ring under a 3 m basin would draw through the entire arena.
  if (body.horizonRadius <= 0) {
    return Object.freeze({
      mesh: water,
      waveAmplitudeUniform: waveAmplitude,
      animationTimeUniform: animationTime,
    });
  }
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
