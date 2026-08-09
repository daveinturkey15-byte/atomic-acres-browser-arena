import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import { FlamethrowerStreamSystem } from './flamethrower-stream-system';

describe('flamethrower stream presentation', () => {
  it('uses one fixed presentation root and clamps the authored stream to 18 m', () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, false);
    const childCount = scene.children.length;
    expect(system.emit(new THREE.Vector3(), new THREE.Vector3(0, 0, -40), 10)).toBe(true);
    expect(scene.children).toHaveLength(childCount);
    expect(system.telemetry()).toMatchObject({
      capacity: FLAMETHROWER_EFFECT.poolCapacity,
      active: 8,
      emissions: 1,
      particlesSpawned: 8,
      lastDistanceM: 18,
      childCount: 3,
    });
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

  it('restores active ground-fire state and slot selection after GPU prewarm', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const system = new FlamethrowerStreamSystem(scene, false);
    const now = performance.now();
    expect(system.igniteGround(new THREE.Vector3(1, 0, 2), now)).toBe(true);
    const internals = system as unknown as {
      groundActive: Uint8Array;
      groundPositions: Float32Array;
      groundSpawnedAt: Float64Array;
      groundExpiresAt: Float64Array;
      groundCursor: number;
    };
    const before = {
      active: [...internals.groundActive],
      positions: [...internals.groundPositions],
      spawnedAt: [...internals.groundSpawnedAt],
      expiresAt: [...internals.groundExpiresAt],
      cursor: internals.groundCursor,
    };
    const compileAndRender = vi.fn(async () => undefined);

    await system.prewarm({ compileAndRender } as never, camera, 7);

    expect(compileAndRender).toHaveBeenCalledTimes(1);
    expect([...internals.groundActive]).toEqual(before.active);
    expect([...internals.groundPositions]).toEqual(before.positions);
    expect([...internals.groundSpawnedAt]).toEqual(before.spawnedAt);
    expect([...internals.groundExpiresAt]).toEqual(before.expiresAt);
    expect(internals.groundCursor).toBe(before.cursor);
    expect(system.telemetry()).toMatchObject({ groundFireActive: 1, prewarmGeneration: 7 });
  });
});
