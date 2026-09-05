import * as THREE from 'three';
import type { RenderPipeline } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ARENA_VISUAL_REGISTRY } from './arena-visual-stream';
import { createPass64TslSceneSystems, pass64LinearSourceStages } from './pass64-tsl-scene';
import {
  RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE,
  publishRayTracedLayerReceipt,
  screenSpaceMrtRequirement,
  screenSpacePostActive,
  screenSpacePostStages,
  AERIAL_PERSPECTIVE_STAGE,
} from './screen-space-post';
import { RAY_TRACED_LIGHT_STAGE } from './raytracing/raytraced-light-node';
import {
  resolveScreenSpacePostRuntime,
  SCREEN_SPACE_POST_DISABLED,
} from './screen-space-post-profile';
import { LINEAR_SOURCE_STAGE_ORDER, OPTIONAL_LINEAR_SOURCE_STAGES } from './grade-profile';

const AMBIENT_OCCLUSION_OFF = Object.freeze({
  quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false,
} as const);

const POST_DEFAULTS = Object.freeze({
  bloomStrength: 0.14, exposureScale: 1, toneMapping: 'aces', filmGrainScale: 0.3,
  vignetteStrength: 0.1, sharpness: 0,
} as const);

const EVERYTHING_ON = resolveScreenSpacePostRuntime({
  bakedIndirect: 'high',
  volumetricLightShafts: 'high',
  volumetricQuality: 'high',
  screenSpaceReflections: 'high',
  screenSpaceGi: 'high',
  depthOfField: true,
  depthOfFieldStrength: 0.4,
  motionBlur: 0.5,
  taaResolve: true,
  spatialUpscaling: 'fsr1-quality',
  rayTracing: 'refractions',
}, { shadowsEnabled: true });

function shadowCastingSun(): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xfff2dc, 3);
  sun.position.set(30, 60, -20);
  sun.castShadow = true;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 150;
  return sun;
}

describe('HF-364 screen-space MRT requirements', () => {
  it('allocates an attachment only for a consumer that is switched on', () => {
    expect(screenSpaceMrtRequirement(SCREEN_SPACE_POST_DISABLED))
      .toEqual({ normal: false, material: false, velocity: false });
    expect(screenSpaceMrtRequirement(EVERYTHING_ON))
      .toEqual({ normal: true, material: true, velocity: true });
    const onlyBlur = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0.5, spatialUpscaling: 'off', rayTracing: 'off',
    }, { shadowsEnabled: true });
    // Shafts and depth of field read the depth buffer the pass already owns,
    // so neither may drag an extra attachment along with it.
    expect(screenSpaceMrtRequirement(onlyBlur)).toEqual({ normal: false, material: false, velocity: true });
    const onlyShafts = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'high', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: true, depthOfFieldStrength: 1, motionBlur: 0, spatialUpscaling: 'off', rayTracing: 'off',
    }, { shadowsEnabled: true });
    expect(screenSpaceMrtRequirement(onlyShafts)).toEqual({ normal: false, material: false, velocity: false });
  });

  it('reports the stage receipt in the frozen linear order', () => {
    expect(screenSpacePostStages(SCREEN_SPACE_POST_DISABLED)).toEqual([]);
    expect(screenSpacePostActive(SCREEN_SPACE_POST_DISABLED)).toBe(false);
    const stages = screenSpacePostStages(EVERYTHING_ON);
    expect(screenSpacePostActive(EVERYTHING_ON)).toBe(true);
    expect([...stages].sort()).toEqual([...OPTIONAL_LINEAR_SOURCE_STAGES].sort());
    // The receipt order must agree with the frozen contract, not merely contain
    // the same names.
    const positions = stages.map((stage) => LINEAR_SOURCE_STAGE_ORDER.indexOf(stage));
    expect(positions.every((value, index) => index === 0 || value > positions[index - 1])).toBe(true);
  });
});

