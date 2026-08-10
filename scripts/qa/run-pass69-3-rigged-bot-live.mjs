import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4561' }),
  'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4562' }),
});
const selfTestMode = process.argv[2] === '--self-test';
const validateReceiptMode = process.argv[2] === '--validate-receipt';
const targetName = selfTestMode ? 'edge-webgl2'
  : validateReceiptMode ? process.argv[3] ?? '' : process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 69.3 rigged-bot target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const artifactBase = resolve(root, 'artifacts/pass69-3/rigged-bot-live');
const rendererArtifacts = resolve(artifactBase, target.renderer);
const receiptPath = resolve(artifactBase, `receipt-${target.renderer}.json`);
const validationReceiptPath = validateReceiptMode && process.argv[4]
  ? resolve(root, process.argv[4]) : receiptPath;
const expectedDummyIds = Object.freeze([
  'test-dummy-alpha', 'test-dummy-bravo', 'test-dummy-charlie', 'test-dummy-delta',
]);
const expectedBones = Object.freeze([
  Object.freeze({ side: 'left', role: 'shoulder', sourceBone: 'UpperArm.L', bone: 'UpperArmL', minimumBindRadians: 0.5 }),
  Object.freeze({ side: 'left', role: 'elbow', sourceBone: 'LowerArm.L', bone: 'LowerArmL', minimumBindRadians: 0.15 }),
  Object.freeze({ side: 'left', role: 'wrist-hand', sourceBone: 'Wrist.L', bone: 'WristL', minimumBindRadians: 0.05 }),
  Object.freeze({ side: 'right', role: 'shoulder', sourceBone: 'UpperArm.R', bone: 'UpperArmR', minimumBindRadians: 0.5 }),
  Object.freeze({ side: 'right', role: 'elbow', sourceBone: 'LowerArm.R', bone: 'LowerArmR', minimumBindRadians: 0.15 }),
  Object.freeze({ side: 'right', role: 'wrist-hand', sourceBone: 'Wrist.R', bone: 'WristR', minimumBindRadians: 0.05 }),
]);
const expectedHandBones = Object.freeze([
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
const expectedCaptureJoints = Object.freeze([
  ...expectedBones.map(({ side, role, bone }) => Object.freeze({ kind: 'arm', side, role, digit: null, bone })),
  ...expectedHandBones.map(({ side, digit, bone }) => Object.freeze({ kind: 'finger', side, role: null, digit, bone })),
]);
const renderedInfluenceThresholds = Object.freeze({
  minimumNormalizedWeight: 0.05,
  minimumInfluencedVertices: 4,
  minimumMaximumNormalizedWeight: 0.2,
});
const antiTThresholds = Object.freeze({
  minimumVerticalDropM: 0.08,
  minimumVerticalDropRatio: 0.18,
  maximumHorizontalReachRatio: 0.9,
  maximumOutwardReachRatio: 0.82,
  minimumElbowFlexRadians: 0.3,
});
const gripThresholds = Object.freeze({ maximumPositionErrorM: 0.015, maximumQuaternionErrorRadians: 0.2 });
const carbineSecondPhalanxProductFloors = Object.freeze({
  thumb: 0.04,
  index: 0.23,
  middle: 0.21,
  ring: 0.25,
  pinky: 0.38,
});
const carbineSecondPhalanxFallbackAxis = Object.freeze([-1, 0, 0]);
const carbineSocketReferences = Object.freeze({
  'support-socket-l': Object.freeze({
    atomicSocket: 'leftGrip',
    authoredLocalPosition: Object.freeze([-0.10000000149011612, -0.03999999910593033, 0.47999998927116394]),
    evaluatedTargetLocalPosition: Object.freeze([-0.035, -0.17, -0.21]),
    liveTargetContract: 'runtime-calibrated-from-authored-source-v1',
    calibrationApplied: true,
    calibrationReason: 'third-person-swat-chain-reach-without-unsafe-stretch',
  }),
  'grip-socket-r': Object.freeze({
    atomicSocket: 'rightGrip',
    authoredLocalPosition: Object.freeze([0, -0.3400000035762787, -0.12999999523162842]),
    evaluatedTargetLocalPosition: Object.freeze([0, -0.3400000035762787, -0.12999999523162842]),
    liveTargetContract: 'authored-source-socket-retained-v1',
    calibrationApplied: false,
    calibrationReason: 'authored-firing-grip-retained',
  }),
});
const closeJointThresholds = Object.freeze({ minimumArmChainPixels: 80 });
const handDetailThresholds = Object.freeze({ minimumWristFingerPixels: 12 });
const handCameraContract = Object.freeze({
  contract: 'fixed-horizontal-wrist-from-weapon-center-v1',
  outsideOffsetM: 0.7,
  upwardOffsetM: 0.12,
  fovDegrees: 48,
  maximumSourceJointDriftM: 0.03,
});
const closeRoiNdc = Object.freeze({ minX: -0.46, maxX: 0.46, minY: -0.7, maxY: 0.7 });
const handRoiNdc = Object.freeze({ minX: -0.55, maxX: 0.55, minY: -0.68, maxY: 0.68 });
const mediumRoiNdc = Object.freeze({ minX: -0.68, maxX: 0.68, minY: -0.82, maxY: 0.82 });
const overviewRoiNdc = Object.freeze({ minX: -0.97, maxX: 0.97, minY: -0.95, maxY: 0.95 });
if (!selfTestMode && !validateReceiptMode) {
  mkdirSync(artifactBase, { recursive: true });
  rmSync(receiptPath, { force: true });
}

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
}

function discardEvidence(message) {
  rmSync(receiptPath, { force: true });
  rmSync(rendererArtifacts, { recursive: true, force: true });
  throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sameObject(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function quaternionDelta(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 4 || right.length !== 4) return Number.NaN;
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0));
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function normalizedQuaternionDelta(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 4 || right.length !== 4) return Number.NaN;
  const leftLength = vectorLength(left);
  const rightLength = vectorLength(right);
  if (!(leftLength > 0) || !(rightLength > 0)) return Number.NaN;
  const normalizedLeft = left.map((value) => value / leftLength);
  const normalizedRight = right.map((value) => value / rightLength);
  const sameHemisphereChord = vectorLength(normalizedLeft.map((value, index) => value - normalizedRight[index]));
  const oppositeHemisphereChord = vectorLength(normalizedLeft.map((value, index) => value + normalizedRight[index]));
  const shortestChord = Math.min(sameHemisphereChord, oppositeHemisphereChord);
  return 4 * Math.asin(Math.min(1, Math.max(0, shortestChord / 2)));
}

function normalizeQuaternion(value) {
  if (!finiteVector(value, 4)) return null;
  const length = vectorLength(value);
  return length > 0 ? value.map((component) => component / length) : null;
}

function multiplyQuaternions(left, right) {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function axisAngleQuaternion(axis, radians) {
  const half = radians / 2;
  const sine = Math.sin(half);
  return [axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)];
}

function canonicalBindRelativePose(bindLocalQuaternion, localQuaternion) {
  const normalizedBind = normalizeQuaternion(bindLocalQuaternion);
  const normalizedLocal = normalizeQuaternion(localQuaternion);
  if (!normalizedBind || !normalizedLocal) return null;
  const bindInverse = [-normalizedBind[0], -normalizedBind[1], -normalizedBind[2], normalizedBind[3]];
  let relative = normalizeQuaternion(multiplyQuaternions(bindInverse, normalizedLocal));
  if (!relative) return null;
  if (relative[3] < 0) relative = relative.map((component) => -component);
  const axisLength = Math.hypot(relative[0], relative[1], relative[2]);
  return {
    normalizedBind,
    normalizedLocal,
    relative,
    angleRadians: 2 * Math.acos(Math.min(1, Math.max(-1, relative[3]))),
    axis: axisLength > 1e-8
      ? relative.slice(0, 3).map((component) => component / axisLength)
      : null,
  };
}

function positionDelta(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 3 || right.length !== 3) return Number.NaN;
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function closeJointFramingValid(framing, expectedRoi) {
  const detail = framing?.jointDetail;
  if (detail?.required !== true
    || detail.expectedSentinelCount !== expectedCaptureJoints.length
    || detail.orderValid !== true
    || detail.allInsideRoi !== true
    || !sameObject(detail.thresholds, closeJointThresholds)
    || !Array.isArray(detail.sentinels)
    || detail.sentinels.length !== expectedCaptureJoints.length
    || !Array.isArray(detail.armChainPixels)
    || detail.armChainPixels.length !== 2
    || !Array.isArray(detail.wristFingerPixels)
    || detail.wristFingerPixels.length !== 2) return false;
  const pixelFor = (ndc) => ({
    x: framing.canvas.left + (ndc[0] + 1) * 0.5 * framing.canvas.width,
    y: framing.canvas.top + (1 - ndc[1]) * 0.5 * framing.canvas.height,
  });
  const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
  for (let index = 0; index < detail.sentinels.length; index += 1) {
    const sentinel = detail.sentinels[index];
    const expected = expectedCaptureJoints[index];
    if (sentinel.kind !== expected.kind || sentinel.side !== expected.side
      || sentinel.role !== expected.role || sentinel.digit !== expected.digit || sentinel.bone !== expected.bone
      || !Array.isArray(sentinel.ndc) || sentinel.ndc.length !== 3 || !sentinel.ndc.every(Number.isFinite)
      || sentinel.withinRoi !== true || sentinel.onScreen !== true) return false;
    const [x, y, z] = sentinel.ndc;
    const pixel = pixelFor(sentinel.ndc);
    if (x < expectedRoi.minX || x > expectedRoi.maxX || y < expectedRoi.minY || y > expectedRoi.maxY || z < -1 || z > 1
      || !close(sentinel.pixel?.x, pixel.x, 1e-6) || !close(sentinel.pixel?.y, pixel.y, 1e-6)
      || pixel.x < Math.max(0, framing.canvas.left)
      || pixel.x > Math.min(framing.viewport.width, framing.canvas.left + framing.canvas.width)
      || pixel.y < Math.max(0, framing.canvas.top)
      || pixel.y > Math.min(framing.viewport.height, framing.canvas.top + framing.canvas.height)) return false;
  }
  for (const side of ['left', 'right']) {
    const shoulder = detail.sentinels.find((joint) => joint.side === side && joint.role === 'shoulder');
    const elbow = detail.sentinels.find((joint) => joint.side === side && joint.role === 'elbow');
    const wrist = detail.sentinels.find((joint) => joint.side === side && joint.role === 'wrist-hand');
    const fingers = detail.sentinels.filter((joint) => joint.side === side && joint.kind === 'finger');
    const reportedChain = detail.armChainPixels.find((record) => record.side === side);
    const reportedHand = detail.wristFingerPixels.find((record) => record.side === side);
    if (!shoulder || !elbow || !wrist || fingers.length !== 5 || !reportedChain || !reportedHand) return false;
    const chainPixels = distance(shoulder.pixel, elbow.pixel) + distance(elbow.pixel, wrist.pixel);
    const minimumFingerPixels = Math.min(...fingers.map((finger) => distance(wrist.pixel, finger.pixel)));
    if (!close(reportedChain.pixels, chainPixels, 1e-6)
      || chainPixels < closeJointThresholds.minimumArmChainPixels
      || reportedHand.fingerCount !== 5
      || !close(reportedHand.minimumPixels, minimumFingerPixels, 1e-6)) return false;
  }
  return true;
}

