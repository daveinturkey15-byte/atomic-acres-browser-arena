import { describe, expect, it } from 'vitest';
import {
  MAX_AUTHORITATIVE_REWIND_MS,
  MAX_CLOCK_UNCERTAINTY_ALLOWANCE_MS,
  MAX_PROJECTILE_SHOT_FIRE_AGE_MS,
  admitAuthoritativeShot,
  canonicalShotDirection,
  createAuthoritativeShotAdmissionState,
  freezeAuthoredBulletRecord,
  freezeAuthoredShotTimeline,
  maximumShotFireAgeMs,
  validateShotOrigin,
  type AuthoritativeShotAdmissionContext,
} from './authoritative-shot';
import { MULTIPLAYER_PROTOCOL_VERSION, type PlayerSnapshot, type ShotRequestMessage } from './protocol';

const sender: PlayerSnapshot = {
  id: 'guest', name: 'Guest', team: 1, x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0, primary: 'sniper', secondary: 'machine-pistol', grenade: 'frag',
  weapon: 'machine-pistol', seq: 10,
};
const context = (overrides: Partial<AuthoritativeShotAdmissionContext> = {}): AuthoritativeShotAdmissionContext => ({
  expectedConnectionEpoch: 'connection-1',
  expectedLifeId: 4,
  clockUncertaintyMs: 0,
  shooterDiedAtHostTimeMs: null,
  hostTriggerState: null,
  ...overrides,
});
const request = (
  shotSeq: number,
  fireTimeMs: number,
  overrides: Partial<ShotRequestMessage> = {},
): ShotRequestMessage => ({
  type: 'shot-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: 'guest',
  shotId: `connection-1:${shotSeq}`, connectionEpoch: 'connection-1', lifeId: 4,
  shotSeq, weaponSequence: shotSeq, weapon: 'machine-pistol', fireTimeMs,
  targetViewTimeMs: fireTimeMs - 60, origin: [0, 1.7, 0], direction: [0, 0, -1],
  pelletDirections: [[0, 0, -1]], nonce: shotSeq + 1,
  ...overrides,
  triggerStartedAtMs: overrides.triggerStartedAtMs ?? fireTimeMs,
});

