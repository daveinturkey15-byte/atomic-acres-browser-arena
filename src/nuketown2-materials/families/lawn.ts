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
import { boxUv, buildWear, linearSwatch } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';
import { hash2 } from '../../map3/noise';

const { abs, clamp, float, floor, fract, max, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Mown checker cell, metres. Measured off the BO2-2025 aerial reference. */
export const MOWER_CELL_M = 2.2;
/**
 * DAY-VISUAL-A (HF-535): mow-stripe Michelson contrast, full swing cell to
 * cell. 0.14 reads at the overhead and street stations; the lane test pins
 * the floor so a future re-key cannot silently flatten the checker.
 */
export const LAWN_STRIPE_CONTRAST = 0.14;
/**
 * DAY-VISUAL-A (HF-535): dry late-summer verge straw on the scrub variant
 * (the beyond-fence plain). Warm yellow-green dryness, same shared graph.
 */
export const LAWN_SCRUB_STRAW = 0.9;
/**
 * DAY-VISUAL-A (HF-535): scattered yellow wildflowers on the scrub verge.
 * Hash threshold per ~0.33 m cell — sparse dots, never a meadow. Scrub only;
 * the kept turf stays clean.
 */
export const LAWN_WILDFLOWER_THRESHOLD = 0.975;

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

function sharedLawnGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any } {
  if (lawnGraph) return lawnGraph;
  const spec = lawnSpec('nuketown2-lawn-shared', 0x496438, 'turf');
  const p = positionWorld;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const variant = uniforms.lawnVariant as any;
  const isTurf = variant.lessThan(float(0.5));
  const isScrub = variant.greaterThan(float(0.5)).and(variant.lessThan(float(1.5)));
  const isHedge = variant.greaterThan(float(1.5));
  const cellX = floor(p.x.div(float(MOWER_CELL_M)));
  const cellZ = floor(p.z.div(float(MOWER_CELL_M)));
  const parity = fract(cellX.add(cellZ).mul(float(0.5))).mul(float(2));
  const striped = uniforms.baseColor.mul(wear.albedoMul)
    .mul(isTurf.select(float(1 - LAWN_STRIPE_CONTRAST / 2).add(parity.mul(float(LAWN_STRIPE_CONTRAST))), float(0.95)));
  const thin = smoothstep(float(0.42), float(0.78), wear.soilMask);
  const bare = smoothstep(float(0.76), float(0.93), wear.soilMask);
  const earth = uniforms.soilColor;
  const thinned = mix(striped, mix(striped, earth, float(0.30)), thin.mul(isHedge.select(float(0.35), float(1.0))));
  // DAY-POLISH (HF-535): the scrub plain is one slab inside the fence too,
  // so straw and wildflowers need a fence mask or they land on driveways and
  // foundations. Fenced play rectangle |x| <= 18, |z| <= 36
  // (NUKETOWN2_BOUNDS); 2 m feather so the verge reads continuous.
  const beyondFence = smoothstep(float(0.0), float(2.0), max(abs(p.x).sub(float(18)), abs(p.z).sub(float(36))));
  const straw = smoothstep(float(0.45), float(0.85), wear.scuff).mul(mix(float(0.35), float(LAWN_SCRUB_STRAW), beyondFence));
  const worn = mix(thinned, earth, bare.mul(isHedge.select(float(0.15), float(0.60))));
  const wildflower = isScrub.select(smoothstep(float(LAWN_WILDFLOWER_THRESHOLD), float(0.992), hash2(floor(vec2(p.x, p.z).mul(float(3.0))))), float(0)).mul(beyondFence).mul(float(0.85));
  // DAY-POLISH (HF-535): sparse warm blooms on the kerb planters (hedge
  // variant). Same hash family, decorrelated cells, no geometry.
  const planterBloom = isHedge.select(smoothstep(float(0.986), float(0.997), hash2(floor(vec2(p.x, p.z).mul(float(5.0))).add(float(7)))), float(0)).mul(float(0.5));
  lawnGraph = {
    colorNode: mix(
      mix(mix(worn, worn.mul(float(1.42)), straw), linearSwatch(0xe0a83c).mul(wear.albedoMul), planterBloom),
      linearSwatch(0xd8b93c).mul(wear.albedoMul),
      wildflower,
    ),
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

  const uniforms = createNuketown2Uniforms(spec, baseSrgb, options.soilSrgb ?? 0x6b5741, mat);
  setNuketown2FamilyUniform(uniforms, 'lawnVariant', variant === 'turf' ? 0 : variant === 'scrub' ? 1 : 2);
  const shared = sharedLawnGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  return mat;
}
