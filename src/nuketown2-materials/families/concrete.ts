/**
 * families/concrete.ts — kerbs, driveway aprons, porch slabs and block.
 *
 * REAL SIZES. A poured slab is jointed to stop it cracking where it likes: a
 * sawn control joint is 3-5 mm wide and about a quarter of the slab depth, cut
 * at 24-30 times the thickness, which for a 100 mm drive is a joint every
 * 2.4-3.0 m. Between joints the surface is broom-finished — parallel 1 mm
 * ridges at 2-3 mm pitch, always square to the pour, never radial. A kerb is a
 * separate pour with a 12 mm radius nose that chips, and its face is where
 * every rainstorm leaves a tide mark.
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
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { buildWear, groundUv, linearSwatch } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';

const { abs, clamp, float, fract, max, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Control-joint spacing on a 100 mm slab, metres. */
export const SLAB_JOINT_M = 2.7;

export type ConcreteVariant = 'apron' | 'kerb' | 'block';

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

  const p = positionWorld;
  const uv = groundUv();
  const wear = buildWear(spec, uv);

  // --- Sawn control joints -------------------------------------------------
  // Both axes, because a drive is jointed as a grid. 4 mm of a 2.7 m bay.
  const jointX = smoothstep(float(0.006), float(0.0), abs(fract(p.x.div(float(SLAB_JOINT_M))).sub(float(0.5))).mul(float(SLAB_JOINT_M)));
  const jointZ = smoothstep(float(0.006), float(0.0), abs(fract(p.z.div(float(SLAB_JOINT_M))).sub(float(0.5))).mul(float(SLAB_JOINT_M)));
  const joint = max(jointX, jointZ);

  // --- Broom finish --------------------------------------------------------
  // Straight parallel ridges at 2.5 mm pitch, square to the pour. Not noise:
  // a broom leaves lines, and noise instead of lines is the tell.
  const broom = abs(fract(p.z.div(float(0.0025))).sub(float(0.5))).mul(float(2));

  // --- Per-bay pour tone ---------------------------------------------------
  // Two adjacent bays poured from two trucks are never the same grey, and the
  // joint between them is where you see it.
  const bay = vec2(
    p.x.div(float(SLAB_JOINT_M)).sub(fract(p.x.div(float(SLAB_JOINT_M)))),
    p.z.div(float(SLAB_JOINT_M)).sub(fract(p.z.div(float(SLAB_JOINT_M)))),
  );
  const bayTone = fract(bay.x.mul(float(0.317)).add(bay.y.mul(float(0.713)))).sub(float(0.5)).mul(float(0.09));

  // --- Damp band -----------------------------------------------------------
  // Wicking from the foot of the pour. On a kerb face this is the tide mark;
  // on a slab it is the apron at the foot of the wall behind it.
  const footY = options.dampFootY ?? 0.0;
  const damp = variant === 'kerb'
    ? smoothstep(float(footY + 0.22), float(footY + 0.02), p.y)
    : smoothstep(float(0.75), float(0.0), wear.soilMask.mul(float(1.6)));

  const base = linearSwatch(baseSrgb).mul(wear.albedoMul).mul(float(1).add(bayTone));
  const damped = base.mul(float(1).sub(damp.mul(float(0.20))));
  const broomed = damped.mul(float(1).sub(broom.mul(float(0.045))));
  const jointed = mix(broomed, broomed.mul(float(0.58)), joint);

  // Kerb nose chips: a spall exposes the pale unweathered core, so this is a
  // LIGHT step, not a dark one — getting that backwards is the "cracks drawn
  // dark" CG tell.
  const spall = variant === 'kerb'
    ? smoothstep(float(0.55), float(0.86), wear.scuff).mul(smoothstep(float(footY + 0.10), float(footY + 0.16), p.y))
    : float(0);
  mat.colorNode = mix(jointed, jointed.mul(float(1.22)), spall.mul(float(0.7)));

  mat.roughnessNode = clamp(
    wear.roughness.add(joint.mul(float(0.05))).sub(damp.mul(float(0.14))).add(broom.mul(float(0.05))),
    float(0.25),
    float(1.0),
  );
  return mat;
}

export function createNuketown2KerbMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-kerb', 0x9a978a, { variant: 'kerb', dampFootY: 0.0 });
}
export function createNuketown2DriveMaterial(): MeshStandardNodeMaterial {
  return createConcreteMaterial('nuketown2-drive-decal', 0x8b8879, { variant: 'apron', polygonOffset: -1 });
}
