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
import { buildDetailNormal, buildWear, wallUv } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';

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
    roughness: 0.74,
    metalness: 0.0,
    grain: { sizeM: 0.0009, albedo: 0.030, roughness: 0.05 },
    scuff: { sizeM: 0.045, albedo: 0.055, roughness: 0.09 },
    traffic: { sizeM: 1.6, albedo: 0.070, roughness: 0.07 },
    soil: 0.070,
    // 2.8 m is a bay of wall between two windows, which is the unit a painter
    // actually works in and the unit a repaint drifts by; 0.14 m is just under
    // one board exposure, so the mottle crosses courses instead of striping
    // them. 4 degrees of tilt is the board's own cup and the brush's tooth -
    // enough for the sun to find, far short of anything that reads as relief.
    variation: {
      macro: { sizeM: 2.8, albedo: 0.045, roughness: 0.05 },
      micro: { sizeM: 0.14, albedo: 0.030, roughness: 0.06 },
      tintSpread: 0.030,
      normalDegrees: 4.0,
      edgeWear: 0.10,
      soilRoughness: 0.08,
      polishRoughness: 0.05,
    },
  });
}

let sidingGraph: { colorNode: any; roughnessNode: any; normalNode: any } | null = null;

function sharedSidingGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any; normalNode: any } {
  if (sidingGraph) return sidingGraph;
  const spec = sidingSpec('nuketown2-siding-shared', 0x46809f);
  const p = positionWorld;
  const uv = wallUv();
  const wear = buildWear(spec, uv, undefined, uniforms);
  const courseV = p.y.div(float(SIDING_COURSE_M));
  const courseIdx = floor(courseV);
  const withinCourse = fract(courseV);
  const lapBand = smoothstep(float(0.80), float(1.0), withinCourse);
  const dripCore = smoothstep(float(0.972), float(1.0), withinCourse);
  const dripShadow = max(lapBand.mul(float(0.62)), dripCore);
  const topCatch = smoothstep(float(0.06), float(0.0), withinCourse);
  const nailRun = abs(fract(uv.x.div(float(0.4))).sub(float(0.5))).mul(float(0.4));
  const nailHeight = abs(withinCourse.sub(float(0.136))).mul(float(SIDING_COURSE_M));
  const nail = smoothstep(float(0.004), float(0.0015), max(nailRun, nailHeight));
  const jointRun = uv.x.add(courseIdx.mul(float(1.15))).div(float(SIDING_BOARD_RUN_M));
  const joint = smoothstep(float(0.0012), float(0.0), abs(fract(jointRun).sub(float(0.5))).mul(float(SIDING_BOARD_RUN_M)));
  const isUpper = smoothstep(
    uniforms.sidingWainscotTop.sub(float(0.004)),
    uniforms.sidingWainscotTop.add(float(0.004)),
    p.y,
  );
  const wainscotBase = mix(uniforms.sidingWainscotColor, uniforms.baseColor, isUpper);
  const base = (uniforms.sidingWainscot as any).greaterThan(float(0.5)).select(wainscotBase, uniforms.baseColor);
  const sunFade = smoothstep(float(1.2), float(5.2), p.y).mul(float(0.09));
  const splash = smoothstep(float(0.55), float(0.02), p.y).mul(float(0.16));
  const painted = base.mul(wear.albedoMul).mul(wear.tint).mul(float(1).add(sunFade)).mul(float(1).sub(splash));
  const shadowed = mix(painted, painted.mul(vec3(0.46, 0.44, 0.40)), max(dripShadow, joint.mul(float(0.7))));
  const lit = mix(shadowed, shadowed.mul(float(1.12)), topCatch.mul(float(0.6)));
  // EDGE WEAR on the one chamfer this family models: the top lip of every lap
  // board, where a ladder, a hose and thirty summers take the paint back
  // towards primer. Paint fails at an arris first, and an arris that stays the
  // same colour as the field is the tell that a surface was tinted rather than
  // weathered.
  const arris = mix(lit, lit.mul(float(1).add(uniforms.edgeWear.mul(float(2.0)))), topCatch);
  sidingGraph = {
    colorNode: mix(arris, arris.mul(float(0.82)), nail.mul(float(0.5))),
    roughnessNode: wear.roughness
      .add(dripShadow.mul(float(0.06)))
      .add(splash.mul(float(0.10)))
      .sub(sunFade.mul(float(0.30)))
      .sub(topCatch.mul(uniforms.edgeWear)),
    normalNode: buildDetailNormal(uniforms, uv),
  };
  return sidingGraph;
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

  const uniforms = createNuketown2Uniforms(spec, baseSrgb, 0x6b5741, mat);
  const sharedWainscotHex = options.wainscotSrgb;
  const breakY = options.wainscotTopY ?? 2.76;
  const snapped = Math.round(breakY / SIDING_COURSE_M) * SIDING_COURSE_M;
  setNuketown2FamilyUniform(uniforms, 'sidingWainscot', sharedWainscotHex === undefined ? 0 : 1);
  setNuketown2FamilyUniform(uniforms, 'sidingWainscotColor', new THREE.Color().setHex(sharedWainscotHex ?? baseSrgb, THREE.SRGBColorSpace));
  setNuketown2FamilyUniform(uniforms, 'sidingWainscotTop', snapped);
  const shared = sharedSidingGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  mat.normalNode = shared.normalNode;
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
