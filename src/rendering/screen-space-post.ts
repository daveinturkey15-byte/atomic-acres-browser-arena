/**
 * HF-364 — the screen-space post stack on the linear-HDR side of the chain.
 *
 * `screen-space-post-profile.ts` owns the *data* (tier tables, the combat-safety
 * ceilings and the CPU reference maths). This module owns the *graph*: it turns
 * those values into the upstream Three r185 TSL nodes and hands the scene-pass
 * assembler back one composed linear-HDR node plus a stage receipt, exactly the
 * way `filmic-grade-chain.ts` does for the display side.
 *
 * HONEST NAMING — read `screen-space-post-profile.ts` first. Nothing here is ray
 * tracing: WebGPU exposes no hardware ray-tracing pipeline in any browser. SSR
 * and SSGI are screen-space RAY-MARCHED techniques against the depth buffer,
 * godrays raymarch the sun shadow map, and that is what the UI says.
 *
 * WHY EVERY LIGHTING EFFECT IS ADDITIVE HERE: SSGI publishes both an AO and a
 * GI buffer; only the GI buffer is consumed. GTAO already owns contact
 * darkening under its own control, and stacking a second occlusion term on top
 * would darken exactly the shaded pockets an enemy uses for cover — the one
 * thing the combat-safety bound forbids. Adding light can never hide something
 * that renders today, so every composite below is `+`, never `*` and never
 * `mix` toward a flat colour.
 */

import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import {
  float,
  int,
  max,
  min,
  nodeObject,
  smoothstep,
  uniform,
  vec4,
} from 'three/tsl';
import type { pass } from 'three/tsl';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import {
  assertScreenSpacePostCombatSafety,
  GODRAYS_SHAFT_LIGHT_WITHOUT_SHADOWS_REASON,
  type ScreenSpacePostRuntime,
} from './screen-space-post-profile';
import {
  type RayTracedLightGraph,
  RAY_TRACED_LIGHT_STAGE,
  buildRayTracedLightNode,
} from './raytracing/raytraced-light-node';
import { publishBakedIndirectReceipt } from './lighting/baked-indirect-node';
import {
  buildBakedIndirectRuntime,
  type BakedIndirectRuntime,
} from './lighting/baked-indirect-runtime';

/** Stage names this module contributes, matching `LINEAR_SOURCE_STAGE_ORDER`. */
export const MOTION_BLUR_STAGE = 'motion-blur-velocity-smear';
export const BAKED_INDIRECT_STAGE = 'baked-indirect-probe-add';
export const SSGI_STAGE = 'ssgi-screen-space-bounce-add';
export const SSR_STAGE = 'ssr-screen-space-reflection-add';
export const GODRAYS_STAGE = 'godrays-volumetric-shaft-add';
export const DEPTH_OF_FIELD_STAGE = 'depth-of-field-bokeh';

/** The subset of the upstream `GodraysNode` surface this module drives. */
type GodraysNodeHandle = {
  dispose?: () => void;
  resolutionScale: number;
  raymarchSteps: { value: number };
  density: { value: number };
  maxDensity: { value: number };
  distanceAttenuation: { value: number };
  getTextureNode(): Node<'vec4'>;
};

/** Reported when the arena installed no volumetric light at all. */
export const GODRAYS_NO_SHAFT_LIGHT_REASON =
  'Volumetric light shafts need an arena sun; this arena installs none.';

export type ShaftLightReadiness = Readonly<{
  /** Whether `godrays()` may be constructed against this light at all. */
  usable: boolean;
  /** Why not, when it may not. Null exactly when `usable` is true. */
  unavailableReason: string | null;
}>;

/**
 * HF-401 — the precondition upstream `GodraysNode` imposes on its light, stated
 * where we can check it instead of discovering it as a swallowed build error.
 *
 * `GodraysNode.setup()` builds a fragment `Fn` whose body dereferences
 * `light.shadow.map.depthTexture`. Three allocates `shadow.map` lazily, inside
 * `ShadowNode.setupShadow()`, which only runs for a light with `castShadow`
 * true while the renderer's shadow map is enabled. A light that never casts
 * shadows therefore never gets a `shadow.map`, and the dereference throws.
 *
 * Three does not surface that throw. `Nodes.getForRender()` catches it, logs
 * `THREE.TSL: TypeError: Cannot read properties of null (reading
 * 'depthTexture')` and rebuilds the render object against a bare
 * `NodeMaterial` — so the shaft quad renders a DEFAULT material into the godray
 * target and the composite adds that instead of a raymarch. Everything
 * "succeeds"; the picture is wrong and no gate fires. Measured on gun-range
 * (sunIntensity 0 -> castShadow false) three times per transition at MAX and on
 * a production bundle.
 *
 * `shadow.map` being null is deliberately NOT part of this predicate. It is
 * null on every arena until the first shadow-casting material builds, and
 * refusing then would delete the shafts from arenas that must have them. What
 * has to hold is that the light casts shadows at all.
 */
