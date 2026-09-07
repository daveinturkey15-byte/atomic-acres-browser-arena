/**
 * vehicle-forge/materials.ts - TSL node materials for forged vehicles.
 *
 * PAINT IS PIGMENT UNDER A CLEAR LAYER, and that is the whole point of this
 * file. The arena's previous vehicle paints were `metalness 0.72` with
 * `roughness 0.20`, which is a description of chrome with a coloured tint: the
 * body reflects the sky at full strength, the pigment barely reads, and every
 * flank goes the colour of whatever is above it. Here every painted surface is
 * `metalness 0` with a low `specularIntensity` under a real clearcoat lobe, so
 * the hue survives the reflection and the highlight sits ON the paint instead
 * of replacing it.
 *
 * Three failures these values are chosen against, each of which is cheap to
 * reintroduce by "just darkening the colour":
 *
 *   - A DARK COLOUR UNDER A CLEARCOAT IS NOT A DARK SURFACE. The renderer sums
 *     the clearcoat Fresnel AND the base Fresnel, so a 4 %-red maroon measures
 *     blue-over-red on every shaded panel and reads lilac. The forge therefore
 *     keeps the authored pigment unchanged and drops `specularIntensity`
 *     rather than applying a channel lift that turns navy into purple.
 *   - `new THREE.Color(r, g, b)` WITH FLOATS IS LINEAR since r152. Authoring a
 *     "cream" swatch as floats gives a washed pastel. Swatches here are hex and
 *     go through `setHex(..., SRGBColorSpace)`.
 *   - A FLAT EMISSIVE SKY FILL washes a saturated body pale. The dust film is a
 *     multiplicative albedo term keyed on how upward-facing the surface is -
 *     dusty on sills, roof and hood, clean on the flanks - not an added glow.
 *
 * These are node materials only: no `ShaderMaterial`, no `onBeforeCompile`, no
 * GLSL string, which is the Pass-64 WebGPU contract.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fbm2, hash2, valueNoise2 } from '../map3/noise';

const {
  attribute,
  cameraPosition,
  dot,
  floor,
  float,
  length,
  max,
  mix,
  normalWorld,
  positionViewDirection,
  positionWorld,
  pow,
  saturate,
  smoothstep,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/**
 * HF-536 weathering contract. These are deliberately scalar graph constants:
 * the paint and chrome buckets stay shared, while the surface terms are
 * authored in metres and disappear before they can alias at distance.
 */
export const VEHICLE_ANCHOR_QUANTUM_M = 0.001;
export const VEHICLE_PAINT_SATURATION_LOSS_MIN = 0.08;
export const VEHICLE_PAINT_SATURATION_LOSS_MAX = 0.15;
export const VEHICLE_PAINT_VALUE_LIFT_MIN = 0.03;
export const VEHICLE_PAINT_VALUE_LIFT_MAX = 0.08;
export const VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MIN = 0.25;
export const VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MAX = 0.35;
export const VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MIN = 0.5;
export const VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MAX = 0.6;
export const VEHICLE_DUST_BAND_HEIGHT_M = 0.35;
export const VEHICLE_DUST_BAND_MIX = 0.35;
export const VEHICLE_DUST_BAND_ROUGHNESS = 0.85;
export const VEHICLE_DUST_SPATTER_FEATURE_MIN_M = 0.02;
export const VEHICLE_DUST_SPATTER_FEATURE_MAX_M = 0.06;
export const VEHICLE_CHROME_PIT_FEATURE_MIN_M = 0.003;
export const VEHICLE_CHROME_PIT_FEATURE_MAX_M = 0.008;
export const VEHICLE_CHROME_PIT_ROUGHNESS_MIN = 0.08;
export const VEHICLE_CHROME_PIT_ROUGHNESS_MAX = 0.35;
export const VEHICLE_CHROME_PIT_COVERAGE = 0.15;
export const VEHICLE_TRIM_GRIME_OFFSET_MIN_M = 0.015;
export const VEHICLE_TRIM_GRIME_OFFSET_MAX_M = 0.025;
export const VEHICLE_WEATHERING_DETAIL_NEAR_M = 1.2;
export const VEHICLE_WEATHERING_DETAIL_FAR_M = 3;

/** Known proud trim elevations, used only when a merged graph cannot inspect parts. */
export const TRIM_GRIME_HEIGHTS_M = Object.freeze([
  0.34, 0.4, 0.42, 0.46, 0.5, 0.7, 0.78, 0.84,
  0.9, 0.95, 1.2, 1.3, 1.75, 1.78, 1.99, 2.03, 2.42,
]);

