import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HalfFloatType, NodeMaterial, RGBAFormat } from 'three/webgpu';
import { texture } from 'three/tsl';
import {
  buildTaaResolveNode,
  clampHistoryYCoCg,
  reprojectHistoryUv,
  resolveTaaSample,
  rgbToYCoCg,
  TAA_RESOLVE_PIPELINE_ID,
  TAA_RESOLVE_STAGE,
  yCoCgToRgb,
  type TaaResolveSources,
} from './taa-resolve';
import { GRAPHICS_PRESET_VALUES } from '../graphics-settings-registry';
import { resolveGraphicsRuntime } from '../pass65-settings';
import { screenSpaceMrtRequirement, screenSpacePostStages } from './screen-space-post';
import { screenSpaceTopologyKey } from './screen-space-post-profile';
import { TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';
import { readFileSync } from 'node:fs';

function fakeSources(): TaaResolveSources {
  return {
    beauty: texture(new THREE.Texture()),
    depth: texture(new THREE.Texture()),
    velocity: texture(new THREE.Texture()),
    camera: new THREE.PerspectiveCamera(),
  } as TaaResolveSources;
}

describe('HF-472 TAA resolve', () => {
  it('reprojects NDC velocity into UV space and keeps the off switch bit-for-bit', () => {
    expect(reprojectHistoryUv([0.5, 0.5], [0.2, -0.4])).toEqual([0.4, 0.3]);
    const current: [number, number, number] = [0.2, 0.3, 0.4];
    expect(resolveTaaSample({
      current,
      history: [0.9, 0.9, 0.9],
      neighbourhoodMin: [0, 0, 0],
      neighbourhoodMax: [1, 1, 1],
      validHistory: false,
      strength: 0.9,
    })).toEqual(current);
  });

  it('round-trips RGB/YCoCg and clamps history in the YCoCg neighbourhood', () => {
    const rgb: [number, number, number] = [0.2, 0.35, 0.7];
    const roundTrip = yCoCgToRgb(rgbToYCoCg(rgb));
    expect(roundTrip[0]).toBeCloseTo(rgb[0], 10);
    expect(roundTrip[1]).toBeCloseTo(rgb[1], 10);
    expect(roundTrip[2]).toBeCloseTo(rgb[2], 10);

    const clamped = clampHistoryYCoCg([1, 0, 0], [0.25, -0.05, -0.05], [0.35, 0.05, 0.05]);
    expect(clamped[0]).toBeCloseTo(0.35, 10);
    expect(clamped[1]).toBeCloseTo(0.2, 10);
    expect(clamped[2]).toBeCloseTo(0.25, 10);
    expect(resolveTaaSample({
      current: [0.2, 0.2, 0.2],
      history: [1, 0, 0],
      neighbourhoodMin: [0.25, -0.05, -0.05],
      neighbourhoodMax: [0.35, 0.05, 0.05],
      validHistory: true,
      strength: 1,
    })).toEqual(clamped);
  });

  it('owns exactly two RGBA16F targets and one resolve NodeMaterial', () => {
    const graph = buildTaaResolveNode(fakeSources(), { enabled: true, strength: 0.9 });
    expect(graph.stage).toBe(TAA_RESOLVE_STAGE);
    expect(graph.node.historyTarget).not.toBe(graph.node.resolveTarget);
    expect(graph.historyTarget.texture.type).toBe(HalfFloatType);
    expect(graph.resolveTarget.texture.type).toBe(HalfFloatType);
    expect(graph.historyTarget.texture.format).toBe(RGBAFormat);
    expect(graph.resolveTarget.texture.format).toBe(RGBAFormat);
    expect(graph.historyTarget.texture.name).toBe('TAA ours.history.RGBA16F');
    expect(graph.resolveTarget.texture.name).toBe('TAA ours.resolve.RGBA16F');
    expect(graph.node.resolveMaterial).toBeInstanceOf(NodeMaterial);
    expect(graph.node.resolveMaterial.name).toBe('TAA ours.resolve NodeMaterial');
    expect(graph.strength.value).toBe(0.9);
    graph.dispose();
  });

  it('adds one admitted pipeline and reaches the exact ScenePass precompile fence', () => {
    const beforeTaa = TSL_MIGRATION_INVENTORY.filter(({ replacementPipelineId }) => replacementPipelineId !== TAA_RESOLVE_PIPELINE_ID);
    expect(beforeTaa).toHaveLength(7);
    expect(TSL_MIGRATION_INVENTORY).toHaveLength(beforeTaa.length + 1);
    expect(TSL_MIGRATION_INVENTORY.filter(({ replacementPipelineId }) => replacementPipelineId === TAA_RESOLVE_PIPELINE_ID)).toHaveLength(1);

    const pass64 = readFileSync('src/rendering/pass64-tsl-scene.ts', 'utf8');
    expect(pass64).toContain('await renderer.compileAsync(precompileRoot, camera, scene)');
    expect(pass64).toContain('const compiledPipelineIds = Object.freeze(TSL_MIGRATION_INVENTORY.map');
    expect(pass64).toContain('buildScreenSpacePostGraph');
  });

  it('warms the unattached resolve and ping-pongs history without a per-frame colour copy', () => {
    const source = readFileSync('src/rendering/taa-resolve.ts', 'utf8');
    expect(source).toContain('await renderer.compileAsync(QUAD, QUAD.camera, targetScene)');
    expect(source).toContain('renderer.setMRT(null)');
    expect(source).toContain('this.historyTextureNode.value = this.historyReadTarget.texture');
    expect(source).toContain('this.outputTexture.value = this.historyWriteTarget.texture');
    expect(source).not.toContain('renderer.copyTextureToTexture(this.resolveTarget.texture, this.historyTarget.texture)');
  });

  it('admits velocity on QUALITY, disables principal MSAA only with TAA, and filters AO/GI only with TAA', () => {
    const qualityWithMsaa = resolveGraphicsRuntime({
      schemaVersion: 1,
      preset: 'custom',
      ...GRAPHICS_PRESET_VALUES.high,
      antiAliasing: 'msaa-4x',
      taaResolve: true,
    });
    const qualityWithoutTaa = resolveGraphicsRuntime({
      schemaVersion: 1,
      preset: 'custom',
      ...GRAPHICS_PRESET_VALUES.high,
      antiAliasing: 'msaa-4x',
      taaResolve: false,
    });
    const balanced = resolveGraphicsRuntime({
      schemaVersion: 1,
      preset: 'custom',
      ...GRAPHICS_PRESET_VALUES.balanced,
    });
    expect(qualityWithMsaa.antialiasSamples).toBe(0);
    expect(qualityWithoutTaa.antialiasSamples).toBe(4);
    expect(screenSpaceMrtRequirement(qualityWithMsaa.screenSpace).velocity).toBe(true);
    expect(screenSpaceMrtRequirement(balanced.screenSpace).velocity).toBe(false);
    expect(screenSpacePostStages(qualityWithMsaa.screenSpace)).toContain(TAA_RESOLVE_STAGE);
    expect(screenSpacePostStages(qualityWithoutTaa.screenSpace)).not.toContain(TAA_RESOLVE_STAGE);
    expect(screenSpaceTopologyKey(qualityWithMsaa.screenSpace)).not.toBe(screenSpaceTopologyKey(qualityWithoutTaa.screenSpace));

    const pass64 = readFileSync('src/rendering/pass64-tsl-scene.ts', 'utf8');
    const post = readFileSync('src/rendering/screen-space-post.ts', 'utf8');
    expect(pass64).toContain('gtaoPass.useTemporalFiltering = screenSpaceRuntime.taaResolve.enabled');
    expect(post).toContain('node.useTemporalFiltering = runtime.taaResolve.enabled');
  });
});