export function shaftLightReadiness(
  light: Readonly<{ castShadow: boolean }> | null,
): ShaftLightReadiness {
  if (!light) return Object.freeze({ usable: false, unavailableReason: GODRAYS_NO_SHAFT_LIGHT_REASON });
  if (light.castShadow !== true) {
    return Object.freeze({ usable: false, unavailableReason: GODRAYS_SHAFT_LIGHT_WITHOUT_SHADOWS_REASON });
  }
  return Object.freeze({ usable: true, unavailableReason: null });
}

/** The MRT attachments this stack needs on the principal scene pass. */
export type ScreenSpaceMrtRequirement = Readonly<{
  /** View-space normals. Shared with GTAO, which may already require them. */
  normal: boolean;
  /** Packed vec4(metalness, roughness, 0, 1); SSR drives GGX sampling from it. */
  material: boolean;
  /** Per-pixel NDC motion vectors. */
  velocity: boolean;
}>;

/**
 * Which MRT attachments a runtime needs. Kept separate from the graph builder
 * because the scene pass has to allocate them before anything can read them,
 * and because an attachment nobody reads is pure bandwidth.
 */
export function screenSpaceMrtRequirement(runtime: ScreenSpacePostRuntime): ScreenSpaceMrtRequirement {
  return Object.freeze({
    // HF-398: the ray tracer needs both attachments for the same reasons SSR
    // does — normals to build the reflection ray, and the packed
    // metalness/roughness pair to know which surfaces spawn one at all. Without
    // the material attachment every surface would read as a perfectly smooth
    // dielectric and the whole arena would turn to chrome.
    // HF-418: the baked probe volume is sampled per PIXEL, so it needs that
    // pixel's world normal to evaluate the SH lobe. It needs no material
    // attachment - a baked bounce lands on every surface, glossy or not.
    normal: runtime.reflections.enabled || runtime.globalIllumination.enabled || runtime.rayTracing.enabled
      || runtime.bakedIndirect.enabled,
    material: runtime.reflections.enabled || runtime.rayTracing.enabled,
    velocity: runtime.motionBlur.enabled,
  });
}

/** The stage receipt a runtime will produce, without building any node. */
export function screenSpacePostStages(runtime: ScreenSpacePostRuntime): readonly string[] {
  const stages: string[] = [];
  if (runtime.motionBlur.enabled) stages.push(MOTION_BLUR_STAGE);
  if (runtime.bakedIndirect.enabled) stages.push(BAKED_INDIRECT_STAGE);
  if (runtime.globalIllumination.enabled) stages.push(SSGI_STAGE);
  if (runtime.reflections.enabled) stages.push(SSR_STAGE);
  if (runtime.rayTracing.enabled) stages.push(RAY_TRACED_LIGHT_STAGE);
  if (runtime.godrays.enabled) stages.push(GODRAYS_STAGE);
  if (runtime.depthOfField.enabled) stages.push(DEPTH_OF_FIELD_STAGE);
  return Object.freeze(stages);
}

/** The dataset key the built-graph receipt is published under. */
export const RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE = 'rayTracedLayer';

/** The minimum surface the receipt needs, so a suite can supply one. */
export type ReceiptTarget = { dataset: Record<string, string | undefined> };

/**
 * Publishes (or clears) the built-graph receipt.
 *
 * The target is injected rather than reached for, because this repository runs
 * its unit suites with no DOM: a receipt that could only be asserted in a
 * browser would be a receipt nobody checks. Defaults to the live
 * documentElement, which is where the shadow sampler, the atomic-signal state
 * and the graphics registry count already publish.
 */
export function publishRayTracedLayerReceipt(
  tier: string | null,
  target: ReceiptTarget | null = typeof document === 'undefined'
    ? null
    : (document.documentElement as unknown as ReceiptTarget | null),
): void {
  if (!target) return;
  if (tier === null) delete target.dataset[RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE];
  else target.dataset[RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE] = tier;
}

/**
 * HF-398 — whether the ray-traced layer is contributing. The trace composites
 * into the same additive reflection term the screen-space tier uses, so this is
 * how a caller asks whether a ray or a march (or both) produced it.
 */
export function rayTracedLightActive(runtime: ScreenSpacePostRuntime): boolean {
  return runtime.rayTracing.enabled;
}

