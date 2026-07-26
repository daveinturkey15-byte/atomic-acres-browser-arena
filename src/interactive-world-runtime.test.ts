import { describe, expect, it } from 'vitest';
import { traceBallisticPath, type WeaponPenetrationProfile } from './ballistics';
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
    expect(runtime.telemetry()).toMatchObject({ detachedChunks: 1, awakeMajorBodies: 1, presentationDraws: 5 });
    runtime.dispose();
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
    host.reset(12);
    expect(host.telemetry()).toMatchObject({ matchEpoch: 12, revision: 0, apertures: 0, dents: 0, detachedChunks: 0 });
    host.dispose();
    guest.dispose();
  });
});
