import * as THREE from 'three';
import type { RenderPipeline } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ARENA_VISUAL_REGISTRY } from './arena-visual-stream';
import { createPass64TslSceneSystems, pass64LinearSourceStages } from './pass64-tsl-scene';
import {
  screenSpaceMrtRequirement,
  screenSpacePostActive,
  screenSpacePostStages,
} from './screen-space-post';
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
  volumetricLightShafts: 'high',
  screenSpaceReflections: 'high',
  screenSpaceGi: 'high',
  depthOfField: true,
  depthOfFieldStrength: 0.4,
  motionBlur: 0.5,
  spatialUpscaling: 'fsr1-quality',
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
      volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0.5, spatialUpscaling: 'off',
    }, { shadowsEnabled: true });
    // Shafts and depth of field read the depth buffer the pass already owns,
    // so neither may drag an extra attachment along with it.
    expect(screenSpaceMrtRequirement(onlyBlur)).toEqual({ normal: false, material: false, velocity: true });
    const onlyShafts = resolveScreenSpacePostRuntime({
      volumetricLightShafts: 'high', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      depthOfField: true, depthOfFieldStrength: 1, motionBlur: 0, spatialUpscaling: 'off',
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
      'motion-blur-velocity-smear',
      'ssgi-screen-space-bounce-add',
      'contact-occlusion-multiply',
      'ssr-screen-space-reflection-add',
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
      volumetricLightShafts: 'high', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      depthOfField: false, depthOfFieldStrength: 0, motionBlur: 0, spatialUpscaling: 'off',
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
    expect(systems.linearSourceStages).toEqual([
      'scene-pass-linear-hdr', 'contact-occlusion-multiply', 'depth-guarded-bloom-add',
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
