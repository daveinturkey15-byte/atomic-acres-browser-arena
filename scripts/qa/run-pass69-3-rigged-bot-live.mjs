import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  constants as fsConstants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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
const evidenceLosSentinels = Object.freeze([
  'head', 'shoulder-left', 'shoulder-right', 'pelvis', 'wrist-left', 'wrist-right',
]);
const evidenceLookAtCamera = (id, position, cameraTarget, fov) => {
  const dx = cameraTarget[0] - position[0];
  const dy = cameraTarget[1] - position[1];
  const dz = cameraTarget[2] - position[2];
  const rawYaw = Math.atan2(-dx, -dz);
  return Object.freeze({
    id,
    position: Object.freeze([...position]),
    target: Object.freeze([...cameraTarget]),
    yaw: Object.is(rawYaw, -Math.PI) ? Math.PI : rawYaw,
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    fov,
  });
};
const fixedDummyActors = Object.freeze([
  Object.freeze({ id: 'test-dummy-alpha', position: Object.freeze([63, 0, -16]), yaw: Math.PI / 2 }),
  Object.freeze({ id: 'test-dummy-bravo', position: Object.freeze([72.56, Math.abs(Math.sin(1)) * 0.025, -6]), yaw: Math.PI / 2 }),
  Object.freeze({ id: 'test-dummy-charlie', position: Object.freeze([72.52, Math.abs(Math.sin(2)) * 0.025, 4]), yaw: -Math.PI / 2 }),
  Object.freeze({ id: 'test-dummy-delta', position: Object.freeze([64.88, Math.abs(Math.sin(3)) * 0.025, 14]), yaw: -Math.PI / 2 }),
]);
const expectedVisualEvidenceContract = Object.freeze({
  schemaVersion: 4,
  contract: 'pass69-3-fixed-rigged-actor-los-fixtures-v4',
  los: Object.freeze({
    contract: 'actual-render-world-layout-occluder-multi-sentinel-los-v2',
    actorSelfOcclusionExcluded: true,
    sentinels: evidenceLosSentinels,
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
    id: 'atomic-south-road-crosslane-spawn-fixed-v4',
    commandedPlayerPosition: Object.freeze([-3, 1.7, 40]),
    settlementPositionAnchor: Object.freeze([-3, 1.7, 40]),
    playerYaw: -Math.PI / 2,
    settlement: Object.freeze({
      contract: 'grounded-distinct-presented-frame-axis-envelope-convergence-v3',
      minimumObservedTransitions: 8,
      minimumDurationMs: 50,
      maximumAxisDeltaM: 0.0005,
      maximumAxisSpanM: 0.0005,
      maximumAbsoluteAxisErrorM: Object.freeze([0.0005, 0.00225, 0.0005]),
      groundedRequired: true,
    }),
    botDistanceM: 5.2,
    nominalBotPosition: Object.freeze([2.2, 0, 40]),
    expectedBotYaw: Math.PI / 2,
    placement: Object.freeze({
      contract: 'debug-place-bot-ahead-synchronous-transaction-v1',
      source: '__ATOMIC_ACRES_DEBUG__.placeBotAhead',
      distanceM: 5.2,
      rootY: 0,
      requiredYawOffsetRadians: 0,
      arithmeticEpsilonM: 1e-9,
      nominalPositionEnvelopeM: Object.freeze([0.0005, 0, 0.0005]),
    }),
    mediumCamera: evidenceLookAtCamera('atomic-south-road-crosslane-medium-v2', [-2.2, 1.08, 40], [2.2, 1.08, 40], 58),
    closeCamera: evidenceLookAtCamera('atomic-south-road-crosslane-close-v2', [0.2, 1.08, 40], [2.2, 1.08, 40], 58),
  }),
  gunRange: Object.freeze({
    id: 'gun-range-open-bay-fixed-v1',
    fixedVisualTimeMs: 0,
    overviewCamera: evidenceLookAtCamera('gun-range-dummies-north-overview', [90, 4.5, -23], [70, 1.15, -1], 58),
    dummies: Object.freeze(fixedDummyActors.map((actor) => {
      const forwardX = -Math.sin(actor.yaw);
      const forwardZ = -Math.cos(actor.yaw);
      const position = [actor.position[0] + forwardX * 2.1, 1.08, actor.position[2] + forwardZ * 2.1];
      const cameraTarget = [actor.position[0], 1.08, actor.position[2]];
      return Object.freeze({
        actor,
        camera: evidenceLookAtCamera(`${actor.id}-fixed-front-close`, position, cameraTarget, 58),
      });
    })),
  }),
});
if (!selfTestMode && !validateReceiptMode) {
  mkdirSync(artifactBase, { recursive: true });
  rmSync(receiptPath, { force: true });
}

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
}

function invalidDiagnosticReceiptPath(baseDirectory, renderer, sourceSha, receiptSha256) {
  const boundedSha = /^[a-f0-9]{40}$/u.test(sourceSha) ? sourceSha : 'unknown-source';
  if (!/^[a-f0-9]{64}$/u.test(receiptSha256)) throw new Error('invalid diagnostic receipt checksum');
  return resolve(
    baseDirectory,
    'INVALID-diagnostics',
    `receipt-${renderer}-${boundedSha}-${receiptSha256}-INVALID.json`,
  );
}

function persistInvalidDiagnosticReceipt(sourcePath, baseDirectory, renderer, sourceSha) {
  const sourceStat = lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error('invalid diagnostic receipt source is not a regular non-link file');
  }
  const baseStat = lstatSync(baseDirectory);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) {
    throw new Error('invalid diagnostic artifact base is not a regular non-link directory');
  }
  const diagnosticDirectory = resolve(baseDirectory, 'INVALID-diagnostics');
  mkdirSync(diagnosticDirectory, { recursive: true });
  const diagnosticDirectoryStat = lstatSync(diagnosticDirectory);
  if (!diagnosticDirectoryStat.isDirectory() || diagnosticDirectoryStat.isSymbolicLink()) {
    throw new Error('invalid diagnostic directory is a link, junction, or non-directory');
  }
  const realBase = realpathSync(baseDirectory);
  const realDiagnosticDirectory = realpathSync(diagnosticDirectory);
  if (relative(realBase, realDiagnosticDirectory) !== 'INVALID-diagnostics') {
    throw new Error('invalid diagnostic directory escapes the artifact base');
  }

  const receiptSha256 = sha256(sourcePath);
  const diagnosticPath = invalidDiagnosticReceiptPath(
    baseDirectory, renderer, sourceSha, receiptSha256,
  );
  let reusedExisting = false;
  let created = false;
  try {
    copyFileSync(sourcePath, diagnosticPath, fsConstants.COPYFILE_EXCL);
    created = true;
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'EEXIST')) throw error;
    reusedExisting = true;
  }

  try {
    const diagnosticStat = lstatSync(diagnosticPath);
    if (!diagnosticStat.isFile() || diagnosticStat.isSymbolicLink()) {
      throw new Error('invalid diagnostic receipt destination is a link or non-regular file');
    }
    if (realpathSync(resolve(diagnosticPath, '..')) !== realDiagnosticDirectory) {
      throw new Error('invalid diagnostic receipt destination escapes the diagnostic directory');
    }
    const persistedSha256 = sha256(diagnosticPath);
    const byteIdentical = readFileSync(sourcePath).equals(readFileSync(diagnosticPath));
    if (persistedSha256 !== receiptSha256 || !byteIdentical) {
      throw new Error('invalid diagnostic receipt content-address verification failed');
    }
  } catch (error) {
    if (created) rmSync(diagnosticPath, { force: true });
    throw error;
  }
  return Object.freeze({ path: diagnosticPath, sha256: receiptSha256, reusedExisting });
}

function discardEvidence(message, quarantineSourceSha = null) {
  let diagnosticReceipt = null;
  let diagnosticFailure = null;
  if (quarantineSourceSha !== null && existsSync(receiptPath)) {
    try {
      diagnosticReceipt = persistInvalidDiagnosticReceipt(
        receiptPath, artifactBase, target.renderer, quarantineSourceSha,
      );
    } catch (error) {
      diagnosticFailure = error instanceof Error ? error.message : String(error);
    }
  }
  rmSync(receiptPath, { force: true });
  rmSync(rendererArtifacts, { recursive: true, force: true });
  const diagnosticSuffix = diagnosticReceipt
    ? `; exact invalid receipt quarantined for local diagnostics only (INVALID, never canonical/publishable, sha256=${diagnosticReceipt.sha256}, reusedExisting=${diagnosticReceipt.reusedExisting}): ${relative(root, diagnosticReceipt.path).replaceAll('\\', '/')}`
    : diagnosticFailure ? `; invalid receipt quarantine failed closed (${diagnosticFailure})` : '';
  throw new Error(`${message}${diagnosticSuffix}`);
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

function yxzCameraQuaternion(yaw, pitch) {
  const sx = Math.sin(pitch / 2);
  const cx = Math.cos(pitch / 2);
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  return [sx * cy, cx * sy, -sx * sy, cx * cy];
}

function rotateVectorByQuaternion(vector, quaternion) {
  const rotated = multiplyQuaternions(
    multiplyQuaternions(quaternion, [vector[0], vector[1], vector[2], 0]),
    [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]],
  );
  return rotated.slice(0, 3);
}

