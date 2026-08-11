import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSkylineTerminal } from '../additional-maps';
import { HOUSE_LAYOUT } from '../arena-layout';
import { firstSegmentBoxHit, isBlocked, type Point3 } from '../collision';
import { createHouseArchitecture, solidBounds } from '../house-navigation';
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
      expect(definition.budgets.maximumTransientBytes).toBeGreaterThanOrEqual(256 * 1024 * 1024);
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
    const neonLanes = definition.reviewCameras.find((entry) => entry.id === 'gun-range-neon-lanes');
    const lateralTargets = definition.reviewCameras.find((entry) => entry.id === 'gun-range-lateral-targets');
    const testBayCorridor = definition.reviewCameras.find((entry) => entry.id === 'gun-range-test-bay-corridor');
    const testBayDoorApproach = definition.reviewCameras.find((entry) => entry.id === 'gun-range-test-bay-door-approach');
    const testBayDoorBayFace = definition.reviewCameras.find((entry) => entry.id === 'gun-range-test-bay-door-bay-face');
    const testBayOverview = definition.reviewCameras.find((entry) => entry.id === 'gun-range-test-bay-overview');
    expect(overview).toBeDefined();
    expect(overview!.position[1]).toBeLessThan(7.1);
    expect(overview!.position[2]).toBeGreaterThan(11);
    expect(overview!.target[2]).toBeLessThan(-9);
    expect(neonLanes).toMatchObject({
      position: [0, 2.55, -1],
      target: [0, 1.7, -36],
      purpose: 'light-occlusion',
    });
    expect(lateralTargets).toMatchObject({
      position: [0, 2.45, -18.5],
      target: [0, 1.72, -29],
      purpose: 'geometry',
    });
    expect(testBayCorridor).toMatchObject({
      position: [24, 2.25, 10.25],
      target: [51.5, 2.15, 12],
      purpose: 'geometry',
    });
    expect(testBayDoorApproach).toMatchObject({
      position: [44.5, 2.3, 10.1],
      target: [51.5, 3.05, 12],
      purpose: 'geometry',
    });
    expect(testBayDoorBayFace).toMatchObject({
      position: [59, 2.55, 13.9],
      target: [51.5, 3.05, 12],
      purpose: 'light-occlusion',
    });
    expect(testBayOverview).toMatchObject({
      position: [92, 4.3, 34],
      target: [72, 1.2, 1],
      purpose: 'overview',
    });
  });

  it('keeps the Terminal open-boarding review camera above its walkable floor authority', async () => {
    const { definition } = await ARENA_VISUAL_REGISTRY['skyline-terminal']();
    const portal = definition.reviewCameras.find((entry) => entry.id === 'terminal-boarding-open');
    expect(portal).toBeDefined();
    const map = buildSkylineTerminal(new THREE.Scene());
    const [x, y, z] = portal!.position;
    expect(isBlocked({ x, y, z }, map.colliders, 0.16)).toBe(false);
  });

  it('compares the Atomic solid wall and open portal from one legal room position', async () => {
    const { definition } = await ARENA_VISUAL_REGISTRY['atomic-acres']();
    const solid = definition.reviewCameras.find((entry) => entry.id === 'nuke-town-aqua-wall-closed');
    const portal = definition.reviewCameras.find((entry) => entry.id === 'nuke-town-aqua-door-open');
    expect(solid).toBeDefined();
    expect(portal).toBeDefined();
    expect(solid!.position).toEqual(portal!.position);
    expect(solid!.position).toEqual([-9, 2.2, -23]);
    expect(solid!.target).not.toEqual(portal!.target);
    expect(solid!.purpose).toBe('light-occlusion');
    expect(portal!.purpose).toBe('portal');

    const [aquaLayout] = HOUSE_LAYOUT;
    const architecture = createHouseArchitecture(aquaLayout.team, aquaLayout.x, aquaLayout.z, aquaLayout.facing);
    const movementBlockers = architecture.solids.filter((entry) => entry.collidable);
    const shotBlockers = architecture.solids.filter(
      (entry) => entry.collidable || (entry.kind === 'glass' && entry.breakable),
    );
    const movementBounds = movementBlockers.map(solidBounds);
    const shotBounds = shotBlockers.map(solidBounds);
    const point = ([x, y, z]: readonly [number, number, number]): Point3 => ({ x, y, z });

    expect(isBlocked(point(solid!.position), movementBounds, 0.16)).toBe(false);
    expect(isBlocked(point(portal!.position), movementBounds, 0.16)).toBe(false);

    const wallHit = firstSegmentBoxHit(point(solid!.position), point(solid!.target), shotBounds, 0);
    expect(wallHit).not.toBeNull();
    const wallSolid = shotBlockers[shotBounds.findIndex((bounds) => bounds === wallHit!.box)];
    expect(wallSolid).toMatchObject({ collidable: true, kind: 'wall', breakable: false });
    expect(wallSolid.surface).not.toBe('glass');

    const intendedOpening = architecture.openings.find((entry) => entry.id === 'ground-room-opening');
    expect(intendedOpening).toBeDefined();
    expect(portal!.target).toEqual([
      intendedOpening!.centre[0],
      portal!.position[1],
      intendedOpening!.centre[2],
    ]);
    expect(portal!.target[1]).toBeGreaterThan(intendedOpening!.centre[1] - intendedOpening!.height / 2);
    expect(portal!.target[1]).toBeLessThan(intendedOpening!.centre[1] + intendedOpening!.height / 2);
    const portalStart = point(portal!.position);
    const portalTarget = point(portal!.target);
    const portalDistance = Math.hypot(
      portalTarget.x - portalStart.x,
      portalTarget.y - portalStart.y,
      portalTarget.z - portalStart.z,
    );
    const portalEnd = {
      x: portalTarget.x + (portalTarget.x - portalStart.x) / portalDistance,
      y: portalTarget.y + (portalTarget.y - portalStart.y) / portalDistance,
      z: portalTarget.z + (portalTarget.z - portalStart.z) / portalDistance,
    };
    expect(firstSegmentBoxHit(portalStart, portalEnd, shotBounds, 0)).toBeNull();
  });

  it('rejects canonical practical motion that escapes its volume or exceeds the slow-motion bound', async () => {
    const { definition } = await ARENA_VISUAL_REGISTRY['gun-range']();
    const replaceLight = (replacement: Record<string, unknown>): ArenaVisualDefinition => ({
      ...definition,
      lighting: {
        ...definition.lighting,
        practicals: definition.lighting.practicals.map((practical) => practical.light ? {
          ...practical,
          light: { ...practical.light, ...replacement },
        } : practical),
      },
    });
    expect(() => validateArenaVisualDefinition(replaceLight({ position: [30, 6, 12] }))).toThrow(/position escapes intended volume/);
    expect(() => validateArenaVisualDefinition(replaceLight({
      motion: {
        ...definition.lighting.practicals.find((practical) => practical.light)!.light!.motion,
        intensity: { amplitudeRatio: 0.06, frequencyHz: 3, phaseRadians: 0 },
      },
    }))).toThrow(/non-strobe frequency bound/);
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
    budgets: { maximumDrawCalls: 1, maximumTriangles: 1, maximumTextureBytes: 1, maximumResidentTextureBytes: 1, maximumShadowLights: 1, maximumShadowMapPixels: 1, maximumPostTextureSamples: 1, maximumTransientBytes: 1, cpuFrameP95Ms: 1, gpuFrameP95Ms: 1 },
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
  it('adopts the actual gameplay root and never mounts a duplicate arena', async () => {
    const scene = new THREE.Scene();
    const staging = new THREE.Scene();
    const atomic = new THREE.Group();
    const terminal = new THREE.Group();
    const atomicGeometry = new THREE.BoxGeometry(1, 1, 1);
    const atomicMaterial = new THREE.MeshBasicMaterial();
    atomic.add(new THREE.Mesh(atomicGeometry, atomicMaterial));
    staging.add(atomic, terminal);
    const stream = new ArenaVisualStreamController(scene, fakeRegistry());
    const first = await stream.adoptGameplayRoot('atomic-acres', atomic);
    expect(first).toMatchObject({ authority: 'gameplay-root-adopted', activePresentationRoots: 1 });
    expect(scene.children).toEqual([atomic]);
    const second = await stream.adoptGameplayRoot('skyline-terminal', terminal);
    expect(second).toMatchObject({
      arenaId: 'skyline-terminal',
      generation: 2,
      activePresentationRoots: 1,
      retiredPresentationInventory: { geometries: 1, materials: 1 },
    });
    expect(scene.children).toEqual([terminal]);
    expect(atomic.children).toHaveLength(1);
    expect(atomic.parent).toBeNull();
  });

  it('repairs a detached or hidden selected gameplay root without replacing authority', async () => {
    const scene = new THREE.Scene();
    const terminal = new THREE.Group();
    terminal.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const stream = new ArenaVisualStreamController(scene, fakeRegistry());
    await stream.adoptGameplayRoot('skyline-terminal', terminal);
    terminal.removeFromParent();
    terminal.visible = false;
    expect(stream.restoreGameplayRoot('skyline-terminal', terminal)).toBe(true);
    expect(scene.children).toEqual([terminal]);
    expect(terminal.visible).toBe(true);
    expect(stream.restoreGameplayRoot('atomic-acres', terminal)).toBe(false);
  });

  it('binds late quality-asset requests to the selected gameplay definition receipt', async () => {
    const scene = new THREE.Scene();
    const atomic = new THREE.Group();
    const selected = fakeDefinition('atomic-acres');
    const stream = new ArenaVisualStreamController(scene, fakeRegistry({ 'atomic-acres': selected }));
    const receipt = await stream.adoptGameplayRoot('atomic-acres', atomic);
    stream.recordSelectedAssetRequest('atomic-acres', './selected.glb');
    stream.recordSelectedAssetRequest('atomic-acres', './selected.glb');
    expect(receipt.requestedResources).toEqual(['./selected.glb']);
    expect(() => stream.recordSelectedAssetRequest('atomic-acres', './wrong.glb')).toThrow(/undeclared or unselected/);
    expect(() => stream.recordSelectedAssetRequest('skyline-terminal', './selected.glb')).toThrow(/no active matching/);
  });

  it('rolls back root ownership, metadata, visibility, order and controller state when adoption assertion fails', async () => {
    const scene = new THREE.Scene();
    const staging = new THREE.Group();
    const stagedBefore = new THREE.Group();
    const candidate = new THREE.Group();
    const stagedAfter = new THREE.Group();
    candidate.visible = false;
    candidate.userData.arenaVisualDefinitionId = 'staged-marker';
    candidate.userData.arenaVisualGeneration = 77;
    staging.add(stagedBefore, candidate, stagedAfter);
    const previous = new THREE.Group();
    const unexpected = new THREE.Group();
    unexpected.userData.arenaVisualDefinitionId = 'unexpected-root';
    const stream = new ArenaVisualStreamController(scene, fakeRegistry());
    const previousReceipt = await stream.adoptGameplayRoot('atomic-acres', previous);
    scene.add(unexpected);
    const sceneBefore = [...scene.children];
    const stagingBefore = [...staging.children];

    await expect(stream.adoptGameplayRoot('skyline-terminal', candidate)).rejects.toThrow(
      /Expected one authoritative arena presentation root, found 2/,
    );

    expect(scene.children).toEqual(sceneBefore);
    expect(staging.children).toEqual(stagingBefore);
    expect(previous.parent).toBe(scene);
    expect(previous.visible).toBe(true);
    expect(previous.userData).toMatchObject({
      authoritativeArenaId: 'atomic-acres',
      arenaVisualDefinitionId: 'atomic-acres',
      arenaVisualGeneration: 1,
    });
    expect(candidate.parent).toBe(staging);
    expect(candidate.visible).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(candidate.userData, 'authoritativeArenaId')).toBe(false);
    expect(candidate.userData).toMatchObject({
      arenaVisualDefinitionId: 'staged-marker',
      arenaVisualGeneration: 77,
    });
    expect(() => stream.recordSelectedAssetRequest('atomic-acres', './selected.glb')).not.toThrow();
    expect(previousReceipt.requestedResources).toEqual(['./selected.glb']);
    expect(() => stream.recordSelectedAssetRequest('skyline-terminal', './selected.glb')).toThrow(/no active matching/);
  });

  it('leaves the exact prior gameplay transaction active when module loading fails', async () => {
    const scene = new THREE.Scene();
    const staging = new THREE.Group();
    const previous = new THREE.Group();
    const candidate = new THREE.Group();
    candidate.visible = false;
    staging.add(candidate);
    const registry: ArenaVisualRegistry = {
      ...fakeRegistry(),
      'skyline-terminal': async () => { throw new Error('module unavailable'); },
    };
    const stream = new ArenaVisualStreamController(scene, registry);
    const previousReceipt = await stream.adoptGameplayRoot('atomic-acres', previous);

    await expect(stream.adoptGameplayRoot('skyline-terminal', candidate)).rejects.toThrow('module unavailable');

    expect(scene.children).toEqual([previous]);
    expect(previous.visible).toBe(true);
    expect(previous.userData.arenaVisualDefinitionId).toBe('atomic-acres');
    expect(staging.children).toEqual([candidate]);
    expect(candidate.visible).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(candidate.userData, 'authoritativeArenaId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(candidate.userData, 'arenaVisualDefinitionId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(candidate.userData, 'arenaVisualGeneration')).toBe(false);
    expect(() => stream.recordSelectedAssetRequest('atomic-acres', './selected.glb')).not.toThrow();
    expect(previousReceipt.requestedResources).toEqual(['./selected.glb']);
  });

  it('does not let an aborted stale adoption roll back its committed successor', async () => {
    const scene = new THREE.Scene();
    const staging = new THREE.Group();
    const previous = new THREE.Group();
    const staleCandidate = new THREE.Group();
    const successor = new THREE.Group();
    staleCandidate.visible = false;
    staging.add(staleCandidate);
    let resolveStaleModule!: (module: { definition: ArenaVisualDefinition }) => void;
    const staleModule = new Promise<{ definition: ArenaVisualDefinition }>((resolve) => {
      resolveStaleModule = resolve;
    });
    const registry: ArenaVisualRegistry = {
      ...fakeRegistry(),
      'skyline-terminal': () => staleModule,
    };
    const stream = new ArenaVisualStreamController(scene, registry);
    await stream.adoptGameplayRoot('atomic-acres', previous);
    const staleAdoption = stream.adoptGameplayRoot('skyline-terminal', staleCandidate);
    const staleFailure = expect(staleAdoption).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();

    const successorReceipt = await stream.adoptGameplayRoot('gun-range', successor);
    resolveStaleModule({ definition: fakeDefinition('skyline-terminal') });
    await staleFailure;

    expect(successorReceipt).toMatchObject({ arenaId: 'gun-range', generation: 3 });
    expect(scene.children).toEqual([successor]);
    expect(successor.userData).toMatchObject({
      authoritativeArenaId: 'gun-range',
      arenaVisualDefinitionId: 'gun-range',
      arenaVisualGeneration: 3,
    });
    expect(staging.children).toEqual([staleCandidate]);
    expect(staleCandidate.visible).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(staleCandidate.userData, 'authoritativeArenaId')).toBe(false);
    expect(() => stream.recordSelectedAssetRequest('gun-range', './selected.glb')).not.toThrow();
  });

  it('discards only the exact failed gameplay root and removes its authority metadata', async () => {
    const scene = new THREE.Scene();
    const failed = new THREE.Group();
    const successor = new THREE.Group();
    const stream = new ArenaVisualStreamController(scene, fakeRegistry());
    await stream.adoptGameplayRoot('atomic-acres', failed);

    expect(stream.discardGameplayRoot('skyline-terminal', failed)).toBe(false);
    expect(scene.children).toEqual([failed]);
    expect(stream.discardGameplayRoot('atomic-acres', successor)).toBe(false);
    expect(stream.discardGameplayRoot('atomic-acres', failed)).toBe(true);

    expect(scene.children).toEqual([]);
    expect(failed.visible).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(failed.userData, 'authoritativeArenaId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(failed.userData, 'arenaVisualDefinitionId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(failed.userData, 'arenaVisualGeneration')).toBe(false);
    expect(() => stream.recordSelectedAssetRequest('atomic-acres', './selected.glb')).toThrow(/no active matching/);
  });

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
