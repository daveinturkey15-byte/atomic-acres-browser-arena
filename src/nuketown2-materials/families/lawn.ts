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
 * THE MOWN CHECKER is the second term worth having, and on this map it is not
 * optional: the BO2-2025 aerial reference (`nt2025-aerial-boii.jpg`) shows both
 * front lawns cross-mown into a clear chequerboard of roughly 2.2 m cells, and
 * it is the single most recognisable material read in the whole overhead frame.
 * Alternate cells differ by about 8% because you are looking at the tips of one
 * and the flanks of the other. The cell edge is HARD - a roller leaves a crisp
 * line, and softening it is what makes a mown lawn look like a noise texture.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { boxUv, buildWear, uniformSwatch } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';

const { clamp, float, floor, fract, mix, positionWorld, smoothstep } =
  TSL as unknown as Record<string, any>;

/** Mown checker cell, metres. Measured off the BO2-2025 aerial reference. */
export const MOWER_CELL_M = 2.2;

export type LawnVariant = 'turf' | 'scrub' | 'hedge';

export function lawnSpec(
  name: string,
  baseSrgb: number,
  variant: LawnVariant,
  polygonOffset?: number,
  readDistanceM?: number,
): Nuketown2MaterialSpec {
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
    ...(readDistanceM === undefined ? {} : { readDistanceM }),
    ...(polygonOffset === undefined ? {} : { polygonOffset }),
  });
}

export interface LawnOptions {
  readonly variant?: LawnVariant;
  readonly polygonOffset?: number;
  /** Distance this surface is read from. The plain beyond the fence is a backdrop. */
  readonly readDistanceM?: number;
  /** sRGB of the bare earth the wear paths expose. */
  readonly soilSrgb?: number;
}

export function createLawnMaterial(
  name: string,
  baseSrgb: number,
  options: LawnOptions = {},
): MeshStandardNodeMaterial {
  const variant = options.variant ?? 'turf';
  const spec = lawnSpec(name, baseSrgb, variant, options.polygonOffset, options.readDistanceM);
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
  // A hedge, a crate and a wheelie bin are BOXES: an XZ-only coordinate would
  // paint their vertical faces as streaks extruded from the top face.
  const uv = boxUv();
  const wear = buildWear(spec, uv);

  const turf = uniformSwatch(baseSrgb).mul(wear.albedoMul);

  // The mown checker. Turf only - nobody mows scrubland or a hedge. Parity of
  // (cellX + cellZ) is 0 or 1, which is the chequerboard; the edge stays hard.
  const cellX = floor(p.x.div(float(MOWER_CELL_M)));
  const cellZ = floor(p.z.div(float(MOWER_CELL_M)));
  const parity = variant === 'turf'
    ? fract(cellX.add(cellZ).mul(float(0.5))).mul(float(2))
    : float(0);
  const striped = turf.mul(float(0.950).add(parity.mul(float(0.100))));

  // Wear paths. Thresholded off the metre-scale field so they have a shape:
  // a broad thinning of the sward, and a narrower bare core inside it.
  // MEASURED AND PULLED BACK. The first review capture of the overhead frame
  // showed both yards as brown blotches rather than as lawns with paths worn
  // across them: the bare core opened too early and went too far, so the wear
  // stopped reading as traffic and started reading as mud, and it swamped the
  // mown checker underneath it. The thresholds are now late and the bare core
  // is a minority of the surface, which is what a desire line is.
  const thin = smoothstep(float(0.42), float(0.78), wear.soilMask);
  const bare = smoothstep(float(0.76), float(0.93), wear.soilMask);
  const earth = uniformSwatch(options.soilSrgb ?? 0x6b5741);

  const thinned = mix(striped, mix(striped, earth, float(0.30)), thin.mul(variant === 'hedge' ? 0.35 : 1.0));
  const worn = mix(thinned, earth, bare.mul(variant === 'hedge' ? 0.15 : 0.60));

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
