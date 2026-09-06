/**
 * families/glass.ts — window and vehicle glazing, as a DIELECTRIC.
 *
 * THE ONE RULE. Glass is metalness 0. A pane given metalness to make it "look
 * shinier" tints its own reflection by its albedo and comes back as a sheet of
 * coloured metal, which is close to the reading the owner's "basic geometry"
 * note describes. Float glass is a dielectric with roughness near 0.03 and a
 * body tint that is a 2-6% green from the iron in the melt — a green a
 * calibrated eye reads as "glass" and nothing else does.
 *
 * REAL SIZES. A domestic pane is dirty in a very specific pattern: the outer
 * face carries wind-driven dust that rain has run into vertical streaks, and
 * the last 40-60 mm at every edge and corner never gets cleaned. That edge
 * band is the wear that makes a pane read as a real window.
 *
 * WEAR:
 *   - grain    0.8 mm : dust motes and fine wiper scratching
 *   - scuff    30 mm  : smears, finger contact, the squeegee's last pass
 *   - traffic  1.2 m  : rain streaking and the uncleaned edge band
 *
 * The wear rides opacity as well as albedo: dirt on glass is something you see
 * THROUGH less, not just a lighter grey, and a dirt term that only touches
 * colour reads as a paint stain on the pane.
 */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { boxUv, buildWear } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';
import { createNuketown2Uniforms, type Nuketown2Uniforms } from '../material-uniforms';

const { clamp, float, fract, max, mix, smoothstep } =
  TSL as unknown as Record<string, any>;

export function glassSpec(name: string, baseSrgb: number): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'glass',
    baseSrgb,
    roughness: 0.045,
    // DIELECTRIC. Not negotiable, and the family gate asserts it.
    metalness: 0.0,
    grain: { sizeM: 0.0008, albedo: 0.030, roughness: 0.03 },
    scuff: { sizeM: 0.030, albedo: 0.050, roughness: 0.05 },
    traffic: { sizeM: 1.2, albedo: 0.060, roughness: 0.04 },
    soil: 0.075,
  });
}

export interface GlassOptions {
  readonly opacity?: number;
  readonly polygonOffset?: number;
  /**
   * Defaults to `opacity < 1`. A fully opaque glazing band stays OUT of the
   * transparent queue: putting it in would change render order and depth
   * behaviour for a surface whose only real defect was being metallic.
   */
  readonly transparent?: boolean;
}

let glassGraph: { colorNode: any; roughnessNode: any } | null = null;

function sharedGlassGraph(uniforms: Nuketown2Uniforms): { colorNode: any; roughnessNode: any } {
  if (glassGraph) return glassGraph;
  const spec = glassSpec('nuketown2-glass-shared', 0x2b3d47);
  const uv = boxUv();
  const wear = buildWear(spec, uv, undefined, uniforms);
  const streak = smoothstep(
    float(0.62),
    float(0.92),
    fract(uv.x.mul(float(9.0)).add(wear.soilMask.mul(float(1.7)))),
  ).mul(smoothstep(float(0.15), float(0.85), wear.soilMask));
  const grime = max(streak, wear.soilMask.mul(float(0.55)));
  const body = uniforms.baseColor.mul(wear.albedoMul);
  glassGraph = {
    colorNode: mix(body, body.mul(float(1.55)), grime.mul(float(0.35))),
    roughnessNode: clamp(wear.roughness.add(grime.mul(float(0.13))), float(0.03), float(0.35)),
  };
  return glassGraph;
}

export function createGlassMaterial(
  name: string,
  baseSrgb: number,
  options: GlassOptions = {},
): MeshStandardNodeMaterial {
  const spec = glassSpec(name, baseSrgb);
  const opacity = options.opacity ?? 0.42;
  const transparent = options.transparent ?? opacity < 1;
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent,
    opacity,
  });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(baseSrgb);
  const uniforms = createNuketown2Uniforms(spec, baseSrgb, 0x6b5741, mat);
  if (options.polygonOffset !== undefined) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = options.polygonOffset;
    mat.polygonOffsetUnits = options.polygonOffset;
  }
  if (!transparent) {
    const shared = sharedGlassGraph(uniforms);
    mat.colorNode = shared.colorNode;
    mat.roughnessNode = shared.roughnessNode;
    return mat;
  }

  const uv = boxUv();
  const wear = buildWear(spec, uv, undefined, uniforms);

  // Rain streaks run down the pane: narrow along the run, long down Y. The
  // phase is displaced by the metre-scale field so they are not a comb.
  const streak = smoothstep(
    float(0.62),
    float(0.92),
    fract(uv.x.mul(float(9.0)).add(wear.soilMask.mul(float(1.7)))),
  ).mul(smoothstep(float(0.15), float(0.85), wear.soilMask));

  // The uncleaned band. Panes in this arena are 0.6-1.6 m and carry no
  // authored UV channel, so "near an edge" is stood in for by the metre-scale
  // soiling field rather than invented from a world constant.
  const grime = max(streak, wear.soilMask.mul(float(0.55)));

  const body = uniforms.baseColor.mul(wear.albedoMul);
  mat.colorNode = mix(body, body.mul(float(1.55)), grime.mul(float(0.35)));
  mat.roughnessNode = clamp(wear.roughness.add(grime.mul(float(0.13))), float(0.03), float(0.35));
  // Dirt makes glass less transparent. This is the term that stops the grime
  // reading as paint. An opaque band has no opacity to modulate, and writing
  // one would drag it into the transparent queue by the back door.
  if (transparent) {
    mat.opacityNode = clamp(float(opacity).add(grime.mul(float(0.22))), float(0.1), float(0.95));
  }

  return mat;
}

/**
 * DAY-VISUAL-C: lit street-lamp diffuser head. Opaque warm glass through the
 * same shared graph as every other opaque glazing role, so no new WGSL
 * program: the bloom-picking lift is a scalar `emissive`/`emissiveIntensity`
 * rather than an `emissiveNode`. Node slots participate in the
 * pipeline-budget graph key and a new slot would mint a ninth family graph;
 * the scalar path renders the same HDR value through the default emissive
 * term (`MeshStandardNodeMaterial` falls back to `emissive`/`emissiveIntensity`
 * while `emissiveNode` is null — three r185 `MeshStandardNodeMaterial.js`).
 *
 * Numbers: base 0xd9a45c warm-amber diffuser; emissive 0xffb45e at 2.2. The
 * composed R/G channels clear the 1.02 linear bloom threshold at golden hour
 * without pushing blue, so the head reads lit rather than white-hot.
 */
export function createLampHeadMaterial(): MeshStandardNodeMaterial {
  const mat = createGlassMaterial('nuketown2-lamp-head', 0xd9a45c, { opacity: 1 });
  mat.emissive.setHex(0xffb45e);
  mat.emissiveIntensity = 2.2;
  return mat;
}