function framingValid(framing, actor, expectedRoi, requireJointDetail = false) {
  if (framing?.missing !== false
    || !sameObject(framing.actor, actor)
    || !sameObject(framing.roiNdc, expectedRoi)
    || framing.withinRoi !== true
    || framing.onScreen !== true
    || framing.rootVisible !== true
    || framing.rootEffectivelyVisible !== true
    || !(framing.effectivelyVisibleMeshCount > 0)
    || !Array.isArray(framing.effectivelyVisibleSkinnedMeshes)
    || framing.effectivelyVisibleSkinnedMeshes.length < 1
    || framing.armSkinVisible !== true
    || framing.handSkinVisible !== true
    || !Array.isArray(framing.screenPosition)
    || framing.screenPosition.length !== 3
    || !framing.screenPosition.every(Number.isFinite)
    || !Number.isFinite(framing.canvas?.left)
    || !Number.isFinite(framing.canvas?.top)
    || !(framing.canvas?.width > 0)
    || !(framing.canvas?.height > 0)
    || !(framing.viewport?.width > 0)
    || !(framing.viewport?.height > 0)
    || !Number.isFinite(framing.projectedPixel?.x)
    || !Number.isFinite(framing.projectedPixel?.y)) return false;
  const [x, y, z] = framing.screenPosition;
  const expectedPixelX = framing.canvas.left + (x + 1) * 0.5 * framing.canvas.width;
  const expectedPixelY = framing.canvas.top + (1 - y) * 0.5 * framing.canvas.height;
  const rootValid = x >= expectedRoi.minX && x <= expectedRoi.maxX
    && y >= expectedRoi.minY && y <= expectedRoi.maxY
    && z >= -1 && z <= 1
    && Math.abs(framing.projectedPixel.x - expectedPixelX) <= 1e-6
    && Math.abs(framing.projectedPixel.y - expectedPixelY) <= 1e-6
    && framing.projectedPixel.x >= Math.max(0, framing.canvas.left)
    && framing.projectedPixel.x <= Math.min(framing.viewport.width, framing.canvas.left + framing.canvas.width)
    && framing.projectedPixel.y >= Math.max(0, framing.canvas.top)
    && framing.projectedPixel.y <= Math.min(framing.viewport.height, framing.canvas.top + framing.canvas.height);
  return rootValid && (!requireJointDetail || closeJointFramingValid(framing, expectedRoi));
}

function screenshotValid(record, expectedPath, actor, expectedRoi, requireJointDetail = false) {
  const path = resolve(root, expectedPath);
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && framingValid(record.framing, actor, expectedRoi, requireJointDetail);
}

function expectedHandCaptureJoints(side) {
  return [
    ...expectedBones.filter((joint) => joint.side === side && joint.role === 'wrist-hand')
      .map(({ side: jointSide, role, bone }) => ({ kind: 'arm', side: jointSide, role, digit: null, bone })),
    ...expectedHandBones.filter((joint) => joint.side === side)
      .map(({ side: jointSide, digit, bone }) => ({ kind: 'finger', side: jointSide, role: null, digit, bone })),
  ];
}

function finiteVector(value, dimensions = 3) {
  return Array.isArray(value) && value.length === dimensions && value.every(Number.isFinite);
}

function handCameraValid(camera, actor, side) {
  const expected = expectedHandCaptureJoints(side);
  if (camera?.contract !== handCameraContract.contract
    || camera.outsideOffsetM !== handCameraContract.outsideOffsetM
    || camera.upwardOffsetM !== handCameraContract.upwardOffsetM
    || camera.fovDegrees !== handCameraContract.fovDegrees
    || camera.maximumSourceJointDriftM !== handCameraContract.maximumSourceJointDriftM
    || !sameObject(camera.actor, actor)
    || camera.side !== side
    || camera.source !== 'live-rendered-weapon-center-and-rigged-joint-world-transforms'
    || !finiteVector(camera.sourceWeaponCenterWorld)
    || !Array.isArray(camera.sourceSentinels)
    || camera.sourceSentinels.length !== expected.length
    || !finiteVector(camera.outsideDirectionWorld)
    || !finiteVector(camera.targetWorld)
    || !finiteVector(camera.positionWorld)
    || !Number.isFinite(camera.yaw)
    || !Number.isFinite(camera.pitch)) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const source = camera.sourceSentinels[index];
    const wanted = expected[index];
    if (source.kind !== wanted.kind || source.side !== wanted.side || source.role !== wanted.role
      || source.digit !== wanted.digit || source.bone !== wanted.bone || !finiteVector(source.worldPosition)) return false;
  }
  const wristWorld = camera.sourceSentinels[0].worldPosition;
  const outsideDelta = [
    wristWorld[0] - camera.sourceWeaponCenterWorld[0],
    0,
    wristWorld[2] - camera.sourceWeaponCenterWorld[2],
  ];
  const outsideLength = Math.hypot(outsideDelta[0], outsideDelta[2]);
  if (!(outsideLength > 0.01)) return false;
  const expectedOutside = outsideDelta.map((value) => value / outsideLength);
  const expectedTarget = [0, 1, 2].map((axis) => (
    camera.sourceSentinels.reduce((sum, joint) => sum + joint.worldPosition[axis], 0) / expected.length
  ));
  const expectedPosition = expectedTarget.map((value, axis) => value
    + expectedOutside[axis] * handCameraContract.outsideOffsetM
    + (axis === 1 ? handCameraContract.upwardOffsetM : 0));
  const aim = vectorSubtract(expectedTarget, expectedPosition);
  const expectedYaw = Math.atan2(-aim[0], -aim[2]);
  const expectedPitch = Math.atan2(aim[1], Math.hypot(aim[0], aim[2]));
  return camera.outsideDirectionWorld.every((value, index) => close(value, expectedOutside[index], 1e-9))
    && camera.targetWorld.every((value, index) => close(value, expectedTarget[index], 1e-9))
    && camera.positionWorld.every((value, index) => close(value, expectedPosition[index], 1e-9))
    && close(camera.yaw, expectedYaw, 1e-9)
    && close(camera.pitch, expectedPitch, 1e-9);
}

function handFramingValid(framing, actor, side) {
  const expected = expectedHandCaptureJoints(side);
  const detail = framing?.handDetail;
  if (framing?.missing !== false
    || !sameObject(framing.actor, actor)
    || framing.side !== side
    || framing.rootVisible !== true
    || framing.rootEffectivelyVisible !== true
    || !(framing.effectivelyVisibleMeshCount > 0)
    || !Array.isArray(framing.effectivelyVisibleSkinnedMeshes)
    || framing.effectivelyVisibleSkinnedMeshes.length < 1
    || framing.handSkinVisible !== true
    || !sameObject(framing.roiNdc, handRoiNdc)
    || !handCameraValid(framing.camera, actor, side)
    || !Number.isFinite(framing.canvas?.left)
    || !Number.isFinite(framing.canvas?.top)
    || !(framing.canvas?.width > 0)
    || !(framing.canvas?.height > 0)
    || !(framing.viewport?.width > 0)
    || !(framing.viewport?.height > 0)
    || detail?.required !== true
    || detail.side !== side
    || detail.expectedSentinelCount !== expected.length
    || detail.orderValid !== true
    || detail.allInsideRoi !== true
    || !sameObject(detail.thresholds, handDetailThresholds)
    || !Array.isArray(detail.sentinels)
    || detail.sentinels.length !== expected.length
    || !Array.isArray(detail.fingerSpans)
    || detail.fingerSpans.length !== 5) return false;
  const pixelFor = (ndc) => ({
    x: framing.canvas.left + (ndc[0] + 1) * 0.5 * framing.canvas.width,
    y: framing.canvas.top + (1 - ndc[1]) * 0.5 * framing.canvas.height,
  });
  const pixelDistance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
  for (let index = 0; index < expected.length; index += 1) {
    const sentinel = detail.sentinels[index];
    const wanted = expected[index];
    if (sentinel.kind !== wanted.kind || sentinel.side !== wanted.side
      || sentinel.role !== wanted.role || sentinel.digit !== wanted.digit || sentinel.bone !== wanted.bone
      || !finiteVector(sentinel.ndc) || !finiteVector(sentinel.worldPosition)
      || sentinel.withinRoi !== true || sentinel.onScreen !== true) return false;
    const [x, y, z] = sentinel.ndc;
    const pixel = pixelFor(sentinel.ndc);
    const source = framing.camera.sourceSentinels[index];
    if (x < handRoiNdc.minX || x > handRoiNdc.maxX || y < handRoiNdc.minY || y > handRoiNdc.maxY || z < -1 || z > 1
      || !close(sentinel.pixel?.x, pixel.x, 1e-6) || !close(sentinel.pixel?.y, pixel.y, 1e-6)
      || pixel.x < Math.max(0, framing.canvas.left)
      || pixel.x > Math.min(framing.viewport.width, framing.canvas.left + framing.canvas.width)
      || pixel.y < Math.max(0, framing.canvas.top)
      || pixel.y > Math.min(framing.viewport.height, framing.canvas.top + framing.canvas.height)
      || positionDelta(sentinel.worldPosition, source.worldPosition) > handCameraContract.maximumSourceJointDriftM) return false;
  }
  const wrist = detail.sentinels[0];
  const fingers = detail.sentinels.slice(1);
  const spans = fingers.map((finger) => pixelDistance(wrist.pixel, finger.pixel));
  for (let index = 0; index < fingers.length; index += 1) {
    const reported = detail.fingerSpans[index];
    if (reported.digit !== fingers[index].digit || reported.bone !== fingers[index].bone
      || !close(reported.pixels, spans[index], 1e-6)
      || spans[index] < handDetailThresholds.minimumWristFingerPixels) return false;
  }
  return close(detail.minimumPixels, Math.min(...spans), 1e-6)
    && detail.minimumPixels >= handDetailThresholds.minimumWristFingerPixels;
}

function handScreenshotValid(record, expectedPath, actor, side) {
  const path = resolve(root, expectedPath);
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && handFramingValid(record.framing, actor, side);
}

function overviewScreenshotValid(record, expectedPath) {
  const path = resolve(root, expectedPath);
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && Array.isArray(record.framing)
    && record.framing.length === expectedDummyIds.length
    && record.framing.every((framing, index) => framingValid(
      framing,
      { kind: 'training-dummy', id: expectedDummyIds[index] },
      overviewRoiNdc,
    ));
}

function runtimeValid(runtime) {
  return runtime?.requestedBackend === target.renderer
    && runtime.actualBackend === target.renderer
    && runtime.initialized === true
    && runtime.failClosed === false
    && runtime.softwareAdapter === false
    && runtime.deviceLost === false
    && runtime.uncapturedErrors === 0
    && typeof runtime.adapterLabel === 'string'
    && runtime.adapterLabel.trim().length > 0
    && !/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu.test(runtime.adapterLabel)
    && (target.renderer === 'webgpu'
      ? runtime.adapterClass === 'GPUAdapter'
        && runtime.deviceClass === 'GPUDevice'
        && runtime.presentation?.status === 'healthy'
      : runtime.adapterClass === 'WebGL2RenderingContext'
        && runtime.presentation?.status === 'synchronous');
}

