import { describe, expect, it } from 'vitest';
import { rewindCombatantPoseStrict, type CombatantPoseSample } from './lag-compensation';
import { deriveAuthoritativeShotOutcomes } from './remote-hit-admission';

function pose(at: number, x: number, z: number, continuity = 1): CombatantPoseSample {
  return { at, x, y: 1.7, z, yaw: 0, stance: 'stand', continuity };
}

function rayHits(shooter: CombatantPoseSample, target: CombatantPoseSample): boolean {
  return deriveAuthoritativeShotOutcomes(
    'carbine',
    [shooter.x, shooter.y, shooter.z],
    [[0, 0, -1]],
    [{ id: 'target', x: target.x, y: target.y, z: target.z, yaw: target.yaw, stance: target.stance }],
  ).has('target');
}

describe('authored two-time shot resolution', () => {
  it('reconstructs the shooter at fire time and the target at target-view time', () => {
    const shooterHistory = [pose(1_880, 0, 0), pose(2_000, 2, 0)];
    const targetHistory = [pose(1_880, 2, -10), pose(2_000, 6, -10)];
    const shooterAtFire = rewindCombatantPoseStrict(shooterHistory, 2_000, 1).pose!;
    const targetAsSeen = rewindCombatantPoseStrict(targetHistory, 1_880, 1).pose!;
    const shooterAtTargetView = rewindCombatantPoseStrict(shooterHistory, 1_880, 1).pose!;

    expect(rayHits(shooterAtFire, targetAsSeen)).toBe(true);
    expect(rayHits(shooterAtTargetView, targetAsSeen)).toBe(false);
  });

  it.each([50, 120])('tracks a moving target at %i ms target-view delay', (delayMs) => {
    const fireTimeMs = 2_000;
    const targetViewTimeMs = fireTimeMs - delayMs;
    const shooter = pose(fireTimeMs, 0, 0);
    const targetHistory = [pose(targetViewTimeMs, 0, -10), pose(fireTimeMs, 4, -10)];
    const targetAsSeen = rewindCombatantPoseStrict(targetHistory, targetViewTimeMs, 1).pose!;
    const targetNow = rewindCombatantPoseStrict(targetHistory, fireTimeMs, 1).pose!;

    expect(rayHits(shooter, targetAsSeen)).toBe(true);
    expect(rayHits(shooter, targetNow)).toBe(false);
  });

  it('resolves the visible pose before a target crosses behind cover, without transplanting the shot', () => {
    const shooter = pose(3_000, 0, 0);
    const history = [pose(2_900, 0, -12), pose(3_000, 5, -12)];
    const visiblePose = rewindCombatantPoseStrict(history, 2_900, 1).pose!;
    const coveredPose = rewindCombatantPoseStrict(history, 3_000, 1).pose!;

    expect(rayHits(shooter, visiblePose)).toBe(true);
    expect(rayHits(shooter, coveredPose)).toBe(false);
  });

  it('refuses a target lookup across a respawn, teleport or reconnect boundary', () => {
    const discontinuous = [pose(1_000, 0, -10, 4), pose(1_100, 0, -10, 5)];
    expect(rewindCombatantPoseStrict(discontinuous, 1_050, 4)).toMatchObject({
      pose: null,
      reason: 'continuity-mismatch',
    });
  });
});
