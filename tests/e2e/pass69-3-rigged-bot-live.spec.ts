import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';
import {
  RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT,
  waitForAtomicPlayerConvergenceInPage,
  type AtomicPlayerConvergence,
  type RiggedEvidenceCamera,
} from '../../src/rigged-bot-visual-evidence-contract';
import { deriveRiggedHandCamera, RIGGED_HAND_CAMERA_CONTRACT } from '../../src/rigged-hand-evidence';

type Renderer = 'webgl2' | 'webgpu';

const requestedRenderer = process.env.PASS69_3_RIGGED_BOT_RENDERER ?? 'webgl2';
if (requestedRenderer !== 'webgl2' && requestedRenderer !== 'webgpu') {
  throw new Error(`Pass 69.3 rigged-bot renderer must be webgl2 or webgpu; received ${requestedRenderer}`);
}
const renderer: Renderer = requestedRenderer;
const renderProfile = process.env.PASS69_3_RIGGED_BOT_RENDER_PROFILE ?? 'blender';
if (renderProfile !== 'blender') {
  throw new Error(`Pass 69.3 rigged-bot evidence requires the Blender profile; received ${renderProfile}`);
}
const expectedSourceSha = process.env.PASS69_3_RIGGED_BOT_SOURCE_SHA ?? '';
const expectedTarget = process.env.PASS69_3_RIGGED_BOT_TARGET ?? '';
const officialEvidence = expectedSourceSha !== '' || expectedTarget !== '';
const targetForRenderer = `edge-${renderer}`;
if (officialEvidence && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha) || expectedTarget !== targetForRenderer)) {
  throw new Error(`Pass 69.3 rigged-bot evidence has incomplete target provenance for ${targetForRenderer}`);
}

const repositoryRoot = process.cwd();
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const artifactBase = resolve(repositoryRoot, 'artifacts/pass69-3/rigged-bot-live');
const artifactRoot = resolve(artifactBase, renderer);
const receiptPath = resolve(artifactBase, `receipt-${renderer}.json`);
const OPERATOR_SOURCE = 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative';
const OPERATOR_ASSET = './assets/original/models/operators/pass65-third-person-operator-lod0.glb';
const CANONICAL_OPERATOR_SKIN_MANIFEST_CONTRACT = 'runtime-canonical-operator-skin-manifest-v1';
const CANONICAL_OPERATOR_SKIN_NAMES = Object.freeze(['Cube018', 'Cube018_1', 'Cube018_2', 'Swat_Feet', 'Cube037', 'Cube037_1', 'Cube037_2', 'Cube023', 'Cube023_1']);
const CANONICAL_OPERATOR_WRIST_NAMES = Object.freeze({ left: 'WristL', right: 'WristR' });
const THREE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CARBINE_WORLD_ASSET = './assets/original/models/weapons/pass65-firearms/carbine/carbine-world-lod0.glb';
const ANTI_T_THRESHOLDS = Object.freeze({
  minimumVerticalDropM: 0.08,
  minimumVerticalDropRatio: 0.18,
  maximumHorizontalReachRatio: 0.9,
  maximumOutwardReachRatio: 0.82,
  minimumElbowFlexRadians: 0.3,
});
const ARM_BONES = Object.freeze([
  Object.freeze({ side: 'left', role: 'shoulder', sourceBone: 'UpperArm.L', bone: 'UpperArmL', minimumBindRadians: 0.5 }),
  Object.freeze({ side: 'left', role: 'elbow', sourceBone: 'LowerArm.L', bone: 'LowerArmL', minimumBindRadians: 0.15 }),
  Object.freeze({ side: 'left', role: 'wrist-hand', sourceBone: 'Wrist.L', bone: 'WristL', minimumBindRadians: 0.05 }),
  Object.freeze({ side: 'right', role: 'shoulder', sourceBone: 'UpperArm.R', bone: 'UpperArmR', minimumBindRadians: 0.5 }),
  Object.freeze({ side: 'right', role: 'elbow', sourceBone: 'LowerArm.R', bone: 'LowerArmR', minimumBindRadians: 0.15 }),
  Object.freeze({ side: 'right', role: 'wrist-hand', sourceBone: 'Wrist.R', bone: 'WristR', minimumBindRadians: 0.05 }),
]);
const HAND_BONES = Object.freeze([
  Object.freeze({ side: 'left', digit: 'thumb', joint: 2, sourceBone: 'Thumb2.L', bone: 'Thumb2L', minimumBindRadians: 0.008 }),
  Object.freeze({ side: 'left', digit: 'index', joint: 2, sourceBone: 'Index2.L', bone: 'Index2L', minimumBindRadians: 0.2 }),
  Object.freeze({ side: 'left', digit: 'middle', joint: 2, sourceBone: 'Middle2.L', bone: 'Middle2L', minimumBindRadians: 0.18 }),
  Object.freeze({ side: 'left', digit: 'ring', joint: 2, sourceBone: 'Ring2.L', bone: 'Ring2L', minimumBindRadians: 0.22 }),
  Object.freeze({ side: 'left', digit: 'pinky', joint: 2, sourceBone: 'Pinky2.L', bone: 'Pinky2L', minimumBindRadians: 0.35 }),
  Object.freeze({ side: 'right', digit: 'thumb', joint: 2, sourceBone: 'Thumb2.R', bone: 'Thumb2R', minimumBindRadians: 0.008 }),
  Object.freeze({ side: 'right', digit: 'index', joint: 2, sourceBone: 'Index2.R', bone: 'Index2R', minimumBindRadians: 0.2 }),
  Object.freeze({ side: 'right', digit: 'middle', joint: 2, sourceBone: 'Middle2.R', bone: 'Middle2R', minimumBindRadians: 0.18 }),
  Object.freeze({ side: 'right', digit: 'ring', joint: 2, sourceBone: 'Ring2.R', bone: 'Ring2R', minimumBindRadians: 0.22 }),
  Object.freeze({ side: 'right', digit: 'pinky', joint: 2, sourceBone: 'Pinky2.R', bone: 'Pinky2R', minimumBindRadians: 0.35 }),
]);
const RENDERED_INFLUENCE_THRESHOLDS = Object.freeze({
  minimumNormalizedWeight: 0.05,
  minimumInfluencedVertices: 4,
  minimumMaximumNormalizedWeight: 0.2,
});
const GRIP_THRESHOLDS = Object.freeze({ maximumPositionErrorM: 0.015, maximumQuaternionErrorRadians: 0.2 });
const CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS = Object.freeze({
  thumb: 0.04,
  index: 0.23,
  middle: 0.21,
  ring: 0.25,
  pinky: 0.38,
});
const CARBINE_SOCKET_REFERENCES = Object.freeze({
  'support-socket-l': Object.freeze({
    authoredLocalPosition: Object.freeze([-0.10000000149011612, -0.03999999910593033, 0.47999998927116394]),
    evaluatedTargetLocalPosition: Object.freeze([-0.035, -0.17, -0.21]),
    liveTargetContract: 'runtime-calibrated-from-authored-source-v1',
    calibrationApplied: true,
    calibrationReason: 'third-person-swat-chain-reach-without-unsafe-stretch',
  }),
  'grip-socket-r': Object.freeze({
    authoredLocalPosition: Object.freeze([0, -0.3400000035762787, -0.12999999523162842]),
    evaluatedTargetLocalPosition: Object.freeze([0, -0.3400000035762787, -0.12999999523162842]),
    liveTargetContract: 'authored-source-socket-retained-v1',
    calibrationApplied: false,
    calibrationReason: 'authored-firing-grip-retained',
  }),
});
const CLOSE_JOINT_THRESHOLDS = Object.freeze({ minimumArmChainPixels: 80 });
const HAND_DETAIL_THRESHOLDS = Object.freeze({ minimumWristFingerPixels: 12 });
const HAND_CAMERA_CONTRACT = RIGGED_HAND_CAMERA_CONTRACT;
const CLOSE_ROI_NDC = Object.freeze({ minX: -0.46, maxX: 0.46, minY: -0.7, maxY: 0.7 });
const HAND_ROI_NDC = Object.freeze({ minX: -0.55, maxX: 0.55, minY: -0.68, maxY: 0.68 });
const MEDIUM_ROI_NDC = Object.freeze({ minX: -0.68, maxX: 0.68, minY: -0.82, maxY: 0.82 });
const OVERVIEW_ROI_NDC = Object.freeze({ minX: -0.97, maxX: 0.97, minY: -0.95, maxY: 0.95 });
const EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES = Object.freeze([
  'Cube018',
  'Cube018_1',
  'Cube018_2',
  'Swat_Feet',
  'Cube037',
  'Cube037_1',
  'Cube037_2',
  'Cube023',
  'Cube023_1',
].sort());

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function jsonSha256(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}

function rasterStateDigests(state: any, targetId: string) {
  const targetState = state.rangeTargets.find((target: any) => target.id === targetId);
  const nonTargetState = state.rangeTargets.filter((target: any) => target.id !== targetId);
  return {
    contract: 'rigged-raster-state-digests-v1',
    cameraSha256: jsonSha256(state.camera),
    fixedVisualTimeSha256: jsonSha256(state.fixedTimeMs),
    targetPoseSha256: jsonSha256(state.targetPose),
    targetStateSha256: jsonSha256(targetState),
    nonTargetStateSha256: jsonSha256(nonTargetState),
    combinedSha256: jsonSha256(state),
  };
}

function canonicalRangeRasterTargets(rawTargets: any[]) {
  const expectedIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(({ id }) => id);
  const dummies = rawTargets.filter(({ kind }) => kind === 'training-dummy');
  if (dummies.length !== expectedIds.length
    || new Set(dummies.map(({ id }) => id)).size !== expectedIds.length
    || !expectedIds.every((id) => dummies.some((target) => target.id === id))) {
    throw new Error('Gun Range raster state does not contain the exact four ordered dummy identities');
  }
  const canonicalBone = (bone: any) => ({
    side: bone.side,
    role: bone.role ?? null,
    digit: bone.digit ?? null,
    joint: bone.joint ?? null,
    sourceBone: bone.sourceBone,
    bone: bone.bone,
    parentBone: bone.parentBone,
    wristBone: bone.wristBone ?? null,
    effectiveSkinnedMeshes: bone.effectiveSkinnedMeshes,
    localPosition: bone.localPosition,
    localQuaternion: bone.localQuaternion,
    worldPosition: bone.worldPosition,
    worldQuaternion: bone.worldQuaternion,
    bindLocalPosition: bone.bindLocalPosition,
    bindLocalQuaternion: bone.bindLocalQuaternion,
    bindPositionDelta: bone.bindPositionDelta ?? null,
    bindQuaternionDeltaRadians: bone.bindQuaternionDeltaRadians,
  });
  return expectedIds.map((id) => {
    const target = dummies.find((candidate) => candidate.id === id)!;
    const model = target.operatorModel;
    return {
      id: target.id,
      kind: target.kind,
      rootUuid: target.rootUuid,
      operatorRootUuid: target.operatorRootUuid,
      alwaysCritical: target.alwaysCritical,
      active: target.active,
      health: target.health,
      maxHealth: target.maxHealth,
      visible: target.visible,
      rootEffectivelyVisible: target.rootEffectivelyVisible,
      effectivelyVisibleMeshCount: target.effectivelyVisibleMeshCount,
      position: target.position,
      yaw: target.yaw,
      screenPosition: target.screenPosition,
      armed: target.armed,
      jointScreenPositions: target.jointScreenPositions,
      operator: {
        activeClip: model.activeClip,
        animationContract: model.animationContract,
        effectivelyVisibleSkinnedMeshes: model.effectivelyVisibleSkinnedMeshes,
        armPose: {
          contract: model.armPose.contract,
          bones: model.armPose.bones.map(canonicalBone),
        },
        handPose: {
          contract: model.handPose.contract,
          bones: model.handPose.bones.map(canonicalBone),
        },
      },
    };
  });
}

