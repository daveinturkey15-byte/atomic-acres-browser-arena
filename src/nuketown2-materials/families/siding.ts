/**
 * families/siding.ts — painted lap siding (horizontal weatherboard).
 *
 * REAL SIZES. US lap siding is sold by exposure, and 7 1/4 in — 0.184 m — is
 * the common residential run; the board is thicker at its butt than at its top
 * edge, so every course throws a hard 2-4 mm drip shadow onto the course under
 * it. Boards butt at 3.6 m ends over a stud, and the joint is caulked, so it
 * reads as a hairline seam, not a gap. Nails land 25 mm up from the butt at
 * 400 mm centres and each one dimples the paint.
 *
 * THE WEAR THAT MAKES IT A HOUSE AND NOT A BOX:
 *   - grain     0.9 mm : brush tooth in the paint, and the timber fibre under it
 *   - scuff     45 mm  : chalked patches, hail pocks, ladder rubs
 *   - traffic   1.6 m  : rain wash down the wall, sun fade on the exposed run,
 *                        splash-back grime in the first 0.5 m off the ground
 *
 * All three are ALBEDO terms, summing past the 10% floor, because a paint
 * defect the frame cannot see is not a paint defect.
 *
 * TWO-TONE. The reference houses are a storey-banded pair — a saturated upper
 * wall over a pale ground floor. `wainscot` expresses that as one material
 * with a real course-aligned break rather than two materials meeting at a
 * seam, which is what a real house is: the same siding, different paint.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { buildWear, uniformSwatch, wallUv } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';

const { abs, float, floor, fract, max, mix, positionWorld, smoothstep, vec3 } =
  TSL as unknown as Record<string, any>;

/** Board exposure, metres. */
export const SIDING_COURSE_M = 0.184;
/** Butt-joint spacing along the run, metres. */
const SIDING_BOARD_RUN_M = 3.6;

export interface SidingOptions {
  /** Optional pale ground-floor paint. */
  readonly wainscotSrgb?: number;
  /** World Y at which the wainscot gives way to the upper paint. Snapped to a course. */
  readonly wainscotTopY?: number;
}

export function sidingSpec(name: string, baseSrgb: number): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'siding',
    baseSrgb,
    // Intentional arena exception: the photoreal scene skill starts exterior
    // painted walls at 0.92, but this lane keeps 0.74 so the controlled key
    // still gives the visible siding a readable highlight. Albedo-carried wear
    // remains the primary carrier and the family gate retains the range check.
    roughness: 0.74,
    metalness: 0.0,
    grain: { sizeM: 0.0009, albedo: 0.030, roughness: 0.05 },
    scuff: { sizeM: 0.045, albedo: 0.055, roughness: 0.09 },
    traffic: { sizeM: 1.6, albedo: 0.070, roughness: 0.07 },
    soil: 0.070,
  });
}

/**
 * @param baseSrgb upper-wall paint, sRGB hex
 * @param name     stable material name (read by the coplanar instrument)
 */
