import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';

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
const RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS = 0.38;
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
const HAND_CAMERA_CONTRACT = Object.freeze({
  contract: 'fixed-horizontal-wrist-from-weapon-center-v1',
  outsideOffsetM: 0.7,
  upwardOffsetM: 0.12,
  fovDegrees: 48,
  maximumSourceJointDriftM: 0.03,
});
const CLOSE_ROI_NDC = Object.freeze({ minX: -0.46, maxX: 0.46, minY: -0.7, maxY: 0.7 });
const HAND_ROI_NDC = Object.freeze({ minX: -0.55, maxX: 0.55, minY: -0.68, maxY: 0.68 });
const MEDIUM_ROI_NDC = Object.freeze({ minX: -0.68, maxX: 0.68, minY: -0.82, maxY: 0.82 });
const OVERVIEW_ROI_NDC = Object.freeze({ minX: -0.97, maxX: 0.97, minY: -0.95, maxY: 0.95 });

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function route(map: 'atomic-acres' | 'gun-range', seed: string): string {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  return `/?release=latest&map=${map}&renderer=${renderer}${requireWebGpu}&render=${renderProfile}`
    + `&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=${seed}-${renderer}`;
}

function quaternionDelta(left: number[], right: number[]): number {
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0));
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function normalizedQuaternionDelta(left: number[], right: number[]): number {
  const denominator = Math.hypot(...left) * Math.hypot(...right);
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0) / denominator);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function positionDelta(left: number[], right: number[]): number {
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function subtract(left: number[], right: number[]): number[] {
  return left.map((value, index) => value - right[index]);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
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
        contract: 'pass65-evaluated-per-digit-grip-curl-v2',
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
    expect(model.supportGrip.fingerCurl.bones).toHaveLength(10);
    expect(model.supportGrip.fingerCurl.bones.every(({ applied, curlRadians }: any) => applied === true && Math.abs(curlRadians) >= 0.18)).toBe(true);
    const rightPinky = model.handPose.bones.find(({ side, digit }: any) => side === 'right' && digit === 'pinky');
    const rightPinkyFloor = model.supportGrip.fingerCurl.rightPinkyBindFloor;
    expect(rightPinkyFloor, `${label}: firing pinky floor receipts the rendered joint`).toMatchObject({
      contract: 'post-mixer-authored-bind-relative-hand-floor-v1',
      reference: 'immutable-authored-handBindPose-before-animation',
      side: 'right',
      digit: 'pinky',
      sourceBone: 'Pinky2.R',
      bone: 'Pinky2R',
      minimumBindDeltaRadians: RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS,
      preservedShortestRelativeAxis: true,
      appliedToRenderedBone: true,
      allFinite: true,
    });
    expect(rightPinkyFloor.afterBindDeltaRadians, `${label}: firing pinky post-mixer floor`)
      .toBeGreaterThanOrEqual(RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS - 1e-9);
    const bindNorm = Math.hypot(...rightPinkyFloor.bindLocalQuaternion);
    const expectedAppliedRelativeAngle = 2 * Math.acos(
      Math.cos(RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS / 2) / bindNorm,
    );
    expect(rightPinkyFloor.bindQuaternionNorm, `${label}: receipts immutable float32 bind norm`).toBeCloseTo(bindNorm, 12);
    expect(rightPinkyFloor.floorTargetRelativeAngleRadians, `${label}: compensates authored float32 bind norm`).toBeCloseTo(expectedAppliedRelativeAngle, 12);
    expect(rightPinkyFloor.bindNormCompensationRadians, `${label}: receipts bind-norm compensation`).toBeCloseTo(
      expectedAppliedRelativeAngle - RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS,
      12,
    );
    expect(rightPinkyFloor.beforeBindDeltaRadians, `${label}: independently recomputed pre-floor delta`).toBeCloseTo(
      quaternionDelta(rightPinkyFloor.beforeLocalQuaternion, rightPinkyFloor.bindLocalQuaternion),
      9,
    );
    expect(rightPinkyFloor.afterBindDeltaRadians, `${label}: independently recomputed post-floor delta`).toBeCloseTo(
      quaternionDelta(rightPinkyFloor.afterLocalQuaternion, rightPinkyFloor.bindLocalQuaternion),
      9,
    );
    expect(rightPinkyFloor.reportedBindDeltaCorrectionRadians, `${label}: receipts the bounded reported correction`).toBeCloseTo(
      rightPinkyFloor.intervened
        ? RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS - rightPinkyFloor.beforeBindDeltaRadians : 0,
      9,
    );
    expect(rightPinkyFloor.renderedOrientationCorrectionRadians, `${label}: receipts the actual rendered correction`).toBeCloseTo(
      normalizedQuaternionDelta(rightPinkyFloor.beforeLocalQuaternion, rightPinkyFloor.afterLocalQuaternion),
      9,
    );
    expect(rightPinkyFloor.afterBindDeltaRadians, `${label}: telemetry equals actual rendered Pinky2R delta`).toBeCloseTo(
      rightPinky.bindQuaternionDeltaRadians,
      9,
    );
    expect(quaternionDelta(rightPinkyFloor.afterLocalQuaternion, rightPinky.localQuaternion), `${label}: telemetry is the actual rendered Pinky2R quaternion`)
      .toBeLessThanOrEqual(1e-9);
    expect(quaternionDelta(rightPinkyFloor.bindLocalQuaternion, rightPinky.bindLocalQuaternion), `${label}: floor uses immutable authored Pinky2R bind`)
      .toBeLessThanOrEqual(1e-9);
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

async function waitForPresentedFrame(page: Page): Promise<void> {
  const frame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > before, frame, { timeout: 5_000 });
}

async function screenshotWithHash(page: Page, testInfo: TestInfo, name: string): Promise<{ path: string; sha256: string }> {
  const path = resolve(artifactRoot, `${name}.png`);
  const screenshot = await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
  return { path: repositoryRelative(path), sha256: sha256(screenshot) };
}

type CaptureActor = Readonly<{ kind: 'bot' | 'training-dummy'; id: string }>;
type CaptureRoi = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;

async function captureFraming(
  page: Page,
  actors: readonly CaptureActor[],
  roiNdc: CaptureRoi,
  requireJointDetail = false,
): Promise<any[]> {
  const expectedJoints = [
    ...ARM_BONES.map(({ side, role, bone }) => ({ kind: 'arm', side, role, digit: null, bone })),
    ...HAND_BONES.map(({ side, digit, bone }) => ({ kind: 'finger', side, role: null, digit, bone })),
  ];
  const evidence = await page.evaluate(({ requestedActors, roi, strictJoints, expected, jointThresholds }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
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
      const target = actor.kind === 'bot'
        ? snapshot.bots.find((candidate: any) => candidate.id === actor.id)
        : snapshot.rangePractice.targets.find((candidate: any) => candidate.id === actor.id);
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
        missing: false,
        screenPosition: [x, y, z],
        roiNdc: roi,
        withinRoi,
        onScreen,
        rootVisible: actor.kind === 'bot' ? target.rootVisible : target.visible,
        rootEffectivelyVisible: target.rootEffectivelyVisible,
        effectivelyVisibleMeshCount: target.effectivelyVisibleMeshCount,
        effectivelyVisibleSkinnedMeshes: target.operatorModel?.effectivelyVisibleSkinnedMeshes ?? [],
        armSkinVisible: target.operatorModel?.armPose?.allInEffectivelyVisibleSkinnedMesh === true,
        handSkinVisible: target.operatorModel?.handPose?.allInEffectivelyVisibleSkinnedMesh === true,
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
    roi: roiNdc,
    strictJoints: requireJointDetail,
    expected: expectedJoints,
    jointThresholds: CLOSE_JOINT_THRESHOLDS,
  });
  for (const framing of evidence) {
    const label = `${framing.actor.kind}:${framing.actor.id}`;
    expect(framing.missing, `${label}: capture actor exists`).toBe(false);
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

function cameraPose(target: number[], distance: number): { x: number; y: number; z: number; yaw: number; pitch: number } {
  const x = target[0] + distance * 0.72;
  const y = target[1] + 1.08;
  const z = target[2] + distance * 0.69;
  return {
    x,
    y,
    z,
    yaw: Math.atan2(-(target[0] - x), -(target[2] - z)),
    pitch: -0.035,
  };
}

async function captureAtPose(
  page: Page,
  testInfo: TestInfo,
  target: number[],
  distance: number,
  name: string,
  actor: CaptureActor,
  roiNdc: CaptureRoi,
  requireJointDetail = false,
) {
  const pose = cameraPose(target, distance);
  await page.evaluate(({ x, y, z, yaw, pitch }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(false);
    api.setCaptureCameraPose(x, y, z, yaw, pitch, 58);
  }, pose);
  await waitForPresentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const [framing] = await captureFraming(page, [actor], roiNdc, requireJointDetail);
  const screenshot = await screenshotWithHash(page, testInfo, name);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  return { ...screenshot, framing };
}

async function captureHandFraming(
  page: Page,
  actor: CaptureActor,
  side: 'left' | 'right',
  camera: Record<string, unknown>,
): Promise<any> {
  const expectedJoints = [
    ...ARM_BONES.filter((joint) => joint.side === side && joint.role === 'wrist-hand')
      .map(({ side: jointSide, role, bone }) => ({ kind: 'arm', side: jointSide, role, digit: null, bone })),
    ...HAND_BONES.filter((joint) => joint.side === side)
      .map(({ side: jointSide, digit, bone }) => ({ kind: 'finger', side: jointSide, role: null, digit, bone })),
  ];
  const framing = await page.evaluate(({ requestedActor, requestedSide, expected, roi, thresholds, cameraEvidence }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const target = requestedActor.kind === 'bot'
      ? snapshot.bots.find((candidate: any) => candidate.id === requestedActor.id)
      : snapshot.rangePractice.targets.find((candidate: any) => candidate.id === requestedActor.id);
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
      missing: false,
      rootVisible: requestedActor.kind === 'bot' ? target.rootVisible : target.visible,
      rootEffectivelyVisible: target.rootEffectivelyVisible,
      effectivelyVisibleMeshCount: target.effectivelyVisibleMeshCount,
      effectivelyVisibleSkinnedMeshes: target.operatorModel?.effectivelyVisibleSkinnedMeshes ?? [],
      handSkinVisible: target.operatorModel?.handPose?.allInEffectivelyVisibleSkinnedMesh === true,
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
  expect(framing.effectivelyVisibleSkinnedMeshes.length, `${label}: effective skinned renderables`).toBeGreaterThan(0);
  expect(framing.handDetail.sentinels, `${label}: wrist plus five digit sentinels`).toHaveLength(6);
  expect(framing.handDetail.fingerSpans, `${label}: five independently measured wrist-to-finger spans`).toHaveLength(5);
  for (const sentinel of framing.handDetail.sentinels) {
    const source = (camera.sourceSentinels as any[]).find((candidate) => candidate.bone === sentinel.bone);
    expect(source, `${label}: ${sentinel.bone} is bound to the camera source pose`).toBeDefined();
    expect(positionDelta(sentinel.worldPosition, source.worldPosition), `${label}: ${sentinel.bone} source-to-capture drift`).toBeLessThanOrEqual(
      HAND_CAMERA_CONTRACT.maximumSourceJointDriftM,
    );
  }
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
) {
  const expectedJoints = [
    ...ARM_BONES.filter((joint) => joint.side === side && joint.role === 'wrist-hand')
      .map(({ side: jointSide, role, bone }) => ({ kind: 'arm', side: jointSide, role, digit: null, bone })),
    ...HAND_BONES.filter((joint) => joint.side === side)
      .map(({ side: jointSide, digit, bone }) => ({ kind: 'finger', side: jointSide, role: null, digit, bone })),
  ];
  const source = await page.evaluate(({ requestedActor, expected }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const target = requestedActor.kind === 'bot'
      ? snapshot.bots.find((candidate: any) => candidate.id === requestedActor.id)
      : snapshot.rangePractice.targets.find((candidate: any) => candidate.id === requestedActor.id);
    if (!target) return { valid: false, reason: 'missing-actor', sentinels: [], weaponCenterWorld: null };
    const sentinels = expected.map((wanted) => {
      const observed = (target.jointScreenPositions ?? []).find((joint: any) => (
        joint.kind === wanted.kind && joint.side === wanted.side && joint.role === wanted.role
          && joint.digit === wanted.digit && joint.bone === wanted.bone
      ));
      return observed ? { ...wanted, worldPosition: observed.worldPosition } : null;
    });
    const weaponCenterWorld = target.operatorModel?.weaponBounds?.center ?? null;
    return {
      valid: sentinels.every((joint) => joint !== null)
        && Array.isArray(weaponCenterWorld) && weaponCenterWorld.length === 3,
      reason: null,
      sentinels,
      weaponCenterWorld,
    };
  }, { requestedActor: actor, expected: expectedJoints });
  const label = `${actor.kind}:${actor.id}:${side}-hand-camera`;
  expect(source.valid, `${label}: live wrist/finger joints and rendered weapon center are available`).toBe(true);
  expect(source.sentinels).toHaveLength(6);
  const sourceSentinels = source.sentinels as Array<{ worldPosition: number[] }>;
  expect(sourceSentinels.every(({ worldPosition }) => (
    Array.isArray(worldPosition) && worldPosition.length === 3 && worldPosition.every(Number.isFinite)
  )), `${label}: finite live wrist/finger world positions`).toBe(true);
  const weaponCenterWorld = source.weaponCenterWorld as number[];
  expect(weaponCenterWorld.every(Number.isFinite), `${label}: finite rendered weapon center`).toBe(true);
  const wristWorld = sourceSentinels[0].worldPosition;
  const outsideDelta = [wristWorld[0] - weaponCenterWorld[0], 0, wristWorld[2] - weaponCenterWorld[2]];
  const outsideLength = Math.hypot(outsideDelta[0], outsideDelta[2]);
  expect(outsideLength, `${label}: non-degenerate outside-of-weapon horizontal vector`).toBeGreaterThan(0.01);
  const outsideDirectionWorld = outsideDelta.map((value) => value / outsideLength);
  const targetWorld = [0, 1, 2].map((axis) => (
    sourceSentinels.reduce((sum, joint) => sum + joint.worldPosition[axis], 0) / sourceSentinels.length
  ));
  const positionWorld = targetWorld.map((value, axis) => value
    + outsideDirectionWorld[axis] * HAND_CAMERA_CONTRACT.outsideOffsetM
    + (axis === 1 ? HAND_CAMERA_CONTRACT.upwardOffsetM : 0));
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
  const camera = {
    ...HAND_CAMERA_CONTRACT,
    actor,
    side,
    source: 'live-rendered-weapon-center-and-rigged-joint-world-transforms',
    sourceWeaponCenterWorld: weaponCenterWorld,
    sourceSentinels,
    outsideDirectionWorld,
    targetWorld,
    positionWorld,
    yaw: pose.yaw,
    pitch: pose.pitch,
  };
  await page.evaluate(({ x, y, z, yaw, pitch, fov }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(false);
    api.setCaptureCameraPose(x, y, z, yaw, pitch, fov);
  }, pose);
  await waitForPresentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const framing = await captureHandFraming(page, actor, side, camera);
  const screenshot = await screenshotWithHash(page, testInfo, `armed-live-bot-${side}-hand-close`);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  return { ...screenshot, framing };
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
  if (officialEvidence) {
    expect(sourceSha, 'official rigged-bot evidence starts at requested exact HEAD').toBe(expectedSourceSha);
    expect(sourceStatus, 'official rigged-bot evidence starts from a clean worktree').toBe('');
  }
  await page.setViewportSize({ width: 1_600, height: 900 });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });

  await deploy(page, 'atomic-acres');
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setCaptureViewmodelHidden(true);
    api.setBotsFrozen(true);
    api.placeBotAhead(5.2);
    api.setBotPresentation('stand', 1.2, 'carbine');
  });
  await waitForStrictPose(page, 'armed-bot');
  const armedFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  await page.waitForTimeout(420);
  await waitForStrictPose(page, 'armed-bot');
  const armedSecond = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  expectArmPose(armedFirst.operatorModel, 'armed live bot first pose', true);
  expectArmPose(armedSecond.operatorModel, 'armed live bot second pose', true);
  const armedMotion = poseMotion(armedFirst, armedSecond);
  expectPoseMotion(armedMotion, 'armed live bot', false);
  const armedActor = { kind: 'bot' as const, id: armedSecond.id };
  const armedScreenshots = {
    medium: await captureAtPose(page, testInfo, armedSecond.position, 4.4, 'armed-live-bot-medium', armedActor, MEDIUM_ROI_NDC),
    close: await captureAtPose(page, testInfo, armedSecond.position, 2.00, 'armed-live-bot-close', armedActor, CLOSE_ROI_NDC, true),
    leftHand: await captureHandAtFixedOutsidePose(page, testInfo, armedActor, 'left'),
    rightHand: await captureHandAtFixedOutsidePose(page, testInfo, armedActor, 'right'),
  };
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

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera('gun-range-test-bay-overview'))).toBe(true);
  await waitForPresentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const overviewFraming = await captureFraming(
    page,
    expectedDummyIds.map((id) => ({ kind: 'training-dummy' as const, id })),
    OVERVIEW_ROI_NDC,
  );
  const overviewScreenshot = {
    ...await screenshotWithHash(page, testInfo, 'gun-range-dummies-medium'),
    framing: overviewFraming,
  };
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  const dummyEvidence = [];
  for (const dummy of dummies) {
    const current = await page.evaluate((id) => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
      .find((target: any) => target.id === id), dummy.id);
    const closeScreenshot = await captureAtPose(
      page,
      testInfo,
      current.position,
      2.1,
      `${dummy.id}-close`,
      { kind: 'training-dummy', id: dummy.id },
      CLOSE_ROI_NDC,
      true,
    );
    dummyEvidence.push({ ...dummy, closeScreenshot });
  }
  const gunRangeRuntime = await captureSurfaceEvidence(page, testInfo, 'gun-range');
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
    schemaVersion: 4,
    status: 'AUTOMATION_PASS_OWNER_PENDING',
    contract: 'atomic-acres/pass69-3-rigged-bot-live@4',
    evidenceScope: 'weighted-skin-anti-t-five-digit-grip-orientation-full-body-and-fixed-hand-detail-framing',
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
    visualReview: {
      required: true,
      status: 'PENDING_OWNER_INSPECTION',
      automatedFramingIsNotVisualAcceptance: true,
      inspectionScope: 'armed medium/full close/left hand/right hand plus four dummy closeups and shared overview',
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
      screenshots: armedScreenshots,
    },
    gunRangeDummies: {
      expectedIds: expectedDummyIds,
      overviewScreenshot,
      entries: dummyEvidence,
    },
    surfaces: { armedBot: armedRuntime, gunRange: gunRangeRuntime },
    browserErrors,
  }, null, 2)}\n`, 'utf8');
});