describe('HF-364 scene-pass assembly', () => {
  it('builds every screen-space pass without a GPU and declares the matching MRT', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const sun = shadowCastingSun();
    scene.add(sun);
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const graphics = {
      principalSamples: 1 as const,
      volumetricScale: 1,
      ambientOcclusion: AMBIENT_OCCLUSION_OFF,
      post: POST_DEFAULTS,
      reflectionScale: 1,
      reflectionQuality: 'high' as const,
      environmentIntensity: 1,
      screenSpace: EVERYTHING_ON,
    };
    const systems = createPass64TslSceneSystems(
      scene, camera, renderPipeline, definition, graphics, undefined, sun,
    );
    // Colour plus the three attachments the active consumers actually read.
    expect(systems.principalHdrTarget.textures.map(({ name }) => name))
      .toEqual(['output', 'normal', 'material', 'velocity']);
    expect(renderPipeline.outputNode).not.toBeNull();
    expect(systems.linearSourceStages).toEqual([
      'scene-pass-linear-hdr',
      'taa-temporal-resolve',
      'motion-blur-velocity-smear',
      // HF-418 / Lane AL. Two stages were BEING BUILT and not being reported:
      // the ray-traced layer's, missing since HF-398 landed, and the baked
      // probe layer's, new here. `pass64LinearSourceStages` is a hand-written
      // enumeration and neither had ever been added to it, so the published
      // receipt described a chain the installed pipeline did not have. This
      // pin now asserts the complete chain.
      'baked-indirect-probe-add',
      'ssgi-screen-space-bounce-add',
      'contact-occlusion-multiply',
      'ssr-screen-space-reflection-add',
      'raytraced-reflection-refraction-add',
      // HF-481 lane LOOK. Aerial perspective sits with the reflections and
      // before the bloom: haze is volume in front of the surface, so GTAO must
      // not darken it, and a bright hazy far field really does bloom.
      'aerial-perspective-inscatter-add',
      'depth-guarded-bloom-add',
      'godrays-volumetric-shaft-add',
      'depth-of-field-bokeh',
    ]);
    expect(systems.linearSourceStages).toEqual(pass64LinearSourceStages(graphics));
    expect(systems.screenSpace.upscaling.sceneResolutionScale).toBeCloseTo(0.67, 2);
    expect(() => systems.update(16)).not.toThrow();
    expect(() => systems.dispose()).not.toThrow();
  });

  it('allocates nothing at all when the whole stack is off', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, {
      principalSamples: 1,
      volumetricScale: 1,
      ambientOcclusion: AMBIENT_OCCLUSION_OFF,
      post: POST_DEFAULTS,
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
      screenSpace: SCREEN_SPACE_POST_DISABLED,
    });
    expect(systems.principalHdrTarget.textures.map(({ name }) => name)).toEqual(['output']);
    // HF-481. `SCREEN_SPACE_POST_DISABLED` is the WebGL2 compatibility route,
    // which runs no linear composite for an additive term to be added into, so
    // the atmosphere is absent here too. That is the ONLY way it is ever off.
    expect(systems.linearSourceStages).toEqual([
      'scene-pass-linear-hdr', 'contact-occlusion-multiply', 'depth-guarded-bloom-add',
    ]);
    systems.dispose();
  });

  it('refuses the shafts when the arena has no shadow-casting sun to raymarch', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const shaftsWithoutShadows = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'high', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off', rayTracing: 'off',
    }, { shadowsEnabled: false });
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, {
      principalSamples: 1,
      volumetricScale: 1,
      ambientOcclusion: AMBIENT_OCCLUSION_OFF,
      post: POST_DEFAULTS,
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
      screenSpace: shaftsWithoutShadows,
    }, undefined, null);
    // HF-481. Aerial perspective is NOT arena-scoped and NOT capability-gated:
    // it needs no shadow map, so it survives the very refusal that takes the
    // shafts away. That is the point of it — the atmosphere does not switch off
    // because an arena's sun stopped casting.
    expect(systems.linearSourceStages).toEqual([
      'scene-pass-linear-hdr',
      'contact-occlusion-multiply',
      'aerial-perspective-inscatter-add',
      'depth-guarded-bloom-add',
    ]);
    const published = systems.root.userData.pass65AdvancedGraphics as {
      screenSpace: { godrays: { enabled: boolean; unavailableReason: string | null } };
    };
    // Telemetry must report the refusal, not the request.
    expect(published.screenSpace.godrays.enabled).toBe(false);
    expect(published.screenSpace.godrays.unavailableReason).toMatch(/Sun shadows/);
    systems.dispose();
  });

  it('drops the marches under adaptive pressure without rebuilding the graph', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const sun = shadowCastingSun();
    scene.add(sun);
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, {
      principalSamples: 1,
      volumetricScale: 1,
      ambientOcclusion: AMBIENT_OCCLUSION_OFF,
      post: POST_DEFAULTS,
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
      screenSpace: EVERYTHING_ON,
    }, undefined, sun);
    const published = () => (systems.root.userData.pass65AdvancedGraphics as {
      screenSpace: { godrays: { quality: string }; globalIllumination: { stepCount: number } };
    }).screenSpace;
    expect(published().godrays.quality).toBe('high');
    systems.setAdaptiveScreenSpaceBudget(0.6, 1);
    expect(published().godrays.quality).toBe('low');
    expect(published().globalIllumination.stepCount).toBeLessThan(EVERYTHING_ON.globalIllumination.stepCount);
    // The graph topology is unchanged: the same attachments are still declared.
    expect(systems.principalHdrTarget.textures.map(({ name }) => name))
      .toEqual(['output', 'normal', 'material', 'velocity']);
    systems.dispose();
  });
});

