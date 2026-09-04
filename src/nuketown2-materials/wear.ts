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
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { fbm2 } from '../map3/noise';
import {
  MAX_ALBEDO_DARKENING,
  type Nuketown2MaterialSpec,
  assertSpec,
  readDistance,
  scaleResolvable,
} from './spec';

/** One cast boundary for the TSL DSL, the idiom the rest of this repo's node materials use. */
const {
  cameraPosition,
  clamp,
  float,
  fract,
  length,
  max,
  mix,
  positionWorld,
  sin,
  smoothstep,
  uniform,
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
 * 1.2e5. float32 resolves about 0.008 at that magnitude, so `fract` quantises
 * to a couple of hundred steps and the grain stops being grain; worse, the
 * value hash then evaluates `sin` of an argument around 5e7, and a transcendental
 * that far out of range is both meaningless and, on this driver, catastrophically
 * slow - measured as a 12-second first-submission stall that failed the arena
 * boot smoke outright.
 *
 * Wrapping the coordinate into a tile of a fixed number of lattice cells is
 * what a real texture generator does anyway: you author a 0.25 m grain tile and
 * repeat it. 256 keeps every noise argument inside [0, 256) at every scale, and
 * it is an INTEGER period, which is the condition tileable value noise needs -
 * a fractional period yields NaN, and NaN turns every surface into a mirror.
 */
export const NOISE_TILE_CELLS = 256;

/**
 * Signed [-1, 1] fBm of a 2D surface coordinate at a given feature size in
 * metres, evaluated on a tile of `NOISE_TILE_CELLS` features.
 *
 * The tile spans `featureSizeM * NOISE_TILE_CELLS`: 0.23 m for a 0.9 mm grain,
 * 11.5 m for a 45 mm scuff, 614 m for a 2.4 m traffic gradient - which is
 * larger than the map, so the term that carries the big shapes never repeats.
 */
export function signedNoise(uv: any, featureSizeM: number, octaves = 2): any {
  const tiled = fract(uv.mul(float(1 / (featureSizeM * NOISE_TILE_CELLS)))).mul(float(NOISE_TILE_CELLS));
  return fbm2(tiled, octaves).sub(float(0.5)).mul(float(2));
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
export function backdropWear(spec: Nuketown2MaterialSpec): WearNodes {
  const p = positionWorld;
  const wave = (ax: number, az: number, periodM: number): any =>
    sin(p.x.mul(float((ax * 2 * Math.PI) / periodM)).add(p.z.mul(float((az * 2 * Math.PI) / periodM))));
  const field = wave(0.734, 0.679, 17.3)
    .add(wave(-0.512, 0.859, 9.1))
    .add(wave(0.921, -0.389, 4.7))
    .div(float(3));

  const soilMask = smoothstep(float(-0.45), float(0.55), field);
  const albedoMul = clamp(
    float(1).add(field.mul(float(spec.traffic.albedo))).sub(soilMask.mul(float(spec.soil))),
    float(1 - MAX_ALBEDO_DARKENING),
    float(1 + spec.traffic.albedo),
  );
  const roughness = clamp(
    float(spec.roughness).add(field.mul(float(spec.traffic.roughness))),
    float(0.03),
    float(1.0),
  );
  return { albedoMul, roughness, soilMask, grain: float(0), scuff: float(0) };
}

/**
 * @param spec   the authored physical description
 * @param uv     a 2D surface coordinate IN METRES (x/z for a ground plane, run/height for a wall)
 * @param soilUv optional separate metre-scale coordinate for the soiling field; defaults to `uv`
 */
export function buildWear(spec: Nuketown2MaterialSpec, uv: any, soilUv: any = uv): WearNodes {
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
  if (isBackdrop(spec)) return backdropWear(spec);

  // Only the scales this surface's own read distance can resolve are
  // evaluated. A term the frame cannot show is not authored detail, it is
  // per-fragment arithmetic over the surface's whole projected area - and on
  // the 220 m scrub plain that arithmetic was a measured 12-second stall.
  const readM = readDistance(spec);
  const zero = float(0);

  // 0.5 - 1.5 mm. Paint tooth, aggregate grit, timber fibre. One octave: at
  // this size a second octave is below a nanometre of feature and costs a
  // texture fetch's worth of ALU for nothing.
  const grain = scaleResolvable(spec.grain.sizeM, readM)
    ? signedNoise(uv, spec.grain.sizeM, 1).mul(detailFalloff(0.8, 3.0))
    : zero;

  // 20 - 80 mm. Scuffs, chips, heel marks. Two octaves so the marks have
  // edges rather than being blobs.
  const scuff = scaleResolvable(spec.scuff.sizeM, readM)
    ? signedNoise(uv, spec.scuff.sizeM, 2).mul(detailFalloff(4.0, 18.0))
    : zero;

  // 0.5 - 3 m. The term that does the actual work in a wide frame: traffic,
  // rain wash, sun fade. Three octaves, no falloff - it is metres wide, and
  // it is resolvable from anywhere on the map.
  const traffic = signedNoise(soilUv, spec.traffic.sizeM, 3);

  // Soiling is one-sided: dirt subtracts. Thresholded so it has a shape (a
  // wash line, a lane) instead of being a uniform grey veil, which is the
  // "uniform dirt" CG tell.
  const soilMask = smoothstep(float(-0.15), float(0.75), traffic);

  const albedoMul = clamp(
    float(1)
      .add(grain.mul(float(spec.grain.albedo)))
      .add(scuff.mul(float(spec.scuff.albedo)))
      .add(traffic.mul(float(spec.traffic.albedo)))
      .sub(soilMask.mul(float(spec.soil))),
    float(1 - MAX_ALBEDO_DARKENING),
    float(1 + spec.grain.albedo + spec.scuff.albedo + spec.traffic.albedo),
  );

  const roughness = clamp(
    float(spec.roughness)
      .add(grain.mul(float(spec.grain.roughness)))
      .add(scuff.mul(float(spec.scuff.roughness)))
      .add(traffic.mul(float(spec.traffic.roughness))),
    float(0.03),
    float(1.0),
  );

  return { albedoMul, roughness, soilMask, grain, scuff };
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
  const [r, g, b] = linearRgb(srgbHex);
  return vec3(r, g, b);
}

/**
 * The SAME colour as `linearSwatch`, carried as a UNIFORM instead of a literal.
 *
 * HF-477: A COLOUR A CALLER CHOOSES IS NOT A GRAPH CONSTANT. `linearSwatch`
 * returns `vec3(r, g, b)`, which puts the value INSIDE the node graph, and the
 * WebGPU renderer caches a compiled program by the WGSL SOURCE it generates
 * (`Pipelines._getRenderCacheKey` looks the program up by shader text). So two
 * materials from the same family that differ only by hex generate two
 * different shader sources, compile twice and get two pipelines — and this
 * library's factories are ALL parameterised by hex, so `createNuketown2Material
 * Registry()` was paying ~21 cold compiles for what is really 15 surfaces.
 * That is the cost that pushed nuketown2's first WebGPU submission onto the
 * 12,000 ms deploy fence, and it is exactly the defect `nuketown2-vehicle-
 * materials.ts` already fixed for car paint (commit b594fe35).
 *
 * As a uniform the generated WGSL is IDENTICAL for every hex, so a family's
 * roles share one program and one pipeline no matter how many colours the
 * arena asks for. Nothing about the look changes: the value fed in is the same
 * decoded linear triple `linearSwatch` would have baked.
 *
 * WHICH ONE TO USE. Uniform for a colour the CALLER supplies; `linearSwatch`
 * for a colour that is FIXED for the whole family — chip primer, rust weep,
 * the drip-shadow tint, an asphalt spec's own base — because those are the
 * same value in every material of the family, cost no extra pipeline, and are
 * cheaper as constants the compiler can fold.
 */
export function uniformSwatch(srgbHex: number): any {
  const [r, g, b] = linearRgb(srgbHex);
  return uniform(new THREE.Vector3(r, g, b));
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