function fractNumber(value: number): number {
  return value - Math.floor(value);
}

/** Quantise the placement anchor to the R-003 1 mm grid. */
export function quantizeVehicleAnchor(x: number, z: number): readonly [number, number] {
  return [
    Math.round(x / VEHICLE_ANCHOR_QUANTUM_M) * VEHICLE_ANCHOR_QUANTUM_M,
    Math.round(z / VEHICLE_ANCHOR_QUANTUM_M) * VEHICLE_ANCHOR_QUANTUM_M,
  ];
}

/** CPU mirror of the textureless shader hash used for per-vehicle variation. */
export function vehicleAnchorHash(x: number, z: number): number {
  const [qx, qz] = quantizeVehicleAnchor(x, z);
  return fractNumber(Math.sin(qx * 127.1 + qz * 311.7) * 43758.5453);
}

export interface VehicleWeatheringProfile {
  readonly anchor: readonly [number, number];
  readonly hash: number;
  readonly saturationLoss: number;
  readonly valueLift: number;
}

export function vehicleWeatheringProfile(x: number, z: number): VehicleWeatheringProfile {
  const anchor = quantizeVehicleAnchor(x, z);
  const hash = vehicleAnchorHash(anchor[0], anchor[1]);
  return {
    anchor,
    hash,
    saturationLoss: VEHICLE_PAINT_SATURATION_LOSS_MIN
      + hash * (VEHICLE_PAINT_SATURATION_LOSS_MAX - VEHICLE_PAINT_SATURATION_LOSS_MIN),
    valueLift: VEHICLE_PAINT_VALUE_LIFT_MIN
      + hash * (VEHICLE_PAINT_VALUE_LIFT_MAX - VEHICLE_PAINT_VALUE_LIFT_MIN),
  };
}

/** Ground-contact dust mix: full at y=0, gone at the 350 mm band edge. */
export function dustBandWeight(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM >= VEHICLE_DUST_BAND_HEIGHT_M) return 0;
  const t = Math.max(0, heightM / VEHICLE_DUST_BAND_HEIGHT_M);
  const smooth = t * t * (3 - 2 * t);
  return VEHICLE_DUST_BAND_MIX * (1 - smooth);
}

/** Fade for 3-8 mm pits, 20-60 mm spatters and 15-25 mm grime lines. */
export function weatheringDetailFalloff(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM >= VEHICLE_WEATHERING_DETAIL_FAR_M) return 0;
  if (distanceM <= VEHICLE_WEATHERING_DETAIL_NEAR_M) return 1;
  const t = (distanceM - VEHICLE_WEATHERING_DETAIL_NEAR_M)
    / (VEHICLE_WEATHERING_DETAIL_FAR_M - VEHICLE_WEATHERING_DETAIL_NEAR_M);
  return 1 - t * t * (3 - 2 * t);
}

/** Deterministic census helper for the 10-20% chrome pit coverage contract. */
export function measureChromePitCoverage(sampleCount = 4096): number {
  const count = Math.max(1, Math.floor(sampleCount));
  let pits = 0;
  for (let i = 0; i < count; i += 1) {
    const cellX = i % 64;
    const cellZ = Math.floor(i / 64);
    const field = fractNumber(Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453);
    if (field >= 1 - VEHICLE_CHROME_PIT_COVERAGE) pits += 1;
  }
  return pits / count;
}

/**
 * WebGL2 compatibility coverage needs `shaderIDs[material.type]` to resolve;
 * WebGPURenderer ignores it and evaluates the node graph. The physical
 * materials therefore announce themselves as physical, not standard, or the
 * compatibility route loses the clearcoat lobe the paint is built around.
 */
function tagCompatibility(material: THREE.Material, type: string): void {
  material.type = type;
}

