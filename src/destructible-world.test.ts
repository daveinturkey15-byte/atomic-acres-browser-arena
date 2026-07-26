import { describe, expect, it } from 'vitest';
import {
  ARENA_MAX_AWAKE_SHED_BODIES,
  SHED_ANGLE_Q,
  SHED_DOOR_TRAVEL_TICKS,
  SHED_MAX_APERTURES,
  SHED_MAX_DENTS,
  SHED_MAX_MAJOR_CHUNKS,
  WORLD_COLLISION_CONSUMERS,
  admitShedDoorInteraction,
  advanceShedDoor,
  apertureContainsPanelPoint,
  applyShedExplosion,
  applyShedSheetImpact,
  blockShedDoor,
  createInitialShedState,
  createWorldCollisionSnapshot,
  impulseMajorShedDebris,
  isShedState,
  resetShedState,
  resumeShedDoorWhenClear,
  shedApertureContainsWorldPoint,
  validateDestructibleShedDefinition,
  worldPointToPanelCoordinates,
  type DestructibleShedDefinition,
  type ShedPlacement,
  type ShedState,
} from './destructible-world';

const definition: DestructibleShedDefinition = Object.freeze({
  schemaVersion: 1,
  id: 'field-shed-v1',
  doorSurfaceId: 'door-south',
  surfaces: Object.freeze([
    {
      id: 'door-south', role: 'door' as const, detachableChunkId: 'chunk-door',
      frame: { centre: { x: 0, y: 1.2, z: 1.5 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 0.7, halfV: 1.2 },
    },
    {
      id: 'wall-north', role: 'wall' as const, detachableChunkId: 'chunk-north',
      frame: { centre: { x: 0, y: 1.25, z: -1.5 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.5, halfV: 1.25 },
    },
    {
      id: 'wall-east', role: 'wall' as const, detachableChunkId: 'chunk-east',
      frame: { centre: { x: 1.5, y: 1.25, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.5, halfV: 1.25 },
    },
    {
      id: 'wall-west', role: 'wall' as const, detachableChunkId: 'chunk-west',
      frame: { centre: { x: -1.5, y: 1.25, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: 0, y: 1, z: 0 }, halfU: 1.5, halfV: 1.25 },
    },
    {
      id: 'roof-east', role: 'roof' as const, detachableChunkId: 'chunk-roof-east',
      frame: { centre: { x: 0.75, y: 2.85, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: 0.9, y: 0.43589, z: 0 }, halfU: 1.6, halfV: 0.85 },
    },
    {
      id: 'roof-west', role: 'roof' as const, detachableChunkId: 'chunk-roof-west',
      frame: { centre: { x: -0.75, y: 2.85, z: 0 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: -0.9, y: 0.43589, z: 0 }, halfU: 1.6, halfV: 0.85 },
    },
  ]),
  preauthoredChunkIds: Object.freeze(['chunk-door', 'chunk-north', 'chunk-east', 'chunk-west', 'chunk-roof-east', 'chunk-roof-west']),
  thresholds: Object.freeze({ dentDamageQ: 20, perforateEnergyQ: 45, detachDamageQ: 220 }),
  caps: Object.freeze({
    apertures: SHED_MAX_APERTURES,
    dents: SHED_MAX_DENTS,
    majorChunks: SHED_MAX_MAJOR_CHUNKS,
    arenaAwakeMajorBodies: ARENA_MAX_AWAKE_SHED_BODIES,
  }),
  consumers: WORLD_COLLISION_CONSUMERS,
});

const placement: ShedPlacement = Object.freeze({
  id: 'atomic-shed-a',
  definitionId: definition.id,
  arenaId: 'atomic-acres',
  zone: 'whole-arena',
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
});

function initial(): ShedState {
  return createInitialShedState(definition, placement, 11);
}

function interact(state: ShedState, tick: number, sequence: number) {
  return admitShedDoorInteraction(state, {
    isHost: true,
    matchEpoch: 11,
    expectedRevision: state.revision,
    actorId: 'player-a',
    actorAlive: true,
    sequence,
    distance: 1.5,
    hasLineOfSight: true,
    tick,
  });
}

describe('Pass 65 destructible-world authority', () => {
  it('freezes exact consumers, caps, identifiers and definition geometry', () => {
    expect(validateDestructibleShedDefinition(definition)).toEqual([]);
    expect(definition.caps).toEqual({ apertures: 32, dents: 24, majorChunks: 6, arenaAwakeMajorBodies: 18 });
    expect(definition.consumers).toEqual([
      'player-movement', 'ballistics', 'grenade-explosion-sweeps', 'ai-line-of-sight',
      'support-targeting', 'spawn-safety-navigation', 'rendering', 'minimap-diagnostics',
    ]);
    expect(validateDestructibleShedDefinition({
      ...definition,
      consumers: definition.consumers.slice(1),
    })).toContain('world collision consumer parity incomplete');
  });

  it('moves an unobstructed door exactly one second and rejects guest/stale/replayed intent', () => {
    const rejected = admitShedDoorInteraction(initial(), {
      isHost: false, matchEpoch: 11, expectedRevision: 0, actorId: 'player-a', actorAlive: true,
      sequence: 1, distance: 1, hasLineOfSight: true, tick: 100,
    });
    expect(rejected.reason).toBe('not-host');

    const opened = interact(initial(), 100, 1);
    expect(opened.accepted).toBe(true);
    expect(opened.state.door.completesAtTick - opened.state.door.startedAtTick).toBe(SHED_DOOR_TRAVEL_TICKS);
    const halfway = advanceShedDoor(opened.state, 130);
    expect(halfway.door.angleQ).toBe(SHED_ANGLE_Q / 2);
    const complete = advanceShedDoor(halfway, 160);
    expect(complete.door).toMatchObject({ angleQ: SHED_ANGLE_Q, phase: 'open', direction: 'stationary' });

    const replay = admitShedDoorInteraction(complete, {
      isHost: true, matchEpoch: 11, expectedRevision: complete.revision, actorId: 'player-a', actorAlive: true,
      sequence: 1, distance: 1, hasLineOfSight: true, tick: 161,
    });
    expect(replay.reason).toBe('invalid-sequence');
    const stale = admitShedDoorInteraction(complete, {
      isHost: true, matchEpoch: 10, expectedRevision: complete.revision, actorId: 'player-a', actorAlive: true,
      sequence: 2, distance: 1, hasLineOfSight: true, tick: 161,
    });
    expect(stale.reason).toBe('stale-epoch');
  });

  it('reconstructs block, explicit resume and mid-motion reversal without mesh-only state', () => {
    const moving = advanceShedDoor(interact(initial(), 10, 1).state, 35);
    const blocked = blockShedDoor(moving, {
      isHost: true,
      expectedRevision: moving.revision,
      tick: 35,
      blocker: { kind: 'player', entityId: 'player-b' },
    });
    expect(blocked.state.door).toMatchObject({ phase: 'blocked', angleQ: 4167, desiredAngleQ: SHED_ANGLE_Q });
    expect(advanceShedDoor(blocked.state, 200)).toBe(blocked.state);

    const resumed = resumeShedDoorWhenClear(blocked.state, {
      isHost: true, expectedRevision: blocked.state.revision, tick: 50,
    });
    expect(resumed.state.door.completesAtTick - 50).toBe(35);
    expect(advanceShedDoor(resumed.state, 85).door.phase).toBe('open');

    const reversed = interact(moving, 36, 2);
    expect(reversed.state.door).toMatchObject({ desiredAngleQ: 0, direction: 'closing' });
    expect(reversed.state.door.completesAtTick - 36).toBe(26);
    expect(advanceShedDoor(reversed.state, 62).door.phase).toBe('closed');
  });

  it('uses the identical quantized ellipse for visible masking and shoot-through', () => {
    const impact = applyShedSheetImpact(definition, initial(), {
      isHost: true,
      matchEpoch: 11,
      expectedRevision: 0,
      surfaceId: 'wall-north',
      uQ: 2_000,
      vQ: -1_000,
      radiusUQ: 800,
      radiusVQ: 1_200,
      damageQ: 50,
      penetrationEnergyQ: 70,
    });
    expect(impact.accepted).toBe(true);
    const aperture = impact.state.surfaces.find((surface) => surface.surfaceId === 'wall-north')!.apertures[0]!;
    expect(apertureContainsPanelPoint(aperture, 2_000, -1_000)).toBe(true);
    expect(apertureContainsPanelPoint(aperture, 2_801, -1_000)).toBe(false);
    const worldPoint = { x: 0.3, y: 1.125, z: -1.5 };
    expect(worldPointToPanelCoordinates(definition, placement, 'wall-north', worldPoint)).toEqual({ uQ: 2_000, vQ: -1_000 });
    expect(shedApertureContainsWorldPoint(definition, placement, impact.state, 'wall-north', worldPoint)).toBe(true);
    expect(shedApertureContainsWorldPoint(definition, placement, impact.state, 'wall-north', { ...worldPoint, x: 0.6 })).toBe(false);
  });

  it('fails aperture and dent saturation closed without enlarging authority', () => {
    let apertureState = initial();
    for (let index = 0; index < SHED_MAX_APERTURES; index += 1) {
      const result = applyShedSheetImpact(definition, apertureState, {
        isHost: true, matchEpoch: 11, expectedRevision: apertureState.revision, surfaceId: 'wall-north',
        uQ: -9_000 + index * 500, vQ: 0, radiusUQ: 100, radiusVQ: 100,
        damageQ: 45, penetrationEnergyQ: 45,
      });
      expect(result.accepted).toBe(true);
      apertureState = result.state;
    }
    const saturated = applyShedSheetImpact(definition, apertureState, {
      isHost: true, matchEpoch: 11, expectedRevision: apertureState.revision, surfaceId: 'wall-north',
      uQ: 9_500, vQ: 0, radiusUQ: 500, radiusVQ: 500, damageQ: 45, penetrationEnergyQ: 45,
    });
    expect(saturated).toMatchObject({ accepted: false, reason: 'aperture-cap' });
    expect(saturated.state).toBe(apertureState);

    let dentState = initial();
    for (let index = 0; index < SHED_MAX_DENTS; index += 1) {
      const result = applyShedSheetImpact(definition, dentState, {
        isHost: true, matchEpoch: 11, expectedRevision: dentState.revision, surfaceId: 'wall-east',
        uQ: -9_000 + index * 600, vQ: 0, radiusUQ: 100, radiusVQ: 100,
        damageQ: 20, penetrationEnergyQ: 0,
      });
      expect(result.accepted).toBe(true);
      dentState = result.state;
    }
    expect(applyShedSheetImpact(definition, dentState, {
      isHost: true, matchEpoch: 11, expectedRevision: dentState.revision, surfaceId: 'wall-east',
      uQ: 9_000, vQ: 0, radiusUQ: 100, radiusVQ: 100, damageQ: 20, penetrationEnergyQ: 0,
    }).reason).toBe('dent-cap');
  });

  it('detaches only pre-authored chunks and preserves flat-shot wake semantics', () => {
    const damaged = applyShedExplosion(definition, initial(), {
      isHost: true, matchEpoch: 11, expectedRevision: 0, surfaceId: 'wall-west', damageQ: 220,
    });
    expect(damaged.accepted).toBe(true);
    expect(damaged.state.detachedChunkIds).toEqual(['chunk-west']);
    expect(damaged.state.majorDebris).toHaveLength(1);
    expect(applyShedExplosion(definition, damaged.state, {
      isHost: true, matchEpoch: 11, expectedRevision: damaged.state.revision, surfaceId: 'wall-west', damageQ: 220,
    }).reason).toBe('already-detached');

    const flat: ShedState = {
      ...damaged.state,
      majorDebris: [{ ...damaged.state.majorDebris[0]!, flat: true, sleeping: true }],
    };
    expect(impulseMajorShedDebris(flat, {
      isHost: true, expectedRevision: flat.revision, chunkId: 'chunk-west', source: 'player-contact',
      impulseQ: { xQ: 100, yQ: 0, zQ: 0 },
    }).reason).toBe('flat-contact-rejected');
    const shot = impulseMajorShedDebris(flat, {
      isHost: true, expectedRevision: flat.revision, chunkId: 'chunk-west', source: 'bullet',
      impulseQ: { xQ: 1_000, yQ: 200, zQ: 0 },
    });
    expect(shot.state.majorDebris[0]).toMatchObject({ sleeping: false, velocityQ: { xQ: 1_000, yQ: 200, zQ: 0 } });
  });

  it('hashes late-join state deterministically, rejects unknown keys, and resets by epoch', () => {
    const state = advanceShedDoor(interact(initial(), 10, 1).state, 25);
    const first = createWorldCollisionSnapshot('atomic-acres', 'atomic-static-v65', [state]);
    const second = createWorldCollisionSnapshot('atomic-acres', 'atomic-static-v65', [JSON.parse(JSON.stringify(state)) as ShedState]);
    expect(first.hash).toBe(second.hash);
    expect(isShedState(JSON.parse(JSON.stringify(state)))).toBe(true);
    expect(isShedState({ ...state, clientCanFracture: true })).toBe(false);
    expect(isShedState({
      ...state,
      surfaces: [{ ...state.surfaces[0], clientHole: true }, ...state.surfaces.slice(1)],
    })).toBe(false);

    const reset = resetShedState(state, 12, definition, placement);
    expect(reset).toMatchObject({ matchEpoch: 12, revision: 0, detachedChunkIds: [], majorDebris: [] });
    expect(reset.surfaces.every((surface) => surface.stage === 'intact')).toBe(true);
  });
});
