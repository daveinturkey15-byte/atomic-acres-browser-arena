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
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 69.3 rigged-bot target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const artifactBase = resolve(root, 'artifacts/pass69-3/rigged-bot-live');
const rendererArtifacts = resolve(artifactBase, target.renderer);
const receiptPath = resolve(artifactBase, `receipt-${target.renderer}.json`);
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
  Object.freeze({ side: 'left', digit: 'middle', joint: 2, sourceBone: 'Middle2.L', bone: 'Middle2L' }),
  Object.freeze({ side: 'left', digit: 'ring', joint: 2, sourceBone: 'Ring2.L', bone: 'Ring2L' }),
  Object.freeze({ side: 'right', digit: 'middle', joint: 2, sourceBone: 'Middle2.R', bone: 'Middle2R' }),
  Object.freeze({ side: 'right', digit: 'ring', joint: 2, sourceBone: 'Ring2.R', bone: 'Ring2R' }),
]);
const minimumFingerBindRadians = 0.12;
const antiTThresholds = Object.freeze({
  minimumVerticalDropM: 0.08,
  minimumVerticalDropRatio: 0.18,
  maximumHorizontalReachRatio: 0.9,
  maximumOutwardReachRatio: 0.82,
  minimumElbowFlexRadians: 0.12,
});
const closeRoiNdc = Object.freeze({ minX: -0.46, maxX: 0.46, minY: -0.7, maxY: 0.7 });
const mediumRoiNdc = Object.freeze({ minX: -0.68, maxX: 0.68, minY: -0.82, maxY: 0.82 });
const overviewRoiNdc = Object.freeze({ minX: -0.97, maxX: 0.97, minY: -0.95, maxY: 0.95 });
mkdirSync(artifactBase, { recursive: true });
rmSync(receiptPath, { force: true });

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

function positionDelta(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 3 || right.length !== 3) return Number.NaN;
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function framingValid(framing, actor, expectedRoi) {
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
  return x >= expectedRoi.minX && x <= expectedRoi.maxX
    && y >= expectedRoi.minY && y <= expectedRoi.maxY
    && z >= -1 && z <= 1
    && Math.abs(framing.projectedPixel.x - expectedPixelX) <= 1e-6
    && Math.abs(framing.projectedPixel.y - expectedPixelY) <= 1e-6
    && framing.projectedPixel.x >= Math.max(0, framing.canvas.left)
    && framing.projectedPixel.x <= Math.min(framing.viewport.width, framing.canvas.left + framing.canvas.width)
    && framing.projectedPixel.y >= Math.max(0, framing.canvas.top)
    && framing.projectedPixel.y <= Math.min(framing.viewport.height, framing.canvas.top + framing.canvas.height);
}

function screenshotValid(record, expectedPath, actor, expectedRoi) {
  const path = resolve(root, expectedPath);
  return record?.path === expectedPath
    && /^[a-f0-9]{64}$/u.test(record?.sha256 ?? '')
    && existsSync(path)
    && sha256(path) === record.sha256
    && framingValid(record.framing, actor, expectedRoi);
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
    && elbowFlexRadians >= antiTThresholds.minimumElbowFlexRadians
    && observed.shoulderToWristVerticalDrop >= antiTThresholds.minimumVerticalDropM
    && observed.shoulderToWristVerticalDropRatio >= antiTThresholds.minimumVerticalDropRatio
    && observed.shoulderToWristHorizontalReachRatio <= antiTThresholds.maximumHorizontalReachRatio
    && observed.shoulderToWristOutwardReachRatio <= antiTThresholds.maximumOutwardReachRatio
    && chain.antiTPoseGeometry === true;
}