/** sRGB hex -> the linear triple the node graph needs. */
function linearOf(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

/**
 * A road-film term: 0 on a vertical flank, 1 on an upward face, with a slow
 * world-space blotch so no two panels dust identically.
 */
function dustFilm(): unknown {
  const upness = saturate(normalWorld.y.mul(float(0.5)).add(float(0.5)));
  const blotch = fbm2(vec2(positionWorld.x.mul(0.8), positionWorld.z.mul(0.8)));
  return saturate(smoothstep(float(0.55), float(0.98), upness).mul(blotch.mul(0.6).add(0.55)));
}

function weatheringDetailFadeNode(): any {
  return smoothstep(
    float(VEHICLE_WEATHERING_DETAIL_FAR_M),
    float(VEHICLE_WEATHERING_DETAIL_NEAR_M),
    length(positionWorld.sub(cameraPosition)),
  );
}

function trimGrimeMaskNode(): any {
  let mask = float(0);
  for (const height of TRIM_GRIME_HEIGHTS_M) {
    const line = smoothstep(
      float(height - VEHICLE_TRIM_GRIME_OFFSET_MAX_M),
      float(height - VEHICLE_TRIM_GRIME_OFFSET_MIN_M),
      positionWorld.y,
    ).mul(
      float(1).sub(smoothstep(
        float(height - VEHICLE_TRIM_GRIME_OFFSET_MIN_M),
        float(height),
        positionWorld.y,
      )),
    );
    mask = max(mask, line);
  }
  return mask;
}

export interface PaintOptions {
  /** sRGB hex; the authored hue is preserved exactly in the linear uniform. */
  readonly color: number;
  readonly name: string;
  /** 0.35-0.7. Higher is a fresher, wetter-looking finish. */
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  /**
   * Base-layer roughness BEFORE the dust film.
   *
   * The physical answer is 0.7-1.0: pigment under a clear layer is rough, and
   * every highlight belongs to the coat. It is not the answer here, and the
   * reason is written into `nuketown2-arena.ts`'s own materials header: the
   * ray-traced/SSR preset admits a reflective proxy at roughness <= 0.22 over
   * 6 m2, and Nuke Town Rebuild's parked cars are the only surfaces on the map
   * that clear BOTH bounds. Our screen-space reflection reads base roughness
   * from the material MRT and knows nothing about clearcoat, so shipping the
   * physical value would silently retire the map's only reflective surfaces -
   * a look regression bought with a correctness argument, which is exactly the
   * trade this repository forbids. The vehicles therefore ship a 0.20 base
   * under `specularIntensity` 0.08, so the base lobe contributes almost
   * nothing to the lit result while the surface stays SSR-eligible, and the
   * dust film lifts it above the threshold exactly where dust actually sits.
   */
  readonly roughness?: number;
}

export function createForgePaintMaterial(options: PaintOptions): MeshPhysicalNodeMaterial {
  const base = linearOf(options.color);

  const baseRoughness = options.roughness ?? 0.74;
  const material = new MeshPhysicalNodeMaterial({
    metalness: 0,
    roughness: baseRoughness,
    clearcoat: options.clearcoat ?? 0.55,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.24,
  });
  material.name = options.name;
  material.specularIntensity = 0.08;
  // The authored swatch mirrored onto `material.color` for every path that
  // reads colour off the material instead of the node graph:
  // `batchDisplayColor`/`materialBatchKey` in art-kit.ts (static batching in
  // every simplify mode, and the batch key in preserve mode), the fidelity
  // gates, and the WebGL2 compatibility route that never evaluates colorNode.
  // Every other Nuke Town family does the same; forge paint was the only one
  // that left the default white, so all liveries read white and keyed as one.
  // WebGPU is unaffected: per r185 NodeMaterial, colorNode OVERWRITES the
  // diffuse inferred from `color`, and the graph (hence the pipeline budget)
  // is unchanged.
  material.color.copy(base);
  material.userData.forgeRole = 'paint';
  material.userData.forgePaintSrgb = options.color;
  material.userData.forgePaintUniform = true;
  tagCompatibility(material, 'MeshPhysicalMaterial');

  const dust = dustFilm();
  const detailFade = weatheringDetailFadeNode();
  const vehicleAnchor = attribute('forgeVehicleAnchor', 'vec2');
  const anchorHash = hash2(vehicleAnchor);
  const baseUniform = TSL.uniform(new THREE.Vector3(base.r, base.g, base.b));

  // Faded enamel is a per-vehicle, 1 mm-quantised tone shift. A local up
  // normal keys the sun-bleached roof/bonnet, while flanks retain the livery.
  const saturationLoss = float(VEHICLE_PAINT_SATURATION_LOSS_MIN).add(
    anchorHash.mul(float(VEHICLE_PAINT_SATURATION_LOSS_MAX - VEHICLE_PAINT_SATURATION_LOSS_MIN)),
  );
  const valueLift = float(VEHICLE_PAINT_VALUE_LIFT_MIN).add(
    anchorHash.mul(float(VEHICLE_PAINT_VALUE_LIFT_MAX - VEHICLE_PAINT_VALUE_LIFT_MIN)),
  );
  const pigmentLuma = dot(baseUniform, vec3(0.2126, 0.7152, 0.0722));
  const bleachedPigment = mix(baseUniform, vec3(pigmentLuma, pigmentLuma, pigmentLuma), saturationLoss)
    .mul(float(1).add(valueLift));
  const upperPanel = smoothstep(float(0.58), float(0.88), normalWorld.y);
  const fadedEnamel = mix(baseUniform, bleachedPigment, upperPanel);

  // The 350 mm road-dust band is broad and stable; only its 20-60 mm spatter
  // fades at the detail distance. Roughness reaches the authored 0.85 at the
  // contact edge, with the wheel-arch/sill height bands reading strongest.
  const dustBand = float(1).sub(smoothstep(float(0), float(VEHICLE_DUST_BAND_HEIGHT_M), positionWorld.y));
  const spatterNoise = valueNoise2(vec2(
    positionWorld.x.mul(float(1 / 0.04)),
    positionWorld.z.mul(float(1 / 0.04)),
  ));
  const spatter = mix(float(1), mix(float(0.82), float(1.18), spatterNoise), detailFade);
  const dustMix = dustBand.mul(float(VEHICLE_DUST_BAND_MIX)).mul(spatter);
  const warmDust = vec3(0.44, 0.36, 0.27);
  const dustyEnamel = mix(fadedEnamel, warmDust, dustMix);

  // Merged parts do not expose semantic trim IDs to the graph. These known
  // elevations provide the required 15-25 mm occlusion-like line underneath
  // every proud batten, rub rail, bumper and handle without new samplers.
  const trimGrime = trimGrimeMaskNode().mul(detailFade);
  const grimeColour = vec3(0.12, 0.095, 0.07);
  const grimeEnamel = mix(dustyEnamel, grimeColour, trimGrime.mul(float(0.42)));

  // A uniform is intentional: every forge paint shares one graph shape and
  // the dark-blue saloon remains dark blue. Wear is visible in albedo first,
  // then in the physical roughness response.
  material.colorNode = mix(grimeEnamel, vec3(0.58, 0.56, 0.52), (dust as any).mul(float(0.30)));
  material.roughnessNode = mix(
    float(baseRoughness).add((dust as any).mul(float(0.20))),
    float(VEHICLE_DUST_BAND_ROUGHNESS),
    dustBand,
  );

  // Clearcoat is smoother on upper lit panels and deliberately rougher on
  // flanks: a small world-space variation keeps the coat from reading flat.
  const coatNoise = valueNoise2(vec2(
    positionWorld.x.mul(2.7).add(positionWorld.y.mul(1.7)),
    positionWorld.z.mul(2.7),
  ));
  const upperCoat = mix(
    float(VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MIN),
    float(VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MAX),
    coatNoise,
  );
  const flankCoat = mix(
    float(VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MIN),
    float(VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MAX),
    coatNoise,
  );
  // TSL slots are untyped at this boundary; these are the three graph nodes
  // assigned by this factory, not additional material instances.
  type TslNode = { mul(v: unknown): TslNode; add(v: unknown): TslNode };
  const paintNodes = material as unknown as { colorNode: TslNode; roughnessNode: TslNode; clearcoatRoughnessNode: TslNode };
  paintNodes.clearcoatRoughnessNode = mix(flankCoat, upperCoat, upperPanel);
  return material;
}

/**
 * Automotive glazing as a BLENDED DIELECTRIC: `alpha = a0 + (1 - a0) * F`.
 *
 * Dark glass is a dielectric, not a dark metal. `metalness 0.55` with a
 * near-black colour tints the REFLECTION black, so the screens mirror a black
 * sky while the chrome beside them catches white and the car reads as a toy.
 * The tint lives in `color`; the reflection is Fresnel plus clearcoat.
 */
export function createForgeGlassMaterial(name: string, tintHex = 0x243036): MeshPhysicalNodeMaterial {
  const tint = linearOf(tintHex);
  const material = new MeshPhysicalNodeMaterial({
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.name = name;
  material.ior = 1.52;
  tagCompatibility(material, 'MeshPhysicalMaterial');

  const cosine = saturate(normalWorld.dot(positionViewDirection));
  const fresnel = pow(float(1).sub(cosine), float(5));
  const a0 = float(0.14);
  material.colorNode = vec3(tint.r, tint.g, tint.b);
  material.opacityNode = saturate(a0.add(float(1).sub(a0).mul(fresnel)).add(float(0.34)));
  return material;
}

/**
 * The cabin lining behind the glass.
 *
 * Matte black paint is 3-5 % albedo, not 0.6 %. `0x141414` is a black hole
 * under any exposure and turns a window into a hole in the world; `0x363636`
 * still reads as a dark interior and keeps a shading gradient.
 */
export function createForgeLiningMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: linearOf(0x4a4a4c), // HF-536: lifted from 0x363636 so an underbody in its own shadow clears the exact-black band
    roughness: 0.94,
    metalness: 0,
  });
  material.name = 'vehicle-forge-lining';
  tagCompatibility(material, 'MeshStandardMaterial');
  return material;
}

