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
import { buildWear, linearSwatch, wallUv } from '../wear';
import { reliefNormal } from '../relief';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { hash2 } from '../../map3/noise';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';
import {
  attachNuketown2TextureBridge,
  createNuketown2TextureBridge,
  textureSetSamples,
  type Nuketown2TextureBridge,
} from '../texture-bridge';

const { abs, clamp, float, floor, fract, max, mix, positionWorld, smoothstep, vec2, vec3 } =
  TSL as unknown as Record<string, any>;

/** Board exposure, metres. */
export const SIDING_COURSE_M = 0.184;
/** Butt-joint spacing along the run, metres. */
const SIDING_BOARD_RUN_M = 3.6;

/**
 * How far a board's butt stands proud of the course beneath it, metres.
 *
 * A 7 1/4 in lap board is milled 11 mm at the butt and 5 mm at the top edge,
 * so the exposed face is a shallow wedge and the butt overhangs the course
 * below by the full 11 mm. THAT overhang is the whole reading of lap siding:
 * a ladder of hard shadow lines under lit lips. The shipped material painted
 * the shadow into the albedo and left the lip flat, which is why every wall in
 * the arena read as a printed board rather than a built one.
 */
export const SIDING_LAP_PROUD_M = 0.010;
/** A caulked butt joint between two boards recesses this far, metres. */
const SIDING_JOINT_RELIEF_M = -0.0018;
/** A nail head dimples the paint film this deep, metres. */
const SIDING_NAIL_RELIEF_M = -0.0012;
/**
 * Paint fails at the BUTT first - the bottom edge takes the drip line, so the
 * film lifts there and the primer shows. This is the fraction of a course, up
 * from the butt, over which that failure is authored.
 */
const SIDING_BUTT_FAILURE = 0.16;

export interface SidingOptions {
  /** Courses already exist as geometry: paint must not draw a second set of laps. */
  readonly geometricCourses?: boolean;
  /** Optional pale ground-floor paint. */
  readonly wainscotSrgb?: number;
  /** World Y at which the wainscot gives way to the upper paint. Snapped to a course. */
  readonly wainscotTopY?: number;
  readonly textureBridge?: Nuketown2TextureBridge;
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
  });
}

type SidingGraph = { colorNode: any; roughnessNode: any; normalNode: any };
const sidingGraphs = new WeakMap<object, SidingGraph>();
const maintainedPaintGraphs = new WeakMap<object, SidingGraph>();

/** Clean exterior paint: close-range brush tooth, restrained variation, no failed film. */
export function maintainedSidingSpec(name: string, baseSrgb: number): Nuketown2MaterialSpec {
  return assertSpec({
    name, family: 'siding', baseSrgb, roughness: 0.66, metalness: 0,
    grain: { sizeM: 0.0009, albedo: 0.065, roughness: 0.045 },
    scuff: { sizeM: 0.045, albedo: 0.025, roughness: 0.025 },
    traffic: { sizeM: 1.6, albedo: 0.015, roughness: 0.020 },
    soil: 0.002,
  });
}

/**
 * The arena's 220 mm boards already supply the course, lip and shadow seam.
 * Previously they also wore 184 mm shader laps and photographed laps, which
 * produced three competing stripe pitches. Keep texture tooth, not its baked
 * shadows: bounded albedo modulation and a small normal contribution let the
 * authored boards, window frames and eaves carry the construction.
 */
function maintainedPaintGraph(uniforms: Nuketown2Uniforms, textureBridge: Nuketown2TextureBridge): SidingGraph {
  const cached = maintainedPaintGraphs.get(textureBridge);
  if (cached) return cached;
  const uv = wallUv();
  const spec = maintainedSidingSpec('nuketown2-maintained-siding-shared', 0xeae3cf);
  const wear = buildWear(spec, uv, undefined, uniforms);
  const samples = textureSetSamples(textureBridge, 'lapSiding', uv);
  const paint = uniforms.baseColor.mul(wear.albedoMul);
  const tooth = reliefNormal(wear.grain.mul(float(0.000035)));
  const graph = {
    colorNode: samples ? paint.mul(mix(vec3(1), samples.albedo.clamp(0.92, 1.08), float(0.30))) : paint,
    roughnessNode: samples
      ? clamp(wear.roughness.mul(float(0.92)).add(samples.roughness.mul(float(0.08))), float(0.55), float(0.82))
      : wear.roughness,
    normalNode: samples ? mix(tooth, samples.normal, float(0.06)).normalize() : tooth,
  };
  maintainedPaintGraphs.set(textureBridge, graph);
  return graph;
}

