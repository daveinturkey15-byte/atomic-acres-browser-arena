/**
 * families/roof.ts — asphalt shingle roof.
 *
 * REAL SIZES. A three-tab strip shingle is 1000 x 333 mm and is laid to a
 * 143 mm exposure, so five courses to the metre, and each course laps the one
 * below by more than half its height — which is why the frame reads as a
 * ladder of hard horizontal lines with a soft shadow under each. The keyway
 * slots between tabs are 3 mm wide at 333 mm centres and are staggered half a
 * tab per course, so the pattern is a brick bond, not a grid.
 *
 * WEAR:
 *   - grain    1.1 mm : the mineral granule bed itself
 *   - scuff    60 mm  : granule loss patches — these expose the darker asphalt
 *                       mat under the granules, which is a real albedo STEP
 *                       down, not a roughness change
 *   - traffic  2.2 m  : algae streaking down-slope from the ridge and sun
 *                       bleaching on the exposed field
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { buildWear, linearSwatch } from '../wear';
import { reliefNormal } from '../relief';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { hash2 } from '../../map3/noise';
import { createNuketown2Uniforms, type Nuketown2Uniforms } from '../material-uniforms';

const { abs, clamp, float, floor, fract, max, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Course exposure, metres. */
export const SHINGLE_COURSE_M = 0.143;
/** Tab width, metres. */
export const SHINGLE_TAB_M = 0.333;

/**
 * How far a shingle butt stands proud of the course below it, metres.
 *
 * A strip shingle is a 3.5 mm asphalt mat plus its granule bed, and every
 * course laps the one below, so the butt line is a real 4 mm step that throws a
 * hard shadow down-slope. Five courses to the metre means the whole roof plane
 * is a ladder of those steps - the single strongest horizontal rhythm on any
 * house in the arena, and it was painted flat into the albedo.
 */
export const SHINGLE_BUTT_PROUD_M = 0.004;
/** The 3 mm keyway between tabs runs to the mat, metres. */
const KEYWAY_RECESS_M = -0.0035;
/** Mineral granule bed relief, metres. Sub-millimetre, and it is what kills the plastic sheen. */
const GRANULE_RELIEF_M = 0.0007;
/** A granule-loss patch sits this far below the intact bed, metres. */
const GRANULE_LOSS_RELIEF_M = -0.0009;

export function roofSpec(name = 'nuketown2-roof-shingles'): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'roof',
    baseSrgb: 0x4a5153,
    roughness: 0.90,
    metalness: 0.02,
    grain: { sizeM: 0.0011, albedo: 0.040, roughness: 0.06 },
    scuff: { sizeM: 0.060, albedo: 0.065, roughness: 0.10 },
    traffic: { sizeM: 2.2, albedo: 0.055, roughness: 0.05 },
    soil: 0.075,
  });
}

let roofGraph: { colorNode: any; roughnessNode: any; normalNode: any } | null = null;

function sharedRoofGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any; normalNode: any } {
  if (roofGraph) return roofGraph;
  const spec = roofSpec('nuketown2-roof-shared');
  const p = positionWorld;
  const wear = buildWear(spec, vec2(p.x, p.z), undefined, uniforms);
  const courseV = p.z.div(float(SHINGLE_COURSE_M));
  const courseIdx = floor(courseV);
  const withinCourse = fract(courseV);
  const tabU = p.x.add(courseIdx.mul(float(SHINGLE_TAB_M * 0.5))).div(float(SHINGLE_TAB_M));
  const tabIdx = floor(tabU);
  const keyway = smoothstep(float(0.010), float(0.0), abs(fract(tabU).sub(float(0.5))).mul(float(SHINGLE_TAB_M)));
  const buttShadow = smoothstep(float(0.90), float(1.0), withinCourse);
  const shingleTone = hash2(vec2(tabIdx, courseIdx)).sub(float(0.5)).mul(float(0.16));
  const granuleLoss = smoothstep(float(0.35), float(0.72), wear.scuff);
  const matAsphalt = linearSwatch(0x2a2b2b);
  const base = uniforms.baseColor.mul(wear.albedoMul).mul(float(1).add(shingleTone));
  const withLoss = mix(base, matAsphalt, granuleLoss.mul(float(0.55)));
  const streakField = fract(p.x.mul(float(1.7)).add(wear.soilMask.mul(float(0.4))));
  const streak = smoothstep(float(0.58), float(0.86), streakField).mul(wear.soilMask);
  const shaded = mix(withLoss, withLoss.mul(float(0.30)), max(buttShadow, keyway));
  // RELIEF. The course sawtooth is the whole roof: proud at the butt
  // (withinCourse -> 0, the exposed edge of the shingle above), milled to
  // nothing at the head where the next course laps it.
  const height = float(1).sub(withinCourse).mul(float(SHINGLE_BUTT_PROUD_M))
    .add(keyway.mul(float(KEYWAY_RECESS_M)))
    .add(wear.grain.mul(float(GRANULE_RELIEF_M)))
    .add(granuleLoss.mul(float(GRANULE_LOSS_RELIEF_M)))
    .add(shingleTone.mul(float(0.006)));
  roofGraph = {
    colorNode: mix(shaded, shaded.mul(float(0.74)), streak.mul(float(0.5))),
    roughnessNode: clamp(
      wear.roughness.add(granuleLoss.mul(float(-0.12))).add(streak.mul(float(0.10))).sub(buttShadow.mul(float(0.05))),
      float(0.25),
      float(1.0),
    ),
    normalNode: reliefNormal(height),
  };
  return roofGraph;
}

export function createRoofMaterial(name = 'nuketown2-roof-shingles'): MeshStandardNodeMaterial {
  const spec = roofSpec(name);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(spec.baseSrgb);

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
  const shared = sharedRoofGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  mat.normalNode = shared.normalNode;
  return mat;
}

export function createNuketown2RoofMaterial(): MeshStandardNodeMaterial {
  return createRoofMaterial();
}
