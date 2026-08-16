import { describe, expect, it } from 'vitest';
import {
  CHOPPER_GUNNER_QA_AIM_MAX_WINDOW_MS,
  chopperGunnerQaAimReceipt,
  chopperGunnerQaAimThrottleEvidence,
  createChopperGunnerQaAimRequest,
  resolveChopperGunnerQaAim,
  type ChopperGunnerQaAimAdmission,
  type ChopperGunnerQaAimEntity,
  type ChopperGunnerQaAimRequest,
} from './chopper-gunner-qa-aim';
import {
  chopperGunnerCameraOrigin,
  type KillstreakWorld,
  type SupportVec3,
} from './killstreak-runtime';

const ownerId = 'owner';
const targetId = 'target';
const ownerLifeId = 7;
const targetLifeId = 11;

function entity(position: SupportVec3 = [0, 10, 0]): ChopperGunnerQaAimEntity {
  return Object.freeze({
    id: 'chopper-1',
    activationId: 'activation-1',
    ownerId,
    kind: 'chopper' as const,
    gunController: 'owner-player' as const,
    expiresInMs: 5_000,
    revision: 4,
    position: Object.freeze([...position]) as unknown as SupportVec3,
    attitude: Object.freeze([0, 0, 0]) as SupportVec3,
  });
}

function targetPosition(source = entity(), distanceM = 24): SupportVec3 {
  const origin = chopperGunnerCameraOrigin(source.position, source.attitude);
  return Object.freeze([origin[0], origin[1], origin[2] - distanceM] as const);
}

function world(
  source = entity(),
  overrides: Partial<KillstreakWorld> = {},
): KillstreakWorld {
  return Object.freeze({
    bounds: Object.freeze({ minX: -100, maxX: 100, minZ: -100, maxZ: 100, floorY: 0, ceilingY: 40 }),
    targets: Object.freeze([Object.freeze({
      id: targetId,
      kind: 'bot' as const,
      team: 1 as const,
      lifeId: targetLifeId,
      alive: true,
      position: targetPosition(source),
    })]),
    hasLineOfSight: () => true,
    ...overrides,
  });
}

function request(overrides: Partial<ChopperGunnerQaAimRequest> = {}): ChopperGunnerQaAimRequest {
  const value = createChopperGunnerQaAimRequest({
    entityId: 'chopper-1',
    activationId: 'activation-1',
    ownerLifeId,
    targetId,
    targetLifeId,
    triggerEdgeSequence: 3,
    trustedEventTimestampMs: 100,
    armedAtMs: 100,
    deadlineAtMs: 100 + CHOPPER_GUNNER_QA_AIM_MAX_WINDOW_MS,
    ...overrides,
  });
  if (!value) throw new Error('test request was rejected');
  return value;
}

function resolve(
  aimRequest = request(),
  overrides: Partial<Parameters<typeof resolveChopperGunnerQaAim>[1]> = {},
) {
  const currentEntity = overrides.entity === undefined ? entity() : overrides.entity;
  return resolveChopperGunnerQaAim(aimRequest, {
    nowMs: 150,
    triggerHeld: true,
    triggerEdgeSequence: 3,
    entity: currentEntity,
    ownerId,
    ownerLifeId,
    ownerTeam: 0,
    world: world(currentEntity ?? entity()),
    ...overrides,
  });
}