function servedCandidateValid(candidate, sourceSha) {
  return candidate?.schemaVersion === 4
    && candidate.channel === 'the-big-one'
    && candidate.releasePass === 'PASS 69'
    && candidate.path === 'channels/the-big-one'
    && candidate.sourceSha === sourceSha
    && /^[a-f0-9]{64}$/u.test(candidate.treeSha256 ?? '')
    && Number.isSafeInteger(candidate.exactRootFileCount)
    && candidate.exactRootFileCount >= 2;
}

function surfaceValid(surface, expectedMap, sourceSha) {
  return surface?.map === expectedMap
    && surface.runtimeErrorVisible === false
    && runtimeValid(surface.runtime)
    && surface.contextLifecycle?.lost === false
    && surface.contextLifecycle.losses === 0
    && surface.contextLifecycle.restorations === 0
    && servedCandidateValid(surface.servedCandidate, sourceSha)
    && (target.renderer === 'webgpu'
      ? surface.webgl === null
      : surface.webgl?.adapterClass === 'WebGL2RenderingContext'
        && surface.webgl.unmaskedRenderer === surface.runtime.adapterLabel);
}

function vectorSubtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function vectorLength(vector) {
  return Math.hypot(...vector);
}

function close(left, right, tolerance = 1e-7) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function renderedInfluenceValid(bone) {
  const influence = bone?.vertexInfluence;
  return influence?.contract === 'rendered-joints0-weights0-influence-v1'
    && sameObject(influence.thresholds, renderedInfluenceThresholds)
    && influence.passes === true
    && Number.isInteger(influence.influencedVertexCount)
    && influence.influencedVertexCount >= renderedInfluenceThresholds.minimumInfluencedVertices
    && Number.isFinite(influence.maximumNormalizedWeight)
    && influence.maximumNormalizedWeight >= renderedInfluenceThresholds.minimumMaximumNormalizedWeight
    && Array.isArray(influence.meshes)
    && influence.meshes.length > 0;
}

function elbowFlexValid(value) {
  return Number.isFinite(value) && value >= antiTThresholds.minimumElbowFlexRadians;
}

function bindDeltaValid(value, minimumRadians) {
  return Number.isFinite(value) && value >= minimumRadians;
}

function chainGeometryValid(model, chain, side) {
  const expectedChain = expectedBones.filter((bone) => bone.side === side);
  const shoulder = model.armPose.bones.find((bone) => bone.side === side && bone.role === 'shoulder');
  const elbow = model.armPose.bones.find((bone) => bone.side === side && bone.role === 'elbow');
  const wrist = model.armPose.bones.find((bone) => bone.side === side && bone.role === 'wrist-hand');
  if (!shoulder || !elbow || !wrist
    || chain?.complete !== true
    || chain.directHierarchy !== true
    || !sameArray(chain.hierarchyPath, expectedChain.map((bone) => bone.bone))
    || !Array.isArray(chain.shoulderOutwardAxis)
    || chain.shoulderOutwardAxis.length !== 3
    || !chain.shoulderOutwardAxis.every(Number.isFinite)
    || !close(vectorLength(chain.shoulderOutwardAxis), 1, 1e-6)
    || Math.abs(chain.shoulderOutwardAxis[1]) > 1e-6) return false;
  const shoulderToElbow = vectorSubtract(elbow.worldPosition, shoulder.worldPosition);
  const elbowToWrist = vectorSubtract(wrist.worldPosition, elbow.worldPosition);
  const shoulderToWrist = vectorSubtract(wrist.worldPosition, shoulder.worldPosition);
  const elbowToShoulder = shoulderToElbow.map((value) => -value);
  const upperArmLength = vectorLength(shoulderToElbow);
  const forearmLength = vectorLength(elbowToWrist);
  const armLength = upperArmLength + forearmLength;
  const elbowBendRadians = Math.acos(Math.min(1, Math.max(-1,
    dot(elbowToShoulder, elbowToWrist) / Math.max(upperArmLength * forearmLength, 1e-9))));
  const elbowFlexRadians = Math.PI - elbowBendRadians;
  const verticalDrop = shoulder.worldPosition[1] - wrist.worldPosition[1];
  const horizontalReach = Math.hypot(shoulderToWrist[0], shoulderToWrist[2]);
  const outwardReach = dot(shoulderToWrist, chain.shoulderOutwardAxis);
  const observed = {
    upperArmLength,
    forearmLength,
    armLength,
    elbowBendRadians,
    elbowFlexRadians,
    shoulderToWristVerticalDrop: verticalDrop,
    shoulderToWristVerticalDropRatio: verticalDrop / armLength,
    shoulderToWristHorizontalReach: horizontalReach,
    shoulderToWristHorizontalReachRatio: horizontalReach / armLength,
    shoulderToWristOutwardReach: outwardReach,
    shoulderToWristOutwardReachRatio: Math.abs(outwardReach) / armLength,
  };
  return Object.entries(observed).every(([key, value]) => close(chain[key], value))
    && upperArmLength > 0.1
    && forearmLength > 0.1
    && elbowFlexValid(elbowFlexRadians)
    && observed.shoulderToWristVerticalDrop >= antiTThresholds.minimumVerticalDropM
    && observed.shoulderToWristVerticalDropRatio >= antiTThresholds.minimumVerticalDropRatio
    && observed.shoulderToWristHorizontalReachRatio <= antiTThresholds.maximumHorizontalReachRatio
    && observed.shoulderToWristOutwardReachRatio <= antiTThresholds.maximumOutwardReachRatio
    && chain.antiTPoseGeometry === true;
}

function gripValid(grip, socketName) {
  const expectedReference = carbineSocketReferences[socketName];
  return grip?.finite === true
    && grip.socketName === socketName
    && grip.torsoClear === true
    && grip.torsoRelativeBendHint === true
    && Number.isFinite(grip.supportError)
    && grip.supportError <= gripThresholds.maximumPositionErrorM
    && Number.isFinite(grip.elbowTorsoOutward)
    && Number.isFinite(grip.minimumOutwardClearance)
    && grip.minimumOutwardClearance > 0
    && grip.elbowTorsoOutward >= grip.minimumOutwardClearance
    && grip.socketReference?.available === true
    && grip.socketReference.valid === true
    && grip.socketReference.weaponId === 'carbine'
    && grip.socketReference.sourceAsset === './assets/original/models/weapons/pass65-firearms/carbine/carbine-world-lod0.glb'
    && grip.socketReference.atomicSocket === expectedReference.atomicSocket
    && grip.socketReference.sourceTransformValid === true
    && positionDelta(grip.socketReference.authoredSourceLocalPosition, expectedReference.authoredLocalPosition) <= 1e-9
    && positionDelta(grip.socketReference.observedImportedSourceLocalPosition, expectedReference.authoredLocalPosition) <= 1e-6
    && quaternionDelta(grip.socketReference.authoredSourceLocalQuaternion, [0, 0, 0, 1]) <= 1e-9
    && quaternionDelta(grip.socketReference.observedImportedSourceLocalQuaternion, [0, 0, 0, 1]) <= 1e-6
    && Number.isFinite(grip.socketReference.sourcePositionErrorM)
    && grip.socketReference.sourcePositionErrorM <= 1e-6
    && Number.isFinite(grip.socketReference.sourceQuaternionErrorRadians)
    && grip.socketReference.sourceQuaternionErrorRadians <= 1e-6
    && grip.socketReference.liveTargetContract === expectedReference.liveTargetContract
    && grip.socketReference.calibrationApplied === expectedReference.calibrationApplied
    && grip.socketReference.calibrationReason === expectedReference.calibrationReason
    && positionDelta(grip.socketReference.evaluatedTargetLocalPosition, expectedReference.evaluatedTargetLocalPosition) <= 1e-9
    && positionDelta(grip.socketReference.observedLiveTargetLocalPosition, expectedReference.evaluatedTargetLocalPosition) <= 1e-6
    && quaternionDelta(grip.socketReference.evaluatedTargetLocalQuaternion, [0, 0, 0, 1]) <= 1e-9
    && quaternionDelta(grip.socketReference.observedLiveTargetLocalQuaternion, [0, 0, 0, 1]) <= 1e-6
    && Number.isFinite(grip.socketReference.liveTargetPositionErrorM)
    && grip.socketReference.liveTargetPositionErrorM <= 1e-6
    && Number.isFinite(grip.socketReference.liveTargetQuaternionErrorRadians)
    && grip.socketReference.liveTargetQuaternionErrorRadians <= 1e-6
    && grip.wristOrientation?.referenceAvailable === true
    && grip.wristOrientation.wristBasisContract === 'authored-wrist-bind-to-operator-root-v1'
    && grip.wristOrientation.wristSourceAsset === './assets/original/models/operators/pass65-third-person-operator-lod0.glb'
    && Array.isArray(grip.wristOrientation.weaponHandEuler)
    && grip.wristOrientation.weaponHandEuler.length === 3
    && grip.wristOrientation.weaponHandEuler.every(Number.isFinite)
    && Number.isFinite(grip.wristOrientation.errorRadians)
    && grip.wristOrientation.errorRadians <= gripThresholds.maximumQuaternionErrorRadians;
}

