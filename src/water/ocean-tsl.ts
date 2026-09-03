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
  cameraPosition,
  color,
  cos,
  exp,
  dot,
  float,
  max,
  min,
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
import { WATER_TYPES, waterBodyId, type WaterBodyDefinition, type WaterOptics } from './water-authoring';

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
 * HF-420 physical water colour.
 *
 * A palette lerp between a "deep" and a "shallow" colour is not a water colour
 * model; it is a painted approximation of one, and it is why browser water
 * reads as plastic. Water colour is TRANSMISSION: light travels a path through
 * the medium, the medium removes wavelengths at different rates, and what is
 * left comes back to the eye. Beer-Lambert:
 *
 *   transmitted = incoming * exp(-sigma * pathLength)
 *
 * with sigma a per-channel extinction vector (see WATER_TYPES) and pathLength a
 * real distance through the water column, not a constant.
 *
 * WHERE OUR pathLength COMES FROM, stated plainly because it is a deviation.
 * The canonical form derives pathLength from scene depth behind the surface.
 * This surface is OPAQUE (depthWrite, no refraction), so there is no depth
 * texture to read without adding a pass, and the trial's budget is zero new
 * passes. Instead the column is derived from the body's own AUTHORED
 * bathymetry - the shore ramp for an ocean, the rectangle's shore band for a
 * pond - and then slanted by the view angle. It is a real per-pixel,
 * view-dependent path length, and it is what makes water at a shore read as
 * shallow; it is NOT a depth-buffer read, and nothing here should be quoted as
 * one. Refraction (which brings the depth read with it) is deliberately out of
 * scope for this pass.
 */
/**
 * Foam / breaking-energy gate. These are the EXISTING thresholds, lifted out of
 * the expression under names so the backscatter term can be proved to read the
 * same estimator as the foam. Values unchanged.
 */
export const OCEAN_FOAM_CREST_LOW = 0.88;
export const OCEAN_FOAM_CREST_HIGH = 1.28;
export const OCEAN_FOAM_SLOPE_LOW = 0.06;
export const OCEAN_FOAM_SLOPE_HIGH = 0.2;

/**
 * How much earlier in normalised crest height the bubble cloud starts than the
 * whitecap does. Bubbles outlive the crest that made them; this is the SPATIAL
 * proxy for that lag. It is NOT temporal persistence - a world-fixed decaying
 * foam field is step 3 of the physical stack and is out of scope for this pass.
 */
export const OCEAN_BACKSCATTER_DECAY = 0.34;

/** Minimum cosine used when slanting the path, so a grazing view stays finite. */
export const OCEAN_MIN_VIEW_COSINE = 0.18;

/** Optical path through the column: down to the floor and back out to the eye. */
export function oceanPathLength(columnDepth: number, viewCosine: number): number {
  const cosine = Math.max(OCEAN_MIN_VIEW_COSINE, Math.min(1, viewCosine));
  return columnDepth * (1 / cosine + 1);
}

/** Beer-Lambert transmission per channel over an optical path. */
export function oceanTransmission(
  optics: WaterOptics,
  pathLength: number,
): Readonly<{ r: number; g: number; b: number }> {
  return Object.freeze({
    r: Math.exp(-optics.extinction.r * pathLength),
    g: Math.exp(-optics.extinction.g * pathLength),
    b: Math.exp(-optics.extinction.b * pathLength),
  });
}

/** The optics a body renders with, or null when it keeps the palette lerp. */
export function oceanOpticsForBody(body: WaterBodyDefinition): WaterOptics | null {
  return body.waterType ? WATER_TYPES[body.waterType] : null;
}

/** Authored column depth (m) at open water for a body with optics. */
export function oceanColumnDepth(body: WaterBodyDefinition): number {
  const optics = oceanOpticsForBody(body);
  if (!optics) return 0;
  return body.opticalDepth ?? optics.defaultDepth;
}


/**
 * Broadband bubble backscatter density, mirroring the TSL graph.
 *
 * Entrained air scatters light almost spectrally FLAT. The green shift people
 * see in surf is not a property of the bubbles: it is the water's own
 * absorption acting on the light the bubbles returned. So this returns a single
 * SCALAR, and the colour comes from putting it upstream of the absorption
 * integral - see oceanScatteredRadiance.
 *
 * Density is driven by the SAME crest/slope estimator that drives foam (foam is
 * the bubbles that reached the surface, backscatter is the ones that did not),
 * so the two can never disagree, and it is EXACTLY zero below the foam slope
 * gate - a still pond is unaffected, bit for bit.
 */
