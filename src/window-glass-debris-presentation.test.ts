import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
  WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M,
  WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
  createFracturedWindowDebrisVisual,
  prewarmFracturedWindowDebrisVisual,
  updateFracturedWindowDebrisVisual,
  windowGlassDebrisSettleMode,
} from './window-glass-debris-presentation';

describe('persistent window glass debris presentation', () => {
  it('rejects a physics sleep above floor height and settles only at the floor', () => {
    expect(windowGlassDebrisSettleMode(2.4, 0.6, false)).toBe('physics-active');
    expect(windowGlassDebrisSettleMode(2.4, 0.6, true)).toBe('presentation-fall');
    expect(windowGlassDebrisSettleMode(0.6 + WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M, 0.6, true))
      .toBe('settled');
    expect(windowGlassDebrisSettleMode(
      0.6 + WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M + 1e-6,
      0.6,
      true,
    )).toBe('presentation-fall');
    expect(() => windowGlassDebrisSettleMode(Number.NaN, 0.6, true)).toThrow(TypeError);
  });

  it('renders separated triangular shards instead of an intact falling pane', () => {
    const halfExtents = { x: 0.7, y: 0.6, z: 0.03 };
    const root = createFracturedWindowDebrisVisual({
      id: 'window-debris:test-pane',
      halfExtents,
      reducedRenderMode: false,
    });
    const shards = root.getObjectByName('window-debris:test-pane:shard-cluster');
    expect(root.userData).toMatchObject({
      windowGlassDebrisContract: WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
      fragmentCount: WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
      intactPaneMeshCount: 0,
    });
    expect(shards).toBeInstanceOf(THREE.InstancedMesh);
    const instancedShards = shards as THREE.InstancedMesh;
    const geometry = instancedShards.geometry;
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(geometry).not.toBeInstanceOf(THREE.BoxGeometry);
    expect(geometry.getAttribute('position').count).toBe(3);
    expect(instancedShards.count).toBe(WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT);
    expect(geometry.userData).toMatchObject({
      fragmentCount: WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
      intactPane: false,
    });

    let shardArea = 0;
    const shardAreas: number[] = [];
    const sideLengths: number[] = [];
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < instancedShards.count; index += 1) {
      instancedShards.getMatrixAt(index, matrix);
      const a = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
      const b = new THREE.Vector3(1, 0, 0).applyMatrix4(matrix);
      const c = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      shardAreas.push(area);
      shardArea += area;
      sideLengths.push(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    }
    const intactPaneArea = halfExtents.x * halfExtents.y * 4;
    expect(shardArea).toBeGreaterThan(intactPaneArea * 0.2);
    expect(shardArea).toBeLessThan(intactPaneArea * 0.6);
    expect(Math.min(...shardAreas)).toBeGreaterThan(1e-4);
    expect(Math.max(...sideLengths) - Math.min(...sideLengths)).toBeGreaterThan(0.25);
    expect(root.userData).toMatchObject({ independentShardTransforms: true, radialFracture: true });

    const before = new THREE.Matrix4();
    const after = new THREE.Matrix4();
    instancedShards.getMatrixAt(0, before);
    expect(updateFracturedWindowDebrisVisual(root, 0.4)).toBe(true);
    instancedShards.getMatrixAt(0, after);
    expect(after.equals(before)).toBe(false);
    const second = new THREE.Matrix4();
    instancedShards.getMatrixAt(1, second);
    expect(second.equals(after)).toBe(false);
  });

  it('reuses analysed shard buffers and submits them during deployment prewarm', async () => {
    const first = createFracturedWindowDebrisVisual({
      id: 'window-debris:first', halfExtents: { x: 0.7, y: 0.6, z: 0.03 }, reducedRenderMode: false,
    });
    const second = createFracturedWindowDebrisVisual({
      id: 'window-debris:second', halfExtents: { x: 0.5, y: 0.4, z: 0.02 }, reducedRenderMode: false,
    });
    expect((first.getObjectByName('window-debris:first:shard-cluster') as THREE.InstancedMesh).geometry)
      .toBe((second.getObjectByName('window-debris:second:shard-cluster') as THREE.InstancedMesh).geometry);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(camera);
    let submittedRoot: THREE.Object3D | null = null;
    await prewarmFracturedWindowDebrisVisual({
      compileAndRender: async (root, submittedCamera, submittedScene) => {
        expect(root.parent).toBe(scene);
        expect(submittedCamera).toBe(camera);
        expect(submittedScene).toBe(scene);
        submittedRoot = root;
      },
    }, camera, scene, false);
    expect(submittedRoot).not.toBeNull();
    expect(submittedRoot!.parent).toBeNull();
  });

  it('retains the exact prewarmed instance and never allocates shard geometry on the breach frame', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const prewarmStart = source.indexOf('async function withStagedWindowGlassDebrisPool');
    const start = source.indexOf('function spawnPersistentWindowDebris');
    const end = source.indexOf('function clearPersistentWindowDebris', start);
    expect(prewarmStart).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const prewarm = source.slice(prewarmStart, start);
    const block = source.slice(start, end);
    expect(prewarm).toContain('createFracturedWindowDebrisVisual({');
    expect(prewarm).toContain('await submit(stage);');
    expect(prewarm).toContain('(stage) => renderRuntime.compileAndRender(stage, camera, scene)');
    expect(prewarm).toContain('parent: pooled.root.parent,');
    expect(prewarm).toContain('visible: pooled.root.visible,');
    expect(prewarm).toContain('position: pooled.root.position.clone(),');
    expect(prewarm).toContain('quaternion: pooled.root.quaternion.clone(),');
    expect(prewarm).toContain('scale: pooled.root.scale.clone(),');
    expect(prewarm).toContain('instanceMatrix: new Float32Array(shards.instanceMatrix.array),');
    expect(prewarm).toContain('finally {');
    expect(prewarm).toContain('state.parent?.add(root);');
    expect(prewarm).toContain('root.visible = state.visible;');
    expect(prewarm).toContain('root.position.copy(state.position);');
    expect(prewarm).toContain('root.quaternion.copy(state.quaternion);');
    expect(prewarm).toContain('root.scale.copy(state.scale);');
    expect(prewarm).toContain('shards.instanceMatrix.array.set(state.instanceMatrix);');
    expect(prewarm).toContain('characterPhysics.prewarmMajorDebrisBodies(arena.breakableWindows.map((window) => {');
    expect(prewarm).toContain('id: persistentWindowDebrisId(window.id), halfExtents: pooled.halfExtents');
    expect(block).toContain('pooledWindowDebris.get(windowDebrisPoolKey(arena.id, window.id))');
    expect(block).not.toContain('createFracturedWindowDebrisVisual({');
    expect(block).not.toContain('new THREE.BoxGeometry');
  });

  it('prewarms zero-light world glass and impact programs before staging the flare PointLight', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const start = source.indexOf('async function prewarmArenaBoundGameplayPresentations');
    const end = source.indexOf('function bootstrapMenuPreview', start);
    const prewarm = source.slice(start, end);
    const disableViewmodelFill = prewarm.indexOf('camera.layers.disable(VIEWMODEL_RENDER_LAYER);');
    const tracer = prewarm.indexOf('await tracerPool.prewarm(renderRuntime, camera, sceneGeneration);', disableViewmodelFill);
    const impact = prewarm.indexOf('await impactPresentation.prewarm(renderRuntime, camera, sceneGeneration);', disableViewmodelFill);
    const glass = prewarm.indexOf('prewarmWindowGlassDebrisPool(sceneGeneration),', disableViewmodelFill);
    const flarePointLight = prewarm.lastIndexOf('await flareProjectileSystem.prewarm(renderRuntime, camera, sceneGeneration);');
    const restoreViewmodelFill = prewarm.indexOf('camera.layers.mask = priorWorldPrewarmCameraLayerMask;');
    const flareFirstShot = prewarm.indexOf("setBootstrapStage('prewarming-flare-first-shot');");

    expect(disableViewmodelFill).toBeGreaterThanOrEqual(0);
    for (const zeroLightPresentation of [tracer, impact, glass]) {
      expect(zeroLightPresentation).toBeGreaterThan(disableViewmodelFill);
      expect(zeroLightPresentation).toBeLessThan(flarePointLight);
    }
    expect(flarePointLight).toBeGreaterThan(glass);
    expect(restoreViewmodelFill).toBeGreaterThan(flarePointLight);
    expect(flareFirstShot).toBeGreaterThan(restoreViewmodelFill);
    const preFlareWorldWave = prewarm.slice(disableViewmodelFill, flarePointLight);
    expect(preFlareWorldWave).not.toContain('flareProjectileSystem.prewarm(');
  });

  it('prewarms the exact glass Web Audio graph before deployment and uses it on the breach path', () => {
    const runtime = readFileSync('src/legacy-main.ts', 'utf8');
    const audio = readFileSync('src/audio.ts', 'utf8');
    const matchStart = runtime.slice(runtime.indexOf('async function startGame('), runtime.indexOf('\nfunction randomNonce()'));
    const breach = runtime.slice(runtime.indexOf('function breakHouseWindow('), runtime.indexOf('\nfunction breakWindowsAlongBallisticTrace('));
    expect(matchStart).toContain("document.documentElement.dataset.glassImpactAudioPrewarm = audio.prepareGlassImpact() ? 'ready' : 'unavailable';");
    expect(matchStart.indexOf('audio.prepareGlassImpact()')).toBeLessThan(matchStart.indexOf('prepareDeploymentTransition()'));
    // PASS 95 (HF-509): the breach impact carries its point so it is positioned.
    expect(breach).toContain("audio.impact('glass', point.distanceTo(camera.position), point);");
    const prewarm = audio.slice(audio.indexOf('prepareGlassImpact(): boolean {'), audio.indexOf('\n  setLowHealthFeedback('));
    expect(prewarm).toContain("filter.type = 'bandpass';");
    expect(prewarm).toContain('filter.frequency.value = 5_200;');
    expect(prewarm).toContain("tone.type = 'triangle';");
    expect(prewarm).toContain('tone.frequency.value = 1_460;');
    expect(prewarm).toContain('noiseGain.gain.value = 0;');
    expect(prewarm).toContain('toneGain.gain.value = 0;');
  });
});
