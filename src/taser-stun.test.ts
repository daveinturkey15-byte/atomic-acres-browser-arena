import { describe, expect, it } from 'vitest';
import {
  PILOTED_DRONE_TASER_CHARGES,
  PILOTED_DRONE_TASER_COOLDOWN_MS,
  PILOTED_DRONE_TASER_RANGE_M,
  TASER_STUN_DURATION_MS,
  TASER_STUN_MAX_DURATION_MS,
} from './killstreak-tuning';
import {
  TASER_AUTHORITY_SCHEMA_VERSION,
  TaserHostAuthority,
  TaserVictimResultConsumer,
  admitTaserShot,
  initialTaserChargeState,
  isTaserStunResult,
  selectAutoTaserTarget,
  taserActivationId,
  taserMovementAdmission,
  type TaserStunResult,
} from './taser-stun';
import { isTaserStunMessage, type TaserStunMessage } from './taser-protocol';
import { isGameMessage, isHostAuthorityMessage, messageBelongsToPlayer } from './protocol';

const at = (x: number, y = 0, z = 0) => [x, y, z] as const;

describe('HF-458 Piloted Drone taser charges and cooldown', () => {
  it('spends exactly three charges and then refuses', () => {
    let state = initialTaserChargeState(0);
    expect(state.charges).toBe(PILOTED_DRONE_TASER_CHARGES);
    let now = 0;
    for (let shot = 0; shot < PILOTED_DRONE_TASER_CHARGES; shot += 1) {
      const admission = admitTaserShot({ state, nowMs: now, hasTarget: true });
      expect(admission).toMatchObject({ accepted: true, reason: 'accepted' });
      expect(admission.state.charges).toBe(PILOTED_DRONE_TASER_CHARGES - shot - 1);
      expect(admission.state.nextTaserAtMs).toBe(now + PILOTED_DRONE_TASER_COOLDOWN_MS);
      state = admission.state;
      now += PILOTED_DRONE_TASER_COOLDOWN_MS;
    }
    expect(state.charges).toBe(0);
    const empty = admitTaserShot({ state, nowMs: now, hasTarget: true });
    expect(empty).toMatchObject({ accepted: false, reason: 'no-charges' });
    expect(empty.state.charges).toBe(0);
  });

  it('refuses inside the cooldown and with no target, without consuming a charge', () => {
    const first = admitTaserShot({ state: initialTaserChargeState(1_000), nowMs: 1_000, hasTarget: true });
    expect(first.accepted).toBe(true);
    const early = admitTaserShot({ state: first.state, nowMs: 1_000 + PILOTED_DRONE_TASER_COOLDOWN_MS - 1, hasTarget: true });
    expect(early).toMatchObject({ accepted: false, reason: 'cooling-down' });
    expect(early.state.charges).toBe(first.state.charges);
    const blind = admitTaserShot({ state: first.state, nowMs: 1_000 + PILOTED_DRONE_TASER_COOLDOWN_MS, hasTarget: false });
    expect(blind).toMatchObject({ accepted: false, reason: 'no-target' });
    expect(blind.state.charges).toBe(first.state.charges);
    const ready = admitTaserShot({ state: first.state, nowMs: 1_000 + PILOTED_DRONE_TASER_COOLDOWN_MS, hasTarget: true });
    expect(ready.accepted).toBe(true);
  });
});

describe('HF-458 taser auto-fire targeting', () => {
  const candidates = [
    { id: 'far', position: at(PILOTED_DRONE_TASER_RANGE_M + 5) },
    { id: 'near', position: at(6) },
    { id: 'mid', position: at(12) },
  ];

  it('picks the nearest hostile in range with line of sight when unpiloted', () => {
    const picked = selectAutoTaserTarget({
      piloted: false,
      origin: at(0),
      candidates,
      hasLineOfSight: () => true,
    });
    expect(picked?.id).toBe('near');
  });

  it('skips a target it cannot see and falls through to the next one', () => {
    const picked = selectAutoTaserTarget({
      piloted: false,
      origin: at(0),
      candidates,
      hasLineOfSight: (_from, to) => to[0] !== 6,
    });
    expect(picked?.id).toBe('mid');
  });

  it('never auto-fires while a human is piloting, and never past the taser range', () => {
    expect(selectAutoTaserTarget({
      piloted: true, origin: at(0), candidates, hasLineOfSight: () => true,
    })).toBeNull();
    expect(selectAutoTaserTarget({
      piloted: false,
      origin: at(0),
      candidates: [candidates[0]!],
      hasLineOfSight: () => true,
    })).toBeNull();
  });
});

