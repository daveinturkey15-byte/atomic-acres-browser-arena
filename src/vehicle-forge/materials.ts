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
 *     blue-over-red on every shaded panel and reads lilac. `paintAlbedo` keeps
 *     the dominant hue channel at or above 10 % and drops `specularIntensity`
 *     rather than darkening the pigment.
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
import { fbm2, valueNoise2 } from '../map3/noise';

const {
  float,
  mix,
  normalWorld,
  positionViewDirection,
  positionWorld,
  pow,
  saturate,
  smoothstep,
  uniform,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

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

export interface PaintOptions {
  /** sRGB hex. The dominant channel must survive at >= 10 % - see the header. */
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
  // Keep the pigment above the lilac threshold without changing its hue: lift
  // every channel toward 0.1 x its own share of the strongest channel.
  const peak = Math.max(base.r, base.g, base.b, 1e-4);
  const floorScale = Math.max(1, 0.1 / peak);
  const r = base.r * floorScale;
  const g = base.g * floorScale;
  const b = base.b * floorScale;

  const baseRoughness = options.roughness ?? 0.74;
  const material = new MeshPhysicalNodeMaterial({
    metalness: 0,
    roughness: baseRoughness,
    clearcoat: options.clearcoat ?? 0.55,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.24,
  });
  material.name = options.name;
  material.specularIntensity = 0.08;
  tagCompatibility(material, 'MeshPhysicalMaterial');

  const dust = dustFilm();
  // Wear that lives ONLY in roughness is invisible: it is carried here as an
  // albedo step first (the film greys the pigment) and roughness second.
  const film = vec3(0.58, 0.56, 0.52);
  // PASS 94 CANDIDATE 4b - THE PIGMENT IS A UNIFORM, NOT THREE CONSTANTS.
  //
  // Same fix, same reason, as `createNuketown2CarPaintMaterial` (HF-477): a
  // literal's VALUE is part of a node graph's cache key, so a baked
  // `vec3(r, g, b)` compiled one WGSL shader and one WebGPU pipeline PER
  // COLOUR the forge was asked for. Nuke Town alone asks for five (coach body,
  // coach waistline, truck cab, and the reference's two street cars), and a
  // cold first submission pays for every one of them inside the 12 s deploy
  // fence. As a uniform the graph is identical for every colour, so all forged
  // paint - on every arena - shares ONE compiled pipeline. The pigment fed in
  // is the same lifted triple, and the film, dust and roughness terms above and
  // below are untouched, so nothing about the look changes.
  material.colorNode = mix(uniform(new THREE.Vector3(r, g, b)), film, (dust as any).mul(float(0.30)));
  material.roughnessNode = float(baseRoughness).add((dust as any).mul(float(0.20)));
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
    color: linearOf(0x363636),
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
  tagCompatibility(material, 'MeshStandardMaterial');
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
