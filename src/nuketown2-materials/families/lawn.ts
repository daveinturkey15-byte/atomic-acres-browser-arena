/**
 * families/lawn.ts — turf, the scrub plain beyond the fence, and hedge mass.
 *
 * REAL SIZES. A mown domestic lawn is 30-50 mm of blade over thatch; what a
 * camera resolves at eye height is not blades but the 0.5-1.5 mm specular
 * glint off their tips, the 40-80 mm clumping of the sward, and — the part
 * that decides whether a green rectangle reads as a garden — the metre-scale
 * pattern of where people walk.
 *
 * WEAR:
 *   - grain    1.0 mm : blade-tip glint
 *   - scuff    60 mm  : clumps, moss patches, the mower's own scalping on a
 *                       high spot
 *   - traffic  2.4 m  : the desire lines. Grass under repeated footfall thins
 *                       to thatch and then to bare soil, and soil is a WARM
 *                       BROWN two to three times the luminance of the shaded
 *                       green around it. That is a 30-40% albedo step, it is
 *                       the largest one on the whole map, and it is the single
 *                       change that makes a lawn stop looking like a green
 *                       plane.
 *
 * MOWER STRIPES are the second term worth having: a roller lays alternate
 * 0.6 m bands away from and toward the viewer, and the two bands differ by
 * about 8% because you are looking at the tips of one and the flanks of the
 * other. It costs one `fract`.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { buildWear, groundUv, linearSwatch } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';

const { abs, clamp, float, fract, mix, positionWorld, smoothstep } =
  TSL as unknown as Record<string, any>;

/** Mower band width, metres. */
export const MOWER_BAND_M = 0.62;

export type LawnVariant = 'turf' | 'scrub' | 'hedge';

export function lawnSpec(name: string, baseSrgb: number, variant: LawnVariant, polygonOffset?: number): Nuketown2MaterialSpec {
  const open = variant !== 'hedge';
  return assertSpec({
    name,
    family: 'lawn',
    baseSrgb,
    roughness: 0.97,
    metalness: 0.0,
    grain: { sizeM: 0.0010, albedo: 0.035, roughness: 0.03 },
    scuff: { sizeM: 0.060, albedo: 0.070, roughness: 0.05 },
    traffic: { sizeM: 2.4, albedo: open ? 0.085 : 0.060, roughness: 0.05 },
    soil: open ? 0.110 : 0.080,
    ...(polygonOffset === undefined ? {} : { polygonOffset }),
  });
}

export interface LawnOptions {
  readonly variant?: LawnVariant;
  readonly polygonOffset?: number;
  /** sRGB of the bare earth the wear paths expose. */
  readonly soilSrgb?: number;
}

export function createLawnMaterial(
  name: string,
  baseSrgb: number,
  options: LawnOptions = {},
): MeshStandardNodeMaterial {
  const variant = options.variant ?? 'turf';
  const spec = lawnSpec(name, baseSrgb, variant, options.polygonOffset);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(baseSrgb);
  if (options.polygonOffset !== undefined) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = options.polygonOffset;
    mat.polygonOffsetUnits = options.polygonOffset;
  }

  const p = positionWorld;
  const uv = groundUv();
  const wear = buildWear(spec, uv);

  const turf = linearSwatch(baseSrgb).mul(wear.albedoMul);

  // Mower stripes. Turf only — nobody mows scrubland or a hedge.
  const stripe = variant === 'turf'
    ? abs(fract(p.z.div(float(MOWER_BAND_M))).sub(float(0.5))).mul(float(2))
    : float(0);
  const striped = turf.mul(float(1).add(stripe.mul(float(0.075)).sub(float(0.037))));

  // Wear paths. Thresholded off the metre-scale field so they have a shape:
  // a broad thinning of the sward, and a narrower bare core inside it.
  const thin = smoothstep(float(0.30), float(0.72), wear.soilMask);
  const bare = smoothstep(float(0.62), float(0.88), wear.soilMask);
  const earth = linearSwatch(options.soilSrgb ?? 0x6b5741);

  const thinned = mix(striped, mix(striped, earth, float(0.45)), thin.mul(variant === 'hedge' ? 0.35 : 1.0));
  const worn = mix(thinned, earth, bare.mul(variant === 'hedge' ? 0.15 : 0.85));

  // Dry patches: sun-scorched turf goes straw, not brown, and it goes UP in
  // luminance. Scrubland is mostly this.
  const straw = smoothstep(float(0.45), float(0.85), wear.scuff)
    .mul(variant === 'scrub' ? float(0.8) : float(0.35));
  mat.colorNode = mix(worn, worn.mul(float(1.42)), straw);

  mat.roughnessNode = clamp(
    wear.roughness.sub(bare.mul(float(0.06))).sub(straw.mul(float(0.04))),
    float(0.60),
    float(1.0),
  );
  return mat;
}
