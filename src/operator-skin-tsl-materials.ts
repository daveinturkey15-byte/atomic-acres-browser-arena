/**
 * PASS 94 — procedural operator garment materials in TSL.
 *
 * WHY, in one measurement. `operator-model.ts` paints every third-person
 * garment with `material.color.setHex(teamColour)` over the skin GLB's authored
 * base-colour atlas, and `THREE.Color` MULTIPLIES that atlas. Two of the four
 * shipped skin atlases have a mean around 40/255, so the multiply can only ever
 * darken: the file's own comment records that "no multiply tint, not even
 * white, can make those read as a colour", and the workaround is an `emissive`
 * fill of the same hue. Unlit flat light is what makes an operator read as one
 * matte silhouette with no cloth, no camouflage and no equipment separation.
 *
 * This module produces the garment appearance instead of tinting it: a TSL node
 * graph that writes `colorNode`, `roughnessNode` and `metalnessNode` outright,
 * so the palette is real albedo and CAN be lighter than the atlas. The authored
 * `normalMap` is kept - that is the one channel the atlas contributes that a
 * procedural field cannot cheaply invent - while the base-colour map is
 * retained on `userData` and detached, exactly as HF-380 already does for the
 * visor lens.
 *
 * PIPELINE DISCIPLINE (this is the constraint that shapes the whole module).
 * The WebGPU backend compiles one program and one render pipeline per DISTINCT
 * node graph, and three identifies a graph by node-object IDENTITY, not by
 * structure - see `farcrysis-tsl-foliage.ts` HF-374, where per-layer literals
 * produced 86 unique graphs and the arena could not boot. So:
 *
 *   - graphs are built once per (look, role) and cached, never per operator;
 *   - `MeshStandardNodeMaterial.clone()` preserves node-object identity
 *     (verified in this module's test), so per-instance clones - which the
 *     existing bot brightness and flatten paths mutate - still share one
 *     pipeline;
 *   - the WebGL2 compatibility route does NOT get these materials. The trick
 *     `farcrysis-tsl-foliage.ts` documents - stamping `material.type =
 *     'MeshStandardMaterial'` so WebGLRenderer finds `shaderIDs[type]` - no
 *     longer does anything on the installed three 0.185.1: `NodeMaterial`
 *     declares `get type() { return this.constructor.type; }` and
 *     `set type( _value ) {}`, an explicit no-op setter
 *     (`node_modules/three/src/materials/nodes/NodeMaterial.js:47-53`). The
 *     assignment is silently discarded. So this module gates on the declared
 *     render backend instead, and WebGL2 keeps the shipped tinted path.
 *
 * SPACE. The pattern is built on `positionGeometry` - the raw bind-pose vertex
 * position, before skinning - so camouflage stays glued to the cloth instead of
 * swimming as the operator animates. The bind pose measures 1.854 units tall,
 * so those units are metres and every scale below is a real-world size.
 *
 * PRESENTATION ONLY. Nothing here touches hit proxies, movement, or any
 * replicated value.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  positionGeometry,
  positionView,
  saturate,
  sin,
  smoothstep,
  vec3,
} from 'three/tsl';

import {
  getOperatorLook,
  type OperatorLookDefinition,
  type OperatorLookRole,
  type OperatorLookTeam,
} from './operator-skin-look-registry';

export type { OperatorLookRole } from './operator-skin-look-registry';

/**
 * Maps one authored GLB material name onto the garment role it plays. Returns
 * null for anything this module deliberately does not own - `Skin`, `Visor` and
 * anything unrecognised keep their existing treatment, so a renamed or newly
 * added material degrades to today's behaviour instead of turning black.
 */
export function operatorLookRoleForMaterialName(materialName: string): OperatorLookRole | null {
  const name = materialName.toLowerCase();
  if (name === 'swat') return 'garment';
  if (name.includes('swat_black')) return 'garmentDark';
  if (name.includes('grey') || name.includes('darkbrown')) return 'webbing';
  return null;
}

/** The TSL node types, taken from the builders themselves so they cannot drift. */
type FloatNode = ReturnType<typeof mx_noise_float>;

type LookGraph = ReturnType<typeof buildLookGraph>;

const _graphCache = new Map<string, LookGraph>();
const _materialCache = new Map<string, MeshStandardNodeMaterial>();