function handBindFloorValid(floor, curlBone, actualBone, expected) {
  const productFloor = carbineSecondPhalanxProductFloors[expected.digit];
  if (!(productFloor > expected.minimumBindRadians)
    || floor?.contract !== 'post-mixer-authored-bind-relative-hand-floor-v1'
    || floor.allocationContract !== 'persistent-per-rendered-hand-bone-v1'
    || !Number.isInteger(floor.generation)
    || floor.generation < 1
    || floor.reference !== 'immutable-authored-handBindPose-before-animation'
    || floor.side !== expected.side
    || floor.digit !== expected.digit
    || floor.sourceBone !== expected.sourceBone
    || floor.bone !== expected.bone
    || floor.minimumBindDeltaRadians !== productFloor
    || !finiteVector(floor.bindLocalQuaternion, 4)
    || !finiteVector(floor.beforeLocalQuaternion, 4)
    || !finiteVector(floor.afterLocalQuaternion, 4)
    || !finiteVector(floor.appliedAxis)
    || !close(vectorLength(floor.bindLocalQuaternion), 1, 1e-7)
    || !close(vectorLength(floor.beforeLocalQuaternion), 1, 1e-5)
    || !close(vectorLength(floor.afterLocalQuaternion), 1, 1e-5)
    || !close(vectorLength(floor.appliedAxis), 1, 1e-7)
    || typeof floor.alignedObservedAxisHemisphere !== 'boolean'
    || floor.appliedToRenderedBone !== true
    || floor.allFinite !== true
    || !Number.isFinite(floor.beforeBindDeltaRadians)
    || !Number.isFinite(floor.afterBindDeltaRadians)
    || !Number.isFinite(floor.reportedBindDeltaCorrectionRadians)
    || !Number.isFinite(floor.renderedOrientationCorrectionRadians)) return false;

  const bindNorm = vectorLength(floor.bindLocalQuaternion);
  const expectedAppliedRelativeAngle = 2 * Math.acos(Math.min(1, Math.max(-1,
    Math.cos(productFloor / 2) / bindNorm,
  )));
  const beforeDelta = quaternionDelta(floor.beforeLocalQuaternion, floor.bindLocalQuaternion);
  const afterDelta = quaternionDelta(floor.afterLocalQuaternion, floor.bindLocalQuaternion);
  const renderedCorrection = normalizedQuaternionDelta(floor.beforeLocalQuaternion, floor.afterLocalQuaternion);
  const bindRelativePose = canonicalBindRelativePose(
    floor.bindLocalQuaternion, floor.beforeLocalQuaternion,
  );
  if (!bindRelativePose) return false;
  const observedAxisValid = bindRelativePose.axis !== null
    && floor.observedShortestRelativeAxis !== null
    && finiteVector(floor.observedShortestRelativeAxis)
    && close(vectorLength(floor.observedShortestRelativeAxis), 1, 1e-7)
    && floor.observedShortestRelativeAxis.reduce(
      (sum, value, index) => sum + value * bindRelativePose.axis[index], 0,
    ) >= 1 - 1e-7;
  if ((bindRelativePose.axis === null) !== (floor.observedShortestRelativeAxis === null)) return false;
  let axisProvenanceValid = false;
  if (observedAxisValid) {
    const observedAppliedDot = floor.observedShortestRelativeAxis.reduce(
      (sum, value, index) => sum + value * floor.appliedAxis[index], 0,
    );
    const alignedSourceReference = {
      'shortest-bind-relative-aligned-to-previous': 'previous-shortest-bind-relative',
    }[floor.axisSource];
    axisProvenanceValid = close(Math.abs(observedAppliedDot), 1, 1e-7)
      && floor.usedPreviousAxis === false
      && floor.usedFallbackAxis === false
      && floor.preservedShortestRelativeAxis === true
      && (floor.alignedObservedAxisHemisphere
        ? floor.intervened === true
          && observedAppliedDot < 0
          && alignedSourceReference !== undefined
          && floor.continuityReference === alignedSourceReference
        : observedAppliedDot > 0
          && floor.axisSource === 'shortest-bind-relative'
          && (floor.intervened
            ? [null, 'previous-shortest-bind-relative'].includes(floor.continuityReference)
            : floor.continuityReference === null));
  } else if (floor.observedShortestRelativeAxis === null
    && floor.alignedObservedAxisHemisphere === false) {
    if (floor.usedPreviousAxis === true) {
      axisProvenanceValid = floor.axisSource === 'previous-shortest-bind-relative'
        && floor.usedFallbackAxis === false
        && floor.continuityReference === (floor.intervened ? 'previous-shortest-bind-relative' : null);
    } else if (floor.usedFallbackAxis === true) {
      axisProvenanceValid = floor.axisSource === 'authored-curl-fallback'
        && floor.usedPreviousAxis === false
        && floor.continuityReference === (floor.intervened ? 'authored-curl-fallback' : null)
        && floor.appliedAxis.reduce(
          (sum, value, index) => sum + value * carbineSecondPhalanxFallbackAxis[index], 0,
        ) >= 1 - 1e-7;
    }
    axisProvenanceValid = axisProvenanceValid
      && floor.preservedShortestRelativeAxis === (floor.intervened ? null : true);
  }

  const expectedAfter = floor.intervened
    ? normalizeQuaternion(multiplyQuaternions(
      bindRelativePose.normalizedBind,
      axisAngleQuaternion(floor.appliedAxis, floor.floorTargetRelativeAngleRadians),
    ))
    : bindRelativePose.normalizedLocal;
  if (!expectedAfter) return false;
  const expectedRenderedCorrectionRadians = floor.intervened
    ? floor.alignedObservedAxisHemisphere
      ? floor.floorTargetRelativeAngleRadians + bindRelativePose.angleRadians
      : Math.abs(floor.floorTargetRelativeAngleRadians - bindRelativePose.angleRadians)
    : 0;
  const independentlyConstructedAfterValid = normalizedQuaternionDelta(
    expectedAfter, floor.afterLocalQuaternion,
  ) <= 1e-9
    && normalizedQuaternionDelta(expectedAfter, actualBone?.localQuaternion) <= 1e-9;

  const scalarTelemetryValid = close(floor.bindQuaternionNorm, bindNorm, 1e-12)
    && close(floor.floorTargetRelativeAngleRadians, expectedAppliedRelativeAngle, 1e-12)
    && close(floor.bindNormCompensationRadians,
      floor.floorTargetRelativeAngleRadians - productFloor, 1e-12)
    && close(floor.beforeBindDeltaRadians, beforeDelta, 1e-9)
    && close(floor.afterBindDeltaRadians, afterDelta, 1e-9)
    && close(floor.reportedBindDeltaCorrectionRadians, floor.intervened
      ? Math.max(0, productFloor - floor.beforeBindDeltaRadians) : 0, 1e-9)
    && close(floor.renderedOrientationCorrectionRadians, renderedCorrection, 1e-9)
    && close(floor.renderedOrientationCorrectionRadians, expectedRenderedCorrectionRadians, 1e-9)
    && floor.afterBindDeltaRadians >= productFloor - 1e-9;
  const interventionValid = floor.intervened === true
      ? floor.beforeBindDeltaRadians < productFloor - 1e-9
        && close(floor.afterBindDeltaRadians, productFloor, 1e-9)
      : floor.beforeBindDeltaRadians >= productFloor - 1e-9
        && normalizedQuaternionDelta(floor.beforeLocalQuaternion, floor.afterLocalQuaternion) <= 1e-9;
  const curlBoneValid = curlBone?.side === expected.side
    && curlBone.digit === expected.digit
    && curlBone.bone === expected.bone
    && curlBone.applied === true
    && Number.isFinite(curlBone.curlRadians)
    && Math.abs(curlBone.curlRadians) >= 0.18
    && sameObject(curlBone.bindRelativeFloor, floor);
  const actualBoneValid = actualBone?.side === expected.side
    && actualBone.digit === expected.digit
    && actualBone.joint === expected.joint
    && actualBone.sourceBone === expected.sourceBone
    && actualBone.bone === expected.bone
    && close(actualBone.bindQuaternionDeltaRadians, floor.afterBindDeltaRadians, 1e-9)
    && normalizedQuaternionDelta(actualBone.localQuaternion, floor.afterLocalQuaternion) <= 1e-9
    && normalizedQuaternionDelta(actualBone.bindLocalQuaternion, floor.bindLocalQuaternion) <= 1e-9;
  return axisProvenanceValid && independentlyConstructedAfterValid
    && scalarTelemetryValid && interventionValid && curlBoneValid && actualBoneValid;
}

function fingerCurlValid(grip, model) {
  const curl = grip?.fingerCurl;
  if (curl?.contract !== 'pass65-evaluated-per-digit-grip-curl-v3'
    || curl.sourceReferenceAvailable !== true
    || curl.expectedBoneCount !== expectedHandBones.length
    || curl.bothHands !== true
    || curl.allAtOrAboveRequiredBindFloor !== true
    || curl.allApplied !== true
    || !Array.isArray(curl.bones)
    || curl.bones.length !== expectedHandBones.length
    || !Array.isArray(curl.bindFloors)
    || curl.bindFloors.length !== expectedHandBones.length
    || !Array.isArray(model?.handPose?.bones)
    || model.handPose.bones.length !== expectedHandBones.length) return false;
  for (let index = 0; index < expectedHandBones.length; index += 1) {
    if (!handBindFloorValid(
      curl.bindFloors[index], curl.bones[index], model.handPose.bones[index], expectedHandBones[index],
    )) return false;
  }
  const rightPinkyIndex = expectedHandBones.findIndex(({ side, digit }) => side === 'right' && digit === 'pinky');
  return rightPinkyIndex >= 0
    && sameObject(curl.rightPinkyBindFloor, curl.bindFloors[rightPinkyIndex]);
}

function armPoseValid(model, armed) {
  if (model?.source !== 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative'
    || model.assetUrl !== './assets/original/models/operators/pass65-third-person-operator-lod0.glb'
    || model.license !== 'CC0-1.0'
    || model.lod !== 0
    || model.materialContract !== 'opaque-embedded-pbr-depth-writing'
    || model.activeClip !== 'Walk'
    || model.animationContract?.base !== 'Walk'
    || !(model.animationContract?.speed > 0.18)
    || model.armBonesPresent !== expectedBones.length
    || !(model.skinnedMeshes > 0)
    || !(model.visibleSkinnedMeshes > 0)
    || !Array.isArray(model.effectivelyVisibleSkinnedMeshes)
    || model.effectivelyVisibleSkinnedMeshes.length < 1
    || model.visibleEmbeddedWeapons !== 0
    || model.armPose?.contract !== 'source-glb-skinned-anti-t-arm-chain-v2'
    || model.armPose.reference !== 'authored-glb-local-transform-before-animation'
    || !sameObject(model.armPose.thresholds, antiTThresholds)
    || model.armPose.expectedBoneCount !== expectedBones.length
    || model.armPose.allPresent !== true
    || model.armPose.allFinite !== true
    || model.armPose.allHierarchyValid !== true
    || model.armPose.allInEffectivelyVisibleSkinnedMesh !== true
    || model.armPose.allHaveRenderedVertexInfluence !== true
    || model.armPose.allAntiTPoseGeometry !== true
    || !Array.isArray(model.armPose.commonEffectiveSkinnedMeshes)
    || model.armPose.commonEffectiveSkinnedMeshes.length < 1
    || !Array.isArray(model.armPose.bones)
    || model.armPose.bones.length !== expectedBones.length
    || !Array.isArray(model.armPose.chains)
    || model.armPose.chains.length !== 2
    || model.handPose?.contract !== 'source-glb-weighted-five-digit-sentinels-v2'
    || model.handPose.reference !== 'shipped-lod0-walk-animated-second-phalanges'
    || model.handPose.expectedBoneCount !== expectedHandBones.length
    || model.handPose.allPresent !== true
    || model.handPose.allDescendantOfWrist !== true
    || model.handPose.allInEffectivelyVisibleSkinnedMesh !== true
    || model.handPose.allHaveRenderedVertexInfluence !== true
    || model.handPose.allFinite !== true
    || !Array.isArray(model.handPose.bones)
    || model.handPose.bones.length !== expectedHandBones.length) return false;
  if (!model.armPose.bones.every((bone, index) => {
    const expected = expectedBones[index];
    return bone.side === expected.side
      && bone.role === expected.role
      && bone.sourceBone === expected.sourceBone
      && bone.bone === expected.bone
      && bone.finite === true
      && bone.inEffectivelyVisibleSkinnedMesh === true
      && renderedInfluenceValid(bone)
      && Array.isArray(bone.effectiveSkinnedMeshes)
      && model.armPose.commonEffectiveSkinnedMeshes.every((name) => bone.effectiveSkinnedMeshes.includes(name))
      && Number.isFinite(bone.bindQuaternionDeltaRadians)
      && bindDeltaValid(bone.bindQuaternionDeltaRadians, expected.minimumBindRadians)
      && Array.isArray(bone.localQuaternion)
      && bone.localQuaternion.length === 4
      && bone.localQuaternion.every(Number.isFinite)
      && Array.isArray(bone.worldPosition)
      && bone.worldPosition.length === 3
      && bone.worldPosition.every(Number.isFinite);
  })) return false;
  if (!model.handPose.bones.every((bone, index) => {
    const expected = expectedHandBones[index];
    const expectedWrist = expected.side === 'left' ? 'WristL' : 'WristR';
    return bone.side === expected.side
      && bone.digit === expected.digit
      && bone.joint === expected.joint
      && bone.sourceBone === expected.sourceBone
      && bone.bone === expected.bone
      && bone.wristBone === expectedWrist
      && bone.descendantOfWrist === true
      && Array.isArray(bone.wristDescendantPath)
      && bone.wristDescendantPath.length === 3
      && bone.wristDescendantPath[0] === expectedWrist
      && bone.wristDescendantPath.at(-1) === expected.bone
      && bone.inEffectivelyVisibleSkinnedMesh === true
      && renderedInfluenceValid(bone)
      && Array.isArray(bone.effectiveSkinnedMeshes)
      && model.armPose.commonEffectiveSkinnedMeshes.every((name) => bone.effectiveSkinnedMeshes.includes(name))
      && bone.finite === true
      && bindDeltaValid(bone.bindQuaternionDeltaRadians, expected.minimumBindRadians);
  })) return false;
  if (!model.armPose.chains.every((chain) => chainGeometryValid(model, chain, chain.side))) return false;
  return armed
    ? model.weaponChildren === 1
      && model.weaponMount?.directChild === true
      && model.weaponMount.finite === true
      && model.weaponMount.forwardCorrection === 'stable-body-mount-minus-z'
      && typeof model.weaponMount.modelId === 'string'
      && model.weaponMount.modelId.length > 0
      && model.supportGrip?.bothHandsConnected === true
      && gripValid(model.supportGrip, 'support-socket-l')
      && gripValid(model.supportGrip.dominantGrip, 'grip-socket-r')
      && fingerCurlValid(model.supportGrip, model)
    : model.weaponChildren === 0
      && model.weaponMount === null
      && model.supportGrip === null
      && model.meleeKnifeVisible === false;
}

