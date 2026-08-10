import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isBlocked } from './collision';
import { SPAWN_LAYOUT } from './arena-layout';
import { SIMULATION_HZ } from './gameplay';
import { buildArena } from './map';
import { CharacterPhysics } from './physics';
import { RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT, fixedGunRangeDummyFixtureMatchesAuthoredMotion } from './rigged-bot-visual-evidence-contract';

describe('fixed rigged actor visual evidence fixtures', () => {
  it('retains one immutable open-road Atomic staging line', () => {
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    expect(fixture).toMatchObject({
      id: 'atomic-south-road-crosslane-spawn-fixed-v2',
      commandedPlayerPosition: [-3, 1.7, 40],
      expectedSettledPlayerPosition: [-3, 1.6984, 40],
      playerYaw: -Math.PI / 2,
      botDistanceM: 5.2,
      expectedBotPosition: [2.2, 0, 40],
      expectedBotYaw: Math.PI / 2,
    });
    expect(fixture.settlement).toEqual({
      contract: 'grounded-distinct-presented-frame-convergence-v2',
      minimumObservedTransitions: 8,
      minimumDurationMs: 50,
      maximumAxisDeltaM: 0.0005,
      maximumFinalAxisErrorM: 0.0005,
      groundedRequired: true,
    });
    expect(fixture.mediumCamera.position).toEqual([-2.2, 1.08, 40]);
    expect(fixture.closeCamera.position).toEqual([0.2, 1.08, 40]);
    expect(fixture.mediumCamera.target).toEqual(fixture.closeCamera.target);
    expect(fixture.mediumCamera.yaw).toBeCloseTo(-Math.PI / 2, 12);
    expect(fixture.closeCamera.yaw).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('falsifies the retired ramp point and keeps the v2 player/bot line clear at player radius', () => {
    const map = buildArena(new THREE.Scene());
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    expect(SPAWN_LAYOUT[1]).toContainEqual([
      fixture.commandedPlayerPosition[0], fixture.commandedPlayerPosition[2],
    ]);
    expect(isBlocked({ x: 0, y: 1.7, z: -24 }, map.physicsColliders, 0.42)).toBe(true);
    expect(isBlocked({
      x: fixture.commandedPlayerPosition[0],
      y: fixture.commandedPlayerPosition[1],
      z: fixture.commandedPlayerPosition[2],
    }, map.physicsColliders, 0.42)).toBe(false);
    expect(isBlocked({
      x: fixture.expectedBotPosition[0],
      y: fixture.expectedBotPosition[1] + 1.7,
      z: fixture.expectedBotPosition[2],
    }, map.physicsColliders, 0.42)).toBe(false);
  });

  it('settles through the real game-order Rapier controller inside the fixed 0.0005m envelope', async () => {
    const map = buildArena(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    try {
      physics.teleportEye({
        x: fixture.commandedPlayerPosition[0],
        y: fixture.commandedPlayerPosition[1],
        z: fixture.commandedPlayerPosition[2],
      });
      let grounded = false;
      let verticalVelocity = 0;
      const step = 1 / SIMULATION_HZ;
      for (let frame = 0; frame < 32; frame += 1) {
        verticalVelocity -= 24.5 * step;
        if (grounded) verticalVelocity = Math.max(0, verticalVelocity);
        const movement = physics.move({ x: 0, y: verticalVelocity * step, z: 0 }, step);
        grounded = movement.grounded;
        if (movement.blockedY && verticalVelocity < 0) verticalVelocity = 0;
      }
      const settled = physics.eyePosition();
      expect(grounded).toBe(true);
      expect(Math.abs(settled.x - fixture.expectedSettledPlayerPosition[0])).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(settled.y - fixture.expectedSettledPlayerPosition[1])).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(settled.z - fixture.expectedSettledPlayerPosition[2])).toBeLessThanOrEqual(0.0005);
    } finally {
      physics.dispose();
    }
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
