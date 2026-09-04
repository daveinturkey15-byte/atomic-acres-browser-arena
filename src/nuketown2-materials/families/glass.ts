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
import { boxUv, buildWear, linearSwatch } from '../wear';
import { assertSpec, type Nuketown2MaterialSpec } from '../spec';

const { clamp, float, fract, max, mix, smoothstep } =
  TSL as unknown as Record<string, any>;

export function glassSpec(name: string, baseSrgb: number): Nuketown2MaterialSpec {
  return assertSpec({
    name,
    family: 'glass',
    baseSrgb,
    // Deliberate readability/performance exception to the skill's transmission
    // 1.0 / IOR 1.5 clear-glass start: these panes use alpha/opaque glazing so
    // coachGlass stays out of the transparent queue. Do not silently restore
    // transmission here; the consumer's queue contract is part of the gate.
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
  if (options.polygonOffset !== undefined) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = options.polygonOffset;
    mat.polygonOffsetUnits = options.polygonOffset;
  }

  const uv = boxUv();
  const wear = buildWear(spec, uv);

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

  const body = linearSwatch(baseSrgb).mul(wear.albedoMul);
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