async function produceRasterDiffReceipt(controlPath: string, visiblePath: string, roi: any) {
  const decode = async (path: string) => {
    const decoded = await sharp(resolve(repositoryRoot, path), { failOn: 'error', limitInputPixels: 1_600 * 900 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(decoded.info, `${path}: exact lossless RGBA decode`).toMatchObject({
      width: 1_600,
      height: 900,
      channels: 4,
    });
    return decoded.data;
  };
  const [control, visible] = await Promise.all([decode(controlPath), decode(visiblePath)]);
  const mask = Buffer.alloc(1_600 * 900);
  const controlRgb = Buffer.alloc(1_600 * 900 * 3);
  const visibleRgb = Buffer.alloc(1_600 * 900 * 3);
  let changedPixelCount = 0;
  let insideChangedPixelCount = 0;
  let outsideChangedPixelCount = 0;
  let alphaChangedPixelCount = 0;
  let maxRgbChannelDelta = 0;
  let minX = 1_600;
  let minY = 900;
  let maxXExclusive = 0;
  let maxYExclusive = 0;
  for (let pixel = 0; pixel < 1_600 * 900; pixel += 1) {
    const rgba = pixel * 4;
    const rgb = pixel * 3;
    const x = pixel % 1_600;
    const y = Math.floor(pixel / 1_600);
    let changed = false;
    for (let channel = 0; channel < 3; channel += 1) {
      controlRgb[rgb + channel] = control[rgba + channel];
      visibleRgb[rgb + channel] = visible[rgba + channel];
      const delta = Math.abs(control[rgba + channel] - visible[rgba + channel]);
      changed ||= delta !== 0;
      maxRgbChannelDelta = Math.max(maxRgbChannelDelta, delta);
    }
    if (control[rgba + 3] !== visible[rgba + 3]) alphaChangedPixelCount += 1;
    if (!changed) continue;
    mask[pixel] = 1;
    changedPixelCount += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxXExclusive = Math.max(maxXExclusive, x + 1);
    maxYExclusive = Math.max(maxYExclusive, y + 1);
    if (x >= roi.minX && x < roi.maxXExclusive && y >= roi.minY && y < roi.maxYExclusive) {
      insideChangedPixelCount += 1;
    } else {
      outsideChangedPixelCount += 1;
    }
  }
  return {
    contract: 'lossless-rgba-rgb-diff-v1',
    width: 1_600,
    height: 900,
    changedPixelDefinition: 'any-rgb-byte-differs',
    changedPixelCount,
    insideChangedPixelCount,
    outsideChangedPixelCount,
    alphaChangedPixelCount,
    maxRgbChannelDelta,
    changedPixelBbox: changedPixelCount === 0 ? null : { minX, minY, maxXExclusive, maxYExclusive },
    diffMaskSha256: sha256(mask),
    controlRawRgbSha256: sha256(controlRgb),
    visibleRawRgbSha256: sha256(visibleRgb),
    controlRawRgbaSha256: sha256(control),
    visibleRawRgbaSha256: sha256(visible),
  };
}

function withinNumericBoundary(observed: number, limit: number, scaleValues: readonly number[]): boolean {
  return Number.isFinite(observed) && Number.isFinite(limit) && scaleValues.every(Number.isFinite)
    && observed <= limit + Number.EPSILON * 8 * Math.max(1, ...scaleValues.map(Math.abs));
}

function repositoryRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function expectExactMainCameraDrawReceipt(
  actorFrame: any,
  expectedActor: Readonly<{ kind: 'bot' | 'training-dummy'; id: string }>,
  frame: number,
  captureRevision: number,
  label: string,
): void {
  const draw = actorFrame?.mainCameraDraw;
  expect(
    [...RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.mainCameraDraw.expectedSkinnedMeshNames].sort(),
    `${label}: contract matches the independently pinned shipped manifest`,
  ).toEqual(EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES);
  expect(actorFrame.rootUuid, `${label}: current actor-root UUID`).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(actorFrame.operatorRootUuid, `${label}: current operator-root UUID`).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(draw, `${label}: exact main-camera draw receipt`).toMatchObject({
    contract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.mainCameraDraw.contract,
    pixelProof: false,
    actor: expectedActor,
    frame,
    captureRevision,
    actorRootUuid: actorFrame.rootUuid,
    operatorRootUuid: actorFrame.operatorRootUuid,
    expectedMeshNames: EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES,
    beforeMeshNames: EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES,
    afterMeshNames: EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES,
    exactExpectedMeshNames: true,
    exactExpectedMeshUuids: true,
    complete: true,
  });
  expect(draw.gameplaySceneUuid, `${label}: gameplay scene UUID`).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(draw.gameplayCameraUuid, `${label}: gameplay camera UUID`).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(draw.expectedMeshNames, `${label}: no duplicate expected mesh names`).toHaveLength(
    new Set(draw.expectedMeshNames).size,
  );
  expect(draw.expectedMeshUuids, `${label}: nine expected mesh UUIDs`).toHaveLength(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.mainCameraDraw.expectedSkinnedMeshCount,
  );
  expect(new Set(draw.expectedMeshUuids).size, `${label}: unique expected mesh UUIDs`).toBe(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.mainCameraDraw.expectedSkinnedMeshCount,
  );
  expect(draw.meshes, `${label}: exact shipped SkinnedMesh cardinality`).toHaveLength(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.mainCameraDraw.expectedSkinnedMeshCount,
  );
  expect(draw.meshes.map(({ meshName }: any) => meshName).sort(), `${label}: exact shipped SkinnedMesh names`)
    .toEqual(EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES);
  expect(draw.meshes.map(({ meshUuid }: any) => meshUuid).sort(), `${label}: exact expected mesh UUID set`)
    .toEqual([...draw.expectedMeshUuids].sort());
  for (const mesh of draw.meshes) {
    const meshLabel = `${label}:${mesh.meshName}`;
    expect(mesh.meshUuid, `${meshLabel}: mesh UUID`).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(mesh.beforeCount, `${meshLabel}: admitted before callbacks`).toBeGreaterThan(0);
    expect(mesh.afterCount, `${meshLabel}: balanced before/after callbacks`).toBe(mesh.beforeCount);
    expect(mesh.beforeStamps, `${meshLabel}: all before stamps`).toHaveLength(mesh.beforeCount);
    expect(mesh.afterStamps, `${meshLabel}: all after stamps`).toHaveLength(mesh.afterCount);
    expect(mesh.before, `${meshLabel}: final before stamp`).toEqual(mesh.beforeStamps.at(-1));
    expect(mesh.after, `${meshLabel}: final after stamp`).toEqual(mesh.afterStamps.at(-1));
    expect(mesh.complete, `${meshLabel}: complete callback pair`).toBe(true);
    expect(mesh.materialSlotUuids.length, `${meshLabel}: nonempty ordered material slots`).toBeGreaterThan(0);
    expect(mesh.materialSlotUuids.every((uuid: unknown) => typeof uuid === 'string' && /^[0-9a-f-]{36}$/iu.test(uuid)),
      `${meshLabel}: material-slot UUID shape`).toBe(true);
    expect(mesh.materialUuidSet, `${meshLabel}: independently derived unique material UUID set`).toEqual(
      [...new Set(mesh.materialSlotUuids)].sort(),
    );
    const invocationKey = (stamp: any) => JSON.stringify([
      stamp.material.uuid,
      stamp.drawRange.group?.start ?? null,
      stamp.drawRange.group?.count ?? null,
      stamp.drawRange.group?.materialIndex ?? null,
    ]);
    expect(mesh.beforeStamps.map(invocationKey).sort(), `${meshLabel}: balanced material/group invocations`)
      .toEqual(mesh.afterStamps.map(invocationKey).sort());
    expect(new Set(mesh.beforeStamps.map(invocationKey)).size, `${meshLabel}: one before stamp per material/group`)
      .toBe(mesh.beforeStamps.length);
    expect(new Set(mesh.afterStamps.map(invocationKey)).size, `${meshLabel}: one after stamp per material/group`)
      .toBe(mesh.afterStamps.length);
    for (const [phase, stamps] of [['before', mesh.beforeStamps], ['after', mesh.afterStamps]] as const) {
      for (const stamp of stamps) {
      expect(stamp, `${meshLabel}: ${phase} stamp`).toMatchObject({
        frame,
        captureRevision,
        meshUuid: mesh.meshUuid,
        meshName: mesh.meshName,
        actorRootUuid: draw.actorRootUuid,
        operatorRootUuid: draw.operatorRootUuid,
        descendsFromActorRoot: true,
        descendsFromOperatorRoot: true,
        sceneUuid: draw.gameplaySceneUuid,
        cameraUuid: draw.gameplayCameraUuid,
        sceneOverrideMaterialUuid: null,
        materialSlotUuids: mesh.materialSlotUuids,
        materialUuidSet: mesh.materialUuidSet,
        materialMatchesMeshSlot: true,
        stateValid: true,
        world: {
          attachedToGameplayScene: true,
          effectivelyVisible: true,
          matrixFinite: true,
        },
        frustum: {
          intersectsMainCameraFrustum: true,
          boundingSphere: { finite: true },
        },
      });
      expect(stamp.meshLayerMask & stamp.cameraLayerMask, `${meshLabel}: ${phase} layer intersection`).not.toBe(0);
      expect(stamp.cameraLayerMask & 1, `${meshLabel}: ${phase} world-layer camera pass`).toBe(1);
      expect(stamp.drawRange.effectiveCount, `${meshLabel}: ${phase} nonzero draw range`).toBeGreaterThan(0);
      expect(stamp.drawRange.positionCount, `${meshLabel}: ${phase} positions`).toBeGreaterThan(0);
      if (stamp.drawRange.group !== null) {
        expect(stamp.drawRange.group, `${meshLabel}: ${phase} valid material group`).toMatchObject({
          start: expect.any(Number), count: expect.any(Number), materialIndex: expect.any(Number),
        });
        expect(Number.isSafeInteger(stamp.drawRange.group.start), `${meshLabel}: ${phase} group start`).toBe(true);
        expect(Number.isSafeInteger(stamp.drawRange.group.count), `${meshLabel}: ${phase} group count`).toBe(true);
        expect(Number.isSafeInteger(stamp.drawRange.group.materialIndex), `${meshLabel}: ${phase} group material`).toBe(true);
        expect(stamp.drawRange.group.start, `${meshLabel}: ${phase} nonnegative group start`).toBeGreaterThanOrEqual(0);
        expect(stamp.drawRange.group.count, `${meshLabel}: ${phase} nonnegative group count`).toBeGreaterThanOrEqual(0);
        expect(stamp.drawRange.group.materialIndex, `${meshLabel}: ${phase} material slot in range`)
          .toBeLessThan(mesh.materialSlotUuids.length);
        expect(stamp.material.uuid, `${meshLabel}: ${phase} callback material owns the stamped group slot`)
          .toBe(mesh.materialSlotUuids[stamp.drawRange.group.materialIndex]);
      } else {
        expect(mesh.materialSlotUuids, `${meshLabel}: ${phase} null group only for a single material`).toHaveLength(1);
        expect(stamp.material.uuid, `${meshLabel}: ${phase} callback material owns the single slot`)
          .toBe(mesh.materialSlotUuids[0]);
      }
      expect(stamp.world.position.every(Number.isFinite), `${meshLabel}: ${phase} finite world position`).toBe(true);
      expect(stamp.world.scale.every(Number.isFinite), `${meshLabel}: ${phase} finite world scale`).toBe(true);
      expect(Number.isFinite(stamp.world.determinant), `${meshLabel}: ${phase} finite determinant`).toBe(true);
      expect(Math.abs(stamp.world.determinant), `${meshLabel}: ${phase} nonzero determinant`).toBeGreaterThan(1e-12);
      expect(stamp.material, `${meshLabel}: ${phase} drawable material`).toMatchObject({
        visible: true,
        colorWrite: true,
      });
      expect(!stamp.material.transparent || stamp.material.opacity > 0, `${meshLabel}: ${phase} material opacity`).toBe(true);
      expect(stamp.frustum.boundingSphere.center.every(Number.isFinite), `${meshLabel}: ${phase} finite bound center`).toBe(true);
      expect(stamp.frustum.boundingSphere.radius, `${meshLabel}: ${phase} finite bound radius`).toBeGreaterThanOrEqual(0);
      }
    }
  }
}

function expectPresentationDrawIdentity(actors: readonly any[], label: string): void {
  const draws = actors.map(({ mainCameraDraw }) => mainCameraDraw);
  expect(new Set(draws.map(({ gameplaySceneUuid }) => gameplaySceneUuid)).size,
    `${label}: one gameplay scene across all actors`).toBe(1);
  expect(new Set(draws.map(({ gameplayCameraUuid }) => gameplayCameraUuid)).size,
    `${label}: one gameplay camera across all actors`).toBe(1);
  expect(new Set(actors.map(({ rootUuid }) => rootUuid)).size,
    `${label}: distinct registered actor wrappers`).toBe(actors.length);
  expect(new Set(actors.map(({ operatorRootUuid }) => operatorRootUuid)).size,
    `${label}: distinct resolved operator roots`).toBe(actors.length);
  const allMeshUuids = draws.flatMap(({ meshes }) => meshes.map(({ meshUuid }: any) => meshUuid));
  expect(new Set(allMeshUuids).size, `${label}: disjoint per-actor SkinnedMesh UUIDs`).toBe(allMeshUuids.length);
}

function route(map: 'atomic-acres' | 'gun-range', seed: string): string {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  return `/?release=latest&map=${map}&renderer=${renderer}${requireWebGpu}&render=${renderProfile}`
    + `&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=${seed}-${renderer}`;
}

async function waitForAtomicPlayerConvergence(
  page: Page,
  commandedPresentedGameplayFrame: number,
): Promise<AtomicPlayerConvergence> {
  return page.evaluate(waitForAtomicPlayerConvergenceInPage, {
    commandedFrame: commandedPresentedGameplayFrame,
    positionAnchor: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlementPositionAnchor,
    settlement: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlement,
  });
}

function quaternionDelta(left: number[], right: number[]): number {
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0));
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function normalizedQuaternionDelta(left: number[], right: number[]): number {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  const normalizedLeft = left.map((value) => value / leftLength);
  const normalizedRight = right.map((value) => value / rightLength);
  const sameHemisphereChord = Math.hypot(...normalizedLeft.map((value, index) => value - normalizedRight[index]));
  const oppositeHemisphereChord = Math.hypot(...normalizedLeft.map((value, index) => value + normalizedRight[index]));
  const shortestChord = Math.min(sameHemisphereChord, oppositeHemisphereChord);
  return 4 * Math.asin(Math.min(1, Math.max(0, shortestChord / 2)));
}

function normalizedQuaternion(value: number[]): number[] {
  const magnitude = Math.hypot(...value);
  return value.map((component) => component / magnitude);
}

function yxzCameraQuaternion(yaw: number, pitch: number): number[] {
  const sx = Math.sin(pitch / 2);
  const cx = Math.cos(pitch / 2);
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  return [sx * cy, cx * sy, -sx * sy, cx * cy];
}

function multiplyQuaternions(left: number[], right: number[]): number[] {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lx * rw + lw * rx + ly * rz - lz * ry,
    ly * rw + lw * ry + lz * rx - lx * rz,
    lz * rw + lw * rz + lx * ry - ly * rx,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function shortestBindRelativeRotation(bind: number[], local: number[]): { axis: number[] | null; radians: number } {
  const normalizedBind = normalizedQuaternion(bind);
  const normalizedLocal = normalizedQuaternion(local);
  const relative = normalizedQuaternion(multiplyQuaternions(
    [-normalizedBind[0], -normalizedBind[1], -normalizedBind[2], normalizedBind[3]],
    normalizedLocal,
  ));
  if (relative[3] < 0) relative.forEach((component, index) => { relative[index] = -component; });
  const axisLength = Math.hypot(relative[0], relative[1], relative[2]);
  return {
    axis: axisLength > 1e-8 ? relative.slice(0, 3).map((component) => component / axisLength) : null,
    radians: 2 * Math.acos(Math.min(1, Math.max(-1, relative[3]))),
  };
}

function projectedBindFloorQuaternion(bind: number[], axis: number[], radians: number): number[] {
  const half = radians / 2;
  const sine = Math.sin(half);
  return normalizedQuaternion(multiplyQuaternions(
    normalizedQuaternion(bind),
    [axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)],
  ));
}

function positionDelta(left: number[], right: number[]): number {
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function scaleAwareEqual(left: number, right: number, scaleValues: readonly number[]): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && scaleValues.every(Number.isFinite)
    && Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(1, ...scaleValues.map(Math.abs));
}

function subtract(left: number[], right: number[]): number[] {
  return left.map((value, index) => value - right[index]);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function canonicalOperatorSkinManifestValid(manifest: any): boolean {
  if (manifest?.contract !== CANONICAL_OPERATOR_SKIN_MANIFEST_CONTRACT
    || manifest.assetUrl !== OPERATOR_ASSET || manifest.lod !== 0
    || manifest.visual?.name !== 'rigged-operator-visual'
    || !THREE_UUID_PATTERN.test(manifest.visual?.uuid ?? '')
    || !Array.isArray(manifest.skinnedMeshes)
    || manifest.skinnedMeshes.length !== CANONICAL_OPERATOR_SKIN_NAMES.length
    || !Array.isArray(manifest.wrists) || manifest.wrists.length !== 2) return false;
  const meshUuids = new Set<string>();
  for (let index = 0; index < CANONICAL_OPERATOR_SKIN_NAMES.length; index += 1) {
    const mesh = manifest.skinnedMeshes[index];
    if (mesh?.name !== CANONICAL_OPERATOR_SKIN_NAMES[index]
      || !THREE_UUID_PATTERN.test(mesh.uuid ?? '') || meshUuids.has(mesh.uuid)
      || !THREE_UUID_PATTERN.test(mesh.geometryUuid ?? '')
      || !Number.isSafeInteger(mesh.positionCount) || mesh.positionCount <= 0
      || mesh.skinIndexCount !== mesh.positionCount || mesh.skinWeightCount !== mesh.positionCount
      || mesh.skinIndexItemSize !== 4 || mesh.skinWeightItemSize !== 4
      || mesh.skinIndexNormalized !== false || typeof mesh.skinWeightNormalized !== 'boolean'
      || !Array.isArray(mesh.skeletonBones) || mesh.skeletonBones.length < 1) return false;
    meshUuids.add(mesh.uuid);
    const boneUuids = new Set<string>();
    for (let boneIndex = 0; boneIndex < mesh.skeletonBones.length; boneIndex += 1) {
      const bone = mesh.skeletonBones[boneIndex];
      if (bone?.index !== boneIndex || typeof bone.name !== 'string' || bone.name.length === 0
        || !THREE_UUID_PATTERN.test(bone.uuid ?? '') || boneUuids.has(bone.uuid)
        || !Number.isSafeInteger(bone.parentIndex) || bone.parentIndex < -1
        || bone.parentIndex >= mesh.skeletonBones.length || bone.parentIndex === boneIndex) return false;
      boneUuids.add(bone.uuid);
    }
    for (let boneIndex = 0; boneIndex < mesh.skeletonBones.length; boneIndex += 1) {
      const visited = new Set<number>();
      let cursor = boneIndex;
      while (cursor !== -1) {
        if (visited.has(cursor)) return false;
        visited.add(cursor);
        cursor = mesh.skeletonBones[cursor].parentIndex;
      }
    }
  }
  const wristUuids = new Set<string>();
  for (const [wristIndex, side] of (['left', 'right'] as const).entries()) {
    const wrist = manifest.wrists[wristIndex];
    const matches = manifest.wrists.filter((candidate: any) => candidate?.side === side);
    if (matches.length !== 1 || wrist?.side !== side || wrist.name !== CANONICAL_OPERATOR_WRIST_NAMES[side]
      || !THREE_UUID_PATTERN.test(wrist.uuid ?? '') || wristUuids.has(wrist.uuid)
      || !manifest.skinnedMeshes.some((mesh: any) => (
        mesh.skeletonBones.filter((bone: any) => bone.uuid === wrist.uuid && bone.name === wrist.name).length === 1
      ))
      || manifest.skinnedMeshes.some((mesh: any) => {
        const namedWristBones = mesh.skeletonBones.filter((bone: any) => bone.name === wrist.name);
        return namedWristBones.length > 1
          || namedWristBones.some((bone: any) => bone.uuid !== wrist.uuid);
      })) return false;
    wristUuids.add(wrist.uuid);
  }
  return true;
}

function canonicalBoneDescendsFromWrist(skeletonBones: any[], boneIndex: number, wristUuid: string): boolean {
  const visited = new Set<number>();
  let cursor = boneIndex;
  while (Number.isSafeInteger(cursor) && cursor >= 0 && cursor < skeletonBones.length && !visited.has(cursor)) {
    visited.add(cursor);
    const bone = skeletonBones[cursor];
    if (bone.uuid === wristUuid) return true;
    cursor = bone.parentIndex;
  }
  return false;
}

function recomputeCanonicalFaceInfluence(blocker: any, manifest: any, side: 'left' | 'right') {
  if (!canonicalOperatorSkinManifestValid(manifest)
    || blocker?.requestedSide !== side || blocker.requestedWrist !== CANONICAL_OPERATOR_WRIST_NAMES[side]) return null;
  const meshMatches = manifest.skinnedMeshes.filter((mesh: any) => (
    mesh.name === blocker.mesh && mesh.uuid === blocker.meshUuid && mesh.geometryUuid === blocker.geometryUuid
  ));
  const wristMatches = manifest.wrists.filter((wrist: any) => (
    wrist.side === side && wrist.name === blocker.requestedWrist && wrist.uuid === blocker.requestedWristUuid
  ));
  if (meshMatches.length !== 1 || wristMatches.length !== 1) return null;
  const mesh = meshMatches[0];
  const wrist = wristMatches[0];
  expect(blocker.skinAttributeProvenance, 'terminal face uses exact submitted canonical geometry attributes').toEqual({
    positionCount: mesh.positionCount,
    skinIndexCount: mesh.skinIndexCount,
    skinIndexItemSize: mesh.skinIndexItemSize,
    skinIndexNormalized: mesh.skinIndexNormalized,
    skinWeightCount: mesh.skinWeightCount,
    skinWeightItemSize: mesh.skinWeightItemSize,
    skinWeightNormalized: mesh.skinWeightNormalized,
    valid: true,
  });
  const faceVertices = [blocker.face?.a, blocker.face?.b, blocker.face?.c];
  if (!faceVertices.every((vertex) => Number.isSafeInteger(vertex) && vertex >= 0 && vertex < mesh.positionCount)
    || new Set(faceVertices).size !== 3
    || !Array.isArray(blocker.dominantBones) || blocker.dominantBones.length !== 3) return null;
  let ownedCount = 0;
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const dominant = blocker.dominantBones[vertex];
    if (dominant?.vertexIndex !== faceVertices[vertex]
      || !Array.isArray(dominant.skinIndices) || dominant.skinIndices.length !== 4
      || !dominant.skinIndices.every((skinIndex: number) => Number.isSafeInteger(skinIndex)
        && skinIndex >= 0 && skinIndex < mesh.skeletonBones.length)
      || !Array.isArray(dominant.skinWeights) || dominant.skinWeights.length !== 4
      || !dominant.skinWeights.every((weight: number) => Number.isFinite(weight) && weight >= 0)
      || !Array.isArray(dominant.normalizedWeights) || dominant.normalizedWeights.length !== 4) return null;
    const weightSum = dominant.skinWeights.reduce((sum: number, weight: number) => sum + weight, 0);
    if (!Number.isFinite(weightSum) || !(weightSum > 0)) return null;
    const normalized = dominant.skinWeights.map((weight: number) => weight / weightSum);
    if (!dominant.normalizedWeights.every((weight: number, slot: number) => scaleAwareEqual(
      weight, normalized[slot], [weight, normalized[slot], weightSum, ...dominant.skinWeights],
    ))) return null;
    let dominantSlot = 0;
    for (let slot = 1; slot < 4; slot += 1) {
      if (dominant.skinWeights[slot] > dominant.skinWeights[dominantSlot]) dominantSlot = slot;
    }
    const skinIndex = dominant.skinIndices[dominantSlot];
    const bone = mesh.skeletonBones[skinIndex];
    const handOwned = canonicalBoneDescendsFromWrist(mesh.skeletonBones, skinIndex, wrist.uuid);
    if (dominant.slot !== dominantSlot || dominant.skinIndex !== skinIndex
      || !scaleAwareEqual(dominant.normalizedWeight, normalized[dominantSlot], [weightSum, ...normalized])
      || dominant.bone !== bone.name || dominant.boneUuid !== bone.uuid
      || dominant.handOwned !== handOwned) return null;
    if (handOwned) ownedCount += 1;
  }
  return { ownedCount, faceHandOwned: ownedCount >= 2 };
}

function length(vector: number[]): number {
  return Math.hypot(...vector);
}

function armGeometry(model: any, side: 'left' | 'right', chain: any) {
  const shoulder = model.armPose.bones.find((bone: any) => bone.side === side && bone.role === 'shoulder');
  const elbow = model.armPose.bones.find((bone: any) => bone.side === side && bone.role === 'elbow');
  const wrist = model.armPose.bones.find((bone: any) => bone.side === side && bone.role === 'wrist-hand');
  const shoulderToElbow = subtract(elbow.worldPosition, shoulder.worldPosition);
  const elbowToWrist = subtract(wrist.worldPosition, elbow.worldPosition);
  const shoulderToWrist = subtract(wrist.worldPosition, shoulder.worldPosition);
  const elbowToShoulder = shoulderToElbow.map((value) => -value);
  const upperArmLength = length(shoulderToElbow);
  const forearmLength = length(elbowToWrist);
  const armLength = upperArmLength + forearmLength;
  const elbowBendRadians = Math.acos(Math.min(1, Math.max(-1,
    dot(elbowToShoulder, elbowToWrist) / Math.max(upperArmLength * forearmLength, 1e-9))));
  const shoulderToWristVerticalDrop = shoulder.worldPosition[1] - wrist.worldPosition[1];
  const shoulderToWristHorizontalReach = Math.hypot(shoulderToWrist[0], shoulderToWrist[2]);
  const shoulderToWristOutwardReach = dot(shoulderToWrist, chain.shoulderOutwardAxis);
  return {
    upperArmLength,
    forearmLength,
    armLength,
    elbowBendRadians,
    elbowFlexRadians: Math.PI - elbowBendRadians,
    shoulderToWristVerticalDrop,
    shoulderToWristVerticalDropRatio: shoulderToWristVerticalDrop / armLength,
    shoulderToWristHorizontalReach,
    shoulderToWristHorizontalReachRatio: shoulderToWristHorizontalReach / armLength,
    shoulderToWristOutwardReach,
    shoulderToWristOutwardReachRatio: Math.abs(shoulderToWristOutwardReach) / armLength,
  };
}

function expectArmPose(model: any, label: string, armed: boolean): void {
  expect(model, `${label}: canonical authored operator GLB`).toMatchObject({
    source: OPERATOR_SOURCE,
    assetUrl: OPERATOR_ASSET,
    license: 'CC0-1.0',
    lod: 0,
    materialContract: 'opaque-embedded-pbr-depth-writing',
    activeClip: 'Walk',
    armBonesPresent: 6,
    visibleEmbeddedWeapons: 0,
    armPose: {
      contract: 'source-glb-skinned-anti-t-arm-chain-v2',
      reference: 'authored-glb-local-transform-before-animation',
      expectedBoneCount: 6,
      allPresent: true,
      allFinite: true,
      allHierarchyValid: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allHaveRenderedVertexInfluence: true,
      allAntiTPoseGeometry: true,
      thresholds: ANTI_T_THRESHOLDS,
    },
    handPose: {
      contract: 'source-glb-weighted-five-digit-sentinels-v2',
      reference: 'shipped-lod0-walk-animated-second-phalanges',
      expectedBoneCount: 10,
      allPresent: true,
      allDescendantOfWrist: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allHaveRenderedVertexInfluence: true,
      allFinite: true,
    },
  });
  expect(model.skinnedMeshes, `${label}: real skinned renderables`).toBeGreaterThan(0);
  expect(model.visibleSkinnedMeshes, `${label}: visible skinned renderables`).toBeGreaterThan(0);
  expect(model.effectivelyVisibleSkinnedMeshes.length, `${label}: effective skinned renderables`).toBeGreaterThan(0);
  expect(model.animationContract.speed, `${label}: active locomotion pose`).toBeGreaterThan(0.18);
  expect(model.armPose.commonEffectiveSkinnedMeshes.length, `${label}: one visible skin owns arms and hands`).toBeGreaterThan(0);
  expect(model.armPose.bones.map(({ side, role, sourceBone, bone }: any) => ({ side, role, sourceBone, bone })), `${label}: both complete authored arm chains`)
    .toEqual(ARM_BONES.map(({ minimumBindRadians: _minimum, ...bone }) => bone));
  for (const [index, bone] of model.armPose.bones.entries()) {
    const expected = ARM_BONES[index];
    expect(bone.finite, `${label}: ${bone.bone} finite transform`).toBe(true);
    expect(bone.inEffectivelyVisibleSkinnedMesh, `${label}: ${bone.bone} drives a visible skin`).toBe(true);
    expect(bone.effectiveSkinnedMeshes, `${label}: ${bone.bone} shares a rendered skeleton`)
      .toEqual(expect.arrayContaining(model.armPose.commonEffectiveSkinnedMeshes));
    expect(bone.vertexInfluence, `${label}: ${bone.bone} has real rendered JOINTS_0/WEIGHTS_0 influence`).toMatchObject({
      contract: 'rendered-joints0-weights0-influence-v1',
      thresholds: RENDERED_INFLUENCE_THRESHOLDS,
      passes: true,
    });
    expect(bone.vertexInfluence.influencedVertexCount).toBeGreaterThanOrEqual(RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices);
    expect(bone.vertexInfluence.maximumNormalizedWeight).toBeGreaterThanOrEqual(RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight);
    expect(bone.bindQuaternionDeltaRadians, `${label}: ${bone.bone} leaves authored T/bind pose`)
      .toBeGreaterThanOrEqual(expected.minimumBindRadians);
  }
  expect(model.handPose.bones.map(({ side, digit, joint, sourceBone, bone }: any) => ({ side, digit, joint, sourceBone, bone })), `${label}: all ten shipped finger sentinels`)
    .toEqual(HAND_BONES.map(({ minimumBindRadians: _minimum, ...bone }) => bone));
  for (const [index, finger] of model.handPose.bones.entries()) {
    const expected = HAND_BONES[index];
    expect(finger.descendantOfWrist, `${label}: ${finger.bone} descends from ${finger.wristBone}`).toBe(true);
    expect(finger.wristDescendantPath, `${label}: ${finger.bone} has a real phalanx chain`).toHaveLength(3);
    expect(finger.wristDescendantPath[0]).toBe(finger.wristBone);
    expect(finger.wristDescendantPath.at(-1)).toBe(finger.bone);
    expect(finger.inEffectivelyVisibleSkinnedMesh, `${label}: ${finger.bone} drives the rendered hand`).toBe(true);
    expect(finger.vertexInfluence, `${label}: ${finger.bone} deforms rendered glove vertices`).toMatchObject({
      contract: 'rendered-joints0-weights0-influence-v1',
      thresholds: RENDERED_INFLUENCE_THRESHOLDS,
      passes: true,
    });
    expect(finger.vertexInfluence.influencedVertexCount).toBeGreaterThanOrEqual(RENDERED_INFLUENCE_THRESHOLDS.minimumInfluencedVertices);
    expect(finger.vertexInfluence.maximumNormalizedWeight).toBeGreaterThanOrEqual(RENDERED_INFLUENCE_THRESHOLDS.minimumMaximumNormalizedWeight);
    expect(finger.bindQuaternionDeltaRadians, `${label}: ${finger.bone} has a nontrivial authored pose`)
      .toBeGreaterThanOrEqual(expected.minimumBindRadians);
  }
  expect(model.armPose.chains).toHaveLength(2);
  for (const chain of model.armPose.chains) {
    expect(chain, `${label}: ${chain.side} shoulder/elbow/wrist-hand chain`).toMatchObject({ complete: true });
    const expectedBones = ARM_BONES.filter((bone) => bone.side === chain.side).map((bone) => bone.bone);
    expect(chain.hierarchyPath, `${label}: ${chain.side} real descendant hierarchy`).toEqual(expectedBones);
    expect(chain.directHierarchy, `${label}: ${chain.side} direct shoulder to elbow to wrist`).toBe(true);
    expect(chain.shoulderOutwardAxis, `${label}: ${chain.side} finite outward axis`).toHaveLength(3);
    expect(length(chain.shoulderOutwardAxis)).toBeCloseTo(1, 6);
    const observed = armGeometry(model, chain.side, chain);
    for (const [key, value] of Object.entries(observed)) {
      expect(chain[key], `${label}: independently recomputed ${chain.side} ${key}`).toBeCloseTo(value, 7);
    }
    expect(observed.upperArmLength).toBeGreaterThan(0.1);
    expect(observed.forearmLength).toBeGreaterThan(0.1);
    expect(observed.elbowFlexRadians, `${label}: ${chain.side} meaningful elbow bend`)
      .toBeGreaterThanOrEqual(ANTI_T_THRESHOLDS.minimumElbowFlexRadians);
    expect(observed.shoulderToWristVerticalDrop, `${label}: ${chain.side} wrist materially below shoulder`)
      .toBeGreaterThanOrEqual(ANTI_T_THRESHOLDS.minimumVerticalDropM);
    expect(observed.shoulderToWristVerticalDropRatio).toBeGreaterThanOrEqual(ANTI_T_THRESHOLDS.minimumVerticalDropRatio);
    expect(observed.shoulderToWristHorizontalReachRatio).toBeLessThanOrEqual(ANTI_T_THRESHOLDS.maximumHorizontalReachRatio);
    expect(observed.shoulderToWristOutwardReachRatio).toBeLessThanOrEqual(ANTI_T_THRESHOLDS.maximumOutwardReachRatio);
    expect(chain.antiTPoseGeometry, `${label}: ${chain.side} cannot be a horizontal T arm`).toBe(true);
  }
  if (armed) {
    expect(model.weaponChildren, `${label}: one mounted authored weapon`).toBe(1);
    expect(model.weaponMount, `${label}: direct finite authored weapon mount`).toMatchObject({
      directChild: true,
      finite: true,
      forwardCorrection: 'stable-body-mount-minus-z',
    });
    expect(model.weaponMount.modelId).toEqual(expect.any(String));
    expect(model.supportGrip, `${label}: both hands solve onto the weapon`).toMatchObject({
      bothHandsConnected: true,
      finite: true,
      torsoClear: true,
      torsoRelativeBendHint: true,
      socketName: 'support-socket-l',
      socketReference: {
        available: true,
        valid: true,
        sourceAsset: CARBINE_WORLD_ASSET,
        atomicSocket: 'leftGrip',
        sourceTransformValid: true,
        liveTargetContract: 'runtime-calibrated-from-authored-source-v1',
        calibrationApplied: true,
      },
      wristOrientation: { referenceAvailable: true, wristSourceAsset: OPERATOR_ASSET },
      dominantGrip: {
        finite: true,
        torsoClear: true,
        torsoRelativeBendHint: true,
        socketName: 'grip-socket-r',
        socketReference: {
          available: true,
          valid: true,
          sourceAsset: CARBINE_WORLD_ASSET,
          atomicSocket: 'rightGrip',
          sourceTransformValid: true,
          liveTargetContract: 'authored-source-socket-retained-v1',
          calibrationApplied: false,
        },
        wristOrientation: { referenceAvailable: true, wristSourceAsset: OPERATOR_ASSET },
      },
      fingerCurl: {
        contract: 'pass65-evaluated-per-digit-grip-curl-v3',
        sourceReferenceAvailable: true,
        expectedBoneCount: 10,
        bothHands: true,
        allAtOrAboveRequiredBindFloor: true,
        allApplied: true,
      },
    });
    for (const grip of [model.supportGrip, model.supportGrip.dominantGrip]) {
      const socketReference = CARBINE_SOCKET_REFERENCES[grip.socketName as keyof typeof CARBINE_SOCKET_REFERENCES];
      const delta = (actual: number[], expected: readonly number[]) => (
        Math.hypot(...actual.map((value, index) => value - expected[index]))
      );
      expect(grip.supportError, `${label}: grip reaches evaluated weapon-specific socket`).toBeLessThanOrEqual(GRIP_THRESHOLDS.maximumPositionErrorM);
      expect(grip.minimumOutwardClearance, `${label}: nonzero torso clearance floor`).toBeGreaterThan(0);
      expect(grip.elbowTorsoOutward, `${label}: elbow remains outward of torso floor`)
        .toBeGreaterThanOrEqual(grip.minimumOutwardClearance);
      expect(delta(grip.socketReference.authoredSourceLocalPosition, socketReference.authoredLocalPosition), `${label}: immutable imported socket position matches shipped GLB`).toBeLessThanOrEqual(1e-9);
      expect(delta(grip.socketReference.observedImportedSourceLocalPosition, socketReference.authoredLocalPosition), `${label}: source transform was observed before calibration`).toBeLessThanOrEqual(1e-6);
      expect(grip.socketReference.sourcePositionErrorM, `${label}: imported source position validation`).toBeLessThanOrEqual(1e-6);
      expect(grip.socketReference.sourceQuaternionErrorRadians, `${label}: imported source rotation validation`).toBeLessThanOrEqual(1e-6);
      expect(grip.socketReference.liveTargetContract).toBe(socketReference.liveTargetContract);
      expect(grip.socketReference.calibrationApplied).toBe(socketReference.calibrationApplied);
      expect(grip.socketReference.calibrationReason).toBe(socketReference.calibrationReason);
      expect(delta(grip.socketReference.evaluatedTargetLocalPosition, socketReference.evaluatedTargetLocalPosition), `${label}: evaluated live target is versioned independently`).toBeLessThanOrEqual(1e-9);
      expect(grip.socketReference.liveTargetPositionErrorM, `${label}: live socket position stays on evaluated target`).toBeLessThanOrEqual(1e-6);
      expect(grip.socketReference.liveTargetQuaternionErrorRadians, `${label}: live socket rotation stays on evaluated target`).toBeLessThanOrEqual(1e-6);
      expect(grip.wristOrientation.errorRadians, `${label}: corrected wrist aligns to evaluated socket orientation`)
        .toBeLessThanOrEqual(GRIP_THRESHOLDS.maximumQuaternionErrorRadians);
    }
    const fingerCurl = model.supportGrip.fingerCurl;
    expect(fingerCurl.bones).toHaveLength(HAND_BONES.length);
    expect(fingerCurl.bindFloors, `${label}: all ten grip joints expose independent floor receipts`)
      .toHaveLength(HAND_BONES.length);
    expect(fingerCurl.bones.every(({ applied, curlRadians }: any) => applied === true && Math.abs(curlRadians) >= 0.18)).toBe(true);
    for (let index = 0; index < HAND_BONES.length; index += 1) {
      const expected = HAND_BONES[index];
      const minimumFloorRadians = CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS[expected.digit];
      const actual = model.handPose.bones.find(({ side, digit }: any) => side === expected.side && digit === expected.digit);
      const curlBone = fingerCurl.bones[index];
      const floor = fingerCurl.bindFloors[index];
      const jointLabel = `${label}: ${expected.bone}`;
      expect(minimumFloorRadians, `${jointLabel} product floor exceeds independent evidence threshold`)
        .toBeGreaterThan(expected.minimumBindRadians);
      expect(curlBone, `${jointLabel} nominal curl owns matching floor receipt`).toMatchObject({
        side: expected.side,
        digit: expected.digit,
        bone: expected.bone,
        applied: true,
        bindRelativeFloor: floor,
      });
      expect(floor, `${jointLabel} receipts the rendered joint`).toMatchObject({
        contract: 'post-mixer-authored-bind-relative-hand-floor-v1',
        allocationContract: 'persistent-per-rendered-hand-bone-v1',
        reference: 'immutable-authored-handBindPose-before-animation',
        side: expected.side,
        digit: expected.digit,
        sourceBone: expected.sourceBone,
        bone: expected.bone,
        minimumBindDeltaRadians: minimumFloorRadians,
        appliedToRenderedBone: true,
        allFinite: true,
      });
      expect(Number.isInteger(floor.generation) && floor.generation > 0, `${jointLabel} persistent receipt generation`).toBe(true);
      expect(floor.afterBindDeltaRadians, `${jointLabel} post-mixer floor`)
        .toBeGreaterThanOrEqual(minimumFloorRadians - 1e-9);
      const bindNorm = Math.hypot(...floor.bindLocalQuaternion);
      const expectedFloorTargetAngle = 2 * Math.acos(Math.cos(minimumFloorRadians / 2) / bindNorm);
      expect(floor.bindQuaternionNorm, `${jointLabel} immutable float32 bind norm`).toBeCloseTo(bindNorm, 12);
      expect(floor.floorTargetRelativeAngleRadians, `${jointLabel} compensated floor target`).toBeCloseTo(expectedFloorTargetAngle, 12);
      expect(floor.bindNormCompensationRadians, `${jointLabel} bind-norm compensation`).toBeCloseTo(
        expectedFloorTargetAngle - minimumFloorRadians,
        12,
      );
      expect(floor.beforeBindDeltaRadians, `${jointLabel} independently recomputed pre-floor delta`).toBeCloseTo(
        quaternionDelta(floor.beforeLocalQuaternion, floor.bindLocalQuaternion),
        9,
      );
      expect(floor.afterBindDeltaRadians, `${jointLabel} independently recomputed post-floor delta`).toBeCloseTo(
        quaternionDelta(floor.afterLocalQuaternion, floor.bindLocalQuaternion),
        9,
      );
      expect(floor.reportedBindDeltaCorrectionRadians, `${jointLabel} bounded reported correction`).toBeCloseTo(
        floor.intervened ? minimumFloorRadians - floor.beforeBindDeltaRadians : 0,
        9,
      );
      expect(floor.renderedOrientationCorrectionRadians, `${jointLabel} actual rendered correction`).toBeCloseTo(
        normalizedQuaternionDelta(floor.beforeLocalQuaternion, floor.afterLocalQuaternion),
        9,
      );
      const independentlyDerivedBefore = shortestBindRelativeRotation(
        floor.bindLocalQuaternion,
        floor.beforeLocalQuaternion,
      );
      if (independentlyDerivedBefore.axis === null) {
        expect(floor.observedShortestRelativeAxis, `${jointLabel} exact bind has no fabricated observed axis`).toBeNull();
      } else {
        expect(floor.observedShortestRelativeAxis, `${jointLabel} exposes independently derivable pre-floor axis`).not.toBeNull();
        expect(dot(independentlyDerivedBefore.axis, floor.observedShortestRelativeAxis), `${jointLabel} claimed observed axis equals bind^-1 * before`)
          .toBeGreaterThanOrEqual(1 - 1e-9);
      }
      expect(length(floor.appliedAxis), `${jointLabel} applied projection axis is unit length`).toBeCloseTo(1, 9);
      const independentlyExpectedAfter = floor.intervened
        ? projectedBindFloorQuaternion(
          floor.bindLocalQuaternion,
          floor.appliedAxis,
          floor.floorTargetRelativeAngleRadians,
        )
        : normalizedQuaternion(floor.beforeLocalQuaternion);
      expect(normalizedQuaternionDelta(independentlyExpectedAfter, floor.afterLocalQuaternion), `${jointLabel} after transform is bind * axis-angle projection`)
        .toBeLessThanOrEqual(1e-9);
      const independentlyExpectedRenderedCorrection = floor.intervened
        ? floor.alignedObservedAxisHemisphere
          ? floor.floorTargetRelativeAngleRadians + independentlyDerivedBefore.radians
          : Math.abs(floor.floorTargetRelativeAngleRadians - independentlyDerivedBefore.radians)
        : 0;
      expect(floor.renderedOrientationCorrectionRadians, `${jointLabel} correction matches independent projection geometry`)
        .toBeCloseTo(independentlyExpectedRenderedCorrection, 9);
      expect(floor.preservedShortestRelativeAxis, `${jointLabel} shortest-axis continuity`)
        .toBe(floor.observedShortestRelativeAxis === null && floor.intervened ? null : true);
      expect(typeof floor.alignedObservedAxisHemisphere, `${jointLabel} reports signed-zero continuity alignment`).toBe('boolean');
      if (floor.observedShortestRelativeAxis !== null) {
        expect(floor.usedPreviousAxis, `${jointLabel} observed axis is applied directly or sign-aligned`).toBe(false);
        expect(floor.usedFallbackAxis, `${jointLabel} observed axis does not use fallback`).toBe(false);
        const observedAppliedDot = floor.observedShortestRelativeAxis.reduce(
          (sum: number, component: number, axisIndex: number) => sum + component * floor.appliedAxis[axisIndex],
          0,
        );
        expect(Math.abs(observedAppliedDot), `${jointLabel} applied axis stays on the observed shortest axis line`)
          .toBeGreaterThanOrEqual(1 - 1e-9);
        if (floor.alignedObservedAxisHemisphere) {
          expect(floor.intervened, `${jointLabel} only sub-floor poses may align axis hemisphere`).toBe(true);
          expect(observedAppliedDot, `${jointLabel} alignment flips the raw shortest-axis hemisphere`).toBeLessThan(0);
          expect(floor.axisSource, `${jointLabel} names the cached continuity reference`)
            .toBe('shortest-bind-relative-aligned-to-previous');
          expect(floor.continuityReference, `${jointLabel} receipts cached-axis continuity`)
            .toBe('previous-shortest-bind-relative');
        } else {
          expect(observedAppliedDot, `${jointLabel} unaligned observed axis is unchanged`).toBeGreaterThan(0);
          expect(floor.axisSource, `${jointLabel} raw observed-axis source`).toBe('shortest-bind-relative');
          expect(
            floor.intervened
              ? floor.continuityReference === null
                || floor.continuityReference === 'previous-shortest-bind-relative'
              : floor.continuityReference === null,
            `${jointLabel} truthful raw-axis continuity reference`,
          ).toBe(true);
        }
      } else {
        expect(floor.alignedObservedAxisHemisphere, `${jointLabel} exact bind cannot claim observed-axis alignment`).toBe(false);
        if (floor.usedPreviousAxis) {
          expect(floor.usedFallbackAxis).toBe(false);
          expect(floor.axisSource).toBe('previous-shortest-bind-relative');
          expect(floor.continuityReference).toBe(floor.intervened ? 'previous-shortest-bind-relative' : null);
        } else {
          expect(floor.usedFallbackAxis).toBe(true);
          expect(floor.axisSource).toBe('authored-curl-fallback');
          expect(floor.continuityReference).toBe(floor.intervened ? 'authored-curl-fallback' : null);
          expect(dot(floor.appliedAxis, [-1, 0, 0]), `${jointLabel} exact-bind fallback is the product curl axis`)
            .toBeGreaterThanOrEqual(1 - 1e-9);
        }
      }
      expect(floor.afterBindDeltaRadians, `${jointLabel} receipt equals actual handPose delta`).toBeCloseTo(
        actual.bindQuaternionDeltaRadians,
        9,
      );
      expect(normalizedQuaternionDelta(floor.afterLocalQuaternion, actual.localQuaternion), `${jointLabel} receipt is actual rendered quaternion`)
        .toBeLessThanOrEqual(1e-9);
      expect(normalizedQuaternionDelta(floor.bindLocalQuaternion, actual.bindLocalQuaternion), `${jointLabel} uses immutable authored bind`)
        .toBeLessThanOrEqual(1e-9);
    }
    const rightPinkyFloor = fingerCurl.bindFloors.find(({ side, digit }: any) => side === 'right' && digit === 'pinky');
    expect(fingerCurl.rightPinkyBindFloor, `${label}: compatibility alias is not an independent proof`)
      .toEqual(rightPinkyFloor);
  } else {
    expect(model.weaponChildren, `${label}: unarmed socket remains empty`).toBe(0);
    expect(model.weaponMount, `${label}: no mounted weapon`).toBeNull();
    expect(model.supportGrip, `${label}: no fabricated grip telemetry`).toBeNull();
    expect(model.meleeKnifeVisible, `${label}: hidden melee prop is not an armed dummy`).toBe(false);
  }
}

function poseMotion(first: any, second: any): Record<string, unknown> {
  const boneDeltas = ARM_BONES.map(({ side, role, bone }) => {
    const before = first.operatorModel.armPose.bones.find((entry: any) => entry.side === side && entry.role === role);
    const after = second.operatorModel.armPose.bones.find((entry: any) => entry.side === side && entry.role === role);
    return { side, role, bone, radians: quaternionDelta(before.localQuaternion, after.localQuaternion) };
  });
  return {
    positionM: positionDelta(first.position, second.position),
    boneDeltas,
    movingChains: (['left', 'right'] as const).map((side) => ({
      side,
      maximumRadians: Math.max(...boneDeltas.filter((entry) => entry.side === side).map((entry) => entry.radians)),
    })),
  };
}

function expectPoseMotion(motion: any, label: string, movingInWorld: boolean): void {
  if (movingInWorld) expect(motion.positionM, `${label}: target moves in world`).toBeGreaterThan(0.12);
  expect(motion.boneDeltas).toHaveLength(6);
  for (const chain of motion.movingChains) {
    expect(chain.maximumRadians, `${label}: ${chain.side} arm animation advances`).toBeGreaterThan(0.001);
  }
}

async function captureSurfaceEvidence(page: Page, testInfo: TestInfo, expectedMap: string): Promise<any> {
  const evidence = await page.evaluate(async (expectedRenderer) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    const gl = expectedRenderer === 'webgl2' ? canvas?.getContext('webgl2') ?? null : null;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const response = await fetch('/channels/the-big-one/channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Rigged-bot candidate provenance returned HTTP ${response.status}`);
    return {
      map: snapshot.arenaSelection.id,
      runtime: snapshot.render.runtime,
      contextLifecycle: snapshot.render.contextLifecycle,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
      servedCandidate: await response.json(),
      userAgent: navigator.userAgent,
      webgl: gl ? {
        adapterClass: 'WebGL2RenderingContext',
        unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null,
        version: String(gl.getParameter(gl.VERSION)),
      } : null,
    };
  }, renderer);
  expect(evidence.map, 'exact served arena').toBe(expectedMap);
  expect(evidence.runtimeErrorVisible, 'runtime error surface remains hidden').toBe(false);
  expect(evidence.runtime, 'exact renderer runtime').toMatchObject({
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    failClosed: false,
    softwareAdapter: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  expect(evidence.runtime.adapterLabel).toEqual(expect.any(String));
  expect(evidence.runtime.adapterLabel.trim().length).toBeGreaterThan(0);
  expect(evidence.runtime.adapterLabel).not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu);
  if (renderer === 'webgpu') {
    expect(evidence.runtime).toMatchObject({
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      presentation: { status: 'healthy' },
    });
  } else {
    expect(evidence.runtime).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
      presentation: { status: 'synchronous' },
    });
    expect(evidence.contextLifecycle).toEqual({ lost: false, losses: 0, restorations: 0 });
    expect(evidence.webgl).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
      unmaskedRenderer: evidence.runtime.adapterLabel,
    });
  }
  expect(evidence.servedCandidate).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 69',
    path: 'channels/the-big-one',
    sourceSha,
  });
  expect(evidence.servedCandidate.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(evidence.servedCandidate.exactRootFileCount).toEqual(expect.any(Number));
  expect(evidence.servedCandidate.exactRootFileCount).toBeGreaterThanOrEqual(2);
  if (officialEvidence) {
    expect(testInfo.project.name).toBe('chromium');
    expect(evidence.userAgent, 'installed Edge user agent').toMatch(/Edg\//u);
  }
  return evidence;
}

async function deploy(page: Page, map: 'atomic-acres' | 'gun-range'): Promise<void> {
  await page.goto(route(map, `pass69-3-rigged-bot-live-${map}`));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
}

type PrincipalWriteCaptureOptions = Readonly<{
  mode: 'visible-observe' | 'principal-write-suppressed' | 'visible-restored';
  sessionId?: string;
  reuseCaptureTargets?: boolean;
}>;

type CommitCaptureCameraOptions = Readonly<{
  principalWrite?: PrincipalWriteCaptureOptions;
  handSide?: 'left' | 'right';
}>;

async function commitCaptureCamera(
  page: Page,
  camera: RiggedEvidenceCamera,
  captureTargets: readonly CaptureActor[],
  fixedVisualTimeMs: number | null = null,
  options: CommitCaptureCameraOptions = {},
): Promise<any> {
  const principalWrite = options.principalWrite ?? null;
  const handSide = options.handSide ?? null;
  if (principalWrite !== null && handSide !== null) {
    throw new Error('Rigged evidence capture cannot combine hand self-occlusion and principal-write control');
  }
  const before = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const review = (api.snapshot() as any).deterministicReview;
    const presentation = api.samplePresentationTelemetry();
    return {
      captureFrame: review.presentedCapture?.frame ?? 0,
      captureRevision: review.captureCameraRevision,
      submissionSequence: presentation.submissionSequence,
      completedSequence: presentation.completedSequence,
    };
  });
  const configured = await page.evaluate(({ requested, targets, fixedTime, principal, requestedHandSide }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(true);
    if (principal?.reuseCaptureTargets !== true
      && !api.setRiggedEvidenceCaptureTargets(targets)) throw new Error('Rigged evidence capture target registration failed');
    if (!api.setRiggedEvidenceHandCaptureSide(requestedHandSide)) {
      throw new Error('Rigged evidence hand capture side registration failed');
    }
    const session = principal ? api.riggedEvidencePrincipalWriteSession() : null;
    if (principal?.sessionId !== undefined && session?.sessionId !== principal.sessionId) {
      throw new Error('Rigged evidence principal-write session identity changed');
    }
    const revision = api.setCaptureCameraPose(
      requested.position[0], requested.position[1], requested.position[2],
      requested.yaw, requested.pitch, requested.fov,
      fixedTime === null ? undefined : fixedTime,
    );
    if (principal && (!session || revision === null || !api.setRiggedEvidencePrincipalWriteMode(
      targets[0].kind,
      targets[0].id,
      session.sessionId,
      revision,
      principal.mode,
    ))) throw new Error('Rigged evidence principal-write control configuration failed');
    api.setRenderPaused(false);
    return { revision, principalSession: session };
  }, {
    requested: camera,
    targets: captureTargets,
    fixedTime: fixedVisualTimeMs,
    principal: principalWrite,
    requestedHandSide: handSide,
  });
  const requestedRevision = configured.revision;
  expect(requestedRevision, `${camera.id}: capture camera revision`).toEqual(expect.any(Number));
  expect(requestedRevision, `${camera.id}: capture revision advances from the sampled prior camera state`).toBeGreaterThan(
    before.captureRevision,
  );
  await page.waitForFunction(({ revision, beforeFrame, expected, targets, expectedPrincipalMode, requestedHandSide }) => {
    const review = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).deterministicReview;
    const committed = review.presentedCapture;
    const close = (left: number, right: number) => Math.abs(left - right) <= 1e-8;
    return committed?.contract === 'capture-camera-committed-frame-v2'
      && committed.frame > beforeFrame
      && committed.captureRevision === revision
      && JSON.stringify(committed.captureTargets) === JSON.stringify(targets)
      && committed.actors?.length === targets.length
      && committed.actors.every((actor: any) => actor.mainCameraDraw?.complete === true)
      && (expectedPrincipalMode === null || committed.actors.every((actor: any) => (
        actor.principalWriteControl?.complete === true
        && actor.principalWriteControl.mode === expectedPrincipalMode
        && actor.rasterRoi?.anchorAndSixteenJointsInside === true
      )))
      && (requestedHandSide === null || committed.handSelfOcclusion?.length === targets.length)
      && committed.position.every((value: number, index: number) => close(value, expected.position[index]))
      && close(committed.yaw, expected.yaw)
      && close(committed.pitch, expected.pitch)
      && close(committed.fov, expected.fov);
  }, {
    revision: requestedRevision,
    beforeFrame: before.captureFrame,
    expected: camera,
    targets: captureTargets,
    expectedPrincipalMode: principalWrite?.mode ?? null,
    requestedHandSide: handSide,
  }, { timeout: 5_000 });
  const committed = await page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).deterministicReview.presentedCapture
  ));
  expect(committed, `${camera.id}: exact renderer commit receipt`).toMatchObject({
    renderer,
    completionSemantics: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.rendererCompletion[renderer],
    submissionSequence: expect.any(Number),
    completedSequence: expect.any(Number),
  });
  expect(committed.captureTargets, `${camera.id}: exact ordered registered actors`).toEqual(captureTargets);
  expect(committed.actors.map(({ actor }: any) => actor), `${camera.id}: exact submitted-frame actor evidence`).toEqual(captureTargets);
  committed.actors.forEach((actorFrame: any, index: number) => expectExactMainCameraDrawReceipt(
    actorFrame,
    captureTargets[index],
    committed.frame,
    requestedRevision,
    `${camera.id}:committed:${captureTargets[index].kind}:${captureTargets[index].id}`,
  ));
  expectPresentationDrawIdentity(committed.actors, `${camera.id}:committed`);
  expect(normalizedQuaternionDelta(committed.quaternion, yxzCameraQuaternion(camera.yaw, camera.pitch)), `${camera.id}: rendered camera quaternion matches fixed yaw/pitch`).toBeLessThanOrEqual(1e-9);
  if (renderer === 'webgl2') {
    expect([committed.submissionSequence, committed.completedSequence], `${camera.id}: WebGL render return is synchronous`).toEqual([0, 0]);
  } else {
    expect(committed.completedSequence, `${camera.id}: commit completion does not exceed submission`).toBeLessThanOrEqual(
      committed.submissionSequence,
    );
  }
  const waitForLaterPresentedFrame = async (afterFrame: number): Promise<number> => {
    const frameHandle = await page.waitForFunction(({ revision, priorFrame }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const presentedGameplayFrame = api.admissionState().presentedGameplayFrame;
      const committedCapture = (api.snapshot() as any).deterministicReview.presentedCapture;
      return presentedGameplayFrame > priorFrame
        && committedCapture?.captureRevision === revision
        && committedCapture.frame === presentedGameplayFrame
        ? presentedGameplayFrame
        : false;
    }, { revision: requestedRevision, priorFrame: afterFrame }, { timeout: 8_000 });
    return await frameHandle.jsonValue() as number;
  };
  const firstLaterPresentedFrame = await waitForLaterPresentedFrame(committed.frame);
  const secondLaterPresentedFrame = await waitForLaterPresentedFrame(firstLaterPresentedFrame);
  const paused = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(true);
    const snapshot = api.snapshot() as any;
    return {
      frameCount: snapshot.frameCount,
      debugRenderPaused: snapshot.deterministicReview.debugRenderPaused,
      presentedCapture: snapshot.deterministicReview.presentedCapture,
      camera: snapshot.deterministicReview.captureCamera,
      admission: api.admissionState(),
      presentation: api.samplePresentationTelemetry(),
      fixedTimeMs: snapshot.deterministicReview.fixedTimeMs,
      rangeTargets: snapshot.rangePractice.targets,
    };
  });
  expect(paused.debugRenderPaused, `${camera.id}: renderer paused only after committed frame`).toBe(true);
  expect(paused.presentedCapture.captureRevision, `${camera.id}: paused frame retains requested camera`).toBe(requestedRevision);
  paused.presentedCapture.actors.forEach((actorFrame: any, index: number) => expectExactMainCameraDrawReceipt(
    actorFrame,
    captureTargets[index],
    paused.presentedCapture.frame,
    requestedRevision,
    `${camera.id}:paused:${captureTargets[index].kind}:${captureTargets[index].id}`,
  ));
  if (principalWrite) {
    const actorFrame = paused.presentedCapture.actors[0];
    expect(actorFrame.principalWriteControl, `${camera.id}: exact principal-write control receipt`).toMatchObject({
      contract: 'rigged-principal-write-control-v1',
      sessionId: configured.principalSession.sessionId,
      actor: captureTargets[0],
      frame: paused.presentedCapture.frame,
      captureRevision: requestedRevision,
      mode: principalWrite.mode,
      observedDrawCount: expect.any(Number),
      suppressionRestoredFinallyCount: 0,
      outstandingSuppressionCount: 0,
      renderCallFinalized: true,
      suppressionAppliedCountExact: true,
      materialStateRestored: true,
      failures: [],
      complete: true,
    });
    expect(actorFrame.principalWriteControl.observedDrawCount, `${camera.id}: nonempty principal draw manifest`).toBeGreaterThan(0);
    if (principalWrite.mode === 'principal-write-suppressed') {
      expect(actorFrame.principalWriteControl.suppressionAppliedCount, `${camera.id}: every admitted target draw suppressed`).toBe(
        actorFrame.principalWriteControl.observedDrawCount,
      );
      expect(actorFrame.principalWriteControl.suppressionRestoredAfterCount, `${camera.id}: every suppressed draw restored in callback`).toBe(
        actorFrame.principalWriteControl.observedDrawCount,
      );
      expect(actorFrame.principalWriteControl.suppressionEntries, `${camera.id}: exact per-draw suppression entries`).toHaveLength(
        actorFrame.principalWriteControl.observedDrawCount,
      );
      for (const entry of actorFrame.principalWriteControl.suppressionEntries) {
        expect(entry.suppressed, `${camera.id}: all three principal writes disabled`).toEqual({
          colorWrite: false,
          depthWrite: false,
          stencilWrite: false,
        });
        expect(entry.suppressedExactly, `${camera.id}: runtime observed exact suppressed state`).toBe(true);
        expect(entry.restoredBy, `${camera.id}: callback-local restoration`).toBe('after-render');
        expect(entry.after, `${camera.id}: exact original writes restored`).toEqual(entry.before);
        expect(entry.restoredExactly, `${camera.id}: runtime observed exact restored state`).toBe(true);
      }
    } else {
      expect(actorFrame.principalWriteControl.suppressionAppliedCount, `${camera.id}: visible mode makes no write mutation`).toBe(0);
      expect(actorFrame.principalWriteControl.suppressionRestoredAfterCount, `${camera.id}: visible mode has nothing to restore`).toBe(0);
      expect(actorFrame.principalWriteControl.suppressionEntries, `${camera.id}: visible mode has no suppression entries`).toEqual([]);
    }
    expect(actorFrame.rasterRoi, `${camera.id}: live deformed vertex raster ROI`).toMatchObject({
      contract: 'rigged-live-deformed-raster-roi-v1',
      viewport: {
        cssWidth: 1_600,
        cssHeight: 900,
        devicePixelRatio: 1,
        drawingBufferWidth: 1_600,
        drawingBufferHeight: 900,
      },
      anchorAndSixteenJointsInside: true,
    });
    expect(actorFrame.rasterRoi.deformedVertexCount, `${camera.id}: live deformed vertices projected`).toBeGreaterThan(0);
    expect(actorFrame.rasterRoi.joints, `${camera.id}: anchor plus exact sixteen joints`).toHaveLength(16);
    expect([...actorFrame.rasterRoi.meshNames].sort(), `${camera.id}: exact nine ROI meshes`).toEqual(
      [...EXPECTED_MAIN_CAMERA_DRAW_MESH_NAMES].sort(),
    );
    expect([...actorFrame.rasterRoi.meshUuids].sort(), `${camera.id}: ROI mesh UUIDs bind admitted draw`).toEqual(
      actorFrame.mainCameraDraw.meshes.map(({ meshUuid }: any) => meshUuid).sort(),
    );
    const extrema = actorFrame.rasterRoi.projectedPixelExtrema;
    expect(actorFrame.rasterRoi, `${camera.id}: exact no-padding half-open live-vertex ROI`).toMatchObject({
      rounding: 'floor-min-ceil-max-half-open',
      paddingPixels: 0,
      roi: {
        minX: Math.floor(extrema.minX),
        minY: Math.floor(extrema.minY),
        maxXExclusive: Math.ceil(extrema.maxX),
        maxYExclusive: Math.ceil(extrema.maxY),
      },
      deformedVertexProjectionDigest: {
        algorithm: 'fnv1a32-pair-ordered-float64-v1',
        value: expect.stringMatching(/^[a-f0-9]{16}$/u),
      },
    });
    expect(actorFrame.rasterRoi.joints.map(({ kind, side, role, digit, joint, bone }: any) => (
      { kind, side, role, digit, joint, bone }
    )), `${camera.id}: exact ROI joint identities`).toEqual(actorFrame.jointScreenPositions.map(({
      kind, side, role, digit, joint, bone,
    }: any) => ({ kind, side, role, digit, joint, bone })));
  }
  expectPresentationDrawIdentity(paused.presentedCapture.actors, `${camera.id}:paused`);
  paused.presentedCapture.actors.forEach((actorFrame: any, index: number) => {
    const committedActor = committed.actors[index];
    expect(actorFrame.rootUuid, `${camera.id}: stable registered actor wrapper`).toBe(committedActor.rootUuid);
    expect(actorFrame.operatorRootUuid, `${camera.id}: stable resolved operator root`).toBe(committedActor.operatorRootUuid);
    expect(actorFrame.mainCameraDraw.gameplaySceneUuid, `${camera.id}: stable gameplay scene`).toBe(
      committedActor.mainCameraDraw.gameplaySceneUuid,
    );
    expect(actorFrame.mainCameraDraw.gameplayCameraUuid, `${camera.id}: stable gameplay camera`).toBe(
      committedActor.mainCameraDraw.gameplayCameraUuid,
    );
    const meshIdentity = (frameActor: any) => frameActor.mainCameraDraw.meshes
      .map(({ meshName, meshUuid, materialSlotUuids }: any) => [meshName, meshUuid, materialSlotUuids])
      .sort((left: any[], right: any[]) => left[0].localeCompare(right[0]));
    expect(meshIdentity(actorFrame), `${camera.id}: stable per-actor mesh/material-slot identity`).toEqual(
      meshIdentity(committedActor),
    );
  });
  expect(paused.presentedCapture, `${camera.id}: paused renderer commit semantics`).toMatchObject({
    renderer,
    completionSemantics: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.rendererCompletion[renderer],
  });
  expect(paused.presentedCapture.frame, `${camera.id}: committed frame is monotonic`).toBeGreaterThanOrEqual(committed.frame);
  expect(paused.presentedCapture.actors.map(({ actor }: any) => actor), `${camera.id}: paused actor order remains exact`)
    .toEqual(captureTargets);
  for (let index = 0; index < captureTargets.length; index += 1) {
    expect(
      paused.presentedCapture.actors[index].canonicalOperatorSkinManifest,
      `${camera.id}:${captureTargets[index].id}: canonical operator identity persists from committed to paused frame`,
    ).toEqual(committed.actors[index].canonicalOperatorSkinManifest);
  }
  expect(committed.completedSequence, `${camera.id}: committed completion frontier follows baseline`).toBeGreaterThanOrEqual(
    before.completedSequence,
  );
  expect(paused.presentedCapture.completedSequence, `${camera.id}: paused completion frontier follows committed`).toBeGreaterThanOrEqual(
    committed.completedSequence,
  );
  expect(firstLaterPresentedFrame, `${camera.id}: first later presented gameplay frame`).toBeGreaterThan(committed.frame);
  expect(secondLaterPresentedFrame, `${camera.id}: second distinct later presented gameplay frame`).toBeGreaterThan(
    firstLaterPresentedFrame,
  );
  expect(paused.admission.presentedGameplayFrame, `${camera.id}: paused presentation is the latest committed capture`).toBe(
    paused.presentedCapture.frame,
  );
  expect(paused.admission.presentedGameplayFrame, `${camera.id}: two distinct later gameplay presentations`).toBeGreaterThanOrEqual(
    secondLaterPresentedFrame,
  );
  const completionBeforeBoundaries = await page.evaluate(async () => (
    window.__ATOMIC_ACRES_DEBUG__.awaitRiggedEvidenceCaptureCompletion()
  ));
  expect(completionBeforeBoundaries.submissionSequence, `${camera.id}: completion fence does not submit another frame`).toBe(
    paused.presentedCapture.submissionSequence,
  );
  expect(completionBeforeBoundaries.completedSequence, `${camera.id}: fence completion cannot exceed its submission`).toBeLessThanOrEqual(
    completionBeforeBoundaries.submissionSequence,
  );
  expect(completionBeforeBoundaries.completedSequence, `${camera.id}: fence completion follows paused receipt`).toBeGreaterThanOrEqual(
    paused.presentedCapture.completedSequence,
  );
  if (renderer === 'webgpu') {
    expect(completionBeforeBoundaries.completedSequence, `${camera.id}: explicit fence covers final paused submission`).toBeGreaterThanOrEqual(
      paused.presentedCapture.submissionSequence,
    );
    expect(completionBeforeBoundaries.completedSequence, `${camera.id}: explicit completion frontier advances`).toBeGreaterThan(
      before.completedSequence,
    );
  }
  for (let boundary = 0;
    boundary < RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.compositorBoundariesAfterCommit;
    boundary += 1) {
    await page.evaluate(() => new Promise<void>((resolveBoundary) => requestAnimationFrame(() => resolveBoundary())));
  }
  const afterBoundaries = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot() as any;
    return {
      frameCount: snapshot.frameCount,
      debugRenderPaused: snapshot.deterministicReview.debugRenderPaused,
      presentedCapture: snapshot.deterministicReview.presentedCapture,
      admission: api.admissionState(),
      presentation: api.samplePresentationTelemetry(),
    };
  });
  expect(afterBoundaries.debugRenderPaused, `${camera.id}: submissions stay paused through compositor boundaries`).toBe(true);
  expect(afterBoundaries.presentedCapture.frame, `${camera.id}: compositor boundary does not replace final frame`).toBe(
    paused.presentedCapture.frame,
  );
  expect(afterBoundaries.presentedCapture.submissionSequence, `${camera.id}: final renderer submission stays frozen`).toBe(
    paused.presentedCapture.submissionSequence,
  );
  expect(afterBoundaries.admission.presentedGameplayFrame, `${camera.id}: final gameplay presentation stays frozen`).toBe(
    paused.admission.presentedGameplayFrame,
  );
  expect(afterBoundaries.presentation.completedSequence, `${camera.id}: observed completion cannot exceed frozen submission`).toBeLessThanOrEqual(
    afterBoundaries.presentation.submissionSequence,
  );
  expect(afterBoundaries.presentation.completedSequence, `${camera.id}: observed completion follows explicit fence`).toBeGreaterThanOrEqual(
    completionBeforeBoundaries.completedSequence,
  );
  if (renderer === 'webgpu') {
    expect(afterBoundaries.presentation.completedSequence, `${camera.id}: completion covers final paused WebGPU submission`).toBeGreaterThanOrEqual(
      paused.presentedCapture.submissionSequence,
    );
    expect(afterBoundaries.presentation.completedSequence, `${camera.id}: WebGPU completion frontier advances`).toBeGreaterThan(
      before.completedSequence,
    );
  }
  const rasterState = {
    camera: {
      position: paused.presentedCapture.position,
      quaternion: paused.presentedCapture.quaternion,
      yaw: paused.presentedCapture.yaw,
      pitch: paused.presentedCapture.pitch,
      fov: paused.presentedCapture.fov,
      near: paused.presentedCapture.near,
      far: paused.presentedCapture.far,
    },
    fixedTimeMs: paused.fixedTimeMs,
    targetPose: paused.presentedCapture.actors.map((actor: any) => ({
      actor: actor.actor,
      rootUuid: actor.rootUuid,
      operatorRootUuid: actor.operatorRootUuid,
      rootPosition: actor.rootPosition,
      rootYaw: actor.rootYaw,
      projectedWorldPosition: actor.projectedWorldPosition,
      jointScreenPositions: actor.jointScreenPositions,
    })),
    rangeTargets: canonicalRangeRasterTargets(paused.rangeTargets),
  };
  return {
    contract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.contract,
    order: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.order,
    fixtureCamera: camera,
    priorCaptureRevision: before.captureRevision,
    requestedRevision,
    principalWriteSession: configured.principalSession,
    committed,
    pausedPresentedCapture: paused.presentedCapture,
    completion: {
      contract: 'renderer-presentation-completion-v1',
      required: renderer === 'webgpu',
      renderer,
      semantics: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.rendererCompletion[renderer],
      baselineSubmissionSequence: before.submissionSequence,
      baselineCompletedSequence: before.completedSequence,
      finalPausedSubmissionSequence: paused.presentedCapture.submissionSequence,
      fenceSubmissionSequence: completionBeforeBoundaries.submissionSequence,
      fenceCompletedSequence: completionBeforeBoundaries.completedSequence,
      observedSubmissionSequence: afterBoundaries.presentation.submissionSequence,
      observedCompletedSequence: afterBoundaries.presentation.completedSequence,
      coversFinalPausedSubmission: renderer === 'webgl2'
        || afterBoundaries.presentation.completedSequence >= paused.presentedCapture.submissionSequence,
      completedBeforeCompositorBoundaries: true,
    },
    presentedGameplayFramesAfterCommit: [firstLaterPresentedFrame, secondLaterPresentedFrame],
    pausedPresentedGameplayFrame: paused.admission.presentedGameplayFrame,
    compositorBoundariesAfterCommit: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.compositorBoundariesAfterCommit,
    pausedAtFrameCount: afterBoundaries.frameCount,
    rasterState,
    rasterStateDigests: principalWrite ? rasterStateDigests(rasterState, captureTargets[0].id) : null,
  };
}

