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

  it('flies, impacts a target once, and emits finite host-owned burn pulses without explosion semantics', () => {
    const scene = new THREE.Scene();
    const system = new FlareProjectileSystem(scene, false);
    const target = { id: 'bot-1', lifeId: 1, kind: 'bot' as const, position: new THREE.Vector3(3, 0, 0), radiusM: 0.5 };
    const impact = vi.fn();
    const pulse = vi.fn();
    expect(system.spawn({
      ownerId: 'player-a', ownerTeam: 0, origin: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0),
      authority: true, actionNonce: 77, now: 0,
    })).toBe(true);
    system.update(0.05, 50, callbacks({ hostileTargets: () => [target], onImpact: impact, onBurnPulse: pulse }));
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact.mock.calls[0][0]).toMatchObject({
      ownerId: 'player-a', target: { id: 'bot-1' }, directDamage: FLARE_PROJECTILE_EFFECT.directDamage,
    });
    system.update(0.05, 550, callbacks({ hostileTargets: () => [target], onImpact: impact, onBurnPulse: pulse }));
    expect(pulse).toHaveBeenCalledTimes(1);
    expect(pulse.mock.calls[0][0].damage).toBeGreaterThan(0);
    expect(pulse.mock.calls[0][0]).not.toHaveProperty('explosiveSource');
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
      phase: 'burn', remainingMs: 3_500, nextBurnPulseRemainingMs: 500, burnPulseIndex: 1,
    });

    const restored = new FlareProjectileSystem(new THREE.Scene(), true);
    const result = restored.restoreAuthorityCheckpoint(checkpoint, 1_200, -1_000);
    expect(result).toEqual({
      accepted: true, restored: 1, skippedExpired: 0, skippedBurnPulses: 2, poolExhaustions: 0,
    });
    expect(restored.inspectActiveReplicas(-1_000)[0]).toMatchObject({
      ownerId: 'guest-1', authority: true, phase: 'burn', remainingMs: 2_300,
    });
    expect(pulse).not.toHaveBeenCalled();

    const expired = new FlareProjectileSystem(new THREE.Scene(), true);
    expect(expired.restoreAuthorityCheckpoint(checkpoint, 3_500, 0)).toEqual({
      accepted: true, restored: 0, skippedExpired: 1, skippedBurnPulses: 7, poolExhaustions: 0,
    });
    expect(expired.inspectActiveReplicas(0)).toEqual([]);
  });
});
