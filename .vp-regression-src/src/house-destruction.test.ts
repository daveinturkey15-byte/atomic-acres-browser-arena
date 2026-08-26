import { describe, expect, it } from 'vitest';
import { HOUSE_LAYOUT } from './arena-layout';
import { createHouseArchitecture } from './house-navigation';
import {
  HOUSE_MAX_MAJOR_DEBRIS_BODIES,
  applyHouseFragmentDamage,
  createAtomicHouseFragmentDefinitions,
  createInitialHouseDestructionState,
  houseDestructionStateHash,
  houseDestructionStateMatchesDefinitions,
  impulseHouseMajorDebris,
  isHouseDestructionState,
  resetHouseDestructionState,
  synchronizeHouseMajorDebris,
  validateHouseFragmentDefinitions,
} from './house-destruction';

const houses = HOUSE_LAYOUT.map((house) => createHouseArchitecture(house.team, house.x, house.z, house.facing));
const definitions = createAtomicHouseFragmentDefinitions(houses);

describe('bounded preauthored Atomic-house destruction authority', () => {
  it('binds two stable walls, two authored roof slabs and one furniture cuboid per house', () => {
    expect(validateHouseFragmentDefinitions(definitions, houses)).toEqual([]);
    expect(definitions).toHaveLength(10);
    expect(definitions.map((definition) => definition.id)).toEqual(
      [...definitions.map((definition) => definition.id)].sort(),
    );
    for (const house of houses) {
      const entries = definitions.filter((definition) => definition.houseId === house.id);
      expect(entries.filter((definition) => definition.role === 'wall')).toHaveLength(2);
      expect(entries.filter((definition) => definition.role === 'roof')).toHaveLength(2);
      expect(entries.filter((definition) => definition.role === 'furniture')).toHaveLength(1);
      for (const wall of entries.filter((definition) => definition.role === 'wall')) {
        const source = house.solids.find((solid) => solid.id === wall.sourceId)!;
        expect(source.kind).toBe('wall');
        expect(source.collidable).toBe(true);
        expect(wall.position).toEqual({ x: source.position[0], y: source.position[1], z: source.position[2] });
        expect(wall.profileOwnedPresentation).toBe(true);
      }
      expect(entries.find((definition) => definition.role === 'furniture')).toMatchObject({
        sourceKind: 'authored-furniture',
        profileOwnedPresentation: false,
      });
    }
    expect(validateHouseFragmentDefinitions(definitions.map((definition, index) => index === 0
      ? { ...definition, halfExtents: { ...definition.halfExtents, x: 100 } }
      : definition), houses)).toContain(`${definitions[0]!.id}: invalid bounded cuboid`);
  });

  it('admits host damage exactly once and rejects guest, stale and duplicate detach', () => {
    const initial = createInitialHouseDestructionState(definitions, 21);
    const target = definitions[0]!;
    expect(applyHouseFragmentDamage(definitions, initial, {
      isHost: false, matchEpoch: 21, expectedRevision: 0, fragmentId: target.id, damageQ: 1,
    })).toMatchObject({ accepted: false, reason: 'not-host', state: initial });
    const damaged = applyHouseFragmentDamage(definitions, initial, {
      isHost: true, matchEpoch: 21, expectedRevision: 0,
      fragmentId: target.id, damageQ: target.detachDamageQ - 1,
    });
    expect(damaged).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(damaged.state.fragments[0]).toMatchObject({ stage: 'damaged', damageQ: target.detachDamageQ - 1 });
    const detached = applyHouseFragmentDamage(definitions, damaged.state, {
      isHost: true, matchEpoch: 21, expectedRevision: damaged.state.revision,
      fragmentId: target.id, damageQ: 1,
    });
    expect(detached.state).toMatchObject({
      revision: 2,
      detachedFragmentIds: [target.id],
      majorDebris: [expect.objectContaining({ fragmentId: target.id, sleeping: false })],
    });
    expect(applyHouseFragmentDamage(definitions, detached.state, {
      isHost: true, matchEpoch: 21, expectedRevision: detached.state.revision,
      fragmentId: target.id, damageQ: 1,
    })).toMatchObject({ accepted: false, reason: 'already-detached', state: detached.state });
    expect(applyHouseFragmentDamage(definitions, detached.state, {
      isHost: true, matchEpoch: 20, expectedRevision: detached.state.revision,
      fragmentId: definitions[1]!.id, damageQ: 1,
    }).reason).toBe('stale-epoch');
  });

  it('uses deterministic rejection at four house bodies and never evicts an earlier fragment', () => {
    let state = createInitialHouseDestructionState(definitions, 22);
    for (const definition of definitions.slice(0, HOUSE_MAX_MAJOR_DEBRIS_BODIES)) {
      const result = applyHouseFragmentDamage(definitions, state, {
        isHost: true, matchEpoch: 22, expectedRevision: state.revision,
        fragmentId: definition.id, damageQ: definition.detachDamageQ,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    const admittedIds = state.detachedFragmentIds;
    const rejected = applyHouseFragmentDamage(definitions, state, {
      isHost: true, matchEpoch: 22, expectedRevision: state.revision,
      fragmentId: definitions[HOUSE_MAX_MAJOR_DEBRIS_BODIES]!.id,
      damageQ: definitions[HOUSE_MAX_MAJOR_DEBRIS_BODIES]!.detachDamageQ,
    });
    expect(rejected).toMatchObject({ accepted: false, reason: 'shared-major-body-cap', state });
    expect(rejected.state.detachedFragmentIds).toEqual(admittedIds);
  });

  it('strictly reconstructs, hashes, synchronizes and resets the bounded state', () => {
    expect(() => createInitialHouseDestructionState([...definitions, definitions[0]!], 23)).toThrow(
      /Invalid initial house destruction state/,
    );
    expect(() => createInitialHouseDestructionState([...definitions].reverse(), 23)).toThrow(
      /Invalid initial house destruction state/,
    );
    const initial = createInitialHouseDestructionState(definitions, 23);
    const target = definitions.find((definition) => definition.role === 'furniture')!;
    const detached = applyHouseFragmentDamage(definitions, initial, {
      isHost: true, matchEpoch: 23, expectedRevision: 0,
      fragmentId: target.id, damageQ: target.detachDamageQ,
    }).state;
    const wire = JSON.parse(JSON.stringify(detached));
    expect(isHouseDestructionState(wire)).toBe(true);
    expect(houseDestructionStateMatchesDefinitions(wire, definitions)).toBe(true);
    expect(houseDestructionStateHash(wire)).toBe(houseDestructionStateHash(detached));
    expect(isHouseDestructionState({ ...wire, clientCanFracture: true })).toBe(false);
    expect(houseDestructionStateMatchesDefinitions({ ...wire, definitionHash: '0'.repeat(64) }, definitions)).toBe(false);

    const body = detached.majorDebris[0]!;
    const impulsed = impulseHouseMajorDebris(detached, {
      isHost: true, expectedRevision: detached.revision, fragmentId: target.id,
      impulseQ: { xQ: 800, yQ: 400, zQ: -200 },
    });
    expect(impulsed.state.majorDebris[0]!.velocityQ.xQ).toBe(body.velocityQ.xQ + 800);
    const synchronized = synchronizeHouseMajorDebris(impulsed.state, {
      isHost: true,
      expectedRevision: impulsed.state.revision,
      bodies: impulsed.state.majorDebris.map((entry) => ({ ...entry, sleeping: true, flat: true })),
    });
    expect(synchronized.state.majorDebris[0]).toMatchObject({ sleeping: true, flat: true });
    const reset = resetHouseDestructionState(synchronized.state, definitions, 24);
    expect(reset).toMatchObject({ matchEpoch: 24, revision: 0, detachedFragmentIds: [], majorDebris: [] });
  });
});
