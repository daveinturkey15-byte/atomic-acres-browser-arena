import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ArenaId } from '../map-selection';
import type { ArenaVisualDefinition, LoadedArenaVisual } from './arena-visual-definition';
import { createIdempotentRootDisposer, validateArenaVisualDefinition } from './arena-visual-definition';
import { ARENA_VISUAL_REGISTRY, ArenaVisualStreamController, type ArenaVisualRegistry } from './arena-visual-stream';

const ARENA_IDS: readonly ArenaId[] = ['atomic-acres', 'rustworks-1v1', 'gun-range', 'skyline-terminal'];

describe('Pass 64 arena visual definitions', () => {
  it('defines exactly one dynamically imported contract for every stable arena ID', async () => {
    expect(Object.keys(ARENA_VISUAL_REGISTRY)).toEqual(ARENA_IDS);
    const definitions = await Promise.all(ARENA_IDS.map(async (id) => (await ARENA_VISUAL_REGISTRY[id]()).definition));
    expect(definitions.map((definition) => definition.id)).toEqual(ARENA_IDS);
    expect(new Set(definitions.map((definition) => definition.moduleId)).size).toBe(ARENA_IDS.length);
    for (const definition of definitions) {
      expect(() => validateArenaVisualDefinition(definition)).not.toThrow();
      expect(definition.collisionIdentity).toMatchObject({ authoritativeArenaId: definition.id, presentationMayMutateAuthority: false });
      expect(definition.colorPipeline).toMatchObject({ workingSpace: 'linear-srgb-hdr', toneMap: 'aces-filmic', output: 'srgb' });
      expect(definition.reviewCameras.some((camera) => camera.purpose === 'light-occlusion')).toBe(true);
      expect(definition.budgets.maximumDrawCalls).toBeGreaterThan(0);
      expect(definition.budgets.maximumShadowMapPixels).toBeGreaterThan(0);
    }
  });

  it('requires physical practical lights to carry coherent occlusion policy', async () => {
    for (const id of ARENA_IDS) {
      const { definition } = await ARENA_VISUAL_REGISTRY[id]();
      for (const practical of definition.lighting.practicals) {
        if (practical.policy === 'shadowed-local') expect(practical.castsShadow).toBe(true);
        else expect(practical.castsShadow).toBe(false);
      }
    }
  });

  it('keeps the Gun Range overview inside its shell with a target-rich sightline', async () => {
    const { definition } = await ARENA_VISUAL_REGISTRY['gun-range']();
    const overview = definition.reviewCameras.find((entry) => entry.id === 'gun-range-overview');
    expect(overview).toBeDefined();
    expect(overview!.position[1]).toBeLessThan(7.1);
    expect(overview!.position[2]).toBeGreaterThan(11);
    expect(overview!.target[2]).toBeLessThan(-9);
  });

  it('disposes geometry, materials and textures once even when teardown repeats', () => {
    const root = new THREE.Group();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    root.add(new THREE.Mesh(geometry, material));
    let textureDisposals = 0;
    let materialDisposals = 0;
    let geometryDisposals = 0;
    texture.addEventListener('dispose', () => { textureDisposals += 1; });
    material.addEventListener('dispose', () => { materialDisposals += 1; });
    geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
    const dispose = createIdempotentRootDisposer(root);
    dispose();
    dispose();
    expect({ textureDisposals, materialDisposals, geometryDisposals }).toEqual({ textureDisposals: 1, materialDisposals: 1, geometryDisposals: 1 });
    expect(root.children).toHaveLength(0);
  });
});