describe('HF-398 ray-traced layer wiring', () => {
  it('drags in the two MRT attachments the trace cannot work without', () => {
    // Without the material attachment every surface reads as a perfectly smooth
    // dielectric and the whole arena turns to chrome; without normals there is
    // no reflection ray to build. Both are therefore a hard requirement of the
    // tier and not a nice-to-have it can degrade past.
    const onlyRayTracing = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off',
      rayTracing: 'reflections',
    }, { shadowsEnabled: true });
    expect(onlyRayTracing.rayTracing.enabled).toBe(true);
    expect(screenSpaceMrtRequirement(onlyRayTracing))
      .toEqual({ normal: true, material: true, velocity: false });
    expect(screenSpacePostActive(onlyRayTracing)).toBe(true);
    // HF-481. The atmosphere rides along in every WebGPU runtime: it has no
    // off rung and no capability gate, so a runtime built to isolate the trace
    // still carries it. Asserting the trace's stage alone would now be
    // asserting a receipt that is not the graph.
    expect(screenSpacePostStages(onlyRayTracing))
      .toEqual([RAY_TRACED_LIGHT_STAGE, AERIAL_PERSPECTIVE_STAGE]);
  });

  it('reports itself unavailable rather than drawing shadowless reflections', () => {
    // Shadow rays are the trace's most legible product. With no shadow-casting
    // sun there is nothing for one to resolve against, so the tier reports why
    // instead of quietly shipping a reflection with no shadow in it.
    const noSun = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off',
      rayTracing: 'refractions',
    }, { shadowsEnabled: false });
    expect(noSun.rayTracing.enabled).toBe(false);
    expect(noSun.rayTracing.unavailableReason).toContain('Sun shadows');
    expect(screenSpaceMrtRequirement(noSun)).toEqual({ normal: false, material: false, velocity: false });
    // The trace is refused; the atmosphere is not, because it never needed the
    // sun's shadow map in the first place.
    expect(screenSpacePostStages(noSun)).toEqual([AERIAL_PERSPECTIVE_STAGE]);
    expect(screenSpacePostActive(noSun)).toBe(false);
  });

  it('publishes a receipt for the graph that was BUILT, in both directions', () => {
    // The scene assembler rebuilds the linear stage list from a hard-coded
    // order this module does not own, so the trace can never appear there.
    // Without this receipt, "the setting is on" and "the pass compiled into the
    // live chain" would be indistinguishable from outside the build — which is
    // exactly how three systems in this project shipped fully tested with zero
    // runtime callers. Assert both directions: a receipt that is only ever
    // written is not evidence of anything.
    const target = { dataset: {} as Record<string, string | undefined> };
    publishRayTracedLayerReceipt('reflections', target);
    expect(target.dataset[RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE]).toBe('reflections');
    publishRayTracedLayerReceipt('refractions', target);
    expect(target.dataset[RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE]).toBe('refractions');
    publishRayTracedLayerReceipt(null, target);
    expect(target.dataset[RAY_TRACED_LAYER_RECEIPT_ATTRIBUTE]).toBeUndefined();
    // And with no target at all it is a no-op rather than a crash, which is
    // what keeps this module importable in a suite with no DOM.
    expect(() => publishRayTracedLayerReceipt('reflections', null)).not.toThrow();
  });

  it('composites into the reflection term rather than inventing a stage order', () => {
    // Reflected light is reflected light whether a ray or a march found it, and
    // the compositor already adds it in the right place: after the contact
    // occlusion multiply, because a reflection is not occluded by the surface
    // reflecting it, and before bloom, so a wet highlight can bloom.
    const both = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'off', screenSpaceReflections: 'high', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off',
      rayTracing: 'reflections',
    }, { shadowsEnabled: true });
    const stages = screenSpacePostStages(both);
    expect(stages.indexOf(RAY_TRACED_LIGHT_STAGE))
      .toBe(stages.indexOf('ssr-screen-space-reflection-add') + 1);
    const positions = stages.map((stage) => LINEAR_SOURCE_STAGE_ORDER.indexOf(stage));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(OPTIONAL_LINEAR_SOURCE_STAGES).toContain(RAY_TRACED_LIGHT_STAGE);
  });
});