describe('HF-458 taser stun blocks movement then releases', () => {
  it('zeroes movement, sprint and jump for the stun and frees them after', () => {
    const startsAt = 5_000;
    const endsAt = startsAt + TASER_STUN_DURATION_MS;
    const onset = taserMovementAdmission(endsAt, startsAt, startsAt);
    expect(onset).toMatchObject({ stunned: true, canMove: false, canSprint: false, canJump: false });
    expect(onset.remainingMs).toBe(TASER_STUN_DURATION_MS);
    expect(onset.intensity).toBeCloseTo(1, 6);

    const mid = taserMovementAdmission(endsAt, startsAt + 500, startsAt);
    expect(mid.stunned).toBe(true);
    expect(mid.canMove).toBe(false);
    expect(mid.intensity).toBeCloseTo(0.5, 6);

    const lastTick = taserMovementAdmission(endsAt, endsAt - 1, startsAt);
    expect(lastTick.canMove).toBe(false);

    const released = taserMovementAdmission(endsAt, endsAt, startsAt);
    expect(released).toMatchObject({ stunned: false, canMove: true, canSprint: true, canJump: true, remainingMs: 0 });
    expect(taserMovementAdmission(endsAt, endsAt + 10_000, startsAt).canMove).toBe(true);
  });

  it('treats a missing or nonsense stun window as no stun at all', () => {
    expect(taserMovementAdmission(Number.NaN, 1_000).canMove).toBe(true);
    expect(taserMovementAdmission(0, 0).canMove).toBe(true);
  });
});

describe('HF-458 taser host authority and replication', () => {
  const activationId = taserActivationId(7, 'owner', 42);

  function resolveOne(host: TaserHostAuthority, id = activationId, startsAt = 10_000) {
    return host.resolveStun({
      matchEpoch: 7,
      activationId: id,
      startsAtHostTimeMs: startsAt,
      victims: [{ targetId: 'victim', targetLifeId: 3, durationMs: TASER_STUN_DURATION_MS }],
    });
  }

  it('authors a stun on the host, refuses one on a replica, and never replays an activation', () => {
    const host = new TaserHostAuthority(7, 'host');
    const accepted = resolveOne(host);
    expect(accepted.accepted).toBe(true);
    const result = accepted.results[0]!;
    expect(isTaserStunResult(result)).toBe(true);
    expect(result.endsAtHostTimeMs - result.startsAtHostTimeMs).toBe(TASER_STUN_DURATION_MS);
    expect(resolveOne(host)).toMatchObject({ accepted: false, reason: 'replay' });
    expect(host.resolveStun({
      matchEpoch: 8, activationId: `${activationId}-b`, startsAtHostTimeMs: 1, victims: [],
    })).toMatchObject({ accepted: false, reason: 'wrong-epoch' });

    const replica = new TaserHostAuthority(7, 'replica');
    expect(resolveOne(replica)).toMatchObject({ accepted: false, reason: 'not-host' });
  });

  it('clamps an over-long stun rather than trusting the caller', () => {
    const host = new TaserHostAuthority(7, 'host');
    expect(host.resolveStun({
      matchEpoch: 7,
      activationId: `${activationId}-long`,
      startsAtHostTimeMs: 0,
      victims: [{ targetId: 'victim', targetLifeId: 3, durationMs: TASER_STUN_MAX_DURATION_MS + 1 }],
    })).toMatchObject({ accepted: false, reason: 'malformed' });
  });

  it('admits an authored result on the victim exactly once, in order, for the right life', () => {
    const host = new TaserHostAuthority(7, 'host');
    const result = resolveOne(host).results[0]!;
    const victim = new TaserVictimResultConsumer(7, 'victim', 3);
    expect(victim.admit(result, 10_000)).toMatchObject({ accepted: true, remainingDurationMs: TASER_STUN_DURATION_MS });
    expect(victim.admit(result, 10_000)).toMatchObject({ accepted: false, reason: 'duplicate' });

    const other = new TaserVictimResultConsumer(7, 'someone-else', 3);
    expect(other.admit(result, 10_000)).toMatchObject({ accepted: false, reason: 'wrong-target' });
    const staleLife = new TaserVictimResultConsumer(7, 'victim', 4);
    expect(staleLife.admit(result, 10_000)).toMatchObject({ accepted: false, reason: 'stale-life' });
    const wrongEpoch = new TaserVictimResultConsumer(9, 'victim', 3);
    expect(wrongEpoch.admit(result, 10_000)).toMatchObject({ accepted: false, reason: 'wrong-epoch' });
    const late = new TaserVictimResultConsumer(7, 'victim', 3);
    expect(late.admit(result, 10_000 + TASER_STUN_DURATION_MS)).toMatchObject({ accepted: false, reason: 'expired' });
  });

  it('carries the stun on the wire as a host-authored message a guest can never mint', () => {
    const host = new TaserHostAuthority(7, 'host');
    const result = resolveOne(host).results[0]!;
    const message: TaserStunMessage = {
      type: 'taser-stun',
      schemaVersion: TASER_AUTHORITY_SCHEMA_VERSION,
      by: 'host',
      forPlayerId: 'victim',
      result,
      nonce: 11,
    };
    expect(isTaserStunMessage(structuredClone(message))).toBe(true);
    expect(isGameMessage(structuredClone(message))).toBe(true);
    expect(isHostAuthorityMessage(message)).toBe(true);
    expect(messageBelongsToPlayer(message, 'host')).toBe(true);
    expect(messageBelongsToPlayer(message, 'victim')).toBe(false);
    // Recipient and result target must agree, and the result must validate.
    expect(isTaserStunMessage({ ...message, forPlayerId: 'someone-else' })).toBe(false);
    expect(isTaserStunMessage({ ...message, result: { ...result, sequence: 0 } as unknown as TaserStunResult })).toBe(false);
    expect(isTaserStunMessage({ ...message, schemaVersion: 2 })).toBe(false);
  });
});
