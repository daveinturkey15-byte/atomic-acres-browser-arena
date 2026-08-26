import { describe, expect, it } from 'vitest';
import {
  SHED_MAX_MAJOR_CHUNKS,
  applyShedStructuralBlast,
  createInitialShedState,
  isShedState,
  type ShedPlacement,
} from './destructible-world';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';
import { InteractiveWorldRuntime } from './interactive-world-runtime';

const placement: ShedPlacement = Object.freeze({
  id: 'shed-structural-test',
  definitionId: FIELD_SHED_DEFINITION.id,
  arenaId: 'atomic-acres',
  zone: 'whole-arena',
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
});

describe('shed structural blast authority', () => {
  it('makes one grenade a single-revision major collapse with bounded persistent debris', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 5);
    const result = applyShedStructuralBlast(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 5,
      expectedRevision: 0,
      blastId: 'grenade-5-1',
      blastClass: 'grenade-major-collapse',
      originLocal: { x: 0, y: 1.1, z: 2.1 },
    });
    expect(result).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(result.state.revision).toBe(1);
    expect(result.state.detachedChunkIds).toHaveLength(3);
    expect(result.state.majorDebris).toHaveLength(3);
    expect(result.state.majorDebris.every((body) => !body.sleeping)).toBe(true);
    expect(result.state.surfaces.every((surface) => surface.stage === 'detached' || surface.healthQ > 0)).toBe(true);
    expect(isShedState(result.state)).toBe(true);
  });

  it('lets Carpet Bomber obliterate the shell while retaining only six authored bodies', () => {
    const initial = createInitialShedState(FIELD_SHED_DEFINITION, placement, 6);
    const result = applyShedStructuralBlast(FIELD_SHED_DEFINITION, initial, {
      isHost: true,
      matchEpoch: 6,
      expectedRevision: 0,
      blastId: 'carpet-6-1',
      blastClass: 'carpet-bomber-obliteration',
      originLocal: { x: 0, y: 1.5, z: 0 },
    });
    expect(result.accepted).toBe(true);
    expect(result.state.surfaces.every((surface) => surface.stage === 'detached')).toBe(true);
    expect(result.state.detachedChunkIds).toHaveLength(SHED_MAX_MAJOR_CHUNKS);
    expect(result.state.majorDebris).toHaveLength(SHED_MAX_MAJOR_CHUNKS);
    expect(result.state.door).toMatchObject({ phase: 'open', direction: 'stationary' });
    expect(isShedState(result.state)).toBe(true);
    expect(applyShedStructuralBlast(FIELD_SHED_DEFINITION, result.state, {
      isHost: true,
      matchEpoch: 6,
      expectedRevision: result.state.revision,
      blastId: 'carpet-6-2',
      blastClass: 'carpet-bomber-obliteration',
      originLocal: { x: 0, y: 1.5, z: 0 },
    })).toMatchObject({ accepted: false, reason: 'already-detached', state: result.state });
  });

  it('rejects replica, stale epoch and stale revision mutations', () => {
    const state = createInitialShedState(FIELD_SHED_DEFINITION, placement, 7);
    const request = {
      matchEpoch: 7, expectedRevision: 0, blastId: 'grenade-7-1',
      blastClass: 'grenade-major-collapse' as const, originLocal: { x: 0, y: 1, z: 0 },
    };
    expect(applyShedStructuralBlast(FIELD_SHED_DEFINITION, state, { ...request, isHost: false }).reason).toBe('not-host');
    expect(applyShedStructuralBlast(FIELD_SHED_DEFINITION, state, { ...request, isHost: true, matchEpoch: 6 }).reason).toBe('stale-epoch');
    expect(applyShedStructuralBlast(FIELD_SHED_DEFINITION, state, { ...request, isHost: true, expectedRevision: 1 }).reason).toBe('stale-revision');
  });

  it('publishes the atomic collapse into movement, ballistics and late-join envelope parity', () => {
    const host = new InteractiveWorldRuntime('atomic-acres', 11, [placement], true);
    const replica = new InteractiveWorldRuntime('atomic-acres', 11, [placement], false);
    expect(host.applyExplosionAt({
      origin: { x: 0, y: 1.1, z: 2.1 }, radius: 4.5, maximumDamageQ: 100,
      shedMaximumDamageQ: 500, shedBlastClass: 'grenade-major-collapse',
    })).toBe(1);
    const hostEnvelope = host.stateEnvelope();
    expect(hostEnvelope.sheds[0].detachedChunkIds).toHaveLength(3);
    expect(replica.applyAuthoritativeEnvelope(hostEnvelope)).toBe(true);
    expect(replica.stateEnvelope()).toEqual(hostEnvelope);
    expect(replica.collisions().movementColliders).toHaveLength(host.collisions().movementColliders.length);
    expect(replica.collisions().ballisticSurfaces).toHaveLength(host.collisions().ballisticSurfaces.length);
    host.dispose();
    replica.dispose();
  });
});
