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
import { lutFbm, lutRidgedFbm } from '../noise-lut';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';

const { abs, clamp, float, fract, max, min, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Half-width of the carriageway, metres — the kerb line the channel stain hugs. */
const CARRIAGEWAY_HALF_M = 5.3;
/**
 * DAY-VISUAL-A (HF-535): dark, slightly wet carriageway. How far roughness
 * drops in the damp wheel paths / patch field (soft sheen, same graph).
 */
export const ASPHALT_WET_SHEEN_ROUGHNESS_DROP = 0.18;
/**
 * DAY-VISUAL-A (HF-535): warm low-sun glint on the polished wheel paths.
 * Mix factor toward the warm swatch at full polish; the lane test pins it.
 */
export const ASPHALT_SUN_GLINT_WARM_MIX = 0.22;

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

let asphaltGraph: { colorNode: any; roughnessNode: any } | null = null;

function sharedAsphaltGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any } {
  if (asphaltGraph) return asphaltGraph;
  const spec = asphaltSpec('nuketown2-asphalt-shared');
  const p = positionWorld;
  const uv = groundUv();
  const wear = buildWear(spec, uv, uv, uniforms);
  const patchField = lutFbm(vec2(p.x.mul(float(0.085)).add(float(17.3)), p.z.mul(float(0.085)).add(float(41.1))), 3);
  const patch = smoothstep(float(0.545), float(0.572), patchField);
  const wobble = signedNoise(uv, 2.0, 2).mul(float(0.12));
  const seamLong = min(abs(p.z.add(wobble).sub(float(2.4))), abs(p.z.add(wobble).add(float(2.4))));
  const seamCross = abs(fract(p.x.div(float(6.0)).add(wobble.mul(float(0.05)))).sub(float(0.5))).mul(float(6.0));
  const seam = max(smoothstep(float(0.075), float(0.012), seamLong), smoothstep(float(0.085), float(0.015), seamCross));
  const crack = smoothstep(float(0.925), float(0.992), lutRidgedFbm(vec2(p.x.mul(float(3.0)), p.z.mul(float(3.0)))));
  const wheel = max(
    smoothstep(float(0.55), float(0.0), abs(p.z.sub(float(1.6)))),
    smoothstep(float(0.55), float(0.0), abs(p.z.add(float(1.6)))),
  );
  const channel = smoothstep(float(CARRIAGEWAY_HALF_M - 0.7), float(CARRIAGEWAY_HALF_M), abs(p.z));
  const road = uniforms.baseColor.mul(wear.albedoMul);
  const patched = mix(road, linearSwatch(0x2b2c2d).mul(wear.albedoMul), patch);
  // DAY-VISUAL-A (HF-535): dark, slightly wet carriageway. The polished wheel
  // paths carry a warm low-sun glint instead of a neutral lift, and the wheel
  // paths plus the patch field read damp through a roughness drop (soft
  // sheen). Same shared graph, no new pipeline.
  const dampSheen = max(patch.mul(float(0.6)), wheel.mul(float(0.8)));
  const sunGlint = linearSwatch(0xffc98f);
  const polished = mix(
    patched.mul(float(1).add(wheel.mul(float(0.17)))),
    sunGlint.mul(wear.albedoMul).mul(float(1.12)),
    wheel.mul(float(ASPHALT_SUN_GLINT_WARM_MIX)),
  );
  const stained = polished.mul(float(1).sub(channel.mul(float(0.13))));
  const roadColor = mix(stained, linearSwatch(0x1f2021), max(seam, crack.mul(float(0.8))));
  const markingWorn = smoothstep(float(0.15), float(0.62), wear.scuff);
  const markingColor = mix(uniforms.baseColor.mul(wear.albedoMul), linearSwatch(0x3b3d3e), markingWorn.mul(float(0.65)));
  const roadRoughness = clamp(
    wear.roughness.sub(wheel.mul(float(0.16))).sub(seam.mul(float(0.40))).add(channel.mul(float(0.04))).add(patch.mul(float(-0.06))).sub(dampSheen.mul(float(ASPHALT_WET_SHEEN_ROUGHNESS_DROP))),
    float(0.20),
    float(1.0),
  );
  const markingRoughness = wear.roughness.add(markingWorn.mul(float(0.08)));
  const isMarking = (uniforms.asphaltMarking as any).greaterThan(float(0.5));
  asphaltGraph = {
    colorNode: isMarking.select(markingColor, roadColor),
    roughnessNode: isMarking.select(markingRoughness, roadRoughness),
  };
  return asphaltGraph;
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

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
  setNuketown2FamilyUniform(uniforms, 'asphaltMarking', 0);
  const shared = sharedAsphaltGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
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

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
  setNuketown2FamilyUniform(uniforms, 'asphaltMarking', 1);
  const shared = sharedAsphaltGraph(uniforms);
  mat.colorNode = shared.colorNode;
  mat.roughnessNode = shared.roughnessNode;
  return mat;
}

export function createNuketown2AsphaltMaterial(): MeshStandardNodeMaterial {
  return createAsphaltMaterial();
}
export function createNuketown2DashMaterial(): MeshStandardNodeMaterial {
  return createMarkingMaterial();
}