export function createSidingMaterial(
  baseSrgb: number,
  name: string,
  options: SidingOptions = {},
): MeshStandardNodeMaterial {
  const spec = sidingSpec(name, baseSrgb);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  // Kept so the fidelity gate can still read this material's authored base
  // colour off `material.color`, and so a WebGL2 compatibility path that never
  // evaluates the node graph still gets the right house.
  mat.color.setHex(baseSrgb);

  const p = positionWorld;
  const uv = wallUv();
  const wear = buildWear(spec, uv);

  // --- Courses -------------------------------------------------------------
  const courseV = p.y.div(float(SIDING_COURSE_M));
  const courseIdx = floor(courseV);
  const withinCourse = fract(courseV);

  // The lap shadow.
  //
  // MEASURED AND CORRECTED. This first shipped as a 3 mm hard line - the true
  // width of the drip edge itself - and the review captures showed the result:
  // both houses came back as FLAT COLOURED BOXES, because 3 mm at the 8 m a
  // player reads a wall from is 0.6 of a pixel. The shipped material it
  // replaced used a 22 mm band and its courses read clearly at the same
  // distance, so this was a straight regression dressed as physical accuracy.
  //
  // The physics is on the side of the wider band anyway: a weatherboard is a
  // WEDGE, thicker at its butt, so the bottom fifth of every course tilts away
  // from the sky and sits in its own shade - a graded band roughly 35 mm deep,
  // with the drip edge itself as a hard core inside it. That is what a
  // photograph of lap siding shows, and at 8 m it is 7 px of gradient with a
  // 1 px line in it rather than 0.6 px of nothing.
  const lapBand = smoothstep(float(0.80), float(1.0), withinCourse);
  const dripCore = smoothstep(float(0.972), float(1.0), withinCourse);
  const dripShadow = max(lapBand.mul(float(0.62)), dripCore);
  // The board's own top edge catches light where it meets the course above.
  const topCatch = smoothstep(float(0.06), float(0.0), withinCourse);

  // Nail dimples: 400 mm centres, 25 mm up from the butt.
  const nailRun = abs(fract(uv.x.div(float(0.4))).sub(float(0.5))).mul(float(0.4));
  const nailHeight = abs(withinCourse.sub(float(0.136))).mul(float(SIDING_COURSE_M));
  const nail = smoothstep(float(0.004), float(0.0015), max(nailRun, nailHeight));

  // Butt joints between board ends, staggered a course at a time.
  const jointRun = uv.x.add(courseIdx.mul(float(1.15))).div(float(SIDING_BOARD_RUN_M));
  const joint = smoothstep(float(0.0012), float(0.0), abs(fract(jointRun).sub(float(0.5))).mul(float(SIDING_BOARD_RUN_M)));

  // --- Paint ---------------------------------------------------------------
  const upper = uniformSwatch(baseSrgb);
  const wainscotHex = options.wainscotSrgb;
  let base = upper;
  if (wainscotHex !== undefined) {
    const breakY = options.wainscotTopY ?? 2.76;
    // Snap the break to a real course line: a paint change that runs across
    // the middle of a board is a decal, not a house.
    const snapped = Math.round(breakY / SIDING_COURSE_M) * SIDING_COURSE_M;
    const isUpper = smoothstep(float(snapped - 0.004), float(snapped + 0.004), p.y);
    base = mix(uniformSwatch(wainscotHex), upper, isUpper);
  }

  // Sun fade lifts the exposed upper run; splash-back grime darkens the
  // bottom 0.55 m, where the ground throws rain back at the wall. Both are
  // metre-scale ALBEDO steps, which is the only reason they are visible.
  const sunFade = smoothstep(float(1.2), float(5.2), p.y).mul(float(0.09));
  const splash = smoothstep(float(0.55), float(0.02), p.y).mul(float(0.16));

  const painted = base
    .mul(wear.albedoMul)
    .mul(float(1).add(sunFade))
    .mul(float(1).sub(splash));

  // Shadow colour keeps the paint's own hue rather than desaturating to grey:
  // a warm wall in its own drip shadow is a darker warm, never a cool grey.
  const shadowed = mix(painted, painted.mul(vec3(0.46, 0.44, 0.40)), max(dripShadow, joint.mul(float(0.7))));
  const lit = mix(shadowed, shadowed.mul(float(1.12)), topCatch.mul(float(0.6)));

  mat.colorNode = mix(lit, lit.mul(float(0.82)), nail.mul(float(0.5)));
  mat.roughnessNode = wear.roughness
    .add(dripShadow.mul(float(0.06)))
    .add(splash.mul(float(0.10)))
    .sub(sunFade.mul(float(0.30)));

  return mat;
}

/** Back-compatible name used by the arena's material registry. */
export function createNuketown2LapSidingMaterial(baseColorHex: number, name: string): MeshStandardNodeMaterial {
  return createSidingMaterial(baseColorHex, name);
}

/** Exported for the gate, which measures the authored swatch rather than the frame. */
export function sidingBaseColor(hex: number): THREE.Color {
  return new THREE.Color(hex);
}