describe('HF-401 shaft stage follows the arena sun that actually casts shadows', () => {
  // THE DEFECT THIS PINS, and why every assertion here is about what the graph
  // BUILT rather than what the settings asked for.
  //
  // Upstream `GodraysNode.setup()` dereferences `light.shadow.map.depthTexture`
  // while it builds its fragment `Fn`. Three allocates `shadow.map` lazily,
  // only for a light whose `castShadow` is true. gun-range authors
  // `sunIntensity: 0`, legacy-main turns that into `sunLight.castShadow =
  // false`, and the dereference throws. Three CATCHES that throw inside
  // `Nodes.getForRender()`, logs `THREE.TSL: TypeError: Cannot read properties
  // of null (reading 'depthTexture')` and rebuilds the render object against a
  // BARE `NodeMaterial` — so the shaft quad rendered a default material into
  // the godray target while telemetry still reported `enabled: true,
  // unavailableReason: null`. Reproduced three times per transition at MAX and
  // twice at HIGH on a production bundle, real WebGPU, RTX 5080.
  //
  // A guard alone would not be a fix: this post graph is built ONCE per page
  // while `castShadow` is per arena, so refusing at construction and never
  // reconsidering would delete the shafts from every arena in a session that
  // happened to start on gun-range. The last two cases below are what stop
  // that, and they are the ones a defensive early-return fails.
  const graphicsWith = (screenSpace: ReturnType<typeof resolveScreenSpacePostRuntime>) => ({
    principalSamples: 1 as const,
    volumetricScale: 1,
    ambientOcclusion: AMBIENT_OCCLUSION_OFF,
    post: POST_DEFAULTS,
    reflectionScale: 1,
    reflectionQuality: 'high' as const,
    environmentIntensity: 1,
    screenSpace,
  });
  const SHAFTS_ONLY = resolveScreenSpacePostRuntime({
    bakedIndirect: 'off',
    volumetricLightShafts: 'high', screenSpaceReflections: 'off', screenSpaceGi: 'off',
    volumetricQuality: 'high',
    depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off', rayTracing: 'off',
  }, { shadowsEnabled: true });
  const SHAFT_STAGE = 'godrays-volumetric-shaft-add';

  const buildSystems = async (sun: THREE.DirectionalLight) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(sun);
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(
      scene, camera, renderPipeline, definition, graphicsWith(SHAFTS_ONLY), undefined, sun,
    );
    return { systems, definition };
  };
  const publishedShafts = (systems: { root: THREE.Group }) => (
    (systems.root.userData.pass65AdvancedGraphics as {
      screenSpace: {
        godrays: { enabled: boolean; unavailableReason: string | null; effectiveAdditiveGain: number };
      };
    }).screenSpace.godrays
  );

  it('refuses the raymarch against a sun that casts no shadows, and names that reason', async () => {
    const sun = shadowCastingSun();
    sun.castShadow = false;
    sun.intensity = 0;
    const { systems } = await buildSystems(sun);
    // The stage is absent from the installed graph AND from the order receipt
    // the grade chain is told about, so the two cannot disagree.
    expect(systems.linearSourceStages).not.toContain(SHAFT_STAGE);
    const shafts = publishedShafts(systems);
    expect(shafts.enabled).toBe(false);
    // Named specifically. "Enable Sun shadows" would send the player to a
    // setting that is already on and is not the problem.
    expect(shafts.unavailableReason).toMatch(/arena's sun casts none/);
    systems.update(16);
    expect(publishedShafts(systems).effectiveAdditiveGain).toBe(0);
    systems.dispose();
  });

  it('builds the raymarch when the sun does cast shadows', async () => {
    const { systems } = await buildSystems(shadowCastingSun());
    expect(systems.linearSourceStages).toContain(SHAFT_STAGE);
    const shafts = publishedShafts(systems);
    expect(shafts.enabled).toBe(true);
    expect(shafts.unavailableReason).toBeNull();
    systems.update(16);
    expect(publishedShafts(systems).effectiveAdditiveGain)
      .toBeCloseTo(SHAFTS_ONLY.godrays.additiveGain, 6);
    systems.dispose();
  });

  it('adds the shafts back when a later arena commits a shadow-casting sun', async () => {
    // A session that starts on gun-range must not lose sun shafts for the rest
    // of the session. This is the case a defensive early-return cannot pass.
    const sun = shadowCastingSun();
    sun.castShadow = false;
    const { systems, definition } = await buildSystems(sun);
    expect(systems.linearSourceStages).not.toContain(SHAFT_STAGE);
    sun.castShadow = true;
    await systems.applyDefinition(definition);
    expect(systems.linearSourceStages).toContain(SHAFT_STAGE);
    expect(publishedShafts(systems).enabled).toBe(true);
    expect(publishedShafts(systems).unavailableReason).toBeNull();
    systems.update(16);
    expect(publishedShafts(systems).effectiveAdditiveGain)
      .toBeCloseTo(SHAFTS_ONLY.godrays.additiveGain, 6);
    systems.dispose();
  });

  it('rebuilds the raymarch when the shadow target it captured is replaced under it', async () => {
    // `GodraysNode.setup()` captures `light.shadow.map.depthTexture` BY
    // REFERENCE into a `texture()` node, so the built raymarch is bound to one
    // render target for the life of the node. legacy-main disposes and nulls
    // `sunLight.shadow.map` whenever the shadow map SIZE changes, and three's
    // ShadowNode allocates a fresh one on a shadow-type change. Either way the
    // built node is then sampling a dead texture, and the next material rebuild
    // would throw the same null dereference this whole change exists to remove.
    const sun = shadowCastingSun();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(sun);
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(
      scene, camera, renderPipeline, definition, graphicsWith(SHAFTS_ONLY), undefined, sun,
    );
    const firstTarget = new THREE.RenderTarget(2, 2);
    sun.shadow.map = firstTarget as unknown as THREE.LightShadow['map'];
    systems.update(16);
    const composedAgainstFirstTarget = renderPipeline.outputNode;
    expect(composedAgainstFirstTarget).not.toBeNull();

    // The size change legacy-main performs: dispose, then null.
    sun.shadow.map = null;
    await systems.applyDefinition(definition);
    // A NEW composite, i.e. a new shaft node built against whatever three
    // allocates next, rather than the old one still holding the dead texture.
    expect(renderPipeline.outputNode).not.toBe(composedAgainstFirstTarget);
    expect(systems.linearSourceStages).toContain(SHAFT_STAGE);
    expect(publishedShafts(systems).enabled).toBe(true);
    firstTarget.dispose();
    systems.dispose();
  });

  it('retires the shafts, and their gain, when a later arena commits a sunless one', async () => {
    // The other direction is not cosmetic either: the built node keeps
    // raymarching whatever `light.shadow.map` still holds, which after leaving
    // an outdoor arena is that arena's shadow depth. Tinted by a white indoor
    // sun at full gain, that is an additive wash over the whole frame.
    const sun = shadowCastingSun();
    const { systems, definition } = await buildSystems(sun);
    expect(systems.linearSourceStages).toContain(SHAFT_STAGE);
    sun.castShadow = false;
    sun.intensity = 0;
    await systems.applyDefinition(definition);
    expect(systems.linearSourceStages).not.toContain(SHAFT_STAGE);
    expect(publishedShafts(systems).enabled).toBe(false);
    systems.update(16);
    expect(publishedShafts(systems).effectiveAdditiveGain).toBe(0);
    systems.dispose();
  });
});