async function sampleRequiredLineOfSight(
  page: Page,
  actor: CaptureActor,
  presentation: any,
  framing: any,
): Promise<any> {
  const lineOfSight = await page.evaluate((requestedActor) => (
    window.__ATOMIC_ACRES_DEBUG__.sampleRiggedEvidenceLineOfSight(requestedActor.kind, requestedActor.id)
  ), actor);
  const label = `${actor.kind}:${actor.id}:actual-render-line-of-sight`;
  expect(lineOfSight, label).toMatchObject({
    contract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.los.contract,
    actor,
    actorSelfOcclusionExcluded: true,
    allClear: true,
    captureFrame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.requestedRevision,
    captureSubmissionSequence: presentation.pausedPresentedCapture.submissionSequence,
    cameraPresentation: {
      contract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.contract,
      captureRevision: presentation.requestedRevision,
    },
  });
  expect(lineOfSight.renderOccluderCount, `${label}: sampled actual renderables`).toBeGreaterThan(0);
  expect(lineOfSight.sentinels.map(({ name }: any) => name), `${label}: exact sentinel contract`).toEqual(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.los.sentinels,
  );
  expect(framing.frame, `${label}: framing and LOS share final submitted frame`).toBe(lineOfSight.captureFrame);
  expect(framing.captureRevision, `${label}: framing and LOS share camera revision`).toBe(lineOfSight.captureRevision);
  for (let index = 0; index < lineOfSight.sentinels.length; index += 1) {
    const sentinel = lineOfSight.sentinels[index];
    const frameSentinel = framing.evidenceSentinels[index];
    expect(sentinel, `${label}:${sentinel.name}`).toMatchObject({ present: true, clear: true, blocker: null });
    expect(sentinel.name, `${label}:${sentinel.name}: frame sentinel identity`).toBe(frameSentinel.name);
    expect(sentinel.bone, `${label}:${sentinel.name}: frame bone identity`).toBe(frameSentinel.bone);
    expect(sentinel.worldPosition, `${label}:${sentinel.name}: exact final-frame world point`).toEqual(
      frameSentinel.worldPosition,
    );
    expect(sentinel.worldPosition, `${label}:${sentinel.name}: finite world point`).toHaveLength(3);
    expect(sentinel.worldPosition.every(Number.isFinite), `${label}:${sentinel.name}: finite world point`).toBe(true);
    expect(sentinel.targetDistanceM, `${label}:${sentinel.name}: exact sampled ray distance`).toBeGreaterThan(0.025);
  }
  return lineOfSight;
}