describe('bounded trusted Chopper MG QA aim', () => {
  it('accepts only an exact positive 2500ms-or-shorter identity-bound request', () => {
    expect(request()).toMatchObject({ deadlineAtMs: 2_600, triggerEdgeSequence: 3 });
    expect(createChopperGunnerQaAimRequest({
      ...request(),
      deadlineAtMs: 2_600.001,
    })).toBeNull();
    expect(createChopperGunnerQaAimRequest({ ...request(), targetLifeId: -1 })).toBeNull();
    expect(createChopperGunnerQaAimRequest({ ...request(), triggerEdgeSequence: 0 })).toBeNull();
    expect(createChopperGunnerQaAimRequest({ ...request(), trustedEventTimestampMs: 100.001 })).toBeNull();
  });

  it('uses the just-refreshed Chopper pose for the actual gun origin and solution', () => {
    const moved = entity([8, 12, -4]);
    const movedWorld = world(moved);
    const result = resolve(request(), { entity: moved, world: movedWorld });
    expect(result.status).toBe('aligned');
    if (result.status !== 'aligned') return;
    expect(result.alignment.entityPosition).toEqual([8, 12, -4]);
    expect(result.alignment.ray.origin).toEqual(chopperGunnerCameraOrigin(moved.position, moved.attitude));
    expect(result.alignment.ray.origin).not.toEqual(chopperGunnerCameraOrigin(entity().position, entity().attitude));
    expect(result.alignment.radialDistanceM).toBeLessThanOrEqual(result.alignment.splashRadiusM);
    expect(result.alignment.entryDistanceM).toBeLessThanOrEqual(result.alignment.maximumRangeM);
  });

  it.each([
    ['released trigger', { triggerHeld: false }, 'trigger-released'],
    ['different edge', { triggerEdgeSequence: 4 }, 'trigger-edge-changed'],
    ['different owner life', { ownerLifeId: 8 }, 'owner-life-changed'],
    ['different entity', { entity: Object.freeze({ ...entity(), id: 'other' }) }, 'entity-identity-changed'],
    ['different activation', { entity: Object.freeze({ ...entity(), activationId: 'other' }) }, 'entity-identity-changed'],
    ['wrong kind', { entity: Object.freeze({ ...entity(), kind: 'drone' as const }) }, 'entity-identity-changed'],
    ['AI gun controller', { entity: Object.freeze({ ...entity(), gunController: 'ai' as const }) }, 'entity-identity-changed'],
    ['expired entity', { entity: Object.freeze({ ...entity(), expiresInMs: 0 }) }, 'entity-expired'],
  ])('clears on %s', (_label, overrides, expectedReason) => {
    expect(resolve(request(), overrides)).toEqual({ status: 'clear', reason: expectedReason });
  });

  it('admits the exact deadline and clears immediately after it', () => {
    expect(resolve(request(), { nowMs: 2_600 }).status).toBe('aligned');
    expect(resolve(request(), { nowMs: 2_600.001 })).toEqual({
      status: 'clear',
      reason: 'deadline-expired',
    });
  });

  it('clears on target death or life replacement', () => {
    const base = world();
    expect(resolve(request(), {
      world: Object.freeze({
        ...base,
        targets: Object.freeze([Object.freeze({ ...base.targets[0]!, alive: false })]),
      }),
    })).toEqual({ status: 'clear', reason: 'target-unavailable' });
    expect(resolve(request(), {
      world: Object.freeze({
        ...base,
        targets: Object.freeze([Object.freeze({ ...base.targets[0]!, lifeId: targetLifeId + 1 })]),
      }),
    })).toEqual({ status: 'clear', reason: 'target-life-changed' });
  });

  it('rejects real cover and a different deterministic primary', () => {
    expect(resolve(request(), { world: world(entity(), { hasLineOfSight: () => false }) })).toEqual({
      status: 'clear',
      reason: 'covered-or-out-of-range',
    });
    const source = entity();
    const origin = chopperGunnerCameraOrigin(source.position, source.attitude);
    const coveredByOther: KillstreakWorld = Object.freeze({
      ...world(source),
      targets: Object.freeze([
        ...world(source).targets,
        Object.freeze({
          id: 'nearer-target',
          kind: 'bot' as const,
          team: 1 as const,
          lifeId: 2,
          alive: true,
          position: Object.freeze([origin[0], origin[1], origin[2] - 8] as const),
        }),
      ]),
    });
    expect(resolve(request(), { entity: source, world: coveredByOther })).toEqual({
      status: 'clear',
      reason: 'other-target-selected',
    });
  });

  it('never authors fire or damage and requires accepted native held-fire admission for evidence', () => {
    const currentEntity = entity();
    const currentWorld = world(currentEntity);
    const before = JSON.stringify({ currentEntity, currentWorld });
    const result = resolve(request(), { entity: currentEntity, world: currentWorld });
    expect(JSON.stringify({ currentEntity, currentWorld })).toBe(before);
    expect(result.status).toBe('aligned');
    if (result.status !== 'aligned') return;
    const admission: ChopperGunnerQaAimAdmission = Object.freeze({
      atMs: 150,
      entityId: 'chopper-1',
      action: 'pilot-control',
      sequence: 9,
      yawQ: result.alignment.yaw,
      pitchQ: result.alignment.pitch,
      fire: true,
      missileFire: false,
      accepted: true,
      reason: 'accepted',
    });
    const throttle = chopperGunnerQaAimThrottleEvidence(150, 100);
    const receipt = chopperGunnerQaAimReceipt(request(), result.alignment, admission, 150, throttle);
    expect(receipt).toMatchObject({
      controlSequence: 9,
      controlAction: 'pilot-control',
      controlReason: 'accepted',
      missileFire: false,
      fireAuthority: 'native-trigger-held',
      triggerHeld: true,
      controlAccepted: true,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt?.origin)).toBe(true);
    expect(chopperGunnerQaAimReceipt(
      request(),
      result.alignment,
      Object.freeze({ ...admission, fire: false }),
      150,
      throttle,
    )).toBeNull();
    expect(chopperGunnerQaAimReceipt(
      request(),
      result.alignment,
      Object.freeze({ ...admission, missileFire: true }),
      150,
      throttle,
    )).toBeNull();
    expect(chopperGunnerQaAimReceipt(
      request(),
      result.alignment,
      Object.freeze({ ...admission, action: 'missile-fire' }),
      150,
      throttle,
    )).toBeNull();
  });

  it('proves the exact 49.999ms/50ms pilot-control throttle boundary', () => {
    expect(chopperGunnerQaAimThrottleEvidence(149.999, 100)).toEqual({
      eligible: false,
      previousControlSentAtMs: 100,
      minimumEligibleAtMs: 150,
    });
    expect(chopperGunnerQaAimThrottleEvidence(150, 100)).toEqual({
      eligible: true,
      previousControlSentAtMs: 100,
      minimumEligibleAtMs: 150,
    });
  });
});
