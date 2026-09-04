/**
 * nuketown2-materials/wear.ts — the three-scale wear engine, driven by a spec.
 *
 * ONE implementation, shared by all eight families, so "wear at three scales"
 * is a property of the library rather than a thing each generator remembers to
 * do. Every number it uses comes out of the `Nuketown2MaterialSpec` it is
 * handed; it has no constants of its own except the distance falloffs, which
 * are a sampling decision rather than an authoring one.
 *
 * DISTANCE FALLOFF IS NOT OPTIONAL. A 1 mm grain is far below one pixel at any
 * range a player actually stands, and left live it aliases into a crawling
 * shimmer that reads worse than no grain at all. Each scale therefore fades
 * out over roughly the range at which its features stop covering a pixel:
 * grain by 3 m, scuffs by 18 m, traffic never (it is metres wide and is the
 * term that stops a 40 m road reading as one flat value).
 *
 * NO PER-FRAME ALLOCATIONS. Everything here builds node expressions once, at
 * material construction. Nothing in this file runs per frame on the CPU.
 */
import * as TSL from 'three/tsl';
import {
  NOISE_LUT_CELLS,
  generateNoiseLutData,
  gradientLutRms,
  lutFbm,
  lutGradient,
  lutSample,
  noiseLutChannelMeans,
  noiseLutChannelSigmas,
} from './noise-lut';
import {
  MAX_ALBEDO_DARKENING,
  MAX_NORMAL_DEGREES,
  type Nuketown2MaterialSpec,
  assertSpec,
  readDistance,
  scaleResolvable,
  variationOf,
} from './spec';
import { createNuketown2Uniforms, type Nuketown2Uniforms } from './material-uniforms';