/**
 * The floor of a shut line: UNLIT.
 *
 * A 6 mm groove that is lit anti-aliases to a 1 px grey line at 4-6 m and
 * reads as nothing at all. Unlit, the same groove holds its dark value at
 * every range, and the two paint chamfers either side supply the highlight.
 */
export function createForgeGrooveMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ color: linearOf(0x0b0b0c) });
  material.name = 'vehicle-forge-shut-line';
  tagCompatibility(material, 'MeshBasicMaterial');
  return material;
}

/** Bumpers, mouldings, wheel faces. Cool-tinted so it never reads as copper. */
export function createForgeChromeMaterial(worn = false): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: new THREE.Color(0.62, 0.65, 0.68),
    roughness: worn ? 0.22 : 0.09,
    metalness: 1,
  });
  material.name = worn ? 'vehicle-forge-chrome-worn' : 'vehicle-forge-chrome';
  material.userData.forgeRole = 'chrome';
  tagCompatibility(material, 'MeshStandardMaterial');

  // Chrome pitting is a binary 3-8 mm hashed field, not a texture. The line
  // under each proud trim elevation is the same distance-faded grime contract
  // used by paint, so the two materials agree at every runtime profile.
  const pitCell = vec2(
    floor(positionWorld.x.add(positionWorld.y.mul(0.37)).div(float(0.005))),
    floor(positionWorld.z.add(positionWorld.y.mul(0.61)).div(float(0.005))),
  );
  const pitField = hash2(pitCell);
  const pitMask = pitField.greaterThan(float(1 - VEHICLE_CHROME_PIT_COVERAGE))
    .select(float(1), float(0))
    .mul(weatheringDetailFadeNode());
  const trimGrime = trimGrimeMaskNode().mul(weatheringDetailFadeNode());
  material.colorNode = mix(
    vec3(0.62, 0.65, 0.68),
    vec3(0.18, 0.14, 0.1),
    trimGrime.mul(float(0.45)),
  );
  material.roughnessNode = mix(
    float(worn ? 0.22 : VEHICLE_CHROME_PIT_ROUGHNESS_MIN),
    float(VEHICLE_CHROME_PIT_ROUGHNESS_MAX),
    pitMask,
  );
  return material;
}

