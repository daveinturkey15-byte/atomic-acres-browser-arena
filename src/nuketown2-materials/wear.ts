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
import { NOISE_LUT_CELLS, lutFbm } from './noise-lut';
import {
  MAX_ALBEDO_DARKENING,
  type Nuketown2MaterialSpec,
  assertSpec,
  readDistance,
} from './spec';
import { createNuketown2Uniforms, type Nuketown2Uniforms } from './material-uniforms';

/** One cast boundary for the TSL DSL, the idiom the rest of this repo's node materials use. */
const {
  abs,
  cameraPosition,
  clamp,
  dFdx,
  dFdy,
  float,
  length,
  max,
  min,
  mix,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  uv,
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
  return { albedoMul, roughness, soilMask, grain: float(0), scuff: float(0) };
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

  const albedoMul = clamp(
    float(1)
      .add(grain.mul(uniforms.grainAlbedo))
      .add(scuff.mul(uniforms.scuffAlbedo))
      .add(traffic.mul(uniforms.trafficAlbedo))
      .sub(soilMask.mul(uniforms.soil)),
    float(1 - MAX_ALBEDO_DARKENING),
    float(1)
      .add(uniforms.grainAlbedo)
      .add(uniforms.scuffAlbedo)
      .add(uniforms.trafficAlbedo),
  );

  const roughness = clamp(
    uniforms.baseRoughness
      .add(grain.mul(uniforms.grainRoughness))
      .add(scuff.mul(uniforms.scuffRoughness))
      .add(traffic.mul(uniforms.trafficRoughness)),
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
  };
}

/**
 * EDGE WEATHERING (PASS 95 visual-polish lane). A mask that is 1 within
 * `chipM` metres of any edge of the box FACE the fragment sits on and 0 in the
 * field, so a family can put its chips, arrises and splinters where wear
 * actually happens: on the corners, not the middle of a face.
 *
 * WHY DERIVATIVES. This arena's solids carry no authored UV channel beyond
 * `BoxGeometry`'s own 0..1 per face, and the graph never knows how big the
 * face is (one siding graph dresses a 0.3 m pier and a 12 m wall). The size
 * is recovered per fragment from screen-space derivatives: with P the world
 * position and (u, v) the face UV, [dP/du dP/dv] = [dP/dx dP/dy] J^-1 where
 * J is the 2x2 screen Jacobian of (u, v). |dP/du| is metres per UV unit along
 * u, so min(u, 1-u) * |dP/du| is the distance to the nearest u edge IN METRES,
 * which is what a 25 mm chip needs. Six derivatives and a 2x2 solve per
 * fragment; no texture, no extra vertex data, no new pipeline (the term is
 * added INSIDE the family's one shared graph, gated by a per-material
 * uniform, so the WGSL is the same for every member of the family).
 *
 * `hash2`-style break-up is the caller's job (chips are not a uniform band).
 * A face with a degenerate Jacobian (edge-on, or a non-box UV) returns 0,
 * never NaN: the determinant is clamped away from zero before dividing.
 */
export function edgeWear(chipM: number): any {
  const st = uv();
  const px = dFdx(positionWorld);
  const py = dFdy(positionWorld);
  const ux = dFdx(st.x);
  const uy = dFdy(st.x);
  const vx = dFdx(st.y);
  const vy = dFdy(st.y);
  const det = max(abs(ux.mul(vy).sub(uy.mul(vx))), float(1e-7));
  const metresPerU = length(px.mul(vy).sub(py.mul(vx))).div(det);
  const metresPerV = length(py.mul(ux).sub(px.mul(uy))).div(det);
  const edgeU = min(st.x, float(1).sub(st.x)).mul(metresPerU);
  const edgeV = min(st.y, float(1).sub(st.y)).mul(metresPerV);
  const edgeM = min(edgeU, edgeV);
  return smoothstep(float(chipM), float(chipM * 0.25), edgeM);
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
