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
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';

const { abs, clamp, float, fract, max, mix, positionWorld, smoothstep } =
  TSL as unknown as Record<string, any>;

/** Sectional door panel height, metres. */
export const DOOR_PANEL_M = 0.51;

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

  const p = positionWorld;
  // This family dresses door leaves (vertical) and bins, mailboxes and
  // signage (boxes), so the wear field is authored for both.
  const uv = boxUv();
  const wear = buildWear(spec, uv);

  // --- Panel joints and stampings -----------------------------------------
  let panelShade: any = float(0);
  let stampLift: any = float(0);
  if (options.panelled === true) {
    const panelV = p.y.div(float(DOOR_PANEL_M));
    const within = fract(panelV);
    // 6 mm shadow line of a 510 mm panel.
    panelShade = max(
      smoothstep(float(1 - 0.012), float(1.0), within),
      smoothstep(float(0.012), float(0.0), within),
    );
    // Two raised sections per panel, each with a lit top edge.
    const section = abs(fract(within.mul(float(2))).sub(float(0.5))).mul(float(2));
    stampLift = smoothstep(float(0.72), float(0.95), section);
  }

  // --- Chips to primer -----------------------------------------------------
  // Hard threshold: a chip has an EDGE. The exposed layer is a warm grey
  // primer, well clear of the paint in luminance either way.
  const chip = smoothstep(float(0.58), float(0.74), wear.scuff);
  const primer = linearSwatch(0x9c968c);

  // --- Chalking ------------------------------------------------------------
  // UV degradation: pale, powdery, and MATTE. Albedo up, gloss down.
  const chalk = smoothstep(float(0.25), float(0.85), wear.soilMask);

  // --- Rust weep -----------------------------------------------------------
  // Only in the first 0.35 m, where a door meets its threshold and water sits.
  const weep = smoothstep(float(0.35), float(0.0), p.y)
    .mul(smoothstep(float(0.45), float(0.9), wear.soilMask));

  const paint = linearSwatch(baseSrgb).mul(wear.albedoMul);
  const chalked = mix(paint, paint.mul(float(1.24)), chalk.mul(float(0.45)));
  const chipped = mix(chalked, primer, chip.mul(float(0.8)));
  const rusted = mix(chipped, linearSwatch(0x7a4426), weep.mul(float(0.55)));
  const stamped = mix(rusted, rusted.mul(float(0.62)), panelShade);

  mat.colorNode = mix(stamped, stamped.mul(float(1.08)), stampLift.mul(float(0.4)));
  mat.roughnessNode = clamp(
    wear.roughness.add(chalk.mul(float(0.28))).add(chip.mul(float(0.30))).add(weep.mul(float(0.24))),
    float(0.15),
    float(1.0),
  );
  return mat;
}
