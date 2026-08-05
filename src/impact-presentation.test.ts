import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ImpactPresentation, MAX_IMPACT_MARKS, MAX_IMPACT_PARTICLES } from './impact-presentation';

function attributeValues(attribute: THREE.BufferAttribute | THREE.InstancedBufferAttribute): number[] {
  return Array.from(attribute.array);
}

function reviewCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.position.set(2, 3, 5);
  camera.lookAt(0, 1.5, -5);
  camera.updateProjectionMatrix();
  camera.updateWorldMatrix(true, false);
  return camera;
}

describe('pooled impact presentation', () => {
  it('bounds debris, retains marks for the round, and resets them explicitly', () => {
    const scene = new THREE.Scene();
    const presentation = new ImpactPresentation(scene);
    for (let index = 0; index < MAX_IMPACT_MARKS + 8; index += 1) {
      presentation.impact(new THREE.Vector3(index * 0.01, 1, 0), new THREE.Vector3(0, 0, 1), index % 2 ? 'metal' : 'concrete');
    }
    expect(presentation.activeParticles()).toBeLessThanOrEqual(72);
    expect(presentation.activeMarks()).toBe(MAX_IMPACT_MARKS);
    expect(scene.getObjectByName('pooled-surface-impact-marks')).toBe(presentation.marks);
    expect(presentation.root.parent).toBe(scene);
    expect(presentation.points.parent).toBe(presentation.root);
    expect(presentation.marks.parent).toBe(presentation.root);
    expect(presentation.marks.instanceColor).not.toBeNull();
    expect((presentation.points.material as THREE.PointsMaterial).map?.name).toBe('pass62-procedural-impact-particle');
    const particlePositions = presentation.points.geometry.getAttribute('position');
    const particleUvs = presentation.points.geometry.getAttribute('uv');
    expect(particleUvs).toBeDefined();
    expect(particleUvs.itemSize).toBe(2);
    expect(particleUvs.count).toBe(particlePositions.count);
    expect(Array.from(particleUvs.array)).toEqual(
      Array.from({ length: MAX_IMPACT_PARTICLES * 2 }, () => 0.5),
    );
    expect((presentation.marks.material as THREE.MeshBasicMaterial).map?.name).toBe('pass62-procedural-impact-mark');
    presentation.update(15);
    expect(presentation.activeParticles()).toBe(0);
    expect(presentation.activeMarks()).toBe(MAX_IMPACT_MARKS);
    presentation.resetForRound();
    expect(presentation.activeMarks()).toBe(0);
    expect(presentation.marks.visible).toBe(false);
  });

  it('reduces particle density and decal capacity as a separate adaptive effect', () => {
    const presentation = new ImpactPresentation(new THREE.Scene());
    presentation.setBudget(0.5, 0.5);
    for (let index = 0; index < 40; index += 1) {
      presentation.impact(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 'metal');
    }
    expect(presentation.activeMarks()).toBeLessThanOrEqual(MAX_IMPACT_MARKS / 2);
    expect(presentation.activeParticles()).toBeLessThanOrEqual(72);
  });

  it('submits every live-shaped particle and mark attribute in-camera, then restores exact gameplay state', async () => {
    const scene = new THREE.Scene();
    const camera = reviewCamera();
    const presentation = new ImpactPresentation(scene);
    presentation.impact(new THREE.Vector3(0.4, 1.2, -1), new THREE.Vector3(0, 0, 1), 'container');

    const positionAttribute = presentation.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttribute = presentation.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const instanceColor = presentation.marks.instanceColor!;
    const before = {
      positions: attributeValues(positionAttribute),
      colors: attributeValues(colorAttribute),
      matrices: attributeValues(presentation.marks.instanceMatrix),
      markColors: attributeValues(instanceColor),
      activeParticles: presentation.activeParticles(),
      activeMarks: presentation.activeMarks(),
      rootVisible: presentation.root.visible,
      pointsVisible: presentation.points.visible,
      marksVisible: presentation.marks.visible,
    };

    const compileAndRender = vi.fn(async (root: THREE.Object3D, stagedCamera: THREE.Camera, stagedScene: THREE.Scene) => {
      expect(root).toBe(presentation.root);
      expect(stagedCamera).toBe(camera);
      expect(stagedScene).toBe(scene);
      expect(root.visible).toBe(true);
      expect(presentation.points.visible).toBe(true);
      expect(presentation.marks.visible).toBe(true);
      expect(presentation.points.frustumCulled).toBe(false);
      expect(presentation.marks.frustumCulled).toBe(false);

      presentation.points.updateWorldMatrix(true, false);
      let stagedParticles = 0;
      for (let slot = 0; slot < MAX_IMPACT_PARTICLES; slot += 1) {
        const local = new THREE.Vector3(
          positionAttribute.getX(slot),
          positionAttribute.getY(slot),
          positionAttribute.getZ(slot),
        );
        const ndc = local.applyMatrix4(presentation.points.matrixWorld).project(camera);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
        expect(ndc.z).toBeGreaterThanOrEqual(-1);
        expect(ndc.z).toBeLessThanOrEqual(1);
        const colorEnergy = colorAttribute.getX(slot) + colorAttribute.getY(slot) + colorAttribute.getZ(slot);
        expect(colorEnergy).toBeGreaterThan(0);
        stagedParticles += 1;
      }
      expect(stagedParticles).toBe(MAX_IMPACT_PARTICLES);

      presentation.marks.updateWorldMatrix(true, false);
      const instance = new THREE.Matrix4();
      const world = new THREE.Matrix4();
      const worldPosition = new THREE.Vector3();
      for (let slot = 0; slot < MAX_IMPACT_MARKS; slot += 1) {
        presentation.marks.getMatrixAt(slot, instance);
        expect(Math.abs(instance.determinant())).toBeGreaterThan(0);
        world.multiplyMatrices(presentation.marks.matrixWorld, instance);
        worldPosition.setFromMatrixPosition(world);
        const ndc = worldPosition.clone().project(camera);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
        expect(ndc.z).toBeGreaterThanOrEqual(-1);
        expect(ndc.z).toBeLessThanOrEqual(1);
        expect(instanceColor.getX(slot) + instanceColor.getY(slot) + instanceColor.getZ(slot)).toBeGreaterThan(0);
      }
    });

    await presentation.prewarm({ compileAndRender }, camera, 7);
    expect(compileAndRender).toHaveBeenCalledTimes(1);
    expect(attributeValues(positionAttribute)).toEqual(before.positions);
    expect(attributeValues(colorAttribute)).toEqual(before.colors);
    expect(attributeValues(presentation.marks.instanceMatrix)).toEqual(before.matrices);
    expect(attributeValues(instanceColor)).toEqual(before.markColors);
    expect(presentation.activeParticles()).toBe(before.activeParticles);
    expect(presentation.activeMarks()).toBe(before.activeMarks);
    expect(presentation.root.visible).toBe(before.rootVisible);
    expect(presentation.points.visible).toBe(before.pointsVisible);
    expect(presentation.marks.visible).toBe(before.marksVisible);

    await presentation.prewarm({ compileAndRender }, camera, 7);
    expect(compileAndRender).toHaveBeenCalledTimes(1);
  });

  it('serializes distinct scene generations and retries independently after a failed generation', async () => {
    const presentation = new ImpactPresentation(new THREE.Scene());
    const camera = reviewCamera();
    const resolvers: Array<() => void> = [];
    let activeCompiles = 0;
    let maximumConcurrentCompiles = 0;
    const compileAndRender = vi.fn(() => new Promise<void>((resolve) => {
      activeCompiles += 1;
      maximumConcurrentCompiles = Math.max(maximumConcurrentCompiles, activeCompiles);
      resolvers.push(() => {
        activeCompiles -= 1;
        resolve();
      });
    }));

    const generationOne = presentation.prewarm({ compileAndRender }, camera, 1);
    const generationTwo = presentation.prewarm({ compileAndRender }, camera, 2);
    await vi.waitFor(() => expect(compileAndRender).toHaveBeenCalledTimes(1));
    resolvers.shift()!();
    await generationOne;
    await vi.waitFor(() => expect(compileAndRender).toHaveBeenCalledTimes(2));
    resolvers.shift()!();
    await generationTwo;
    expect(maximumConcurrentCompiles).toBe(1);

    await presentation.prewarm({ compileAndRender }, camera, 2);
    expect(compileAndRender).toHaveBeenCalledTimes(2);

    const failedRuntime = { compileAndRender: vi.fn().mockRejectedValueOnce(new Error('cold pipeline failed')) };
    await expect(presentation.prewarm(failedRuntime, camera, 3)).rejects.toThrow('cold pipeline failed');
    const retryRuntime = { compileAndRender: vi.fn().mockResolvedValue(undefined) };
    await expect(presentation.prewarm(retryRuntime, camera, 3)).resolves.toBeUndefined();
    expect(retryRuntime.compileAndRender).toHaveBeenCalledTimes(1);
  });
});