/** Shoulder band, in bind-pose metres: where the faction trim stripe sits. */
const TRIM_BAND_LOW_M = 1.34;
const TRIM_BAND_HIGH_M = 1.5;
/** Arms are spread along X in the bind pose; the band starts outboard of the chest. */
const TRIM_BAND_INBOARD_M = 0.14;

/**
 * The camouflage mask: 1 where the blotch colour wins. `coverage` is the
 * fraction of the garment the blotch takes and `contrast` is how hard its edge
 * is, so both authored numbers mean what they say.
 */
function camoMask(field: FloatNode, coverage: number, contrast: number) {
  // The fractal noise is roughly zero-mean on [-1, 1]; a coverage of 0.5 must
  // therefore threshold at 0, 1.0 at -1 and 0.0 at +1.
  const threshold = 1 - 2 * coverage;
  const halfWidth = 0.42 * (1 - contrast) + 0.015;
  return smoothstep(float(threshold - halfWidth), float(threshold + halfWidth), field);
}

function camoField(look: OperatorLookDefinition, scaleM: number, offset: readonly [number, number, number]): FloatNode {
  const p = positionGeometry.mul(1 / scaleM).add(vec3(offset[0], offset[1], offset[2]));
  if (look.camo.kind === 'digital') {
    // Blocky pixel camo: quantise the sample position into cells so the noise
    // is constant across each cell and the edges land on cell boundaries.
    const cells = p.mul(1.6).floor().div(1.6);
    return mx_fractal_noise_float(cells, 2, 2, 0.5, 1);
  }
  if (look.camo.kind === 'stripe') {
    // Tiger stripe: a vertical wave whose phase is dragged sideways by noise,
    // which is what makes the stripes tear rather than read as corduroy.
    const warp = mx_fractal_noise_float(p.mul(0.5), 2, 2, 0.5, 1);
    return sin(positionGeometry.y.mul(Math.PI * 2 / scaleM).add(warp.mul(2.4)));
  }
  return mx_fractal_noise_float(p, 3, 2, 0.5, 1);
}

