import * as THREE from 'three';
import type { RenderPipeline } from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { describe, expect, it, vi } from 'vitest';
import { ARENA_VISUAL_REGISTRY } from './arena-visual-stream';
import {
  assertRuntimeTslTraversal,
  auditRuntimeTslTraversal,
  createPass64TslSceneSystems,
} from './pass64-tsl-scene';
import { canonicalTslDescriptor, tslDescriptorSha256, TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';
import { SCREEN_SPACE_POST_DISABLED } from './screen-space-post-profile';
import { OCEAN_WAVES, RUSTWORKS_OCEAN_AMPLITUDE, RUSTWORKS_OCEAN_AUTHORITY_ID } from '../water-system';
import { arenaEnvironmentScale } from '../graphics-refinement';

describe('Pass 64 authored TSL pipeline set', () => {
  it('has stable unique SHA-256 descriptors for all seven former GLSL owners', async () => {
    const descriptors = TSL_MIGRATION_INVENTORY.map(canonicalTslDescriptor);
    const hashes = await Promise.all(TSL_MIGRATION_INVENTORY.map(tslDescriptorSha256));
    expect(descriptors).toHaveLength(7);
    expect(new Set(descriptors).size).toBe(7);
    expect(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(new Set(hashes).size).toBe(7);
    expect(Object.fromEntries(TSL_MIGRATION_INVENTORY.map((entry, index) => [entry.replacementPipelineId, hashes[index]]))).toEqual({
      'pass64.sky-atmosphere.tsl.v1': 'df27ed5c5ef4aa30a9e4f81ca832fee18102ce0dacf94c57ba7649c56fdc2219',
      'pass64.hdr-grade-grain.tsl.v1': '627c0548678e85ab989f8a467342e0b7ca701d5c9537c2194b82be4e5a964805',
      'pass64.atmosphere-mist.tsl.v1': '99f7097f4766cac49ed0f3d56d0da742fc56e98179f2cb111190880317a34c8d',
      'pass64.atmosphere-smoke.tsl.v1': '19469308a541bd0b715434103824a57ae22379dd1f292b685af1c1666cb80963',
      'pass64.atmosphere-dust.tsl.v1': 'd769f801d91d6578073f374f49ff59b7e67249965c66e21d1261bacc9f936167',
      'pass64.grass.tsl.v1': '2e532ce383727f954067dadad411fb0ca4450613c44b74d160bea282cf85cc34',
      'pass64.water.tsl.v1': '35442c51b89d6c192c22e65d3dbf329995608e50a743c3f741214ee4312e89d8',
    });
  });

  it('builds node-material equivalents and proves the traversal contains no legacy shader material', async () => {

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    const audit = auditRuntimeTslTraversal(scene, systems.compiledPipelineIds);
    expect(audit.legacyShaderMaterials).toEqual([]);
    expect(audit.compiledPipelineIds).toHaveLength(7);
    expect(audit.nodeMaterialPipelineIds).toHaveLength(6);
    expect(systems.principalHdrTarget.samples).toBe(4);
    expect(systems.principalHdrTarget.textures.map(({ name }) => name)).toEqual(['output']);
    expect(systems.bloomSamples).toBe(0);
    expect(systems.depthAwareBloom).toBe(true);
    expect(systems.ambientOcclusion).toEqual({
      graphId: 'pass65.webgpu-gtao-depth.v1',
      quality: 'off', enabled: false, denoise: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0,
    });
    expect(() => assertRuntimeTslTraversal(audit)).not.toThrow();
    const rustDefinition = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;
    systems.applyDefinition(rustDefinition);
    expect(systems.root.userData.tslArenaVisualDefinitionId).toBe('rustworks-1v1');
    expect(systems.root.userData.tslAtmosphere).toEqual(rustDefinition.atmosphere);
    const rustWater = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    rustWater.geometry.computeBoundingBox();
    expect(rustWater.visible).toBe(true);
    expect(rustWater.userData).toMatchObject({
      waveBands: OCEAN_WAVES.length,
      waveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.blender,
      waveAuthority: RUSTWORKS_OCEAN_AUTHORITY_ID,
      waveNormalAuthority: RUSTWORKS_OCEAN_AUTHORITY_ID,
      surfaceSegments: 256,
    });
    expect((rustWater.geometry as THREE.PlaneGeometry).parameters.widthSegments).toBe(256);
    const waterMaterial = rustWater.material as THREE.Material & { positionNode?: unknown; normalNode?: unknown; opacityNode?: unknown; alphaTestNode?: unknown };
    expect(waterMaterial.positionNode).toBeTruthy();
    expect(waterMaterial.normalNode).toBeTruthy();
    expect(waterMaterial.opacityNode).toBeTruthy();
    expect(waterMaterial.alphaTestNode).toBeTruthy();
    expect(waterMaterial).toMatchObject({ transparent: false, opacity: 1, depthWrite: true });
    const oceanHorizon = rustWater.getObjectByName('Pass 66 curved RustRig ocean horizon') as THREE.Mesh;
    expect(oceanHorizon).toBeInstanceOf(THREE.Mesh);
    expect(oceanHorizon.userData).toMatchObject({
      horizonRadius: 3_200,
      radialSegments: 24,
      curvatureDrop: 90,
    });
    expect(oceanHorizon.frustumCulled).toBe(false);
    expect(systems.root.getObjectByName('Pass 64 TSL mist')?.children).toHaveLength(5);
    expect(rustWater.geometry.boundingBox?.getCenter(new THREE.Vector3()).y).toBeCloseTo(-19.5);
    expect(rustWater.position.y).toBeCloseTo(0);
    expect(systems.root.getObjectByName('Pass 64 TSL grass')?.visible).toBe(false);
    const dust = systems.root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points;
    expect(dust.geometry.drawRange.count).toBe(96);
    // Each arena's selected scene background is the sole sky owner. Legacy
    // point stars, galaxy, aurora, atmosphere dome and cloud veil stay out of
    // live presentation so they cannot add squares, wash or double exposure.
    expect(systems.root.getObjectByName('Pass 66 night stars')?.visible).toBe(false);
    expect(systems.root.getObjectByName('Pass 66 galaxy band')?.visible).toBe(false);
    expect(systems.root.getObjectByName('Pass 66 aurora curtains')?.visible).toBe(false);
    expect(systems.root.getObjectByName('Pass 66 seamless cloud veil')?.visible).toBe(false);
    const highSeasDefinition = (await ARENA_VISUAL_REGISTRY['high-seas']()).definition;
    systems.applyDefinition(highSeasDefinition);
    expect(rustWater.visible).toBe(false);
    expect(rustWater.parent).toBeNull();
    const highSeasWater = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    highSeasWater.geometry.computeBoundingBox();
    expect(highSeasWater.visible).toBe(true);
    expect(highSeasWater.geometry.boundingBox?.getCenter(new THREE.Vector3()).y).toBeCloseTo(-2.2);
    expect(highSeasWater.position.y).toBeCloseTo(0);
    expect(highSeasWater.userData).toMatchObject({
      dryFootprintMask: 'none',
      presentationOwner: 'shared-ocean',
      nearSize: 960,
      waterLevel: -2.2,
      waveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.blender * 0.15,
    });
    expect(highSeasWater.userData.dryFootprintMaskUniform.value).toBe(0);
    expect(highSeasWater.userData.islandHalfUniform.value.toArray()).toEqual([12.8, 44.8]);
    systems.applyDefinition(definition);
    expect(highSeasWater.visible).toBe(false);
    expect(highSeasWater.parent).toBeNull();
    const noWater = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    expect(noWater.visible).toBe(false);
    expect(noWater.userData).toMatchObject({
      waterLevel: null,
      nearSize: 0,
      presentationOwner: null,
      dryFootprintMask: 'none',
      waveAmplitude: 0,
    });
    expect(systems.root.userData.pass65AdvancedGraphics.oceanWaveAmplitude).toBe(0);
    expect(systems.root.getObjectByName('Pass 64 TSL grass')?.visible).toBe(true);
    expect(systems.root.getObjectByName('Pass 66 night stars')?.visible).toBe(false);
    const atmosphereSky = systems.root.getObjectByName('Pass 64 TSL atmosphere sky') as SkyMesh;
    const atmosphereOpacity = atmosphereSky.userData.opacityUniform as { value: number };
    expect(atmosphereSky.visible).toBe(false);
    expect(atmosphereSky.material.transparent).toBe(true);
    expect(atmosphereOpacity.value).toBe(0);
    const cloudVeil = systems.root.getObjectByName('Pass 66 seamless cloud veil') as THREE.Group;
    expect(cloudVeil.visible).toBe(false);
    expect(cloudVeil.children).toHaveLength(2);
    expect(cloudVeil.children.every((layer) => layer instanceof THREE.Mesh && layer.geometry instanceof THREE.SphereGeometry)).toBe(true);
    expect((cloudVeil.userData.cloudTexture as THREE.DataTexture).image).toMatchObject({ width: 1_024, height: 512 });
    const primaryCloudMaterial = cloudVeil.userData.primaryMaterial as THREE.MeshBasicMaterial;
    const secondaryCloudMaterial = cloudVeil.userData.secondaryMaterial as THREE.MeshBasicMaterial;
    expect(primaryCloudMaterial.opacity).toBe(0);
    expect(secondaryCloudMaterial.opacity).toBe(0);
    expect(systems.root.userData.tslSkyComposition).toEqual({
      sceneBackgroundDominant: true,
      atmosphereSkyVisible: false,
      cloudVeilVisible: false,
    });
    const retainedSkyUuid = atmosphereSky.uuid;
    const retainedSkyMaterialUuid = atmosphereSky.material.uuid;
    const retainedCloudTexture = cloudVeil.userData.cloudTexture as THREE.DataTexture;
    const retainedCloudTextureUuid = retainedCloudTexture.uuid;
    const skyDispose = vi.spyOn(atmosphereSky.material, 'dispose');
    const cloudTextureDispose = vi.spyOn(retainedCloudTexture, 'dispose');
    const terminalDefinition = (await ARENA_VISUAL_REGISTRY['skyline-terminal']()).definition;
    systems.applyDefinition(terminalDefinition);
    expect(systems.root.getObjectByName('Pass 64 TSL atmosphere sky')?.visible).toBe(false);
    expect(atmosphereOpacity.value).toBe(0);
    expect(cloudVeil.visible).toBe(false);
    expect(primaryCloudMaterial.opacity).toBe(0);
    expect(secondaryCloudMaterial.opacity).toBe(0);
    expect(systems.root.userData.tslSkyComposition).toEqual({
      sceneBackgroundDominant: true,
      atmosphereSkyVisible: false,
      cloudVeilVisible: false,
    });
    systems.applyDefinition(definition);
    expect(atmosphereSky.uuid).toBe(retainedSkyUuid);
    expect(atmosphereSky.material.uuid).toBe(retainedSkyMaterialUuid);
    expect((cloudVeil.userData.cloudTexture as THREE.DataTexture).uuid).toBe(retainedCloudTextureUuid);
    expect(atmosphereOpacity.value).toBe(0);
    expect(primaryCloudMaterial.opacity).toBe(0);
    expect(secondaryCloudMaterial.opacity).toBe(0);
    expect(skyDispose).not.toHaveBeenCalled();
    expect(cloudTextureDispose).not.toHaveBeenCalled();
    const reviewCamera = { ...definition.reviewCameras[0], fixedTimeMs: 63_321, seed: 9_117 };
    systems.setReviewCamera(reviewCamera);
    systems.update(999_999);
    expect(systems.root.userData).toMatchObject({
      tslReviewCameraId: reviewCamera.id,
      tslReviewTimeMs: reviewCamera.fixedTimeMs,
      tslReviewSeed: reviewCamera.seed,
    });
    systems.clearReviewCamera();
    systems.update(12_345);
    expect(systems.root.userData.tslReviewTimeMs).toBe(12_345);
    expect(systems.root.userData.tslReviewCameraId).toBeUndefined();
    systems.dispose();
  }, 20_000);

  it('fails closed when a legacy custom shader appears in the WebGPU review scene', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial()));
    const audit = auditRuntimeTslTraversal(
      scene,
      TSL_MIGRATION_INVENTORY.map((entry) => entry.replacementPipelineId),
    );
    expect(audit.legacyShaderMaterials).toHaveLength(1);
    expect(() => assertRuntimeTslTraversal(audit)).toThrow(/legacy shader materials remain/);
  });

  it('precompiles against the exact ScenePass HDR target and MRT before restoring renderer state', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const previousTarget = new THREE.RenderTarget(2, 2);
    const previousMrt = { name: 'previous-mrt' };
    let currentTarget: THREE.RenderTarget | null = previousTarget;
    let currentMrt: unknown = previousMrt;
    let systems: ReturnType<typeof createPass64TslSceneSystems>;
    const renderer = {
      getRenderTarget: vi.fn(() => currentTarget),
      getMRT: vi.fn(() => currentMrt),
      setRenderTarget: vi.fn((target: THREE.RenderTarget | null) => { currentTarget = target; }),
      setMRT: vi.fn((value: unknown) => { currentMrt = value; }),
      compileAsync: vi.fn(async (root: THREE.Object3D, activeCamera: THREE.Camera, targetScene: THREE.Scene) => {
        expect(root.name).toBe('exact-coverage-root');
        expect(activeCamera).toBe(camera);
        expect(targetScene).toBe(scene);
        expect(currentTarget).toBe(systems.principalHdrTarget);
        expect(currentMrt).not.toBe(previousMrt);
        expect(currentMrt).not.toBeNull();
      }),
    };
    const renderPipeline = { outputNode: null, renderer } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, {
      principalSamples: 2,
      volumetricScale: 1,
      ambientOcclusion: {
        quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52, denoise: true,
      },
      post: {
        bloomStrength: 0.14, exposureScale: 1, toneMapping: 'aces', filmGrainScale: 1, vignetteStrength: 0, sharpness: 0,
      },
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
    });
    const root = new THREE.Group();
    root.name = 'exact-coverage-root';
    scene.add(root);

    await systems.precompileExactScenePass(root);

    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(renderer.setRenderTarget.mock.calls.map(([target]) => target)).toEqual([
      systems.principalHdrTarget,
      previousTarget,
    ]);
    expect(renderer.setMRT.mock.calls.at(-1)?.[0]).toBe(previousMrt);
    expect(currentTarget).toBe(previousTarget);
    expect(currentMrt).toBe(previousMrt);
    // The arena transition profiler can only see `coverage-submit-fence` as a
    // single number (9.8 s on farcrysis at MAX on an RTX 5080, against a 12 s
    // cold allowance) and cannot say how much of it is this yielding compile
    // versus the forced full-coverage draw that follows. Publishing the split
    // is what stops the next attempt at that budget from guessing, so it is
    // pinned rather than left as an incidental field.
    expect(systems.root.userData.pass65AdvancedGraphics.exactScenePassPrecompile)
      .toMatchObject({ runs: 1 });
    expect(systems.root.userData.pass65AdvancedGraphics.exactScenePassPrecompile.durationMs)
      .toBeGreaterThanOrEqual(0);
    systems.dispose();
    previousTarget.dispose();
  });

  it('restores the prior renderer target and MRT when exact ScenePass compilation fails', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const previousTarget = new THREE.RenderTarget(2, 2);
    const previousMrt = { name: 'previous-mrt' };
    let currentTarget: THREE.RenderTarget | null = previousTarget;
    let currentMrt: unknown = previousMrt;
    const renderer = {
      getRenderTarget: vi.fn(() => currentTarget),
      getMRT: vi.fn(() => currentMrt),
      setRenderTarget: vi.fn((target: THREE.RenderTarget | null) => { currentTarget = target; }),
      setMRT: vi.fn((value: unknown) => { currentMrt = value; }),
      compileAsync: vi.fn(async () => { throw new Error('synthetic compile failure'); }),
    };
    const renderPipeline = { outputNode: null, renderer } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    const root = new THREE.Group();
    scene.add(root);

    await expect(systems.precompileExactScenePass(root)).rejects.toThrow('synthetic compile failure');
    expect(currentTarget).toBe(previousTarget);
    expect(currentMrt).toBe(previousMrt);
    systems.dispose();
    previousTarget.dispose();
  });

  /**
   * HF-420 defect: `graphics.oceanWaveAmplitude` changes with the quality
   * profile WITHOUT an arena swap, and only the perimeter ocean's uniform was
   * re-read for it. A pond therefore kept whatever amplitude it happened to be
   * constructed with, so the HF-358 "profile gain x authored scale" rule -
   * documented in the surrounding code as a FIXED defect - quietly did not
   * hold for ponds. Map 3 is the case that exposes it: two ponds, no sea, so
   * the perimeter path this used to rely on does not even run.
   */
  it('re-applies profile gain x authored scale to PONDS on a graphics change, not only to the sea', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY.map3()).definition;
    const graphics = {
      principalSamples: 1 as const,
      volumetricScale: 0.5,
      ambientOcclusion: {
        quality: 'off' as const, enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false,
      },
      post: {
        bloomStrength: 0,
        exposureScale: 1,
        toneMapping: 'agx' as const,
        filmGrainScale: 0,
        vignetteStrength: 0,
        sharpness: 0,
      },
      // NOT RUSTWORKS_OCEAN_AMPLITUDE.*: all three profiles are deliberately
      // the SAME 1.55 (wave height is gameplay authority, not a quality knob),
      // so writing this test against two of them would assert nothing at all.
      // Two distinct gains are the only way to see the uniform follow.
      oceanWaveAmplitude: 1.55,
      reflectionScale: 1,
      reflectionQuality: 'high' as const,
      environmentIntensity: 1,
    };
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, graphics);
    const pools = systems.root.getObjectByName('Pass 64 TSL water pools') as THREE.Group;
    expect(pools.children.length).toBeGreaterThan(0);
    const scales = pools.children.map((pool) => (pool.userData.waterBody as { amplitudeScale: number }).amplitudeScale);
    // Constructed with the profile gain applied...
    expect(pools.children.map((pool) => (pool.userData.waveAmplitudeUniform as { value: number }).value))
      .toEqual(scales.map((scale) => 1.55 * scale));
    // ...and it must FOLLOW a later profile change with no arena swap. Before
    // the fix this assertion failed: the uniforms kept the construction value.
    systems.applyGraphics({ ...graphics, oceanWaveAmplitude: 0.62 });
    expect(pools.children.map((pool) => (pool.userData.waveAmplitudeUniform as { value: number }).value))
      .toEqual(scales.map((scale) => 0.62 * scale));
    expect(pools.children.map((pool) => pool.userData.waveAmplitude))
      .toEqual(scales.map((scale) => 0.62 * scale));
    // And the ponds are OBSERVABLE: an arena with no perimeter body used to
    // publish oceanWaveAmplitude 0 and nothing else, so "no water" and "pond
    // water" read identically in diagnostics.
    expect(systems.root.userData.pass65AdvancedGraphics).toMatchObject({
      oceanWaveAmplitude: 0,
      oceanPoolCount: pools.children.length,
      oceanPoolWaveAmplitude: Math.max(...scales.map((scale) => 0.62 * scale)),
    });
    systems.dispose();
  });

  it('allocates the selected HDR samples and applies bounded volumetric/post settings', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, {
      principalSamples: 2,
      volumetricScale: 0.5,
      ambientOcclusion: {
        quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52, denoise: true,
      },
      post: {
        bloomStrength: 0,
        exposureScale: 0.9,
        toneMapping: 'agx',
        filmGrainScale: 0,
        vignetteStrength: 0.35,
        sharpness: 0,
      },
      oceanWaveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.performance,
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
    });
    expect(systems.principalHdrTarget.samples).toBe(2);
    expect(systems.principalHdrTarget.textures.map(({ name }) => name)).toEqual(['output', 'normal']);
    const { artDirectionForArena } = await import('./art-direction');
    const rustworksDensity = artDirectionForArena('rustworks-1v1').atmosphere.density;
    expect(systems.root.userData.pass65AdvancedGraphics).toEqual({
      principalSamples: 2,
      volumetricScale: 0.5,
      volumetricActual: {
        scale: 0.5,
        // Lane L: authored strengths are scaled by the arena art direction's
        // atmosphere density inside the UNCHANGED opacity ceilings, then by
        // volumetric scale. The density is read from the catalog rather than
        // copied here: what this pins is the composition formula and the
        // ceilings, and a hardcoded copy only ever pins how stale the test is.
        mistOpacity: Math.min(0.12, (0.035 + 0.28 * 0.09) * rustworksDensity) * 0.5,
        mistLayers: 3,
        smokeOpacity: (0.035 + 0.28 * 0.12) * rustworksDensity * 0.5,
        smokeLayers: 2,
        dustOpacity: Math.min(0.32, (0.08 + 0.1 * 0.72) * rustworksDensity) * 0.5,
        dustMotes: 48,
      },
      oceanWaveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.performance,
      // HF-420: ponds are published alongside the perimeter ocean rather than
      // folded into it, so an arena with ponds and no sea (Map 3) stops
      // reporting 0 for both. RustRig has a sea and no ponds, so both read 0
      // here - and this exact-shape assertion is what makes that additive.
      oceanPoolCount: 0,
      oceanPoolWaveAmplitude: 0,
      bloomStrength: 0,
      filmGrainScale: 0,
      vignetteStrength: 0.35,
      ambientOcclusion: {
        quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52, denoise: true,
      },
      // HF-364: the screen-space stack is reported even when nothing is on, so
      // telemetry can prove the zero state rather than inferring it from an
      // absent field.
      screenSpace: {
        // HF-401: the shaft receipt now also carries the gain the composite
        // ACTUALLY received on the last presented frame, because "the tier is
        // on" and "the shafts are reaching the picture" were indistinguishable
        // while three was silently substituting a default material for the
        // raymarch. With the whole stack off it must be exactly zero — one
        // more pinned field than this expectation carried before, not one
        // fewer.
        godrays: { ...SCREEN_SPACE_POST_DISABLED.godrays, effectiveAdditiveGain: 0 },
        reflections: SCREEN_SPACE_POST_DISABLED.reflections,
        globalIllumination: SCREEN_SPACE_POST_DISABLED.globalIllumination,
        depthOfField: SCREEN_SPACE_POST_DISABLED.depthOfField,
        motionBlur: SCREEN_SPACE_POST_DISABLED.motionBlur,
        upscaling: SCREEN_SPACE_POST_DISABLED.upscaling,
      },
      // Cold-compile attribution for the arena coverage fence, published from
      // construction so the zero state is provable rather than inferred from
      // an absent field - the same rule the screen-space block above follows.
      exactScenePassPrecompile: { durationMs: 0, runs: 0 },
      // The live scene.environment receipt, published from construction for the
      // same reason as the two blocks above: this test constructs WITHOUT a
      // renderer, so there is no PMREM and the honest published state is
      // `present: false` next to the intensity the arena SHOULD carry. That
      // gap is exactly what shipped unnoticed on the first arena of every real
      // session until 2026-08-31, and it is now a published number rather than
      // an absent field nobody could probe.
      arenaEnvironment: {
        arenaId: 'rustworks-1v1',
        reflectionQuality: 'high',
        present: false,
        environmentName: null,
        environmentIntensity: 1,
        expectedEnvironmentIntensity: arenaEnvironmentScale('rustworks-1v1'),
        matchesIblState: false,
        sourceTextureName: null,
        // The tier the setting REQUESTED, next to the size the generator
        // produced. Zero here because no renderer means no PMREM; in the live
        // game they are published side by side because the WebGPU equirect
        // path derives its cube size from the panorama and does not honour the
        // requested tier - a gap that is now visible rather than implied.
        resolutionTier: 128,
        generatedCubeSize: 0,
      },
      linearSourceStages: [
        'scene-pass-linear-hdr', 'contact-occlusion-multiply', 'depth-guarded-bloom-add',
      ],
    });
    expect((systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh).userData).toMatchObject({
      waveBands: OCEAN_WAVES.length,
      waveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.performance,
      waveAuthority: RUSTWORKS_OCEAN_AUTHORITY_ID,
    });
    const dust = systems.root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points;
    expect(dust.geometry.drawRange.count).toBe(48);
    expect(systems.root.getObjectByName('Pass 64 TSL smoke')?.children.filter(({ visible }) => visible)).toHaveLength(2);
    expect(renderPipeline.outputNode).not.toBeNull();
    systems.applyGraphics({
      principalSamples: 2,
      volumetricScale: 1,
      ambientOcclusion: {
        quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false,
      },
      post: {
        bloomStrength: 0.14,
        exposureScale: 1,
        toneMapping: 'aces',
        filmGrainScale: 1,
        vignetteStrength: 0,
        sharpness: 0,
      },
      oceanWaveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.blender,
      reflectionScale: 1,
      reflectionQuality: 'high',
      environmentIntensity: 1,
    });
    expect(systems.root.userData.pass65AdvancedGraphics).toMatchObject({
      principalSamples: 2,
      volumetricScale: 1,
      volumetricActual: { scale: 1, mistLayers: 5, smokeLayers: 3, dustMotes: 96 },
      oceanWaveAmplitude: RUSTWORKS_OCEAN_AMPLITUDE.blender,
      ambientOcclusion: { enabled: false },
    });
    expect((systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh).userData.waveAmplitudeUniform.value)
      .toBe(RUSTWORKS_OCEAN_AMPLITUDE.blender);
    systems.dispose();
  });

  // HF-358: WebGPU water is registry-driven (water-authoring) and built by the
  // ocean-tsl factory over the shared frozen ocean-spectrum — the same band
  // table CPU buoyancy samples. RustRig keeps its exact pre-HF-358 surface.
  it('builds registry-driven ocean-tsl water with CPU/GPU parity metadata (HF-358)', async () => {
    const { oceanSpectrumFingerprint, OCEAN_SPECTRUM_AUTHORITY_ID, OCEAN_BANDS, sampleOcean } = await import('../water/ocean-spectrum');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    const water = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    // RustRig regression guard: exact historical surface geometry.
    water.geometry.computeBoundingBox();
    expect(water.visible).toBe(true);
    expect((water.geometry as THREE.PlaneGeometry).parameters.widthSegments).toBe(256);
    expect(water.geometry.boundingBox?.getCenter(new THREE.Vector3()).y).toBeCloseTo(-19.5);
    expect(water.userData).toMatchObject({
      waveBands: OCEAN_BANDS.length,
      waveAuthority: OCEAN_SPECTRUM_AUTHORITY_ID,
      waveNormalAuthority: OCEAN_SPECTRUM_AUTHORITY_ID,
      surfaceSegments: 256,
      swimmable: false,
    });
    expect(water.userData.oceanSpectrumFingerprint).toBe(oceanSpectrumFingerprint());
    expect(water.getObjectByName('Pass 66 curved RustRig ocean horizon')).toBeInstanceOf(THREE.Mesh);
    // The GPU displacement expression is built from the same frozen table the
    // CPU sampler reads; the fingerprint stamp is the machine-checkable proof.
    const body = water.userData.waterBody as { level: number };
    const cpu = sampleOcean(31, -17, 4.2);
    expect(body.level + cpu.height).toBeCloseTo(-19.5 + cpu.height, 12);
    // Registry-driven: a non-water arena swaps to the inert placeholder.
    systems.applyDefinition((await ARENA_VISUAL_REGISTRY['gun-range']()).definition);
    const placeholder = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    expect(placeholder.visible).toBe(false);
    expect((placeholder.userData.waterBody as unknown)).toBeUndefined();
    systems.dispose();
  });

  it('HF-358: arena switch disposes the retired water subtree including the child horizon ring', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    const water = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    // The horizon skirt is a CHILD of the water mesh with its own geometry/material.
    const horizon = water.getObjectByName('Pass 66 curved RustRig ocean horizon') as THREE.Mesh;
    expect(horizon).toBeInstanceOf(THREE.Mesh);
    const horizonGeometryDispose = vi.spyOn(horizon.geometry, 'dispose');
    const horizonMaterialDispose = vi.spyOn(
      horizon.material as THREE.Material,
      'dispose',
    );
    // Switching to a waterless arena retires the whole water node.
    systems.applyDefinition((await ARENA_VISUAL_REGISTRY['gun-range']()).definition);
    expect(horizonGeometryDispose).toHaveBeenCalled();
    expect(horizonMaterialDispose).toHaveBeenCalled();
    systems.dispose();
  });
});