export function oceanBackscatterDensity(
  normalizedCrest: number,
  slopeMagnitude: number,
  optics: WaterOptics | null,
): number {
  if (!optics) return 0;
  const turbulence = smoothstepScalar(OCEAN_FOAM_SLOPE_LOW, OCEAN_FOAM_SLOPE_HIGH, slopeMagnitude);
  if (turbulence === 0) return 0;
  const trail = smoothstepScalar(
    OCEAN_FOAM_CREST_LOW - OCEAN_BACKSCATTER_DECAY,
    OCEAN_FOAM_CREST_HIGH,
    normalizedCrest,
  );
  return trail * turbulence * optics.backscatter;
}

function smoothstepScalar(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The radiance leaving the surface: the flat bubble term added to the
 * water-leaving reference BEFORE the column absorbs it. Injecting it after
 * absorption instead is the classic failure - the hue shift cannot happen, and
 * the water goes grey and washed out rather than bright and green.
 */
export function oceanScatteredRadiance(
  base: Readonly<{ r: number; g: number; b: number }>,
  density: number,
  optics: WaterOptics,
  pathLength: number,
): Readonly<{ r: number; g: number; b: number }> {
  const transmission = oceanTransmission(optics, pathLength);
  // Decoded through THREE.Color so this mirror carries the SAME numbers as the
  // vec3 uniform the graph uploads: the authored hex is sRGB and three converts
  // it into the renderer's working space. A mirror that skipped that step would
  // quietly disagree with the shader it claims to mirror.
  const decoded = new THREE.Color(optics.scatter);
  const deep = { r: decoded.r, g: decoded.g, b: decoded.b };
  const floor = {
    r: Math.min(1, base.r + density),
    g: Math.min(1, base.g + density),
    b: Math.min(1, base.b + density),
  };
  // L = L_floor * T + L_scatter * (1 - T).
  return Object.freeze({
    r: floor.r * transmission.r + deep.r * (1 - transmission.r),
    g: floor.g * transmission.g + deep.g * (1 - transmission.g),
    b: floor.b * transmission.b + deep.b * (1 - transmission.b),
  });
}

/** The asymptotic colour of a water type: what an optically deep column shows. */
export function oceanDeepScatterColor(optics: WaterOptics): Readonly<{ r: number; g: number; b: number }> {
  const decoded = new THREE.Color(optics.scatter);
  return Object.freeze({ r: decoded.r, g: decoded.g, b: decoded.b });
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
  const turbulence = smoothstep(float(OCEAN_FOAM_SLOPE_LOW), float(OCEAN_FOAM_SLOPE_HIGH), slope);
  const crestFoam = smoothstep(float(OCEAN_FOAM_CREST_LOW), float(OCEAN_FOAM_CREST_HIGH), normalizedCrest)
    .mul(turbulence);
  const shimmer = sin(positionWorld.x.mul(0.071)
    .add(positionWorld.z.mul(0.093))
    .add(animationTime.mul(0.45))).mul(0.5).add(0.5);
  const foamBreakup = smoothstep(float(0.58), float(0.92), shimmer);
  const authoredFoam = crestFoam.mul(foamBreakup);
  const paletteWater = mix(color(body.palette.deep), color(body.palette.shallow), shimmer.mul(0.22).add(slope.mul(1.35)).min(1));

  // --- HF-420 Beer-Lambert colour -----------------------------------------
  // One graph for every body. A body with no authored waterType sets
  // useExtinction to 0 and comes out byte-identical to the palette lerp above,
  // so the physical model reverts per body by deleting one authored field and
  // the pipeline count is unchanged (uniforms, never a new graph shape).
  const optics = oceanOpticsForBody(body);
  const useExtinction = uniform(optics ? 1 : 0);
  const extinction = uniform(new THREE.Vector3(
    optics?.extinction.r ?? 0,
    optics?.extinction.g ?? 0,
    optics?.extinction.b ?? 0,
  ));
  const columnDepth = uniform(oceanColumnDepth(body));
  // Authored bathymetry, two shapes, selected by a uniform so the graph is one
  // shape: an ocean ramps from its shoreline out to open water in Chebyshev
  // distance from the arena origin; a pond ramps inward from its own rectangle
  // edge over its shore band.
  const shapedMask = uniform(shape ? 1 : 0);
  const shoreInner = uniform(body.shore.innerRadius);
  const shoreOuter = uniform(Math.max(body.shore.outerRadius, body.shore.innerRadius + 0.001));
  const shapeCenter = uniform(new THREE.Vector2(shape?.centerX ?? 0, shape?.centerZ ?? 0));
  const shapeHalf = uniform(new THREE.Vector2(sizeX / 2, sizeZ / 2));
  const shoreBand = uniform(Math.max(shape?.shoreBand ?? 1, 0.001));
  const chebyshev = max(abs(positionWorld.x), abs(positionWorld.z));
  const openDepthFactor = smoothstep(shoreInner, shoreOuter, chebyshev);
  const edgeDistance = min(
    shapeHalf.x.sub(abs(positionWorld.x.sub(shapeCenter.x))),
    shapeHalf.y.sub(abs(positionWorld.z.sub(shapeCenter.y))),
  );
  const shapedDepthFactor = smoothstep(float(0), shoreBand, edgeDistance);
  const waterDepth = columnDepth.mul(mix(openDepthFactor, shapedDepthFactor, shapedMask));
  // Slant the column by the view angle: light goes down to the floor and back
  // out to the eye, so a grazing look crosses far more water than a look
  // straight down. Clamped so a horizon-grazing ray stays finite.
  const viewDirection = cameraPosition.sub(positionWorld).normalize();
  const viewCosine = dot(oceanNormalLocal, viewDirection).max(float(OCEAN_MIN_VIEW_COSINE));
  const pathLength = waterDepth.mul(float(1).div(viewCosine).add(1));
  const transmission = exp(extinction.mul(pathLength).negate());
  // The authored `shallow` colour is reused as the water-leaving reference
  // radiance (bottom plus in-water scattering) that the column then absorbs;
  // it is <= 1 per channel and transmission is <= 1, so the bloom-threshold
  // contract above is preserved by construction.
  // --- HF-420 broadband bubble backscatter ---------------------------------
  // Injected UPSTREAM of the absorption integral, as a spectrally flat scalar.
  // Adding it downstream (a white tint on the finished colour) is the classic
  // failure: absorption never acts on the scattered light, the hue shift cannot
  // happen, and the water goes grey instead of green.
  //
  // Density reads the SAME crest/slope estimator as the foam above - foam is the
  // bubbles that reached the surface, backscatter is the ones that did not - so
  // the two cannot disagree, and `turbulence` is exactly zero below the foam
  // slope gate, which makes a still pond bit-identical to the pre-backscatter
  // build.
  const backscatterStrength = uniform(optics?.backscatter ?? 0);
  const bubbleTrail = smoothstep(
    float(OCEAN_FOAM_CREST_LOW - OCEAN_BACKSCATTER_DECAY),
    float(OCEAN_FOAM_CREST_HIGH),
    normalizedCrest,
  );
  const bubbleDensity = bubbleTrail.mul(turbulence).mul(backscatterStrength);
  const scatteredRadiance = color(body.palette.shallow).add(bubbleDensity).clamp(0, 1);
  // Single-scattering closure: L = L_floor * T + L_scatter * (1 - T). Without
  // the second term absorption alone drives deep water to black, because
  // exp(-sigma * path) goes to zero and nothing else is in the integral. Real
  // deep water is the light backscattered out of the upper column, which is
  // what `scatter` is. The blend weight is the MEASURED transmission - not a
  // view angle and not a wave slope, which is the whole difference between this
  // and the palette lerp it replaced.
  const deepScatterColor = new THREE.Color(optics?.scatter ?? 0);
  const deepScatter = uniform(new THREE.Vector3(deepScatterColor.r, deepScatterColor.g, deepScatterColor.b));
  // L = L_floor * T + L_scatter * (1 - T), written out rather than as mix():
  // the blend weight is a per-CHANNEL transmission vector and mix()'s typed
  // overloads only accept a scalar weight.
  const physicalWater = scatteredRadiance.mul(transmission)
    .add(deepScatter.mul(transmission.oneMinus()));
  const darkWater = mix(paletteWater, physicalWater, useExtinction);
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
  water.userData.waterType = body.waterType ?? null;
  water.userData.waterExtinction = optics ? [optics.extinction.r, optics.extinction.g, optics.extinction.b] : null;
  water.userData.waterColumnDepth = oceanColumnDepth(body);
  water.userData.waterBackscatter = optics?.backscatter ?? 0;
  water.userData.waterScatterColor = optics?.scatter ?? null;
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
