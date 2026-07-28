import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { traceBallisticPath, type WeaponPenetrationProfile } from './ballistics';
import { circleIntersectsBox, isBlocked, segmentIntersectsBox } from './collision';
import type { ShedPlacement } from './destructible-world';
import { FIELD_SHED_DEFINITION } from './destructible-shed-presentation';
import { InteractiveWorldRuntime } from './interactive-world-runtime';

const placement: ShedPlacement = Object.freeze({
  id: 'atomic-shed-vertical-slice',
  definitionId: FIELD_SHED_DEFINITION.id,
  arenaId: 'atomic-acres',
  zone: 'whole-arena',
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
});

const weakProfile: WeaponPenetrationProfile = Object.freeze({
  caliber: 'test-low-energy',
  penetrationPower: 0.1,
  fmjMultiplier: 1,
  energyFalloffStart: 100,
  energyFalloffEnd: 200,
  minimumEnergyRetention: 1,
  minimumWallDamageMultiplier: 0.1,
  maxPenetratedSurfaces: 1,
});

describe('shared interactive-world runtime adapter', () => {
  it('publishes one revision for movement, ballistics, rendering and diagnostics', () => {
    const runtime = new InteractiveWorldRuntime('atomic-acres', 7, [placement], true);
    const collision = runtime.collisions();
    expect(collision.revision).toBe(0);
    expect(collision.movementColliders).toHaveLength(FIELD_SHED_DEFINITION.surfaces.length);
    expect(collision.dynamicColliders.map((entry) => entry.id)).toEqual(collision.ballisticSurfaces.map((surface) => surface.id));
    expect(collision.ballisticSurfaces).toHaveLength(FIELD_SHED_DEFINITION.surfaces.length);
    expect(runtime.collisionSnapshot()).toMatchObject({
      arenaId: 'atomic-acres',
      matchEpoch: 7,
      revision: 0,
      consumers: FIELD_SHED_DEFINITION.consumers,
    });
    expect(runtime.telemetry()).toMatchObject({ sheds: 1, presentationDraws: 4, movementColliders: 9, ballisticSurfaces: 9 });
    runtime.dispose();
  });

  it('updates the rotating door collider and presentation from the same canonical angle', () => {
    const runtime = new InteractiveWorldRuntime('atomic-acres', 8, [placement], true);
    const closedDoor = runtime.collisions().ballisticSurfaces.find((surface) => surface.destructibleSurface?.surfaceId === 'door-south')!;
    const doorGeometry = (runtime.root.getObjectByName('field-shed-door-leaf') as THREE.Mesh).geometry;
    const interaction = runtime.interactNearestDoor({
      actorId: 'player-a',
      actorAlive: true,
      actorPosition: { x: 0, y: 1.1, z: 3 },
      sequence: 1,
      tick: 100,
      hasLineOfSight: () => true,
    });
    expect(interaction?.accepted).toBe(true);
    expect(runtime.step(130)).toBe(true);
    const movingDoor = runtime.collisions().ballisticSurfaces.find((surface) => surface.destructibleSurface?.surfaceId === 'door-south')!;
    expect(movingDoor.bounds.rotation).not.toEqual(closedDoor.bounds.rotation);
    expect(runtime.collisions().revision).toBeGreaterThan(1);
    expect(runtime.root.getObjectByName('field-shed-door-hinge')!.rotation.y).toBeCloseTo(-Math.PI / 4);
    expect((runtime.root.getObjectByName('field-shed-door-leaf') as THREE.Mesh).geometry).toBe(doorGeometry);
    expect(runtime.telemetry()).toMatchObject({ presentationRetiredGeometries: 0 });

    // The 45-degree leaf occupies its visible diagonal, not the unrotated bounds
    // centred on the same pose. Movement and LOS must agree on both probes.
    expect(circleIntersectsBox(0.15, 2.97, 0.08, movingDoor.bounds)).toBe(true);
    expect(isBlocked({ x: 0.15, y: 1.65, z: 2.97 }, [movingDoor.bounds], 0.08)).toBe(true);
    expect(segmentIntersectsBox(
      { x: -0.2, y: 1.1, z: 2.97 },
      { x: 0.5, y: 1.1, z: 2.97 },
      movingDoor.bounds,
    )).toBe(true);
    expect(circleIntersectsBox(0.4, 2.61, 0.08, movingDoor.bounds)).toBe(false);
    expect(isBlocked({ x: 0.4, y: 1.65, z: 2.61 }, [movingDoor.bounds], 0.08)).toBe(false);
    expect(segmentIntersectsBox(
      { x: 0.4, y: 0.2, z: 2.61 },
      { x: 0.4, y: 2, z: 2.61 },
      movingDoor.bounds,
    )).toBe(false);
    runtime.dispose();
  });

  it('routes player contact through host authority and the same door collider/presentation state', () => {
    const host = new InteractiveWorldRuntime('atomic-acres', 8, [placement], true);
    const guest = new InteractiveWorldRuntime('atomic-acres', 8, [placement], false);
    const closedBounds = host.doorCollisionStates()[0]!.bounds;
    expect(guest.pushDoorFromPlayerContact({
      placementId: placement.id,
      actorId: 'player-a',
      tick: 10,
    })).toMatchObject({ accepted: false, reason: 'not-host' });
    expect(host.pushDoorFromPlayerContact({
      placementId: placement.id,
      actorId: 'player-a',
      tick: 10,
    })).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(host.step(40)).toBe(true);
    const moving = host.doorCollisionStates()[0]!;
    expect(moving.phase).toBe('opening');
    expect(moving.bounds.rotation).not.toEqual(closedBounds.rotation);
    expect(host.stateEnvelope().sheds[0]!.interactionSequences).toEqual([]);
    expect(guest.applyAuthoritativeEnvelope(JSON.parse(JSON.stringify(host.stateEnvelope())))).toBe(true);
    expect(guest.doorCollisionStates()[0]!.bounds).toEqual(moving.bounds);
    host.dispose();
    guest.dispose();
  });

  it('atomically persists door damage and a canonical bullet interruption for late join', () => {
    const host = new InteractiveWorldRuntime('atomic-acres', 8, [placement], true);
    const guest = new InteractiveWorldRuntime('atomic-acres', 8, [placement], false);
    expect(host.interactDoor({
      placementId: placement.id,
      actorId: 'player-a',
      actorAlive: true,
      actorPosition: { x: 0, y: 1.1, z: 3 },
      sequence: 1,
      tick: 100,
      hasLineOfSight: () => true,
    })?.accepted).toBe(true);
    expect(host.step(130)).toBe(true);
    const movingDoor = host.collisions().ballisticSurfaces.find(
      (surface) => surface.destructibleSurface?.surfaceId === 'door-south',
    )!;
    const point = {
      x: (movingDoor.bounds.minX + movingDoor.bounds.maxX) / 2,
      y: ((movingDoor.bounds.minY ?? 0) + (movingDoor.bounds.maxY ?? 0)) / 2,
      z: (movingDoor.bounds.minZ + movingDoor.bounds.maxZ) / 2,
    };
    const interrupted = host.applyBulletImpact({
      surface: movingDoor,
      point,
      tick: 130,
      damageQ: 30,
      penetrationEnergyQ: 20,
      radiusUQ: 700,
      radiusVQ: 700,
    });
    expect(interrupted).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(interrupted!.state.door).toMatchObject({
      phase: 'blocked',
      angleQ: 5_000,
      blockedBy: { kind: 'bullet' },
      resumePolicy: 'remain-blocked-until-new-command',
    });
    expect(interrupted!.state.surfaces.find((surface) => surface.surfaceId === 'door-south')?.dents).toHaveLength(1);
    expect(host.step(200)).toBe(false);
    expect(host.resumeDoor(placement.id, 201)).toMatchObject({ accepted: false, reason: 'invalid-blocker' });
    expect(guest.applyAuthoritativeEnvelope(JSON.parse(JSON.stringify(host.stateEnvelope())))).toBe(true);
    expect(guest.stateEnvelope()).toEqual(host.stateEnvelope());

    const guestDoor = guest.collisions().ballisticSurfaces.find(
      (surface) => surface.destructibleSurface?.surfaceId === 'door-south',
    )!;
    expect(guest.applyBulletImpact({
      surface: guestDoor,
      point,
      tick: 131,
      damageQ: 30,
      penetrationEnergyQ: 20,
      radiusUQ: 700,
      radiusVQ: 700,
    })).toMatchObject({ accepted: false, reason: 'not-host' });
    host.dispose();
    guest.dispose();
  });

  it('binds a remote interaction to the requested shed instead of retargeting it', () => {
    const eastPlacement: ShedPlacement = Object.freeze({
      ...placement,
      id: 'atomic-shed-east-slice',
      position: { x: 12, y: 0, z: 0 },
    });
    const runtime = new InteractiveWorldRuntime('atomic-acres', 8, [placement, eastPlacement], true);
    expect(runtime.nearestDoor({ x: 0, y: 1.1, z: 3 })?.placementId).toBe(placement.id);
    expect(runtime.nextInteractionSequence(placement.id, 'player-a')).toBe(1);
    expect(runtime.nextInteractionSequence(eastPlacement.id, 'player-a')).toBe(1);
    const spoofed = runtime.interactDoor({
      placementId: eastPlacement.id,
      actorId: 'player-a',
      actorAlive: true,
      actorPosition: { x: 0, y: 1.1, z: 3 },
      sequence: 1,
      tick: 100,
      hasLineOfSight: () => true,
    });
    expect(spoofed).toMatchObject({ accepted: false, reason: 'out-of-range' });
    expect(runtime.nextInteractionSequence(eastPlacement.id, 'player-a')).toBe(1);
    expect(runtime.stateEnvelope().sheds.every((shed) => shed.door.phase === 'closed')).toBe(true);
    runtime.dispose();
  });

  it('admits a bullet aperture and makes the exact visible region pass the trace', () => {
    const runtime = new InteractiveWorldRuntime('atomic-acres', 9, [placement], true);
    const north = runtime.collisions().ballisticSurfaces.find((surface) => surface.destructibleSurface?.surfaceId === 'wall-north')!;
    const blocked = traceBallisticPath(
      { x: 0, y: 1.2, z: -5 }, { x: 0, y: 0, z: 1 }, 4, weakProfile, [north], runtime.apertureQuery,
    );
    expect(blocked.reachedDistance).toBe(false);
    const impact = runtime.applyBulletImpact({
      surface: north,
      point: { x: 0, y: 1.2, z: -2.1 },
      tick: 0,
      damageQ: 60,
      penetrationEnergyQ: 70,
      radiusUQ: 900,
      radiusVQ: 900,
    });
    expect(impact?.accepted).toBe(true);
    const currentNorth = runtime.collisions().ballisticSurfaces.find((surface) => surface.destructibleSurface?.surfaceId === 'wall-north')!;
    const through = traceBallisticPath(
      { x: 0, y: 1.2, z: -5 }, { x: 0, y: 0, z: 1 }, 4, weakProfile, [currentNorth], runtime.apertureQuery,
    );
    const outside = traceBallisticPath(
      { x: 0.5, y: 1.2, z: -5 }, { x: 0, y: 0, z: 1 }, 4, weakProfile, [currentNorth], runtime.apertureQuery,
    );
    expect(through).toMatchObject({ reachedDistance: true, impacts: [] });
    expect(outside.reachedDistance).toBe(false);
    expect(runtime.telemetry()).toMatchObject({ apertures: 1, presentationDraws: 5 });
    runtime.dispose();
  });

  it('removes an authored detached panel from every collision consumer', () => {
    const runtime = new InteractiveWorldRuntime('atomic-acres', 10, [placement], true);
    const before = runtime.collisions();
    const fractured = runtime.applyExplosion({
      placementId: placement.id,
      surfaceId: 'wall-west',
      damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ,
    });
    expect(fractured?.accepted).toBe(true);
    const after = runtime.collisions();
    expect(after.movementColliders).toHaveLength(before.movementColliders.length);
    expect(after.ballisticSurfaces).toHaveLength(before.ballisticSurfaces.length);
    expect(after.ballisticSurfaces.some((surface) => surface.destructibleSurface?.surfaceId === 'wall-west')).toBe(false);
    expect(after.ballisticSurfaces.some((surface) => surface.majorDebris?.chunkId === 'chunk-west')).toBe(true);
    expect(runtime.telemetry()).toMatchObject({ detachedChunks: 1, awakeMajorBodies: 1, presentationDraws: 6, dents: 1 });
    const physicsBody = runtime.majorDebrisPhysicsBodies()[0]!;
    expect(physicsBody.id).toBe('atomic-shed-vertical-slice:debris:chunk-west');
    expect(physicsBody.halfExtents).toEqual({ x: 2.1, y: 1.2, z: 0.06 });
    const priorDebris = after.ballisticSurfaces.find((surface) => surface.majorDebris?.chunkId === 'chunk-west')!;
    expect(runtime.adoptMajorDebrisPhysics([{
      id: physicsBody.id,
      position: { ...physicsBody.position, x: physicsBody.position.x + 1 },
      rotation: physicsBody.rotation,
      linearVelocity: { x: 1, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0.2, z: 0 },
      sleeping: false,
      flat: false,
    }])).toBe(true);
    const movedDebris = runtime.collisions().ballisticSurfaces.find((surface) => surface.majorDebris?.chunkId === 'chunk-west')!;
    expect((movedDebris.bounds.minX + movedDebris.bounds.maxX) / 2)
      .toBeCloseTo((priorDebris.bounds.minX + priorDebris.bounds.maxX) / 2 + 1);
    const lateJoin = new InteractiveWorldRuntime('atomic-acres', 10, [placement], false);
    expect(lateJoin.applyAuthoritativeEnvelope(JSON.parse(JSON.stringify(runtime.stateEnvelope())))).toBe(true);
    expect(lateJoin.telemetry()).toMatchObject({ detachedChunks: 1, awakeMajorBodies: 1, dents: 1 });
    expect(lateJoin.collisions().ballisticSurfaces.some((surface) => surface.majorDebris?.chunkId === 'chunk-west')).toBe(true);
    expect(lateJoin.majorDebrisPhysicsBodies()).toHaveLength(1);
    lateJoin.dispose();
    runtime.dispose();
  });

  it('applies bounded radial explosion damage only under host authority', () => {
    const host = new InteractiveWorldRuntime('atomic-acres', 10, [placement], true);
    const shedCalibratedHost = new InteractiveWorldRuntime('atomic-acres', 10, [placement], true);
    const guest = new InteractiveWorldRuntime('atomic-acres', 10, [placement], false);
    const origin = { x: placement.position.x, y: placement.position.y + 1.2, z: placement.position.z + 2.1 };
    expect(guest.applyExplosionAt({ origin, radius: 4, maximumDamageQ: 300 })).toBe(0);
    expect(host.applyExplosionAt({ origin, radius: 4, maximumDamageQ: 300 })).toBeGreaterThan(0);
    expect(host.telemetry().revision).toBeGreaterThan(0);
    expect(host.telemetry().dents).toBeGreaterThan(0);
    expect(shedCalibratedHost.applyExplosionAt({ origin, radius: 4, maximumDamageQ: 1, shedMaximumDamageQ: 300 })).toBeGreaterThan(0);
    expect(shedCalibratedHost.telemetry().dents).toBe(host.telemetry().dents);
    expect(shedCalibratedHost.applyExplosionAt({ origin, radius: 4, maximumDamageQ: 1, shedMaximumDamageQ: Number.NaN })).toBe(0);
    expect(guest.applyAuthoritativeEnvelope(JSON.parse(JSON.stringify(host.stateEnvelope())))).toBe(true);
    expect(guest.telemetry()).toMatchObject({ dents: host.telemetry().dents, detachedChunks: host.telemetry().detachedChunks });
    guest.dispose();
    shedCalibratedHost.dispose();
    host.dispose();
  });

  it('strictly reconstructs a late join and resets every shed on a newer epoch', () => {
    const host = new InteractiveWorldRuntime('atomic-acres', 11, [placement], true);
    const guest = new InteractiveWorldRuntime('atomic-acres', 11, [placement], false);
    const door = host.interactNearestDoor({
      actorId: 'player-a', actorAlive: true, actorPosition: { x: 0, y: 1.1, z: 3 }, sequence: 1, tick: 10,
      hasLineOfSight: () => true,
    });
    expect(door?.accepted).toBe(true);
    host.step(25);
    const envelope = JSON.parse(JSON.stringify(host.stateEnvelope())) as Record<string, unknown>;
    expect(guest.applyAuthoritativeEnvelope(envelope)).toBe(true);
    expect(guest.stateEnvelope()).toEqual(host.stateEnvelope());
    expect(guest.applyAuthoritativeEnvelope({ ...envelope, clientCanFracture: true })).toBe(false);
    expect(guest.applyAuthoritativeEnvelope({ ...envelope, hash: '0'.repeat(64) })).toBe(false);
    expect(guest.interactNearestDoor({
      actorId: 'player-b', actorAlive: true, actorPosition: { x: 0, y: 1.1, z: 3 }, sequence: 1, tick: 30,
      hasLineOfSight: () => true,
    })?.reason).toBe('not-host');
    expect(guest.hasHostAuthority()).toBe(false);
    guest.setHostAuthority(true);
    expect(guest.hasHostAuthority()).toBe(true);
    host.reset(12);
    expect(host.telemetry()).toMatchObject({ matchEpoch: 12, revision: 0, apertures: 0, dents: 0, detachedChunks: 0 });
    host.dispose();
    guest.dispose();
  });
});