/** One cast boundary for the TSL DSL, the idiom the rest of this repo's node materials use. */
const {
  abs,
  cameraPosition,
  clamp,
  cross,
  float,
  length,
  max,
  mix,
  normalLocal,
  positionWorld,
  sin,
  smoothstep,
  transformNormalToView,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/**
 * Fade a term out between `nearM` (full strength) and `farM` (gone).
 * Cheap, and it is what keeps the millimetre scales from aliasing.
 */
export function detailFalloff(nearM: number, farM: number): any {
  const dist = length(positionWorld.sub(cameraPosition));
  return smoothstep(float(farM), float(nearM), dist);
}

/**
 * Lattice cells per noise tile.
 *
 * THE BUG THIS EXISTS FOR, and it is not a micro-optimisation. A 0.9 mm grain
 * authored across this arena's 220 m ground slab means noise coordinates up to
 * 1.2e5. float32 resolves about 0.008 at that magnitude, so a per-fragment
 * `fract` quantised to a couple of hundred steps and the grain stopped being
 * grain; worse, the value hash then evaluated `sin` of an argument around 5e7,
 * and a transcendental that far out of range is both meaningless and, on this
 * driver, catastrophically slow - measured as a 12-second first-submission
 * stall that failed the arena boot smoke outright.
 *
 * Wrapping the coordinate into a tile of a fixed number of lattice cells is
 * what a real texture generator does anyway: you author a 0.25 m grain tile and
 * repeat it. The tile is now a real texture (noise-lut.ts, HF-491): the sampler
 * wraps the coordinate, so no shader arithmetic ever sees the large value, and
 * the period is the LUT's own integer cell count.
 */
export const NOISE_TILE_CELLS = NOISE_LUT_CELLS;

/**
 * Signed [-1, 1] fBm of a 2D surface coordinate at a given feature size in
 * metres, evaluated on a tile of `NOISE_TILE_CELLS` features.
 *
 * ONE texture fetch from the shared noise LUT, whatever the octave count
 * (HF-491: the per-fragment lattice hash on fifty materials was the largest
 * single frame-cost delta the bisect found). The tile spans
 * `featureSizeM * NOISE_TILE_CELLS`: 6.4 cm for a 1 mm grain, 3.8 m for a
 * 60 mm scuff, 154 m for a 2.4 m traffic gradient - larger than the map, so
 * the term that carries the big shapes never repeats in view.
 */
export function signedNoise(uv: any, featureSizeM: number, octaves: 1 | 2 | 3 = 2): any {
  const frequency = typeof featureSizeM === 'number' ? float(1 / featureSizeM) : featureSizeM;
  return lutFbm(uv.mul(frequency), octaves).sub(float(0.5)).mul(float(2));
}

/**
 * A ZERO-MEAN signed field from one channel of the shared tile.
 *
 * `(sample - measured mean) / (2 * measured sigma)`, clamped to [-1, 1].
 *
 * Both halves of that are the point. Subtracting the MEASURED mean - not the
 * assumed 0.5 - is what makes the arena's authored base colours survive as the
 * mean of the surface: HF-477 pinned those hexes, and a field whose mean is
 * 0.503 instead of 0.500 walks every surface a third of a per cent off its pin
 * for nothing. Dividing by two sigma rather than by the half-range is what
 * makes the authored per cent a real per cent: three octaves of value noise
 * almost never reach its extremes, so half-range normalisation would ship a
 * "6 % macro swing" that shows about 2 % across most of a wall - which is
 * HF-486's finding restated rather than fixed.
 */
function centred(sample: any, channel: 0 | 1 | 2 | 3): any {
  const mean = noiseLutChannelMeans()[channel]!;
  const sigma = noiseLutChannelSigmas()[channel]!;
  const raw = channel === 0 ? sample.r : channel === 1 ? sample.g : channel === 2 ? sample.b : sample.a;
  return clamp(raw.sub(float(mean)).mul(float(1 / (2 * sigma))), float(-1), float(1));
}

/**
 * The two combat-distance scales, the tint they carry, and the normal they
 * perturb (HF-503, pass 96).
 *
 * COST. Two extra texture fetches on the shared tile, and one on the gradient
 * tile for the families that ask for a normal. No extra pipeline: every knob
 * is a uniform on the graph the family already shares, so the registry stays
 * at eight graphs and the arena stays under its measured ceiling.
 *
 * The macro luminance and the tint field come off ONE fetch - `.b` is the
 * three-octave fBm, `.a` is the ridged field, and the two look nothing like
 * each other, which is exactly what is wanted: a hue that drifts with the
 * luminance reads as a stain, and a hue that drifts independently reads as
 * paint mixed on a different day.
 */
export interface VariationNodes {
  /** Hue-stable luminance multiplier about 1. */
  readonly luminance: any;
  /** Luminance-preserving warm/cool multiplier about vec3(1). */
  readonly tint: any;
  /** Signed macro field, exposed so a family can reuse it instead of inventing a second. */
  readonly macro: any;
  /** Signed micro field. */
  readonly micro: any;
  /** Roughness offset, before the family adds its own. */
  readonly roughness: any;
}

/**
 * MICRO FALLOFF. A 0.05-0.20 m feature subtends 9.7 px at 20 m and 3.2 px at
 * 60 m on this arena's camera, so inside the map it never needs to fade. The
 * pair below exists only so the term does not alias on the 220 m backdrop
 * slab, whose far edge is past anything else in the scene.
 */
const MICRO_FALLOFF_NEAR_M = 55;
const MICRO_FALLOFF_FAR_M = 110;

export function buildVariation(uniforms: Nuketown2Uniforms, uv: any): VariationNodes {
  const macroSample = lutSample(uv.mul(uniforms.macroFrequency));
  const macro = centred(macroSample, 2);
  const hue = centred(macroSample, 3);
  const micro = centred(lutSample(uv.mul(uniforms.microFrequency)), 0)
    .mul(smoothstep(float(MICRO_FALLOFF_FAR_M), float(MICRO_FALLOFF_NEAR_M), length(positionWorld.sub(cameraPosition))));

  const luminance = float(1)
    .add(macro.mul(uniforms.macroAlbedo))
    .add(micro.mul(uniforms.microAlbedo));

  // LUMINANCE-PRESERVING warm/cool. Rec. 709 weights R at 0.2126 and B at
  // 0.0722, so moving them by +t and -t moves luminance by 0.14t; the green
  // channel takes that back. At the 0.04 tint ceiling the residual is 0.06 %,
  // an order below the 1 % the mean-preservation gate allows, and it is
  // ZERO-MEAN anyway because the field it rides on is.
  const t = hue.mul(uniforms.tintSpread);
  const tint = vec3(float(1).add(t), float(1).sub(t.mul(float(0.14))), float(1).sub(t));

  const roughness = macro.mul(uniforms.macroRoughness).add(micro.mul(uniforms.microRoughness));

  return { luminance, tint, macro, micro, roughness };
}

/**
 * A shading normal perturbed by the gradient tile - bounded so silhouettes
 * stay flat.
 *
 * SILHOUETTES STAY FLAT BY CONSTRUCTION: nothing here moves a vertex, and the
 * tilt is clamped to `MAX_NORMAL_DEGREES` before it reaches the frame. What it
 * does move is the specular lobe and the ambient-occlusion response, which is
 * the HF-486 gap - GTAO and SSR modulate a surface, and a surface whose normal
 * is constant has nothing for them to modulate.
 *
 * SPACE, and this is the trap `farcrysis-water-surface.ts` documents at
 * length. `NodeMaterial.setupNormal()` consumes `normalNode` as VIEW space
 * with no transform, so a world-space or tangent-space vector handed to it
 * tumbles as the player pitches. The frame is therefore built in LOCAL space
 * off `normalLocal` - the one basis that is both available inside the normal
 * sub-build and view-independent - and converted once by
 * `transformNormalToView`. A local frame is also why a handedness error here
 * could only ever be a static, spatially-correlated tilt: it cannot tumble.
 */
export function buildDetailNormal(uniforms: Nuketown2Uniforms, uv: any): any {
  const slope = lutGradient(uv.mul(uniforms.microFrequency)).mul(float(1 / gradientLutRms()));
  const limit = float(Math.tan((MAX_NORMAL_DEGREES * Math.PI) / 180));
  const tilt = clamp(slope.mul(uniforms.normalStrength), limit.negate(), limit);
  const n = normalLocal.normalize();
  // Branchless orthogonal basis: pick the axis the normal is least aligned
  // with, so the cross product never degenerates on an axis-aligned face -
  // and half this arena is axis-aligned faces.
  const away = abs(n.z).lessThan(float(0.999)).select(vec3(0, 0, 1), vec3(1, 0, 0));
  const t1 = cross(n, away).normalize();
  const t2 = cross(n, t1);
  return transformNormalToView(n.add(t1.mul(tilt.x)).add(t2.mul(tilt.y)).normalize());
}

/**
 * The composed wear response for one spec.
 *
 * `albedoMul` multiplies the family's own base/pattern colour. It is clamped
 * to the combat-readability floor rather than left to the sum of its terms,
 * because a family is free to add its own darkening on top (a lap shadow, a
 * tar seam) and the floor has to hold for the composition, not for this file.
 *
 * `roughness` is the spec's base plus the same three scales, clamped to a
 * sane dielectric range.
 *
 * `soilMask` is exposed so a family can reuse the SAME metre-scale field for
 * its own structure — a damp band, a moss line, a traffic lane — instead of
 * inventing a second uncorrelated one, which is how a surface ends up looking
 * like two textures fighting.
 */
export interface WearNodes {
  readonly albedoMul: any;
  readonly roughness: any;
  readonly soilMask: any;
  readonly grain: any;
  readonly scuff: any;
  /** Luminance-preserving warm/cool multiplier. Families multiply it into their base colour. */
  readonly tint: any;
  /** Signed macro (1-4 m) field, for a family that wants to key its own structure off it. */
  readonly macro: any;
  /** Signed micro (5-20 cm) field. */
  readonly micro: any;
}


/**
 * Beyond this read distance a surface is authored as a backdrop.
 *
 * 30 m is where the smallest scale this library authors - an 80 mm scuff -
 * falls to about 3.6 px, and where the next one down, a 1.5 mm grain, has been
 * invisible for twenty-nine of those metres.
 */
export const BACKDROP_READ_DISTANCE_M = 30;

/** Is this spec authored as a backdrop rather than as a surface you can approach? */
export function isBackdrop(spec: Nuketown2MaterialSpec): boolean {
  return readDistance(spec) >= BACKDROP_READ_DISTANCE_M;
}

/**
 * The analytic metre-scale tonal field a backdrop gets in place of noise.
 *
 * Three sines on three axes whose bearings are not related by a rational
 * fraction, at three periods that are not harmonics. A product of two
 * axis-aligned sines is a checkerboard by construction; a SUM of three rotated
 * ones at incommensurable periods is a smooth irregular mottle, which is what
 * a scrub plain looks like from 55 m.
 */
export function backdropWear(spec: Nuketown2MaterialSpec, uniforms = createNuketown2Uniforms(spec, spec.baseSrgb)): WearNodes {
  void spec;
  const p = positionWorld;
  const wave = (ax: number, az: number, periodM: number): any =>
    sin(p.x.mul(float((ax * 2 * Math.PI) / periodM)).add(p.z.mul(float((az * 2 * Math.PI) / periodM))));
  const field = wave(0.734, 0.679, 17.3)
    .add(wave(-0.512, 0.859, 9.1))
    .add(wave(0.921, -0.389, 4.7))
    .div(float(3));

  const soilMask = smoothstep(float(-0.45), float(0.55), field);
  const albedoMul = clamp(
    float(1).add(field.mul(uniforms.trafficAlbedo)).sub(soilMask.mul(uniforms.soil)),
    float(1 - MAX_ALBEDO_DARKENING),
    float(1).add(uniforms.trafficAlbedo),
  );
  const roughness = clamp(
    uniforms.baseRoughness.add(field.mul(uniforms.trafficRoughness)),
    float(0.03),
    float(1.0),
  );
  return {
    albedoMul, roughness, soilMask, grain: float(0), scuff: float(0),
    tint: vec3(1, 1, 1), macro: field, micro: float(0),
  };
}

/**
 * @param spec   the authored physical description
 * @param uv     a 2D surface coordinate IN METRES (x/z for a ground plane, run/height for a wall)
 * @param soilUv optional separate metre-scale coordinate for the soiling field; defaults to `uv`
 */
export function buildWear(
  spec: Nuketown2MaterialSpec,
  uv: any,
  soilUv: any = uv,
  uniforms: Nuketown2Uniforms = createNuketown2Uniforms(spec, spec.baseSrgb),
): WearNodes {
  assertSpec(spec);

  // A BACKDROP - a surface only ever read from tens of metres - gets an
  // analytic tonal field instead of lattice noise, and it is not an
  // optimisation dressed as authoring: at the distance it is read, the only
  // scale that resolves is the metre-scale one, and a smooth metre-scale field
  // is exactly what three summed sines are.
  //
  // MEASURED, and this is why the branch exists at all. The 220 m scrub plain
  // carrying lattice value noise - at six octaves, at four, and at ONE - failed
  // the arena boot smoke every time with "WebGPU queue completion exceeded
  // 12000 ms for submission 1 (completed 0 ... fenced draws 515)": the arena
  // never rendered a frame. The same build with that one material's wear
  // stubbed passed in 59.5 s, and with a plain `positionWorld.x` gradient in
  // its place passed in 58.8 s, so it is neither the arena nor the graph size.
  // A sin-free hash did not rescue it either; that build crashed the GPU
  // process outright. Seventy-one full-frame quads evaluating a hashed lattice
  // is simply beyond what this route will complete, and no octave count fixes
  // that. Three sines over the same surface cost nine instructions and read
  // the same from 55 m.
  // The backdrop and surface paths share one node topology. A material
  // reference selects the authored backdrop projection at render time, so
  // lawn variants no longer create separate program identities. The enabled
  // values are zero for the backdrop; its branch remains analytically cheap
  // and, critically, the old hashed lattice is not reintroduced.
  const grain = signedNoise(uv, uniforms.grainFrequency as any, 1)
    .mul(detailFalloff(0.8, 3.0))
    .mul(uniforms.grainEnabled);
  const scuff = signedNoise(uv, uniforms.scuffFrequency as any, 2)
    .mul(detailFalloff(4.0, 18.0))
    .mul(uniforms.scuffEnabled);
  const traffic = signedNoise(soilUv, uniforms.trafficFrequency as any, 3);

  // Soiling is one-sided: dirt subtracts. Thresholded so it has a shape (a
  // wash line, a lane) instead of being a uniform grey veil, which is the
  // "uniform dirt" CG tell.
  const soilMask = smoothstep(float(-0.15), float(0.75), traffic);

  // The two combat-distance scales, folded into the SAME clamp as the three
  // authored ones. A second clamp downstream in each family would have let the
  // composition darken past a bound every part of it individually respected,
  // and the readability ceiling is a property of the composed surface or it is
  // nothing.
  const variation = buildVariation(uniforms, uv);

  const albedoMul = clamp(
    float(1)
      .add(grain.mul(uniforms.grainAlbedo))
      .add(scuff.mul(uniforms.scuffAlbedo))
      .add(traffic.mul(uniforms.trafficAlbedo))
      .add(variation.macro.mul(uniforms.macroAlbedo))
      .add(variation.micro.mul(uniforms.microAlbedo))
      .sub(soilMask.mul(uniforms.soil)),
    float(1 - MAX_ALBEDO_DARKENING),
    float(1)
      .add(uniforms.grainAlbedo)
      .add(uniforms.scuffAlbedo)
      .add(uniforms.trafficAlbedo)
      .add(uniforms.macroAlbedo)
      .add(uniforms.microAlbedo),
  );

  // ROUGHNESS CORRELATED WITH THE WEAR, which is the half of this that costs
  // nothing and is skipped most often. Dirt collects in the recesses and dirt
  // is rough; the places traffic has polished are smooth. Uncorrelated
  // roughness noise reads as a second texture fighting the first - the exact
  // CG tell the three-scale rule exists to remove - whereas roughness that
  // agrees with the albedo mask reads as one surface with a history.
  const polished = smoothstep(float(0.45), float(0.95), scuff.mul(float(0.5)).add(float(0.5)));
  const roughness = clamp(
    uniforms.baseRoughness
      .add(grain.mul(uniforms.grainRoughness))
      .add(scuff.mul(uniforms.scuffRoughness))
      .add(traffic.mul(uniforms.trafficRoughness))
      .add(variation.roughness)
      .add(soilMask.mul(uniforms.soilRoughness))
      .sub(polished.mul(uniforms.polishRoughness)),
    float(0.03),
    float(1.0),
  );

  const backdrop = backdropWear(spec, uniforms);
  const useBackdrop = (uniforms.backdrop as any).greaterThan(float(0.5));
  return {
    albedoMul: useBackdrop.select(backdrop.albedoMul, albedoMul),
    roughness: useBackdrop.select(backdrop.roughness, roughness),
    soilMask: useBackdrop.select(backdrop.soilMask, soilMask),
    grain: useBackdrop.select(backdrop.grain, grain),
    scuff: useBackdrop.select(backdrop.scuff, scuff),
    // The backdrop keeps the macro scales: a 3.4 m field subtends 200 px at
    // the 55 m it is read from, and it is the only term out there that stops
    // 220 m of ground reading as one value. Only the tint is dropped, because
    // a hue shift at that range is atmosphere's job, not the material's.
    tint: useBackdrop.select(vec3(1, 1, 1), variation.tint),
    macro: variation.macro,
    micro: useBackdrop.select(float(0), variation.micro),
  };
}

/**
 * ONE channel of the shared tile, centred exactly the way `centred()` centres
 * it in the node graph, summarised over every texel.
 *
 * The gate reads THIS rather than restating the arithmetic, which is the same
 * discipline `spec.ts` already applies to the wear bands: a measurement that
 * duplicates the formula it is measuring only ever proves the duplicate.
 */
export interface FieldStats {
  readonly mean: number;
  readonly sigma: number;
  readonly min: number;
  readonly max: number;
  /** Fraction of texels the +-1 clamp actually bit on. */
  readonly clipped: number;
}

const fieldStatsCache = new Map<number, FieldStats>();

export function centredFieldStats(channel: 0 | 1 | 2 | 3): FieldStats {
  const cached = fieldStatsCache.get(channel);
  if (cached) return cached;
  const data = generateNoiseLutData();
  const mean = noiseLutChannelMeans()[channel]!;
  const sigma = noiseLutChannelSigmas()[channel]!;
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  let clipped = 0;
  const texels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const raw = (data[i + channel]! / 255 - mean) / (2 * sigma);
    const v = Math.min(1, Math.max(-1, raw));
    if (v !== raw) clipped += 1;
    sum += v;
    sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const m = sum / texels;
  const stats: FieldStats = {
    mean: m,
    sigma: Math.sqrt(sumSq / texels - m * m),
    min,
    max,
    clipped: clipped / texels,
  };
  fieldStatsCache.set(channel, stats);
  return stats;
}

/** What one spec's macro + micro variation actually does to its albedo. */
export interface VariationStatistics {
  /** Mean of the luminance multiplier. 1.0 means the authored base colour survives as the mean. */
  readonly mean: number;
  /** RMS luminance variation, as a fraction of the base. This is the "2-6 %" number. */
  readonly rms: number;
  /** 95 % peak-to-peak luminance swing, as a fraction of the base. */
  readonly p95Band: number;
  /** Worst-case peak-to-peak, both fields at their extremes at once. */
  readonly worstBand: number;
  /** Peak warm/cool spread actually reachable. */
  readonly tintPeak: number;
  /** Peak shading-normal tilt, in degrees, at the tile's RMS slope. */
  readonly normalDegrees: number;
}

/**
 * MEASURED, not asserted.
 *
 * The macro and micro fields are sampled at frequencies that differ by more
 * than an order of magnitude, so over any surface larger than a macro feature
 * they are independent: the mean and the variance therefore compose exactly,
 * and only the worst-case band has to assume they align. That assumption is
 * the conservative one, which is the right direction for a readability bound.
 */
export function variationStatistics(spec: Nuketown2MaterialSpec): VariationStatistics {
  const v = variationOf(spec);
  const d = readDistance(spec);
  const a = scaleResolvable(v.macro.sizeM, d) ? v.macro.albedo : 0;
  const b = scaleResolvable(v.micro.sizeM, d) ? v.micro.albedo : 0;
  const macro = centredFieldStats(2);
  const micro = centredFieldStats(0);
  const hue = centredFieldStats(3);
  const rms = Math.sqrt((a * macro.sigma) ** 2 + (b * micro.sigma) ** 2);
  return {
    mean: 1 + a * macro.mean + b * micro.mean,
    rms,
    p95Band: 2 * 1.96 * rms,
    worstBand: a * (macro.max - macro.min) + b * (micro.max - micro.min),
    tintPeak: v.tintSpread * Math.max(Math.abs(hue.min), Math.abs(hue.max)),
    normalDegrees: (Math.atan(Math.tan((v.normalDegrees * Math.PI) / 180)) * 180) / Math.PI,
  };
}

/**
 * A metre-scale coordinate on a horizontal surface. Ground, road, apron, lawn.
 */
export function groundUv(): any {
  return vec2(positionWorld.x, positionWorld.z);
}

/**
 * A metre-scale coordinate on a vertical surface: horizontal run against
 * height. `x + z` is the run, which is exact for the axis-aligned walls this
 * arena is built from and continuous across a corner, so a course line does
 * not jump where two walls meet.
 */
export function wallUv(): any {
  return vec2(positionWorld.x.add(positionWorld.z), positionWorld.y);
}

/**
 * A metre-scale coordinate for a whole BOX, whose faces are both horizontal
 * and vertical.
 *
 * THE BUG THIS EXISTS FOR. A world XZ coordinate is constant along Y, so a
 * material authored on it and applied to a box paints every vertical face as
 * a set of vertical streaks - the pattern from the top face, extruded
 * downwards. Half this arena's dressing is boxes: cover walls, planters,
 * crates, stores, buttresses.
 *
 * Shearing the coordinate with height fixes it for two adds. On a flat slab
 * at constant Y it is the XZ coordinate plus a constant offset, so horizontal
 * surfaces are unaffected; on a vertical face it varies, so the wear does
 * too. The coefficients are deliberately not equal and not round, so the two
 * axes do not shear into each other and produce a diagonal moire.
 */
export function boxUv(): any {
  return vec2(
    positionWorld.x.add(positionWorld.y.mul(float(0.61))),
    positionWorld.z.add(positionWorld.y.mul(float(0.37))),
  );
}

/**
 * Linear-working-space RGB of an sRGB hex, as a TSL vec3.
 *
 * THE TRAP THIS EXISTS FOR. `new THREE.Color(r, g, b)` with floats has been
 * LINEAR since r152, and `new THREE.Color(hex).r` is likewise already decoded.
 * Hand-decoding the hex here, once, means a family author writes the sRGB
 * value an artist would name and gets the linear value the node graph needs,
 * with no chance of a double decode turning a warm timber into near-black.
 */
export function linearSwatch(srgbHex: number): any {
  const decode = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = decode(((srgbHex >> 16) & 0xff) / 255);
  const g = decode(((srgbHex >> 8) & 0xff) / 255);
  const b = decode((srgbHex & 0xff) / 255);
  return vec3(r, g, b);
}

/** Same decode, as plain numbers, for CPU-side gates. */
export function linearRgb(srgbHex: number): readonly [number, number, number] {
  const decode = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [
    decode(((srgbHex >> 16) & 0xff) / 255),
    decode(((srgbHex >> 8) & 0xff) / 255),
    decode((srgbHex & 0xff) / 255),
  ];
}

/** `mix` and `max` re-exported so families do not each open their own cast boundary. */
export const nodeOps = { mix, max, float, vec2, vec3, clamp, smoothstep, positionWorld };