async function sampleRequiredHandSelfOcclusion(
  page: Page,
  actor: CaptureActor,
  side: 'left' | 'right',
  presentation: any,
  framing: any,
): Promise<any> {
  const selfOcclusion = await page.evaluate(({ requestedActor, requestedSide }) => (
    window.__ATOMIC_ACRES_DEBUG__.sampleRiggedEvidenceHandSelfOcclusion(
      requestedActor.kind,
      requestedActor.id,
      requestedSide,
    )
  ), { requestedActor: actor, requestedSide: side });
  const contract = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.handSelfOcclusion;
  const label = `${actor.kind}:${actor.id}:${side}-hand-self-occlusion`;
  expect(selfOcclusion, label).toMatchObject({
    ...contract,
    actor,
    side,
    heldWeaponIncluded: true,
    orderValid: true,
    allClear: true,
    captureFrame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.requestedRevision,
    captureSubmissionSequence: presentation.pausedPresentedCapture.submissionSequence,
    cameraPresentation: {
      contract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.contract,
      captureRevision: presentation.requestedRevision,
      submissionSequence: presentation.pausedPresentedCapture.submissionSequence,
    },
  });
  const { cameraPresentation, ...sampledCachedFields } = selfOcclusion;
  const cachedMatches = presentation.pausedPresentedCapture.handSelfOcclusion.filter((candidate: any) => (
    candidate.actor.kind === actor.kind && candidate.actor.id === actor.id && candidate.side === side
  ));
  expect(cachedMatches, `${label}: one cached same-frame receipt`).toHaveLength(1);
  expect(sampledCachedFields, `${label}: sampled receipt is the cached submitted record`).toEqual(cachedMatches[0]);
  expect(cameraPresentation, `${label}: exact cached camera presentation`).toEqual(
    presentation.pausedPresentedCapture,
  );
  const frameActorMatches = presentation.pausedPresentedCapture.actors.filter((candidate: any) => (
    candidate.actor.kind === actor.kind && candidate.actor.id === actor.id
  ));
  expect(frameActorMatches, `${label}: one exact submitted-frame actor`).toHaveLength(1);
  const frameManifest = frameActorMatches[0].canonicalOperatorSkinManifest;
  expect(canonicalOperatorSkinManifestValid(frameManifest), `${label}: fixed canonical operator skin manifest`).toBe(true);
  expect(selfOcclusion.canonicalOperatorSkinManifest, `${label}: hand receipt binds submitted canonical asset`).toEqual(
    frameManifest,
  );
  expect(selfOcclusion.actorOccluderCount, `${label}: actor render geometry included`).toBeGreaterThan(0);
  expect(selfOcclusion.heldWeaponOccluderCount, `${label}: held weapon render geometry included`).toBeGreaterThan(0);
  for (const [field, value] of [
    ['renderOccluderCount', selfOcclusion.renderOccluderCount],
    ['actorOccluderCount', selfOcclusion.actorOccluderCount],
    ['heldWeaponOccluderCount', selfOcclusion.heldWeaponOccluderCount],
  ] as const) {
    expect(Number.isSafeInteger(value), `${label}: ${field} safe integer`).toBe(true);
  }
  expect(selfOcclusion.heldWeaponOccluderCount, `${label}: held weapon subset of actor geometry`)
    .toBeLessThanOrEqual(selfOcclusion.actorOccluderCount);
  expect(selfOcclusion.actorOccluderCount, `${label}: actor subset of render geometry`)
    .toBeLessThanOrEqual(selfOcclusion.renderOccluderCount);
  expect(selfOcclusion.camera, `${label}: exact submitted camera telemetry`).toEqual({
    position: presentation.pausedPresentedCapture.position,
    quaternion: presentation.pausedPresentedCapture.quaternion,
    fov: presentation.pausedPresentedCapture.fov,
    captureRevision: presentation.pausedPresentedCapture.captureRevision,
  });
  expect(selfOcclusion.sentinels.map(({ name }: any) => name), `${label}: exact hand sentinel order`).toEqual(
    contract.sentinelNames,
  );
  expect(framing.frame, `${label}: framing shares final submitted frame`).toBe(selfOcclusion.captureFrame);
  expect(framing.captureRevision, `${label}: framing shares camera revision`).toBe(selfOcclusion.captureRevision);
  for (const sentinel of selfOcclusion.sentinels) {
    expect(sentinel, `${label}:${sentinel.name}`).toMatchObject({ present: true, clear: true });
    const expectedTargetDistanceM = positionDelta(selfOcclusion.camera.position, sentinel.worldPosition);
    expect(scaleAwareEqual(
      sentinel.targetDistanceM,
      expectedTargetDistanceM,
      [...selfOcclusion.camera.position, ...sentinel.worldPosition],
    ), `${label}:${sentinel.name}: independently recomputed target distance`).toBe(true);
    if (sentinel.blocker === null) {
      expect(sentinel.reason, `${label}:${sentinel.name}: explicit clear-ray reason`).toBe(
        'no-hit-before-hand-sentinel',
      );
      continue;
    }
    const blocker = sentinel.blocker;
    expect(blocker, `${label}:${sentinel.name}: terminal provenance`).toMatchObject({
      clear: true,
      reason: 'terminal-hand-surface',
      sameActor: true,
      heldWeapon: false,
      canonicalOperatorSkinnedMesh: true,
      requestedSide: side,
      requestedWrist: side === 'left' ? 'WristL' : 'WristR',
      requestedWristMatchesSide: true,
      faceHandOwned: true,
      cameraInsideOpaqueGeometry: false,
    });
    expect(typeof blocker.mesh, `${label}:${sentinel.name}: canonical mesh name`).toBe('string');
    expect((blocker.mesh as string).length, `${label}:${sentinel.name}: nonempty mesh name`).toBeGreaterThan(0);
    expect(blocker.name, `${label}:${sentinel.name}: mesh identity`).toBe(blocker.mesh);
    expect([blocker.face?.a, blocker.face?.b, blocker.face?.c].every((vertex) => (
      Number.isSafeInteger(vertex) && vertex >= 0
    )), `${label}:${sentinel.name}: exact nonnegative integer triangle`).toBe(true);
    expect(Number.isSafeInteger(blocker.materialIndex), `${label}:${sentinel.name}: material index`).toBe(true);
    expect(blocker.materialIndex, `${label}:${sentinel.name}: nonnegative material index`).toBeGreaterThanOrEqual(0);
    expect(blocker.hitPointWorld, `${label}:${sentinel.name}: hit point`).toHaveLength(3);
    expect(blocker.hitPointWorld.every(Number.isFinite), `${label}:${sentinel.name}: finite hit point`).toBe(true);
    expect(Number.isFinite(blocker.distanceM) && blocker.distanceM >= 0, `${label}:${sentinel.name}: hit distance`).toBe(true);
    expect(scaleAwareEqual(
      blocker.targetDistanceM,
      expectedTargetDistanceM,
      [blocker.targetDistanceM, expectedTargetDistanceM],
    ), `${label}:${sentinel.name}: blocker target distance`).toBe(true);
    const rawTerminalDeltaM = blocker.targetDistanceM - blocker.distanceM;
    const terminalBoundaryDistanceM = blocker.targetDistanceM - contract.terminalHandToleranceM;
    const terminalWithinTolerance = blocker.distanceM >= terminalBoundaryDistanceM
      && blocker.distanceM <= blocker.targetDistanceM;
    const expectedTerminalBoundaryComparisonM = terminalWithinTolerance
      && rawTerminalDeltaM > contract.terminalHandToleranceM
      ? contract.terminalHandToleranceM
      : rawTerminalDeltaM;
    expect(terminalWithinTolerance, `${label}:${sentinel.name}: exact terminal distance boundary`).toBe(true);
    expect(scaleAwareEqual(
      blocker.terminalDeltaM,
      rawTerminalDeltaM,
      [blocker.distanceM, blocker.terminalDeltaM, blocker.targetDistanceM],
    ), `${label}:${sentinel.name}: raw terminal delta arithmetic`).toBe(true);
    expect(blocker.terminalDeltaM, `${label}:${sentinel.name}: nonnegative raw terminal delta`).toBeGreaterThanOrEqual(0);
    expect(scaleAwareEqual(
      blocker.terminalBoundaryComparisonM,
      expectedTerminalBoundaryComparisonM,
      [blocker.terminalBoundaryComparisonM, expectedTerminalBoundaryComparisonM, blocker.targetDistanceM],
    ), `${label}:${sentinel.name}: comparison-normalized terminal delta`).toBe(true);
    expect(blocker.terminalBoundaryComparisonM, `${label}:${sentinel.name}: exact terminal tolerance`).toBeLessThanOrEqual(
      contract.terminalHandToleranceM,
    );
    const hitPointDistanceM = positionDelta(blocker.hitPointWorld, sentinel.worldPosition);
    const cameraToHitDistanceM = positionDelta(selfOcclusion.camera.position, blocker.hitPointWorld);
    const cameraToTarget = subtract(sentinel.worldPosition, selfOcclusion.camera.position);
    const cameraToHit = subtract(blocker.hitPointWorld, selfOcclusion.camera.position);
    const rayParameter = dot(cameraToHit, cameraToTarget) / (expectedTargetDistanceM * expectedTargetDistanceM);
    const rayProjection = selfOcclusion.camera.position.map((value: number, axis: number) => (
      value + cameraToTarget[axis] * rayParameter
    ));
    const rayLateralDistanceM = positionDelta(blocker.hitPointWorld, rayProjection);
    const representationScale = Math.max(
      1,
      blocker.targetDistanceM,
      blocker.distanceM,
      ...selfOcclusion.camera.position.map(Math.abs),
      ...blocker.hitPointWorld.map(Math.abs),
      ...sentinel.worldPosition.map(Math.abs),
    );
    const representationTolerance = Number.EPSILON * 16 * representationScale;
    const hitPointMatchesTerminalDelta = Math.abs(hitPointDistanceM - rawTerminalDeltaM) <= representationTolerance;
    const hitPointWithinTolerance = hitPointMatchesTerminalDelta
      && (hitPointDistanceM <= contract.terminalHandToleranceM
        || (terminalWithinTolerance
        && Math.abs(hitPointDistanceM - rawTerminalDeltaM) <= representationTolerance
        && rawTerminalDeltaM - contract.terminalHandToleranceM <= representationTolerance));
    const raySegmentValid = rayParameter >= 0 && rayParameter <= 1
      && rayLateralDistanceM <= representationTolerance
      && Math.abs(cameraToHitDistanceM - blocker.distanceM) <= representationTolerance;
    const expectedHitPointBoundaryComparisonM = hitPointWithinTolerance
      && hitPointDistanceM > contract.terminalHandToleranceM
      ? contract.terminalHandToleranceM
      : hitPointDistanceM;
    expect(hitPointWithinTolerance, `${label}:${sentinel.name}: exact hit-point boundary`).toBe(true);
    expect(scaleAwareEqual(
      blocker.cameraToHitDistanceM,
      cameraToHitDistanceM,
      [blocker.cameraToHitDistanceM, cameraToHitDistanceM, representationScale],
    ), `${label}:${sentinel.name}: independently recomputed camera-to-hit distance`).toBe(true);
    expect(scaleAwareEqual(
      blocker.rayParameter,
      rayParameter,
      [blocker.rayParameter, rayParameter],
    ), `${label}:${sentinel.name}: independently recomputed ray parameter`).toBe(true);
    expect(scaleAwareEqual(
      blocker.rayLateralDistanceM,
      rayLateralDistanceM,
      [blocker.rayLateralDistanceM, rayLateralDistanceM, representationScale],
    ), `${label}:${sentinel.name}: independently recomputed ray lateral distance`).toBe(true);
    expect(blocker.raySegmentValid, `${label}:${sentinel.name}: diagnostic ray classification`).toBe(raySegmentValid);
    expect(raySegmentValid, `${label}:${sentinel.name}: hit lies on finite camera-to-sentinel segment`).toBe(true);
    expect(scaleAwareEqual(
      blocker.hitPointToSentinelM,
      hitPointDistanceM,
      [...blocker.hitPointWorld, ...sentinel.worldPosition],
    ), `${label}:${sentinel.name}: hit-point distance`).toBe(true);
    expect(blocker.hitPointToSentinelM, `${label}:${sentinel.name}: nonnegative raw hit-point distance`)
      .toBeGreaterThanOrEqual(0);
    expect(scaleAwareEqual(
      blocker.hitPointBoundaryComparisonM,
      expectedHitPointBoundaryComparisonM,
      [blocker.hitPointBoundaryComparisonM, expectedHitPointBoundaryComparisonM, representationScale],
    ), `${label}:${sentinel.name}: comparison-normalized hit-point distance`).toBe(true);
    expect(blocker.hitPointBoundaryComparisonM, `${label}:${sentinel.name}: hit-point terminal tolerance`)
      .toBeLessThanOrEqual(contract.terminalHandToleranceM);
    expect(scaleAwareEqual(
      blocker.boundaryUlpAllowanceM,
      representationTolerance,
      [blocker.boundaryUlpAllowanceM, representationTolerance, representationScale],
    ), `${label}:${sentinel.name}: exact scale-aware ULP allowance`).toBe(true);
    expect(blocker.cameraInsideOpaqueGeometry, `${label}:${sentinel.name}: independent camera-inside classification`)
      .toBe(blocker.distanceM <= contract.cameraInsideOpaqueDistanceM);
    const faceInfluence = recomputeCanonicalFaceInfluence(blocker, frameManifest, side);
    expect(faceInfluence, `${label}:${sentinel.name}: independently recomputed canonical face influence`).not.toBeNull();
    expect(blocker.handOwnedDominantBoneCount, `${label}:${sentinel.name}: recomputed majority count`)
      .toBe(faceInfluence!.ownedCount);
    expect(faceInfluence!.faceHandOwned, `${label}:${sentinel.name}: recomputed hand-owned face majority`).toBe(true);
    expect(blocker.faceInfluenceProvenanceValid, `${label}:${sentinel.name}: diagnostic face provenance`).toBe(true);
    expect(blocker.faceHandOwned, `${label}:${sentinel.name}: diagnostic hand ownership`)
      .toBe(faceInfluence!.faceHandOwned);
  }
  return selfOcclusion;
}

