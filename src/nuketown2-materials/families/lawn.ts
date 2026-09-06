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
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';

const { clamp, cos, float, floor, fract, mix, positionWorld, sin, smoothstep, vec3 } =
  TSL as unknown as Record<string, any>;

/** Mown checker cell, metres. Measured off the BO2-2025 aerial reference. */
export const MOWER_CELL_M = 2.2;

/**
 * HF-536 look-2b CORRECTION ROUND, and the measurement that forced it.
 *
 * The first cut of this lane put dry-grass variety on the BLADE INSTANCES
 * only. It was captured over 29 stations and measured: north-yard/lawnNear
 * luma stddev 15.70 -> 16.07 (x1.02) and ZERO straw-classified pixels either
 * side; diff-arena-viewpoints called 15 of 29 stations MATCH and the other 14
 * DYNAMIC_ONLY. In other words the change was real but invisible, because in a
 * lawn box the thin blades are a small share of the pixels and the GROUND
 * PLATE under them is what the camera reads.
 *
 * Reading this file then showed why the plate could not carry it. There IS a
 * dry term here already - `straw`, driven by `wear.scuff` - but it is keyed to
 * the 60 mm scuff octave, which is below one screen pixel at any camera in the
 * review set, and it only MULTIPLIES VALUE (x1.42). A brighter green is not
 * dry grass. So the plate's dryness was, in effect, a uniform 5 % lift: exactly
 * the "uniform green strip" the critic named.
 *
 * The fix is a metre-scale field that shifts HUE, at the SAME period and the
 * same phase as the blade field in `instanced-grass-field.ts`, so the plate and
 * the blades go dry in the same places instead of disagreeing.
 */
export const LAWN_DRY_PATCH_M = 4.5;
/** Mix weight toward the straw albedo inside a patch (the brief's 0.35). */
export const LAWN_DRY_PATCH_WEIGHT = 0.35;
/** Field threshold pair - the same numbers `grassDryness` derives from coverage 0.34. */
export const LAWN_DRY_PATCH_THRESHOLDS = Object.freeze([0.66, 0.847] as const);
/**
 * Straw albedo, LINEAR. sRGB ~ (0.58, 0.52, 0.27): late-summer dead grass over
 * thatch. It is a hue and a value step away from the 0x496438 turf, which is
 * the whole point - the term it replaces could only brighten.
 */
export const LAWN_DRY_ALBEDO_LINEAR = Object.freeze([0.300, 0.235, 0.062] as const);

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
    .mul(float(0.950).add(isTurf.select(parity.mul(float(0.100)), float(0))));
  const thin = smoothstep(float(0.42), float(0.78), wear.soilMask);
  const bare = smoothstep(float(0.76), float(0.93), wear.soilMask);
  const earth = uniforms.soilColor;
  const thinned = mix(striped, mix(striped, earth, float(0.30)), thin.mul(isHedge.select(float(0.35), float(1.0))));
  const worn = mix(thinned, earth, bare.mul(isHedge.select(float(0.15), float(0.60))));
  const straw = smoothstep(float(0.45), float(0.85), wear.scuff).mul(isScrub.select(float(0.8), float(0.35)));

  // HF-536 look-2b: the metre-scale dry patch. Same warped sin/cos field, same
  // period and same phase as `grassDryness` in instanced-grass-field.ts, so the
  // plate and the blades standing in it go dry together. Turf and scrub only -
  // a clipped hedge is watered and does not get dry spots, and giving it one
  // would make the cover read as damaged.
  const k = (Math.PI * 2) / LAWN_DRY_PATCH_M;
  const warp = cos(p.z.mul(float(k * 0.83)).add(float(1.7))).mul(float(0.9));
  const dryField = sin(p.x.mul(float(k)).add(warp))
    .mul(cos(p.z.mul(float(k * 0.71)).sub(float(0.9))))
    .mul(float(0.5)).add(float(0.5));
  const dryPatch = smoothstep(
    float(LAWN_DRY_PATCH_THRESHOLDS[0]), float(LAWN_DRY_PATCH_THRESHOLDS[1]), dryField,
  ).mul(isHedge.select(float(0), float(LAWN_DRY_PATCH_WEIGHT)));
  // The straw albedo still takes the surface's own wear modulation, so a dry
  // patch that crosses a desire line is still worn where the line is.
  const dryAlbedo = vec3(
    float(LAWN_DRY_ALBEDO_LINEAR[0]), float(LAWN_DRY_ALBEDO_LINEAR[1]), float(LAWN_DRY_ALBEDO_LINEAR[2]),
  ).mul(wear.albedoMul);
  const patchy = mix(worn, dryAlbedo, dryPatch);

  lawnGraph = {
    // Additive by construction: where dryPatch is 0 - every hedge surface, and
    // every turf position outside a patch - `patchy` IS `worn`, so this
    // composes exactly as it did before.
    colorNode: mix(patchy, patchy.mul(float(1.42)), straw),
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
