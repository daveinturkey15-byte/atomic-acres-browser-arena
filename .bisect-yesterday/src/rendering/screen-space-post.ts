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
  type ScreenSpacePostRuntime,
} from './screen-space-post-profile';

/** Stage names this module contributes, matching `LINEAR_SOURCE_STAGE_ORDER`. */
export const MOTION_BLUR_STAGE = 'motion-blur-velocity-smear';
export const SSGI_STAGE = 'ssgi-screen-space-bounce-add';
export const SSR_STAGE = 'ssr-screen-space-reflection-add';
export const GODRAYS_STAGE = 'godrays-volumetric-shaft-add';
export const DEPTH_OF_FIELD_STAGE = 'depth-of-field-bokeh';

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
    normal: runtime.reflections.enabled || runtime.globalIllumination.enabled,
    material: runtime.reflections.enabled,
    velocity: runtime.motionBlur.enabled,
  });
}

/** The stage receipt a runtime will produce, without building any node. */
export function screenSpacePostStages(runtime: ScreenSpacePostRuntime): readonly string[] {
  const stages: string[] = [];
  if (runtime.motionBlur.enabled) stages.push(MOTION_BLUR_STAGE);
  if (runtime.globalIllumination.enabled) stages.push(SSGI_STAGE);
  if (runtime.reflections.enabled) stages.push(SSR_STAGE);
  if (runtime.godrays.enabled) stages.push(GODRAYS_STAGE);
  if (runtime.depthOfField.enabled) stages.push(DEPTH_OF_FIELD_STAGE);
  return Object.freeze(stages);
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
  /** Stages actually built, in `LINEAR_SOURCE_STAGE_ORDER` order. */
  stages: readonly string[];
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
  /** Additive linear-HDR shaft light from the godrays raymarch, or null. */
  shaftLight: Node<'vec3'> | null;
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
  let bounceLight: Node<'vec3'> | null = null;
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
    bounceLight = nodeObject(filtered as unknown as Node<'vec4'>).rgb.mul(giGain);
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

  // --- volumetric light shafts ---------------------------------------------
  // The farcrysis arena dresses its sun with additive quads. Those are owned by
  // the arena presentation, not by this stack, and are deliberately left alone:
  // this is the real screen-space raymarch through the sun's shadow map and it
  // composites independently of them.
  const shaftTint = new THREE.Color(1, 1, 1);
  const shaftColor = uniform(shaftTint.clone());
  let shaftLight: Node<'vec3'> | null = null;
  let godraysNode: {
    dispose?: () => void;
    resolutionScale: number;
    raymarchSteps: { value: number };
    density: { value: number };
    maxDensity: { value: number };
    distanceAttenuation: { value: number };
    getTextureNode(): Node<'vec4'>;
  } | null = null;
  if (runtime.godrays.enabled && sources.volumetricLight) {
    const node = godrays(sources.sceneDepth, sources.camera, sources.volumetricLight);
    node.resolutionScale = runtime.godrays.resolutionScale;
    node.raymarchSteps.value = runtime.godrays.raymarchSteps;
    node.density.value = runtime.godrays.density;
    node.maxDensity.value = runtime.godrays.maximumDensity;
    node.distanceAttenuation.value = runtime.godrays.distanceAttenuation;
    godraysNode = node as unknown as typeof godraysNode;
    disposables.push(node as unknown as DisposableNode);
    // A half-resolution raymarch is stippled by design (the node jitters its
    // start offset per pixel). The upstream guidance is to bilateral-blur the
    // result before compositing; the kernel is depth-blind but intensity-aware,
    // which is exactly what removes the stipple without smearing a shaft across
    // the silhouette standing in it.
    const shaftIntensity = runtime.godrays.bilateralBlur
      ? bilateralBlur(node.getTextureNode(), undefined, 4, 0.08)
      : node.getTextureNode();
    if (runtime.godrays.bilateralBlur) disposables.push(shaftIntensity as unknown as DisposableNode);
    shaftLight = nodeObject(shaftIntensity as unknown as Node<'vec4'>).r.mul(shaftColor);
    stages.push(GODRAYS_STAGE);
  }

  // --- depth of field ------------------------------------------------------
  // Fixed focus and a deliberately long focal length: the resolver proves the
  // circle of confusion stays sub-pixel across the whole combat midfield, so
  // only sky and far horizon soften. There is no focus hunting, so there is no
  // focus transition to get wrong either.
  const focusDistance = uniform(runtime.depthOfField.focusDistanceM);
  const focalLength = uniform(runtime.depthOfField.focalLengthM);
  const bokehScale = uniform(runtime.depthOfField.bokehScale);
  const depthOfFieldEnabled = runtime.depthOfField.enabled;
  if (depthOfFieldEnabled) stages.push(DEPTH_OF_FIELD_STAGE);
  let depthOfFieldNode: DisposableNode | null = null;

  return Object.freeze({
    stages: Object.freeze(stages),
    sceneColor,
    bounceLight,
    reflectionLight,
    shaftLight,
    applyDepthOfField(linearHdr: Node<'vec4'>): Node<'vec4'> {
      if (!depthOfFieldEnabled) return linearHdr;
      const node = dof(linearHdr, sources.sceneViewZ, focusDistance, focalLength, bokehScale);
      depthOfFieldNode = node as unknown as DisposableNode;
      disposables.push(depthOfFieldNode);
      return node as unknown as Node<'vec4'>;
    },
    applyRuntime(next: ScreenSpacePostRuntime): void {
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
    },
    beforeRender(): void {
      if (!godraysNode) return;
      // The shaft tint follows the live sun colour and intensity so a dusk
      // arena gets dusk shafts, but the gain ceiling is applied here rather
      // than trusted: a bright authored sun must not scale the shafts past the
      // combat-safety bound.
      const light = sources.volumetricLight;
      const gain = active.godrays.enabled ? active.godrays.additiveGain : 0;
      if (light) shaftTint.copy(light.color);
      else shaftTint.setRGB(1, 1, 1);
      shaftColor.value.copy(shaftTint).multiplyScalar(gain);
    },
    dispose(): void {
      for (const node of disposables) node.dispose?.();
      disposables.length = 0;
      depthOfFieldNode = null;
      ssgiNode = null;
      ssrNode = null;
      godraysNode = null;
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
    || runtime.depthOfField.enabled;
}

/** Re-exported so the scene-pass assembler imports one module, not two. */
export type { ScreenSpacePostRuntime };