describe('host-authored bullet admission', () => {
  it('admits distinct 900 RPM bullets when reliable delivery bunches them', () => {
    let state = createAuthoritativeShotAdmissionState();
    const intervalMs = 60_000 / 900;
    for (let index = 0; index < 4; index += 1) {
      const result = admitAuthoritativeShot(request(index, 1_000 + index * intervalMs), sender, 1_250, state, context());
      expect(result.accepted, result.reason).toBe(true);
      expect(result.appliedRewindMs).toBeCloseTo(60, 6);
      state = result.state;
    }
    expect(state.highestShotSeq).toBe(3);
    expect(state.recentShots.map((shot) => shot.weaponSequence)).toEqual([0, 1, 2, 3]);
  });

  it('accepts bounded packet reordering while enforcing authored weapon cadence', () => {
    const intervalMs = 60_000 / 900;
    let state = createAuthoritativeShotAdmissionState();
    for (const index of [2, 0, 1]) {
      const result = admitAuthoritativeShot(request(index, 1_000 + index * intervalMs), sender, 1_220, state, context());
      expect(result.accepted, `${index}:${result.reason}`).toBe(true);
      state = result.state;
    }
    expect(admitAuthoritativeShot(request(3, 1_150), sender, 1_225, state, context()).reason).toBe('cadence');
    expect(admitAuthoritativeShot(request(1, 1_000 + intervalMs), sender, 1_225, state, context()).reason).toBe('duplicate');
  });

  it('rejects replay outside the retained exactly-once window', () => {
    let state = createAuthoritativeShotAdmissionState();
    for (let index = 0; index <= 64; index += 1) {
      const result = admitAuthoritativeShot(request(index, 1_000 + index * 70), sender, 1_000 + index * 70, state, context());
      expect(result.accepted, `${index}:${result.reason}`).toBe(true);
      state = result.state;
    }
    expect(admitAuthoritativeShot(request(0, 5_480), sender, 5_480, state, context()).reason).toBe('duplicate');
  });

  it('rejects genuinely stale fire time instead of transplanting it to the rewind ceiling', () => {
    const uncertain = context({ clockUncertaintyMs: 999 });
    const atAllowance = admitAuthoritativeShot(request(0, 1_000), sender, 1_000 + 250 + MAX_CLOCK_UNCERTAINTY_ALLOWANCE_MS,
      createAuthoritativeShotAdmissionState(), uncertain);
    expect(atAllowance.accepted, atAllowance.reason).toBe(true);
    expect(atAllowance.fireAgeMs).toBe(275);
    const stale = admitAuthoritativeShot(request(0, 1_000), sender, 1_276,
      createAuthoritativeShotAdmissionState(), uncertain);
    expect(stale).toMatchObject({ accepted: false, reason: 'stale', appliedRewindMs: 0 });
  });

  it('retains the hitscan ceiling while admitting projectiles only inside host muzzle history', () => {
    const crossbowSender: PlayerSnapshot = {
      ...sender,
      primary: 'sniper',
      secondary: 'explosive-crossbow',
      weapon: 'explosive-crossbow',
    };
    const projectile = request(0, 1_000, {
      weapon: 'explosive-crossbow',
      direction: [0, 0, -1],
      pelletDirections: [[0, 0, -1]],
    });
    expect(maximumShotFireAgeMs('machine-pistol')).toBe(250);
    expect(maximumShotFireAgeMs('explosive-crossbow')).toBe(MAX_PROJECTILE_SHOT_FIRE_AGE_MS);
    expect(admitAuthoritativeShot(
      projectile,
      crossbowSender,
      1_000 + MAX_PROJECTILE_SHOT_FIRE_AGE_MS,
      createAuthoritativeShotAdmissionState(),
      context(),
    ).accepted).toBe(true);
    expect(admitAuthoritativeShot(
      projectile,
      crossbowSender,
      1_001 + MAX_PROJECTILE_SHOT_FIRE_AGE_MS,
      createAuthoritativeShotAdmissionState(),
      context(),
    )).toMatchObject({ accepted: false, reason: 'stale' });
    expect(freezeAuthoredShotTimeline(2_000, 80, [], 'explosive-crossbow').maximumFireAgeMs)
      .toBe(MAX_PROJECTILE_SHOT_FIRE_AGE_MS);
  });

  it('treats 250 ms as the target-view hard ceiling and never clamps an invalid timeline', () => {
    const atCeiling = admitAuthoritativeShot(request(0, 1_000, { targetViewTimeMs: 750 }), sender, 1_100,
      createAuthoritativeShotAdmissionState(), context());
    expect(atCeiling.accepted, atCeiling.reason).toBe(true);
    expect(atCeiling.appliedRewindMs).toBe(MAX_AUTHORITATIVE_REWIND_MS);
    const beyond = admitAuthoritativeShot(request(0, 1_000, { targetViewTimeMs: 749 }), sender, 1_100,
      createAuthoritativeShotAdmissionState(), context());
    expect(beyond).toMatchObject({ accepted: false, reason: 'invalid-timeline', appliedRewindMs: 0 });
  });

  it('allows a legitimate pre-death trade but rejects bullets authored after authoritative death', () => {
    const beforeDeath = admitAuthoritativeShot(request(0, 1_099), sender, 1_150,
      createAuthoritativeShotAdmissionState(), context({ shooterDiedAtHostTimeMs: 1_100 }));
    expect(beforeDeath.accepted, beforeDeath.reason).toBe(true);
    const afterDeath = admitAuthoritativeShot(request(0, 1_101), sender, 1_150,
      createAuthoritativeShotAdmissionState(), context({ shooterDiedAtHostTimeMs: 1_100 }));
    expect(afterDeath.reason).toBe('shooter-dead');
  });

  it('isolates connection and life epochs', () => {
    expect(admitAuthoritativeShot(request(0, 1_000), sender, 1_100, createAuthoritativeShotAdmissionState(),
      context({ expectedConnectionEpoch: 'connection-2' })).reason).toBe('connection-epoch-mismatch');
    expect(admitAuthoritativeShot(request(0, 1_000), sender, 1_100, createAuthoritativeShotAdmissionState(),
      context({ expectedLifeId: 5 })).reason).toBe('life-mismatch');
  });

  it('enforces M134 spin-up from host receipt time and ignores a forged client hold age', () => {
    const minigunner: PlayerSnapshot = {
      ...sender,
      primary: 'minigun',
      secondary: 'pistol',
      weapon: 'minigun',
    };
    const forgedOldClientHold = request(0, 2_000, { weapon: 'minigun', triggerStartedAtMs: 0 });
    const lateHostPress = {
      connectionEpoch: 'connection-1', lifeId: 4, weapon: 'minigun' as const,
      pressed: true, pressedAtHostTimeMs: 1_900, highestActionSequence: 0,
    };
    expect(admitAuthoritativeShot(forgedOldClientHold, minigunner, 2_050, createAuthoritativeShotAdmissionState(),
      context({ hostTriggerState: lateHostPress })).reason)
      .toBe('spin-up');
    const hostReady = { ...lateHostPress, pressedAtHostTimeMs: 800 };
    const admitted = admitAuthoritativeShot(
      request(0, 2_000, { weapon: 'minigun', triggerStartedAtMs: 1_999 }),
      minigunner,
      2_050,
      createAuthoritativeShotAdmissionState(),
      context({ hostTriggerState: hostReady }),
    );
    expect(admitted.accepted, admitted.reason).toBe(true);
    expect(admitAuthoritativeShot(
      request(0, 2_000, { weapon: 'minigun', triggerStartedAtMs: 0 }),
      minigunner,
      2_050,
      createAuthoritativeShotAdmissionState(),
      context({ hostTriggerState: { ...hostReady, pressed: false, pressedAtHostTimeMs: null } }),
    ).reason).toBe('spin-up');
  });

  it('uses the first authored projectile ray as the canonical crossbow direction', () => {
    const base: [number, number, number] = [0, 0, -1];
    const spreadRay: [number, number, number] = [0.08, 0, -0.9967948636];
    expect(canonicalShotDirection('explosive-crossbow', base, [spreadRay])).toBe(spreadRay);
    expect(canonicalShotDirection('machine-pistol', base, [spreadRay])).toBe(base);
  });

  it('freezes immutable fire and target-view times before hit or miss evaluation', () => {
    const hit = freezeAuthoredShotTimeline(2_000, 80, [1_920]);
    const miss = freezeAuthoredShotTimeline(2_000, 80);
    expect(hit).toMatchObject({ fireTimeMs: 2_000, targetViewTimeMs: 1_920, targetViewDelayMs: 80 });
    expect(miss.targetViewTimeMs).toBe(hit.targetViewTimeMs);
    const bullet = freezeAuthoredBulletRecord(request(0, hit.fireTimeMs, { targetViewTimeMs: hit.targetViewTimeMs }));
    expect(Object.isFrozen(bullet)).toBe(true);
    expect(Object.isFrozen(bullet.origin)).toBe(true);
    expect(Object.isFrozen(bullet.pelletDirections)).toBe(true);
  });

  it('keeps one target-view time for pellets despite differing presented buffer ages', () => {
    const timeline = freezeAuthoredShotTimeline(2_000, 80, [1_920, 1_870, 1_950]);
    expect(timeline.targetViewTimeMs).toBe(1_920);
    expect(timeline.presentedTargetCount).toBe(3);
    expect(timeline.presentedTargetAgeSpreadMs).toBe(80);
  });

  it('validates the predicted muzzle against the shooter pose at fire time', () => {
    const pose = { at: 1_000, x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const, continuity: 4 };
    expect(validateShotOrigin(request(0, 1_000), pose)).toBe(true);
    expect(validateShotOrigin(request(0, 1_000, { origin: [10, 1.7, 0] }), pose)).toBe(false);
  });
});
