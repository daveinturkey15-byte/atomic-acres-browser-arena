import { describe, expect, it } from 'vitest';
import { COMBATANT_HISTORY_LIMIT, recordCombatantPose, rewindCombatantPose, rewindCombatantPoseStrict, type CombatantPoseSample } from './lag-compensation';

function sample(at: number, x: number, stance: CombatantPoseSample['stance'] = 'stand'): CombatantPoseSample {
  return { at, x, y: 1.7, z: 0, yaw: 0, stance, continuity: 1 };
}

describe('bounded combatant pose rewind', () => {
  it('interpolates the target pose at the admitted shot time', () => {
    const history = [sample(1_000, 0), sample(1_100, 2, 'crouch')];
    expect(rewindCombatantPose(history, 1_050)).toMatchObject({ at: 1_050, x: 1, stance: 'crouch' });
  });

  it('rejects outside the retained window and bounds memory', () => {
    const history: CombatantPoseSample[] = [];
    for (let index = 0; index < 100; index += 1) recordCombatantPose(history, sample(index * 20, index));
    expect(history.length).toBeLessThanOrEqual(COMBATANT_HISTORY_LIMIT);
    expect(rewindCombatantPose(history, -1)).toBeNull();
    expect(rewindCombatantPose(history, 9_999)).toBeNull();
  });

  it('rejects interpolation across a spawn or reconnect continuity boundary', () => {
    const history = [sample(1_000, 0), { ...sample(1_100, 2), continuity: 2 }];
    expect(rewindCombatantPoseStrict(history, 1_050, 1).reason).toBe('continuity-mismatch');
  });

  it('ignores invalid and out-of-order samples', () => {
    const history = [sample(100, 1)];
    recordCombatantPose(history, sample(90, 2));
    recordCombatantPose(history, { ...sample(110, 3), x: Number.NaN });
    expect(history).toEqual([sample(100, 1)]);
  });
});
