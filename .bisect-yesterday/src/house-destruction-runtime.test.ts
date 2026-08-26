import { describe, expect, it } from 'vitest';
import { HOUSE_LAYOUT } from './arena-layout';
import { createHouseArchitecture } from './house-navigation';
import { createAtomicHouseFragmentDefinitions } from './house-destruction';
import { InteractiveWorldRuntime, isInteractiveWorldStateEnvelope } from './interactive-world-runtime';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';
import type { ShedPlacement } from './destructible-world';

const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
const definitions = createAtomicHouseFragmentDefinitions(houses);

function runtime(epoch: number, host: boolean): InteractiveWorldRuntime {
  return new InteractiveWorldRuntime('atomic-acres', epoch, [], host, undefined, undefined, definitions);
}

describe('Atomic-house interactive-world runtime integration', () => {
  it('replaces an intact static surface with one persistent Rapier-ready body', () => {
    const host = runtime(41, true);
    expect(host.telemetry()).toMatchObject({
      houseFragments: 10,
      houseDetachedFragments: 0,
      houseMajorBodies: 0,
      majorBodiesTotal: 0,
      movementColliders: 10,
      ballisticSurfaces: 10,
    });
    const wall = definitions.find((definition) => definition.role === 'wall')!;
    const surface = host.collisions().ballisticSurfaces.find(
      (candidate) => candidate.houseFragment?.fragmentId === wall.id,
    )!;
    const result = host.applyHouseBulletImpact({
      surface,
      damageQ: wall.detachDamageQ,
      penetrationEnergyQ: 100,
      impulseQ: { xQ: 1_000, yQ: 300, zQ: 0 },
    });
    expect(result).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(host.collisions().ballisticSurfaces.some(
      (candidate) => candidate.houseFragment?.fragmentId === wall.id,
    )).toBe(false);
    expect(host.collisions().ballisticSurfaces.some(
      (candidate) => candidate.houseMajorDebris?.fragmentId === wall.id,
    )).toBe(true);
    expect(host.collisions().movementColliders).toHaveLength(10);
    expect(host.majorDebrisPhysicsBodies()).toEqual([
      expect.objectContaining({
        id: `house-debris:${wall.id}`,
        halfExtents: wall.halfExtents,
        sleeping: false,
      }),
    ]);
    expect(host.hasDetachedProfileOwnedHouseFragment()).toBe(true);
    expect(host.collisionSnapshot()).toMatchObject({
      revision: host.collisions().revision,
      houseDestruction: { detachedFragmentIds: [wall.id] },
      hashAlgorithm: 'sha256',
    });
    host.dispose();
  });

  it('strictly hashes late join state, rejects incompatible definitions and resets on rematch', () => {
    const host = runtime(42, true);
    const guest = runtime(42, false);
    const furniture = definitions.find((definition) => definition.role === 'furniture')!;
    expect(host.applyHouseFragmentDamage({
      fragmentId: furniture.id,
      damageQ: furniture.detachDamageQ,
    })?.accepted).toBe(true);
    const envelope = JSON.parse(JSON.stringify(host.stateEnvelope()));
    expect(isInteractiveWorldStateEnvelope(envelope)).toBe(true);
    expect(guest.applyAuthoritativeEnvelope(envelope)).toBe(true);
    expect(guest.stateEnvelope()).toEqual(host.stateEnvelope());
    expect(guest.majorDebrisPhysicsBodies()).toHaveLength(1);
    expect(guest.hasDetachedProfileOwnedHouseFragment()).toBe(false);
    expect(guest.applyHouseFragmentDamage({ fragmentId: definitions[1]!.id, damageQ: 1 })?.reason).toBe('not-host');
    expect(guest.applyAuthoritativeEnvelope({ ...envelope, hash: '0'.repeat(64) })).toBe(false);
    expect(guest.applyAuthoritativeEnvelope({
      ...envelope,
      houseDestruction: { ...envelope.houseDestruction, definitionHash: '0'.repeat(64) },
    })).toBe(false);
    const newer = host.applyHouseFragmentDamage({
      fragmentId: definitions.find((definition) => definition.role === 'roof')!.id,
      damageQ: 1,
    });
    expect(newer?.accepted).toBe(true);
    expect(host.applyAuthoritativeEnvelope(envelope)).toBe(false);
    host.reset(43);
    expect(host.telemetry()).toMatchObject({
      matchEpoch: 43,
      revision: 0,
      houseDetachedFragments: 0,
      houseMajorBodies: 0,
    });
    host.dispose();
    guest.dispose();
  });

  it('changes profile presentation without changing collision or hiding detached major bodies', () => {
    const host = runtime(44, true);
    const before = host.collisions();
    host.setExternalHouseProfilePresentationActive(true);
    expect(host.collisions()).toBe(before);
    expect(host.telemetry()).toMatchObject({ movementColliders: 10, ballisticSurfaces: 10 });
    const roof = definitions.find((definition) => definition.role === 'roof')!;
    expect(host.applyHouseFragmentDamage({ fragmentId: roof.id, damageQ: roof.detachDamageQ })?.accepted).toBe(true);
    host.setExternalHouseProfilePresentationActive(true);
    expect(host.root.getObjectByName(`atomic-house-fragments:${roof.presentationMaterialId}`)?.visible).toBe(true);
    expect(host.majorDebrisPhysicsBodies()).toHaveLength(1);
    host.dispose();
  });

  it('rejects a thirteenth shed body before the shared 12/4 runtime partition can overflow', () => {
    const placements: ShedPlacement[] = [0, 1, 2].map((index) => ({
      id: `atomic-budget-shed-${index}`,
      definitionId: FIELD_SHED_DEFINITION.id,
      arenaId: 'atomic-acres',
      zone: 'whole-arena',
      position: { x: index * 10, y: 0, z: 0 },
      yaw: 0,
    }));
    const host = new InteractiveWorldRuntime('atomic-acres', 45, placements, true);
    const detachable = FIELD_SHED_DEFINITION.surfaces.filter((surface) => surface.detachableChunkId !== null);
    expect(detachable).toHaveLength(6);
    for (const placement of placements.slice(0, 2)) {
      for (const surface of detachable) {
        expect(host.applyExplosion({
          placementId: placement.id,
          surfaceId: surface.id,
          damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ,
        })?.accepted).toBe(true);
      }
    }
    expect(host.shedMajorBodyCount()).toBe(12);
    expect(host.applyExplosion({
      placementId: placements[2]!.id,
      surfaceId: detachable[0]!.id,
      damageQ: FIELD_SHED_DEFINITION.thresholds.detachDamageQ,
    })).toMatchObject({ accepted: false, reason: 'shared-major-body-cap' });
    expect(host.shedMajorBodyCount()).toBe(12);
    expect(host.majorDebrisPhysicsBodies()).toHaveLength(12);
    host.dispose();
  });
});