describe('HF-401 the shaft rebuild settles instead of recomposing on every apply', () => {
  it('recomposes once for a lost shadow target, not on every later refresh', async () => {
    // A rebuild that kept the RETIRED target as its reference point would see a
    // lost map again on the next definition apply and recompose the whole
    // linear-HDR expression each time — a pipeline rebuild per arena commit,
    // for a target that was already replaced.
    const sun = new THREE.DirectionalLight(0xfff2dc, 3);
    sun.castShadow = true;
    const scene = new THREE.Scene();
    scene.add(sun);
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const shaftsOnly = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'high', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      volumetricQuality: 'high',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off', rayTracing: 'off',
    }, { shadowsEnabled: true });
    const systems = createPass64TslSceneSystems(
      scene, new THREE.PerspectiveCamera(), renderPipeline, definition, {
        principalSamples: 1,
        volumetricScale: 1,
        ambientOcclusion: AMBIENT_OCCLUSION_OFF,
        post: POST_DEFAULTS,
        reflectionScale: 1,
        reflectionQuality: 'high',
        environmentIntensity: 1,
        screenSpace: shaftsOnly,
      }, undefined, sun,
    );
    const target = new THREE.RenderTarget(2, 2);
    sun.shadow.map = target as unknown as THREE.LightShadow['map'];
    systems.update(16);
    sun.shadow.map = null;
    await systems.applyDefinition(definition);
    const afterRebuild = renderPipeline.outputNode;
    // Nothing else changed, so this apply must be a no-op for the composite.
    await systems.applyDefinition(definition);
    expect(renderPipeline.outputNode).toBe(afterRebuild);
    target.dispose();
    systems.dispose();
  });
});
