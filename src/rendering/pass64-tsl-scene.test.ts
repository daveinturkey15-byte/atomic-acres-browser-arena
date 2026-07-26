import * as THREE from 'three';
import type { RenderPipeline } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ARENA_VISUAL_REGISTRY } from './arena-visual-stream';
import {
  assertRuntimeTslTraversal,
  auditRuntimeTslTraversal,
  createPass64TslSceneSystems,
} from './pass64-tsl-scene';
import { canonicalTslDescriptor, tslDescriptorSha256, TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

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
      quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0,
    });
    expect(() => assertRuntimeTslTraversal(audit)).not.toThrow();
    const rustDefinition = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;
    systems.applyDefinition(rustDefinition);
    expect(systems.root.userData.tslArenaVisualDefinitionId).toBe('rustworks-1v1');
    expect(systems.root.userData.tslAtmosphere).toEqual(rustDefinition.atmosphere);
    const water = systems.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh;
    water.geometry.computeBoundingBox();
    expect(water.visible).toBe(true);
    expect(water.userData).toMatchObject({ waveBands: 3, waveAuthority: 'presentation-only-tsl' });
    expect(systems.root.getObjectByName('Pass 64 TSL mist')?.children).toHaveLength(5);
    expect(water.geometry.boundingBox?.getCenter(new THREE.Vector3()).y).toBeCloseTo(-19.5);
    expect(systems.root.getObjectByName('Pass 64 TSL grass')?.visible).toBe(false);
    const dust = systems.root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points;
    expect(dust.geometry.drawRange.count).toBe(96);
    systems.applyDefinition(definition);
    expect(water.visible).toBe(false);
    expect(systems.root.getObjectByName('Pass 64 TSL grass')?.visible).toBe(true);
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
  });

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

  it('allocates the selected HDR samples and applies bounded volumetric/post settings', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderPipeline = { outputNode: null } as unknown as RenderPipeline;
    const definition = (await ARENA_VISUAL_REGISTRY['rustworks-1v1']()).definition;
    const systems = createPass64TslSceneSystems(scene, camera, renderPipeline, definition, {
      principalSamples: 2,
      volumetricScale: 0.5,
      ambientOcclusion: {
        quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52,
      },
      post: {
        bloomStrength: 0,
        exposureScale: 0.9,
        toneMapping: 'agx',
        filmGrainScale: 0,
        vignetteStrength: 0.35,
      },
    });
    expect(systems.principalHdrTarget.samples).toBe(2);
    expect(systems.principalHdrTarget.textures.map(({ name }) => name)).toEqual(['output', 'normal']);
    expect(systems.root.userData.pass65AdvancedGraphics).toEqual({
      principalSamples: 2,
      volumetricScale: 0.5,
      bloomStrength: 0,
      filmGrainScale: 0,
      vignetteStrength: 0.35,
      ambientOcclusion: {
        quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52,
      },
    });
    const dust = systems.root.getObjectByName('Pass 64 TSL deterministic dust') as THREE.Points;
    expect(dust.geometry.drawRange.count).toBe(48);
    expect(systems.root.getObjectByName('Pass 64 TSL smoke')?.children.filter(({ visible }) => visible)).toHaveLength(2);
    expect(renderPipeline.outputNode).not.toBeNull();
    systems.dispose();
  });
});