async function screenshotWithHash(page: Page, testInfo: TestInfo, name: string): Promise<{ path: string; sha256: string }> {
  const path = resolve(artifactRoot, `${name}.png`);
  expect(existsSync(path), `${name}: stale screenshot path is absent before capture`).toBe(false);
  const screenshot = await page.screenshot({ animations: 'disabled' });
  writeFileSync(path, screenshot, { flag: 'wx' });
  const status = lstatSync(path);
  expect(status.isFile() && !status.isSymbolicLink(), `${name}: regular non-link screenshot artifact`).toBe(true);
  expect(repositoryRelative(realpathSync(path)), `${name}: real screenshot remains in repository`).toBe(
    repositoryRelative(path),
  );
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
  return { path: repositoryRelative(path), sha256: sha256(screenshot) };
}

async function screenshotPresentedFrameWithHash(
  page: Page,
  testInfo: TestInfo,
  name: string,
  presentation: any,
) {
  const sampleBinding = () => page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot() as any;
    const presentedCapture = snapshot.deterministicReview.presentedCapture;
    return {
      debugRenderPaused: snapshot.deterministicReview.debugRenderPaused,
      frame: presentedCapture?.frame ?? null,
      captureRevision: presentedCapture?.captureRevision ?? null,
      submissionSequence: presentedCapture?.submissionSequence ?? null,
      presentedGameplayFrame: api.admissionState().presentedGameplayFrame,
    };
  });
  const expected = {
    debugRenderPaused: true,
    frame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.pausedPresentedCapture.captureRevision,
    submissionSequence: presentation.pausedPresentedCapture.submissionSequence,
    presentedGameplayFrame: presentation.pausedPresentedGameplayFrame,
  };
  const before = await sampleBinding();
  expect(before, `${name}: screenshot begins on the frozen submitted frame`).toEqual(expected);
  const screenshot = await screenshotWithHash(page, testInfo, name);
  const after = await sampleBinding();
  expect(after, `${name}: screenshot cannot advance or replace the submitted frame`).toEqual(expected);
  return {
    ...screenshot,
    screenshotFrameBinding: {
      contract: 'paused-presented-frame-screenshot-v1',
      stable: true,
      before,
      after,
    },
  };
}

