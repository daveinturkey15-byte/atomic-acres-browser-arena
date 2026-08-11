import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FLARE_PRESENTATION_SCHEMA_VERSION, type FlarePresentationStateMessage } from './flare-presentation-protocol';
import { FLARE_PROJECTILE_EFFECT } from './special-weapon-effects';
import { FlareProjectileSystem, flareSegmentSphereFraction, type FlareProjectileCallbacks } from './flare-projectile-system';

function callbacks(overrides: Partial<FlareProjectileCallbacks> = {}): FlareProjectileCallbacks {
  return {
    worldCollisionFraction: () => null,
    withinBounds: () => true,
    hostileTargets: () => [],
    burnLineOfSight: () => true,
    onDirectHit: () => undefined,
    onImpact: () => undefined,
    onBurnPulse: () => undefined,
    onExpire: () => undefined,
    ...overrides,
  };
}

describe('flare projectile system', () => {
  it('resolves bounded segment/sphere intersections', () => {
    expect(flareSegmentSphereFraction(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(5, 0, 0),
      1,
    )).toBeCloseTo(0.4, 8);
    expect(flareSegmentSphereFraction(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(5, 4, 0),
      1,
    )).toBeNull();
  });

  it('keeps WebGL compatibility flares emissive without changing the live point-light shader topology', async () => {
    const scene = new THREE.Scene();
    const system = new FlareProjectileSystem(scene, false, false);
    const lights: THREE.PointLight[] = [];
    scene.traverse((node) => {
      if (node instanceof THREE.PointLight && node.name === 'signal-flare-bounded-light') lights.push(node);
    });
    expect(lights).toHaveLength(1);
    expect(lights.every((light) => !light.visible)).toBe(true);
    expect(system.spawn({
      ownerId: 'player-webgl', ownerTeam: 0, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: true, actionNonce: 1, now: 0,
    })).toBe(true);
    expect(lights.every((light) => !light.visible)).toBe(true);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 3, 4);
    camera.lookAt(2, 3, 0);
    camera.updateWorldMatrix(true, false);
    const staged = vi.fn(async () => {
      const root = system.root.getObjectByName('signal-flare-1') as THREE.Group;
      expect(root.visible).toBe(true);
      expect(root.getObjectByName('signal-flare-core')?.visible).toBe(true);
      expect(root.getObjectByName('signal-flare-halo')?.visible).toBe(true);
      expect(root.position.distanceTo(new THREE.Vector3(2, 3, 0))).toBeLessThan(1e-6);
      expect(lights.every((light) => !light.visible)).toBe(true);
    });
    await system.withStagedFirstShotPresentation(camera, staged);
    expect(staged).toHaveBeenCalledTimes(1);
    expect(lights.every((light) => !light.visible)).toBe(true);
    // The entity was already live before staging; restore that exact state.
    expect(system.root.getObjectByName('signal-flare-1')?.visible).toBe(true);
  });

  it('keeps one bounded WebGPU light in the scene graph at zero idle intensity without idle mutation', () => {
    const scene = new THREE.Scene();
    const system = new FlareProjectileSystem(scene, false, true);
    const lights: THREE.PointLight[] = [];
    scene.traverse((node) => {
      if (node instanceof THREE.PointLight && node.name === 'signal-flare-bounded-light') lights.push(node);
    });
    expect(lights).toHaveLength(1);
    expect(system.telemetry()).toMatchObject({
      active: 0,
      visibleEffects: 0,
      boundedLightCount: 1,
      boundedLightVisible: true,
      boundedLightIntensity: 0,
      boundedLightWrites: 0,
    });
    system.update(0.016, 16, callbacks());
    expect(system.telemetry()).toMatchObject({ boundedLightIntensity: 0, boundedLightWrites: 0 });
    expect(system.spawn({
      ownerId: 'player-light', ownerTeam: 0, origin: new THREE.Vector3(1, 2, 3),
      direction: new THREE.Vector3(1, 0, 0), authority: true, actionNonce: 1, now: 20,
    })).toBe(true);
    expect(system.telemetry()).toMatchObject({ boundedLightVisible: true, boundedLightIntensity: 18 });
    system.clear();
    expect(system.telemetry()).toMatchObject({
      active: 0, visibleEffects: 0, boundedLightVisible: true, boundedLightIntensity: 0,
    });
    expect(lights).toHaveLength(1);
  });

  it('restores every staged flare burn visual and shared-light value when submission throws', async () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), false, true);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(3, 4, 5);
    camera.lookAt(3, 4, 0);
    camera.updateWorldMatrix(true, false);
    const root = system.root.getObjectByName('signal-flare-1') as THREE.Group;
    const halo = root.getObjectByName('signal-flare-halo') as THREE.Mesh;
    root.position.set(7, 8, 9);
    root.quaternion.setFromEuler(new THREE.Euler(0.2, 0.3, 0.4));
    root.scale.set(1.1, 1.2, 1.3);
    halo.scale.set(0.7, 0.8, 0.9);
    const haloMaterial = halo.material as THREE.MeshBasicMaterial;
    haloMaterial.opacity = 0.19;
    const before = {
      visible: root.visible,
      position: root.position.toArray(),
      quaternion: root.quaternion.toArray(),
      scale: root.scale.toArray(),
      haloScale: halo.scale.toArray(),
      haloOpacity: haloMaterial.opacity,
      telemetry: system.telemetry(),
    };
    await expect(system.withStagedImpactBurnPresentation(camera, async () => {
      expect(root.visible).toBe(true);
      expect(halo.scale.x).toBeCloseTo(1.8);
      expect(haloMaterial.opacity).toBeCloseTo(0.52);
      expect(system.telemetry()).toMatchObject({ boundedLightVisible: true, boundedLightIntensity: 18 });
      throw new Error('intentional burn submit failure');
    })).rejects.toThrow('intentional burn submit failure');
    expect({
      visible: root.visible,
      position: root.position.toArray(),
      quaternion: root.quaternion.toArray(),
      scale: root.scale.toArray(),
      haloScale: halo.scale.toArray(),
      haloOpacity: haloMaterial.opacity,
      telemetry: system.telemetry(),
    }).toEqual(before);
  });

  it('damages one target before the later world impact, then burns for exactly 10 DPS over five seconds', () => {
    const scene = new THREE.Scene();
    const system = new FlareProjectileSystem(scene, false);
    const target = { id: 'bot-1', lifeId: 1, kind: 'bot' as const, position: new THREE.Vector3(1.5, 0, 0), radiusM: 0.5 };
    const directHit = vi.fn();
    const impact = vi.fn();
    const pulse = vi.fn();
    const order: string[] = [];
    expect(system.spawn({
      ownerId: 'player-a', ownerTeam: 0, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: true, actionNonce: 77, now: 0,
    })).toBe(true);
    system.update(0.05, 50, callbacks({
      worldCollisionFraction: () => 0.9,
      hostileTargets: () => [target],
      onDirectHit: (event) => { order.push('direct'); directHit(event); },
      onImpact: (event) => { order.push('ground'); impact(event); },
      onBurnPulse: pulse,
    }));
    expect(order).toEqual(['direct', 'ground']);
    expect(directHit).toHaveBeenCalledTimes(1);
    expect(directHit.mock.calls[0][0]).toMatchObject({
      ownerId: 'player-a', target: { id: 'bot-1' }, directDamage: FLARE_PROJECTILE_EFFECT.directDamage,
    });
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact.mock.calls[0][0]).toMatchObject({
      ownerId: 'player-a', target: null, directDamage: 0,
    });
    expect(directHit.mock.calls[0][0].point.x).toBeLessThan(impact.mock.calls[0][0].point.x);

    target.position.copy(impact.mock.calls[0][0].point);
    for (let now = 550; now <= 5_050; now += 500) {
      system.update(0.05, now, callbacks({ hostileTargets: () => [target], onBurnPulse: pulse }));
    }
    expect(pulse).toHaveBeenCalledTimes(10);
    expect(pulse.mock.calls.map(([event]) => event.damage)).toEqual(Array(10).fill(5));
    expect(pulse.mock.calls.reduce((total, [event]) => total + event.damage, 0)).toBe(50);
    expect(pulse.mock.calls[0][0]).not.toHaveProperty('explosiveSource');
    system.update(0.05, 5_550, callbacks({ hostileTargets: () => [target], onBurnPulse: pulse }));
    expect(pulse).toHaveBeenCalledTimes(10);
  });

  it('checkpoints a delivered direct hit so authority migration cannot apply it twice', () => {
    const target = { id: 'bot-1', lifeId: 1, kind: 'bot' as const, position: new THREE.Vector3(1.5, 0, 0), radiusM: 0.5 };
    const source = new FlareProjectileSystem(new THREE.Scene(), true);
    const sourceDirectHit = vi.fn();
    expect(source.spawn({
      ownerId: 'player-a', ownerTeam: 0, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: true, actionNonce: 78, now: 0,
    })).toBe(true);
    source.update(0.05, 50, callbacks({ hostileTargets: () => [target], onDirectHit: sourceDirectHit }));
    expect(sourceDirectHit).toHaveBeenCalledTimes(1);
    const checkpoint = source.checkpointAuthority(50)!;
    expect(checkpoint.effects[0]).toMatchObject({ phase: 'flight', directHitDelivered: true });

    const restored = new FlareProjectileSystem(new THREE.Scene(), true);
    expect(restored.restoreAuthorityCheckpoint(checkpoint, 0, 100)).toMatchObject({ accepted: true, restored: 1 });
    const repeatedDirectHit = vi.fn();
    const groundImpact = vi.fn();
    restored.update(0.05, 150, callbacks({
      worldCollisionFraction: () => 0.5,
      hostileTargets: () => [target],
      onDirectHit: repeatedDirectHit,
      onImpact: groundImpact,
    }));
    expect(repeatedDirectHit).not.toHaveBeenCalled();
    expect(groundImpact).toHaveBeenCalledTimes(1);
  });

  it('keeps predicted peer flares visual-only and rejects duplicate action nonces', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    const impact = vi.fn();
    const pulse = vi.fn();
    const spawn = {
      ownerId: 'player-b', ownerTeam: 1 as const, origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1),
      authority: false, actionNonce: 88, now: 0,
    };
    expect(system.spawn(spawn)).toBe(true);
    expect(system.spawn(spawn)).toBe(false);
    system.update(0.05, 50, callbacks({ worldCollisionFraction: () => 0.5, onImpact: impact, onBurnPulse: pulse }));
    expect(impact).toHaveBeenCalledWith(expect.objectContaining({ authority: false, directDamage: 0 }));
    system.update(0.05, 600, callbacks({ onImpact: impact, onBurnPulse: pulse }));
    expect(pulse).not.toHaveBeenCalled();
  });

  it('fails closed when the fixed pool is exhausted', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    for (let index = 0; index < FLARE_PROJECTILE_EFFECT.poolCapacity; index += 1) {
      expect(system.spawn({
        ownerId: `player-${index}`, ownerTeam: 0, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
        authority: false, actionNonce: index + 1, now: 0,
      })).toBe(true);
    }
    expect(system.spawn({
      ownerId: 'overflow', ownerTeam: 0, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: false, actionNonce: 999, now: 0,
    })).toBe(false);
    expect(system.telemetry()).toMatchObject({
      capacity: FLARE_PROJECTILE_EFFECT.poolCapacity,
      active: FLARE_PROJECTILE_EFFECT.poolCapacity,
      poolExhaustions: 1,
    });
  });

  it('samples hostile targets once per owner/team per update for concurrent flares', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    for (const actionNonce of [1, 2]) {
      expect(system.spawn({
        ownerId: 'shared-owner', ownerTeam: 0, origin: new THREE.Vector3(),
        direction: new THREE.Vector3(1, 0, 0), authority: true, actionNonce, now: 0,
      })).toBe(true);
    }
    const hostileTargets = vi.fn(() => []);
    system.update(0.01, 10, callbacks({ hostileTargets }));
    expect(hostileTargets).toHaveBeenCalledTimes(1);
  });

  it('exposes allocation-free lifecycle counters for the frame loop', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    const initialRevision = system.lifecycleRevisionValue();
    expect(system.hasActiveProjectiles()).toBe(false);
    expect(system.spawn({
      ownerId: 'owner-a', ownerTeam: 0, origin: new THREE.Vector3(),
      direction: new THREE.Vector3(1, 0, 0), authority: true, actionNonce: 10, now: 0,
    })).toBe(true);
    expect(system.hasActiveProjectiles()).toBe(true);
    expect(system.lifecycleRevisionValue()).toBeGreaterThan(initialRevision);
    const flightRevision = system.lifecycleRevisionValue();
    system.update(0.01, 10, callbacks({ worldCollisionFraction: () => 0.5 }));
    expect(system.lifecycleRevisionValue()).toBeGreaterThan(flightRevision);
    expect(system.burnPulseRevisionValue()).toBe(0);
  });

  it('keeps replica inspection aligned with telemetry until the next valid update releases an expired effect', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    expect(system.spawn({
      ownerId: 'owner-expiry', ownerTeam: 0, origin: new THREE.Vector3(),
      direction: new THREE.Vector3(1, 0, 0), authority: true, actionNonce: 12, now: 0,
    })).toBe(true);
    system.update(0.05, 50, callbacks({ worldCollisionFraction: () => 0.5 }));

    const expiresAt = 50 + FLARE_PROJECTILE_EFFECT.burnDurationMs;
    expect(system.telemetry().active).toBe(1);
    expect(system.inspectActiveReplicas(expiresAt)).toEqual([
      expect.objectContaining({ ownerId: 'owner-expiry', phase: 'burn', remainingMs: 0, authority: true }),
    ]);

    system.update(0.016, expiresAt, callbacks());
    expect(system.inspectActiveReplicas(expiresAt)).toEqual([]);
    expect(system.telemetry().active).toBe(0);
  });

  it('does not rebuild target or world snapshots between authority burn pulses', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    const hostileTargets = vi.fn(() => []);
    expect(system.spawn({
      ownerId: 'owner-a', ownerTeam: 0, origin: new THREE.Vector3(),
      direction: new THREE.Vector3(1, 0, 0), authority: true, actionNonce: 11, now: 0,
    })).toBe(true);
    expect(system.requiresWorldSnapshot(10)).toBe(true);
    system.update(0.01, 10, callbacks({ hostileTargets, worldCollisionFraction: () => 0.5 }));
    hostileTargets.mockClear();
    expect(system.requiresWorldSnapshot(20)).toBe(false);
    system.update(0.01, 20, callbacks({ hostileTargets }));
    expect(hostileTargets).not.toHaveBeenCalled();
    expect(system.requiresWorldSnapshot(510)).toBe(true);
  });

  it('exports only authoritative entities in canonical snapshots while exposing read-only authority inspection', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    expect(system.spawn({
      ownerId: 'z-host', ownerTeam: 0, origin: new THREE.Vector3(1, 2, 3), direction: new THREE.Vector3(1, 0, 0),
      authority: true, actionNonce: 8, now: 0,
    })).toBe(true);
    expect(system.spawn({
      ownerId: 'a-guest', ownerTeam: 1, origin: new THREE.Vector3(4, 5, 6), direction: new THREE.Vector3(0, 0, -1),
      authority: false, actionNonce: 7, now: 0,
    })).toBe(true);

    const inspection = system.inspectActiveReplicas(0);
    expect(inspection.map(({ ownerId, authority }) => [ownerId, authority])).toEqual([
      ['a-guest', false], ['z-host', true],
    ]);
    expect(Object.isFrozen(inspection)).toBe(true);
    const first = system.createAuthorityPresentationState({
      by: 'host-1', matchEpoch: 2, weaponGeneration: 3, sampledAtHostTimeMs: 0, nonce: 9,
    })!;
    expect(first.snapshotSeq).toBe(1);
    expect(first.flares).toHaveLength(1);
    expect(first.flares[0]).toMatchObject({ ownerId: 'z-host', actionNonce: 8 });
    expect(first.flares[0]).not.toHaveProperty('authority');
    expect(system.createAuthorityPresentationState({
      by: 'host-1', matchEpoch: 2, weaponGeneration: 3, sampledAtHostTimeMs: 0, nonce: 10,
    })?.snapshotSeq).toBe(2);
  });

  it('reconciles a predicted identity in place as presentation-only, rejects duplicate state, and releases absent replicas', () => {
    const system = new FlareProjectileSystem(new THREE.Scene(), true);
    expect(system.spawn({
      ownerId: 'guest-1', ownerTeam: 1, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: false, actionNonce: 71, now: 4_900,
    })).toBe(true);
    const flight: FlarePresentationStateMessage = Object.freeze({
      type: 'flare-presentation-state', schemaVersion: FLARE_PRESENTATION_SCHEMA_VERSION,
      by: 'host-1', matchEpoch: 2, weaponGeneration: 3, snapshotSeq: 1, sampledAtHostTimeMs: 1_000,
      flares: Object.freeze([Object.freeze({
        ownerId: 'guest-1', ownerTeam: 1, actionNonce: 71, phase: 'flight',
        position: Object.freeze([10, 2, 0] as const), velocity: Object.freeze([52, 0, 0] as const), remainingMs: 5_000,
      })]),
      nonce: 1,
    });
    expect(system.reconcilePresentationState(flight, 1_100, 5_000)).toEqual({
      accepted: true, reason: 'accepted', created: 0, updated: 1, released: 0,
      skippedExpired: 0, skippedAuthority: 0, poolExhaustions: 0,
    });
    const reconciled = system.inspectActiveReplicas(5_000);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
      ownerId: 'guest-1', actionNonce: 71, authority: false, phase: 'flight', remainingMs: 4_900,
    });
    expect(reconciled[0]!.position[0]).toBeCloseTo(15.2, 6);
    expect(system.reconcilePresentationState(flight, 1_100, 5_000)).toMatchObject({
      accepted: false, reason: 'stale', created: 0, updated: 0,
    });

    const burning: FlarePresentationStateMessage = Object.freeze({
      ...flight,
      snapshotSeq: 2,
      sampledAtHostTimeMs: 1_200,
      flares: Object.freeze([Object.freeze({
        ownerId: 'guest-1', ownerTeam: 1, actionNonce: 71, phase: 'burn',
        position: Object.freeze([20, 0, 0] as const), velocity: null, remainingMs: 3_000,
      })]),
      nonce: 2,
    });
    expect(system.reconcilePresentationState(burning, 1_250, 5_100)).toMatchObject({
      accepted: true, created: 0, updated: 1,
    });
    expect(system.inspectActiveReplicas(5_100)[0]).toMatchObject({
      authority: false, phase: 'burn', remainingMs: 2_950,
    });

    const cleared: FlarePresentationStateMessage = Object.freeze({
      ...burning, snapshotSeq: 3, sampledAtHostTimeMs: 1_300, flares: Object.freeze([]), nonce: 3,
    });
    expect(system.reconcilePresentationState(cleared, 1_300, 5_200)).toMatchObject({
      accepted: true, released: 1,
    });
    expect(system.inspectActiveReplicas(5_200)).toEqual([]);

    const spawnCountBeforeRestore = system.telemetry().spawnCount;
    const restored = Object.freeze({
      ...burning, snapshotSeq: 4, sampledAtHostTimeMs: 1_400, nonce: 4,
    });
    expect(system.reconcilePresentationState(restored, 1_400, 5_300)).toMatchObject({
      accepted: true, created: 0, updated: 1,
    });
    expect(system.telemetry().spawnCount).toBe(spawnCountBeforeRestore);
    expect(system.inspectActiveReplicas(5_300)).toHaveLength(1);
  });

  it('restores authority at a negative virtual clock, skips downtime pulses, and prunes expired burns without callbacks', () => {
    const source = new FlareProjectileSystem(new THREE.Scene(), true);
    const pulse = vi.fn();
    expect(source.spawn({
      ownerId: 'guest-1', ownerTeam: 1, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: true, actionNonce: 91, now: 0,
    })).toBe(true);
    source.update(0.05, 50, callbacks({ worldCollisionFraction: () => 0.5 }));
    source.update(0.05, 550, callbacks({ onBurnPulse: pulse }));
    const checkpoint = source.checkpointAuthority(550)!;
    expect(checkpoint.effects[0]).toMatchObject({
      phase: 'burn', remainingMs: 4_500, nextBurnPulseRemainingMs: 500, burnPulseIndex: 1,
    });

    const restored = new FlareProjectileSystem(new THREE.Scene(), true);
    const result = restored.restoreAuthorityCheckpoint(checkpoint, 1_200, -1_000);
    expect(result).toEqual({
      accepted: true, restored: 1, skippedExpired: 0, skippedBurnPulses: 2, poolExhaustions: 0,
    });
    expect(restored.inspectActiveReplicas(-1_000)[0]).toMatchObject({
      ownerId: 'guest-1', authority: true, phase: 'burn', remainingMs: 3_300,
    });
    expect(pulse).not.toHaveBeenCalled();

    const expired = new FlareProjectileSystem(new THREE.Scene(), true);
    expect(expired.restoreAuthorityCheckpoint(checkpoint, 5_000, 0)).toEqual({
      accepted: true, restored: 0, skippedExpired: 1, skippedBurnPulses: 9, poolExhaustions: 0,
    });
    expect(expired.inspectActiveReplicas(0)).toEqual([]);
  });
});
