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
import { fbm2 } from '../map3/noise';
import {
  MAX_ALBEDO_DARKENING,
  type Nuketown2MaterialSpec,
  assertSpec,
} from './spec';

/** One cast boundary for the TSL DSL, the idiom the rest of this repo's node materials use. */
const {
  cameraPosition,
  clamp,
  float,
  length,
  max,
  mix,
  positionWorld,
  smoothstep,
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

/** Signed [-1, 1] fBm of a 2D surface coordinate at a given feature size in metres. */
export function signedNoise(uv: any, featureSizeM: number, octaves = 2): any {
  return fbm2(uv.mul(float(1 / featureSizeM)), octaves).sub(float(0.5)).mul(float(2));
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
 * @param spec   the authored physical description
 * @param uv     a 2D surface coordinate IN METRES (x/z for a ground plane, run/height for a wall)
 * @param soilUv optional separate metre-scale coordinate for the soiling field; defaults to `uv`
 */
export function buildWear(spec: Nuketown2MaterialSpec, uv: any, soilUv: any = uv): WearNodes {
  assertSpec(spec);

  // 0.5 - 1.5 mm. Paint tooth, aggregate grit, timber fibre. One octave: at
  // this size a second octave is below a nanometre of feature and costs a
  // texture fetch's worth of ALU for nothing.
  const grain = signedNoise(uv, spec.grain.sizeM, 1).mul(detailFalloff(0.8, 3.0));

  // 20 - 80 mm. Scuffs, chips, heel marks. Two octaves so the marks have
  // edges rather than being blobs.
  const scuff = signedNoise(uv, spec.scuff.sizeM, 2).mul(detailFalloff(4.0, 18.0));

  // 0.5 - 3 m. The term that does the actual work in a wide frame: traffic,
  // rain wash, sun fade. Three octaves, no falloff — it is metres wide.
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
