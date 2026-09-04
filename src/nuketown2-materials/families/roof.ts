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
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { hash2 } from '../../map3/noise';
import { bindNuketown2WearUniforms, NUKETOWN2_UNIFORMS } from '../material-uniforms';

const { abs, float, floor, fract, max, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Course exposure, metres. */
export const SHINGLE_COURSE_M = 0.143;
/** Tab width, metres. */
export const SHINGLE_TAB_M = 0.333;

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

let roofGraph: { colorNode: any; roughnessNode: any } | null = null;

function sharedRoofGraph(): { colorNode: any; roughnessNode: any } {
  if (roofGraph) return roofGraph;
  const spec = roofSpec('nuketown2-roof-shared');
  const p = positionWorld;
  const wear = buildWear(spec, vec2(p.x, p.z));
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
  const base = NUKETOWN2_UNIFORMS.baseColor.mul(wear.albedoMul).mul(float(1).add(shingleTone));
  const withLoss = mix(base, matAsphalt, granuleLoss.mul(float(0.55)));
  const streakField = fract(p.x.mul(float(1.7)).add(wear.soilMask.mul(float(0.4))));
  const streak = smoothstep(float(0.58), float(0.86), streakField).mul(wear.soilMask);
  const shaded = mix(withLoss, withLoss.mul(float(0.30)), max(buttShadow, keyway));
  roofGraph = {
    colorNode: mix(shaded, shaded.mul(float(0.74)), streak.mul(float(0.5))),
    roughnessNode: wear.roughness.add(granuleLoss.mul(float(-0.12))).sub(buttShadow.mul(float(0.05))),
  };
  return roofGraph;
}

export function createRoofMaterial(name = 'nuketown2-roof-shingles'): MeshStandardNodeMaterial {
  const spec = roofSpec(name);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(spec.baseSrgb);

  bindNuketown2WearUniforms(mat, spec, spec.baseSrgb);
  const shared = sharedRoofGraph();
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  return mat;
}

export function createNuketown2RoofMaterial(): MeshStandardNodeMaterial {
  return createRoofMaterial();
}
