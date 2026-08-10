import { GUN_RANGE_TEST_BAY_CONTRACT, gunRangeTestBayRenderedDummyPose } from './gun-range-test-bay';

export type RiggedEvidenceCamera = Readonly<{
  id: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
}>;

const lookAtCamera = (
  id: string,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
): RiggedEvidenceCamera => {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const rawYaw = Math.atan2(-dx, -dz);
  return Object.freeze({
    id,
    position: Object.freeze([...position]) as readonly [number, number, number],
    target: Object.freeze([...target]) as readonly [number, number, number],
    yaw: Object.is(rawYaw, -Math.PI) ? Math.PI : rawYaw,
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    fov,
  });
};

const ATOMIC_PLAYER_POSITION = Object.freeze([0, 1.7, -24] as const);
const ATOMIC_BOT_POSITION = Object.freeze([0, 0, -18.8] as const);
const ATOMIC_TARGET = Object.freeze([0, 1.08, -18.8] as const);

const fixedDummyActors = Object.freeze(GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition, index) => {
  const pose = gunRangeTestBayRenderedDummyPose(definition, index, 0);
  return Object.freeze({
    id: definition.id,
    position: Object.freeze([pose.position.x, pose.position.y, pose.position.z] as const),
    yaw: pose.yawRadians,
  });
}));

const fixedDummyCameras = Object.freeze(fixedDummyActors.map((actor) => {
  const forwardX = -Math.sin(actor.yaw);
  const forwardZ = -Math.cos(actor.yaw);
  const position = Object.freeze([
    actor.position[0] + forwardX * 2.1,
    1.08,
    actor.position[2] + forwardZ * 2.1,
  ] as const);
  const target = Object.freeze([actor.position[0], 1.08, actor.position[2]] as const);
  return Object.freeze({
    actor,
    camera: lookAtCamera(`${actor.id}-fixed-front-close`, position, target, 58),
  });
}));

/**
 * Fixed QA evidence fixtures. These values deliberately do not auto-fit live
 * geometry: authored layout drift must fail the LOS/framing gate and require a
 * reviewed contract update.
 */
export const RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT = Object.freeze({
  schemaVersion: 1,
  contract: 'pass69-3-fixed-rigged-actor-los-fixtures-v1',
  los: Object.freeze({
    contract: 'actual-render-world-layout-occluder-multi-sentinel-los-v2',
    actorSelfOcclusionExcluded: true,
    sentinels: Object.freeze(['head', 'shoulder-left', 'shoulder-right', 'pelvis', 'wrist-left', 'wrist-right'] as const),
  }),
  presentation: Object.freeze({
    contract: 'capture-camera-committed-frame-v1',
    order: 'pause-final-submission-await-completion-then-compositor-v1',
    compositorBoundariesAfterCommit: 2,
    rendererCompletion: Object.freeze({
      webgl2: 'synchronous-render-return',
      webgpu: 'submission-sequence-covered-by-completion-frontier',
    }),
  }),
  atomic: Object.freeze({
    id: 'atomic-open-road-south-fixed-v1',
    playerPosition: ATOMIC_PLAYER_POSITION,
    playerYaw: Math.PI,
    botDistanceM: 5.2,
    expectedBotPosition: ATOMIC_BOT_POSITION,
    expectedBotYaw: 0,
    mediumCamera: lookAtCamera('atomic-open-road-medium', [0, 1.08, -23.2], ATOMIC_TARGET, 58),
    closeCamera: lookAtCamera('atomic-open-road-close', [0, 1.08, -20.8], ATOMIC_TARGET, 58),
  }),
  gunRange: Object.freeze({
    id: 'gun-range-open-bay-fixed-v1',
    fixedVisualTimeMs: 0,
    overviewCamera: lookAtCamera('gun-range-dummies-north-overview', [90, 4.5, -23], [70, 1.15, -1], 58),
    dummies: fixedDummyCameras,
  }),
});

export function fixedGunRangeDummyFixtureMatchesAuthoredMotion(): boolean {
  return RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.dummies.every(({ actor }, index) => {
    const definition = GUN_RANGE_TEST_BAY_CONTRACT.dummies[index];
    const pose = gunRangeTestBayRenderedDummyPose(
      definition,
      index,
      RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.fixedVisualTimeMs,
    );
    return actor.id === definition.id
      && Math.abs(actor.position[0] - pose.position.x) <= 1e-9
      && Math.abs(actor.position[1] - pose.position.y) <= 1e-9
      && Math.abs(actor.position[2] - pose.position.z) <= 1e-9
      && Math.abs(actor.yaw - pose.yawRadians) <= 1e-9;
  });
}
