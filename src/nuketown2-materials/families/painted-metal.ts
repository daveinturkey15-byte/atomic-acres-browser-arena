/**
 * families/painted-metal.ts — garage doors, appliance banks, coach panels.
 *
 * REAL SIZES. A sectional garage door is four or five 0.51 m panels, each
 * stamped with two raised sections; the joint between panels is a 6 mm shadow
 * line and it is the strongest horizontal in the whole street frame. Factory
 * paint on steel is a 60-120 micron film with an orange-peel texture whose
 * cells are 0.6-1.2 mm — the finest thing on the map that still reads, and the
 * reason a real door has a slightly restless highlight instead of a mirror
 * band.
 *
 * WEAR — AND THE WHOLE POINT OF THIS FAMILY:
 *   - grain    0.9 mm : orange peel
 *   - scuff    50 mm  : CHIPS. A chip in a painted steel panel exposes primer
 *                       or bare zinc, which is a 25-40% albedo step, and it is
 *                       the single most convincing thing you can put on a
 *                       painted metal surface. This is the albedo-visible-wear
 *                       rule at its purest: it cannot live in roughness.
 *   - traffic  1.5 m  : chalking (UV-degraded binder leaves a pale powdery
 *                       bloom, so albedo goes UP and gloss goes DOWN), and
 *                       rust weeping from the bottom rail.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { boxUv, buildWear, linearSwatch } from '../wear';
import { reliefNormal } from '../relief';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';

const { abs, clamp, float, fract, max, mix, positionWorld, smoothstep } =
  TSL as unknown as Record<string, any>;

/** Sectional door panel height, metres. */
export const DOOR_PANEL_M = 0.51;

/** The shadow line between two sectional door panels is a real 6 mm gap, metres. */
const PANEL_JOINT_RECESS_M = -0.006;
/** A stamped section is pressed this far out of the panel face, metres. */
const STAMP_RELIEF_M = 0.004;
/** A paint chip is a 0.1 mm ledge - too small to shade, but it breaks the specular edge. */
const CHIP_RELIEF_M = -0.00012;
/** Orange peel: the 0.9 mm cell structure of a sprayed film, metres. It is the reason a real door is not a mirror. */
const ORANGE_PEEL_M = 0.00006;

export function paintedMetalSpec(name: string, baseSrgb: number): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'painted-metal',
    baseSrgb,
    roughness: 0.42,
    // Factory paint over steel: the FILM is a dielectric. The metal is under
    // it and only shows where the film has gone, which the chip term handles.
    metalness: 0.08,
    grain: { sizeM: 0.0009, albedo: 0.025, roughness: 0.05 },
    scuff: { sizeM: 0.050, albedo: 0.080, roughness: 0.12 },
    traffic: { sizeM: 1.5, albedo: 0.055, roughness: 0.10 },
    soil: 0.070,
  });
}

export interface PaintedMetalOptions {
  /** Stamp horizontal panel joints at 0.51 m — sectional doors only. */
  readonly panelled?: boolean;
  readonly polygonOffset?: number;
  readonly roughness?: number;
  readonly metalness?: number;
}

let paintedMetalGraph: { colorNode: any; roughnessNode: any; normalNode: any } | null = null;

function sharedPaintedMetalGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any; normalNode: any } {
  if (paintedMetalGraph) return paintedMetalGraph;
  const spec = paintedMetalSpec('nuketown2-painted-metal-shared', 0xaebdc1);
  const p = positionWorld;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const panelled = uniforms.paintedPanelled;
  const panelV = p.y.div(float(DOOR_PANEL_M));
  const within = fract(panelV);
  const panelShade = max(
    smoothstep(float(1 - 0.012), float(1.0), within),
    smoothstep(float(0.012), float(0.0), within),
  ).mul(panelled);
  const section = abs(fract(within.mul(float(2))).sub(float(0.5))).mul(float(2));
  const stampLift = smoothstep(float(0.72), float(0.95), section).mul(panelled);
  const chip = smoothstep(float(0.58), float(0.74), wear.scuff);
  const primer = linearSwatch(0x9c968c);
  const chalk = smoothstep(float(0.25), float(0.85), wear.soilMask);
  const weep = smoothstep(float(0.35), float(0.0), p.y).mul(smoothstep(float(0.45), float(0.9), wear.soilMask));
  const paint = uniforms.baseColor.mul(wear.albedoMul);
  const chalked = mix(paint, paint.mul(float(1.24)), chalk.mul(float(0.45)));
  const chipped = mix(chalked, primer, chip.mul(float(0.8)));
  const rusted = mix(chipped, linearSwatch(0x7a4426), weep.mul(float(0.55)));
  const stamped = mix(rusted, rusted.mul(float(0.62)), panelShade);
  // RELIEF. Panel joint, stamped section, chip ledge and the orange peel of
  // the spray film itself. The peel is 60 microns and will never shade, but it
  // is what perturbs the specular so a door highlight moves like paint rather
  // than sliding like a mirror.
  const height = panelShade.mul(float(PANEL_JOINT_RECESS_M))
    .add(stampLift.mul(float(STAMP_RELIEF_M)))
    .add(chip.mul(float(CHIP_RELIEF_M)))
    .add(wear.grain.mul(float(ORANGE_PEEL_M)));
  paintedMetalGraph = {
    colorNode: mix(stamped, stamped.mul(float(1.08)), stampLift.mul(float(0.4))),
    roughnessNode: clamp(wear.roughness.add(chalk.mul(float(0.28))).add(chip.mul(float(0.30))).add(weep.mul(float(0.24))), float(0.15), float(1.0)),
    normalNode: reliefNormal(height),
  };
  return paintedMetalGraph;
}

export function createPaintedMetalMaterial(
  name: string,
  baseSrgb: number,
  options: PaintedMetalOptions = {},
): MeshStandardNodeMaterial {
  const spec = paintedMetalSpec(name, baseSrgb);
  const roughness = options.roughness ?? spec.roughness;
  const metalness = options.metalness ?? spec.metalness;
  const mat = new MeshStandardNodeMaterial({ roughness, metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(baseSrgb);
  if (options.polygonOffset !== undefined) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = options.polygonOffset;
    mat.polygonOffsetUnits = options.polygonOffset;
  }

  const uniforms = createNuketown2Uniforms(spec, baseSrgb, 0x6b5741, mat);
  setNuketown2FamilyUniform(uniforms, 'paintedPanelled', options.panelled === true ? 1 : 0);
  const shared = sharedPaintedMetalGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  mat.normalNode = shared.normalNode;
  return mat;
}
