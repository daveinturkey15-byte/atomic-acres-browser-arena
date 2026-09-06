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
import { boxUv, buildWear } from '../wear';
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

export type ConcreteVariant = 'apron' | 'kerb' | 'block';
/**
 * DAY-VISUAL-A (HF-535): tidy kerbs. The kerb variant keeps its tide-mark
 * damp band but at this fraction of the wall strength, so the kerb line
 * reads poured-and-kept rather than rain-streaked. Apron and block unchanged.
 */
export const KERB_TIDY_DAMP_SCALE = 0.6;

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

let concreteGraph: { colorNode: any; roughnessNode: any } | null = null;

function sharedConcreteGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any } {
  if (concreteGraph) return concreteGraph;
  const spec = concreteSpec('nuketown2-concrete-shared', 0x9a978a);
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
  const relief = isBlock.select(float(0), abs(fract(p.z.div(float(0.0025))).sub(float(0.5))).mul(float(2)));
  const slabUnit = hash2(vec2(
    floor(p.x.div(float(SLAB_JOINT_M))),
    floor(p.z.div(float(SLAB_JOINT_M))),
  )).sub(float(0.5)).mul(float(0.09));
  const blockUnit = hash2(vec2(floor(stretcherU), courseIdx)).sub(float(0.5)).mul(float(0.11));
  const unit = isBlock.select(blockUnit, slabUnit);
  const footY = uniforms.concreteFootY;
  const apronDamp = smoothstep(float(0.75), float(0.0), wear.soilMask.mul(float(1.6)));
  const verticalDamp = smoothstep(footY.add(float(0.24)), footY.add(float(0.02)), p.y);
  const damp = isApron.select(apronDamp, verticalDamp).mul(
    isApron.select(float(1), isBlock.select(float(1), float(KERB_TIDY_DAMP_SCALE))),
  );
  const blockSpall = smoothstep(float(0.55), float(0.86), wear.scuff)
    .mul(smoothstep(footY.add(float(0.10)), footY.add(float(0.16)), p.y));
  const spall = isApron.select(float(0), blockSpall);
  const base = uniforms.baseColor.mul(wear.albedoMul).mul(float(1).add(unit));
  const damped = base.mul(float(1).sub(damp.mul(float(0.20))));
  const finished = damped.mul(float(1).sub(relief.mul(float(0.045))));
  const jointed = mix(finished, finished.mul(float(0.58)), joint);
  concreteGraph = {
    colorNode: mix(jointed, jointed.mul(float(1.22)), spall.mul(float(0.7))),
    roughnessNode: clamp(
      wear.roughness.add(joint.mul(float(0.05))).sub(damp.mul(float(0.14))).add(relief.mul(float(0.05))),
      float(0.25),
      float(1.0),
    ),
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
  return mat;
}

export function createNuketown2KerbMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-kerb', 0x9a978a, { variant: 'kerb', dampFootY: 0 });
}
export function createNuketown2DriveMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-drive-decal', 0x8b8879, { variant: 'apron', polygonOffset: -1 });
}
