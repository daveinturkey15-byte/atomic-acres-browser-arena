import { describe, expect, it } from 'vitest';
import { RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT, fixedGunRangeDummyFixtureMatchesAuthoredMotion } from './rigged-bot-visual-evidence-contract';

describe('fixed rigged actor visual evidence fixtures', () => {
  it('retains one immutable open-road Atomic staging line', () => {
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    expect(fixture).toMatchObject({
      id: 'atomic-open-road-south-fixed-v1',
      playerPosition: [0, 1.7, -24],
      playerYaw: Math.PI,
      botDistanceM: 5.2,
      expectedBotPosition: [0, 0, -18.8],
      expectedBotYaw: 0,
    });
    expect(fixture.mediumCamera.position).toEqual([0, 1.08, -23.2]);
    expect(fixture.closeCamera.position).toEqual([0, 1.08, -20.8]);
    expect(fixture.mediumCamera.target).toEqual(fixture.closeCamera.target);
    expect(fixture.mediumCamera.yaw).toBeCloseTo(Math.PI, 12);
    expect(fixture.closeCamera.yaw).toBeCloseTo(Math.PI, 12);
  });

  it('pins every dummy and camera to an authored time-zero front view', () => {
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange;
    expect(fixture.fixedVisualTimeMs).toBe(0);
    expect(fixedGunRangeDummyFixtureMatchesAuthoredMotion()).toBe(true);
    expect(fixture.dummies).toHaveLength(4);
    for (let index = 0; index < fixture.dummies.length; index += 1) {
      const { actor, camera } = fixture.dummies[index];
      expect(actor.position[1]).toBeCloseTo(Math.abs(Math.sin(index)) * 0.025, 12);
      const actorForward = [-Math.sin(actor.yaw), 0, -Math.cos(actor.yaw)];
      const actorToCamera = camera.position.map((value, axis) => value - actor.position[axis]);
      expect(actorToCamera[0]).toBeCloseTo(actorForward[0] * 2.1, 12);
      expect(actorToCamera[2]).toBeCloseTo(actorForward[2] * 2.1, 12);
      expect(camera.target).toEqual([actor.position[0], 1.08, actor.position[2]]);
    }
  });

  it('requires committed camera frames, compositor boundaries, and all six LOS sentinels', () => {
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation).toEqual({
      contract: 'capture-camera-committed-frame-v1',
      order: 'pause-final-submission-await-completion-then-compositor-v1',
      compositorBoundariesAfterCommit: 2,
      rendererCompletion: {
        webgl2: 'synchronous-render-return',
        webgpu: 'submission-sequence-covered-by-completion-frontier',
      },
    });
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.los.sentinels).toEqual([
      'head', 'shoulder-left', 'shoulder-right', 'pelvis', 'wrist-left', 'wrist-right',
    ]);
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.los.actorSelfOcclusionExcluded).toBe(true);
  });
});
