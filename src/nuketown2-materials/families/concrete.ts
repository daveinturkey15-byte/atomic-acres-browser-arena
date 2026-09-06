/**
 * families/concrete.ts — kerbs, driveway aprons, porch slabs and blockwork.
 *
 * REAL SIZES. A poured slab is jointed to stop it cracking where it likes: a
 * sawn control joint is 3-5 mm wide and about a quarter of the slab depth, cut
 * at 24-30 times the thickness, which for a 100 mm drive is a joint every
 * 2.4-3.0 m. Between joints the surface is broom-finished — parallel 1 mm
 * ridges at 2-3 mm pitch, always square to the pour, never radial. A kerb is a
 * separate pour with a 12 mm radius nose that chips, and its face is where
 * every rainstorm leaves a tide mark. A concrete masonry unit is 390 x 190 mm
 * laid to a 10 mm joint, so blockwork courses at exactly 200 mm and stretchers
 * at 400 mm in half bond.
 *
 * WEAR:
 *   - grain    1.0 mm : broom tooth and the sand fraction
 *   - scuff    40 mm  : spalls, chips at the nose, tyre scrub at the crossing
 *   - traffic  2.0 m  : the damp band at the foot of every vertical face, the
 *                       drier bleached field in the sun, and the two tyre
 *                       tracks up a driveway
 *
 * THE DAMP BAND is the single most valuable term here. Concrete wicks: the
 * bottom 150-250 mm of any face, and a 0.4 m apron at the foot of a wall,
 * stays measurably darker than the field for most of a day. It is a ~20%
 * albedo step and it is why real concrete never reads as one flat grey.
 *
 * SLAB VERSUS WALL. A world-XZ pattern applied to a box paints its vertical
 * faces as vertical streaks, so the two orientations are authored separately:
 * a slab gets a sawn control-joint grid and a broom finish, a wall gets real
 * blockwork courses. `boxUv` carries the wear across both.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { boxUv, buildWear, detailFalloff, linearSwatch } from '../wear';
import { reliefNormal } from '../relief';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { hash2 } from '../../map3/noise';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';

const { abs, clamp, float, floor, fract, max, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Control-joint spacing on a 100 mm slab, metres. */
export const SLAB_JOINT_M = 2.7;
/** Blockwork course height (190 mm unit + 10 mm bed joint), metres. */
export const BLOCK_COURSE_M = 0.20;
/** Blockwork stretcher length (390 mm unit + 10 mm perp joint), metres. */
export const BLOCK_STRETCHER_M = 0.40;

/**
 * How deep a struck mortar joint sits below the block face, metres.
 *
 * A bucket-handle or weather-struck joint is raked back 4-6 mm. That recess is
 * the ONLY reason a block wall reads as coursed masonry from 15 m: the joint's
 * top lip shades and its bottom lip catches, so the wall carries a horizontal
 * ladder of light. Painted flat into the albedo - which is what shipped - it is
 * a grey line on a grey card, and the perimeter wall was the station the critic
 * scored lowest on materials for exactly that reason.
 */
export const MORTAR_RECESS_M = -0.005;
/** A sawn control joint in a slab is cut a quarter of the depth: 25 mm on a 100 mm pour. */
const SLAB_JOINT_RECESS_M = -0.006;
/**
 * Broom-finish ridge height, metres. 0.8 mm is the real tooth of a concrete broom.
 *
 * FADED, AND THIS IS THE RULE NOT THE EXCEPTION. The broom pattern is a 2.5 mm
 * sawtooth. As an ALBEDO term that is harmless when it goes sub-pixel: it
 * averages to a uniform 4.5 % darkening and nothing moves. As a HEIGHT term it
 * is not harmless, because the normal is the DERIVATIVE of the height, and the
 * derivative of a signal sampled below Nyquist is a random number per pixel.
 * Measured on capture night-materials-2 at
 * nuketown2-truck-cab-near (284,709)-(326,719): 106 of 462 pixels exact-black
 * against 0 in forge-final, as speckle, on the closest apron in the frame -
 * random normals tilting off the sky on ground the authored sky already floors
 * near luma 6.
 *
 * 2.5 mm subtends 2 px at 1.35 m on the 1280x720 review capture, so the term
 * is authored to be at full strength inside 1.2 m and gone by 3 m - the same
 * treatment `wear.ts` already gives its 1 mm grain, for the same reason.
 */