/**
 * The MRT attachment nodes as the scene pass actually publishes them, taken
 * straight off `pass()` so this module and the assembler cannot drift apart on
 * what a "depth node" is.
 */
type ScenePass = ReturnType<typeof pass>;
export type ScenePassTextureNode = ReturnType<ScenePass['getTextureNode']>;
export type ScenePassViewZNode = ReturnType<ScenePass['getViewZNode']>;

export type ScreenSpacePostSources = Readonly<{
  sceneColor: ScenePassTextureNode;
  sceneDepth: ScenePassTextureNode;
  /** Scene pass view-Z, i.e. `scenePass.getViewZNode()`. Required by DOF. */
  sceneViewZ: ScenePassViewZNode;
  sceneNormal: ScenePassTextureNode | null;
  /** Packed vec4(metalness, roughness, 0, 1) MRT attachment. */
  sceneMaterial: ScenePassTextureNode | null;
  sceneVelocity: ScenePassTextureNode | null;
  camera: THREE.Camera;
  /** Shadow-casting light the shafts are raymarched for. */
  volumetricLight: THREE.DirectionalLight | THREE.PointLight | null;
}>;

type DisposableNode = { dispose?: () => void };

export type ScreenSpacePostGraph = Readonly<{
  /**
   * Stages actually built RIGHT NOW, in `LINEAR_SOURCE_STAGE_ORDER` order.
   *
   * A function rather than a frozen array because the shaft stage is
   * arena-scoped: `refreshShaftStage` adds or removes it when the arena's sun
   * gains or loses its shadow map, and a stale receipt would describe a graph
   * that is not the one on screen.
   */
  stages(): readonly string[];
  /**
   * The scene colour every downstream linear stage must read. This is the
   * motion-blurred colour when motion blur is on and the raw scene pass
   * otherwise, so callers never have to branch.
   */
  sceneColor: Node<'vec4'>;
  /** Additive linear-HDR bounce light from SSGI, or null. */
  bounceLight: Node<'vec3'> | null;
  /** Additive linear-HDR reflected light from SSR, or null. */
  reflectionLight: Node<'vec3'> | null;
  /**
   * Additive linear-HDR shaft light from the godrays raymarch, or null when the
   * stage is not built. Re-read after every `refreshShaftStage` that returns
   * true: the node identity changes, so a cached term would keep a disposed
   * raymarch in the composite.
   */
  shaftLight(): Node<'vec3'> | null;
  /**
   * What the shaft stage is doing, and why, as BUILT rather than as requested.
   *
   * `effectiveAdditiveGain` is the gain `beforeRender` last pushed into the
   * composite uniform, i.e. what the picture actually received. Asserting the
   * requested tier instead would pass while the shafts were adding a full-gain
   * wash from a retired arena's shadow map.
   */
  shaftStage(): Readonly<{
    built: boolean;
    unavailableReason: string | null;
    effectiveAdditiveGain: number;
  }>;
  /**
   * Re-derives the shaft stage against the shaft light's CURRENT shadow-casting
   * state and rebuilds it when that changed. Returns true when the caller must
   * recompose its linear-HDR expression, because `shaftLight()` now returns a
   * different node.
   *
   * This exists because the post graph is built once per page while
   * `castShadow` is arena-scoped: without it, a session that starts on an arena
   * whose sun casts no shadows would have no shafts for the rest of the
   * session, and a session that leaves one would keep raymarching the previous
   * arena's stale shadow map at full gain.
   */
  refreshShaftStage(): boolean;
  /** Wraps a finished linear-HDR colour in the bokeh pass, or returns it unchanged. */
  applyDepthOfField(linearHdr: Node<'vec4'>): Node<'vec4'>;
  /** Pushes a new runtime into the live uniforms. Topology is unchanged. */
  applyRuntime(next: ScreenSpacePostRuntime): void;
  /** Call once per presented frame, before submission. */
  beforeRender(): void;
  dispose(): void;
}>;

/**
 * Builds the stack. Every effect that is off contributes nothing at all — no
 * node, no render target, no MRT read — so the disabled default really is the
 * zero-cost state and not a pass multiplied by zero.
 */