function fakeDefinition(id: ArenaId, requestUrl: string | null = null): ArenaVisualDefinition {
  const load = async (context: Parameters<ArenaVisualDefinition['load']>[0]): Promise<LoadedArenaVisual> => {
    if (requestUrl) context.recordRequest(requestUrl);
    const root = new THREE.Group();
    root.userData.arenaVisualDefinitionId = id;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    return { definitionId: id, generation: context.generation, root, requestedResources: requestUrl ? [requestUrl] : [], dispose: createIdempotentRootDisposer(root) };
  };
  return {
    id,
    displayLabel: id,
    moduleId: `fake.${id}`,
    assetDependencies: ['./selected.glb'],
    sharedAssetDependencies: [],
    lighting: { sunColor: 0xffffff, sunIntensity: 1, ambientColor: 0xffffff, ambientIntensity: 1, practicals: [] },
    fog: { color: 0, near: 1, far: 2 },
    shadows: { enabled: true, mapSize: 1, maximumDistance: 2, normalBias: 0 },
    atmosphere: { preset: 'test', mist: 0, dust: 0, clouds: false },
    colorPipeline: { id: 'test', workingSpace: 'linear-srgb-hdr', toneMap: 'aces-filmic', exposure: 1, grade: { contrast: 1, saturation: 1, shadowTint: 0, highlightTint: 0xffffff }, grain: { mode: 'ordered-dither', strength: 0, deterministic: true }, output: 'srgb' },
    budgets: { maximumDrawCalls: 1, maximumTriangles: 1, maximumTextureBytes: 1, maximumShadowLights: 1, maximumShadowMapPixels: 1, maximumPostTextureSamples: 1, maximumTransientBytes: 1, cpuFrameP95Ms: 1, gpuFrameP95Ms: 1 },
    reviewCameras: [
      { id: 'a', position: [0, 0, 0], target: [0, 0, 1], fov: 1, near: 1, far: 2, fixedTimeMs: 1, seed: 1, exposure: 1, hud: 'hidden', purpose: 'overview' },
      { id: 'b', position: [0, 0, 0], target: [0, 0, 1], fov: 1, near: 1, far: 2, fixedTimeMs: 1, seed: 1, exposure: 1, hud: 'hidden', purpose: 'geometry' },
      { id: 'c', position: [0, 0, 0], target: [0, 0, 1], fov: 1, near: 1, far: 2, fixedTimeMs: 1, seed: 1, exposure: 1, hud: 'hidden', purpose: 'light-occlusion' },
    ],
    collisionIdentity: { authoritativeArenaId: id, evidence: 'fake', presentationMayMutateAuthority: false },
    exceptions: [],
    load,
  };
}

function fakeRegistry(overrides: Partial<Record<ArenaId, ArenaVisualDefinition>> = {}): ArenaVisualRegistry {
  return Object.fromEntries(ARENA_IDS.map((id) => [id, async () => ({ definition: overrides[id] ?? fakeDefinition(id) })])) as unknown as ArenaVisualRegistry;
}

describe('Pass 64 arena visual streaming transaction', () => {
  it('keeps exactly one presentation root and idempotently disposes the previous arena', async () => {
    const scene = new THREE.Scene();
    const stream = new ArenaVisualStreamController(scene, fakeRegistry());
    await stream.switchTo('atomic-acres');
    const previous = scene.children[0] as THREE.Group;
    const receipt = await stream.switchTo('skyline-terminal');
    expect(receipt).toMatchObject({ arenaId: 'skyline-terminal', generation: 2, activePresentationRoots: 1 });
    expect(previous.parent).toBeNull();
    expect(previous.children).toHaveLength(0);
    expect(scene.children.filter((node) => node.userData.arenaVisualDefinitionId)).toHaveLength(1);
    stream.dispose();
    expect(scene.children.filter((node) => node.userData.arenaVisualDefinitionId)).toHaveLength(0);
  });

  it('rejects an undeclared arena resource without replacing the active root', async () => {
    const scene = new THREE.Scene();
    const registry = fakeRegistry({
      'skyline-terminal': fakeDefinition('skyline-terminal', './assets/original/models/atomic-acres-blender-arena.glb'),
    });
    const stream = new ArenaVisualStreamController(scene, registry);
    await stream.switchTo('atomic-acres');
    const active = scene.children[0];
    await expect(stream.switchTo('skyline-terminal')).rejects.toThrow(/undeclared or unselected/);
    expect(scene.children[0]).toBe(active);
    expect(scene.children).toHaveLength(1);
    stream.dispose();
  });
});
