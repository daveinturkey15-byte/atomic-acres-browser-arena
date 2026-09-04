/**
 * families/timber.ts — fence pickets, deck boards and painted trim.
 *
 * REAL SIZES. A dog-ear fence picket is 143 mm wide (a nominal 6 in board) at
 * 3 mm gaps; a deck board is 140 mm at 5 mm gaps with two fixings per joist at
 * 400 mm centres. Softwood grain is 1-3 mm between latewood bands with a knot
 * every 0.3-0.9 m, and both are what a camera resolves first at arm's length.
 *
 * WEAR:
 *   - grain    1.2 mm : latewood bands and the saw's own fibre
 *   - scuff    55 mm  : knots, end checks, splinter tear, boot scrub
 *   - traffic  1.8 m  : the silvering — UV bleaches exposed timber to a pale
 *                       grey while the sheltered face keeps its colour — and
 *                       the dark damp foot in the first 0.2 m off the ground
 *
 * SILVERING IS A LIGHT STEP. Weathered softwood goes UP in luminance, not
 * down; a fence that only ever gets dirtier is a fence nobody has looked at.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { boxUv, buildWear, linearSwatch } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { hash2 } from '../../map3/noise';

const { abs, clamp, float, floor, fract, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Picket pitch, metres (143 mm board + 3 mm gap). */
export const PICKET_PITCH_M = 0.146;
/** Deck board pitch, metres (140 mm board + 5 mm gap). */
export const DECK_PITCH_M = 0.145;

export type TimberVariant = 'fence' | 'deck' | 'painted-trim';

export function timberSpec(name: string, baseSrgb: number, variant: TimberVariant): Nuketown2MaterialSpec {
  const painted = variant === 'painted-trim';
  return assertSpec({
    name,
    family: 'timber',
    baseSrgb,
    roughness: painted ? 0.66 : 0.90,
    metalness: 0.0,
    grain: { sizeM: 0.0012, albedo: painted ? 0.028 : 0.045, roughness: 0.07 },
    scuff: { sizeM: 0.055, albedo: painted ? 0.055 : 0.065, roughness: 0.10 },
    traffic: { sizeM: 1.8, albedo: painted ? 0.060 : 0.075, roughness: 0.08 },
    soil: painted ? 0.075 : 0.085,
  });
}

export function createTimberMaterial(
  name: string,
  baseSrgb: number,
  variant: TimberVariant = 'fence',
): MeshStandardNodeMaterial {
  const spec = timberSpec(name, baseSrgb, variant);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(baseSrgb);

  const p = positionWorld;
  // Deck boards lie flat and fence pickets stand up, so the wear field has
  // to work on both orientations; the board structure below still reads its
  // own explicit world axes.
  const uv = boxUv();
  const wear = buildWear(spec, uv);

  const vertical = variant === 'fence';
  const pitch = vertical ? PICKET_PITCH_M : DECK_PITCH_M;
  // A picket runs vertically, so its boards repeat along the RUN; a deck board
  // lies flat, so they repeat across the surface. Painted trim is a single
  // dressed member and gets no board seam at all.
  const boardCoord = vertical ? p.x.add(p.z) : p.z;
  const boardV = boardCoord.div(float(pitch));
  const boardIdx = floor(boardV);
  const boardEdge = abs(fract(boardV).sub(float(0.5))).mul(float(2));
  const gap = variant === 'painted-trim'
    ? float(0)
    : smoothstep(float(1 - (0.006 / pitch) * 2), float(1.0), boardEdge);

  // Every board is a different board.
  const boardTone = hash2(vec2(boardIdx, float(vertical ? 41.3 : 7.9))).sub(float(0.5)).mul(float(0.16));

  // Latewood banding runs ALONG the board, which is why it is one-dimensional
  // and not fBm: a wood grain that swirls in both axes is a marble.
  const along = vertical ? p.y : p.x;
  const bandPhase = along.mul(float(1 / 0.0022)).add(hash2(vec2(boardIdx, float(3.1))).mul(float(30)));
  const latewood = abs(fract(bandPhase).sub(float(0.5))).mul(float(2));

  // Knots: one every 0.3-0.9 m along the board.
  const knotCell = floor(along.div(float(0.55)));
  const knotCentre = hash2(vec2(boardIdx, knotCell)).mul(float(0.55)).add(knotCell.mul(float(0.55)));
  const knot = smoothstep(float(0.021), float(0.006), abs(along.sub(knotCentre)));

  // Silvering: UV-bleached exposed timber. High and open goes pale; the damp
  // foot stays dark. Both metre-scale, both albedo.
  const silver = smoothstep(float(0.4), float(1.9), p.y).mul(wear.soilMask.mul(float(0.5)).add(float(0.5)));
  const dampFoot = smoothstep(float(0.22), float(0.0), p.y);

  const wood = linearSwatch(baseSrgb).mul(wear.albedoMul).mul(float(1).add(boardTone));
  const grained = wood.mul(float(1).sub(latewood.mul(float(variant === 'painted-trim' ? 0.03 : 0.11))));
  const knotted = mix(grained, grained.mul(float(0.55)), knot.mul(float(variant === 'painted-trim' ? 0.15 : 0.8)));
  const weathered = mix(knotted, knotted.mul(float(1.26)), silver.mul(float(variant === 'painted-trim' ? 0.25 : 0.55)));
  const footed = weathered.mul(float(1).sub(dampFoot.mul(float(0.17))));

  mat.colorNode = mix(footed, linearSwatch(0x1a120c), gap);
  mat.roughnessNode = clamp(
    wear.roughness.add(gap.mul(float(0.06))).add(silver.mul(float(0.08))).sub(knot.mul(float(0.10))),
    float(0.25),
    float(1.0),
  );
  return mat;
}

export function createNuketown2FenceMaterial(): MeshStandardNodeMaterial {
  return createTimberMaterial('nuketown2-timber-fence', 0x673b24, 'fence');
}