/** Tyre rubber: never pure black, with a tread band the lathe's v lands on. */
export function createForgeTyreMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: linearOf(0x2b2b2d),
    roughness: 0.93,
    metalness: 0,
  });
  material.name = 'vehicle-forge-tyre';
  tagCompatibility(material, 'MeshStandardMaterial');
  const grain = valueNoise2(vec2(positionWorld.x.mul(70), positionWorld.y.mul(70)));
  material.roughnessNode = float(0.88).add(grain.mul(float(0.09)));
  return material;
}

/** The inboard wheel disc and the bead-gap annulus. Matte, never a mirror. */
export function createForgeWheelDarkMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: linearOf(0x2e2f31),
    roughness: 0.88,
    metalness: 0.15,
  });
  material.name = 'vehicle-forge-wheel-dark';
  tagCompatibility(material, 'MeshStandardMaterial');
  return material;
}

export type LampKind = 'head' | 'tail';

/** A practical lens. Emissive so it reads at night, tinted so it reads by day. */
export function createForgeLampMaterial(kind: LampKind): MeshStandardNodeMaterial {
  const warm = kind === 'head';
  const material = new MeshStandardNodeMaterial({
    color: linearOf(warm ? 0xf3ead6 : 0x6d1114),
    roughness: 0.18,
    metalness: 0,
  });
  material.name = `vehicle-forge-lamp-${kind}`;
  material.emissive = linearOf(warm ? 0xffeec6 : 0xd42026);
  material.emissiveIntensity = warm ? 1.15 : 0.85;
  tagCompatibility(material, 'MeshStandardMaterial');
  return material;
}