function motionValid(first, second, motion, requireWorldMovement) {
  if (!armPoseValid(first?.operatorModel, first?.weapon === 'carbine')
    || !armPoseValid(second?.operatorModel, second?.weapon === 'carbine')) return false;
  const observedPositionDelta = positionDelta(first.position, second.position);
  if (!Number.isFinite(observedPositionDelta)
    || Math.abs(motion?.positionM - observedPositionDelta) > 1e-9
    || requireWorldMovement && observedPositionDelta <= 0.12
    || !Array.isArray(motion?.boneDeltas)
    || motion.boneDeltas.length !== expectedBones.length
    || !Array.isArray(motion?.movingChains)
    || motion.movingChains.length !== 2) return false;
  const deltasValid = motion.boneDeltas.every((record, index) => {
    const expected = expectedBones[index];
    const before = first.operatorModel.armPose.bones[index];
    const after = second.operatorModel.armPose.bones[index];
    const observed = quaternionDelta(before.localQuaternion, after.localQuaternion);
    return record.side === expected.side
      && record.role === expected.role
      && record.bone === expected.bone
      && Number.isFinite(record.radians)
      && Math.abs(record.radians - observed) <= 1e-9;
  });
  return deltasValid && motion.movingChains.every((chain) => chain.maximumRadians > 0.001);
}

function failedPredicateNames(checks) {
  return checks.filter(([, passed]) => passed !== true).map(([name]) => name);
}

function receiptValidationFailures(receipt, sourceSha) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['receipt.object'];
  const checks = [];
  const add = (name, passed) => checks.push([name, passed]);
  const evidenceBase = `artifacts/pass69-3/rigged-bot-live/${target.renderer}`;
  const armedActor = { kind: 'bot', id: receipt.armedBot?.id };
  const expectedCaptureRois = {
    close: closeRoiNdc, hand: handRoiNdc, medium: mediumRoiNdc, overview: overviewRoiNdc,
  };

  add('receipt.schemaVersion', receipt.schemaVersion === 4);
  add('receipt.status', receipt.status === 'AUTOMATION_PASS_OWNER_PENDING');
  add('receipt.contract', receipt.contract === 'atomic-acres/pass69-3-rigged-bot-live@4');
  add('receipt.evidenceScope', receipt.evidenceScope
    === 'weighted-skin-anti-t-five-digit-grip-orientation-full-body-and-fixed-hand-detail-framing');
  add('receipt.target', receipt.target === targetName);
  add('receipt.sourceSha', receipt.sourceSha === sourceSha);
  add('receipt.endingSourceSha', receipt.endingSourceSha === sourceSha);
  add('receipt.cleanSource', receipt.cleanSource === true);
  add('receipt.renderer', receipt.renderer === target.renderer);
  add('receipt.renderProfile', receipt.renderProfile === 'blender');
  add('receipt.viewport', sameArray(receipt.viewport, [1_600, 900]));
  add('receipt.armBindThresholds', sameObject(receipt.armBindThresholds, expectedBones));
  add('receipt.handBindThresholds', sameObject(receipt.handBindThresholds, expectedHandBones));
  add('receipt.renderedInfluenceThresholds', sameObject(
    receipt.renderedInfluenceThresholds, renderedInfluenceThresholds,
  ));
  add('receipt.antiTThresholds', sameObject(receipt.antiTThresholds, antiTThresholds));
  add('receipt.gripThresholds', sameObject(receipt.gripThresholds, gripThresholds));
  add('receipt.closeJointThresholds', sameObject(receipt.closeJointThresholds, closeJointThresholds));
  add('receipt.handDetailThresholds', sameObject(receipt.handDetailThresholds, handDetailThresholds));
  add('receipt.handCameraContract', sameObject(receipt.handCameraContract, handCameraContract));
  add('receipt.captureRoisNdc', sameObject(receipt.captureRoisNdc, expectedCaptureRois));
  add('receipt.visualReview.required', receipt.visualReview?.required === true);
  add('receipt.visualReview.status', receipt.visualReview?.status === 'PENDING_OWNER_INSPECTION');
  add('receipt.visualReview.automatedFramingIsNotVisualAcceptance',
    receipt.visualReview?.automatedFramingIsNotVisualAcceptance === true);
  add('receipt.visualReview.inspectionScope', receipt.visualReview?.inspectionScope
    === 'armed medium/full close/left hand/right hand plus four dummy closeups and shared overview');
  add('receipt.browser.project', receipt.browser?.project === 'chromium');
  add('receipt.browser.channel', receipt.browser?.channel === 'msedge');
  add('receipt.browser.userAgent.edge', /Edg\//u.test(receipt.browser?.userAgent ?? ''));
  add('receipt.surfaces.armedBot', surfaceValid(receipt.surfaces?.armedBot, 'atomic-acres', sourceSha));
  add('receipt.surfaces.gunRange', surfaceValid(receipt.surfaces?.gunRange, 'gun-range', sourceSha));
  add('receipt.surfaces.servedCandidate.equal', JSON.stringify(receipt.surfaces?.armedBot?.servedCandidate)
    === JSON.stringify(receipt.surfaces?.gunRange?.servedCandidate));

  add('receipt.armedBot.weapon', receipt.armedBot?.weapon === 'carbine');
  add('receipt.armedBot.alive', receipt.armedBot?.alive === true);
  add('receipt.armedBot.first.operatorModel', armPoseValid(receipt.armedBot?.first?.operatorModel, true));
  add('receipt.armedBot.second.operatorModel', armPoseValid(receipt.armedBot?.second?.operatorModel, true));
  add('receipt.armedBot.first.operatorModel.supportGrip.fingerCurl', fingerCurlValid(
    receipt.armedBot?.first?.operatorModel?.supportGrip,
    receipt.armedBot?.first?.operatorModel,
  ));
  add('receipt.armedBot.second.operatorModel.supportGrip.fingerCurl', fingerCurlValid(
    receipt.armedBot?.second?.operatorModel?.supportGrip,
    receipt.armedBot?.second?.operatorModel,
  ));
  add('receipt.armedBot.motion', motionValid(
    receipt.armedBot?.first, receipt.armedBot?.second, receipt.armedBot?.motion, false,
  ));
  add('receipt.armedBot.screenshots.medium', screenshotValid(
    receipt.armedBot?.screenshots?.medium,
    `${evidenceBase}/armed-live-bot-medium.png`, armedActor, mediumRoiNdc,
  ));
  add('receipt.armedBot.screenshots.close', screenshotValid(
    receipt.armedBot?.screenshots?.close,
    `${evidenceBase}/armed-live-bot-close.png`, armedActor, closeRoiNdc, true,
  ));
  add('receipt.armedBot.screenshots.leftHand', handScreenshotValid(
    receipt.armedBot?.screenshots?.leftHand,
    `${evidenceBase}/armed-live-bot-left-hand-close.png`, armedActor, 'left',
  ));
  add('receipt.armedBot.screenshots.rightHand', handScreenshotValid(
    receipt.armedBot?.screenshots?.rightHand,
    `${evidenceBase}/armed-live-bot-right-hand-close.png`, armedActor, 'right',
  ));

  add('receipt.gunRangeDummies.expectedIds', sameArray(
    receipt.gunRangeDummies?.expectedIds, expectedDummyIds,
  ));
  add('receipt.gunRangeDummies.overviewScreenshot', overviewScreenshotValid(
    receipt.gunRangeDummies?.overviewScreenshot, `${evidenceBase}/gun-range-dummies-medium.png`,
  ));
  add('receipt.gunRangeDummies.entries.array', Array.isArray(receipt.gunRangeDummies?.entries));
  add('receipt.gunRangeDummies.entries.count', receipt.gunRangeDummies?.entries?.length === expectedDummyIds.length);
  for (let index = 0; index < expectedDummyIds.length; index += 1) {
    const id = expectedDummyIds[index];
    const entry = receipt.gunRangeDummies?.entries?.[index];
    const prefix = `receipt.gunRangeDummies.entries.${id}`;
    add(`${prefix}.identity`, entry?.id === id && entry?.definition?.id === id);
    add(`${prefix}.definition.unarmed`, entry?.definition?.armed === false);
    add(`${prefix}.first.unarmed`, entry?.first?.armed === false);
    add(`${prefix}.second.unarmed`, entry?.second?.armed === false);
    add(`${prefix}.first.operatorModel`, armPoseValid(entry?.first?.operatorModel, false));
    add(`${prefix}.second.operatorModel`, armPoseValid(entry?.second?.operatorModel, false));
    add(`${prefix}.motion`, motionValid(entry?.first, entry?.second, entry?.motion, true));
    add(`${prefix}.first.animationSpeed`, entry?.first?.operatorModel?.animationContract?.speed
      === entry?.definition?.speedMps);
    add(`${prefix}.second.animationSpeed`, entry?.second?.operatorModel?.animationContract?.speed
      === entry?.definition?.speedMps);
    add(`${prefix}.closeScreenshot`, screenshotValid(
      entry?.closeScreenshot,
      `${evidenceBase}/${id}-close.png`, { kind: 'training-dummy', id }, closeRoiNdc, true,
    ));
  }
  add('receipt.browserErrors.array', Array.isArray(receipt.browserErrors));
  add('receipt.browserErrors.empty', Array.isArray(receipt.browserErrors) && receipt.browserErrors.length === 0);
  return failedPredicateNames(checks);
}