async function capturePausedLivePoseAdvance(
  page: Page,
  actor: CaptureActor,
  presentation: any,
) {
  const expectedJoints = [
    ...ARM_BONES.map(({ side, role, bone }) => ({ kind: 'arm', side, role, digit: null, bone })),
    ...HAND_BONES.map(({ side, digit, bone }) => ({ kind: 'finger', side, role: null, digit, bone })),
  ];
  const sample = () => page.evaluate(({ requestedActor, expected }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot() as any;
    const target = requestedActor.kind === 'bot'
      ? snapshot.bots.find((candidate: any) => candidate.id === requestedActor.id)
      : snapshot.rangePractice.targets.find((candidate: any) => candidate.id === requestedActor.id);
    const joints = expected.map((wanted) => {
      const source = wanted.kind === 'arm'
        ? target?.operatorModel?.armPose?.bones
        : target?.operatorModel?.handPose?.bones;
      const observed = source?.find((joint: any) => (
        joint.side === wanted.side && joint.bone === wanted.bone
          && (wanted.kind === 'arm' ? joint.role === wanted.role : joint.digit === wanted.digit)
      ));
      return observed ? { ...wanted, worldPosition: observed.worldPosition } : null;
    });
    const presentedCapture = snapshot.deterministicReview.presentedCapture;
    return {
      frameCount: snapshot.frameCount,
      frameBinding: {
        debugRenderPaused: snapshot.deterministicReview.debugRenderPaused,
        frame: presentedCapture?.frame ?? null,
        captureRevision: presentedCapture?.captureRevision ?? null,
        submissionSequence: presentedCapture?.submissionSequence ?? null,
        presentedGameplayFrame: api.admissionState().presentedGameplayFrame,
      },
      joints,
    };
  }, { requestedActor: actor, expected: expectedJoints });
  const before = await sample();
  const animationBoundaries = 4;
  for (let boundary = 0; boundary < animationBoundaries; boundary += 1) {
    await page.evaluate(() => new Promise<void>((resolveBoundary) => requestAnimationFrame(() => resolveBoundary())));
  }
  const after = await sample();
  const expectedFrameBinding = {
    debugRenderPaused: true,
    frame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.pausedPresentedCapture.captureRevision,
    submissionSequence: presentation.pausedPresentedCapture.submissionSequence,
    presentedGameplayFrame: presentation.pausedPresentedGameplayFrame,
  };
  expect(before.frameBinding, 'armed close live-pose proof starts on frozen submitted frame').toEqual(expectedFrameBinding);
  expect(after.frameBinding, 'armed close live-pose proof cannot replace frozen submitted frame').toEqual(expectedFrameBinding);
  expect(after.frameCount, 'armed close simulation advances while rendering remains paused').toBeGreaterThan(before.frameCount);
  expect(before.joints).toHaveLength(expectedJoints.length);
  expect(after.joints).toHaveLength(expectedJoints.length);
  expect(before.joints.every((joint: any) => joint?.worldPosition?.every(Number.isFinite))).toBe(true);
  expect(after.joints.every((joint: any) => joint?.worldPosition?.every(Number.isFinite))).toBe(true);
  const deltas = expectedJoints.map((expected, index) => {
    expect(before.joints[index], `armed close live-pose before ${expected.bone}`).toMatchObject(expected);
    expect(after.joints[index], `armed close live-pose after ${expected.bone}`).toMatchObject(expected);
    return positionDelta(before.joints[index].worldPosition, after.joints[index].worldPosition);
  });
  const maximumJointAdvanceM = Math.max(...deltas);
  const minimumJointAdvanceM = 0.00001;
  expect(maximumJointAdvanceM, 'armed close current CPU pose advances beyond frozen render receipt').toBeGreaterThan(
    minimumJointAdvanceM,
  );
  return {
    contract: 'paused-render-live-pose-advance-v1',
    actor,
    animationBoundaries,
    minimumJointAdvanceM,
    maximumJointAdvanceM,
    submittedFrameBinding: expectedFrameBinding,
    before,
    after,
  };
}

type CaptureActor = Readonly<{ kind: 'bot' | 'training-dummy'; id: string }>;
type CaptureRoi = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;

async function captureFraming(
  page: Page,
  actors: readonly CaptureActor[],
  presentation: any,
  roiNdc: CaptureRoi,
  requireJointDetail = false,
): Promise<any[]> {
  const expectedJoints = [
    ...ARM_BONES.map(({ side, role, bone }) => ({ kind: 'arm', side, role, digit: null, bone })),
    ...HAND_BONES.map(({ side, digit, bone }) => ({ kind: 'finger', side, role: null, digit, bone })),
  ];
  const evidence = await page.evaluate(({
    requestedActors, frameActors, frame, captureRevision, roi, strictJoints, expected, jointThresholds,
  }) => {
    const canvasBounds = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pointToPixel = ([x, y]: number[]) => ({
      x: canvasBounds.left + (x + 1) * 0.5 * canvasBounds.width,
      y: canvasBounds.top + (1 - y) * 0.5 * canvasBounds.height,
    });
    const pointInside = ([x, y, z]: number[]) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      && x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY && z >= -1 && z <= 1;
    const pixelDistance = (left: { x: number; y: number }, right: { x: number; y: number }) => (
      Math.hypot(left.x - right.x, left.y - right.y)
    );
    return requestedActors.map((actor) => {
      const target = frameActors.find((candidate: any) => (
        candidate.actor.kind === actor.kind && candidate.actor.id === actor.id
      ));
      if (!target) return { actor, missing: true };
      const [x, y, z] = target.screenPosition;
      const withinRoi = pointInside([x, y, z]);
      const projectedPixel = pointToPixel([x, y, z]);
      const onScreen = withinRoi && canvasBounds.width > 0 && canvasBounds.height > 0
        && projectedPixel.x >= Math.max(0, canvasBounds.left)
        && projectedPixel.x <= Math.min(viewport.width, canvasBounds.right)
        && projectedPixel.y >= Math.max(0, canvasBounds.top)
        && projectedPixel.y <= Math.min(viewport.height, canvasBounds.bottom);
      const jointPoints = strictJoints ? (target.jointScreenPositions ?? []).map((joint: any) => {
        const pixel = pointToPixel(joint.ndc);
        const jointWithinRoi = pointInside(joint.ndc);
        const jointOnScreen = jointWithinRoi
          && pixel.x >= Math.max(0, canvasBounds.left)
          && pixel.x <= Math.min(viewport.width, canvasBounds.right)
          && pixel.y >= Math.max(0, canvasBounds.top)
          && pixel.y <= Math.min(viewport.height, canvasBounds.bottom);
        return { ...joint, pixel, withinRoi: jointWithinRoi, onScreen: jointOnScreen };
      }) : [];
      const orderValid = strictJoints && jointPoints.length === expected.length
        && jointPoints.every((joint: any, index: number) => {
          const wanted = expected[index];
          return joint.kind === wanted.kind && joint.side === wanted.side && joint.role === wanted.role
            && joint.digit === wanted.digit && joint.bone === wanted.bone;
        });
      const armChainPixels = strictJoints ? (['left', 'right'] as const).map((side) => {
        const shoulder = jointPoints.find((joint: any) => joint.side === side && joint.role === 'shoulder');
        const elbow = jointPoints.find((joint: any) => joint.side === side && joint.role === 'elbow');
        const wrist = jointPoints.find((joint: any) => joint.side === side && joint.role === 'wrist-hand');
        return {
          side,
          pixels: shoulder && elbow && wrist
            ? pixelDistance(shoulder.pixel, elbow.pixel) + pixelDistance(elbow.pixel, wrist.pixel)
            : 0,
        };
      }) : [];
      const wristFingerPixels = strictJoints ? (['left', 'right'] as const).map((side) => {
        const wrist = jointPoints.find((joint: any) => joint.side === side && joint.role === 'wrist-hand');
        const fingers = jointPoints.filter((joint: any) => joint.side === side && joint.kind === 'finger');
        return {
          side,
          fingerCount: fingers.length,
          minimumPixels: wrist && fingers.length === 5
            ? Math.min(...fingers.map((finger: any) => pixelDistance(wrist.pixel, finger.pixel)))
            : 0,
        };
      }) : [];
      const jointDetail = strictJoints ? {
        required: true,
        expectedSentinelCount: expected.length,
        sentinels: jointPoints,
        orderValid,
        allInsideRoi: jointPoints.length === expected.length
          && jointPoints.every((joint: any) => joint.withinRoi && joint.onScreen),
        armChainPixels,
        wristFingerPixels,
        thresholds: jointThresholds,
      } : null;
      return {
        actor,
        frame,
        captureRevision,
        missing: false,
        rootPosition: target.rootPosition,
        rootYaw: target.rootYaw,
        projectedWorldPosition: target.projectedWorldPosition,
        screenPosition: [x, y, z],
        evidenceSentinels: target.evidenceSentinels,
        roiNdc: roi,
        withinRoi,
        onScreen,
        rootVisible: target.rootVisible,
        rootEffectivelyVisible: target.rootEffectivelyVisible,
        effectivelyVisibleMeshCount: target.effectivelyVisibleMeshCount,
        effectivelyVisibleSkinnedMeshes: target.effectivelyVisibleSkinnedMeshes,
        armSkinVisible: target.armSkinVisible,
        handSkinVisible: target.handSkinVisible,
        canvas: {
          left: canvasBounds.left,
          top: canvasBounds.top,
          width: canvasBounds.width,
          height: canvasBounds.height,
        },
        viewport,
        projectedPixel,
        jointDetail,
      };
    });
  }, {
    requestedActors: actors,
    frameActors: presentation.pausedPresentedCapture.actors,
    frame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.pausedPresentedCapture.captureRevision,
    roi: roiNdc,
    strictJoints: requireJointDetail,
    expected: expectedJoints,
    jointThresholds: CLOSE_JOINT_THRESHOLDS,
  });
  for (const framing of evidence) {
    const label = `${framing.actor.kind}:${framing.actor.id}`;
    expect(framing.missing, `${label}: capture actor exists`).toBe(false);
    expect(framing.frame, `${label}: framing is bound to final submitted frame`).toBe(
      presentation.pausedPresentedCapture.frame,
    );
    expect(framing.captureRevision, `${label}: framing is bound to final camera revision`).toBe(
      presentation.requestedRevision,
    );
    expect(framing.projectedWorldPosition, `${label}: exact submitted-frame actor anchor`).toHaveLength(3);
    expect(framing.evidenceSentinels, `${label}: exact submitted-frame evidence bones`).toHaveLength(6);
    expect(framing.rootVisible, `${label}: root visible`).toBe(true);
    expect(framing.rootEffectivelyVisible, `${label}: visible through every ancestor`).toBe(true);
    expect(framing.effectivelyVisibleMeshCount, `${label}: effective renderables`).toBeGreaterThan(0);
    expect(framing.effectivelyVisibleSkinnedMeshes.length, `${label}: effective skinned renderables`).toBeGreaterThan(0);
    expect(framing.armSkinVisible, `${label}: arm bones drive visible skin`).toBe(true);
    expect(framing.handSkinVisible, `${label}: finger bones drive visible skin`).toBe(true);
    expect(framing.screenPosition.every(Number.isFinite), `${label}: finite projection`).toBe(true);
    expect(framing.withinRoi, `${label}: bounded live screenshot ROI ${JSON.stringify(framing)}`).toBe(true);
    expect(framing.onScreen, `${label}: projected actor point is inside the visible canvas and viewport`).toBe(true);
    if (requireJointDetail) {
      expect(framing.jointDetail, `${label}: close capture has joint-level evidence`).toMatchObject({
        required: true,
        expectedSentinelCount: 16,
        orderValid: true,
        allInsideRoi: true,
        thresholds: CLOSE_JOINT_THRESHOLDS,
      });
      expect(framing.jointDetail.sentinels).toHaveLength(16);
      expect(framing.jointDetail.armChainPixels).toHaveLength(2);
      expect(framing.jointDetail.wristFingerPixels).toHaveLength(2);
      for (const chain of framing.jointDetail.armChainPixels) {
        expect(chain.pixels, `${label}: ${chain.side} projected arm chain`).toBeGreaterThanOrEqual(CLOSE_JOINT_THRESHOLDS.minimumArmChainPixels);
      }
      for (const hand of framing.jointDetail.wristFingerPixels) {
        expect(hand.fingerCount, `${label}: ${hand.side} has five projected digit sentinels`).toBe(5);
      }
    }
  }
  return evidence;
}

async function captureAtFixedPose(
  page: Page,
  testInfo: TestInfo,
  camera: RiggedEvidenceCamera,
  name: string,
  actor: CaptureActor,
  roiNdc: CaptureRoi,
  requireJointDetail = false,
  fixedVisualTimeMs: number | null = null,
) {
  const presentation = await commitCaptureCamera(page, camera, [actor], fixedVisualTimeMs);
  const [framing] = await captureFraming(page, [actor], presentation, roiNdc, requireJointDetail);
  const lineOfSight = await sampleRequiredLineOfSight(page, actor, presentation, framing);
  const pausedLivePoseAdvance = actor.kind === 'bot'
    && camera.id === RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.closeCamera.id
    ? await capturePausedLivePoseAdvance(page, actor, presentation)
    : null;
  const screenshot = await screenshotPresentedFrameWithHash(page, testInfo, name, presentation);
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setRiggedEvidenceCaptureTargets([]);
    window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
  });
  return {
    ...screenshot,
    fixtureContract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.contract,
    camera,
    presentation,
    lineOfSight,
    pausedLivePoseAdvance,
    framing,
  };
}

async function captureDummyProductionRgbRasterProof(
  page: Page,
  testInfo: TestInfo,
  camera: RiggedEvidenceCamera,
  actor: CaptureActor,
) {
  const fixedVisualTimeMs = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.fixedVisualTimeMs;
  expect(fixedVisualTimeMs, `${actor.id}: production RGB proof fixed visual time`).toBe(0);
  const observe = await commitCaptureCamera(page, camera, [actor], fixedVisualTimeMs, {
    principalWrite: { mode: 'visible-observe' },
  });
  const sessionId = observe.principalWriteSession?.sessionId;
  expect(sessionId, `${actor.id}: principal-write session identity`).toEqual(expect.any(String));
  const control = await commitCaptureCamera(page, camera, [actor], fixedVisualTimeMs, {
    principalWrite: {
      mode: 'principal-write-suppressed',
      sessionId,
      reuseCaptureTargets: true,
    },
  });
  const controlScreenshot = await screenshotPresentedFrameWithHash(
    page,
    testInfo,
    `${actor.id}-close-principal-suppressed`,
    control,
  );
  const restored = await commitCaptureCamera(page, camera, [actor], fixedVisualTimeMs, {
    principalWrite: {
      mode: 'visible-restored',
      sessionId,
      reuseCaptureTargets: true,
    },
  });
  const [framing] = await captureFraming(page, [actor], restored, CLOSE_ROI_NDC, true);
  const lineOfSight = await sampleRequiredLineOfSight(page, actor, restored, framing);
  const visibleScreenshotCapture = await screenshotPresentedFrameWithHash(
    page,
    testInfo,
    `${actor.id}-close`,
    restored,
  );
  const visibleScreenshot = {
    ...visibleScreenshotCapture,
    fixtureContract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.contract,
    camera,
    presentation: restored,
    lineOfSight,
    pausedLivePoseAdvance: null,
    framing,
  };
  const phasePresentations = [observe, control, restored];
  expect(phasePresentations.map((entry) => entry.principalWriteSession.sessionId), `${actor.id}: one session across three commits`).toEqual([
    sessionId, sessionId, sessionId,
  ]);
  expect(phasePresentations.map((entry) => entry.requestedRevision).every((revision, index, revisions) => (
    index === 0 || revision > revisions[index - 1]
  )), `${actor.id}: observe/control/restored revisions strictly increase`).toBe(true);
  expect(phasePresentations.map((entry) => entry.pausedPresentedCapture.actors[0].principalWriteControl.mode), `${actor.id}: exact three-mode order`).toEqual([
    'visible-observe', 'principal-write-suppressed', 'visible-restored',
  ]);
  const drawManifests = phasePresentations.map((entry) => (
    entry.pausedPresentedCapture.actors[0].principalWriteControl.drawManifest
  ));
  expect(drawManifests[0].length, `${actor.id}: nonempty admitted draw manifest`).toBeGreaterThan(0);
  expect(drawManifests[1], `${actor.id}: suppressed draw manifest equals observed`).toEqual(drawManifests[0]);
  expect(drawManifests[2], `${actor.id}: restored draw manifest equals observed`).toEqual(drawManifests[0]);
  const rasterRois = phasePresentations.map((entry) => entry.pausedPresentedCapture.actors[0].rasterRoi);
  expect(rasterRois[1], `${actor.id}: control ROI equals observed live-deformed ROI`).toEqual(rasterRois[0]);
  expect(rasterRois[2], `${actor.id}: restored ROI equals observed live-deformed ROI`).toEqual(rasterRois[0]);
  const stateDigests = phasePresentations.map((entry) => entry.rasterStateDigests);
  expect(stateDigests[1], `${actor.id}: camera/fixed-time/pose/target/non-target state unchanged in control`).toEqual(
    stateDigests[0],
  );
  expect(stateDigests[2], `${actor.id}: camera/fixed-time/pose/target/non-target state restored exactly`).toEqual(
    stateDigests[0],
  );
  expect(controlScreenshot.sha256, `${actor.id}: suppressed and visible PNG file hashes differ`).not.toBe(
    visibleScreenshot.sha256,
  );
  const rasterDiff = await produceRasterDiffReceipt(
    controlScreenshot.path,
    visibleScreenshot.path,
    rasterRois[0].roi,
  );
  expect(rasterDiff.insideChangedPixelCount, `${actor.id}: at least one target RGB pixel changes`).toBeGreaterThanOrEqual(1);
  expect(rasterDiff.changedPixelCount, `${actor.id}: every RGB change is inside exact actor ROI`).toBe(
    rasterDiff.insideChangedPixelCount,
  );
  expect(rasterDiff.outsideChangedPixelCount, `${actor.id}: environment RGB remains byte-identical`).toBe(0);
  expect(rasterDiff.alphaChangedPixelCount, `${actor.id}: alpha remains byte-identical`).toBe(0);
  expect(rasterDiff.maxRgbChannelDelta, `${actor.id}: nonzero RGB channel delta`).toBeGreaterThan(0);
  expect(rasterDiff.controlRawRgbSha256, `${actor.id}: raw control and visible RGB hashes differ`).not.toBe(
    rasterDiff.visibleRawRgbSha256,
  );
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setRiggedEvidenceCaptureTargets([]);
    window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
  });
  return {
    contract: 'gun-range-dummy-production-rgb-raster-proof-v1',
    actor,
    camera,
    fixedVisualTimeMs,
    sessionId,
    captureOrder: phasePresentations.map((entry, index) => ({
      mode: ['visible-observe', 'principal-write-suppressed', 'visible-restored'][index],
      frame: entry.pausedPresentedCapture.frame,
      captureRevision: entry.requestedRevision,
      submissionSequence: entry.pausedPresentedCapture.submissionSequence,
      completedSequence: entry.pausedPresentedCapture.completedSequence,
    })),
    stateDigests: stateDigests[0],
    drawManifest: drawManifests[0],
    rasterRoi: rasterRois[0],
    observePresentation: observe,
    controlPresentation: control,
    restoredPresentation: restored,
    controlScreenshot,
    visibleScreenshot,
    rasterDiff,
  };
}

