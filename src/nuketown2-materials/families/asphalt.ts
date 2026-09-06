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
import { buildWear, detailFalloff, groundUv, linearSwatch, signedNoise } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { lutFbm, lutRidgedFbm } from '../noise-lut';
import { reliefNormal } from '../relief';
import { createNuketown2Uniforms, type Nuketown2Uniforms, setNuketown2FamilyUniform } from '../material-uniforms';

const { abs, clamp, float, fract, max, min, mix, positionWorld, smoothstep, vec2 } =
  TSL as unknown as Record<string, any>;

/** Half-width of the carriageway, metres — the kerb line the channel stain hugs. */
const CARRIAGEWAY_HALF_M = 5.3;

/**
 * THE AGGREGATE, and why the road read as a flat rectangle without it.
 *
 * A dense-graded surface course is 10-20 mm stone in bitumen. The library's
 * three authored scales bracket that size but neither one lands on it: the
 * 1.0 mm grain is faded out by 3 m (`wear.ts` detailFalloff) and the 35 mm
 * scuff by 18 m, so from the 8-25 m at which every street station actually
 * reads the carriageway, the ONLY term still alive was the 2.6 m traffic
 * gradient. One term at one scale on a 40 m plane is the flat value the owner
 * called Roblox.
 *
 * 22 mm is the coarse fraction's face width read off the generated reference
 * tile (docs/forge/references/asphalt.png, materials-manifest.json). It is
 * carried to 30 m rather than the scuff's 18 because at 22 mm it is still
 * 3.6 px at 20 m - above the 2 px floor `spec.ts` sets - and dropping it at
 * 18 m is exactly what left the mid-ground bald.
 */
const AGGREGATE_M = 0.022;
const AGGREGATE_NEAR_M = 14;
const AGGREGATE_FAR_M = 30;
/** Peak signed albedo swing of the aggregate term, as a fraction of base: 17 % peak-to-peak. */
const AGGREGATE_ALBEDO = 0.085;
/** Height of a proud stone face above the bitumen matrix, metres. */
const AGGREGATE_RELIEF_M = 0.0012;
/** A bitumen overband on a sealed joint stands this proud, metres (real: 2-4 mm). */
const SEAM_RELIEF_M = 0.003;
/** A cold patch is sawn out and re-laid slightly high; its saw-cut edge is the hardest step on the road. */
const PATCH_RELIEF_M = 0.004;
/** A fatigue crack opens this deep, metres. */
const CRACK_RELIEF_M = -0.005;
/** Wheel-path rut depth, metres, spread over the 1.1 m path width. */
const WHEEL_RUT_M = -0.004;
/** Ravelled edge within this distance of the kerb line, metres (brief 3a). */
const EDGE_ABRASION_M = 0.35;
/** Thermoplastic marking film thickness, metres (real: 2-3 mm sprayed, 3 mm extruded). */
export const MARKING_FILM_M = 0.0028;
/** Feature size of the paint-loss field, metres - the size of one chipped-out patch of bar. */
const PAINT_LOSS_M = 0.060;
/** Paint loss is read at range: a lane marking is judged from 10-40 m, not from 3 m. */
const PAINT_LOSS_NEAR_M = 22;
const PAINT_LOSS_FAR_M = 44;
/**
 * Paint-loss threshold pair over the shared [0,1] two-octave LUT field.
 *
 * The field's median sits at 0.5, so a threshold pair straddling it removes
 * roughly the area above `PAINT_LOSS_LO`; the measured loss fraction for this
 * pair is 0.30 (scanned over the shipped LUT, 128x128 subsample) and is pinned in `asphalt.test.ts` inside the brief's 20-40 % band. The
 * 0.13 transition width is what makes the edge chipped rather than sawn.
 */
export const PAINT_LOSS_LO = 0.53;
export const PAINT_LOSS_HI = 0.66;

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

let asphaltGraph: { colorNode: any; roughnessNode: any; normalNode: any } | null = null;

function sharedAsphaltGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any; normalNode: any } {
  if (asphaltGraph) return asphaltGraph;
  const spec = asphaltSpec('nuketown2-asphalt-shared');
  const p = positionWorld;
  const uv = groundUv();
  const wear = buildWear(spec, uv, uv, uniforms);

  // The mid-scale stone: the term the road had no equivalent of.
  const aggregate = signedNoise(uv, AGGREGATE_M, 2).mul(detailFalloff(AGGREGATE_NEAR_M, AGGREGATE_FAR_M));

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
  // Brief 3a: the last 0.35 m before the kerb ravels - the fines wash out, the
  // stone stands proud and the surface goes matt. It is the edge that stops a
  // carriageway meeting a kerb on a drawn line.
  const edgeAbrasion = smoothstep(float(CARRIAGEWAY_HALF_M - EDGE_ABRASION_M), float(CARRIAGEWAY_HALF_M), abs(p.z));

  const road = uniforms.baseColor.mul(wear.albedoMul);
  const stoned = road.mul(float(1).add(aggregate.mul(float(AGGREGATE_ALBEDO))));
  const patched = mix(stoned, linearSwatch(0x2b2c2d).mul(wear.albedoMul), patch);
  const polished = patched.mul(float(1).add(wheel.mul(float(0.17))));
  const stained = polished.mul(float(1).sub(channel.mul(float(0.13))));
  const ravelled = stained.mul(float(1).add(edgeAbrasion.mul(aggregate).mul(float(0.10))));
  const roadColor = mix(ravelled, linearSwatch(0x1f2021), max(seam, crack.mul(float(0.8))));

  // MARKINGS. The loss field is deliberately NOT `wear.scuff`: scuff is faded
  // out by 18 m and every station that judges a lane marking looks at it from
  // further than that, so the shipped markings were pristine in exactly the
  // frames the critic scored (critic-forge1 gap #3, "razor-sharp unweathered
  // dashed centre line"). The chip EDGE is modulated by the same aggregate
  // noise as the road under it, because paint chips off around the stone it
  // was sprayed over - one field, not two, or the bar and the road read as two
  // unrelated textures fighting.
  const paintField = lutFbm(vec2(p.x.div(float(PAINT_LOSS_M)), p.z.div(float(PAINT_LOSS_M))), 2)
    .add(aggregate.mul(float(0.16)));
  const paintLoss = smoothstep(float(PAINT_LOSS_LO), float(PAINT_LOSS_HI), paintField)
    .mul(detailFalloff(PAINT_LOSS_NEAR_M, PAINT_LOSS_FAR_M).mul(float(0.45)).add(float(0.55)));
  const scrub = smoothstep(float(0.20), float(0.75), wear.scuff).mul(float(0.35));
  const markingBase = uniforms.baseColor.mul(wear.albedoMul).mul(float(1).sub(scrub.mul(float(0.30))));
  const markingColor = mix(
    markingBase,
    linearSwatch(0x3b3d3e).mul(float(1).add(aggregate.mul(float(AGGREGATE_ALBEDO)))),
    paintLoss,
  );

  const roadRoughness = clamp(
    wear.roughness
      .add(aggregate.mul(float(0.12)))
      .add(edgeAbrasion.mul(float(0.10)))
      .sub(wheel.mul(float(0.16)))
      .sub(seam.mul(float(0.40)))
      .add(channel.mul(float(0.04)))
      .add(patch.mul(float(-0.06))),
    float(0.20),
    float(1.0),
  );
  const markingRoughness = clamp(
    wear.roughness.add(paintLoss.mul(float(0.14))).add(scrub.mul(float(0.08))),
    float(0.20),
    float(1.0),
  );

  // RELIEF - heights in METRES, positive out of the surface.
  // Without this every term above is a picture of a road printed on a flat
  // card. The tar seam and the saw-cut patch edge are the two that carry the
  // frame: both are hard steps, so under the arena's ~14 deg key they read as
  // a lit lip over a shadow line, which is what stops 40 m of asphalt being
  // one value.
  const roadHeight = aggregate.mul(float(AGGREGATE_RELIEF_M))
    .add(seam.mul(float(SEAM_RELIEF_M)))
    .add(patch.mul(float(PATCH_RELIEF_M)))
    .add(crack.mul(float(CRACK_RELIEF_M)))
    .add(wheel.mul(float(WHEEL_RUT_M)))
    .add(edgeAbrasion.mul(aggregate).mul(float(AGGREGATE_RELIEF_M)));
  // A marking is a FILM laid on that road: it keeps the road's own relief
  // where the paint has gone and replaces it with a flat 2.8 mm plateau where
  // it has not, so the bar has a real edge to catch the sun on.
  const markingHeight = mix(float(MARKING_FILM_M), roadHeight, paintLoss);

  const isMarking = (uniforms.asphaltMarking as any).greaterThan(float(0.5));
  asphaltGraph = {
    colorNode: isMarking.select(markingColor, roadColor),
    roughnessNode: isMarking.select(markingRoughness, roadRoughness),
    normalNode: reliefNormal(isMarking.select(markingHeight, roadHeight)),
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
  mat.normalNode = shared.normalNode;
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
  mat.normalNode = shared.normalNode;
  return mat;
}

export function createNuketown2AsphaltMaterial(): MeshStandardNodeMaterial {
  return createAsphaltMaterial();
}
export function createNuketown2DashMaterial(): MeshStandardNodeMaterial {
  return createMarkingMaterial();
}