function runContractSelfTest() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`Pass 69.3 rigged-bot contract self-test failed: ${message}`);
  };
  assert(sameArray(
    failedPredicateNames([
      ['receipt.status', true],
      ['receipt.armedBot.first.operatorModel.supportGrip.fingerCurl', false],
      ['receipt.browserErrors.empty', true],
    ]),
    ['receipt.armedBot.first.operatorModel.supportGrip.fingerCurl'],
  ), 'named predicate diagnostics expose only failed non-sensitive field paths');
  assert(sameArray(receiptValidationFailures(null, '0'.repeat(40)), ['receipt.object']),
    'non-object receipt reports one stable non-sensitive predicate');
  const nonUnitQuaternion = [0.1, -0.2, 0.3, 0.9];
  assert(normalizedQuaternionDelta(nonUnitQuaternion, nonUnitQuaternion) === 0,
    'identical non-unit quaternion arrays must have an exact zero orientation delta');
  assert(normalizedQuaternionDelta(nonUnitQuaternion, nonUnitQuaternion.map((value) => -value)) === 0,
    'opposite-hemisphere quaternion arrays must have an exact zero orientation delta');
  const weightedBone = {
    vertexInfluence: {
      contract: 'rendered-joints0-weights0-influence-v1',
      thresholds: renderedInfluenceThresholds,
      passes: true,
      influencedVertexCount: 4,
      maximumNormalizedWeight: 0.2,
      meshes: [{ mesh: 'Swat_Body', influencedVertexCount: 4, maximumNormalizedWeight: 0.2 }],
    },
  };
  assert(renderedInfluenceValid(weightedBone), 'four vertices at 0.20 must pass');
  const tooFewWeightedVertices = structuredClone(weightedBone);
  tooFewWeightedVertices.vertexInfluence.influencedVertexCount = 3;
  assert(!renderedInfluenceValid(tooFewWeightedVertices), 'three weighted vertices must fail');
  const weakMaximumWeight = structuredClone(weightedBone);
  weakMaximumWeight.vertexInfluence.maximumNormalizedWeight = 0.199;
  assert(!renderedInfluenceValid(weakMaximumWeight), '0.199 maximum normalized weight must fail');
  const zeroWeight = structuredClone(weightedBone);
  zeroWeight.vertexInfluence.passes = false;
  zeroWeight.vertexInfluence.influencedVertexCount = 0;
  zeroWeight.vertexInfluence.maximumNormalizedWeight = 0;
  zeroWeight.vertexInfluence.meshes = [];
  assert(!renderedInfluenceValid(zeroWeight), 'zero-weight skeleton membership must fail');
  assert(!elbowFlexValid(0.299), '0.299 rad elbow flex must fail');
  assert(elbowFlexValid(0.3), '0.300 rad elbow flex must pass');
  assert(!bindDeltaValid(0.349, 0.35), '0.349 rad pinky bind delta must fail');
  assert(bindDeltaValid(0.35, 0.35), '0.350 rad pinky bind delta must pass');

  const grip = {
    finite: true,
    socketName: 'support-socket-l',
    torsoClear: true,
    torsoRelativeBendHint: true,
    supportError: 0.015,
    elbowTorsoOutward: 0.12,
    minimumOutwardClearance: 0.08,
    socketReference: {
      available: true,
      valid: true,
      weaponId: 'carbine',
      sourceAsset: './assets/original/models/weapons/pass65-firearms/carbine/carbine-world-lod0.glb',
      atomicSocket: 'leftGrip',
      sourceTransformValid: true,
      authoredSourceLocalPosition: [...carbineSocketReferences['support-socket-l'].authoredLocalPosition],
      authoredSourceLocalQuaternion: [0, 0, 0, 1],
      observedImportedSourceLocalPosition: [...carbineSocketReferences['support-socket-l'].authoredLocalPosition],
      observedImportedSourceLocalQuaternion: [0, 0, 0, 1],
      sourcePositionErrorM: 0,
      sourceQuaternionErrorRadians: 0,
      liveTargetContract: carbineSocketReferences['support-socket-l'].liveTargetContract,
      calibrationApplied: true,
      calibrationReason: carbineSocketReferences['support-socket-l'].calibrationReason,
      evaluatedTargetLocalPosition: [...carbineSocketReferences['support-socket-l'].evaluatedTargetLocalPosition],
      observedLiveTargetLocalPosition: [...carbineSocketReferences['support-socket-l'].evaluatedTargetLocalPosition],
      evaluatedTargetLocalQuaternion: [0, 0, 0, 1],
      observedLiveTargetLocalQuaternion: [0, 0, 0, 1],
      liveTargetPositionErrorM: 0,
      liveTargetQuaternionErrorRadians: 0,
    },
    wristOrientation: {
      referenceAvailable: true,
      wristBasisContract: 'authored-wrist-bind-to-operator-root-v1',
      wristSourceAsset: './assets/original/models/operators/pass65-third-person-operator-lod0.glb',
      weaponHandEuler: [-0.32, 0.12, -0.22],
      errorRadians: 0.2,
    },
  };
  assert(gripValid(grip, 'support-socket-l'), 'inclusive grip position/orientation boundaries must pass');
  const distantGrip = structuredClone(grip);
  distantGrip.supportError = 0.015001;
  assert(!gripValid(distantGrip, 'support-socket-l'), 'grip position over 0.015 m must fail');
  const rotatedGrip = structuredClone(grip);
  rotatedGrip.wristOrientation.errorRadians = 0.200001;
  assert(!gripValid(rotatedGrip, 'support-socket-l'), 'corrected wrist rotation over 0.20 rad must fail');
  const staleSocket = structuredClone(grip);
  staleSocket.socketReference.valid = false;
  assert(!gripValid(staleSocket, 'support-socket-l'), 'missing weapon-specific socket reference must fail closed');
  const selfCertifiedSocket = structuredClone(grip);
  selfCertifiedSocket.socketReference.observedImportedSourceLocalPosition = [
    ...carbineSocketReferences['support-socket-l'].evaluatedTargetLocalPosition,
  ];
  assert(!gripValid(selfCertifiedSocket, 'support-socket-l'), 'post-overwrite socket cannot impersonate imported authored source');
  const floorQuaternion = (radians, direction = 1) => [
    direction * Math.sin(radians / 2), 0, 0, Math.cos(radians / 2),
  ];
  const makeFloorReceipt = (expected, minimumBindDeltaRadians) => {
    const beforeBindDeltaRadians = (expected.minimumBindRadians + minimumBindDeltaRadians) / 2;
    const beforeLocalQuaternion = floorQuaternion(beforeBindDeltaRadians);
    const afterLocalQuaternion = floorQuaternion(minimumBindDeltaRadians);
    return {
      contract: 'post-mixer-authored-bind-relative-hand-floor-v1',
      allocationContract: 'persistent-per-rendered-hand-bone-v1',
      generation: 7,
      reference: 'immutable-authored-handBindPose-before-animation',
      side: expected.side,
      digit: expected.digit,
      sourceBone: expected.sourceBone,
      bone: expected.bone,
      minimumBindDeltaRadians,
      bindQuaternionNorm: 1,
      floorTargetRelativeAngleRadians: minimumBindDeltaRadians,
      bindNormCompensationRadians: 0,
      beforeBindDeltaRadians,
      afterBindDeltaRadians: minimumBindDeltaRadians,
      reportedBindDeltaCorrectionRadians: minimumBindDeltaRadians - beforeBindDeltaRadians,
      renderedOrientationCorrectionRadians: normalizedQuaternionDelta(
        beforeLocalQuaternion, afterLocalQuaternion,
      ),
      bindLocalQuaternion: [0, 0, 0, 1],
      beforeLocalQuaternion,
      afterLocalQuaternion,
      observedShortestRelativeAxis: [1, 0, 0],
      appliedAxis: [1, 0, 0],
      axisSource: 'shortest-bind-relative',
      alignedObservedAxisHemisphere: false,
      continuityReference: 'previous-shortest-bind-relative',
      intervened: true,
      preservedShortestRelativeAxis: true,
      usedPreviousAxis: false,
      usedFallbackAxis: false,
      appliedToRenderedBone: true,
      allFinite: true,
    };
  };
  const makeCurlFixture = (minimumOverrides = new Map()) => {
    const bindFloors = expectedHandBones.map((expected, index) => makeFloorReceipt(
      expected,
      minimumOverrides.get(index) ?? carbineSecondPhalanxProductFloors[expected.digit],
    ));
    const bones = expectedHandBones.map(({ side, digit, bone }, index) => ({
      side,
      digit,
      bone,
      applied: true,
      curlRadians: -0.3,
      bindRelativeFloor: bindFloors[index],
    }));
    return {
      curl: {
        fingerCurl: {
          contract: 'pass65-evaluated-per-digit-grip-curl-v3',
          sourceReferenceAvailable: true,
          expectedBoneCount: expectedHandBones.length,
          bothHands: true,
          bindFloors,
          rightPinkyBindFloor: bindFloors.at(-1),
          allAtOrAboveRequiredBindFloor: true,
          allApplied: true,
          bones,
        },
      },
      model: {
        handPose: {
          bones: expectedHandBones.map((expected, index) => ({
            side: expected.side,
            digit: expected.digit,
            joint: expected.joint,
            sourceBone: expected.sourceBone,
            bone: expected.bone,
            bindQuaternionDeltaRadians: bindFloors[index].afterBindDeltaRadians,
            bindLocalQuaternion: bindFloors[index].bindLocalQuaternion,
            localQuaternion: bindFloors[index].afterLocalQuaternion,
          })),
        },
      },
    };
  };
  const { curl, model: curlModel } = makeCurlFixture();
  assert(fingerCurlValid(curl, curlModel), '0.380000 rad post-mixer pinky floor must pass');
  const highPhaseCurl = structuredClone(curl);
  const highPhaseModel = structuredClone(curlModel);
  for (let index = 0; index < expectedHandBones.length; index += 1) {
    const highFloor = highPhaseCurl.fingerCurl.bindFloors[index];
    const highDelta = highFloor.minimumBindDeltaRadians + 0.12;
    const highQuaternion = floorQuaternion(highDelta);
    highFloor.beforeBindDeltaRadians = highDelta;
    highFloor.afterBindDeltaRadians = highDelta;
    highFloor.reportedBindDeltaCorrectionRadians = 0;
    highFloor.renderedOrientationCorrectionRadians = 0;
    highFloor.beforeLocalQuaternion = highQuaternion;
    highFloor.afterLocalQuaternion = [...highQuaternion];
    highFloor.intervened = false;
    highFloor.continuityReference = null;
    highPhaseCurl.fingerCurl.bones[index].bindRelativeFloor = highFloor;
    highPhaseModel.handPose.bones[index].bindQuaternionDeltaRadians = highDelta;
    highPhaseModel.handPose.bones[index].localQuaternion = highFloor.afterLocalQuaternion;
  }
  highPhaseCurl.fingerCurl.rightPinkyBindFloor = highPhaseCurl.fingerCurl.bindFloors.at(-1);
  assert(fingerCurlValid(highPhaseCurl, highPhaseModel), 'all ten above-floor rendered phases remain unchanged');
  const nonUnitLocalCurl = structuredClone(highPhaseCurl);
  const nonUnitLocalModel = structuredClone(highPhaseModel);
  const nonUnitLocalFloor = nonUnitLocalCurl.fingerCurl.bindFloors[0];
  const localScale = 0.9999965226367968;
  nonUnitLocalFloor.beforeLocalQuaternion = nonUnitLocalFloor.beforeLocalQuaternion
    .map((component) => component * localScale);
  nonUnitLocalFloor.afterLocalQuaternion = [...nonUnitLocalFloor.beforeLocalQuaternion];
  nonUnitLocalFloor.beforeBindDeltaRadians = quaternionDelta(
    nonUnitLocalFloor.beforeLocalQuaternion, nonUnitLocalFloor.bindLocalQuaternion,
  );
  nonUnitLocalFloor.afterBindDeltaRadians = nonUnitLocalFloor.beforeBindDeltaRadians;
  nonUnitLocalCurl.fingerCurl.bones[0].bindRelativeFloor = nonUnitLocalFloor;
  nonUnitLocalModel.handPose.bones[0].localQuaternion = nonUnitLocalFloor.afterLocalQuaternion;
  nonUnitLocalModel.handPose.bones[0].bindQuaternionDeltaRadians = nonUnitLocalFloor.afterBindDeltaRadians;
  assert(fingerCurlValid(nonUnitLocalCurl, nonUnitLocalModel),
    'finite non-unit animation quaternion uses normalized orientation validation');
  const excessiveNormDriftCurl = structuredClone(highPhaseCurl);
  const excessiveNormDriftModel = structuredClone(highPhaseModel);
  const excessiveNormDriftFloor = excessiveNormDriftCurl.fingerCurl.bindFloors[0];
  excessiveNormDriftFloor.beforeLocalQuaternion = excessiveNormDriftFloor.beforeLocalQuaternion
    .map((component) => component * 0.99998);
  excessiveNormDriftFloor.afterLocalQuaternion = [...excessiveNormDriftFloor.beforeLocalQuaternion];
  excessiveNormDriftFloor.beforeBindDeltaRadians = quaternionDelta(
    excessiveNormDriftFloor.beforeLocalQuaternion, excessiveNormDriftFloor.bindLocalQuaternion,
  );
  excessiveNormDriftFloor.afterBindDeltaRadians = excessiveNormDriftFloor.beforeBindDeltaRadians;
  excessiveNormDriftCurl.fingerCurl.bones[0].bindRelativeFloor = excessiveNormDriftFloor;
  excessiveNormDriftModel.handPose.bones[0].localQuaternion = excessiveNormDriftFloor.afterLocalQuaternion;
  excessiveNormDriftModel.handPose.bones[0].bindQuaternionDeltaRadians
    = excessiveNormDriftFloor.afterBindDeltaRadians;
  assert(!fingerCurlValid(excessiveNormDriftCurl, excessiveNormDriftModel),
    'local animation quaternion norm drift beyond 1e-5 must fail');
  const alignedContinuityCurl = structuredClone(curl);
  const alignedContinuityModel = structuredClone(curlModel);
  const alignedFloor = alignedContinuityCurl.fingerCurl.bindFloors[0];
  alignedFloor.afterLocalQuaternion = floorQuaternion(alignedFloor.minimumBindDeltaRadians, -1);
  alignedFloor.appliedAxis = [-1, 0, 0];
  alignedFloor.axisSource = 'shortest-bind-relative-aligned-to-previous';
  alignedFloor.alignedObservedAxisHemisphere = true;
  alignedFloor.renderedOrientationCorrectionRadians = normalizedQuaternionDelta(
    alignedFloor.beforeLocalQuaternion, alignedFloor.afterLocalQuaternion,
  );
  alignedContinuityCurl.fingerCurl.bones[0].bindRelativeFloor = alignedFloor;
  alignedContinuityModel.handPose.bones[0].localQuaternion = alignedFloor.afterLocalQuaternion;
  assert(fingerCurlValid(alignedContinuityCurl, alignedContinuityModel),
    'previous-axis hemisphere-aligned receipt must pass');
  const forgedAxisCurl = structuredClone(curl);
  const forgedAxisModel = structuredClone(curlModel);
  const forgedAxisFloor = forgedAxisCurl.fingerCurl.bindFloors[0];
  forgedAxisFloor.observedShortestRelativeAxis = [0, 1, 0];
  forgedAxisFloor.appliedAxis = [0, 1, 0];
  forgedAxisFloor.afterLocalQuaternion = [
    0,
    Math.sin(forgedAxisFloor.minimumBindDeltaRadians / 2),
    0,
    Math.cos(forgedAxisFloor.minimumBindDeltaRadians / 2),
  ];
  forgedAxisFloor.renderedOrientationCorrectionRadians = normalizedQuaternionDelta(
    forgedAxisFloor.beforeLocalQuaternion, forgedAxisFloor.afterLocalQuaternion,
  );
  forgedAxisCurl.fingerCurl.bones[0].bindRelativeFloor = forgedAxisFloor;
  forgedAxisModel.handPose.bones[0].localQuaternion = forgedAxisFloor.afterLocalQuaternion;
  assert(!fingerCurlValid(forgedAxisCurl, forgedAxisModel),
    'forged Y-axis receipt cannot impersonate the canonical X-axis pre-floor pose');
  const fallbackCurl = structuredClone(curl);
  const fallbackModel = structuredClone(curlModel);
  const fallbackFloor = fallbackCurl.fingerCurl.bindFloors[0];
  fallbackFloor.generation = 1;
  fallbackFloor.beforeBindDeltaRadians = 0;
  fallbackFloor.beforeLocalQuaternion = [0, 0, 0, 1];
  fallbackFloor.afterLocalQuaternion = floorQuaternion(fallbackFloor.minimumBindDeltaRadians, -1);
  fallbackFloor.reportedBindDeltaCorrectionRadians = fallbackFloor.minimumBindDeltaRadians;
  fallbackFloor.renderedOrientationCorrectionRadians = fallbackFloor.minimumBindDeltaRadians;
  fallbackFloor.observedShortestRelativeAxis = null;
  fallbackFloor.appliedAxis = [...carbineSecondPhalanxFallbackAxis];
  fallbackFloor.axisSource = 'authored-curl-fallback';
  fallbackFloor.alignedObservedAxisHemisphere = false;
  fallbackFloor.continuityReference = 'authored-curl-fallback';
  fallbackFloor.preservedShortestRelativeAxis = null;
  fallbackFloor.usedPreviousAxis = false;
  fallbackFloor.usedFallbackAxis = true;
  fallbackCurl.fingerCurl.bones[0].bindRelativeFloor = fallbackFloor;
  fallbackModel.handPose.bones[0].localQuaternion = fallbackFloor.afterLocalQuaternion;
  assert(fingerCurlValid(fallbackCurl, fallbackModel), 'exact-bind authored fallback axis must pass');
  const missingCurl = structuredClone(curl);
  missingCurl.fingerCurl.bones[0].applied = false;
  assert(!fingerCurlValid(missingCurl, curlModel), 'missing finger curl must fail');
  const missingReceipt = structuredClone(curl);
  missingReceipt.fingerCurl.bindFloors.pop();
  assert(!fingerCurlValid(missingReceipt, curlModel), 'missing one of ten bind-floor receipts must fail');
  const duplicateReceipt = structuredClone(curl);
  duplicateReceipt.fingerCurl.bindFloors[1] = structuredClone(duplicateReceipt.fingerCurl.bindFloors[0]);
  duplicateReceipt.fingerCurl.bones[1].bindRelativeFloor = duplicateReceipt.fingerCurl.bindFloors[1];
  assert(!fingerCurlValid(duplicateReceipt, curlModel), 'duplicate bind-floor identity must not satisfy another joint');
  const duplicateRenderedBone = structuredClone(curlModel);
  duplicateRenderedBone.handPose.bones[1] = structuredClone(duplicateRenderedBone.handPose.bones[0]);
  assert(!fingerCurlValid(curl, duplicateRenderedBone), 'duplicate rendered handPose bone must fail');
  const invalidGeneration = structuredClone(curl);
  invalidGeneration.fingerCurl.bindFloors[0].generation = 0;
  invalidGeneration.fingerCurl.bones[0].bindRelativeFloor = invalidGeneration.fingerCurl.bindFloors[0];
  assert(!fingerCurlValid(invalidGeneration, curlModel), 'non-persistent receipt generation must fail');
  for (let index = 0; index < expectedHandBones.length; index += 1) {
    const expected = expectedHandBones[index];
    const productFloor = carbineSecondPhalanxProductFloors[expected.digit];
    const evidenceOnlyFloor = (expected.minimumBindRadians + productFloor) / 2;
    const adversary = makeCurlFixture(new Map([[index, evidenceOnlyFloor]]));
    assert(evidenceOnlyFloor > expected.minimumBindRadians && evidenceOnlyFloor < productFloor,
      `${expected.bone} adversary must sit between evidence and product floors`);
    assert(!fingerCurlValid(adversary.curl, adversary.model),
      `${expected.bone} floor above independent evidence but below product floor must fail`);
  }
  const underFloorCurl = structuredClone(curl);
  const underFloorModel = structuredClone(curlModel);
  const underFloorQuaternion = floorQuaternion(0.379999);
  const underFloorReceipt = underFloorCurl.fingerCurl.bindFloors.at(-1);
  underFloorReceipt.afterBindDeltaRadians = 0.379999;
  underFloorReceipt.afterLocalQuaternion = underFloorQuaternion;
  underFloorReceipt.renderedOrientationCorrectionRadians = normalizedQuaternionDelta(
    underFloorReceipt.beforeLocalQuaternion, underFloorQuaternion,
  );
  underFloorCurl.fingerCurl.rightPinkyBindFloor = underFloorReceipt;
  underFloorCurl.fingerCurl.bones.at(-1).bindRelativeFloor = underFloorReceipt;
  underFloorModel.handPose.bones.at(-1).bindQuaternionDeltaRadians = 0.379999;
  underFloorModel.handPose.bones.at(-1).localQuaternion = underFloorQuaternion;
  assert(!fingerCurlValid(underFloorCurl, underFloorModel), '0.379999 rad post-mixer pinky floor must fail');
  const telemetryOnlyCurl = structuredClone(curl);
  const mismatchedRenderedPinky = structuredClone(curlModel);
  mismatchedRenderedPinky.handPose.bones.at(-1).bindQuaternionDeltaRadians = 0.35;
  assert(!fingerCurlValid(telemetryOnlyCurl, mismatchedRenderedPinky), 'floor telemetry must match rendered Pinky2R hand pose');

  const canvas = { left: 0, top: 0, width: 1_600, height: 900 };
  const viewport = { width: 1_600, height: 900 };
  const pixelFor = (ndc) => ({ x: (ndc[0] + 1) * 800, y: (1 - ndc[1]) * 450 });
  const ndcFor = (joint) => {
    const sign = joint.side === 'left' ? -1 : 1;
    if (joint.role === 'shoulder') return [sign * 0.2, 0.32, 0];
    if (joint.role === 'elbow') return [sign * 0.18, 0.12, 0];
    if (joint.role === 'wrist-hand') return [sign * 0.14, -0.08, 0];
    const digitIndex = ['thumb', 'index', 'middle', 'ring', 'pinky'].indexOf(joint.digit);
    return [sign * (0.14 + 0.018 * (digitIndex - 2)), -0.12 - 0.006 * digitIndex, 0];
  };
  const sentinels = expectedCaptureJoints.map((joint) => {
    const ndc = ndcFor(joint);
    return {
      ...joint,
      worldPosition: [ndc[0], 1 + ndc[1], ndc[2]],
      ndc,
      pixel: pixelFor(ndc),
      withinRoi: true,
      onScreen: true,
    };
  });
  const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
  const metrics = () => {
    const armChainPixels = [];
    const wristFingerPixels = [];
    for (const side of ['left', 'right']) {
      const shoulder = sentinels.find((joint) => joint.side === side && joint.role === 'shoulder');
      const elbow = sentinels.find((joint) => joint.side === side && joint.role === 'elbow');
      const wrist = sentinels.find((joint) => joint.side === side && joint.role === 'wrist-hand');
      const fingers = sentinels.filter((joint) => joint.side === side && joint.kind === 'finger');
      armChainPixels.push({ side, pixels: distance(shoulder.pixel, elbow.pixel) + distance(elbow.pixel, wrist.pixel) });
      wristFingerPixels.push({ side, fingerCount: fingers.length, minimumPixels: Math.min(...fingers.map((finger) => distance(wrist.pixel, finger.pixel))) });
    }
    return { armChainPixels, wristFingerPixels };
  };
  const jointMetrics = metrics();
  const framing = {
    missing: false,
    actor: { kind: 'bot', id: 'bot-1' },
    roiNdc: closeRoiNdc,
    withinRoi: true,
    onScreen: true,
    rootVisible: true,
    rootEffectivelyVisible: true,
    effectivelyVisibleMeshCount: 1,
    effectivelyVisibleSkinnedMeshes: ['Swat_Body'],
    armSkinVisible: true,
    handSkinVisible: true,
    screenPosition: [0, 0, 0],
    canvas,
    viewport,
    projectedPixel: { x: 800, y: 450 },
    jointDetail: {
      required: true,
      expectedSentinelCount: expectedCaptureJoints.length,
      sentinels,
      orderValid: true,
      allInsideRoi: true,
      thresholds: closeJointThresholds,
      ...jointMetrics,
    },
  };
  assert(framingValid(framing, framing.actor, closeRoiNdc, true), 'complete close joint framing must pass');
  const cropped = structuredClone(framing);
  cropped.jointDetail.sentinels[0].ndc[0] = closeRoiNdc.minX - 0.01;
  cropped.jointDetail.sentinels[0].pixel = pixelFor(cropped.jointDetail.sentinels[0].ndc);
  cropped.jointDetail.sentinels[0].withinRoi = false;
  cropped.jointDetail.sentinels[0].onScreen = false;
  cropped.jointDetail.allInsideRoi = false;
  assert(!framingValid(cropped, cropped.actor, closeRoiNdc, true), 'cropped/off-ROI shoulder must fail');
  const offscreen = structuredClone(framing);
  offscreen.jointDetail.sentinels[0].ndc[0] = 1.01;
  offscreen.jointDetail.sentinels[0].pixel = pixelFor(offscreen.jointDetail.sentinels[0].ndc);
  offscreen.jointDetail.sentinels[0].withinRoi = false;
  offscreen.jointDetail.sentinels[0].onScreen = false;
  offscreen.jointDetail.allInsideRoi = false;
  assert(!framingValid(offscreen, offscreen.actor, closeRoiNdc, true), 'offscreen shoulder must fail');
  const tinyArm = structuredClone(framing);
  for (const role of ['elbow', 'wrist-hand']) {
    const joint = tinyArm.jointDetail.sentinels.find((candidate) => candidate.side === 'left' && candidate.role === role);
    joint.ndc = role === 'elbow' ? [-0.199, 0.319, 0] : [-0.198, 0.318, 0];
    joint.pixel = pixelFor(joint.ndc);
  }
  tinyArm.jointDetail.armChainPixels[0].pixels = 3;
  assert(!framingValid(tinyArm, tinyArm.actor, closeRoiNdc, true), 'sub-80px arm chain must fail');
  const tinyFinger = structuredClone(framing);
  const leftWrist = tinyFinger.jointDetail.sentinels.find((joint) => joint.side === 'left' && joint.role === 'wrist-hand');
  const leftThumb = tinyFinger.jointDetail.sentinels.find((joint) => joint.side === 'left' && joint.digit === 'thumb');
  leftThumb.ndc = [leftWrist.ndc[0] + 0.001, leftWrist.ndc[1], leftWrist.ndc[2]];
  leftThumb.pixel = pixelFor(leftThumb.ndc);
  tinyFinger.jointDetail.wristFingerPixels[0].minimumPixels = distance(leftWrist.pixel, leftThumb.pixel);
  assert(framingValid(tinyFinger, tinyFinger.actor, closeRoiNdc, true), 'full-body close framing must not impersonate hand-detail magnification');

  const handFramingFixture = (side) => {
    const actor = { kind: 'bot', id: 'bot-1' };
    const handSentinels = sentinels.filter((joint) => joint.side === side
      && (joint.role === 'wrist-hand' || joint.kind === 'finger')).map((joint) => structuredClone(joint));
    const sourceSentinels = handSentinels.map(({ kind, side: jointSide, role, digit, bone, worldPosition }) => ({
      kind, side: jointSide, role, digit, bone, worldPosition,
    }));
    const sourceWeaponCenterWorld = [0, 1, 0.1];
    const wristWorld = sourceSentinels[0].worldPosition;
    const outsideDelta = [wristWorld[0] - sourceWeaponCenterWorld[0], 0, wristWorld[2] - sourceWeaponCenterWorld[2]];
    const outsideLength = Math.hypot(outsideDelta[0], outsideDelta[2]);
    const outsideDirectionWorld = outsideDelta.map((value) => value / outsideLength);
    const targetWorld = [0, 1, 2].map((axis) => (
      sourceSentinels.reduce((sum, joint) => sum + joint.worldPosition[axis], 0) / sourceSentinels.length
    ));
    const positionWorld = targetWorld.map((value, axis) => value
      + outsideDirectionWorld[axis] * handCameraContract.outsideOffsetM
      + (axis === 1 ? handCameraContract.upwardOffsetM : 0));
    const aim = vectorSubtract(targetWorld, positionWorld);
    const fingerSpans = handSentinels.slice(1).map((finger) => ({
      digit: finger.digit,
      bone: finger.bone,
      pixels: distance(handSentinels[0].pixel, finger.pixel),
    }));
    return {
      actor,
      side,
      missing: false,
      rootVisible: true,
      rootEffectivelyVisible: true,
      effectivelyVisibleMeshCount: 1,
      effectivelyVisibleSkinnedMeshes: ['Swat_Body'],
      handSkinVisible: true,
      canvas,
      viewport,
      roiNdc: handRoiNdc,
      camera: {
        ...handCameraContract,
        actor,
        side,
        source: 'live-rendered-weapon-center-and-rigged-joint-world-transforms',
        sourceWeaponCenterWorld,
        sourceSentinels,
        outsideDirectionWorld,
        targetWorld,
        positionWorld,
        yaw: Math.atan2(-aim[0], -aim[2]),
        pitch: Math.atan2(aim[1], Math.hypot(aim[0], aim[2])),
      },
      handDetail: {
        required: true,
        side,
        expectedSentinelCount: 6,
        sentinels: handSentinels,
        orderValid: true,
        allInsideRoi: true,
        fingerSpans,
        minimumPixels: Math.min(...fingerSpans.map(({ pixels }) => pixels)),
        thresholds: handDetailThresholds,
      },
    };
  };
  const leftHandFraming = handFramingFixture('left');
  const rightHandFraming = handFramingFixture('right');
  assert(handFramingValid(leftHandFraming, leftHandFraming.actor, 'left'), 'fixed left hand detail framing must pass');
  assert(handFramingValid(rightHandFraming, rightHandFraming.actor, 'right'), 'fixed right hand detail framing must pass');
  const croppedHand = structuredClone(leftHandFraming);
  croppedHand.handDetail.sentinels[1].ndc[0] = handRoiNdc.minX - 0.01;
  croppedHand.handDetail.sentinels[1].pixel = pixelFor(croppedHand.handDetail.sentinels[1].ndc);
  croppedHand.handDetail.sentinels[1].withinRoi = false;
  croppedHand.handDetail.sentinels[1].onScreen = false;
  croppedHand.handDetail.allInsideRoi = false;
  assert(!handFramingValid(croppedHand, croppedHand.actor, 'left'), 'cropped hand sentinel must fail');
  const shortHand = structuredClone(leftHandFraming);
  const handWrist = shortHand.handDetail.sentinels[0];
  const handThumb = shortHand.handDetail.sentinels[1];
  handThumb.ndc = [handWrist.ndc[0] + 0.001, handWrist.ndc[1], handWrist.ndc[2]];
  handThumb.pixel = pixelFor(handThumb.ndc);
  shortHand.handDetail.fingerSpans[0].pixels = distance(handWrist.pixel, handThumb.pixel);
  shortHand.handDetail.minimumPixels = shortHand.handDetail.fingerSpans[0].pixels;
  assert(!handFramingValid(shortHand, shortHand.actor, 'left'), 'sub-12px fixed hand span must fail');
  const autoFittedHand = structuredClone(leftHandFraming);
  autoFittedHand.camera.outsideOffsetM = 0.69;
  assert(!handFramingValid(autoFittedHand, autoFittedHand.actor, 'left'), 'non-fixed hand camera distance must fail');
}