async function captureHandFraming(
  page: Page,
  actor: CaptureActor,
  side: 'left' | 'right',
  camera: Record<string, unknown>,
  presentation: any,
): Promise<any> {
  const expectedJoints = [
    ...ARM_BONES.filter((joint) => joint.side === side && joint.role === 'wrist-hand')
      .map(({ side: jointSide, role, bone }) => ({ kind: 'arm', side: jointSide, role, digit: null, bone })),
    ...HAND_BONES.filter((joint) => joint.side === side)
      .map(({ side: jointSide, digit, bone }) => ({ kind: 'finger', side: jointSide, role: null, digit, bone })),
  ];
  const framing = await page.evaluate(({
    requestedActor, frameActor, frame, captureRevision, requestedSide, expected, roi, thresholds, cameraEvidence,
  }) => {
    const target = frameActor?.actor.kind === requestedActor.kind && frameActor.actor.id === requestedActor.id
      ? frameActor
      : null;
    if (!target) return { actor: requestedActor, side: requestedSide, missing: true, camera: cameraEvidence };
    const canvasBounds = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pointToPixel = ([x, y]: number[]) => ({
      x: canvasBounds.left + (x + 1) * 0.5 * canvasBounds.width,
      y: canvasBounds.top + (1 - y) * 0.5 * canvasBounds.height,
    });
    const pointInside = ([x, y, z]: number[]) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      && x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY && z >= -1 && z <= 1;
    const pixelDistance = (left: { x: number; y: number }, right: { x: number; y: number }) => (
      Math.hypot(left.x - right.x, left.y - right.y)
    );
    const sentinels = (target.jointScreenPositions ?? [])
      .filter((joint: any) => joint.side === requestedSide
        && (joint.role === 'wrist-hand' || joint.kind === 'finger'))
      .map((joint: any) => {
        const pixel = pointToPixel(joint.ndc);
        const withinRoi = pointInside(joint.ndc);
        const onScreen = withinRoi
          && pixel.x >= Math.max(0, canvasBounds.left)
          && pixel.x <= Math.min(viewport.width, canvasBounds.right)
          && pixel.y >= Math.max(0, canvasBounds.top)
          && pixel.y <= Math.min(viewport.height, canvasBounds.bottom);
        return { ...joint, pixel, withinRoi, onScreen };
      });
    const sourceShoulders = (target.jointScreenPositions ?? [])
      .filter((joint: any) => joint.kind === 'arm' && joint.role === 'shoulder')
      .map((joint: any) => ({
        kind: joint.kind,
        side: joint.side,
        role: joint.role,
        bone: joint.bone,
        worldPosition: joint.worldPosition,
      }));
    const orderValid = sentinels.length === expected.length && sentinels.every((joint: any, index: number) => {
      const wanted = expected[index];
      return joint.kind === wanted.kind && joint.side === wanted.side && joint.role === wanted.role
        && joint.digit === wanted.digit && joint.bone === wanted.bone;
    });
    const wrist = sentinels.find((joint: any) => joint.role === 'wrist-hand');
    const fingerSpans = sentinels.filter((joint: any) => joint.kind === 'finger').map((finger: any) => ({
      digit: finger.digit,
      bone: finger.bone,
      pixels: wrist ? pixelDistance(wrist.pixel, finger.pixel) : 0,
    }));
    return {
      actor: requestedActor,
      side: requestedSide,
      frame,
      captureRevision,
      missing: false,
      rootPosition: target.rootPosition,
      rootYaw: target.rootYaw,
      projectedWorldPosition: target.projectedWorldPosition,
      evidenceSentinels: target.evidenceSentinels,
      rootVisible: target.rootVisible,
      rootEffectivelyVisible: target.rootEffectivelyVisible,
      effectivelyVisibleMeshCount: target.effectivelyVisibleMeshCount,
      effectivelyVisibleSkinnedMeshes: target.effectivelyVisibleSkinnedMeshes,
      handSkinVisible: target.handSkinVisible,
      weaponCenterWorld: target.weaponCenterWorld,
      sourceShoulders,
      canvas: {
        left: canvasBounds.left,
        top: canvasBounds.top,
        width: canvasBounds.width,
        height: canvasBounds.height,
      },
      viewport,
      roiNdc: roi,
      camera: cameraEvidence,
      handDetail: {
        required: true,
        side: requestedSide,
        expectedSentinelCount: expected.length,
        sentinels,
        orderValid,
        allInsideRoi: sentinels.length === expected.length
          && sentinels.every((joint: any) => joint.withinRoi && joint.onScreen),
        fingerSpans,
        minimumPixels: fingerSpans.length === 5 ? Math.min(...fingerSpans.map(({ pixels }: any) => pixels)) : 0,
        thresholds,
      },
    };
  }, {
    requestedActor: actor,
    frameActor: presentation.pausedPresentedCapture.actors[0],
    frame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.pausedPresentedCapture.captureRevision,
    requestedSide: side,
    expected: expectedJoints,
    roi: HAND_ROI_NDC,
    thresholds: HAND_DETAIL_THRESHOLDS,
    cameraEvidence: camera,
  });
  const label = `${actor.kind}:${actor.id}:${side}-hand`;
  expect(framing, `${label}: live hand capture actor exists`).toMatchObject({
    actor,
    side,
    missing: false,
    rootVisible: true,
    rootEffectivelyVisible: true,
    handSkinVisible: true,
    roiNdc: HAND_ROI_NDC,
    handDetail: {
      required: true,
      side,
      expectedSentinelCount: 6,
      orderValid: true,
      allInsideRoi: true,
      thresholds: HAND_DETAIL_THRESHOLDS,
    },
  });
  expect(framing.effectivelyVisibleMeshCount, `${label}: effective renderables`).toBeGreaterThan(0);
  expect(framing.frame, `${label}: exact final submitted frame`).toBe(presentation.pausedPresentedCapture.frame);
  expect(framing.captureRevision, `${label}: exact final camera revision`).toBe(presentation.requestedRevision);
  expect(framing.evidenceSentinels, `${label}: exact submitted-frame evidence bones`).toHaveLength(6);
  expect(framing.effectivelyVisibleSkinnedMeshes.length, `${label}: effective skinned renderables`).toBeGreaterThan(0);
  expect(framing.handDetail.sentinels, `${label}: wrist plus five digit sentinels`).toHaveLength(6);
  expect(framing.sourceShoulders, `${label}: both shoulder basis sources`).toHaveLength(2);
  expect(framing.handDetail.fingerSpans, `${label}: five independently measured wrist-to-finger spans`).toHaveLength(5);
  for (const sentinel of framing.handDetail.sentinels) {
    const source = (camera.sourceSentinels as any[]).find((candidate) => candidate.bone === sentinel.bone);
    expect(source, `${label}: ${sentinel.bone} is bound to the camera source pose`).toBeDefined();
    expect(positionDelta(sentinel.worldPosition, source.worldPosition), `${label}: ${sentinel.bone} source-to-capture drift`).toBeLessThanOrEqual(
      HAND_CAMERA_CONTRACT.maximumSourceJointDriftM,
    );
  }
  for (const shoulder of framing.sourceShoulders) {
    const source = (camera.sourceShoulders as any[]).find((candidate) => candidate.bone === shoulder.bone);
    expect(source, `${label}: ${shoulder.bone} is bound to the camera basis source`).toBeDefined();
    expect(positionDelta(shoulder.worldPosition, source.worldPosition), `${label}: ${shoulder.bone} source-to-capture drift`).toBeLessThanOrEqual(
      HAND_CAMERA_CONTRACT.maximumSourceJointDriftM,
    );
  }
  expect(positionDelta(framing.weaponCenterWorld, camera.sourceWeaponCenterWorld as number[]), `${label}: weapon-center source-to-capture drift`).toBeLessThanOrEqual(
    HAND_CAMERA_CONTRACT.maximumSourceJointDriftM,
  );
  for (const span of framing.handDetail.fingerSpans) {
    expect(span.pixels, `${label}: ${span.digit} wrist-to-finger detail`).toBeGreaterThanOrEqual(
      HAND_DETAIL_THRESHOLDS.minimumWristFingerPixels,
    );
  }
  return framing;
}

async function captureHandAtFixedOutsidePose(
  page: Page,
  testInfo: TestInfo,
  actor: CaptureActor,
  side: 'left' | 'right',
  sourceCapture: any,
) {
  const expectedJoints = [
    ...ARM_BONES.filter((joint) => joint.side === side && joint.role === 'wrist-hand')
      .map(({ side: jointSide, role, bone }) => ({ kind: 'arm', side: jointSide, role, digit: null, bone })),
    ...HAND_BONES.filter((joint) => joint.side === side)
      .map(({ side: jointSide, digit, bone }) => ({ kind: 'finger', side: jointSide, role: null, digit, bone })),
  ];
  const sourcePresentation = sourceCapture?.presentation?.pausedPresentedCapture;
  const sourceActor = sourcePresentation?.actors?.find((candidate: any) => (
    candidate.actor.kind === actor.kind && candidate.actor.id === actor.id
  ));
  const sourceSentinelsUnverified = expectedJoints.map((wanted) => {
    const observed = sourceActor?.jointScreenPositions?.find((joint: any) => (
      joint.kind === wanted.kind && joint.side === wanted.side && joint.role === wanted.role
        && joint.digit === wanted.digit && joint.bone === wanted.bone
    ));
    return observed ? { ...wanted, worldPosition: observed.worldPosition } : null;
  });
  const sourceShouldersUnverified = ARM_BONES.filter(({ role }) => role === 'shoulder').map((wanted) => {
    const observed = sourceActor?.jointScreenPositions?.find((joint: any) => (
      joint.kind === 'arm' && joint.side === wanted.side && joint.role === wanted.role && joint.bone === wanted.bone
    ));
    return observed ? {
      kind: 'arm', side: wanted.side, role: wanted.role, bone: wanted.bone, worldPosition: observed.worldPosition,
    } : null;
  });
  const weaponCenterWorldUnverified = sourceActor?.weaponCenterWorld ?? null;
  const label = `${actor.kind}:${actor.id}:${side}-hand-camera`;
  expect(sourceCapture?.camera?.id, `${label}: source is the fixed armed close capture`).toBe(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.closeCamera.id,
  );
  expect(sourceActor?.actor, `${label}: source actor is bound to the submitted close frame`).toEqual(actor);
  expect(sourceSentinelsUnverified.every((joint) => joint !== null), `${label}: submitted close frame has all six source joints`).toBe(true);
  expect(sourceSentinelsUnverified).toHaveLength(6);
  expect(sourceShouldersUnverified.every((joint) => joint !== null), `${label}: submitted close frame has both shoulder sources`).toBe(true);
  const sourceSentinels = sourceSentinelsUnverified as Array<{
    kind: string;
    side: string;
    role: string | null;
    digit: string | null;
    bone: string;
    worldPosition: number[];
  }>;
  const sourceShoulders = sourceShouldersUnverified as Array<{
    kind: 'arm'; side: 'left' | 'right'; role: 'shoulder'; bone: string; worldPosition: number[];
  }>;
  expect(sourceSentinels.every(({ worldPosition }) => (
    Array.isArray(worldPosition) && worldPosition.length === 3 && worldPosition.every(Number.isFinite)
  )), `${label}: finite live wrist/finger world positions`).toBe(true);
  expect(Array.isArray(weaponCenterWorldUnverified) && weaponCenterWorldUnverified.length === 3, `${label}: submitted close-frame weapon center`).toBe(true);
  const weaponCenterWorld = weaponCenterWorldUnverified as number[];
  expect(weaponCenterWorld.every(Number.isFinite), `${label}: finite rendered weapon center`).toBe(true);
  expect(sourceShoulders.every(({ worldPosition }) => (
    Array.isArray(worldPosition) && worldPosition.length === 3 && worldPosition.every(Number.isFinite)
  )), `${label}: finite live shoulder world positions`).toBe(true);
  const derived = deriveRiggedHandCamera({
    side,
    leftShoulderWorld: sourceShoulders.find((joint) => joint.side === 'left')!.worldPosition,
    rightShoulderWorld: sourceShoulders.find((joint) => joint.side === 'right')!.worldPosition,
    weaponCenterWorld,
    handSentinels: sourceSentinels,
  });
  const { targetWorld, positionWorld, outsideDirectionWorld } = derived;
  expect(Math.sign(derived.lateralDot), `${label}: camera is on the requested lateral hemisphere`).toBe(derived.sideSign);
  expect(Math.abs(derived.lateralDot), `${label}: shoulder-lateral contribution`).toBeGreaterThanOrEqual(
    HAND_CAMERA_CONTRACT.minimumAbsoluteLateralDot,
  );
  expect(derived.frontDot, `${label}: fixed front-oblique contribution`).toBeGreaterThanOrEqual(
    HAND_CAMERA_CONTRACT.minimumFrontDot,
  );
  expect(derived.frontDot, `${label}: fixed front-oblique contribution`).toBeLessThanOrEqual(
    HAND_CAMERA_CONTRACT.maximumFrontDot,
  );
  expect(derived.peerDirectionDot, `${label}: theoretical opposite-side direction`).toBeLessThanOrEqual(
    HAND_CAMERA_CONTRACT.maximumPeerDirectionDot,
  );
  const aim = subtract(targetWorld, positionWorld);
  const horizontalAim = Math.hypot(aim[0], aim[2]);
  const pose = {
    x: positionWorld[0],
    y: positionWorld[1],
    z: positionWorld[2],
    yaw: Math.atan2(-aim[0], -aim[2]),
    pitch: Math.atan2(aim[1], horizontalAim),
    fov: HAND_CAMERA_CONTRACT.fovDegrees,
  };
  const fixtureCamera: RiggedEvidenceCamera = {
    id: `armed-live-bot-${side}-fixed-hand-detail`,
    position: positionWorld as [number, number, number],
    target: targetWorld as [number, number, number],
    yaw: pose.yaw,
    pitch: pose.pitch,
    fov: pose.fov,
  };
  const camera = {
    ...HAND_CAMERA_CONTRACT,
    actor,
    side,
    source: 'armed-close-submitted-frame-shoulder-lateral-weapon-front-and-rigged-hand-world-transforms',
    sourceFrameBinding: {
      contract: 'armed-close-submitted-actor-source-v1',
      cameraId: sourceCapture.camera.id,
      frame: sourcePresentation.frame,
      captureRevision: sourcePresentation.captureRevision,
      submissionSequence: sourcePresentation.submissionSequence,
      actor,
    },
    sourceWeaponCenterWorld: weaponCenterWorld,
    sourceShoulders,
    sourceSentinels,
    leftShoulderWorld: derived.leftShoulderWorld,
    rightShoulderWorld: derived.rightShoulderWorld,
    shoulderMidWorld: derived.shoulderMidWorld,
    horizontalShoulderSpanM: derived.horizontalShoulderSpanM,
    lateralWorld: derived.lateralWorld,
    rawFrontWorld: derived.rawFrontWorld,
    weaponCenterDistanceM: derived.weaponCenterDistanceM,
    orthogonalFrontWorld: derived.orthogonalFrontWorld,
    orthogonalFrontLengthM: derived.orthogonalFrontLengthM,
    frontWorld: derived.frontWorld,
    sideSign: derived.sideSign,
    outsideDirectionWorld: derived.outsideDirectionWorld,
    peerOutsideDirectionWorld: derived.peerOutsideDirectionWorld,
    lateralDot: derived.lateralDot,
    frontDot: derived.frontDot,
    peerDirectionDot: derived.peerDirectionDot,
    degeneracyPolicy: derived.degeneracyPolicy,
    targetWorld: derived.targetWorld,
    positionWorld: derived.positionWorld,
    yaw: pose.yaw,
    pitch: pose.pitch,
    fixtureCamera,
  };
  const presentation = await commitCaptureCamera(page, fixtureCamera, [actor], null, { handSide: side });
  const framing = await captureHandFraming(page, actor, side, camera, presentation);
  const lineOfSight = await sampleRequiredLineOfSight(page, actor, presentation, framing);
  const selfOcclusion = await sampleRequiredHandSelfOcclusion(page, actor, side, presentation, framing);
  const screenshot = await screenshotPresentedFrameWithHash(
    page,
    testInfo,
    `armed-live-bot-${side}-hand-close`,
    presentation,
  );
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setRiggedEvidenceCaptureTargets([]);
    window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
  });
  return {
    ...screenshot,
    fixtureContract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.contract,
    camera: fixtureCamera,
    presentation,
    lineOfSight,
    selfOcclusion,
    framing,
  };
}

async function waitForStrictPose(
  page: Page,
  kind: 'armed-bot' | 'unarmed-dummies',
  expectedIds: readonly string[] = [],
): Promise<void> {
  await expect.poll(async () => page.evaluate(({ actorKind, ids, armBones, fingerBones, influence, gripThresholds }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actors = actorKind === 'armed-bot'
      ? snapshot.bots.slice(0, 1)
      : snapshot.rangePractice.targets.filter((target: any) => target.kind === 'training-dummy');
    if (actorKind === 'armed-bot' && !(actors[0]?.alive && actors[0]?.weapon === 'carbine')) return false;
    if (actorKind === 'unarmed-dummies'
      && (actors.length !== ids.length || actors.some((actor: any, index: number) => actor.id !== ids[index]))) return false;
    return actors.every((actor: any) => {
      const model = actor.operatorModel;
      const grip = model?.supportGrip;
      return model?.activeClip === 'Walk'
        && model.armPose?.allHierarchyValid === true
        && model.armPose?.allInEffectivelyVisibleSkinnedMesh === true
        && model.armPose?.allHaveRenderedVertexInfluence === true
        && model.armPose?.allAntiTPoseGeometry === true
        && model.armPose.bones?.length === armBones.length
        && model.armPose.bones.every((bone: any, index: number) => (
          bone.bindQuaternionDeltaRadians >= armBones[index].minimumBindRadians
            && bone.vertexInfluence?.influencedVertexCount >= influence.minimumInfluencedVertices
            && bone.vertexInfluence?.maximumNormalizedWeight >= influence.minimumMaximumNormalizedWeight
        ))
        && model.handPose?.allDescendantOfWrist === true
        && model.handPose?.allInEffectivelyVisibleSkinnedMesh === true
        && model.handPose?.allHaveRenderedVertexInfluence === true
        && model.handPose.bones?.length === fingerBones.length
        && model.handPose.bones.every((bone: any, index: number) => (
          bone.bindQuaternionDeltaRadians >= fingerBones[index].minimumBindRadians
            && bone.vertexInfluence?.influencedVertexCount >= influence.minimumInfluencedVertices
            && bone.vertexInfluence?.maximumNormalizedWeight >= influence.minimumMaximumNormalizedWeight
        ))
        && (actorKind === 'armed-bot'
          ? model.weaponChildren === 1
            && grip?.bothHandsConnected === true
            && grip.supportError <= gripThresholds.maximumPositionErrorM
            && grip.socketReference?.valid === true
            && grip.wristOrientation?.errorRadians <= gripThresholds.maximumQuaternionErrorRadians
            && grip.torsoClear === true
            && grip.elbowTorsoOutward >= grip.minimumOutwardClearance
            && grip.dominantGrip?.torsoClear === true
            && grip.dominantGrip.supportError <= gripThresholds.maximumPositionErrorM
            && grip.dominantGrip.socketReference?.valid === true
            && grip.dominantGrip.wristOrientation?.errorRadians <= gripThresholds.maximumQuaternionErrorRadians
            && grip.dominantGrip.elbowTorsoOutward >= grip.dominantGrip.minimumOutwardClearance
            && grip.fingerCurl?.allApplied === true
          : actor.armed === false && model.weaponChildren === 0 && model.weaponMount === null);
    });
  }, {
    actorKind: kind,
    ids: expectedIds,
    armBones: ARM_BONES,
    fingerBones: HAND_BONES,
    influence: RENDERED_INFLUENCE_THRESHOLDS,
    gripThresholds: GRIP_THRESHOLDS,
  }), { timeout: 12_000 }).toBe(true);
}