export function buildScreenSpacePostGraph(
  sources: ScreenSpacePostSources,
  runtime: ScreenSpacePostRuntime,
): ScreenSpacePostGraph {
  assertScreenSpacePostCombatSafety(runtime);
  const stages: string[] = [];
  const disposables: DisposableNode[] = [];
  let active = runtime;

  // --- motion blur ---------------------------------------------------------
  // Applied to the raw scene colour so every later stage reads one consistent
  // image. The velocity is gated below its dead zone: an aim adjustment at
  // 240 Hz moves a few thousandths of NDC, and smearing that is how a blur
  // setting turns into a target-acquisition hazard.
  const motionBlurStrength = uniform(runtime.motionBlur.strength);
  const motionBlurDeadZone = uniform(runtime.motionBlur.deadZoneNdc);
  const motionBlurKnee = uniform(runtime.motionBlur.kneeNdc);
  const motionBlurCeiling = uniform(runtime.motionBlur.maximumUvOffset);
  let sceneColor: Node<'vec4'> = sources.sceneColor;
  if (runtime.motionBlur.enabled && sources.sceneVelocity) {
    const ndcVelocity = nodeObject(sources.sceneVelocity).xy.mul(motionBlurStrength);
    const ndcSpeed = ndcVelocity.length();
    const gate = smoothstep(motionBlurDeadZone, motionBlurKnee, ndcSpeed);
    // NDC spans two units across the screen, UV spans one.
    const uvSpeed = ndcSpeed.mul(0.5);
    // Renormalise instead of clamping componentwise so the smear keeps its
    // direction; the epsilon keeps a stationary pixel out of a 0/0.
    const limited = ndcVelocity
      .mul(0.5)
      .mul(min(uvSpeed, motionBlurCeiling).div(max(uvSpeed, float(1e-5))))
      .mul(gate);
    sceneColor = motionBlur(sources.sceneColor, limited, int(runtime.motionBlur.samples)) as unknown as Node<'vec4'>;
    stages.push(MOTION_BLUR_STAGE);
  }

  // --- screen-space global illumination ------------------------------------
  const giGain = uniform(runtime.globalIllumination.enabled ? 1 : 0);
  // --- baked indirect (HF-418) --------------------------------------------
  // The first term in the bounce, and the only one in this whole module whose
  // per-frame cost does not depend on its tier: three 3D texture fetches into a
  // volume a path tracer filled before the frame started. It composites into
  // the same additive bounce term SSGI uses, so it needs no new expression in
  // the assembler - only a stage name, because it IS a new stage and a receipt
  // that hid it would describe a graph that is not the one on screen.
  let bakedIndirectRuntime: BakedIndirectRuntime | null = null;
  let bounceLight: Node<'vec3'> | null = null;
  if (runtime.bakedIndirect.enabled && sources.sceneNormal) {
    bakedIndirectRuntime = buildBakedIndirectRuntime({
      sceneColor: sources.sceneColor as unknown as Node<'vec4'>,
      sceneNormal: sources.sceneNormal as unknown as Node<'vec4'>,
      sceneViewZ: sources.sceneViewZ as unknown as Node<'float'>,
      camera: sources.camera,
      sun: sources.volumetricLight,
    }, runtime.bakedIndirect);
    bounceLight = bakedIndirectRuntime.graph.light;
    stages.push(BAKED_INDIRECT_STAGE);
  }
  let ssgiNode: (DisposableNode & Record<string, { value: number }>) | null = null;
  if (runtime.globalIllumination.enabled && sources.sceneNormal) {
    const node = ssgi(sources.sceneColor, sources.sceneDepth, sources.sceneNormal, sources.camera as THREE.PerspectiveCamera);
    node.sliceCount.value = runtime.globalIllumination.sliceCount;
    node.stepCount.value = runtime.globalIllumination.stepCount;
    node.giIntensity.value = runtime.globalIllumination.giIntensity;
    node.radius.value = runtime.globalIllumination.radius;
    node.thickness.value = runtime.globalIllumination.thickness;
    node.expFactor.value = runtime.globalIllumination.expFactor;
    // Upstream's temporal filter needs a TRAA resolve this chain does not run;
    // without one it reads as crawling noise, which is worse than the noise it
    // removes. The depth/normal-aware spatial denoise stands in, exactly as it
    // does for the High and Ultra GTAO tiers.
    node.useTemporalFiltering = false;
    ssgiNode = node as unknown as DisposableNode & Record<string, { value: number }>;
    disposables.push(ssgiNode);
    const rawGi = node.getGINode();
    const filtered = runtime.globalIllumination.denoise && sources.sceneNormal
      ? denoise(rawGi, sources.sceneDepth, sources.sceneNormal, sources.camera)
      : rawGi;
    if (filtered !== rawGi) disposables.push(filtered as unknown as DisposableNode);
    const giLight = nodeObject(filtered as unknown as Node<'vec4'>).rgb.mul(giGain);
    bounceLight = bounceLight === null
      ? (giLight as unknown as Node<'vec3'>)
      : nodeObject(bounceLight).add(giLight) as unknown as Node<'vec3'>;
    stages.push(SSGI_STAGE);
  }

  // --- screen-space reflections --------------------------------------------
  const ssrGain = uniform(runtime.reflections.enabled ? 1 : 0);
  let reflectionLight: Node<'vec3'> | null = null;
  let ssrNode: {
    dispose?: () => void;
    resolutionScale: number;
    quality: { value: number };
    maxDistance: { value: number };
    thickness: { value: number };
    intensity: { value: number };
    screenEdgeFade: { value: number };
  } | null = null;
  if (runtime.reflections.enabled && sources.sceneNormal) {
    const material = sources.sceneMaterial ? nodeObject(sources.sceneMaterial) : null;
    // The upstream typing narrows `normalNode` to Node<'vec3'>, but the node
    // body reads `.rgb` AND calls `.sample()` on it, so what it actually needs
    // is the MRT texture node this pass publishes.
    const node = ssr(sources.sceneColor, sources.sceneDepth, sources.sceneNormal as unknown as Node<'vec3'>, {
      camera: sources.camera,
      // Water and wet decking are dielectrics. Discarding non-metals is the
      // upstream fast path, and it would skip precisely the surfaces this tier
      // exists for.
      reflectNonMetals: runtime.reflections.reflectNonMetals,
      binaryRefine: runtime.reflections.binaryRefine,
      metalnessNode: material ? material.r : undefined,
      roughnessNode: material ? material.g : undefined,
    });
    node.resolutionScale = runtime.reflections.resolutionScale;
    node.quality.value = runtime.reflections.marchQuality;
    node.maxDistance.value = runtime.reflections.maximumDistance;
    node.thickness.value = runtime.reflections.thickness;
    node.intensity.value = runtime.reflections.intensity;
    node.screenEdgeFade.value = runtime.reflections.screenEdgeFade;
    ssrNode = node as unknown as typeof ssrNode;
    disposables.push(node as unknown as DisposableNode);
    reflectionLight = nodeObject(node as unknown as Node<'vec4'>).rgb.mul(ssrGain);
    stages.push(SSR_STAGE);
  }

  // --- classic recursive ray tracing (HF-398) ------------------------------
  // Genuine Whitted-style tracing against the arena's analytic proxy set: real
  // world-space intersection, real reflection and refraction rays, and real
  // shadow rays. It reflects geometry that is OFF SCREEN, which is the one
  // thing the screen-space tier above structurally cannot do.
  //
  // It composites into the SAME additive reflection term, for two reasons that
  // are both load-bearing. First, reflected light is reflected light and the
  // compositor already adds it in the right place, after the contact-occlusion
  // multiply, because a reflection is not occluded by the surface reflecting
  // it. Second, it needs no new stage name, so the linear stage order and the
  // grade chain's frozen receipt are untouched by this work.
  //
  // Nothing here claims RTX, RT cores, hardware acceleration or path tracing:
  // no browser exposes a ray-tracing pipeline and this asks for no extension.
  let rayTracedGraph: RayTracedLightGraph | null = null;
  if (runtime.rayTracing.enabled && sources.sceneNormal && sources.sceneMaterial) {
    rayTracedGraph = buildRayTracedLightNode({
      sceneColor: sources.sceneColor as unknown as Node<'vec4'>,
      sceneNormal: sources.sceneNormal as unknown as Node<'vec4'>,
      sceneMaterial: sources.sceneMaterial as unknown as Node<'vec4'>,
      sceneViewZ: sources.sceneViewZ as unknown as Node<'float'>,
      camera: sources.camera,
      sun: sources.volumetricLight,
    }, runtime.rayTracing);
    reflectionLight = reflectionLight === null
      ? rayTracedGraph.light
      : nodeObject(reflectionLight).add(rayTracedGraph.light) as unknown as Node<'vec3'>;
    stages.push(RAY_TRACED_LIGHT_STAGE);
  }
  // A RUNTIME RECEIPT, AND WHY IT IS A DOM ATTRIBUTE.
  //
  // The linear stage receipt this module returns is not the one the renderer
  // publishes: `pass64LinearSourceStages` in the scene assembler rebuilds the
  // list from a hard-coded order that this lane does not own, so the trace can
  // never appear there. Without a receipt of its own, "the preset is on" and
  // "the pass compiled into the live chain" would be indistinguishable from
  // outside — which is exactly how three systems in this project shipped fully
  // tested with zero runtime callers.
  //
  // So the graph writes what it BUILT, on the same documentElement dataset the
  // shadow sampler, the atomic-signal state and the graphics registry count
  // already use. Present means the node is in the chain; absent means it is
  // not, whatever any setting says.
  publishRayTracedLayerReceipt(rayTracedGraph === null ? null : runtime.rayTracing.tier);

  // --- volumetric light shafts ---------------------------------------------
  // The farcrysis arena dresses its sun with additive quads. Those are owned by
  // the arena presentation, not by this stack, and are deliberately left alone:
  // this is the real screen-space raymarch through the sun's shadow map and it
  // composites independently of them.
  const shaftTint = new THREE.Color(1, 1, 1);
  const shaftColor = uniform(shaftTint.clone());
  let godraysNode: GodraysNodeHandle | null = null;
  let shaftLight: Node<'vec3'> | null = null;
  // Disposed and refilled by `refreshShaftStage`, so a rebuild retires exactly
  // the shaft nodes and leaves SSR/SSGI/DOF/trace targets alone.
  let shaftDisposables: DisposableNode[] = [];
  let shaftReason: string | null = runtime.godrays.unavailableReason;
  /** The gain `beforeRender` last wrote into the composite. Reported, not requested. */
  let shaftGain = 0;
  /**
   * The last non-null `light.shadow.map` observed, so a target that is
   * replaced or disposed under the built raymarch is detectable. Read from the
   * per-frame hook; a plain reference compare, no allocation.
   */
  let shaftShadowMapSeen: object | null = null;

  const buildShaftStage = (): void => {
    const readiness = shaftLightReadiness(sources.volumetricLight);
    shaftReason = active.godrays.enabled
      ? readiness.unavailableReason
      : active.godrays.unavailableReason;
    if (!active.godrays.enabled || !readiness.usable || !sources.volumetricLight) return;
    const node = godrays(sources.sceneDepth, sources.camera, sources.volumetricLight);
    node.resolutionScale = active.godrays.resolutionScale;
    node.raymarchSteps.value = active.godrays.raymarchSteps;
    node.density.value = active.godrays.density;
    node.maxDensity.value = active.godrays.maximumDensity;
    node.distanceAttenuation.value = active.godrays.distanceAttenuation;
    godraysNode = node as unknown as GodraysNodeHandle;
    shaftDisposables.push(node as unknown as DisposableNode);
    // A half-resolution raymarch is stippled by design (the node jitters its
    // start offset per pixel). The upstream guidance is to bilateral-blur the
    // result before compositing; the kernel is depth-blind but intensity-aware,
    // which is exactly what removes the stipple without smearing a shaft across
    // the silhouette standing in it.
    const shaftIntensity = active.godrays.bilateralBlur
      ? bilateralBlur(node.getTextureNode(), undefined, 4, 0.08)
      : node.getTextureNode();
    if (active.godrays.bilateralBlur) shaftDisposables.push(shaftIntensity as unknown as DisposableNode);
    shaftLight = nodeObject(shaftIntensity as unknown as Node<'vec4'>).r.mul(shaftColor);
  };
  buildShaftStage();

  // --- depth of field ------------------------------------------------------
  // Fixed focus and a deliberately long focal length: the resolver proves the
  // circle of confusion stays sub-pixel across the whole combat midfield, so
  // only sky and far horizon soften. There is no focus hunting, so there is no
  // focus transition to get wrong either.
  const focusDistance = uniform(runtime.depthOfField.focusDistanceM);
  const focalLength = uniform(runtime.depthOfField.focalLengthM);
  const bokehScale = uniform(runtime.depthOfField.bokehScale);
  const depthOfFieldEnabled = runtime.depthOfField.enabled;
  let depthOfFieldNode: DisposableNode | null = null;

  // The shaft stage is spliced in at its `LINEAR_SOURCE_STAGE_ORDER` position
  // rather than pushed, because it can be added back after depth of field has
  // already been recorded.
  const currentStages = (): readonly string[] => {
    const built = [...stages];
    if (godraysNode) built.push(GODRAYS_STAGE);
    if (depthOfFieldEnabled) built.push(DEPTH_OF_FIELD_STAGE);
    return Object.freeze(built);
  };

  return Object.freeze({
    stages: currentStages,
    sceneColor,
    bounceLight,
    reflectionLight,
    shaftLight: () => shaftLight,
    shaftStage: () => Object.freeze({
      built: godraysNode !== null,
      unavailableReason: shaftReason,
      effectiveAdditiveGain: shaftGain,
    }),
    refreshShaftStage(): boolean {
      const readiness = shaftLightReadiness(sources.volumetricLight);
      const wanted = active.godrays.enabled && readiness.usable;
      // SECOND TRIGGER. `GodraysNode.setup()` captures the depth texture by
      // reference into a `texture()` node, so the shaft raymarch is bound to
      // ONE `light.shadow.map` for the life of the node. If that render target
      // is replaced or disposed underneath it — three's ShadowNode `_reset()`
      // on a shadow-type change, or an explicit `shadow.map = null` on a
      // shadow-map-size change — the built node is sampling a dead texture and
      // the next material rebuild would throw the same null dereference. Treat
      // a changed map identity as a rebuild, not as steady state.
      const mapNow = (sources.volumetricLight?.shadow?.map ?? null) as object | null;
      const mapLost = godraysNode !== null && shaftShadowMapSeen !== null && mapNow !== shaftShadowMapSeen;
      if (mapNow !== null) shaftShadowMapSeen = mapNow;
      if (wanted === (godraysNode !== null) && !mapLost) {
        // Nothing to rebuild, but the reason can still have changed (shadows
        // turned off renderer-wide versus this arena's sun casting none), and a
        // stale reason is exactly the kind of receipt that hides a defect.
        shaftReason = active.godrays.enabled ? readiness.unavailableReason : active.godrays.unavailableReason;
        return false;
      }
      for (const node of shaftDisposables) node.dispose?.();
      shaftDisposables = [];
      godraysNode = null;
      shaftLight = null;
      // Adopt whatever the light holds NOW, null included. Keeping the retired
      // target here would make every later refresh see a lost map and rebuild
      // the composite again on each one.
      shaftShadowMapSeen = mapNow;
      buildShaftStage();
      return true;
    },
    applyDepthOfField(linearHdr: Node<'vec4'>): Node<'vec4'> {
      if (!depthOfFieldEnabled) return linearHdr;
      // Idempotent: a shaft rebuild recomposes the linear expression, and a
      // second bokeh node per recomposition would leak a full-screen target.
      depthOfFieldNode?.dispose?.();
      if (depthOfFieldNode) disposables.splice(disposables.indexOf(depthOfFieldNode), 1);
      const node = dof(linearHdr, sources.sceneViewZ, focusDistance, focalLength, bokehScale);
      depthOfFieldNode = node as unknown as DisposableNode;
      disposables.push(depthOfFieldNode);
      return node as unknown as Node<'vec4'>;
    },
    applyRuntime(next: ScreenSpacePostRuntime): void {
      bakedIndirectRuntime?.applyTuning(next.bakedIndirect);
      assertScreenSpacePostCombatSafety(next);
      active = next;
      // Only values behind live uniforms and render-target scales move here.
      // Turning an effect on or off is a graph topology change and belongs to
      // the arena's pipeline-rebuild path, so a disabled tier lands as a zero
      // gain on a graph that already exists rather than as a silent no-op.
      motionBlurStrength.value = next.motionBlur.enabled ? next.motionBlur.strength : 0;
      motionBlurDeadZone.value = next.motionBlur.deadZoneNdc;
      motionBlurKnee.value = next.motionBlur.kneeNdc;
      motionBlurCeiling.value = next.motionBlur.maximumUvOffset;
      giGain.value = next.globalIllumination.enabled ? 1 : 0;
      if (ssgiNode && next.globalIllumination.enabled) {
        ssgiNode.sliceCount.value = next.globalIllumination.sliceCount;
        ssgiNode.stepCount.value = next.globalIllumination.stepCount;
        ssgiNode.giIntensity.value = next.globalIllumination.giIntensity;
        ssgiNode.radius.value = next.globalIllumination.radius;
      }
      ssrGain.value = next.reflections.enabled ? 1 : 0;
      if (ssrNode && next.reflections.enabled) {
        ssrNode.resolutionScale = next.reflections.resolutionScale;
        ssrNode.quality.value = next.reflections.marchQuality;
        ssrNode.maxDistance.value = next.reflections.maximumDistance;
        ssrNode.thickness.value = next.reflections.thickness;
        ssrNode.intensity.value = next.reflections.intensity;
      }
      if (godraysNode && next.godrays.enabled) {
        godraysNode.resolutionScale = next.godrays.resolutionScale;
        godraysNode.raymarchSteps.value = next.godrays.raymarchSteps;
        godraysNode.density.value = next.godrays.density;
        godraysNode.maxDensity.value = next.godrays.maximumDensity;
        godraysNode.distanceAttenuation.value = next.godrays.distanceAttenuation;
      }
      focusDistance.value = next.depthOfField.focusDistanceM;
      focalLength.value = next.depthOfField.focalLengthM;
      bokehScale.value = next.depthOfField.enabled ? next.depthOfField.bokehScale : 0;
      // The trace's live lever is its gate: the adaptive valve can pause it, and
      // a paused trace runs no traversal at all rather than a traversal
      // multiplied by zero. Ray count and recursion depth are topology and stay
      // on the pipeline-rebuild path, exactly like turning a march on or off.
      rayTracedGraph?.applyTuning(next.rayTracing);
    },
    beforeRender(): void {
      rayTracedGraph?.beforeRender();
      // Advances the arena's bake by at most a few milliseconds and republishes
      // the receipt, so what a headless check reads is what the frame just used
      // rather than what was true when the graph was built.
      //
      // The receipt is published even when the layer is NOT built, as 'off'.
      // Measured 2026-09-03: with the tier switched off through the real
      // Options surface, `dataset.bakedIndirect` was ABSENT, and absent is the
      // one value a headless check cannot interpret - it means "off", "the
      // build predates this feature", or "the publish never ran", and those are
      // three different bugs. Publishing 'off' collapses them to one.
      bakedIndirectRuntime?.beforeRender();
      publishBakedIndirectReceipt(
        typeof document === 'undefined'
          ? { dataset: {} }
          : (document.documentElement as unknown as { dataset: Record<string, string | undefined> }),
        bakedIndirectRuntime?.graph ?? null,
      );
      if (!godraysNode) {
        shaftGain = 0;
        return;
      }
      // The shaft tint follows the live sun colour and intensity so a dusk
      // arena gets dusk shafts, but the gain ceiling is applied here rather
      // than trusted: a bright authored sun must not scale the shafts past the
      // combat-safety bound.
      const light = sources.volumetricLight;
      // AND the gain collapses to zero the moment the shaft light stops casting
      // shadows. Between an arena commit and the shaft rebuild that follows it,
      // the built node is still raymarching the PREVIOUS arena's shadow map —
      // which is not merely stale, it is a full-gain additive wash indoors,
      // because the tint reads `light.color` and gun-range's sun is white at
      // intensity 0. Zero gain is the only honest value in that window.
      const usable = shaftLightReadiness(light).usable;
      // Cheapest place to notice the shadow target three allocated (or
      // replaced): one reference read per frame, no allocation, and it is the
      // only hook that runs often enough to catch a mid-session swap.
      const map = (light?.shadow?.map ?? null) as object | null;
      if (map !== null) shaftShadowMapSeen = map;
      shaftGain = active.godrays.enabled && usable ? active.godrays.additiveGain : 0;
      if (light) shaftTint.copy(light.color);
      else shaftTint.setRGB(1, 1, 1);
      shaftColor.value.copy(shaftTint).multiplyScalar(shaftGain);
    },
    dispose(): void {
      for (const node of disposables) node.dispose?.();
      disposables.length = 0;
      for (const node of shaftDisposables) node.dispose?.();
      shaftDisposables = [];
      rayTracedGraph?.dispose();
      rayTracedGraph = null;
      bakedIndirectRuntime?.dispose();
      bakedIndirectRuntime = null;
      depthOfFieldNode = null;
      ssgiNode = null;
      ssrNode = null;
      godraysNode = null;
      shaftLight = null;
    },
  });
}