const BROOM_RELIEF_M = 0.0008;
/** Distance band over which the broom relief is real, metres. See above. */
const BROOM_RELIEF_NEAR_M = 1.2;
const BROOM_RELIEF_FAR_M = 3.0;
/**
 * Broom-grating period, metres. Exported for the pattern-period gate: 2.5 mm
 * is 2 px at 1.35 m on the review capture, sub-pixel past ~2 m.
 */
export const BROOM_PERIOD_M = 0.0025;
/** A spalled block face loses this much, metres. */
const SPALL_RELIEF_M = -0.004;
/** Height of the rain-wash weathering band above the foot, metres. */
const WEATHER_BAND_M = 0.55;

export type ConcreteVariant = 'apron' | 'kerb' | 'block';

/**
 * HF-536: Kerb and driveway concrete moved to the boards by measurement.
 * Measured on street-centre, coach-elevation, nuke-street boards:
 * warmer sandy concrete tone (hue 25-36 deg) replacing pale cool grey (0x9a978a, hue 49 deg).
 */
export const KERB_CONCRETE_SRGB = 0x9e917d;

/** Driveway apron concrete: warmer weathered apron tone (replaces 0x8b8879). */
export const DRIVEWAY_APRON_SRGB = 0x8d806d;

export function concreteSpec(name: string, baseSrgb: number, polygonOffset?: number): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'concrete',
    baseSrgb,
    roughness: 0.92,
    metalness: 0.01,
    grain: { sizeM: 0.0010, albedo: 0.030, roughness: 0.06 },
    scuff: { sizeM: 0.040, albedo: 0.050, roughness: 0.09 },
    traffic: { sizeM: 2.0, albedo: 0.055, roughness: 0.07 },
    soil: 0.090,
    ...(polygonOffset === undefined ? {} : { polygonOffset }),
  });
}

export interface ConcreteOptions {
  readonly variant?: ConcreteVariant;
  readonly polygonOffset?: number;
  /** World Y of the surface the damp band wicks up from. */
  readonly dampFootY?: number;
}

let concreteGraph: { colorNode: any; roughnessNode: any; normalNode: any } | null = null;

function sharedConcreteGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any; normalNode: any } {
  if (concreteGraph) return concreteGraph;
  const spec = concreteSpec('nuketown2-concrete-shared', KERB_CONCRETE_SRGB);
  const p = positionWorld;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const variant = uniforms.concreteVariant as any;
  const isBlock = variant.greaterThan(float(1.5));
  const isApron = variant.lessThan(float(0.5));
  const run = p.x.add(p.z);
  const courseV = p.y.div(float(BLOCK_COURSE_M));
  const courseIdx = floor(courseV);
  const bedJoint = smoothstep(float(0.012), float(0.0), abs(fract(courseV).sub(float(0.5))).mul(float(BLOCK_COURSE_M)));
  const stretcherU = run.add(courseIdx.mul(float(BLOCK_STRETCHER_M * 0.5))).div(float(BLOCK_STRETCHER_M));
  const perpJoint = smoothstep(float(0.012), float(0.0), abs(fract(stretcherU).sub(float(0.5))).mul(float(BLOCK_STRETCHER_M)));
  const blockJoint = max(bedJoint, perpJoint);
  const jointX = smoothstep(float(0.006), float(0.0), abs(fract(p.x.div(float(SLAB_JOINT_M))).sub(float(0.5))).mul(float(SLAB_JOINT_M)));
  const jointZ = smoothstep(float(0.006), float(0.0), abs(fract(p.z.div(float(SLAB_JOINT_M))).sub(float(0.5))).mul(float(SLAB_JOINT_M)));
  const slabJoint = max(jointX, jointZ);
  const joint = isBlock.select(blockJoint, slabJoint);
  // RING FIX (row 6). The 2.5 mm broom grating fed albedo and roughness
  // unfaded: point sampling turns it into concentric moire rings past ~2 m
  // (interim-3 border-path-close, driveway-apron-close), so the "harmless
  // average" claim in the BROOM comment above holds only for area sampling.
  // The grating now fades over the same 1.2-3 m band as its relief, which
  // leaves the height term below byte-identical while the albedo/roughness
  // moire is gone at walking distance.
  const broomPeriod = float(BROOM_PERIOD_M);
  const broomFade = detailFalloff(BROOM_RELIEF_NEAR_M, BROOM_RELIEF_FAR_M);
  const relief = isBlock.select(float(0), abs(fract(p.z.div(broomPeriod)).sub(float(0.5))).mul(float(2)).mul(broomFade));
  const slabUnit = hash2(vec2(
    floor(p.x.div(float(SLAB_JOINT_M))),
    floor(p.z.div(float(SLAB_JOINT_M))),
  )).sub(float(0.5)).mul(float(0.09));
  const blockUnit = hash2(vec2(floor(stretcherU), courseIdx)).sub(float(0.5)).mul(float(0.11));
  const unit = isBlock.select(blockUnit, slabUnit);
  const footY = uniforms.concreteFootY;
  const apronDamp = smoothstep(float(0.75), float(0.0), wear.soilMask.mul(float(1.6)));
  const verticalDamp = smoothstep(footY.add(float(0.24)), footY.add(float(0.02)), p.y);
  const damp = isApron.select(apronDamp, verticalDamp);
  const blockSpall = smoothstep(float(0.55), float(0.86), wear.scuff)
    .mul(smoothstep(footY.add(float(0.10)), footY.add(float(0.16)), p.y));
  const spall = isApron.select(float(0), blockSpall);
  const base = uniforms.baseColor.mul(wear.albedoMul).mul(float(1).add(unit));
  const damped = base.mul(float(1).sub(damp.mul(float(0.20))));
  const finished = damped.mul(float(1).sub(relief.mul(float(0.045))));
  const jointed = mix(finished, finished.mul(float(0.58)), joint);
  const spalled = mix(jointed, jointed.mul(float(1.22)), spall.mul(float(0.7)));
  // WEATHERING BAND. Rain runs off a wall and loads its lower half with grime
  // and algae; the top stays washed. It is a 0.55 m gradient off the foot, one
  // sided (dirt only ever subtracts) and tinted toward the soil colour rather
  // than simply darkened, because grey concrete going grey-green is what the
  // eye reads as weather and grey concrete going black is what it reads as a
  // shadow bug.
  const weatherBand = smoothstep(footY.add(float(WEATHER_BAND_M)), footY.add(float(0.05)), p.y)
    .mul(isApron.select(float(0), float(1)))
    .mul(wear.soilMask.mul(float(0.55)).add(float(0.45)));
  const weathered = mix(spalled, spalled.mul(float(0.80)).mul(linearSwatch(0xb8b6a4).mul(float(1.35))), weatherBand.mul(float(0.34)));
  // RELIEF. Mortar recess, sawn joint, broom tooth and spall, in metres.
  const height = joint.mul(isBlock.select(float(MORTAR_RECESS_M), float(SLAB_JOINT_RECESS_M)))
    .add(relief.mul(float(BROOM_RELIEF_M)))
    .add(spall.mul(float(SPALL_RELIEF_M)))
    .add(unit.mul(float(0.004)));
  concreteGraph = {
    colorNode: weathered,
    roughnessNode: clamp(
      wear.roughness
        .add(joint.mul(float(0.05)))
        .add(weatherBand.mul(float(0.08)))
        .sub(damp.mul(float(0.14)))
        .add(relief.mul(float(0.05))),
      float(0.25),
      float(1.0),
    ),
    normalNode: reliefNormal(height),
  };
  return concreteGraph;
}

export function createConcreteMaterial(
  name: string,
  baseSrgb: number,
  options: ConcreteOptions = {},
): MeshStandardNodeMaterial {
  const variant = options.variant ?? 'apron';
  const spec = concreteSpec(name, baseSrgb, options.polygonOffset);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(baseSrgb);
  if (options.polygonOffset !== undefined) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = options.polygonOffset;
    mat.polygonOffsetUnits = options.polygonOffset;
  }

  const uniforms = createNuketown2Uniforms(spec, baseSrgb, 0x6b5741, mat);
  setNuketown2FamilyUniform(uniforms, 'concreteVariant', variant === 'apron' ? 0 : variant === 'kerb' ? 1 : 2);
  setNuketown2FamilyUniform(uniforms, 'concreteFootY', options.dampFootY ?? 0.0);
  const shared = sharedConcreteGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  mat.normalNode = shared.normalNode;
  return mat;
}

export function createNuketown2KerbMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-kerb', KERB_CONCRETE_SRGB, { variant: 'kerb', dampFootY: 0 });
}
export function createNuketown2DriveMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-drive-decal', DRIVEWAY_APRON_SRGB, { variant: 'apron', polygonOffset: -1 });
}