test('real armed bot and all four unarmed Gun Range dummies leave the authored T/bind pose', async ({ browser, page }, testInfo) => {
  test.setTimeout(renderer === 'webgpu' ? 180_000 : 140_000);
  rmSync(artifactRoot, { recursive: true, force: true });
  rmSync(receiptPath, { force: true });
  mkdirSync(artifactRoot, { recursive: true });
  const artifactRootStatus = lstatSync(artifactRoot);
  expect(artifactRootStatus.isDirectory() && !artifactRootStatus.isSymbolicLink(), 'fresh regular non-link artifact directory').toBe(true);
  if (officialEvidence) {
    expect(sourceSha, 'official rigged-bot evidence starts at requested exact HEAD').toBe(expectedSourceSha);
    expect(sourceStatus, 'official rigged-bot evidence starts from a clean worktree').toBe('');
  }
  await page.setViewportSize({ width: 1_600, height: 900 });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });

  await deploy(page, 'atomic-acres');
  const commandedAtomicPlayer = await page.evaluate((fixture) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setCaptureViewmodelHidden(true);
    api.setBotsFrozen(true);
    api.teleportPlayer(
      fixture.commandedPlayerPosition[0], fixture.commandedPlayerPosition[1], fixture.commandedPlayerPosition[2],
      fixture.playerYaw, 0,
    );
    const snapshot = api.snapshot() as any;
    return {
      presentedGameplayFrame: api.admissionState().presentedGameplayFrame,
      position: [...snapshot.player.position],
      yaw: snapshot.player.yaw,
      grounded: snapshot.player.grounded,
    };
  }, RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic);
  expect(commandedAtomicPlayer.position, 'Atomic player teleport applies the commanded open-road position immediately')
    .toEqual(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.commandedPlayerPosition);
  expect(commandedAtomicPlayer.yaw, 'Atomic player teleport applies the commanded open-road yaw immediately')
    .toBe(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.playerYaw);
  expect(commandedAtomicPlayer.grounded, 'teleport starts outside the settled-ground authority').toBe(false);
  const atomicPlayerConvergence = await waitForAtomicPlayerConvergence(
    page, commandedAtomicPlayer.presentedGameplayFrame,
  );
  await page.waitForFunction((afterFrame) => (
    window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame > afterFrame
  ), atomicPlayerConvergence.samples.at(-1)!.presentedGameplayFrame);
  const botPlacement = await page.evaluate((fixture) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const before = api.snapshot() as any;
    const preFrame = api.admissionState().presentedGameplayFrame;
    api.setBotPresentation('stand', 1.2, 'carbine');
    const placement = api.placeBotAhead(fixture.botDistanceM);
    const postFrame = api.admissionState().presentedGameplayFrame;
    return {
      preFrame,
      postFrame,
      prePlayer: {
        position: [...before.player.position],
        yaw: before.player.yaw,
        grounded: before.player.grounded,
      },
      placement,
    };
  }, RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic);
  const placementContract = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.placement;
  expect(botPlacement.postFrame, 'presented frontier does not advance during synchronous bot placement').toBe(botPlacement.preFrame);
  expect(botPlacement.preFrame, 'bot placement is sampled after convergence').toBeGreaterThan(
    atomicPlayerConvergence.samples.at(-1)!.presentedGameplayFrame,
  );
  expect(botPlacement.prePlayer.position, 'placement player position is one exact finite vec3').toHaveLength(3);
  expect(botPlacement.prePlayer.position.every(Number.isFinite), 'placement player axes are finite').toBe(true);
  expect(botPlacement.prePlayer.grounded, 'placement player remains grounded').toBe(true);
  expect(botPlacement.prePlayer.yaw, 'placement player retains fixed yaw').toBeCloseTo(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.playerYaw, 12,
  );
  botPlacement.prePlayer.position.forEach((value: number, axis: number) => expect(
    withinNumericBoundary(
      Math.abs(value - RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlementPositionAnchor[axis]),
      RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlement.maximumAbsoluteAxisErrorM[axis],
      [value, RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlementPositionAnchor[axis]],
    ),
    `placement player axis ${axis} remains in settlement envelope`,
  ).toBe(true));
  const derivedBotPosition = [
    botPlacement.prePlayer.position[0] - Math.sin(botPlacement.prePlayer.yaw) * placementContract.distanceM,
    placementContract.rootY,
    botPlacement.prePlayer.position[2] - Math.cos(botPlacement.prePlayer.yaw) * placementContract.distanceM,
  ];
  const derivedBotYaw = Math.atan2(
    -(botPlacement.prePlayer.position[0] - derivedBotPosition[0]),
    -(botPlacement.prePlayer.position[2] - derivedBotPosition[2]),
  );
  expect(Math.abs(derivedBotYaw - RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.expectedBotYaw),
    'derived facing yaw remains inside the immutable nominal fixture')
    .toBeLessThanOrEqual(placementContract.arithmeticEpsilonM);
  expect(botPlacement.placement).not.toBeNull();
  expect(botPlacement.placement).toMatchObject({
    contract: placementContract.contract,
    source: placementContract.source,
    requestedDistanceM: placementContract.distanceM,
    stagedDistanceM: placementContract.distanceM,
    yawOffsetRadians: placementContract.requiredYawOffsetRadians,
    presentedGameplayFrameAtCommand: botPlacement.preFrame,
    bot: { alive: true, weapon: 'carbine' },
  });
  expect(botPlacement.placement!.sourcePlayer).toEqual({
    position: botPlacement.prePlayer.position,
    yaw: botPlacement.prePlayer.yaw,
    grounded: botPlacement.prePlayer.grounded,
  });
  expect(botPlacement.placement!.bot.logicalPosition).toEqual(botPlacement.placement!.bot.rootPosition);
  botPlacement.placement!.bot.logicalPosition.forEach((value: number, axis: number) => expect(
    Math.abs(value - derivedBotPosition[axis]), `derived placement axis ${axis}`,
  ).toBeLessThanOrEqual(placementContract.arithmeticEpsilonM));
  expect(Math.abs(botPlacement.placement!.bot.rootYaw - derivedBotYaw), 'derived bot-facing yaw')
    .toBeLessThanOrEqual(placementContract.arithmeticEpsilonM);
  derivedBotPosition.forEach((value: number, axis: number) => expect(
    Math.abs(value - RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.nominalBotPosition[axis]),
    `derived nominal bot axis ${axis}`,
  ).toBeLessThanOrEqual(placementContract.nominalPositionEnvelopeM[axis]));
  await waitForStrictPose(page, 'armed-bot');
  const armedFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  await page.waitForTimeout(420);
  await waitForStrictPose(page, 'armed-bot');
  const armedSecond = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  expectArmPose(armedFirst.operatorModel, 'armed live bot first pose', true);
  expectArmPose(armedSecond.operatorModel, 'armed live bot second pose', true);
  const armedMotion = poseMotion(armedFirst, armedSecond);
  expectPoseMotion(armedMotion, 'armed live bot', false);
  const stagedAtomic = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot() as any;
    return {
      presentedGameplayFrame: api.admissionState().presentedGameplayFrame,
      player: snapshot.player,
      bot: snapshot.bots[0],
    };
  });
  expect(armedFirst.id, 'armed first and second samples share exact actor identity').toBe(armedSecond.id);
  expect(stagedAtomic.bot.id, 'staged fixture is the same sampled armed actor').toBe(armedFirst.id);
  expect(botPlacement.placement!.bot.id, 'placement transaction is the same sampled armed actor').toBe(armedFirst.id);
  expect([armedFirst.alive, armedSecond.alive, stagedAtomic.bot.alive], 'armed actor remains alive across staging').toEqual([
    true, true, true,
  ]);
  expect([armedFirst.weapon, armedSecond.weapon, stagedAtomic.bot.weapon], 'armed actor retains exact carbine identity').toEqual([
    'carbine', 'carbine', 'carbine',
  ]);
  expect(stagedAtomic.player.position, 'settled Atomic player is one exact finite vec3').toHaveLength(3);
  expect(stagedAtomic.player.position.every(Number.isFinite), 'settled Atomic player axes are finite').toBe(true);
  stagedAtomic.player.position.forEach((value: number, axis: number) => expect(
    withinNumericBoundary(
      Math.abs(value - RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlementPositionAnchor[axis]),
      RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlement.maximumAbsoluteAxisErrorM[axis],
      [value, RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.settlementPositionAnchor[axis]],
    ),
    `settled Atomic player axis ${axis} error`,
  ).toBe(true));
  expect(stagedAtomic.player.grounded, 'settled Atomic player remains grounded before evidence capture').toBe(true);
  expect(stagedAtomic.player.yaw, 'fixed Atomic player yaw').toBeCloseTo(
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.playerYaw, 8,
  );
  expect(stagedAtomic.presentedGameplayFrame, 'later staged player follows placement transaction').toBeGreaterThan(
    botPlacement.postFrame,
  );
  for (const [label, bot] of [
    ['placement', botPlacement.placement!.bot],
    ['armed first', armedFirst],
    ['armed second', armedSecond],
    ['staged', stagedAtomic.bot],
  ] as const) {
    const position = label === 'placement' ? bot.logicalPosition : bot.position;
    position.forEach((value: number, axis: number) => expect(
      Math.abs(value - derivedBotPosition[axis]), `${label} bot derived axis ${axis}`,
    ).toBeLessThanOrEqual(placementContract.arithmeticEpsilonM));
    expect(Math.abs(bot.rootYaw - derivedBotYaw), `${label} bot root yaw remains stable`)
      .toBeLessThanOrEqual(placementContract.arithmeticEpsilonM);
  }
  const armedActor = { kind: 'bot' as const, id: armedSecond.id };
  const armedMediumScreenshot = await captureAtFixedPose(
    page, testInfo, RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.mediumCamera,
    'armed-live-bot-medium', armedActor, MEDIUM_ROI_NDC,
  );
  const armedCloseScreenshot = await captureAtFixedPose(
    page, testInfo, RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.closeCamera,
    'armed-live-bot-close', armedActor, CLOSE_ROI_NDC, true,
  );
  const armedScreenshots = {
    medium: armedMediumScreenshot,
    close: armedCloseScreenshot,
    leftHand: await captureHandAtFixedOutsidePose(page, testInfo, armedActor, 'left', armedCloseScreenshot),
    rightHand: await captureHandAtFixedOutsidePose(page, testInfo, armedActor, 'right', armedCloseScreenshot),
  };
  const handDirectionDot = (armedScreenshots.leftHand.framing.camera.outsideDirectionWorld as number[])
    .reduce((sum, value, axis) => (
      sum + value * (armedScreenshots.rightHand.framing.camera.outsideDirectionWorld as number[])[axis]
    ), 0);
  expect(handDirectionDot, 'left/right hand cameras occupy opposite shoulder-derived hemispheres').toBeLessThanOrEqual(
    HAND_CAMERA_CONTRACT.maximumPeerDirectionDot,
  );
  const atomicCaptureRevisions = [
    armedScreenshots.medium.presentation.requestedRevision,
    armedScreenshots.close.presentation.requestedRevision,
    armedScreenshots.leftHand.presentation.requestedRevision,
    armedScreenshots.rightHand.presentation.requestedRevision,
  ];
  expect(atomicCaptureRevisions.every((revision, index) => (
    index === 0 || revision > atomicCaptureRevisions[index - 1]
  )), 'Atomic evidence cameras use strictly increasing revisions').toBe(true);
  const armedRuntime = await captureSurfaceEvidence(page, testInfo, 'atomic-acres');

  await deploy(page, 'gun-range');
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
  });
  const expectedDummyIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(({ id }) => id);
  await waitForStrictPose(page, 'unarmed-dummies', expectedDummyIds);
  const dummyFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
    .filter((target: any) => target.kind === 'training-dummy'));
  await page.waitForTimeout(460);
  await waitForStrictPose(page, 'unarmed-dummies', expectedDummyIds);
  const dummySecond = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
    .filter((target: any) => target.kind === 'training-dummy'));
  expect(dummyFirst.map(({ id }: any) => id)).toEqual(expectedDummyIds);
  expect(dummySecond.map(({ id }: any) => id)).toEqual(expectedDummyIds);
  const dummies = dummyFirst.map((first: any, index: number) => {
    const second = dummySecond[index];
    const definition = GUN_RANGE_TEST_BAY_CONTRACT.dummies[index];
    expect(first.id, `${definition.id}: first sample identity`).toBe(definition.id);
    expect(second.id, `${definition.id}: second sample identity`).toBe(definition.id);
    expect([first.active, second.active], `${definition.id}: remains an active rendered target`).toEqual([true, true]);
    expect(first.armed, `${first.id}: explicitly unarmed`).toBe(false);
    expect(second.armed, `${first.id}: remains unarmed`).toBe(false);
    expectArmPose(first.operatorModel, `${first.id} first pose`, false);
    expectArmPose(second.operatorModel, `${first.id} second pose`, false);
    expect(first.operatorModel.animationContract.speed).toBeCloseTo(definition.speedMps, 5);
    expect(second.operatorModel.animationContract.speed).toBeCloseTo(definition.speedMps, 5);
    const motion = poseMotion(first, second);
    expectPoseMotion(motion, first.id, true);
    return { id: first.id, definition, first, second, motion };
  });

  const overviewPresentation = await commitCaptureCamera(
    page,
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.overviewCamera,
    expectedDummyIds.map((id) => ({ kind: 'training-dummy' as const, id })),
    RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.fixedVisualTimeMs,
  );
  const overviewFraming = await captureFraming(
    page,
    expectedDummyIds.map((id) => ({ kind: 'training-dummy' as const, id })),
    overviewPresentation,
    OVERVIEW_ROI_NDC,
  );
  const overviewLineOfSight = [];
  for (const id of expectedDummyIds) {
    overviewLineOfSight.push(await sampleRequiredLineOfSight(
      page,
      { kind: 'training-dummy' as const, id },
      overviewPresentation,
      overviewFraming.find((framing: any) => framing.actor.id === id),
    ));
  }
  const overviewScreenshot = {
    ...await screenshotPresentedFrameWithHash(
      page,
      testInfo,
      'gun-range-dummies-medium',
      overviewPresentation,
    ),
    fixtureContract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.contract,
    camera: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.overviewCamera,
    presentation: overviewPresentation,
    lineOfSight: overviewLineOfSight,
    framing: overviewFraming,
  };
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setRiggedEvidenceCaptureTargets([]);
    window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
  });
  const dummyEvidence = [];
  for (let index = 0; index < dummies.length; index += 1) {
    const dummy = dummies[index];
    const fixedFixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange.dummies[index];
    expect(fixedFixture.actor.id, `${dummy.id}: fixed camera identity`).toBe(dummy.id);
    const rasterProof = await captureDummyProductionRgbRasterProof(
      page,
      testInfo,
      fixedFixture.camera,
      { kind: 'training-dummy', id: dummy.id },
    );
    const closeScreenshot = rasterProof.visibleScreenshot;
    const fixedActorFrame = closeScreenshot.presentation.pausedPresentedCapture.actors[0];
    expect(fixedActorFrame.actor, `${dummy.id}: exact final-frame actor identity`).toEqual({
      kind: 'training-dummy', id: dummy.id,
    });
    fixedActorFrame.rootPosition.forEach((value: number, axis: number) => expect(
      value,
      `${dummy.id}: fixed rendered evidence axis ${axis}`,
    ).toBeCloseTo(fixedFixture.actor.position[axis], 8));
    expect(fixedActorFrame.rootYaw, `${dummy.id}: fixed evidence yaw`).toBeCloseTo(fixedFixture.actor.yaw, 8);
    dummyEvidence.push({
      ...dummy,
      fixedFixture,
      fixedActor: {
        id: dummy.id,
        position: fixedActorFrame.rootPosition,
        yaw: fixedActorFrame.rootYaw,
        frame: closeScreenshot.presentation.pausedPresentedCapture.frame,
        captureRevision: closeScreenshot.presentation.requestedRevision,
      },
      closeScreenshot,
      rasterProof,
    });
  }
  const gunRangeRuntime = await captureSurfaceEvidence(page, testInfo, 'gun-range');
  const gunRangeCaptureRevisions = [
    overviewScreenshot.presentation.requestedRevision,
    ...dummyEvidence.flatMap((entry) => entry.rasterProof.captureOrder.map(({ captureRevision }: any) => captureRevision)),
  ];
  expect(gunRangeCaptureRevisions.every((revision, index) => (
    index === 0 || revision > gunRangeCaptureRevisions[index - 1]
  )), 'Gun Range overview and closeups use strictly increasing revisions').toBe(true);
  expect(gunRangeRuntime.servedCandidate).toEqual(armedRuntime.servedCandidate);
  expect(browserErrors).toEqual([]);

  const endingSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  const endingSourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  if (officialEvidence) {
    expect(endingSourceSha, 'official rigged-bot evidence ends at the same exact HEAD').toBe(sourceSha);
    expect(endingSourceStatus, 'official rigged-bot evidence ends with a clean worktree').toBe('');
  }
  writeFileSync(receiptPath, `${JSON.stringify({
    schemaVersion: 11,
    status: 'AUTOMATION_PASS_OWNER_PENDING',
    contract: 'atomic-acres/pass69-3-rigged-bot-live@11',
    evidenceScope: 'weighted-skin-anti-t-five-digit-grip-orientation-fixed-grounded-convergence-los-committed-frame-shoulder-oblique-hand-detail-self-occlusion-main-camera-draw-stamps-and-production-rgb-raster-proof',
    target: officialEvidence ? expectedTarget : `development-${renderer}`,
    sourceSha,
    endingSourceSha,
    cleanSource: sourceStatus === '' && endingSourceStatus === '',
    renderer,
    renderProfile,
    viewport: [1_600, 900],
    armBindThresholds: ARM_BONES.map(({ side, role, sourceBone, bone, minimumBindRadians }) => (
      { side, role, sourceBone, bone, minimumBindRadians }
    )),
    handBindThresholds: HAND_BONES,
    renderedInfluenceThresholds: RENDERED_INFLUENCE_THRESHOLDS,
    antiTThresholds: ANTI_T_THRESHOLDS,
    gripThresholds: GRIP_THRESHOLDS,
    closeJointThresholds: CLOSE_JOINT_THRESHOLDS,
    handDetailThresholds: HAND_DETAIL_THRESHOLDS,
    handCameraContract: HAND_CAMERA_CONTRACT,
    captureRoisNdc: {
      close: CLOSE_ROI_NDC,
      hand: HAND_ROI_NDC,
      medium: MEDIUM_ROI_NDC,
      overview: OVERVIEW_ROI_NDC,
    },
    visualEvidenceContract: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT,
    visualReview: {
      required: true,
      status: 'PENDING_OWNER_INSPECTION',
      automatedFramingIsNotVisualAcceptance: true,
      worldLayoutLosDoesNotProveActorSelfOcclusion: true,
      handSelfOcclusionRayDoesNotReplaceVisualAcceptance: true,
      inspectionScope: 'armed medium/full close/left hand/right hand plus four restored dummy closeups, four suppressed controls, and shared overview',
    },
    browser: {
      project: testInfo.project.name,
      channel: officialEvidence ? 'msedge' : 'configured-chromium',
      version: browser.version(),
      userAgent: gunRangeRuntime.userAgent,
    },
    armedBot: {
      id: armedFirst.id,
      weapon: armedFirst.weapon,
      alive: armedFirst.alive,
      first: armedFirst,
      second: armedSecond,
      motion: armedMotion,
      fixedFixture: {
        definition: RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic,
        commandedPlayer: commandedAtomicPlayer,
        convergence: atomicPlayerConvergence,
        placement: botPlacement,
        derivedBotPosition,
        derivedBotYaw,
        stagedPlayer: {
          presentedGameplayFrame: stagedAtomic.presentedGameplayFrame,
          position: stagedAtomic.player.position,
          yaw: stagedAtomic.player.yaw,
          grounded: stagedAtomic.player.grounded,
        },
        stagedBot: {
          presentedGameplayFrame: stagedAtomic.presentedGameplayFrame,
          position: stagedAtomic.bot.position,
          rootYaw: stagedAtomic.bot.rootYaw,
          id: stagedAtomic.bot.id,
          alive: stagedAtomic.bot.alive,
          weapon: stagedAtomic.bot.weapon,
        },
        observedBotPosition: stagedAtomic.bot.position,
        observedBotYaw: stagedAtomic.bot.rootYaw,
        observedBotId: stagedAtomic.bot.id,
        observedBotAlive: stagedAtomic.bot.alive,
        observedBotWeapon: stagedAtomic.bot.weapon,
      },
      screenshots: armedScreenshots,
    },
    gunRangeDummies: {
      expectedIds: expectedDummyIds,
      overviewScreenshot,
      entries: dummyEvidence,
    },
    surfaces: { armedBot: armedRuntime, gunRange: gunRangeRuntime },
    browserErrors,
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
});
