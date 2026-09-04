/**
 * families/asphalt.ts — carriageway, and the painted lane markings on it.
 *
 * REAL SIZES. A dense-graded surface course is a 10 mm-nominal aggregate in a
 * bitumen matrix; what a camera actually resolves is the 1 mm sand fraction as
 * grain and the 10-20 mm stone as a slightly coarser speckle. A paving lane is
 * 3.0-3.7 m wide and its longitudinal joint is the first thing to open, so a
 * road carries tar seams at lane spacing and wandering transverse joints where
 * the paver stopped. A cold patch is a rectangle of newer, blacker, finer mix
 * with a saw-cut edge — the sharpest albedo edge on the whole surface.
 *
 * WEAR:
 *   - grain    1.0 mm : sand fraction and the polished stone faces
 *   - scuff    35 mm  : stone pop-outs, ravelling, scars
 *   - traffic  2.6 m  : the two polished wheel paths, the oil line down the
 *                       crown, and the grit and silt that collect in the
 *                       kerb channel
 *
 * The wheel paths are the big one: they are LIGHTER than the rest of the road,
 * because traffic polishes the stone and washes the fines out, and that
 * lighter pair of stripes down the carriageway is what makes an asphalt plane
 * read as a road rather than as a dark rectangle.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { buildWear, groundUv, linearSwatch, signedNoise } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { fbm2, ridgedFbm2 } from '../../map3/noise';

const { abs, clamp, float, fract, max, min, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Half-width of the carriageway, metres — the kerb line the channel stain hugs. */
const CARRIAGEWAY_HALF_M = 5.3;

export function asphaltSpec(name = 'nuketown2-asphalt-road'): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'asphalt',
    baseSrgb: 0x3b3d3e,
    roughness: 0.95,
    metalness: 0.02,
    grain: { sizeM: 0.0010, albedo: 0.035, roughness: 0.05 },
    scuff: { sizeM: 0.035, albedo: 0.050, roughness: 0.08 },
    traffic: { sizeM: 2.6, albedo: 0.060, roughness: 0.10 },
    soil: 0.080,
    polygonOffset: -1,
  });
}

export function createAsphaltMaterial(name = 'nuketown2-asphalt-road'): MeshStandardNodeMaterial {
  const spec = asphaltSpec(name);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(spec.baseSrgb);
  // HF-434 coplanar tier, preserved verbatim: the road sits on the ground
  // slab's top face and must win that depth race deterministically.
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const p = positionWorld;
  const uv = groundUv();
  const wear = buildWear(spec, uv);

  // --- Cold patches --------------------------------------------------------
  // Thresholded hard so the edge reads as a saw cut. The patch is BLACKER and
  // finer than the road around it, and its own aggregate is smaller.
  const patchField = fbm2(vec2(p.x.mul(float(0.085)).add(float(17.3)), p.z.mul(float(0.085)).add(float(41.1))), 3);
  const patch = smoothstep(float(0.545), float(0.572), patchField);

  // --- Tar seams -----------------------------------------------------------
  // Longitudinal joints at paving-lane spacing, plus transverse joints every
  // 6 m. A sealed seam is a glossy black ribbon: dark albedo AND low
  // roughness, which is what makes it catch the sun as a line.
  const wobble = signedNoise(uv, 2.0, 2).mul(float(0.12));
  const seamLong = min(
    abs(p.z.add(wobble).sub(float(2.4))),
    abs(p.z.add(wobble).add(float(2.4))),
  );
  const seamCross = abs(fract(p.x.div(float(6.0)).add(wobble.mul(float(0.05)))).sub(float(0.5))).mul(float(6.0));
  const seam = max(
    smoothstep(float(0.075), float(0.012), seamLong),
    smoothstep(float(0.085), float(0.015), seamCross),
  );

  // --- Cracks --------------------------------------------------------------
  const crack = smoothstep(float(0.925), float(0.992), ridgedFbm2(vec2(p.x.mul(float(3.0)), p.z.mul(float(3.0))), 3));

  // --- Wheel paths ---------------------------------------------------------
  // Two polished lanes at +/- 1.6 m from the crown, 0.9 m wide, LIGHTER than
  // the road: this is the metre-scale albedo step the whole surface needs.
  const wheel = max(
    smoothstep(float(0.55), float(0.0), abs(p.z.sub(float(1.6)))),
    smoothstep(float(0.55), float(0.0), abs(p.z.add(float(1.6)))),
  );

  // --- Kerb channel --------------------------------------------------------
  // Grit, silt and tyre grime bank up in the last 0.7 m before the kerb.
  const channel = smoothstep(float(CARRIAGEWAY_HALF_M - 0.7), float(CARRIAGEWAY_HALF_M), abs(p.z));

  const road = linearSwatch(spec.baseSrgb).mul(wear.albedoMul);
  const patched = mix(road, linearSwatch(0x2b2c2d).mul(wear.albedoMul), patch);
  const polished = patched.mul(float(1).add(wheel.mul(float(0.17))));
  const stained = polished.mul(float(1).sub(channel.mul(float(0.13))));
  const seamed = mix(stained, linearSwatch(0x1f2021), max(seam, crack.mul(float(0.8))));

  mat.colorNode = seamed;
  mat.roughnessNode = clamp(
    wear.roughness
      .sub(wheel.mul(float(0.16)))
      .sub(seam.mul(float(0.40)))
      .add(channel.mul(float(0.04)))
      .add(patch.mul(float(-0.06))),
    float(0.20),
    float(1.0),
  );

  return mat;
}

/**
 * Worn thermoplastic lane marking.
 *
 * A road dash is not white: it is a dirty warm off-white that the tyres have
 * scrubbed the aggregate through, and by the end of its life half the bar is
 * road showing through. That bite-through is the wear that makes the marking
 * look painted on rather than modelled in.
 */
export function markingSpec(name = 'nuketown2-trim-decal'): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'asphalt',
    baseSrgb: 0xd9d3c2,
    roughness: 0.86,
    metalness: 0.02,
    grain: { sizeM: 0.0010, albedo: 0.035, roughness: 0.05 },
    scuff: { sizeM: 0.050, albedo: 0.070, roughness: 0.10 },
    traffic: { sizeM: 1.4, albedo: 0.075, roughness: 0.08 },
    soil: 0.110,
    polygonOffset: -2,
  });
}

export function createMarkingMaterial(name = 'nuketown2-trim-decal'): MeshStandardNodeMaterial {
  const spec = markingSpec(name);
  const mat = new MeshStandardNodeMaterial({ roughness: spec.roughness, metalness: spec.metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(spec.baseSrgb);
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;

  const uv = groundUv();
  const wear = buildWear(spec, uv);
  // Bite-through: where the scuff field is high the paint has gone and the
  // road under it shows. A hard threshold, because a worn marking has a
  // ragged EDGE — a soft fade reads as a dirty decal.
  const worn = smoothstep(float(0.15), float(0.62), wear.scuff);
  const paint = linearSwatch(spec.baseSrgb).mul(wear.albedoMul);
  mat.colorNode = mix(paint, linearSwatch(0x3b3d3e), worn.mul(float(0.65)));
  mat.roughnessNode = wear.roughness.add(worn.mul(float(0.08)));
  return mat;
}

export function createNuketown2AsphaltMaterial(): MeshStandardNodeMaterial {
  return createAsphaltMaterial();
}
export function createNuketown2DashMaterial(): MeshStandardNodeMaterial {
  return createMarkingMaterial();
}
