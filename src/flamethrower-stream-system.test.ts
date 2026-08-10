import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import {
  FLAMETHROWER_GROUND_FIRE_DURATION_MS,
  FlamethrowerGroundFirePool,
  FlamethrowerStreamSystem,
  flamethrowerPulseImpactPresentationEnabled,
} from './flamethrower-stream-system';

describe('flamethrower stream presentation', () => {
  it('uses one fixed presentation root and clamps the authored stream to 18 m', () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, false);
    const childCount = scene.children.length;
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -40), 10)).toBe(true);
    expect(scene.children).toHaveLength(childCount);
    expect(system.telemetry()).toMatchObject({
      capacity: FLAMETHROWER_EFFECT.poolCapacity,
      active: 4,
      emissions: 1,
      particlesSpawned: 4,
      particlesPerEmission: 4,
      softwareAdapter: false,
      lastDistanceM: 18,
      childCount: 3,
    });
  });

  it('halves only the software-adapter presentation budget and leaves authority pools unchanged', () => {
    const system = new FlamethrowerStreamSystem(new THREE.Scene(), true, true);
    const before = system.telemetry();
    expect(system.emit(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -8), 100)).toBe(true);
    const after = system.telemetry();
    expect(after).toMatchObject({
      active: 2,
      particlesSpawned: 2,
      particlesPerEmission: 2,
      softwareAdapter: true,
      groundFireActive: 0,
    });
    expect(after.particleMatrixWrites - before.particleMatrixWrites).toBe(2);
    expect(system.igniteGround(new THREE.Vector3(1, 0, 2), 100)).toBe(true);
    expect(system.telemetry().groundFireActive).toBe(1);
    expect(flamethrowerPulseImpactPresentationEnabled(true)).toBe(false);
    expect(flamethrowerPulseImpactPresentationEnabled(false)).toBe(true);
  });

  it('bounds active particles and expires them without allocating scene children', () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, true);
    const childCount = scene.children.length;
    for (let index = 0; index < 30; index += 1) {
      system.emit(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -12), index);
    }
    expect(system.telemetry().active).toBeLessThanOrEqual(FLAMETHROWER_EFFECT.maximumActiveParticles);
    expect(system.telemetry().maximumActive).toBeLessThanOrEqual(FLAMETHROWER_EFFECT.maximumActiveParticles);
    expect(system.telemetry().poolExhaustions).toBeGreaterThan(0);
    expect(scene.children).toHaveLength(childCount);
    for (let step = 0; step < 8; step += 1) system.update(0.1);
    expect(system.telemetry().active).toBe(0);
    expect(scene.children).toHaveLength(childCount);
  });

  it('fails closed on invalid/degenerate emissions and clears active presentation', () => {
    const system = new FlamethrowerStreamSystem(new THREE.Scene(), false);
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -0.1), 0)).toBe(false);
    expect(system.emit(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(0, 0, -2), 0)).toBe(false);
    expect(system.telemetry().active).toBe(0);
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -4), 1)).toBe(true);
    system.clear();
    expect(system.telemetry().active).toBe(0);
  });

  it('keeps bounded ground fire visible for five seconds', () => {
    const system = new FlamethrowerStreamSystem(new THREE.Scene(), false);
    expect(system.igniteGround(new THREE.Vector3(1, 0, 2), 100)).toBe(true);
    expect(system.telemetry().groundFireActive).toBe(1);
    system.update(0.1, 5_099);
    expect(system.telemetry().groundFireActive).toBe(1);
    system.update(0.1, 5_100);
    expect(system.telemetry().groundFireActive).toBe(0);
  });

  it('writes only live particle slots and spatially merges repeated ground presentation', () => {
    const system = new FlamethrowerStreamSystem(new THREE.Scene(), false);
    const before = system.telemetry();
    expect(system.emit(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -8), 100)).toBe(true);
    const afterEmit = system.telemetry();
    expect(afterEmit.particleMatrixWrites - before.particleMatrixWrites).toBe(4);
    system.update(0.016, 116);
    const afterUpdate = system.telemetry();
    expect(afterUpdate.particleMatrixWrites - afterEmit.particleMatrixWrites).toBe(4);

    expect(system.igniteGround(new THREE.Vector3(1, 0, 2), 200)).toBe(true);
    expect(system.igniteGround(new THREE.Vector3(1.3, 0, 2.2), 300)).toBe(true);
    expect(system.telemetry()).toMatchObject({ groundFireActive: 1, groundFireMerges: 1 });
  });

  it('stages and restores the complete first-shot stream, ground patch and light', async () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, false);
    const light = system.root.getObjectByName('flamethrower-bounded-stream-light') as THREE.PointLight;
    const stream = system.root.getObjectByName('flamethrower-stream-instanced-flame') as THREE.InstancedMesh;
    const ground = system.root.getObjectByName('flamethrower-ground-fire-pool') as THREE.InstancedMesh;
    expect(light.visible).toBe(false);
    expect(light.intensity).toBe(14);
    const before = system.telemetry();
    const streamMatrixVersionBefore = stream.instanceMatrix.version;
    const groundMatrixVersionBefore = ground.instanceMatrix.version;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.lookAt(1, 2, -3);
    camera.updateWorldMatrix(true, false);
    const staged = vi.fn(async () => {
      expect(light.visible).toBe(true);
      expect(light.intensity).toBe(14);
      expect(system.telemetry()).toMatchObject({ active: 4, groundFireActive: 1, emissions: 1 });
      expect(stream.instanceMatrix.version).toBeGreaterThan(streamMatrixVersionBefore);
      expect(ground.instanceMatrix.version).toBeGreaterThan(groundMatrixVersionBefore);
    });
    await system.withStagedFirstShotPresentation(camera, staged);
    expect(staged).toHaveBeenCalledTimes(1);
    expect(light.visible).toBe(false);
    expect(light.intensity).toBe(14);
    expect(system.telemetry()).toEqual(before);
  });

  it('pools authority patches without changing independent pulse timing and fails closed at capacity', () => {
    const pool = new FlamethrowerGroundFirePool(2);
    const base = {
      ownerId: 'player-a', ownerTeam: 0 as const, actionNonce: 1, now: 100,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS, pulseIntervalMs: 500,
    };
    const firstPoint = new THREE.Vector3(1, 0, 2);
    expect(pool.ignite({ ...base, point: firstPoint })).toBe('created');
    firstPoint.set(100, 0, 100);
    expect(pool.ignite({
      ...base, point: new THREE.Vector3(1.4, 0, 2.1), actionNonce: 2, now: 200,
    })).toBe('created');
    expect(pool.activeCount()).toBe(2);
    expect(pool.ignite({
      ...base, ownerId: 'player-b', ownerTeam: 1, point: new THREE.Vector3(8, 0, 8), actionNonce: 3,
    })).toBe('exhausted');

    const pulsed: string[] = [];
    pool.update(700, 500, (fire) => pulsed.push(`${fire.ownerId}:${fire.point.x}`));
    expect(pulsed).toEqual(['player-a:1.4', 'player-a:1']);
    pool.update(5_200, 500, () => undefined);
    expect(pool.activeCount()).toBe(0);
  });
});