function sharedSidingGraph(uniforms: Nuketown2Uniforms, textureBridge: Nuketown2TextureBridge): SidingGraph {
  const cached = sidingGraphs.get(textureBridge);
  if (cached) return cached;
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
  const joint = smoothstep(float(0.0035), float(0.0), abs(fract(jointRun).sub(float(0.5))).mul(float(SIDING_BOARD_RUN_M)));
  // Per-BOARD paint variation. Two boards off the same tin never dry the same
  // shade, and a wall of identical boards is one of the cheapest CG tells
  // there is - the shipped graph had none, so every course was the exact same
  // value from eaves to plinth.
  const boardTone = hash2(vec2(floor(jointRun), courseIdx)).sub(float(0.5)).mul(float(0.075));
  // Paint failure at the butt: the film lifts off the drip edge and the primer
  // under it shows. A 22 % albedo step, which is the visible-wear rule
  // (spec.ts MIN_ALBEDO_WEAR_STEP) applied where the failure actually starts.
  const buttFailure = smoothstep(float(SIDING_BUTT_FAILURE), float(0.0), withinCourse)
    .mul(smoothstep(float(0.30), float(0.78), wear.scuff));
  const isUpper = smoothstep(
    uniforms.sidingWainscotTop.sub(float(0.004)),
    uniforms.sidingWainscotTop.add(float(0.004)),
    p.y,
  );
  const wainscotBase = mix(uniforms.sidingWainscotColor, uniforms.baseColor, isUpper);
  const base = (uniforms.sidingWainscot as any).greaterThan(float(0.5)).select(wainscotBase, uniforms.baseColor);
  const sunFade = smoothstep(float(1.2), float(5.2), p.y).mul(float(0.06));
  const splash = smoothstep(float(0.55), float(0.02), p.y).mul(float(0.16));
  const painted = base.mul(wear.albedoMul).mul(float(1).add(sunFade)).mul(float(1).sub(splash)).mul(float(1).add(boardTone));
  // Primer grey, not a darkening: paint failure on a saturated wall LIGHTENS
  // and on a pale wall darkens slightly, which is what makes it read as bare
  // undercoat rather than as dirt.
  const failed = mix(painted, linearSwatch(0x9b9384).mul(wear.albedoMul), buttFailure.mul(float(0.55)));
  const shadowed = mix(failed, failed.mul(vec3(0.46, 0.44, 0.40)), max(dripShadow, joint.mul(float(0.7))));
  const lit = mix(shadowed, shadowed.mul(float(1.07)), topCatch.mul(float(0.5)));
  // RELIEF. The lap is a sawtooth in height: full proud at the butt
  // (withinCourse -> 0), milled away to nothing at the top edge
  // (withinCourse -> 1), then the next board's butt starts again. The constant
  // slope over the face tilts each board ~3 deg out of the wall, which is what
  // it really is; the discontinuity at the course line is the shadow.
  const height = float(1).sub(withinCourse).mul(float(SIDING_LAP_PROUD_M))
    .add(joint.mul(float(SIDING_JOINT_RELIEF_M)))
    .add(nail.mul(float(SIDING_NAIL_RELIEF_M)))
    .add(buttFailure.mul(float(-0.0006)));
  const proceduralColor = mix(lit, lit.mul(float(0.82)), nail.mul(float(0.5)));
  const proceduralRoughness = clamp(
      wear.roughness
        .add(dripShadow.mul(float(0.06)))
        .add(splash.mul(float(0.10)))
        .add(buttFailure.mul(float(0.22)))
        .sub(sunFade.mul(float(0.30))),
      float(0.20),
      float(1.0),
    );
  const textureSamples = textureSetSamples(textureBridge, 'lapSiding', uv);
  const relief = reliefNormal(height);
  sidingGraphs.set(textureBridge, {
    colorNode: textureSamples ? proceduralColor.mul(textureSamples.albedo) : proceduralColor,
    roughnessNode: textureSamples
      ? clamp(proceduralRoughness.mul(float(0.72)).add(textureSamples.roughness.mul(float(0.28))), float(0.20), float(1.0))
      : proceduralRoughness,
    normalNode: textureSamples ? mix(relief, textureSamples.normal, float(0.68)).normalize() : relief,
  });
  return sidingGraphs.get(textureBridge)!;
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
  const textureBridge = options.textureBridge ?? createNuketown2TextureBridge();
  const spec = options.geometricCourses ? maintainedSidingSpec(name, baseSrgb) : sidingSpec(name, baseSrgb);
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
  const shared = options.geometricCourses
    ? maintainedPaintGraph(uniforms, textureBridge)
    : sharedSidingGraph(uniforms, textureBridge);
  mat.userData.nuketown2SidingCourseAuthority = options.geometricCourses ? 'geometry' : 'material';
  mat.userData.nuketown2Spec = spec;
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  mat.normalNode = shared.normalNode;
  attachNuketown2TextureBridge(mat, textureBridge, ['lapSiding']);
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
