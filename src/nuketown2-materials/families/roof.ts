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

export function createRoofMaterial(name = 'nuketown2-roof-shingles'): MeshStandardNodeMaterial {
  const spec = roofSpec(name);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(spec.baseSrgb);

  const p = positionWorld;
  // The roof planes run along X and fall along Z, so the course coordinate is
  // Z and the run is X — the same convention the arena builds them on.
  const uv = vec2(p.x, p.z);
  const wear = buildWear(spec, uv);

  const courseV = p.z.div(float(SHINGLE_COURSE_M));
  const courseIdx = floor(courseV);
  const withinCourse = fract(courseV);

  // Brick bond: half a tab of stagger per course.
  const tabU = p.x.add(courseIdx.mul(float(SHINGLE_TAB_M * 0.5))).div(float(SHINGLE_TAB_M));
  const tabIdx = floor(tabU);

  // 3 mm keyway of the 333 mm tab.
  const keyway = smoothstep(float(0.010), float(0.0), abs(fract(tabU).sub(float(0.5))).mul(float(SHINGLE_TAB_M)));
  // The butt of each course throws its own shadow onto the course below: a
  // shingle is 3 mm proud, and at this sun that is a 10-14 mm shadow.
  const buttShadow = smoothstep(float(0.90), float(1.0), withinCourse);

  // Per-shingle tonal spread. Real bundles are not one colour and a roof laid
  // from three bundles shows it.
  const shingleTone = hash2(vec2(tabIdx, courseIdx)).sub(float(0.5)).mul(float(0.16));

  // Granule loss: the scuff scale, thresholded so it has an edge, revealing
  // the black asphalt mat under the mineral bed.
  const granuleLoss = smoothstep(float(0.35), float(0.72), wear.scuff);
  const matAsphalt = linearSwatch(0x2a2b2b);

  const base = linearSwatch(spec.baseSrgb).mul(wear.albedoMul).mul(float(1).add(shingleTone));
  const withLoss = mix(base, matAsphalt, granuleLoss.mul(float(0.55)));

  // Algae streaks run DOWN the slope, so they are stretched hard along Z and
  // narrow along X. They are the darkest thing on a real suburban roof.
  const streak = smoothstep(
    float(0.58),
    float(0.86),
    fract(p.x.mul(float(1.7)).add(wear.soilMask.mul(float(0.4)))),
  ).mul(wear.soilMask);

  const shaded = mix(withLoss, withLoss.mul(float(0.30)), max(buttShadow, keyway));
  mat.colorNode = mix(shaded, shaded.mul(float(0.74)), streak.mul(float(0.5)));
  mat.roughnessNode = wear.roughness
    .add(granuleLoss.mul(float(-0.12)))
    .sub(buttShadow.mul(float(0.05)));

  return mat;
}

export function createNuketown2RoofMaterial(): MeshStandardNodeMaterial {
  return createRoofMaterial();
}