function buildLookGraph(look: OperatorLookDefinition, role: OperatorLookRole) {
  const { palette, camo, cloth, wear } = look;

  const primary = camoField(look, camo.primaryScaleM, [0, 0, 0]);
  const secondary = camoField(look, camo.secondaryScaleM, [17.3, 4.1, 29.7]);

  // Garment roles carry the camouflage; hard armour is a mostly solid plate and
  // webbing is a flat technical fabric, so both take a much weaker field. That
  // separation is the whole reason an operator reads as cloth-over-armour
  // rather than as one painted volume.
  const camoStrength = role === 'garment' ? 1 : role === 'garmentDark' ? 0.28 : 0.42;
  const primaryMask = camoMask(primary, camo.coverage, camo.contrast).mul(camoStrength);
  const secondaryMask = camoMask(secondary, camo.coverage * 0.72, camo.contrast).mul(camoStrength * 0.55);

  const baseHex = role === 'garment'
    ? palette.garmentBase
    : role === 'garmentDark' ? palette.hardArmour : palette.webbing;
  const shadeHex = role === 'garment' ? palette.garmentShade : palette.hardArmour;

  // Broad tonal variation first, so the garment is not one flat value even
  // where the camouflage does not reach.
  let albedo = mix(color(baseHex), color(shadeHex), saturate(primary.mul(0.5).add(0.5)).mul(0.34));
  albedo = mix(albedo, color(palette.camoBlotch), primaryMask);
  albedo = mix(albedo, color(palette.camoAccent), secondaryMask);

  // Weave. A fine, near-isotropic noise at millimetre scale; this is the cue
  // that separates canvas from moulded plastic at close range and it is exactly
  // what a flat colour cannot have.
  //
  // It is FADED OUT WITH DISTANCE, and that is not a performance tweak. A 2-4 mm
  // feature is far below one pixel on an operator seen across an arena, and
  // procedural noise has no mip chain to fall back on, so at range it would
  // alias into crawling speckle on a moving body - the most visible artefact
  // this module could ship. Beyond 9 m the garment is its camouflage and its
  // wear, which are decimetre-scale and safe.
  const weaveFade = float(1).sub(smoothstep(float(3), float(9), positionView.length()));
  const weave = mx_noise_float(positionGeometry.mul(1 / cloth.weaveScaleM));
  albedo = albedo.mul(float(1).add(weave.mul(cloth.weaveDepth).mul(weaveFade)));

  // Faction trim: a real albedo band across the shoulders and outer arms.
  // Kept on the garment role only so it reads as a patch, not as paint.
  if (role === 'garment') {
    const bandHeight = smoothstep(float(TRIM_BAND_LOW_M), float(TRIM_BAND_LOW_M + 0.03), positionGeometry.y)
      .mul(float(1).sub(smoothstep(float(TRIM_BAND_HIGH_M - 0.03), float(TRIM_BAND_HIGH_M), positionGeometry.y)));
    const bandOutboard = smoothstep(float(TRIM_BAND_INBOARD_M), float(TRIM_BAND_INBOARD_M + 0.05), abs(positionGeometry.x));
    albedo = mix(albedo, color(palette.trim), bandHeight.mul(bandOutboard).mul(0.85));
  }

  // Grime rises from the boots. Height is measured from the ground plane of the
  // bind pose, which is y = 0.
  const grimeMask = float(1).sub(smoothstep(float(0.02), float(wear.grimeHeightM), positionGeometry.y));
  albedo = albedo.mul(float(1).sub(grimeMask.mul(wear.grime * 0.42)));

  // Abrasion bleaches the fabric where it is handled: knees, shoulders, the
  // outside of the thighs. Approximated by the same primary field at high
  // frequency so wear follows the cloth rather than a UV seam.
  const wearMask = saturate(mx_noise_float(positionGeometry.mul(9.5)).mul(0.5).add(0.5)).mul(wear.edgeWear);
  albedo = mix(albedo, albedo.add(vec3(0.16, 0.15, 0.13)), wearMask.mul(0.5));

  const colorNode = clamp(albedo, vec3(0, 0, 0), vec3(1, 1, 1));

  // Wet grime is smoother, abraded cloth is rougher; both are small, bounded
  // moves around the authored value.
  const roughnessNode = clamp(
    float(cloth.roughness)
      .add(wearMask.mul(0.12))
      .sub(grimeMask.mul(wear.grime * 0.1)),
    float(0.05),
    float(1),
  );

  const metalnessNode = clamp(
    float(cloth.metalness).add(role === 'garmentDark' ? float(0.06) : float(0)),
    float(0),
    float(0.6),
  );

  return Object.freeze({ colorNode, roughnessNode, metalnessNode });
}

function graphFor(look: OperatorLookDefinition, role: OperatorLookRole): LookGraph {
  const key = `${look.id}|${role}`;
  let graph = _graphCache.get(key);
  if (!graph) {
    graph = buildLookGraph(look, role);
    _graphCache.set(key, graph);
  }
  return graph;
}

/**
 * The SHARED base material for one (look, role). Never hand this to a mesh
 * directly - the runtime mutates per-instance material properties - take a
 * clone through `cloneOperatorLookMaterial`, which keeps the same node objects
 * and therefore the same pipeline.
 */
export function operatorLookBaseMaterial(lookId: string, role: OperatorLookRole): MeshStandardNodeMaterial {
  const key = `${lookId}|${role}`;
  const cached = _materialCache.get(key);
  if (cached) return cached;

  const look = getOperatorLook(lookId);
  if (!look) throw new Error(`unknown operator look: ${lookId}`);

  const material = new MeshStandardNodeMaterial({ roughness: look.cloth.roughness, metalness: look.cloth.metalness });
  material.name = `operator-look-${lookId}-${role}`;

  const graph = graphFor(look, role);
  material.colorNode = graph.colorNode;
  material.roughnessNode = graph.roughnessNode;
  material.metalnessNode = graph.metalnessNode;

  _materialCache.set(key, material);
  return material;
}

/**
 * Per-instance clone. `MeshStandardNodeMaterial.clone()` copies the node
 * references, so the clone hashes to the same program cache key and therefore
 * adds no pipeline. Every instance material in the runtime comes through here.
 */
export function cloneOperatorLookMaterial(base: MeshStandardNodeMaterial): MeshStandardNodeMaterial {
  return base.clone();
}

export type OperatorLookMaterialOptions = Readonly<{
  /** Bots and distant operators drop to a flat response, as they do today. */
  flattenMaterials?: boolean;
  /** The authored material this replaces, so its normal map is carried over. */
  authored?: THREE.Material | null;
}>;