describe('Lane L arena art direction wiring', () => {
  it('pushes the arena identity into an installed filmic chain at build and on every arena switch', async () => {
    const { installFilmicGradeChain } = await import('./filmic-grade-chain');
    const { ARENA_ART_DIRECTIONS } = await import('./art-direction');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = {
      outputNode: null,
      outputColorTransform: true,
      needsUpdate: false,
    } as unknown as RenderPipeline;
    const handle = installFilmicGradeChain(
      renderPipeline as unknown as import('./filmic-grade-chain').GradedRenderPipeline,
    );
    expect(handle.arenaArtDirection()).toBeNull();
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    // Building the scene systems handed the chain the first arena's identity.
    expect(handle.arenaArtDirection()).toBe(ARENA_ART_DIRECTIONS['atomic-acres']);
    // An arena switch re-points the chain at the new place.
    systems.applyDefinition((await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition);
    expect(handle.arenaArtDirection()).toBe(ARENA_ART_DIRECTIONS['rustworks-1v1']);
    systems.dispose();
    handle.dispose();
  });

  it('keeps working with no chain installed (unit-test pipelines stay bare)', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['gun-range']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    expect(systems.root.userData.tslArenaVisualDefinitionId).toBe('gun-range');
    systems.dispose();
  });

  it('tints the atmosphere particles per arena (rust haze is not farm haze)', async () => {
    const { ARENA_ART_DIRECTIONS } = await import('./art-direction');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['atomic-acres']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition);
    const mist = systems.root.getObjectByName('Pass 64 TSL mist');
    const dust = systems.root.getObjectByName('Pass 64 TSL deterministic dust');
    const mistNear = mist?.userData.tintNearUniform as { value: THREE.Color };
    const dustFar = dust?.userData.tintFarUniform as { value: THREE.Color };
    const acres = ARENA_ART_DIRECTIONS['atomic-acres'];
    expect(mistNear.value.getHex()).toBe(acres.atmosphere.mistNear);
    expect(dustFar.value.getHex()).toBe(acres.atmosphere.dustFar);
    systems.applyDefinition((await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition);
    const rust = ARENA_ART_DIRECTIONS['rustworks-1v1'];
    expect(mistNear.value.getHex()).toBe(rust.atmosphere.mistNear);
    expect(dustFar.value.getHex()).toBe(rust.atmosphere.dustFar);
    expect(rust.atmosphere.mistNear).not.toBe(acres.atmosphere.mistNear);
    systems.dispose();
  });
});