/**
 * The packed material MRT attachment SSR reads: metalness in R, roughness in G.
 * Two floats in one attachment rather than two attachments, because the scene
 * pass already carries colour, depth, normals and possibly velocity, and each
 * extra full-screen attachment is bandwidth on every single fragment.
 *
 * KNOWN APPROXIMATION: `metalness` and `roughness` are shader properties that
 * only PBR node materials write. A basic, points or sky material leaves both at
 * their zero-initialised value, which SSR reads as a perfectly smooth
 * dielectric. In practice those surfaces are the sky dome and the additive
 * atmosphere cards, whose rays march straight off screen and fade out under
 * `screenEdgeFade` — but it is an approximation, not a guarantee, and it is one
 * of the reasons SSR stays a Custom opt-in rather than a preset default.
 */
export function packedMaterialMrtNode(
  metalnessNode: Node<'float'>,
  roughnessNode: Node<'float'>,
): Node<'vec4'> {
  return vec4(metalnessNode, roughnessNode, float(0), float(1)) as unknown as Node<'vec4'>;
}

/** Convenience for callers that only need to know whether anything is on. */
export function screenSpacePostActive(runtime: ScreenSpacePostRuntime): boolean {
  return runtime.motionBlur.enabled
    || runtime.globalIllumination.enabled
    || runtime.reflections.enabled
    || runtime.godrays.enabled
    || runtime.depthOfField.enabled
    || runtime.rayTracing.enabled;
}

/** Re-exported so the scene-pass assembler imports one module, not two. */
export type { ScreenSpacePostRuntime };