/**
 * Builds the instance material for one authored garment material.
 *
 * The authored base-colour map is retained on `userData` and detached, the same
 * recovery contract HF-380 uses for the visor lens: the procedural graph IS the
 * albedo now, and multiplying it by a dark atlas would reintroduce exactly the
 * problem this module exists to remove. The normal map is kept, because surface
 * relief is the one thing the atlas contributes that the graph does not.
 */
export function operatorLookInstanceMaterial(
  lookId: string,
  role: OperatorLookRole,
  options: OperatorLookMaterialOptions = {},
): MeshStandardNodeMaterial {
  const material = cloneOperatorLookMaterial(operatorLookBaseMaterial(lookId, role));
  const authored = options.authored ?? null;

  if (authored instanceof THREE.MeshStandardMaterial) {
    if (authored.map) material.userData.authoredBaseColorMap = authored.map;
    if (authored.normalMap) {
      material.normalMap = authored.normalMap;
      material.normalScale.copy(authored.normalScale);
    }
    material.side = authored.side;
    material.transparent = authored.transparent;
    material.alphaTest = authored.alphaTest;
  }

  if (options.flattenMaterials === true) {
    // Matches the shipped flatten contract: metalness off, and the garment
    // keeps its roughness response so canvas and neoprene stay distinguishable.
    material.metalnessNode = null;
    material.metalness = 0;
  }

  material.userData.operatorLookId = lookId;
  material.userData.operatorLookRole = role;
  return material;
}

export type OperatorLookRenderBackend = 'webgpu' | 'webgl2';

let _backend: OperatorLookRenderBackend | null = null;

/**
 * Declares the active render backend once, at renderer initialisation.
 *
 * The procedural looks are node graphs, and node graphs are only evaluated by
 * the node-capable renderer. On the WebGL2 compatibility route a
 * `MeshStandardNodeMaterial` cannot be disguised as a standard material (the
 * `type` setter is a no-op on three 0.185.1), so the caller keeps the shipped
 * tinted path there rather than shipping an unrenderable material.
 */
export function setOperatorLookRenderBackend(backend: OperatorLookRenderBackend): void {
  _backend = backend;
}

/**
 * True when the runtime may use procedural look materials. Fail-closed: an
 * undeclared backend keeps the shipped path, so a boot order change degrades
 * to today's appearance instead of to an invisible operator.
 */
export function operatorLookMaterialsEnabled(): boolean {
  return _backend === 'webgpu';
}

/** Test isolation only. */
export function resetOperatorLookRenderBackendForTest(): void {
  _backend = null;
}

/**
 * Number of distinct node graphs this module can create for a set of looks.
 * The pipeline budget test asserts against this rather than against a number
 * typed into a doc.
 */
export function operatorLookGraphCount(lookIds: readonly string[], roles: readonly OperatorLookRole[]): number {
  return new Set(lookIds.flatMap((lookId) => roles.map((role) => `${lookId}|${role}`))).size;
}

/** Live cache sizes, for the pipeline-count assertions. */
export function operatorLookCacheStats(): Readonly<{ graphs: number; materials: number }> {
  return Object.freeze({ graphs: _graphCache.size, materials: _materialCache.size });
}

/** Test isolation only. Never call this from the runtime; it strands pipelines. */
export function resetOperatorLookCachesForTest(): void {
  for (const material of _materialCache.values()) material.dispose();
  _materialCache.clear();
  _graphCache.clear();
}

/**
 * Convenience for the runtime: resolve (skin, team) to a look and build the
 * instance material for one authored material name. Returns null when this
 * module does not own that material, so the caller keeps its existing path.
 */
export function operatorLookMaterialForAuthored(
  materialName: string,
  lookId: string,
  options: OperatorLookMaterialOptions = {},
): MeshStandardNodeMaterial | null {
  const role = operatorLookRoleForMaterialName(materialName);
  if (role === null) return null;
  return operatorLookInstanceMaterial(lookId, role, options);
}

export const OPERATOR_LOOK_GARMENT_ROLES: readonly OperatorLookRole[] = Object.freeze([
  'garment', 'garmentDark', 'webbing',
]);

export type { OperatorLookDefinition, OperatorLookTeam };