function projectWorldToNdc(worldPosition, camera, aspect) {
  if (!finiteVector(worldPosition) || !finiteVector(camera?.position)
    || ![camera?.yaw, camera?.pitch, camera?.fov, camera?.near, camera?.far].every(Number.isFinite)
    || !(aspect > 0) || !(camera.near > 0) || !(camera.far > camera.near)) return null;
  const cameraQuaternion = yxzCameraQuaternion(camera.yaw, camera.pitch);
  const inverseCameraQuaternion = [
    -cameraQuaternion[0], -cameraQuaternion[1], -cameraQuaternion[2], cameraQuaternion[3],
  ];
  const local = rotateVectorByQuaternion(vectorSubtract(worldPosition, camera.position), inverseCameraQuaternion);
  if (!(local[2] < 0)) return null;
  const tangent = Math.tan(camera.fov * Math.PI / 360);
  const projectionA = (camera.far + camera.near) / (camera.near - camera.far);
  const projectionB = 2 * camera.far * camera.near / (camera.near - camera.far);
  return [
    local[0] / (-local[2] * tangent * aspect),
    local[1] / (-local[2] * tangent),
    (projectionA * local[2] + projectionB) / -local[2],
  ];
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

function closeJointFramingValid(framing, expectedRoi, projectionCamera) {
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
    const independentlyProjected = projectWorldToNdc(
      sentinel.worldPosition,
      projectionCamera,
      framing.canvas.width / framing.canvas.height,
    );
    const pixel = pixelFor(sentinel.ndc);
    if (x < expectedRoi.minX || x > expectedRoi.maxX || y < expectedRoi.minY || y > expectedRoi.maxY || z < -1 || z > 1
      || !independentlyProjected
      || !sentinel.ndc.every((value, axis) => close(value, independentlyProjected[axis], 1e-6))
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

function framingValid(
  framing,
  actor,
  expectedRoi,
  projectionCamera,
  expectedRootPosition,
  expectedRootYaw,
  presentation,
  requireJointDetail = false,
  rootTolerance = 1e-8,
) {
  if (framing?.missing !== false
    || !sameObject(framing.actor, actor)
    || !framingActorFrameBindingValid(framing, actor, presentation)
    || !finiteVector(framing.rootPosition)
    || !Number.isFinite(framing.rootYaw)
    || !finiteVector(framing.projectedWorldPosition)
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
  const independentScreenPosition = projectWorldToNdc(
    framing.projectedWorldPosition,
    projectionCamera,
    framing.canvas.width / framing.canvas.height,
  );
  const anchorHeight = actor.kind === 'bot' ? 1.35 : 1.65;
  const expectedAnchor = [framing.rootPosition[0], framing.rootPosition[1] + anchorHeight, framing.rootPosition[2]];
  if (!independentScreenPosition
    || !framing.screenPosition.every((value, axis) => close(value, independentScreenPosition[axis], 1e-6))
    || !framing.projectedWorldPosition.every((value, axis) => close(value, expectedAnchor[axis], 1e-9))
    || expectedRootPosition && !framing.rootPosition.every((value, axis) => close(value, expectedRootPosition[axis], rootTolerance))
    || Number.isFinite(expectedRootYaw) && wrappedAngleDelta(framing.rootYaw, expectedRootYaw) > rootTolerance) {
    return false;
  }
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
  return rootValid && (!requireJointDetail || closeJointFramingValid(framing, expectedRoi, projectionCamera));
}

function evidenceCameraValid(camera, expected) {
  return camera?.id === expected?.id
    && finiteVector(camera.position)
    && finiteVector(camera.target)
    && camera.position.every((value, index) => close(value, expected.position[index], 1e-9))
    && camera.target.every((value, index) => close(value, expected.target[index], 1e-9))
    && close(camera.yaw, expected.yaw, 1e-9)
    && close(camera.pitch, expected.pitch, 1e-9)
    && close(camera.fov, expected.fov, 1e-9);
}

function captureActorFrameValid(frameActor, expectedActor) {
  return sameObject(frameActor?.actor, expectedActor)
    && finiteVector(frameActor.rootPosition)
    && Number.isFinite(frameActor.rootYaw)
    && frameActor.rootVisible === true
    && frameActor.rootEffectivelyVisible === true
    && frameActor.effectivelyVisibleMeshCount > 0
    && Array.isArray(frameActor.effectivelyVisibleSkinnedMeshes)
    && frameActor.effectivelyVisibleSkinnedMeshes.length > 0
    && frameActor.armSkinVisible === true
    && frameActor.handSkinVisible === true
    && (expectedActor.kind === 'bot' ? finiteVector(frameActor.weaponCenterWorld) : frameActor.weaponCenterWorld === null)
    && finiteVector(frameActor.projectedWorldPosition)
    && finiteVector(frameActor.screenPosition)
    && Array.isArray(frameActor.jointScreenPositions)
    && frameActor.jointScreenPositions.length === expectedCaptureJoints.length
    && frameActor.jointScreenPositions.every((joint, index) => {
      const expected = expectedCaptureJoints[index];
      return joint.kind === expected.kind && joint.side === expected.side
        && joint.role === expected.role && joint.digit === expected.digit && joint.bone === expected.bone
        && finiteVector(joint.worldPosition) && finiteVector(joint.ndc);
    })
    && Array.isArray(frameActor.evidenceSentinels)
    && frameActor.evidenceSentinels.length === evidenceLosSentinels.length
    && frameActor.evidenceSentinels.every((sentinel, index) => (
      sentinel.name === evidenceLosSentinels[index]
        && typeof sentinel.bone === 'string' && sentinel.bone.length > 0
        && sentinel.present === true
        && finiteVector(sentinel.worldPosition)
    ));
}

function committedCameraValid(
  committed,
  expectedCamera,
  expectedArena,
  revision,
  expectedActors,
  rendererName = target.renderer,
) {
  const expectedCompletionSemantics = expectedVisualEvidenceContract.presentation.rendererCompletion[rendererName];
  const expectedQuaternion = yxzCameraQuaternion(expectedCamera.yaw, expectedCamera.pitch);
  return committed?.contract === expectedVisualEvidenceContract.presentation.contract
    && committed.renderer === rendererName
    && committed.completionSemantics === expectedCompletionSemantics
    && committed.arenaId === expectedArena
    && Number.isSafeInteger(committed.frame) && committed.frame > 0
    && committed.captureRevision === revision
    && Number.isFinite(committed.committedAtMs)
    && finiteVector(committed.position)
    && finiteVector(committed.quaternion, 4)
    && close(vectorLength(committed.quaternion), 1, 1e-7)
    && normalizedQuaternionDelta(committed.quaternion, expectedQuaternion) <= 1e-9
    && committed.position.every((value, index) => close(value, expectedCamera.position[index], 1e-9))
    && close(committed.yaw, expectedCamera.yaw, 1e-9)
    && close(committed.pitch, expectedCamera.pitch, 1e-9)
    && close(committed.fov, expectedCamera.fov, 1e-9)
    && committed.near > 0 && committed.far > committed.near
    && Number.isSafeInteger(committed.submissionSequence) && committed.submissionSequence >= 0
    && Number.isSafeInteger(committed.completedSequence) && committed.completedSequence >= 0
    && sameObject(committed.captureTargets, expectedActors)
    && Array.isArray(committed.actors)
    && committed.actors.length === expectedActors.length
    && committed.actors.every((actor, index) => captureActorFrameValid(actor, expectedActors[index]))
    && (rendererName === 'webgl2'
      ? committed.submissionSequence === 0 && committed.completedSequence === 0
      : committed.completedSequence <= committed.submissionSequence);
}

function capturePresentationValid(
  presentation,
  expectedCamera,
  expectedArena,
  expectedActors,
  rendererName = target.renderer,
) {
  const revision = presentation?.requestedRevision;
  const committed = presentation?.committed;
  const paused = presentation?.pausedPresentedCapture;
  const completion = presentation?.completion;
  const laterFrames = presentation?.presentedGameplayFramesAfterCommit;
  if (presentation?.contract !== expectedVisualEvidenceContract.presentation.contract
    || presentation.order !== expectedVisualEvidenceContract.presentation.order
    || !evidenceCameraValid(presentation.fixtureCamera, expectedCamera)
    || !Number.isSafeInteger(presentation.priorCaptureRevision)
    || presentation.priorCaptureRevision < 0
    || !Number.isSafeInteger(revision) || revision < 1
    || revision <= presentation.priorCaptureRevision
    || !committedCameraValid(committed, expectedCamera, expectedArena, revision, expectedActors, rendererName)
    || !committedCameraValid(paused, expectedCamera, expectedArena, revision, expectedActors, rendererName)
    || normalizedQuaternionDelta(committed.quaternion, paused.quaternion) > 1e-9
    || !close(committed.near, paused.near, 1e-9)
    || !close(committed.far, paused.far, 1e-9)
    || committed.committedAtMs > paused.committedAtMs
    || paused.submissionSequence < committed.submissionSequence
    || paused.completedSequence < committed.completedSequence
    || !Array.isArray(laterFrames) || laterFrames.length !== 2
    || !laterFrames.every((frame) => Number.isSafeInteger(frame) && frame > 0)
    || laterFrames[0] <= committed.frame
    || laterFrames[1] <= laterFrames[0]
    || paused.frame < laterFrames[1]
    || presentation.pausedPresentedGameplayFrame !== paused.frame
    || presentation.compositorBoundariesAfterCommit
      !== expectedVisualEvidenceContract.presentation.compositorBoundariesAfterCommit
    || !Number.isSafeInteger(presentation.pausedAtFrameCount)
    || presentation.pausedAtFrameCount < paused.frame
    || completion?.contract !== 'renderer-presentation-completion-v1'
    || completion.renderer !== rendererName
    || completion.semantics !== expectedVisualEvidenceContract.presentation.rendererCompletion[rendererName]
    || completion.required !== (rendererName === 'webgpu')
    || !Number.isSafeInteger(completion.baselineSubmissionSequence)
    || !Number.isSafeInteger(completion.baselineCompletedSequence)
    || !Number.isSafeInteger(completion.observedSubmissionSequence)
    || !Number.isSafeInteger(completion.observedCompletedSequence)
    || !Number.isSafeInteger(completion.fenceSubmissionSequence)
    || !Number.isSafeInteger(completion.fenceCompletedSequence)
    || completion.baselineSubmissionSequence < 0
    || completion.baselineCompletedSequence < 0
    || completion.observedSubmissionSequence < 0
    || completion.observedCompletedSequence < 0
    || completion.fenceSubmissionSequence < 0
    || completion.fenceCompletedSequence < 0
    || completion.baselineCompletedSequence > completion.baselineSubmissionSequence
    || completion.baselineCompletedSequence > committed.completedSequence
    || committed.completedSequence > paused.completedSequence
    || paused.completedSequence > completion.fenceCompletedSequence
    || completion.fenceCompletedSequence > completion.fenceSubmissionSequence
    || completion.fenceCompletedSequence > completion.observedCompletedSequence
    || completion.observedCompletedSequence > completion.observedSubmissionSequence
    || completion.observedSubmissionSequence < completion.baselineSubmissionSequence
    || completion.finalPausedSubmissionSequence !== paused.submissionSequence
    || completion.fenceSubmissionSequence !== paused.submissionSequence
    || completion.fenceCompletedSequence < paused.submissionSequence
    || completion.observedSubmissionSequence !== paused.submissionSequence
    || completion.coversFinalPausedSubmission !== true
    || completion.completedBeforeCompositorBoundaries !== true) return false;
  return rendererName === 'webgl2'
    ? completion.baselineSubmissionSequence === 0
      && completion.baselineCompletedSequence === 0
      && completion.observedSubmissionSequence === 0
      && completion.observedCompletedSequence === 0
    : (completion.baselineSubmissionSequence < committed.submissionSequence
      && completion.observedCompletedSequence > completion.baselineCompletedSequence
      && completion.observedCompletedSequence >= paused.submissionSequence);
}

function framingActorFrameBindingValid(framing, actor, presentation) {
  const paused = presentation?.pausedPresentedCapture;
  const frameActor = paused?.actors?.find((candidate) => sameObject(candidate.actor, actor));
  const framedJoints = framing?.jointDetail?.sentinels ?? framing?.handDetail?.sentinels ?? [];
  return frameActor !== undefined
    && framing?.frame === paused.frame
    && framing.captureRevision === paused.captureRevision
    && sameObject(framing.actor, actor)
    && sameObject(framing.rootPosition, frameActor.rootPosition)
    && close(framing.rootYaw, frameActor.rootYaw, 1e-9)
    && sameObject(framing.projectedWorldPosition, frameActor.projectedWorldPosition)
    && (framing.screenPosition === undefined || sameObject(framing.screenPosition, frameActor.screenPosition))
    && sameObject(framing.evidenceSentinels, frameActor.evidenceSentinels)
    && framedJoints.every((joint) => {
      const source = frameActor.jointScreenPositions.find((candidate) => (
        candidate.kind === joint.kind && candidate.side === joint.side
          && candidate.role === joint.role && candidate.digit === joint.digit && candidate.bone === joint.bone
      ));
      return source !== undefined
        && sameObject(joint.worldPosition, source.worldPosition)
        && sameObject(joint.ndc, source.ndc);
    });
}

function lineOfSightValid(lineOfSight, actor, expectedArena, presentation, framing) {
  const paused = presentation?.pausedPresentedCapture;
  const frameActor = paused?.actors?.find((candidate) => sameObject(candidate.actor, actor));
  const cachedMatches = paused?.worldLayoutLineOfSight?.filter((candidate) => sameObject(candidate.actor, actor)) ?? [];
  const { cameraPresentation: _cameraPresentation, ...sampledCachedFields } = lineOfSight ?? {};
  if (!frameActor || !framingActorFrameBindingValid(framing, actor, presentation)
    || cachedMatches.length !== 1 || !sameObject(sampledCachedFields, cachedMatches[0])) return false;
  return lineOfSight?.contract === expectedVisualEvidenceContract.los.contract
    && sameObject(lineOfSight.actor, actor)
    && lineOfSight.arenaId === expectedArena
    && lineOfSight.actorSelfOcclusionExcluded === true
    && lineOfSight.allClear === true
    && lineOfSight.captureFrame === paused.frame
    && lineOfSight.captureRevision === paused.captureRevision
    && lineOfSight.captureSubmissionSequence === paused.submissionSequence
    && lineOfSight.renderOccluderCount > 0
    && finiteVector(lineOfSight.camera?.position)
    && finiteVector(lineOfSight.camera?.quaternion, 4)
    && close(vectorLength(lineOfSight.camera.quaternion), 1, 1e-7)
    && Number.isFinite(lineOfSight.camera?.fov)
    && sameObject(lineOfSight.camera.position, presentation?.pausedPresentedCapture?.position)
    && sameObject(lineOfSight.camera.quaternion, presentation?.pausedPresentedCapture?.quaternion)
    && close(lineOfSight.camera.fov, presentation?.pausedPresentedCapture?.fov, 1e-9)
    && lineOfSight.camera?.captureRevision === presentation?.requestedRevision
    && sameObject(lineOfSight.cameraPresentation, presentation?.pausedPresentedCapture)
    && Array.isArray(lineOfSight.sentinels)
    && lineOfSight.sentinels.length === evidenceLosSentinels.length
    && lineOfSight.sentinels.every((sentinel, index) => {
      const frameSentinel = frameActor.evidenceSentinels[index];
      const jointBinding = sentinel.name.startsWith('shoulder-')
        ? framing.jointDetail?.sentinels.find((joint) => (
          joint.role === 'shoulder' && joint.side === sentinel.name.slice('shoulder-'.length)
        ))
        : sentinel.name.startsWith('wrist-')
          ? (framing.jointDetail?.sentinels ?? framing.handDetail?.sentinels)?.find((joint) => (
            joint.role === 'wrist-hand' && joint.side === sentinel.name.slice('wrist-'.length)
          ))
          : null;
      return sentinel?.name === evidenceLosSentinels[index]
        && sentinel.name === frameSentinel?.name
        && sentinel.bone === frameSentinel?.bone
        && sentinel.present === true
        && sentinel.clear === true
        && sentinel.blocker === null
        && finiteVector(sentinel.worldPosition)
        && sameObject(sentinel.worldPosition, frameSentinel.worldPosition)
        && (!jointBinding || sameObject(sentinel.worldPosition, jointBinding.worldPosition))
        && Number.isFinite(sentinel.targetDistanceM)
        && sentinel.targetDistanceM > 0.025
        && close(
          sentinel.targetDistanceM,
          positionDelta(lineOfSight.camera.position, sentinel.worldPosition),
          1e-9,
        );
    });
}

function screenshotFrameBindingValid(binding, presentation) {
  const paused = presentation?.pausedPresentedCapture;
  const expected = {
    debugRenderPaused: true,
    frame: paused?.frame,
    captureRevision: paused?.captureRevision,
    submissionSequence: paused?.submissionSequence,
    presentedGameplayFrame: presentation?.pausedPresentedGameplayFrame,
  };
  return binding?.contract === 'paused-presented-frame-screenshot-v1'
    && binding.stable === true
    && sameObject(binding.before, expected)
    && sameObject(binding.after, expected);
}

function pausedLivePoseAdvanceValid(proof, actor, presentation) {
  const expectedFrameBinding = {
    debugRenderPaused: true,
    frame: presentation?.pausedPresentedCapture?.frame,
    captureRevision: presentation?.pausedPresentedCapture?.captureRevision,
    submissionSequence: presentation?.pausedPresentedCapture?.submissionSequence,
    presentedGameplayFrame: presentation?.pausedPresentedGameplayFrame,
  };
  if (proof?.contract !== 'paused-render-live-pose-advance-v1'
    || !sameObject(proof.actor, actor)
    || proof.animationBoundaries !== 4
    || proof.minimumJointAdvanceM !== 0.00001
    || !sameObject(proof.submittedFrameBinding, expectedFrameBinding)
    || !sameObject(proof.before?.frameBinding, expectedFrameBinding)
    || !sameObject(proof.after?.frameBinding, expectedFrameBinding)
    || !Number.isSafeInteger(proof.before?.frameCount)
    || !Number.isSafeInteger(proof.after?.frameCount)
    || proof.after.frameCount <= proof.before.frameCount
    || !Array.isArray(proof.before?.joints)
    || !Array.isArray(proof.after?.joints)
    || proof.before.joints.length !== expectedCaptureJoints.length
    || proof.after.joints.length !== expectedCaptureJoints.length) return false;
  const deltas = [];
  for (let index = 0; index < expectedCaptureJoints.length; index += 1) {
    const expected = expectedCaptureJoints[index];
    const before = proof.before.joints[index];
    const after = proof.after.joints[index];
    if (before?.kind !== expected.kind || before.side !== expected.side || before.role !== expected.role
      || before.digit !== expected.digit || before.bone !== expected.bone || !finiteVector(before.worldPosition)
      || after?.kind !== expected.kind || after.side !== expected.side || after.role !== expected.role
      || after.digit !== expected.digit || after.bone !== expected.bone || !finiteVector(after.worldPosition)) return false;
    deltas.push(positionDelta(before.worldPosition, after.worldPosition));
  }
  const maximumJointAdvanceM = Math.max(...deltas);
  return close(proof.maximumJointAdvanceM, maximumJointAdvanceM, 1e-9)
    && maximumJointAdvanceM > proof.minimumJointAdvanceM;
}

function screenshotValid(
  record,
  expectedPath,
  actor,
  expectedRoi,
  expectedCamera,
  expectedArena,
  expectedRootPosition,
  expectedRootYaw,
  requireJointDetail = false,
) {
  if (!finiteVector(expectedRootPosition) || !Number.isFinite(expectedRootYaw)) return false;
  const path = resolve(root, expectedPath);
  const expectedActors = [actor];
  const projectionCamera = {
    ...expectedCamera,
    near: record?.presentation?.pausedPresentedCapture?.near,
    far: record?.presentation?.pausedPresentedCapture?.far,
  };
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && screenshotFrameBindingValid(record.screenshotFrameBinding, record.presentation)
    && record.fixtureContract === expectedVisualEvidenceContract.contract
    && (actor.kind === 'bot' && expectedCamera.id === expectedVisualEvidenceContract.atomic.closeCamera.id
      ? pausedLivePoseAdvanceValid(record.pausedLivePoseAdvance, actor, record.presentation)
      : record.pausedLivePoseAdvance === null)
    && evidenceCameraValid(record.camera, expectedCamera)
    && capturePresentationValid(record.presentation, expectedCamera, expectedArena, expectedActors)
    && lineOfSightValid(record.lineOfSight, actor, expectedArena, record.presentation, record.framing)
    && framingValid(
      record.framing,
      actor,
      expectedRoi,
      projectionCamera,
      expectedRootPosition,
      expectedRootYaw,
      record.presentation,
      requireJointDetail,
      expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM,
    );
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

function maximumAxisDelta(left, right) {
  return finiteVector(left) && finiteVector(right)
    ? Math.max(...left.map((value, axis) => Math.abs(value - right[axis])))
    : Number.NaN;
}

function withinNumericBoundary(observed, limit, scaleValues) {
  return Number.isFinite(observed) && Number.isFinite(limit) && finiteVector(scaleValues, scaleValues.length)
    && observed <= limit + Number.EPSILON * 8 * Math.max(1, ...scaleValues.map(Math.abs));
}

function meetsMinimumBoundary(observed, minimum, scaleValues) {
  return Number.isFinite(observed) && Number.isFinite(minimum) && finiteVector(scaleValues, scaleValues.length)
    && observed + Number.EPSILON * 8 * Math.max(1, ...scaleValues.map(Math.abs)) >= minimum;
}

function nonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function axisErrorsWithin(left, right, maxima) {
  return finiteVector(left) && finiteVector(right) && finiteVector(maxima)
    && left.every((value, axis) => withinNumericBoundary(
      Math.abs(value - right[axis]), maxima[axis], [value, right[axis]],
    ));
}

function wrappedAngleDelta(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function deriveBotPlacement(position, yaw, placement) {
  if (!finiteVector(position) || !Number.isFinite(yaw) || !placement
    || !Number.isFinite(placement.stagedDistanceM) || !Number.isFinite(placement.yawOffsetRadians)) return null;
  const bearing = yaw + placement.yawOffsetRadians;
  const rootPosition = [
    position[0] - Math.sin(bearing) * placement.stagedDistanceM,
    expectedVisualEvidenceContract.atomic.placement.rootY,
    position[2] - Math.cos(bearing) * placement.stagedDistanceM,
  ];
  const rootYaw = Math.atan2(
    -(position[0] - rootPosition[0]),
    -(position[2] - rootPosition[2]),
  );
  return { rootPosition, rootYaw };
}

function atomicBotPlacementValid(fixedFixture) {
  const definition = expectedVisualEvidenceContract.atomic;
  const contract = definition.placement;
  const transaction = fixedFixture?.placement;
  const placement = transaction?.placement;
  const convergenceSamples = fixedFixture?.convergence?.samples;
  if (!transaction || !placement || !Array.isArray(convergenceSamples) || convergenceSamples.length === 0
    || !nonnegativeSafeInteger(transaction.preFrame)
    || transaction.postFrame !== transaction.preFrame
    || transaction.preFrame <= convergenceSamples.at(-1)?.presentedGameplayFrame
    || !finiteVector(transaction.prePlayer?.position)
    || !Number.isFinite(transaction.prePlayer?.yaw)
    || transaction.prePlayer.grounded !== true
    || !axisErrorsWithin(
      transaction.prePlayer.position,
      definition.settlementPositionAnchor,
      definition.settlement.maximumAbsoluteAxisErrorM,
    )
    || wrappedAngleDelta(transaction.prePlayer.yaw, definition.playerYaw) > contract.arithmeticEpsilonM
    || placement.contract !== contract.contract
    || placement.source !== contract.source
    || placement.requestedDistanceM !== contract.distanceM
    || placement.stagedDistanceM !== contract.distanceM
    || placement.yawOffsetRadians !== contract.requiredYawOffsetRadians
    || placement.presentedGameplayFrameAtCommand !== transaction.preFrame
    || !sameArray(placement.sourcePlayer?.position, transaction.prePlayer.position)
    || placement.sourcePlayer?.yaw !== transaction.prePlayer.yaw
    || placement.sourcePlayer?.grounded !== transaction.prePlayer.grounded
    || typeof placement.bot?.id !== 'string' || placement.bot.id.length === 0
    || placement.bot.alive !== true || placement.bot.weapon !== 'carbine'
    || !finiteVector(placement.bot.logicalPosition) || !finiteVector(placement.bot.rootPosition)
    || !Number.isFinite(placement.bot.rootYaw)) return false;
  const derived = deriveBotPlacement(
    placement.sourcePlayer.position,
    placement.sourcePlayer.yaw,
    placement,
  );
  if (!derived
    || !placement.bot.logicalPosition.every((value, axis) => close(
      value, derived.rootPosition[axis], contract.arithmeticEpsilonM,
    ))
    || !placement.bot.rootPosition.every((value, axis) => close(
      value, derived.rootPosition[axis], contract.arithmeticEpsilonM,
    ))
    || wrappedAngleDelta(placement.bot.rootYaw, derived.rootYaw) > contract.arithmeticEpsilonM
    || wrappedAngleDelta(derived.rootYaw, definition.expectedBotYaw) > contract.arithmeticEpsilonM
    || !sameArray(fixedFixture?.derivedBotPosition, derived.rootPosition)
    || !Number.isFinite(fixedFixture?.derivedBotYaw)
    || wrappedAngleDelta(fixedFixture?.derivedBotYaw, derived.rootYaw) > contract.arithmeticEpsilonM
    || !derived.rootPosition.every((value, axis) => withinNumericBoundary(
      Math.abs(value - definition.nominalBotPosition[axis]),
      contract.nominalPositionEnvelopeM[axis],
      [value, definition.nominalBotPosition[axis]],
    ))) return false;
  return true;
}

function atomicPlayerConvergenceValid(fixedFixture, firstCapturePresentedGameplayFrame) {
  const definition = expectedVisualEvidenceContract.atomic;
  const settlement = definition.settlement;
  const commanded = fixedFixture?.commandedPlayer;
  const convergence = fixedFixture?.convergence;
  const samples = convergence?.samples;
  if (!nonnegativeSafeInteger(commanded?.presentedGameplayFrame)
    || !sameArray(commanded?.position, definition.commandedPlayerPosition)
    || commanded.yaw !== definition.playerYaw
    || commanded.grounded !== false
    || convergence?.contract !== settlement.contract
    || !sameArray(convergence.positionAnchor, definition.settlementPositionAnchor)
    || !Array.isArray(samples)
    || samples.length < settlement.minimumObservedTransitions + 1
    || !nonnegativeSafeInteger(convergence.transitionCount)
    || convergence.transitionCount !== samples.length - 1
    || convergence.transitionCount < settlement.minimumObservedTransitions
    || !nonnegativeSafeInteger(firstCapturePresentedGameplayFrame)) return false;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!nonnegativeSafeInteger(sample?.presentedGameplayFrame)
      || !Number.isFinite(sample?.atMs)
      || sample.atMs < 0
      || !finiteVector(sample?.position)
      || sample.grounded !== true
      || !axisErrorsWithin(
        sample.position, definition.settlementPositionAnchor, settlement.maximumAbsoluteAxisErrorM,
      )
      || index > 0 && (sample.presentedGameplayFrame <= samples[index - 1].presentedGameplayFrame
        || sample.atMs <= samples[index - 1].atMs)) {
      return false;
    }
  }
  if (samples[0].presentedGameplayFrame <= commanded.presentedGameplayFrame) return false;
  const durationMs = samples.at(-1).atMs - samples[0].atMs;
  const observedDeltas = samples.slice(1).map((sample, index) => maximumAxisDelta(
    sample.position, samples[index].position,
  ));
  const maximumObservedAxisDeltaM = Math.max(...observedDeltas);
  const maximumObservedAxisSpanM = [0, 1, 2].map((axis) => {
    const values = samples.map((sample) => sample.position[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const maximumObservedAbsoluteAxisErrorM = [0, 1, 2].map((axis) => Math.max(
    ...samples.map((sample) => Math.abs(sample.position[axis] - definition.settlementPositionAnchor[axis])),
  ));
  return meetsMinimumBoundary(durationMs, settlement.minimumDurationMs, [samples[0].atMs, samples.at(-1).atMs])
    && withinNumericBoundary(
      maximumObservedAxisDeltaM, settlement.maximumAxisDeltaM, samples.flatMap((sample) => sample.position),
    )
    && maximumObservedAxisSpanM.every((spanM, axis) => withinNumericBoundary(
      spanM, settlement.maximumAxisSpanM, samples.map((sample) => sample.position[axis]),
    ))
    && maximumObservedAbsoluteAxisErrorM.every((errorM, axis) => withinNumericBoundary(
      errorM,
      settlement.maximumAbsoluteAxisErrorM[axis],
      [...samples.map((sample) => sample.position[axis]), definition.settlementPositionAnchor[axis]],
    ))
    && convergence.allGrounded === true
    && Number.isFinite(convergence.durationMs)
    && convergence.durationMs >= 0
    && Number.isFinite(convergence.maximumObservedAxisDeltaM)
    && convergence.maximumObservedAxisDeltaM >= 0
    && convergence.durationMs === durationMs
    && convergence.maximumObservedAxisDeltaM === maximumObservedAxisDeltaM
    && finiteVector(convergence.maximumObservedAxisSpanM)
    && convergence.maximumObservedAxisSpanM.every((value) => value >= 0)
    && sameArray(convergence.maximumObservedAxisSpanM, maximumObservedAxisSpanM)
    && finiteVector(convergence.maximumObservedAbsoluteAxisErrorM)
    && convergence.maximumObservedAbsoluteAxisErrorM.every((value) => value >= 0)
    && sameArray(convergence.maximumObservedAbsoluteAxisErrorM, maximumObservedAbsoluteAxisErrorM)
    && nonnegativeSafeInteger(fixedFixture?.stagedPlayer?.presentedGameplayFrame)
    && fixedFixture.stagedPlayer.presentedGameplayFrame > samples.at(-1).presentedGameplayFrame
    && fixedFixture.stagedPlayer.presentedGameplayFrame < firstCapturePresentedGameplayFrame
    && finiteVector(fixedFixture.stagedPlayer.position)
    && axisErrorsWithin(
      fixedFixture.stagedPlayer.position,
      definition.settlementPositionAnchor,
      settlement.maximumAbsoluteAxisErrorM,
    )
    && close(fixedFixture.stagedPlayer.yaw, definition.playerYaw, 1e-8)
    && fixedFixture.stagedPlayer.grounded === true
    && nonnegativeSafeInteger(fixedFixture?.placement?.postFrame)
    && fixedFixture.stagedPlayer.presentedGameplayFrame > fixedFixture.placement.postFrame;
}

function handCameraValid(camera, actor, side, sourceScreenshot, expectedRootPosition, expectedRootYaw) {
  if (!finiteVector(expectedRootPosition) || !Number.isFinite(expectedRootYaw)) return false;
  const expected = expectedHandCaptureJoints(side);
  const sourcePresentation = sourceScreenshot?.presentation?.pausedPresentedCapture;
  const sourceActor = sourcePresentation?.actors?.find((candidate) => sameObject(candidate.actor, actor));
  const sourceBinding = camera?.sourceFrameBinding;
  const sourceProjectionCamera = {
    ...expectedVisualEvidenceContract.atomic.closeCamera,
    near: sourcePresentation?.near,
    far: sourcePresentation?.far,
  };
  if (camera?.contract !== handCameraContract.contract
    || camera.outsideOffsetM !== handCameraContract.outsideOffsetM
    || camera.upwardOffsetM !== handCameraContract.upwardOffsetM
    || camera.fovDegrees !== handCameraContract.fovDegrees
    || camera.maximumSourceJointDriftM !== handCameraContract.maximumSourceJointDriftM
    || !sameObject(camera.actor, actor)
    || camera.side !== side
    || camera.source !== 'armed-close-submitted-frame-weapon-center-and-rigged-joint-world-transforms'
    || sourceBinding?.contract !== 'armed-close-submitted-actor-source-v1'
    || sourceBinding.cameraId !== expectedVisualEvidenceContract.atomic.closeCamera.id
    || sourceBinding.frame !== sourcePresentation?.frame
    || sourceBinding.captureRevision !== sourcePresentation?.captureRevision
    || sourceBinding.submissionSequence !== sourcePresentation?.submissionSequence
    || !sameObject(sourceBinding.actor, actor)
    || !evidenceCameraValid(sourceScreenshot?.camera, expectedVisualEvidenceContract.atomic.closeCamera)
    || !capturePresentationValid(
      sourceScreenshot?.presentation,
      expectedVisualEvidenceContract.atomic.closeCamera,
      'atomic-acres',
      [actor],
    )
    || !screenshotFrameBindingValid(sourceScreenshot?.screenshotFrameBinding, sourceScreenshot?.presentation)
    || !framingValid(
      sourceScreenshot?.framing,
      actor,
      closeRoiNdc,
      sourceProjectionCamera,
      expectedRootPosition,
      expectedRootYaw,
      sourceScreenshot?.presentation,
      true,
      expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM,
    )
    || !sourceActor
    || !captureActorFrameValid(sourceActor, actor)
    || !sourceActor.rootPosition.every((value, axis) => close(
      value, expectedRootPosition[axis], expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM,
    ))
    || wrappedAngleDelta(sourceActor.rootYaw, expectedRootYaw)
      > expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM
    || !sameObject(camera.sourceWeaponCenterWorld, sourceActor.weaponCenterWorld)
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
    const submitted = sourceActor.jointScreenPositions.find((joint) => (
      joint.kind === wanted.kind && joint.side === wanted.side && joint.role === wanted.role
        && joint.digit === wanted.digit && joint.bone === wanted.bone
    ));
    if (source.kind !== wanted.kind || source.side !== wanted.side || source.role !== wanted.role
      || source.digit !== wanted.digit || source.bone !== wanted.bone || !finiteVector(source.worldPosition)
      || !submitted || !sameObject(source.worldPosition, submitted.worldPosition)) return false;
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
    && close(camera.pitch, expectedPitch, 1e-9)
    && evidenceCameraValid(camera.fixtureCamera, {
      id: `armed-live-bot-${side}-fixed-hand-detail`,
      position: expectedPosition,
      target: expectedTarget,
      yaw: expectedYaw,
      pitch: expectedPitch,
      fov: handCameraContract.fovDegrees,
    });
}

function handFramingValid(
  framing,
  actor,
  side,
  presentation,
  expectedRootPosition,
  expectedRootYaw,
  sourceScreenshot,
) {
  const expected = expectedHandCaptureJoints(side);
  const detail = framing?.handDetail;
  const paused = presentation?.pausedPresentedCapture;
  const projectionCamera = {
    ...framing?.camera?.fixtureCamera,
    near: paused?.near,
    far: paused?.far,
  };
  if (framing?.missing !== false
    || !sameObject(framing.actor, actor)
    || !framingActorFrameBindingValid(framing, actor, presentation)
    || expectedRootPosition && !framing.rootPosition.every((value, axis) => close(
      value, expectedRootPosition[axis], expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM,
    ))
    || Number.isFinite(expectedRootYaw) && wrappedAngleDelta(framing.rootYaw, expectedRootYaw)
      > expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM
    || framing.side !== side
    || framing.rootVisible !== true
    || framing.rootEffectivelyVisible !== true
    || !(framing.effectivelyVisibleMeshCount > 0)
    || !Array.isArray(framing.effectivelyVisibleSkinnedMeshes)
    || framing.effectivelyVisibleSkinnedMeshes.length < 1
    || framing.handSkinVisible !== true
    || !sameObject(framing.roiNdc, handRoiNdc)
    || !handCameraValid(framing.camera, actor, side, sourceScreenshot, expectedRootPosition, expectedRootYaw)
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
    const independentlyProjected = projectWorldToNdc(
      sentinel.worldPosition,
      projectionCamera,
      framing.canvas.width / framing.canvas.height,
    );
    const pixel = pixelFor(sentinel.ndc);
    const source = framing.camera.sourceSentinels[index];
    if (x < handRoiNdc.minX || x > handRoiNdc.maxX || y < handRoiNdc.minY || y > handRoiNdc.maxY || z < -1 || z > 1
      || !independentlyProjected
      || !sentinel.ndc.every((value, axis) => close(value, independentlyProjected[axis], 1e-6))
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

function handScreenshotValid(record, expectedPath, actor, side, sourceScreenshot, expectedRootPosition, expectedRootYaw) {
  if (!finiteVector(expectedRootPosition) || !Number.isFinite(expectedRootYaw)) return false;
  const path = resolve(root, expectedPath);
  const expectedCamera = record?.framing?.camera?.fixtureCamera;
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && screenshotFrameBindingValid(record.screenshotFrameBinding, record.presentation)
    && record.fixtureContract === expectedVisualEvidenceContract.contract
    && evidenceCameraValid(record.camera, expectedCamera)
    && capturePresentationValid(record.presentation, expectedCamera, 'atomic-acres', [actor])
    && lineOfSightValid(record.lineOfSight, actor, 'atomic-acres', record.presentation, record.framing)
    && handFramingValid(
      record.framing,
      actor,
      side,
      record.presentation,
      expectedRootPosition,
      expectedRootYaw,
      sourceScreenshot,
    );
}

function overviewScreenshotValid(record, expectedPath) {
  const path = resolve(root, expectedPath);
  const expectedActors = expectedDummyIds.map((id) => ({ kind: 'training-dummy', id }));
  const projectionCamera = {
    ...expectedVisualEvidenceContract.gunRange.overviewCamera,
    near: record?.presentation?.pausedPresentedCapture?.near,
    far: record?.presentation?.pausedPresentedCapture?.far,
  };
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && screenshotFrameBindingValid(record.screenshotFrameBinding, record.presentation)
    && record.fixtureContract === expectedVisualEvidenceContract.contract
    && evidenceCameraValid(record.camera, expectedVisualEvidenceContract.gunRange.overviewCamera)
    && capturePresentationValid(
      record.presentation,
      expectedVisualEvidenceContract.gunRange.overviewCamera,
      'gun-range',
      expectedActors,
    )
    && Array.isArray(record.lineOfSight)
    && record.lineOfSight.length === expectedDummyIds.length
    && record.lineOfSight.every((lineOfSight, index) => lineOfSightValid(
      lineOfSight,
      { kind: 'training-dummy', id: expectedDummyIds[index] },
      'gun-range',
      record.presentation,
      record.framing?.[index],
    ))
    && Array.isArray(record.framing)
    && record.framing.length === expectedDummyIds.length
    && record.framing.every((framing, index) => framingValid(
      framing,
      { kind: 'training-dummy', id: expectedDummyIds[index] },
      overviewRoiNdc,
      projectionCamera,
      expectedVisualEvidenceContract.gunRange.dummies[index].actor.position,
      expectedVisualEvidenceContract.gunRange.dummies[index].actor.yaw,
      record.presentation,
    ));
}

function distinctScreenshotHashes(records) {
  return Array.isArray(records)
    && records.length === 9
    && records.every((record) => /^[a-f0-9]{64}$/u.test(record?.sha256 ?? ''))
    && new Set(records.map((record) => record.sha256)).size === records.length;
}

function strictlyIncreasingCaptureRevisions(records) {
  return Array.isArray(records)
    && records.length > 0
    && records.every((record) => Number.isSafeInteger(record?.presentation?.requestedRevision))
    && records.every((record, index) => (
      index === 0 || record.presentation.requestedRevision > records[index - 1].presentation.requestedRevision
    ));
}

function armedActorIdentityValid(armedBot) {
  const actorId = armedBot?.id;
  return typeof actorId === 'string' && actorId.length > 0
    && armedBot.fixedFixture?.placement?.placement?.bot?.id === actorId
    && armedBot.first?.id === actorId
    && armedBot.second?.id === actorId
    && armedBot.fixedFixture?.stagedBot?.id === actorId
    && armedBot.fixedFixture?.observedBotId === actorId
    && armedBot.alive === true
    && armedBot.first?.alive === true
    && armedBot.second?.alive === true
    && armedBot.fixedFixture?.observedBotAlive === true
    && armedBot.fixedFixture?.placement?.placement?.bot?.alive === true
    && armedBot.fixedFixture?.stagedBot?.alive === true
    && armedBot.weapon === 'carbine'
    && armedBot.first?.weapon === 'carbine'
    && armedBot.second?.weapon === 'carbine'
    && armedBot.fixedFixture?.placement?.placement?.bot?.weapon === 'carbine'
    && armedBot.fixedFixture?.stagedBot?.weapon === 'carbine'
    && armedBot.fixedFixture?.observedBotWeapon === 'carbine';
}

function armedBotPlacementStabilityValid(armedBot) {
  const fixedFixture = armedBot?.fixedFixture;
  const expectedPosition = fixedFixture?.derivedBotPosition;
  const expectedYaw = fixedFixture?.derivedBotYaw;
  const epsilon = expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM;
  const samples = [
    fixedFixture?.placement?.placement?.bot?.logicalPosition,
    armedBot?.first?.position,
    armedBot?.second?.position,
    fixedFixture?.stagedBot?.position,
    fixedFixture?.observedBotPosition,
  ];
  const yaws = [
    fixedFixture?.placement?.placement?.bot?.rootYaw,
    armedBot?.first?.rootYaw,
    armedBot?.second?.rootYaw,
    fixedFixture?.stagedBot?.rootYaw,
    fixedFixture?.observedBotYaw,
  ];
  return finiteVector(expectedPosition) && Number.isFinite(expectedYaw)
    && nonnegativeSafeInteger(fixedFixture?.stagedBot?.presentedGameplayFrame)
    && fixedFixture.stagedBot.presentedGameplayFrame === fixedFixture.stagedPlayer?.presentedGameplayFrame
    && fixedFixture.stagedBot.presentedGameplayFrame > fixedFixture.placement?.postFrame
    && samples.every((position) => finiteVector(position) && position.every((value, axis) => (
      close(value, expectedPosition[axis], epsilon)
    )))
    && yaws.every((yaw) => wrappedAngleDelta(yaw, expectedYaw) <= epsilon);
}

function dummyActorIdentityValid(entry, expectedId) {
  return entry?.id === expectedId
    && entry.definition?.id === expectedId
    && entry.first?.id === expectedId
    && entry.second?.id === expectedId
    && entry.first?.kind === 'training-dummy'
    && entry.second?.kind === 'training-dummy'
    && entry.first?.active === true
    && entry.second?.active === true
    && entry.definition?.armed === false
    && entry.first?.armed === false
    && entry.second?.armed === false;
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

function handBindFloorValidationFailures(floor, curlBone, actualBone, expected) {
  const failures = [];
  const add = (reason, passed) => { if (passed !== true) failures.push(reason); };
  const productFloor = carbineSecondPhalanxProductFloors[expected.digit];
  add('product-floor-margin', productFloor > expected.minimumBindRadians);
  add('contract', floor?.contract === 'post-mixer-authored-bind-relative-hand-floor-v1');
  add('allocation-contract', floor?.allocationContract === 'persistent-per-rendered-hand-bone-v1');
  add('generation', Number.isInteger(floor?.generation) && floor.generation >= 1);
  add('reference', floor?.reference === 'immutable-authored-handBindPose-before-animation');
  add('side', floor?.side === expected.side);
  add('digit', floor?.digit === expected.digit);
  add('source-bone', floor?.sourceBone === expected.sourceBone);
  add('bone', floor?.bone === expected.bone);
  add('minimum-floor', floor?.minimumBindDeltaRadians === productFloor);
  add('bind-quaternion-shape', finiteVector(floor?.bindLocalQuaternion, 4));
  add('before-quaternion-shape', finiteVector(floor?.beforeLocalQuaternion, 4));
  add('after-quaternion-shape', finiteVector(floor?.afterLocalQuaternion, 4));
  add('applied-axis-shape', finiteVector(floor?.appliedAxis));
  if (failures.length > 0) return failures;
  add('bind-quaternion-norm', close(vectorLength(floor.bindLocalQuaternion), 1, 1e-7));
  add('before-quaternion-norm', close(vectorLength(floor.beforeLocalQuaternion), 1, 1e-5));
  add('after-quaternion-norm', close(vectorLength(floor.afterLocalQuaternion), 1, 1e-5));
  add('applied-axis-norm', close(vectorLength(floor.appliedAxis), 1, 1e-7));
  add('alignment-flag', typeof floor.alignedObservedAxisHemisphere === 'boolean');
  add('rendered-bone-application', floor.appliedToRenderedBone === true);
  add('finite-flag', floor.allFinite === true);
  add('before-delta-finite', Number.isFinite(floor.beforeBindDeltaRadians));
  add('after-delta-finite', Number.isFinite(floor.afterBindDeltaRadians));
  add('reported-correction-finite', Number.isFinite(floor.reportedBindDeltaCorrectionRadians));
  add('rendered-correction-finite', Number.isFinite(floor.renderedOrientationCorrectionRadians));
  if (failures.length > 0) return failures;

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
  add('canonical-bind-relative-pose', bindRelativePose !== null);
  if (!bindRelativePose) return failures;
  const observedAxisValid = bindRelativePose.axis !== null
    && floor.observedShortestRelativeAxis !== null
    && finiteVector(floor.observedShortestRelativeAxis)
    && close(vectorLength(floor.observedShortestRelativeAxis), 1, 1e-7)
    && floor.observedShortestRelativeAxis.reduce(
      (sum, value, index) => sum + value * bindRelativePose.axis[index], 0,
    ) >= 1 - 1e-7;
  add('observed-axis-presence', (bindRelativePose.axis === null) === (floor.observedShortestRelativeAxis === null));
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
  add('expected-after-quaternion', expectedAfter !== null);
  if (!expectedAfter) return failures;
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
  add('axis-provenance', axisProvenanceValid);
  add('constructed-after-quaternion', independentlyConstructedAfterValid);
  add('scalar-telemetry', scalarTelemetryValid);
  add('intervention-semantics', interventionValid);
  add('curl-floor-binding', curlBoneValid);
  add('rendered-hand-bone-binding', actualBoneValid);
  return failures;
}

function handBindFloorValid(floor, curlBone, actualBone, expected) {
  return handBindFloorValidationFailures(floor, curlBone, actualBone, expected).length === 0;
}

function fingerCurlValidationFailures(grip, model, prefix = 'fingerCurl') {
  const failures = [];
  const add = (reason, passed) => { if (passed !== true) failures.push(`${prefix}.${reason}`); };
  const curl = grip?.fingerCurl;
  add('contract', curl?.contract === 'pass65-evaluated-per-digit-grip-curl-v3');
  add('source-reference', curl?.sourceReferenceAvailable === true);
  add('expected-bone-count', curl?.expectedBoneCount === expectedHandBones.length);
  add('both-hands', curl?.bothHands === true);
  add('all-at-or-above-floor', curl?.allAtOrAboveRequiredBindFloor === true);
  add('all-applied', curl?.allApplied === true);
  add('curl-bones-count', Array.isArray(curl?.bones) && curl.bones.length === expectedHandBones.length);
  add('bind-floors-count', Array.isArray(curl?.bindFloors) && curl.bindFloors.length === expectedHandBones.length);
  add('rendered-hand-bones-count', Array.isArray(model?.handPose?.bones)
    && model.handPose.bones.length === expectedHandBones.length);
  if (failures.length > 0) return failures;
  for (let index = 0; index < expectedHandBones.length; index += 1) {
    const expected = expectedHandBones[index];
    const bonePrefix = `${prefix}.${expected.side}.${expected.digit}.${expected.bone}`;
    failures.push(...handBindFloorValidationFailures(
      curl.bindFloors[index], curl.bones[index], model.handPose.bones[index], expectedHandBones[index],
    ).map((reason) => `${bonePrefix}.${reason}`));
  }
  const rightPinkyIndex = expectedHandBones.findIndex(({ side, digit }) => side === 'right' && digit === 'pinky');
  add('right-pinky-alias', rightPinkyIndex >= 0
    && sameObject(curl.rightPinkyBindFloor, curl.bindFloors[rightPinkyIndex]));
  return failures;
}

function fingerCurlValid(grip, model) {
  return fingerCurlValidationFailures(grip, model).length === 0;
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
  const placementDerived = deriveBotPlacement(
    receipt.armedBot?.fixedFixture?.placement?.placement?.sourcePlayer?.position,
    receipt.armedBot?.fixedFixture?.placement?.placement?.sourcePlayer?.yaw,
    receipt.armedBot?.fixedFixture?.placement?.placement,
  );
  const derivedRootPosition = placementDerived?.rootPosition;
  const derivedRootYaw = placementDerived?.rootYaw;
  const expectedCaptureRois = {
    close: closeRoiNdc, hand: handRoiNdc, medium: mediumRoiNdc, overview: overviewRoiNdc,
  };

  add('receipt.schemaVersion', receipt.schemaVersion === 8);
  add('receipt.status', receipt.status === 'AUTOMATION_PASS_OWNER_PENDING');
  add('receipt.contract', receipt.contract === 'atomic-acres/pass69-3-rigged-bot-live@8');
  add('receipt.evidenceScope', receipt.evidenceScope
    === 'weighted-skin-anti-t-five-digit-grip-orientation-fixed-grounded-convergence-los-committed-frame-and-hand-detail-framing');
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
  add('receipt.visualEvidenceContract', sameObject(
    receipt.visualEvidenceContract, expectedVisualEvidenceContract,
  ));
  add('receipt.visualReview.required', receipt.visualReview?.required === true);
  add('receipt.visualReview.status', receipt.visualReview?.status === 'PENDING_OWNER_INSPECTION');
  add('receipt.visualReview.automatedFramingIsNotVisualAcceptance',
    receipt.visualReview?.automatedFramingIsNotVisualAcceptance === true);
  add('receipt.visualReview.worldLayoutLosDoesNotProveActorSelfOcclusion',
    receipt.visualReview?.worldLayoutLosDoesNotProveActorSelfOcclusion === true);
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
  add('receipt.armedBot.identityContinuity', armedActorIdentityValid(receipt.armedBot));
  const firstOperatorModel = receipt.armedBot?.first?.operatorModel;
  const secondOperatorModel = receipt.armedBot?.second?.operatorModel;
  const firstCurlPrefix = 'receipt.armedBot.first.operatorModel.supportGrip.fingerCurl';
  const secondCurlPrefix = 'receipt.armedBot.second.operatorModel.supportGrip.fingerCurl';
  const firstCurlFailures = fingerCurlValidationFailures(
    firstOperatorModel?.supportGrip, firstOperatorModel, firstCurlPrefix,
  );
  const secondCurlFailures = fingerCurlValidationFailures(
    secondOperatorModel?.supportGrip, secondOperatorModel, secondCurlPrefix,
  );
  add('receipt.armedBot.first.operatorModel', armPoseValid(firstOperatorModel, true));
  add('receipt.armedBot.second.operatorModel', armPoseValid(secondOperatorModel, true));
  add(firstCurlPrefix, firstCurlFailures.length === 0);
  for (const failure of firstCurlFailures) add(failure, false);
  add(secondCurlPrefix, secondCurlFailures.length === 0);
  for (const failure of secondCurlFailures) add(failure, false);
  add('receipt.armedBot.motion', motionValid(
    receipt.armedBot?.first, receipt.armedBot?.second, receipt.armedBot?.motion, false,
  ));
  add('receipt.armedBot.fixedFixture.definition', sameObject(
    receipt.armedBot?.fixedFixture?.definition, expectedVisualEvidenceContract.atomic,
  ));
  add('receipt.armedBot.fixedFixture.playerConvergence', atomicPlayerConvergenceValid(
    receipt.armedBot?.fixedFixture,
    receipt.armedBot?.screenshots?.medium?.presentation?.committed?.frame,
  ));
  add('receipt.armedBot.fixedFixture.placement', atomicBotPlacementValid(
    receipt.armedBot?.fixedFixture,
  ));
  add('receipt.armedBot.fixedFixture.stability', armedBotPlacementStabilityValid(receipt.armedBot));
  add('receipt.armedBot.fixedFixture.observedBotPosition',
    finiteVector(derivedRootPosition)
      && finiteVector(receipt.armedBot?.fixedFixture?.observedBotPosition)
      && receipt.armedBot.fixedFixture.observedBotPosition.every((value, axis) => close(
        value, derivedRootPosition[axis], expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM,
      )));
  add('receipt.armedBot.fixedFixture.observedBotYaw', wrappedAngleDelta(
    receipt.armedBot?.fixedFixture?.observedBotYaw,
    derivedRootYaw,
  ) <= expectedVisualEvidenceContract.atomic.placement.arithmeticEpsilonM);
  add('receipt.armedBot.screenshots.medium', screenshotValid(
    receipt.armedBot?.screenshots?.medium,
    `${evidenceBase}/armed-live-bot-medium.png`, armedActor, mediumRoiNdc,
    expectedVisualEvidenceContract.atomic.mediumCamera, 'atomic-acres',
    derivedRootPosition,
    derivedRootYaw,
  ));
  add('receipt.armedBot.screenshots.close', screenshotValid(
    receipt.armedBot?.screenshots?.close,
    `${evidenceBase}/armed-live-bot-close.png`, armedActor, closeRoiNdc,
    expectedVisualEvidenceContract.atomic.closeCamera, 'atomic-acres',
    derivedRootPosition,
    derivedRootYaw,
    true,
  ));
  add('receipt.armedBot.screenshots.leftHand', handScreenshotValid(
    receipt.armedBot?.screenshots?.leftHand,
    `${evidenceBase}/armed-live-bot-left-hand-close.png`, armedActor, 'left',
    receipt.armedBot?.screenshots?.close,
    derivedRootPosition,
    derivedRootYaw,
  ));
  add('receipt.armedBot.screenshots.rightHand', handScreenshotValid(
    receipt.armedBot?.screenshots?.rightHand,
    `${evidenceBase}/armed-live-bot-right-hand-close.png`, armedActor, 'right',
    receipt.armedBot?.screenshots?.close,
    derivedRootPosition,
    derivedRootYaw,
  ));
  add('receipt.armedBot.screenshots.revisionsStrictlyIncrease', strictlyIncreasingCaptureRevisions([
    receipt.armedBot?.screenshots?.medium,
    receipt.armedBot?.screenshots?.close,
    receipt.armedBot?.screenshots?.leftHand,
    receipt.armedBot?.screenshots?.rightHand,
  ]));

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
    add(`${prefix}.identity`, dummyActorIdentityValid(entry, id));
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
    add(`${prefix}.fixedFixture`, sameObject(
      entry?.fixedFixture, expectedVisualEvidenceContract.gunRange.dummies[index],
    ));
    add(`${prefix}.fixedActor`, entry?.fixedActor?.id === id
      && finiteVector(entry.fixedActor.position)
      && entry.fixedActor.position.every((value, axis) => close(
        value, expectedVisualEvidenceContract.gunRange.dummies[index].actor.position[axis], 1e-8,
      ))
      && close(entry.fixedActor.yaw, expectedVisualEvidenceContract.gunRange.dummies[index].actor.yaw, 1e-8)
      && entry.fixedActor.frame === entry.closeScreenshot?.presentation?.pausedPresentedCapture?.frame
      && entry.fixedActor.captureRevision === entry.closeScreenshot?.presentation?.requestedRevision);
    add(`${prefix}.closeScreenshot`, screenshotValid(
      entry?.closeScreenshot,
      `${evidenceBase}/${id}-close.png`, { kind: 'training-dummy', id }, closeRoiNdc,
      expectedVisualEvidenceContract.gunRange.dummies[index].camera, 'gun-range',
      expectedVisualEvidenceContract.gunRange.dummies[index].actor.position,
      expectedVisualEvidenceContract.gunRange.dummies[index].actor.yaw,
      true,
    ));
  }
  add('receipt.gunRangeDummies.screenshotRevisionsStrictlyIncrease', strictlyIncreasingCaptureRevisions([
    receipt.gunRangeDummies?.overviewScreenshot,
    ...(receipt.gunRangeDummies?.entries ?? []).map((entry) => entry.closeScreenshot),
  ]));
  add('receipt.screenshots.allExpectedHashesDistinct', distinctScreenshotHashes([
    receipt.armedBot?.screenshots?.medium,
    receipt.armedBot?.screenshots?.close,
    receipt.armedBot?.screenshots?.leftHand,
    receipt.armedBot?.screenshots?.rightHand,
    receipt.gunRangeDummies?.overviewScreenshot,
    ...(receipt.gunRangeDummies?.entries ?? []).map((entry) => entry.closeScreenshot),
  ]));
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
  const diagnosticTestRoot = mkdtempSync(resolve(tmpdir(), 'atomic-acres-invalid-receipt-'));
  try {
    const diagnosticTestSource = resolve(diagnosticTestRoot, 'receipt.json');
    writeFileSync(diagnosticTestSource, '{"status":"INVALID_DIAGNOSTIC_FIXTURE"}\n', 'utf8');
    const firstDiagnostic = persistInvalidDiagnosticReceipt(
      diagnosticTestSource, diagnosticTestRoot, target.renderer, 'a'.repeat(40),
    );
    const pinnedDiagnosticTime = new Date('2001-01-01T00:00:00.000Z');
    utimesSync(firstDiagnostic.path, pinnedDiagnosticTime, pinnedDiagnosticTime);
    const pinnedMtimeMs = statSync(firstDiagnostic.path).mtimeMs;
    const secondDiagnostic = persistInvalidDiagnosticReceipt(
      diagnosticTestSource, diagnosticTestRoot, target.renderer, 'a'.repeat(40),
    );
    assert(firstDiagnostic.path !== receiptPath
      && firstDiagnostic.path.includes('INVALID-diagnostics')
      && firstDiagnostic.path.includes(firstDiagnostic.sha256)
      && firstDiagnostic.reusedExisting === false
      && secondDiagnostic.path === firstDiagnostic.path
      && secondDiagnostic.sha256 === firstDiagnostic.sha256
      && secondDiagnostic.reusedExisting === true
      && statSync(firstDiagnostic.path).mtimeMs === pinnedMtimeMs
      && readFileSync(firstDiagnostic.path).equals(readFileSync(diagnosticTestSource)),
    'repeated same-source invalid receipt reuses one content-addressed exact object without overwrite');
  } finally {
    rmSync(diagnosticTestRoot, { recursive: true, force: true });
  }
  const distinctHashFixtures = Array.from({ length: 9 }, (_, index) => ({
    sha256: index.toString(16).padStart(64, '0'),
  }));
  assert(distinctScreenshotHashes(distinctHashFixtures), 'nine materially different capture hashes must pass');
  distinctHashFixtures[8].sha256 = distinctHashFixtures[0].sha256;
  assert(!distinctScreenshotHashes(distinctHashFixtures), 'duplicated/stuck compositor screenshot hash must fail');
  const revisionFixtures = [1, 2, 3, 4].map((requestedRevision) => ({ presentation: { requestedRevision } }));
  assert(strictlyIncreasingCaptureRevisions(revisionFixtures), 'strictly increasing capture revisions must pass');
  revisionFixtures[2].presentation.requestedRevision = 2;
  assert(!strictlyIncreasingCaptureRevisions(revisionFixtures), 'reused camera revision in a capture sequence must fail');
  const armedIdentity = {
    id: 'bot-1',
    alive: true,
    weapon: 'carbine',
    first: { id: 'bot-1', alive: true, weapon: 'carbine' },
    second: { id: 'bot-1', alive: true, weapon: 'carbine' },
    fixedFixture: {
      placement: { placement: { bot: { id: 'bot-1', alive: true, weapon: 'carbine' } } },
      stagedBot: { id: 'bot-1', alive: true, weapon: 'carbine' },
      observedBotId: 'bot-1', observedBotAlive: true, observedBotWeapon: 'carbine',
    },
  };
  assert(armedActorIdentityValid(armedIdentity), 'one alive armed actor identity across every sample must pass');
  const swappedArmedIdentity = structuredClone(armedIdentity);
  swappedArmedIdentity.second.id = 'bot-2';
  assert(!armedActorIdentityValid(swappedArmedIdentity), 'swapped armed actor identity must fail');
  const dummyIdentity = {
    id: 'test-dummy-alpha',
    definition: { id: 'test-dummy-alpha', armed: false },
    first: { id: 'test-dummy-alpha', kind: 'training-dummy', active: true, armed: false },
    second: { id: 'test-dummy-alpha', kind: 'training-dummy', active: true, armed: false },
  };
  assert(dummyActorIdentityValid(dummyIdentity, 'test-dummy-alpha'),
    'one active unarmed dummy identity across every sample must pass');
  const inactiveDummyIdentity = structuredClone(dummyIdentity);
  inactiveDummyIdentity.second.active = false;
  assert(!dummyActorIdentityValid(inactiveDummyIdentity, 'test-dummy-alpha'),
    'inactive or swapped dummy identity must fail');
  const makeAtomicPlayerFixture = (mutate = () => {}) => {
    const anchor = [...expectedVisualEvidenceContract.atomic.settlementPositionAnchor];
    const samples = Array.from({ length: 9 }, (_, index) => ({
      presentedGameplayFrame: 101 + index,
      atMs: 1_000 + index * 8,
      position: [...anchor],
      grounded: true,
    }));
    const fixture = {
      commandedPlayer: {
        presentedGameplayFrame: 100,
        position: [...expectedVisualEvidenceContract.atomic.commandedPlayerPosition],
        yaw: expectedVisualEvidenceContract.atomic.playerYaw,
        grounded: false,
      },
      convergence: {
        contract: expectedVisualEvidenceContract.atomic.settlement.contract,
        positionAnchor: anchor,
        samples,
        transitionCount: 8,
        durationMs: 0,
        maximumObservedAxisDeltaM: 0,
        maximumObservedAxisSpanM: [0, 0, 0],
        maximumObservedAbsoluteAxisErrorM: [0, 0, 0],
        allGrounded: true,
      },
      placement: {
        preFrame: 110,
        postFrame: 110,
        prePlayer: {
          position: [...anchor],
          yaw: expectedVisualEvidenceContract.atomic.playerYaw,
          grounded: true,
        },
        placement: {
          contract: expectedVisualEvidenceContract.atomic.placement.contract,
          source: expectedVisualEvidenceContract.atomic.placement.source,
          requestedDistanceM: expectedVisualEvidenceContract.atomic.placement.distanceM,
          stagedDistanceM: expectedVisualEvidenceContract.atomic.placement.distanceM,
          yawOffsetRadians: expectedVisualEvidenceContract.atomic.placement.requiredYawOffsetRadians,
          presentedGameplayFrameAtCommand: 110,
          sourcePlayer: {
            position: [...anchor],
            yaw: expectedVisualEvidenceContract.atomic.playerYaw,
            grounded: true,
          },
          bot: {
            id: 'bot-1',
            logicalPosition: [...expectedVisualEvidenceContract.atomic.nominalBotPosition],
            rootPosition: [...expectedVisualEvidenceContract.atomic.nominalBotPosition],
            rootYaw: expectedVisualEvidenceContract.atomic.expectedBotYaw,
            alive: true,
            weapon: 'carbine',
          },
        },
      },
      derivedBotPosition: [...expectedVisualEvidenceContract.atomic.nominalBotPosition],
      derivedBotYaw: expectedVisualEvidenceContract.atomic.expectedBotYaw,
      stagedPlayer: {
        presentedGameplayFrame: 120,
        position: [...anchor],
        yaw: expectedVisualEvidenceContract.atomic.playerYaw,
        grounded: true,
      },
      stagedBot: {
        presentedGameplayFrame: 120,
        position: [...expectedVisualEvidenceContract.atomic.nominalBotPosition],
        rootYaw: expectedVisualEvidenceContract.atomic.expectedBotYaw,
        id: 'bot-1', alive: true, weapon: 'carbine',
      },
    };
    mutate(fixture);
    fixture.convergence.durationMs = samples.at(-1).atMs - samples[0].atMs;
    fixture.convergence.maximumObservedAxisDeltaM = Math.max(...samples.slice(1).map((sample, index) => (
      maximumAxisDelta(sample.position, samples[index].position)
    )));
    fixture.convergence.maximumObservedAxisSpanM = [0, 1, 2].map((axis) => {
      const values = samples.map((sample) => sample.position[axis]);
      return Math.max(...values) - Math.min(...values);
    });
    fixture.convergence.maximumObservedAbsoluteAxisErrorM = [0, 1, 2].map((axis) => Math.max(
      ...samples.map((sample) => Math.abs(sample.position[axis] - anchor[axis])),
    ));
    fixture.convergence.allGrounded = samples.every((sample) => sample.grounded);
    return fixture;
  };
  const validAtomicPlayerConvergence = (fixture) => atomicPlayerConvergenceValid(fixture, 121);
  const validAtomicBotPlacement = (fixture) => atomicBotPlacementValid(fixture);
  assert(validAtomicBotPlacement(makeAtomicPlayerFixture()),
    'same-turn placement independently derives the fixed forward root and facing yaw');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.prePlayer.position[0] += 0.00025;
    fixture.placement.placement.sourcePlayer.position[0] += 0.00025;
  })), 'shifted player with stale nominal bot and derived fields must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.placement.stagedDistanceM = 5.1;
  })), 'wrong staged distance must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.placement.bot.logicalPosition[1] = 0.0000000011;
    fixture.placement.placement.bot.rootPosition[1] = 0.0000000011;
  })), 'wrong root Y beyond the tight arithmetic epsilon must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.placement.yawOffsetRadians = Math.PI / 8;
  })), 'fallback bearing must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.placement.bot.rootYaw += 0.0000000011;
  })), 'wrong placement root yaw must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.postFrame += 1;
  })), 'placement whose presented frontier changes during the synchronous task must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.preFrame = fixture.convergence.samples.at(-1).presentedGameplayFrame;
    fixture.placement.postFrame = fixture.placement.preFrame;
    fixture.placement.placement.presentedGameplayFrameAtCommand = fixture.placement.preFrame;
  })), 'placement at or before the final convergence frame must fail');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.placement.placement.sourcePlayer.position = [fixture.placement.prePlayer.position[0], 1.7];
  })), 'malformed placement source vector must fail closed');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.derivedBotPosition[0] += 0.0000000011;
  })), 'forged derived placement summary must fail independent recomputation');
  assert(!validAtomicBotPlacement(makeAtomicPlayerFixture((fixture) => {
    fixture.derivedBotYaw = Number.NaN;
  })), 'non-finite derived yaw must fail closed');
  const makeStableArmedBot = () => {
    const fixedFixture = makeAtomicPlayerFixture();
    const position = [...fixedFixture.derivedBotPosition];
    const rootYaw = fixedFixture.derivedBotYaw;
    return {
      id: 'bot-1', alive: true, weapon: 'carbine',
      first: { id: 'bot-1', alive: true, weapon: 'carbine', position: [...position], rootYaw },
      second: { id: 'bot-1', alive: true, weapon: 'carbine', position: [...position], rootYaw },
      fixedFixture: {
        ...fixedFixture,
        observedBotPosition: [...position], observedBotYaw: rootYaw,
        observedBotId: 'bot-1', observedBotAlive: true, observedBotWeapon: 'carbine',
      },
    };
  };
  assert(armedBotPlacementStabilityValid(makeStableArmedBot()),
    'placement, two armed samples and later staged actor remain on one derived root');
  const laterRootMismatch = makeStableArmedBot();
  laterRootMismatch.second.position[0] += 0.0000000011;
  assert(!armedBotPlacementStabilityValid(laterRootMismatch), 'later bot root mismatch must fail');
  const laterYawMismatch = makeStableArmedBot();
  laterYawMismatch.fixedFixture.stagedBot.rootYaw += 0.0000000011;
  assert(!armedBotPlacementStabilityValid(laterYawMismatch), 'later bot yaw mismatch must fail');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture()),
    'eight observed grounded presented-frame transitions over 50ms must pass');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.commandedPlayer.position[0] = 0;
  })), 'retired x=0 interior-ramp fixture must fail');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[0].presentedGameplayFrame = fixture.commandedPlayer.presentedGameplayFrame;
  })), 'a pre-command or command-frame presentation sample must fail convergence');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[0] += 0.0005; });
  })), 'horizontal absolute error at 0.0005m must pass');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[0] += 0.000501; });
  })), 'horizontal absolute error at 0.000501m must fail');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[1] += 0.00225; });
  })), 'vertical absolute error at 0.00225m must pass');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[1] += 0.002251; });
  })), 'vertical absolute error at 0.002251m must fail');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[2] += 0.0005; });
  })), 'depth absolute error at 0.0005m must pass despite representation rounding');
  for (const [axis, limit] of expectedVisualEvidenceContract.atomic.settlement.maximumAbsoluteAxisErrorM.entries()) {
    assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
      fixture.convergence.samples.forEach((sample) => { sample.position[axis] += limit + 1e-9; });
    })), `axis ${axis} absolute error 1e-9m beyond its boundary must fail`);
  }
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[1] = 1.700099; });
  })), 'warmed grounded y=1.700099m must pass the command-anchored vertical envelope');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[1] = 1.698398; });
  })), 'cold grounded y=1.698398m must pass the command-anchored vertical envelope');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample) => { sample.position[1] = 1.697749; });
  })), 'wrong grounded hover outside the vertical command envelope must fail');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[0].position[1] += 0.002251;
  })), 'an earlier out-of-envelope sample cannot be hidden by a final in-envelope sample');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[3].position[0] -= 0.0005;
    fixture.convergence.samples[4].position[0] += 0.000001;
  })), 'one player transition above 0.0005m must fail');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample, index) => {
      sample.position[1] -= 0.00225 - index * 0.00049;
    });
  })), 'monotonic in-envelope 0.00049m drift must fail the 0.0005m accepted-window span');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[4].presentedGameplayFrame = fixture.convergence.samples[3].presentedGameplayFrame;
  })), 'a reused presented frame must fail convergence');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[4].presentedGameplayFrame = fixture.convergence.samples[3].presentedGameplayFrame - 1;
  })), 'a reversed presented frame must fail convergence');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample, index) => {
      if (index >= 4) sample.presentedGameplayFrame += 1;
    });
  })), 'a strictly increasing WebGPU presentation gap must pass convergence');
  assert(validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample, index) => { sample.atMs = 1_000 + index * 6.25; });
  })), 'an exact 50ms convergence window must pass');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples.forEach((sample, index) => { sample.atMs = 1_000 + index * 6; });
  })), 'a convergence window shorter than 50ms must fail');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[4].grounded = false;
  })), 'an ungrounded player sample must fail convergence');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.stagedPlayer.position[0] += 0.000501;
  })), 'the later staged player must independently satisfy the horizontal envelope');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.stagedPlayer.position[1] += 0.002251;
  })), 'the later staged player must independently satisfy the vertical envelope');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.stagedPlayer.position = [fixture.stagedPlayer.position[0], fixture.stagedPlayer.position[1]];
  })), 'a malformed staged-player vector must fail closed');
  const malformedAxisMaximum = makeAtomicPlayerFixture();
  malformedAxisMaximum.convergence.maximumObservedAbsoluteAxisErrorM = [0, 0];
  assert(!validAtomicPlayerConvergence(malformedAxisMaximum),
    'a malformed per-axis receipt maximum must fail closed');
  const forgedAxisMaximum = makeAtomicPlayerFixture();
  forgedAxisMaximum.convergence.maximumObservedAbsoluteAxisErrorM[1] = 0.000001;
  assert(!validAtomicPlayerConvergence(forgedAxisMaximum),
    'a forged correct-length per-axis receipt maximum must fail recomputation');
  const forgedAxisSpan = makeAtomicPlayerFixture();
  forgedAxisSpan.convergence.maximumObservedAxisSpanM[1] += 0.000001;
  assert(!validAtomicPlayerConvergence(forgedAxisSpan),
    'a forged per-axis span summary must fail recomputation');
  const negativeTelemetry = makeAtomicPlayerFixture();
  negativeTelemetry.convergence.maximumObservedAxisDeltaM = -0.0000000005;
  negativeTelemetry.convergence.maximumObservedAxisSpanM[1] = -0.0000000005;
  negativeTelemetry.convergence.maximumObservedAbsoluteAxisErrorM[1] = -0.0000000005;
  assert(!validAtomicPlayerConvergence(negativeTelemetry),
    'negative near-zero convergence telemetry must fail closed');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[0].presentedGameplayFrame = -1;
  })), 'negative presented gameplay frames must fail closed');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.convergence.samples[0].atMs = -1;
  })), 'negative observation times must fail closed');
  assert(!validAtomicPlayerConvergence(makeAtomicPlayerFixture((fixture) => {
    fixture.stagedPlayer.presentedGameplayFrame = fixture.convergence.samples.at(-1).presentedGameplayFrame;
  })), 'the staged player must be sampled after convergence');
  assert(!atomicPlayerConvergenceValid(makeAtomicPlayerFixture(), 120),
    'the staged player must precede the first committed Atomic capture');
  const oldFixture = makeAtomicPlayerFixture();
  delete oldFixture.placement;
  assert(!atomicPlayerConvergenceValid(oldFixture, 121), 'old placement-less fixture fails closed without throwing');
  assert(receiptValidationFailures({ schemaVersion: 7 }, '0'.repeat(40)).includes('receipt.schemaVersion'),
    'receipt schema 7 is explicitly rejected without throwing');
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
  assert(sameArray(
    fingerCurlValidationFailures(invalidGeneration, curlModel, 'receipt.armedBot.first.operatorModel.supportGrip.fingerCurl'),
    ['receipt.armedBot.first.operatorModel.supportGrip.fingerCurl.left.thumb.Thumb2L.generation'],
  ), 'one forged bind-floor field names the exact actor phase, bone, and reason');
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
  const actor = { kind: 'bot', id: 'bot-1' };
  const rootPosition = [...expectedVisualEvidenceContract.atomic.nominalBotPosition];
  const rootYaw = expectedVisualEvidenceContract.atomic.expectedBotYaw;
  const projectionCamera = {
    ...expectedVisualEvidenceContract.atomic.closeCamera,
    near: 0.1,
    far: 180,
  };
  const aspect = canvas.width / canvas.height;
  const worldForNdc = (ndc, depth = 2, cameraEvidence = projectionCamera) => {
    const cameraTangent = Math.tan(cameraEvidence.fov * Math.PI / 360);
    const cameraLocal = [
      ndc[0] * depth * cameraTangent * aspect,
      ndc[1] * depth * cameraTangent,
      -depth,
    ];
    const worldDelta = rotateVectorByQuaternion(
      cameraLocal,
      yxzCameraQuaternion(cameraEvidence.yaw, cameraEvidence.pitch),
    );
    return cameraEvidence.position.map((value, axis) => value + worldDelta[axis]);
  };
  const pixelFor = (ndc) => ({
    x: canvas.left + (ndc[0] + 1) * 0.5 * canvas.width,
    y: canvas.top + (1 - ndc[1]) * 0.5 * canvas.height,
  });
  const ndcFor = (joint) => {
    const sign = joint.side === 'left' ? -1 : 1;
    if (joint.role === 'shoulder') return [sign * 0.2, 0.32];
    if (joint.role === 'elbow') return [sign * 0.18, 0.12];
    if (joint.role === 'wrist-hand') return [sign * 0.14, -0.08];
    const digitIndex = ['thumb', 'index', 'middle', 'ring', 'pinky'].indexOf(joint.digit);
    return [sign * (0.14 + 0.018 * (digitIndex - 2)), -0.12 - 0.006 * digitIndex];
  };
  const makeProjectedJoint = (joint, ndc2, cameraEvidence = projectionCamera) => {
    const worldPosition = worldForNdc(ndc2, 2, cameraEvidence);
    const ndc = projectWorldToNdc(worldPosition, cameraEvidence, aspect);
    return {
      ...joint,
      worldPosition,
      ndc,
      pixel: pixelFor(ndc),
      withinRoi: true,
      onScreen: true,
    };
  };
  const sentinels = expectedCaptureJoints.map((joint) => makeProjectedJoint(joint, ndcFor(joint)));
  const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
  const metricsFor = (points) => {
    const armChainPixels = [];
    const wristFingerPixels = [];
    for (const side of ['left', 'right']) {
      const shoulder = points.find((joint) => joint.side === side && joint.role === 'shoulder');
      const elbow = points.find((joint) => joint.side === side && joint.role === 'elbow');
      const wrist = points.find((joint) => joint.side === side && joint.role === 'wrist-hand');
      const fingers = points.filter((joint) => joint.side === side && joint.kind === 'finger');
      armChainPixels.push({ side, pixels: distance(shoulder.pixel, elbow.pixel) + distance(elbow.pixel, wrist.pixel) });
      wristFingerPixels.push({
        side,
        fingerCount: fingers.length,
        minimumPixels: Math.min(...fingers.map((finger) => distance(wrist.pixel, finger.pixel))),
      });
    }
    return { armChainPixels, wristFingerPixels };
  };
  const findJoint = (points, side, role) => points.find((joint) => joint.side === side && joint.role === role);
  const evidenceSentinelFixture = (points) => [
    { name: 'head', bone: 'Head', present: true, worldPosition: worldForNdc([0, 0.48]) },
    { name: 'shoulder-left', bone: 'UpperArmL', present: true, worldPosition: findJoint(points, 'left', 'shoulder').worldPosition },
    { name: 'shoulder-right', bone: 'UpperArmR', present: true, worldPosition: findJoint(points, 'right', 'shoulder').worldPosition },
    { name: 'pelvis', bone: 'Hips', present: true, worldPosition: worldForNdc([0, -0.28]) },
    { name: 'wrist-left', bone: 'WristL', present: true, worldPosition: findJoint(points, 'left', 'wrist-hand').worldPosition },
    { name: 'wrist-right', bone: 'WristR', present: true, worldPosition: findJoint(points, 'right', 'wrist-hand').worldPosition },
  ];
  const makeFrameActor = (cameraEvidence, points) => {
    const projectedWorldPosition = [rootPosition[0], rootPosition[1] + 1.35, rootPosition[2]];
    return {
      actor,
      rootPosition,
      rootYaw,
      rootVisible: true,
      rootEffectivelyVisible: true,
      effectivelyVisibleMeshCount: 1,
      effectivelyVisibleSkinnedMeshes: ['Swat_Body'],
      armSkinVisible: true,
      handSkinVisible: true,
      weaponCenterWorld: [0, 1.08, -18.7],
      projectedWorldPosition,
      screenPosition: projectWorldToNdc(projectedWorldPosition, cameraEvidence, aspect),
      jointScreenPositions: points.map((joint) => structuredClone(joint)),
      evidenceSentinels: evidenceSentinelFixture(points),
    };
  };
  const makeCachedLos = (frameActor, cameraEvidence, arenaId, frame, submissionSequence) => ({
    contract: expectedVisualEvidenceContract.los.contract,
    actor,
    arenaId,
    actorSelfOcclusionExcluded: true,
    captureFrame: frame,
    captureRevision: 7,
    captureSubmissionSequence: submissionSequence,
    camera: {
      position: cameraEvidence.position,
      quaternion: yxzCameraQuaternion(cameraEvidence.yaw, cameraEvidence.pitch),
      fov: cameraEvidence.fov,
      captureRevision: 7,
    },
    renderOccluderCount: 4,
    allClear: true,
    sentinels: frameActor.evidenceSentinels.map((sentinel) => ({
      ...sentinel,
      clear: true,
      targetDistanceM: positionDelta(cameraEvidence.position, sentinel.worldPosition),
      blocker: null,
    })),
  });
  const makePresentation = (cameraEvidence, frameActor, rendererName = 'webgl2', arenaId = 'atomic-acres') => {
    const webGpu = rendererName === 'webgpu';
    const committedSubmission = webGpu ? 10 : 0;
    const pausedSubmission = webGpu ? 12 : 0;
    const makeReceipt = (frame, committedAtMs, submissionSequence, completedSequence) => ({
      contract: expectedVisualEvidenceContract.presentation.contract,
      renderer: rendererName,
      completionSemantics: expectedVisualEvidenceContract.presentation.rendererCompletion[rendererName],
      arenaId,
      frame,
      captureRevision: 7,
      committedAtMs,
      position: cameraEvidence.position,
      quaternion: yxzCameraQuaternion(cameraEvidence.yaw, cameraEvidence.pitch),
      yaw: cameraEvidence.yaw,
      pitch: cameraEvidence.pitch,
      fov: cameraEvidence.fov,
      near: cameraEvidence.near ?? 0.1,
      far: cameraEvidence.far ?? 180,
      submissionSequence,
      completedSequence,
      captureTargets: [actor],
      actors: [structuredClone(frameActor)],
      worldLayoutLineOfSight: [makeCachedLos(frameActor, cameraEvidence, arenaId, frame, submissionSequence)],
    });
    const committed = makeReceipt(100, 1_000, committedSubmission, webGpu ? 9 : 0);
    const pausedPresentedCapture = makeReceipt(103, 1_030, pausedSubmission, webGpu ? 10 : 0);
    return {
      contract: expectedVisualEvidenceContract.presentation.contract,
      order: expectedVisualEvidenceContract.presentation.order,
      fixtureCamera: {
        id: cameraEvidence.id,
        position: cameraEvidence.position,
        target: cameraEvidence.target,
        yaw: cameraEvidence.yaw,
        pitch: cameraEvidence.pitch,
        fov: cameraEvidence.fov,
      },
      priorCaptureRevision: 6,
      requestedRevision: 7,
      committed,
      pausedPresentedCapture,
      completion: {
        contract: 'renderer-presentation-completion-v1',
        required: webGpu,
        renderer: rendererName,
        semantics: expectedVisualEvidenceContract.presentation.rendererCompletion[rendererName],
        baselineSubmissionSequence: webGpu ? 9 : 0,
        baselineCompletedSequence: webGpu ? 9 : 0,
        finalPausedSubmissionSequence: pausedSubmission,
        fenceSubmissionSequence: pausedSubmission,
        fenceCompletedSequence: pausedSubmission,
        observedSubmissionSequence: pausedSubmission,
        observedCompletedSequence: pausedSubmission,
        coversFinalPausedSubmission: true,
        completedBeforeCompositorBoundaries: true,
      },
      presentedGameplayFramesAfterCommit: [101, 102],
      pausedPresentedGameplayFrame: 103,
      compositorBoundariesAfterCommit: expectedVisualEvidenceContract.presentation.compositorBoundariesAfterCommit,
      pausedAtFrameCount: 105,
    };
  };
  const screenshotBindingFor = (presentation) => {
    const point = {
      debugRenderPaused: true,
      frame: presentation.pausedPresentedCapture.frame,
      captureRevision: presentation.pausedPresentedCapture.captureRevision,
      submissionSequence: presentation.pausedPresentedCapture.submissionSequence,
      presentedGameplayFrame: presentation.pausedPresentedGameplayFrame,
    };
    return { contract: 'paused-presented-frame-screenshot-v1', stable: true, before: point, after: structuredClone(point) };
  };
  const frameActor = makeFrameActor(projectionCamera, sentinels);
  const presentation = makePresentation(projectionCamera, frameActor);
  const jointMetrics = metricsFor(sentinels);
  const framing = {
    missing: false,
    actor,
    frame: presentation.pausedPresentedCapture.frame,
    captureRevision: presentation.requestedRevision,
    rootPosition,
    rootYaw,
    projectedWorldPosition: frameActor.projectedWorldPosition,
    evidenceSentinels: frameActor.evidenceSentinels,
    roiNdc: closeRoiNdc,
    withinRoi: true,
    onScreen: true,
    rootVisible: true,
    rootEffectivelyVisible: true,
    effectivelyVisibleMeshCount: 1,
    effectivelyVisibleSkinnedMeshes: ['Swat_Body'],
    armSkinVisible: true,
    handSkinVisible: true,
    screenPosition: frameActor.screenPosition,
    canvas,
    viewport,
    projectedPixel: pixelFor(frameActor.screenPosition),
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
  const validateCloseFraming = (candidate, candidatePresentation = presentation) => framingValid(
    candidate,
    actor,
    closeRoiNdc,
    projectionCamera,
    rootPosition,
    rootYaw,
    candidatePresentation,
    true,
  );
  assert(capturePresentationValid(
    presentation, expectedVisualEvidenceContract.atomic.closeCamera, 'atomic-acres', [actor],
  ), 'submitted WebGL presentation fixture must pass');
  assert(validateCloseFraming(framing), 'complete close joint framing must pass');
  assert(screenshotFrameBindingValid(screenshotBindingFor(presentation), presentation),
    'screenshot must bind to an unchanged paused submitted frame');
  const advancedScreenshot = screenshotBindingFor(presentation);
  advancedScreenshot.after.frame += 1;
  assert(!screenshotFrameBindingValid(advancedScreenshot, presentation),
    'screenshot spanning a later gameplay frame must fail');
  const poseAdvanceBinding = screenshotBindingFor(presentation).before;
  const poseAdvanceBefore = sentinels.map((joint) => ({
    kind: joint.kind,
    side: joint.side,
    role: joint.role,
    digit: joint.digit,
    bone: joint.bone,
    worldPosition: structuredClone(joint.worldPosition),
  }));
  const poseAdvanceAfter = structuredClone(poseAdvanceBefore);
  poseAdvanceAfter[6].worldPosition[0] += 0.001;
  const poseAdvanceProof = {
    contract: 'paused-render-live-pose-advance-v1',
    actor,
    animationBoundaries: 4,
    minimumJointAdvanceM: 0.00001,
    maximumJointAdvanceM: 0.001,
    submittedFrameBinding: poseAdvanceBinding,
    before: { frameCount: 103, frameBinding: poseAdvanceBinding, joints: poseAdvanceBefore },
    after: { frameCount: 107, frameBinding: poseAdvanceBinding, joints: poseAdvanceAfter },
  };
  assert(pausedLivePoseAdvanceValid(poseAdvanceProof, actor, presentation),
    'live pose advance while submitted screenshot frame remains frozen must pass');
  const staticPoseProof = structuredClone(poseAdvanceProof);
  staticPoseProof.after.joints = structuredClone(staticPoseProof.before.joints);
  staticPoseProof.maximumJointAdvanceM = 0;
  assert(!pausedLivePoseAdvanceValid(staticPoseProof, actor, presentation),
    'static live pose cannot prove separation from the frozen submitted frame');

  const mutateJointProjection = (candidate, candidatePresentation, index, ndc2) => {
    const joint = candidate.jointDetail.sentinels[index];
    const worldPosition = worldForNdc(ndc2);
    const ndc = projectWorldToNdc(worldPosition, projectionCamera, aspect);
    Object.assign(joint, { worldPosition, ndc, pixel: pixelFor(ndc) });
    const frameJoint = candidatePresentation.pausedPresentedCapture.actors[0].jointScreenPositions[index];
    frameJoint.worldPosition = structuredClone(worldPosition);
    frameJoint.ndc = structuredClone(ndc);
  };
  const cropped = structuredClone(framing);
  const croppedPresentation = structuredClone(presentation);
  mutateJointProjection(cropped, croppedPresentation, 0, [closeRoiNdc.minX - 0.01, 0.32]);
  cropped.jointDetail.sentinels[0].withinRoi = false;
  cropped.jointDetail.sentinels[0].onScreen = false;
  cropped.jointDetail.allInsideRoi = false;
  assert(!validateCloseFraming(cropped, croppedPresentation), 'cropped/off-ROI shoulder must fail');
  const offscreen = structuredClone(framing);
  const offscreenPresentation = structuredClone(presentation);
  mutateJointProjection(offscreen, offscreenPresentation, 0, [1.01, 0.32]);
  offscreen.jointDetail.sentinels[0].withinRoi = false;
  offscreen.jointDetail.sentinels[0].onScreen = false;
  offscreen.jointDetail.allInsideRoi = false;
  assert(!validateCloseFraming(offscreen, offscreenPresentation), 'offscreen shoulder must fail');
  const forgedWorld = structuredClone(framing);
  const forgedWorldPresentation = structuredClone(presentation);
  forgedWorld.jointDetail.sentinels[6].worldPosition = [100, 100, 100];
  forgedWorldPresentation.pausedPresentedCapture.actors[0].jointScreenPositions[6].worldPosition = [100, 100, 100];
  assert(!validateCloseFraming(forgedWorld, forgedWorldPresentation),
    'forged offscreen world point with centered claimed NDC must fail');
  const advancedLivePose = structuredClone(framing);
  const advancedWorldPosition = worldForNdc([-0.12, -0.13]);
  const advancedNdc = projectWorldToNdc(advancedWorldPosition, projectionCamera, aspect);
  Object.assign(advancedLivePose.jointDetail.sentinels[6], {
    worldPosition: advancedWorldPosition,
    ndc: advancedNdc,
    pixel: pixelFor(advancedNdc),
  });
  assert(!validateCloseFraming(advancedLivePose),
    'post-render live animation pose cannot impersonate the frozen submitted actor frame');
  const tinyArm = structuredClone(framing);
  const tinyArmPresentation = structuredClone(presentation);
  mutateJointProjection(tinyArm, tinyArmPresentation, 1, [-0.199, 0.319]);
  mutateJointProjection(tinyArm, tinyArmPresentation, 2, [-0.198, 0.318]);
  Object.assign(tinyArm.jointDetail, metricsFor(tinyArm.jointDetail.sentinels));
  assert(!validateCloseFraming(tinyArm, tinyArmPresentation), 'sub-80px arm chain must fail');
  const tinyFinger = structuredClone(framing);
  const tinyFingerPresentation = structuredClone(presentation);
  const leftWrist = tinyFinger.jointDetail.sentinels.find((joint) => joint.side === 'left' && joint.role === 'wrist-hand');
  mutateJointProjection(tinyFinger, tinyFingerPresentation, 6, [leftWrist.ndc[0] + 0.001, leftWrist.ndc[1]]);
  Object.assign(tinyFinger.jointDetail, metricsFor(tinyFinger.jointDetail.sentinels));
  assert(validateCloseFraming(tinyFinger, tinyFingerPresentation),
    'full-body close framing must not impersonate hand-detail magnification');

  const sampledLineOfSight = {
    ...presentation.pausedPresentedCapture.worldLayoutLineOfSight[0],
    cameraPresentation: presentation.pausedPresentedCapture,
  };
  assert(lineOfSightValid(sampledLineOfSight, actor, 'atomic-acres', presentation, framing),
    'cached submitted-frame line of sight must pass');
  const blockedPresentation = structuredClone(presentation);
  const blockedCached = blockedPresentation.pausedPresentedCapture.worldLayoutLineOfSight[0];
  blockedCached.allClear = false;
  blockedCached.sentinels[0].clear = false;
  blockedCached.sentinels[0].blocker = { name: 'opaque-wall', distanceM: 0.5, targetDistanceM: 2 };
  const blockedSample = { ...blockedCached, cameraPresentation: blockedPresentation.pausedPresentedCapture };
  assert(!lineOfSightValid(blockedSample, actor, 'atomic-acres', blockedPresentation, framing),
    'opaque submitted-frame LOS blocker must fail');
  const mismatchedCachedPresentation = structuredClone(presentation);
  mismatchedCachedPresentation.pausedPresentedCapture.worldLayoutLineOfSight[0].allClear = false;
  const forgedClearSample = {
    ...presentation.pausedPresentedCapture.worldLayoutLineOfSight[0],
    cameraPresentation: mismatchedCachedPresentation.pausedPresentedCapture,
  };
  assert(!lineOfSightValid(forgedClearSample, actor, 'atomic-acres', mismatchedCachedPresentation, framing),
    'sampled clear LOS cannot contradict the cached submitted-frame blocker record');

  const wrongQuaternion = structuredClone(presentation);
  wrongQuaternion.pausedPresentedCapture.quaternion = [0, 0.1, 0, Math.sqrt(0.99)];
  assert(!capturePresentationValid(
    wrongQuaternion, expectedVisualEvidenceContract.atomic.closeCamera, 'atomic-acres', [actor],
  ), 'unit quaternion inconsistent with fixed yaw and pitch must fail');
  const reusedRevision = structuredClone(presentation);
  reusedRevision.priorCaptureRevision = reusedRevision.requestedRevision;
  assert(!capturePresentationValid(
    reusedRevision, expectedVisualEvidenceContract.atomic.closeCamera, 'atomic-acres', [actor],
  ), 'reused capture-camera revision must fail');
  const webGpuPresentation = makePresentation(projectionCamera, frameActor, 'webgpu');
  assert(capturePresentationValid(
    webGpuPresentation, expectedVisualEvidenceContract.atomic.closeCamera, 'atomic-acres', [actor], 'webgpu',
  ), 'final paused WebGPU submission covered by explicit completion fence must pass');
  const staleWebGpuPresentation = structuredClone(webGpuPresentation);
  staleWebGpuPresentation.completion.fenceCompletedSequence = 10;
  staleWebGpuPresentation.completion.observedCompletedSequence = 10;
  assert(!capturePresentationValid(
    staleWebGpuPresentation, expectedVisualEvidenceContract.atomic.closeCamera, 'atomic-acres', [actor], 'webgpu',
  ), 'completion covering only the earlier committed WebGPU frame must fail');
  const impossibleWebGpuCompletion = structuredClone(webGpuPresentation);
  impossibleWebGpuCompletion.completion.fenceCompletedSequence = 13;
  assert(!capturePresentationValid(
    impossibleWebGpuCompletion, expectedVisualEvidenceContract.atomic.closeCamera,
    'atomic-acres', [actor], 'webgpu',
  ), 'WebGPU fence completion beyond its paired submission must fail');

  const sourceScreenshot = {
    camera: expectedVisualEvidenceContract.atomic.closeCamera,
    presentation,
    framing,
    screenshotFrameBinding: screenshotBindingFor(presentation),
  };
  const handFramingFixture = (side) => {
    const expectedHand = expectedHandCaptureJoints(side);
    const sourceSentinels = expectedHand.map((wanted) => {
      const sourceJoint = frameActor.jointScreenPositions.find((joint) => (
        joint.kind === wanted.kind && joint.side === wanted.side && joint.role === wanted.role
          && joint.digit === wanted.digit && joint.bone === wanted.bone
      ));
      return { ...wanted, worldPosition: structuredClone(sourceJoint.worldPosition) };
    });
    const sourceWeaponCenterWorld = structuredClone(frameActor.weaponCenterWorld);
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
    const fixtureCamera = {
      id: `armed-live-bot-${side}-fixed-hand-detail`,
      position: positionWorld,
      target: targetWorld,
      yaw: Math.atan2(-aim[0], -aim[2]),
      pitch: Math.atan2(aim[1], Math.hypot(aim[0], aim[2])),
      fov: handCameraContract.fovDegrees,
    };
    const handProjectionCamera = { ...fixtureCamera, near: 0.1, far: 180 };
    const handPoints = expectedCaptureJoints.map((joint, index) => {
      const worldPosition = structuredClone(frameActor.jointScreenPositions[index].worldPosition);
      const ndc = projectWorldToNdc(worldPosition, handProjectionCamera, aspect);
      return { ...joint, worldPosition, ndc };
    });
    const handFrameActor = makeFrameActor(handProjectionCamera, handPoints);
    const handPresentation = makePresentation(handProjectionCamera, handFrameActor);
    const handSentinels = handFrameActor.jointScreenPositions
      .filter((joint) => joint.side === side && (joint.role === 'wrist-hand' || joint.kind === 'finger'))
      .map((joint) => ({
        ...structuredClone(joint),
        pixel: pixelFor(joint.ndc),
        withinRoi: joint.ndc[0] >= handRoiNdc.minX && joint.ndc[0] <= handRoiNdc.maxX
          && joint.ndc[1] >= handRoiNdc.minY && joint.ndc[1] <= handRoiNdc.maxY,
        onScreen: Math.abs(joint.ndc[0]) <= 1 && Math.abs(joint.ndc[1]) <= 1,
      }));
    const fingerSpans = handSentinels.slice(1).map((finger) => ({
      digit: finger.digit,
      bone: finger.bone,
      pixels: distance(handSentinels[0].pixel, finger.pixel),
    }));
    const cameraEvidence = {
      ...handCameraContract,
      actor,
      side,
      source: 'armed-close-submitted-frame-weapon-center-and-rigged-joint-world-transforms',
      sourceFrameBinding: {
        contract: 'armed-close-submitted-actor-source-v1',
        cameraId: sourceScreenshot.camera.id,
        frame: presentation.pausedPresentedCapture.frame,
        captureRevision: presentation.pausedPresentedCapture.captureRevision,
        submissionSequence: presentation.pausedPresentedCapture.submissionSequence,
        actor,
      },
      sourceWeaponCenterWorld,
      sourceSentinels,
      outsideDirectionWorld,
      targetWorld,
      positionWorld,
      yaw: fixtureCamera.yaw,
      pitch: fixtureCamera.pitch,
      fixtureCamera,
    };
    return {
      framing: {
        actor,
        side,
        frame: handPresentation.pausedPresentedCapture.frame,
        captureRevision: handPresentation.requestedRevision,
        missing: false,
        rootPosition,
        rootYaw,
        projectedWorldPosition: handFrameActor.projectedWorldPosition,
        evidenceSentinels: handFrameActor.evidenceSentinels,
        rootVisible: true,
        rootEffectivelyVisible: true,
        effectivelyVisibleMeshCount: 1,
        effectivelyVisibleSkinnedMeshes: ['Swat_Body'],
        handSkinVisible: true,
        canvas,
        viewport,
        roiNdc: handRoiNdc,
        camera: cameraEvidence,
        handDetail: {
          required: true,
          side,
          expectedSentinelCount: 6,
          sentinels: handSentinels,
          orderValid: true,
          allInsideRoi: handSentinels.every((joint) => joint.withinRoi && joint.onScreen),
          fingerSpans,
          minimumPixels: Math.min(...fingerSpans.map(({ pixels }) => pixels)),
          thresholds: handDetailThresholds,
        },
      },
      presentation: handPresentation,
    };
  };
  const leftHand = handFramingFixture('left');
  const rightHand = handFramingFixture('right');
  const validateHand = (fixture, side) => handFramingValid(
    fixture.framing,
    actor,
    side,
    fixture.presentation,
    rootPosition,
    rootYaw,
    sourceScreenshot,
  );
  assert(validateHand(leftHand, 'left'), 'fixed left hand detail framing must pass');
  assert(validateHand(rightHand, 'right'), 'fixed right hand detail framing must pass');
  const croppedHand = structuredClone(leftHand);
  croppedHand.framing.handDetail.sentinels[1].withinRoi = false;
  croppedHand.framing.handDetail.sentinels[1].onScreen = false;
  croppedHand.framing.handDetail.allInsideRoi = false;
  assert(!validateHand(croppedHand, 'left'), 'cropped hand sentinel must fail');
  const shortHand = structuredClone(leftHand);
  const handWrist = shortHand.framing.handDetail.sentinels[0];
  const handThumb = shortHand.framing.handDetail.sentinels[1];
  handThumb.pixel = { x: handWrist.pixel.x + 1, y: handWrist.pixel.y };
  shortHand.framing.handDetail.fingerSpans[0].pixels = 1;
  shortHand.framing.handDetail.minimumPixels = 1;
  assert(!validateHand(shortHand, 'left'), 'sub-12px fixed hand span must fail');
  const autoFittedHand = structuredClone(leftHand);
  autoFittedHand.framing.camera.outsideOffsetM = 0.69;
  assert(!validateHand(autoFittedHand, 'left'), 'non-fixed hand camera distance must fail');
  const staleHandSource = structuredClone(leftHand);
  staleHandSource.framing.camera.sourceFrameBinding.frame -= 1;
  assert(!validateHand(staleHandSource, 'left'), 'hand camera source must bind to the armed close submitted frame');
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
  discardEvidence(
    `Pass 69.3 ${targetName} rigged-bot gate emitted invalid or stale evidence; failed predicates: ${failedPredicates.join(', ')}`,
    sourceSha,
  );
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
