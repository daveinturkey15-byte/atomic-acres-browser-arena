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
import { boxUv, buildWear } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { bindNuketown2WearUniforms, NUKETOWN2_UNIFORMS, setNuketown2FamilyUniform } from '../material-uniforms';

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

let lawnGraph: { colorNode: any; roughnessNode: any } | null = null;

function sharedLawnGraph(): { colorNode: any; roughnessNode: any } {
  if (lawnGraph) return lawnGraph;
  const spec = lawnSpec('nuketown2-lawn-shared', 0x496438, 'turf');
  const p = positionWorld;
  const wear = buildWear(spec, boxUv());
  const variant = NUKETOWN2_UNIFORMS.lawnVariant as any;
  const isTurf = variant.lessThan(float(0.5));
  const isScrub = variant.greaterThan(float(0.5)).and(variant.lessThan(float(1.5)));
  const isHedge = variant.greaterThan(float(1.5));
  const cellX = floor(p.x.div(float(MOWER_CELL_M)));
  const cellZ = floor(p.z.div(float(MOWER_CELL_M)));
  const parity = fract(cellX.add(cellZ).mul(float(0.5))).mul(float(2));
  const striped = NUKETOWN2_UNIFORMS.baseColor.mul(wear.albedoMul)
    .mul(float(0.950).add(isTurf.select(parity.mul(float(0.100)), float(0))));
  const thin = smoothstep(float(0.42), float(0.78), wear.soilMask);
  const bare = smoothstep(float(0.76), float(0.93), wear.soilMask);
  const earth = NUKETOWN2_UNIFORMS.soilColor;
  const thinned = mix(striped, mix(striped, earth, float(0.30)), thin.mul(isHedge.select(float(0.35), float(1.0))));
  const worn = mix(thinned, earth, bare.mul(isHedge.select(float(0.15), float(0.60))));
  const straw = smoothstep(float(0.45), float(0.85), wear.scuff).mul(isScrub.select(float(0.8), float(0.35)));
  lawnGraph = {
    colorNode: mix(worn, worn.mul(float(1.42)), straw),
    roughnessNode: clamp(wear.roughness.sub(bare.mul(float(0.06))).sub(straw.mul(float(0.04))), float(0.60), float(1.0)),
  };
  return lawnGraph;
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

  bindNuketown2WearUniforms(mat, spec, baseSrgb, options.soilSrgb ?? 0x6b5741);
  setNuketown2FamilyUniform(mat, 'nuketown2LawnVariant', variant === 'turf' ? 0 : variant === 'scrub' ? 1 : 2);
  const shared = sharedLawnGraph();
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  return mat;
}
