import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import {
  FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE,
  FLAMETHROWER_GROUND_FIRE_DURATION_MS,
  FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
  FlamethrowerGroundFirePool,
  FlamethrowerStreamSystem,
  flamethrowerPulseImpactPresentationEnabled,
  type FlamethrowerGroundFire,
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

  it('replays a retained ground-fire visual for the exact host-authored remaining lifetime', () => {
    const system = new FlamethrowerStreamSystem(new THREE.Scene(), false);
    expect(system.igniteGround(new THREE.Vector3(1, 0, 2), 2_500, 3_500)).toBe(true);
    system.update(0.1, 5_999);
    expect(system.telemetry().groundFireActive).toBe(1);
    system.update(0.1, 6_000);
    expect(system.telemetry().groundFireActive).toBe(0);
    expect(system.igniteGround(new THREE.Vector3(), 6_001, 5_001)).toBe(false);
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

  it('stages and restores the complete first-shot stream, ground patch and constant light on failure', async () => {
    const scene = new THREE.Scene();
    const system = new FlamethrowerStreamSystem(scene, false);
    const light = system.root.getObjectByName('flamethrower-bounded-stream-light') as THREE.PointLight;
    const stream = system.root.getObjectByName('flamethrower-stream-instanced-flame') as THREE.InstancedMesh;
    const ground = system.root.getObjectByName('flamethrower-ground-fire-pool') as THREE.InstancedMesh;
    expect(light.visible).toBe(true);
    expect(light.intensity).toBe(0);
    const before = system.telemetry();
    const idleStreamMatrixVersion = stream.instanceMatrix.version;
    const idleGroundMatrixVersion = ground.instanceMatrix.version;
    system.update(0.016, 16);
    expect(system.telemetry()).toMatchObject({ boundedLightIntensity: 0, boundedLightWrites: 0 });
    expect(stream.instanceMatrix.version).toBe(idleStreamMatrixVersion);
    expect(ground.instanceMatrix.version).toBe(idleGroundMatrixVersion);
    expect(light).not.toBeInstanceOf(THREE.Mesh);
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
      throw new Error('intentional flame submit failure');
    });
    await expect(system.withStagedFirstShotPresentation(camera, staged)).rejects.toThrow('intentional flame submit failure');
    expect(staged).toHaveBeenCalledTimes(1);
    expect(light.visible).toBe(true);
    expect(light.intensity).toBe(0);
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

  it('applies exactly ten ten-damage pulses over five seconds without retroactive catch-up', () => {
    const pool = new FlamethrowerGroundFirePool(1);
    expect(pool.ignite({
      ownerId: 'player-a', ownerTeam: 0, point: new THREE.Vector3(1, 0, 2), actionNonce: 9, now: 100,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
    })).toBe('created');
    let pulses = 0;
    let damage = 0;
    const actionNonces: number[] = [];
    const applyPulse = (fire: FlamethrowerGroundFire) => {
      pulses += 1;
      damage += FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE;
      actionNonces.push(fire.actionNonce);
    };
    for (let now = 100; now <= 4_600; now += FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS) {
      pool.update(now, FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS, applyPulse);
    }
    expect({ pulses, damage, active: pool.activeCount() }).toEqual({ pulses: 10, damage: 100, active: 1 });
    expect(actionNonces).toEqual(Array(10).fill(9));
    pool.update(5_100, FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS, applyPulse);
    expect({ pulses, damage, active: pool.activeCount() }).toEqual({ pulses: 10, damage: 100, active: 0 });

    expect(pool.ignite({
      ownerId: 'player-a', ownerTeam: 0, point: new THREE.Vector3(), actionNonce: 10, now: 6_000,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
    })).toBe('created');
    pool.update(6_000, FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS, applyPulse);
    pool.update(8_400, FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS, applyPulse);
    expect(pulses).toBe(12);
  });

  it('retains deterministic Carpet Bomber identity and pulse ordinals without changing cadence', () => {
    const pool = new FlamethrowerGroundFirePool(1);
    expect(pool.ignite({
      ownerId: 'guest-owner', ownerTeam: 1, point: new THREE.Vector3(2, 0, 3), actionNonce: 17, now: 1_000,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
      damageSource: 'carpet-bomber', activationId: 'ks-activation-9-3', impactOrdinal: 7,
    })).toBe('created');
    const receipts: Array<Readonly<{
      ownerId: string;
      activationId: string | null;
      impactOrdinal: number;
      pulseIndex: number;
      pulseAtMs: number;
    }>> = [];
    for (let now = 1_000; now <= 5_500; now += 500) {
      pool.update(now, FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS, (fire) => receipts.push({
        ownerId: fire.ownerId,
        activationId: fire.activationId,
        impactOrdinal: fire.impactOrdinal,
        pulseIndex: fire.pulseIndex,
        pulseAtMs: fire.pulseAtMs,
      }));
    }
    expect(receipts).toHaveLength(10);
    expect(receipts.map(({ pulseIndex }) => pulseIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(receipts[0]).toEqual({
      ownerId: 'guest-owner', activationId: 'ks-activation-9-3', impactOrdinal: 7,
      pulseIndex: 0, pulseAtMs: 1_000,
    });
    expect(receipts.at(-1)?.pulseAtMs).toBe(5_500);
  });
});