if (selfTestMode) {
  runContractSelfTest();
  console.log(JSON.stringify({ pass69_3RiggedBotContractSelfTest: 'PASS' }));
  process.exit(0);
}

if (validateReceiptMode) {
  let preservedReceipt;
  try {
    preservedReceipt = JSON.parse(readFileSync(validationReceiptPath, 'utf8'));
  } catch {
    console.error(JSON.stringify({ valid: false, failedPredicates: ['receipt.readable'] }, null, 2));
    process.exit(1);
  }
  const validationSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
  const failedPredicates = receiptValidationFailures(preservedReceipt, validationSourceSha);
  console.log(JSON.stringify({
    valid: failedPredicates.length === 0,
    target: targetName,
    sourceSha: validationSourceSha,
    failedPredicates,
  }, null, 2));
  process.exit(failedPredicates.length === 0 ? 0 : 1);
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) {
  discardEvidence(`Pass 69.3 rigged-bot gate rejects local Vite environment overrides: ${localViteOverrides.join(', ')}`);
}
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 69.3 rigged-bot gate requires one completely clean source SHA');
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass69-3-rigged-bot-live.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: 'PASS 69',
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_INSTALLED_EDGE: '1',
    QA_PREVIEW_PORT: target.port,
    PASS69_3_RIGGED_BOT_RENDERER: target.renderer,
    PASS69_3_RIGGED_BOT_RENDER_PROFILE: 'blender',
    PASS69_3_RIGGED_BOT_SOURCE_SHA: sourceSha,
    PASS69_3_RIGGED_BOT_TARGET: targetName,
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 69.3 ${targetName} rigged-bot gate failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 69.3 ${targetName} rigged-bot gate terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) discardEvidence(`Pass 69.3 ${targetName} rigged-bot gate failed with exit ${result.status ?? 1}`);

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  discardEvidence(`Pass 69.3 ${targetName} rigged-bot gate did not emit a readable receipt: ${error instanceof Error ? error.message : String(error)}`);
}

const failedPredicates = receiptValidationFailures(receipt, sourceSha);
if (failedPredicates.length > 0) {
  discardEvidence(`Pass 69.3 ${targetName} rigged-bot gate emitted invalid or stale evidence; failed predicates: ${failedPredicates.join(', ')}`);
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 69.3 ${targetName} rigged-bot source drifted during verification (${sourceSha} -> ${endingSha})`);
}
console.log(JSON.stringify({
  pass69_3RiggedBotLive: 'AUTOMATION_PASS_OWNER_PENDING', target: targetName, sourceSha, receiptPath,
}, null, 2));