function gripValid(grip, socketName) {
  return grip?.finite === true
    && grip.socketName === socketName
    && grip.torsoClear === true
    && grip.torsoRelativeBendHint === true
    && Number.isFinite(grip.supportError)
    && grip.supportError <= 0.025
    && Number.isFinite(grip.elbowTorsoOutward)
    && Number.isFinite(grip.minimumOutwardClearance)
    && grip.minimumOutwardClearance > 0
    && grip.elbowTorsoOutward >= grip.minimumOutwardClearance
    && grip.weaponLocalBounds?.containsTarget === true
    && grip.weaponLocalBounds.distanceToTarget === 0;
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
    || model.armPose.allAntiTPoseGeometry !== true
    || !Array.isArray(model.armPose.commonEffectiveSkinnedMeshes)
    || model.armPose.commonEffectiveSkinnedMeshes.length < 1
    || !Array.isArray(model.armPose.bones)
    || model.armPose.bones.length !== expectedBones.length
    || !Array.isArray(model.armPose.chains)
    || model.armPose.chains.length !== 2
    || model.handPose?.contract !== 'source-glb-animated-middle-ring-finger-descendants-v1'
    || model.handPose.reference !== 'shipped-lod0-walk-animated-second-phalanges'
    || model.handPose.expectedBoneCount !== expectedHandBones.length
    || model.handPose.allPresent !== true
    || model.handPose.allDescendantOfWrist !== true
    || model.handPose.allInEffectivelyVisibleSkinnedMesh !== true
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
      && Array.isArray(bone.effectiveSkinnedMeshes)
      && model.armPose.commonEffectiveSkinnedMeshes.every((name) => bone.effectiveSkinnedMeshes.includes(name))
      && Number.isFinite(bone.bindQuaternionDeltaRadians)
      && bone.bindQuaternionDeltaRadians >= expected.minimumBindRadians
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
      && Array.isArray(bone.effectiveSkinnedMeshes)
      && model.armPose.commonEffectiveSkinnedMeshes.every((name) => bone.effectiveSkinnedMeshes.includes(name))
      && bone.finite === true
      && bone.bindQuaternionDeltaRadians >= minimumFingerBindRadians;
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

const armedBase = `artifacts/pass69-3/rigged-bot-live/${target.renderer}`;
const armedValid = receipt.armedBot?.weapon === 'carbine'
  && receipt.armedBot.alive === true
  && motionValid(receipt.armedBot.first, receipt.armedBot.second, receipt.armedBot.motion, false)
  && screenshotValid(
    receipt.armedBot.screenshots?.medium,
    `${armedBase}/armed-live-bot-medium.png`,
    { kind: 'bot', id: receipt.armedBot.id },
    mediumRoiNdc,
  )
  && screenshotValid(
    receipt.armedBot.screenshots?.close,
    `${armedBase}/armed-live-bot-close.png`,
    { kind: 'bot', id: receipt.armedBot.id },
    closeRoiNdc,
  );
const dummiesValid = sameArray(receipt.gunRangeDummies?.expectedIds, expectedDummyIds)
  && overviewScreenshotValid(receipt.gunRangeDummies?.overviewScreenshot, `${armedBase}/gun-range-dummies-medium.png`)
  && Array.isArray(receipt.gunRangeDummies?.entries)
  && receipt.gunRangeDummies.entries.length === expectedDummyIds.length
  && receipt.gunRangeDummies.entries.every((entry, index) => entry?.id === expectedDummyIds[index]
    && entry.definition?.id === expectedDummyIds[index]
    && entry.definition?.armed === false
    && entry.first?.armed === false
    && entry.second?.armed === false
    && motionValid(entry.first, entry.second, entry.motion, true)
    && entry.first.operatorModel.animationContract.speed === entry.definition.speedMps
    && entry.second.operatorModel.animationContract.speed === entry.definition.speedMps
    && screenshotValid(
      entry.closeScreenshot,
      `${armedBase}/${expectedDummyIds[index]}-close.png`,
      { kind: 'training-dummy', id: expectedDummyIds[index] },
      closeRoiNdc,
    ));
if (receipt.schemaVersion !== 2
  || receipt.status !== 'PASS'
  || receipt.contract !== 'atomic-acres/pass69-3-rigged-bot-live@2'
  || receipt.evidenceScope !== 'real-glb-skinned-hierarchy-anti-t-hands-grip-and-live-framing'
  || receipt.target !== targetName
  || receipt.sourceSha !== sourceSha
  || receipt.endingSourceSha !== sourceSha
  || receipt.cleanSource !== true
  || receipt.renderer !== target.renderer
  || receipt.renderProfile !== 'blender'
  || !sameArray(receipt.viewport, [1_600, 900])
  || !sameObject(receipt.armBindThresholds, expectedBones)
  || receipt.minimumFingerBindRadians !== minimumFingerBindRadians
  || !sameObject(receipt.antiTThresholds, antiTThresholds)
  || !sameObject(receipt.captureRoisNdc, { close: closeRoiNdc, medium: mediumRoiNdc, overview: overviewRoiNdc })
  || receipt.visualReview?.required !== true
  || receipt.visualReview.status !== 'PENDING_OWNER_INSPECTION'
  || receipt.visualReview.automatedFramingIsNotVisualAcceptance !== true
  || receipt.browser?.project !== 'chromium'
  || receipt.browser?.channel !== 'msedge'
  || !/Edg\//u.test(receipt.browser?.userAgent ?? '')
  || !surfaceValid(receipt.surfaces?.armedBot, 'atomic-acres', sourceSha)
  || !surfaceValid(receipt.surfaces?.gunRange, 'gun-range', sourceSha)
  || JSON.stringify(receipt.surfaces.armedBot.servedCandidate) !== JSON.stringify(receipt.surfaces.gunRange.servedCandidate)
  || !armedValid
  || !dummiesValid
  || !Array.isArray(receipt.browserErrors)
  || receipt.browserErrors.length !== 0) {
  discardEvidence(`Pass 69.3 ${targetName} rigged-bot gate emitted invalid or stale evidence`);
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 69.3 ${targetName} rigged-bot source drifted during verification (${sourceSha} -> ${endingSha})`);
}
console.log(JSON.stringify({
  pass69_3RiggedBotLive: 'PASS', target: targetName, sourceSha, receiptPath,
}, null, 2));
