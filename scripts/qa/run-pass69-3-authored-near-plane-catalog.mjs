import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4541' }),
  'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4542' }),
});
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 69.3 authored near-plane target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
const releasePass = process.env.PASS69_3_NEAR_PLANE_RELEASE_PASS
  ?? releaseChannels?.experimental?.pass;
if (!/^PASS [1-9][0-9]*$/u.test(releasePass ?? '')
  || releasePass !== releaseChannels?.experimental?.pass) {
  throw new Error(`Pass 69.3 authored near-plane requires the current experimental pass; received ${releasePass ?? '(missing)'}`);
}

const artifactBase = resolve(root, 'artifacts/pass69-3/authored-near-plane-catalog');
const rendererArtifacts = resolve(artifactBase, target.renderer);
const receiptPath = resolve(artifactBase, `receipt-${target.renderer}.json`);
mkdirSync(artifactBase, { recursive: true });
rmSync(receiptPath, { force: true });

const expectedWeapons = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'pistol', 'machine-pistol', 'magnum', 'flashlight-pistol', 'explosive-crossbow',
  'railgun', 'flamethrower', 'flare-gun',
]);
const expectedRetreats = Object.freeze({
  carbine: 0,
  smg: 0,
  lmg: 0.1,
  scattergun: 0.03,
  sniper: 0.14,
  'mini-uzi': 0,
  mp5: 0,
  m4a1: 0,
  'ak-47': 0.03,
  minigun: 0,
  'm14-ebr': 0.05,
  'slug-shotgun': 0.03,
  pistol: 0,
  'machine-pistol': 0,
  magnum: 0,
  'flashlight-pistol': 0,
  'explosive-crossbow': 0,
  railgun: 0.1,
  flamethrower: 0,
  'flare-gun': 0,
});
const expectedFireAges = Object.freeze([0, 4, 8, 12, 16, 24, 36, 52, 78, 105, 150, 225, 310]);
const expectedReloadProgress = Object.freeze([0.08, 0.22, 0.38, 0.52, 0.68, 0.84]);
const fullscreenOptics = new Set(['sniper', 'm14-ebr']);
const expectedContactFixture = Object.freeze({
  contract: 'gun-range-west-wall-prone-pose-v2',
  map: 'gun-range',
  stance: 'prone',
  teleportPosition: Object.freeze([-19.65, 1.7, -14.5]),
  settledPosition: Object.freeze([-19.6465, 0.6363, -14.5]),
  yaw: Math.PI / 2,
  pitch: 0,
  maximumPositionAxisError: 0.005,
  maximumAngularError: 0.000001,
  minimumSurfaceLift: 0.13,
});
const expectedContactFixtureConvergence = Object.freeze({
  contract: 'consecutive-presented-contact-fixture-v1',
  requiredStableTransitions: 8,
  minimumStableElapsedMs: 50,
  maximumPositionDelta: 0.0005,
  maximumYawDelta: 0.000001,
  maximumPitchDelta: 0.000001,
  maximumSurfaceRetreatDelta: 0.0005,
  maximumSurfaceLiftDelta: 0.0005,
});
const expectedRoundContinuity = Object.freeze({
  contract: 'gun-range-production-rematch-round-refresh-v1',
  minimumResetTimerSeconds: 119,
});

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
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

function matchTimerSeconds(value) {
  const match = /^(\d{2}):(\d{2})$/u.exec(value ?? '');
  if (!match) return Number.NaN;
  const seconds = Number(match[2]);
  return seconds < 60 ? Number(match[1]) * 60 + seconds : Number.NaN;
}

function angularDelta(left, right) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function contactFixtureConvergenceValid(convergence, expectedLabel) {
  const requirements = convergence?.requirements;
  const observed = convergence?.observed;
  const position = observed?.position;
  if (!Array.isArray(position)
    || position.length !== expectedContactFixture.settledPosition.length
    || !position.every(Number.isFinite)
    || !Number.isFinite(observed?.yaw)
    || !Number.isFinite(observed?.pitch)
    || !Number.isFinite(observed?.surfaceRetreat)
    || !Number.isFinite(observed?.maximumSurfaceRetreat)
    || !Number.isFinite(observed?.surfaceLift)) return false;
  const positionAxisError = position.map((value, index) => (
    Math.abs(value - expectedContactFixture.settledPosition[index])
  ));
  const yawError = angularDelta(observed.yaw, expectedContactFixture.yaw);
  const pitchError = Math.abs(observed.pitch - expectedContactFixture.pitch);
  return convergence.contract === expectedContactFixtureConvergence.contract
    && convergence.fixtureContract === expectedContactFixture.contract
    && convergence.label === expectedLabel
    && convergence.requiredStableTransitions === expectedContactFixtureConvergence.requiredStableTransitions
    && Number.isSafeInteger(convergence.stableTransitions)
    && convergence.stableTransitions >= expectedContactFixtureConvergence.requiredStableTransitions
    && convergence.stableSampleCount === convergence.stableTransitions + 1
    && Number.isSafeInteger(convergence.startedPresentedFrame)
    && Number.isSafeInteger(convergence.endedPresentedFrame)
    && convergence.endedPresentedFrame - convergence.startedPresentedFrame === convergence.stableTransitions
    && Number.isFinite(convergence.stableElapsedMs)
    && convergence.stableElapsedMs >= expectedContactFixtureConvergence.minimumStableElapsedMs
    && Number.isFinite(convergence.totalElapsedMs)
    && convergence.totalElapsedMs >= convergence.stableElapsedMs
    && Number.isFinite(convergence.maximumPositionDelta)
    && convergence.maximumPositionDelta >= 0
    && convergence.maximumPositionDelta <= expectedContactFixtureConvergence.maximumPositionDelta
    && Number.isFinite(convergence.maximumYawDelta)
    && convergence.maximumYawDelta >= 0
    && convergence.maximumYawDelta <= expectedContactFixtureConvergence.maximumYawDelta
    && Number.isFinite(convergence.maximumPitchDelta)
    && convergence.maximumPitchDelta >= 0
    && convergence.maximumPitchDelta <= expectedContactFixtureConvergence.maximumPitchDelta
    && Number.isFinite(convergence.maximumSurfaceRetreatDelta)
    && convergence.maximumSurfaceRetreatDelta >= 0
    && convergence.maximumSurfaceRetreatDelta <= expectedContactFixtureConvergence.maximumSurfaceRetreatDelta
    && Number.isFinite(convergence.maximumSurfaceLiftDelta)
    && convergence.maximumSurfaceLiftDelta >= 0
    && convergence.maximumSurfaceLiftDelta <= expectedContactFixtureConvergence.maximumSurfaceLiftDelta
    && convergence.thresholds?.position === expectedContactFixtureConvergence.maximumPositionDelta
    && convergence.thresholds?.yaw === expectedContactFixtureConvergence.maximumYawDelta
    && convergence.thresholds?.pitch === expectedContactFixtureConvergence.maximumPitchDelta
    && convergence.thresholds?.surfaceRetreat === expectedContactFixtureConvergence.maximumSurfaceRetreatDelta
    && convergence.thresholds?.surfaceLift === expectedContactFixtureConvergence.maximumSurfaceLiftDelta
    && requirements?.matchPhase === 'active'
    && requirements.map === expectedContactFixture.map
    && requirements.stance === expectedContactFixture.stance
    && sameArray(requirements.settledPosition, expectedContactFixture.settledPosition)
    && requirements.maximumPositionAxisError === expectedContactFixture.maximumPositionAxisError
    && requirements.yaw === expectedContactFixture.yaw
    && requirements.pitch === expectedContactFixture.pitch
    && requirements.maximumAngularError === expectedContactFixture.maximumAngularError
    && requirements.saturatedSurfaceRetreat === true
    && requirements.minimumSurfaceLift === expectedContactFixture.minimumSurfaceLift
    && observed.matchPhase === 'active'
    && observed.map === expectedContactFixture.map
    && observed.stance === expectedContactFixture.stance
    && observed.presentedGameplayFrame === convergence.endedPresentedFrame
    && Math.max(...positionAxisError) <= expectedContactFixture.maximumPositionAxisError
    && yawError <= expectedContactFixture.maximumAngularError
    && pitchError <= expectedContactFixture.maximumAngularError
    && observed.maximumSurfaceRetreat === 0.28
    && observed.surfaceRetreat >= observed.maximumSurfaceRetreat
    && observed.surfaceLift >= expectedContactFixture.minimumSurfaceLift;
}

function contactFixtureValid(contact) {
  const observed = contact?.observedSettledPose;
  const position = observed?.position;
  if (!Array.isArray(position)
    || position.length !== expectedContactFixture.settledPosition.length
    || !position.every(Number.isFinite)
    || !Number.isFinite(observed?.yaw)
    || !Number.isFinite(observed?.pitch)) return false;
  const positionAxisError = position.map((value, index) => (
    Math.abs(value - expectedContactFixture.settledPosition[index])
  ));
  const maximumPositionAxisError = Math.max(...positionAxisError);
  const yawError = Math.abs(Math.atan2(
    Math.sin(observed.yaw - expectedContactFixture.yaw),
    Math.cos(observed.yaw - expectedContactFixture.yaw),
  ));
  const pitchError = Math.abs(observed.pitch - expectedContactFixture.pitch);
  const recordedPositionErrors = contact.errors?.positionAxis;
  const recordedErrorsMatch = Array.isArray(recordedPositionErrors)
    && recordedPositionErrors.length === positionAxisError.length
    && recordedPositionErrors.every((value, index) => (
      Number.isFinite(value) && Math.abs(value - positionAxisError[index]) <= 1e-12
    ));
  return contact.contract === expectedContactFixture.contract
    && contact.map === expectedContactFixture.map
    && contact.stance === expectedContactFixture.stance
    && sameArray(contact.teleportCommand?.position, expectedContactFixture.teleportPosition)
    && contact.teleportCommand?.yaw === expectedContactFixture.yaw
    && contact.teleportCommand?.pitch === expectedContactFixture.pitch
    && sameArray(contact.expectedSettledPose?.position, expectedContactFixture.settledPosition)
    && contact.expectedSettledPose?.yaw === expectedContactFixture.yaw
    && contact.expectedSettledPose?.pitch === expectedContactFixture.pitch
    && contact.tolerances?.maximumPositionAxisError === expectedContactFixture.maximumPositionAxisError
    && contact.tolerances?.maximumAngularError === expectedContactFixture.maximumAngularError
    && maximumPositionAxisError <= expectedContactFixture.maximumPositionAxisError
    && yawError <= expectedContactFixture.maximumAngularError
    && pitchError <= expectedContactFixture.maximumAngularError
    && recordedErrorsMatch
    && Math.abs(contact.errors?.maximumPositionAxis - maximumPositionAxisError) <= 1e-12
    && Math.abs(contact.errors?.yaw - yawError) <= 1e-12
    && Math.abs(contact.errors?.pitch - pitchError) <= 1e-12
    && Number.isFinite(contact.surfaceRetreat)
    && contact.surfaceRetreat >= 0.28
    && Number.isFinite(contact.surfaceLift)
    && contact.surfaceLift >= 0.13
    && contact.maximumSurfaceRetreat === 0.28
    && contact.contactAuthority?.contract === 'saturated-viewmodel-surface-retreat-v1'
    && contact.contactAuthority.observedSurfaceRetreat === contact.surfaceRetreat
    && contact.contactAuthority.maximumSurfaceRetreat === contact.maximumSurfaceRetreat
    && contact.contactAuthority.saturated === true
    && contact.contactAuthority.observedSurfaceRetreat >= contact.contactAuthority.maximumSurfaceRetreat
    && contactFixtureConvergenceValid(contact.convergence, 'initial-deploy')
    && Math.max(...position.map((value, index) => (
      Math.abs(value - contact.convergence.observed.position[index])
    ))) <= expectedContactFixtureConvergence.maximumPositionDelta
    && angularDelta(observed.yaw, contact.convergence.observed.yaw) <= expectedContactFixtureConvergence.maximumYawDelta
    && Math.abs(observed.pitch - contact.convergence.observed.pitch) <= expectedContactFixtureConvergence.maximumPitchDelta
    && Math.abs(contact.surfaceRetreat - contact.convergence.observed.surfaceRetreat)
      <= expectedContactFixtureConvergence.maximumSurfaceRetreatDelta
    && Math.abs(contact.surfaceLift - contact.convergence.observed.surfaceLift)
      <= expectedContactFixtureConvergence.maximumSurfaceLiftDelta;
}

function fixturePoseValid(pose) {
  const position = pose?.position;
  if (!Array.isArray(position)
    || position.length !== expectedContactFixture.settledPosition.length
    || !position.every(Number.isFinite)
    || !Number.isFinite(pose?.yaw)
    || !Number.isFinite(pose?.pitch)) return false;
  const positionAxisError = position.map((value, index) => (
    Math.abs(value - expectedContactFixture.settledPosition[index])
  ));
  const maximumPositionAxisError = Math.max(...positionAxisError);
  const yawError = Math.abs(Math.atan2(
    Math.sin(pose.yaw - expectedContactFixture.yaw),
    Math.cos(pose.yaw - expectedContactFixture.yaw),
  ));
  const pitchError = Math.abs(pose.pitch - expectedContactFixture.pitch);
  return pose.contract === expectedContactFixture.contract
    && pose.map === expectedContactFixture.map
    && pose.stance === expectedContactFixture.stance
    && maximumPositionAxisError <= expectedContactFixture.maximumPositionAxisError
    && yawError <= expectedContactFixture.maximumAngularError
    && pitchError <= expectedContactFixture.maximumAngularError
    && sameArray(pose.positionAxisError, positionAxisError)
    && Math.abs(pose.maximumPositionAxisError - maximumPositionAxisError) <= 1e-12
    && Math.abs(pose.yawError - yawError) <= 1e-12
    && Math.abs(pose.pitchError - pitchError) <= 1e-12;
}

function returnedFixtureValid(pose, expectedLabel) {
  if (!fixturePoseValid(pose)
    || !contactFixtureConvergenceValid(pose?.convergence, expectedLabel)) return false;
  const observed = pose.convergence.observed;
  return Math.max(...pose.position.map((value, index) => (
    Math.abs(value - observed.position[index])
  ))) <= expectedContactFixtureConvergence.maximumPositionDelta
    && angularDelta(pose.yaw, observed.yaw) <= expectedContactFixtureConvergence.maximumYawDelta
    && Math.abs(pose.pitch - observed.pitch) <= expectedContactFixtureConvergence.maximumPitchDelta;
}

function roundContinuityValid(continuity) {
  if (continuity?.contract !== expectedRoundContinuity.contract
    || continuity.refreshCount !== expectedWeapons.length - 1
    || !Array.isArray(continuity.entries)
    || continuity.entries.length !== expectedWeapons.length - 1) return false;
  return continuity.entries.every((entry, index) => {
    const before = entry.rematch?.before;
    const after = entry.rematch?.after;
    return entry.contract === expectedRoundContinuity.contract
      && entry.afterWeapon === expectedWeapons[index]
      && entry.nextWeapon === expectedWeapons[index + 1]
      && Number.isInteger(entry.timerBefore?.seconds)
      && entry.timerBefore.seconds > 0
      && matchTimerSeconds(entry.timerBefore?.text) === entry.timerBefore.seconds
      && Number.isInteger(entry.timerAfter?.seconds)
      && entry.timerAfter.seconds >= expectedRoundContinuity.minimumResetTimerSeconds
      && entry.timerAfter.seconds > entry.timerBefore.seconds
      && matchTimerSeconds(entry.timerAfter?.text) === entry.timerAfter.seconds
      && entry.minimumResetTimerSeconds === expectedRoundContinuity.minimumResetTimerSeconds
      && before?.matchPhase === 'active'
      && before?.playerAlive === true
      && Number.isSafeInteger(before?.matchEpoch)
      && Number.isSafeInteger(before?.playerContinuity)
      && after?.matchPhase === 'active'
      && after?.playerAlive === true
      && Number.isSafeInteger(after?.matchEpoch)
      && Number.isSafeInteger(after?.playerContinuity)
      && after.matchEpoch === before.matchEpoch + 1
      && after.playerContinuity === before.playerContinuity + 1
      && returnedFixtureValid(entry.returnedFixture, `${entry.afterWeapon}->${entry.nextWeapon}`);
  });
}

function runtimeValid(runtime) {
  return runtime?.requestedBackend === target.renderer
    && runtime.actualBackend === target.renderer
    && runtime.initialized === true
    && runtime.failClosed === false
    && runtime.softwareAdapter === false
    && runtime.deviceLost === false
    && runtime.uncapturedErrors === 0
    && (target.renderer === 'webgpu'
      ? runtime.adapterClass === 'GPUAdapter'
        && runtime.deviceClass === 'GPUDevice'
        && runtime.presentation?.status === 'healthy'
      : runtime.adapterClass === 'WebGL2RenderingContext'
        && runtime.presentation?.status === 'synchronous');
}

function contactValid(contact, weapon) {
  return contact?.contract === 'authored-glb-contact-retreat-2026-08-09-v1'
    && contact.surfaceRetreat >= 0.28
    && contact.surfaceLift >= 0.13
    && contact.cameraNear === 0.08
    && contact.requiredMargin === 0.02
    && contact.baseRetreat === 0.06
    && contact.maximumSurfaceRetreat === 0.28
    && contact.cachedRetreat === expectedRetreats[weapon]
    && contact.blendedRetreat === expectedRetreats[weapon]
    && fixturePoseValid(contact.fixturePose);
}

function convergenceValid(convergence, effectiveViewmodelVisible) {
  return convergence?.contract === 'consecutive-presented-transform-and-depth-v1'
    && convergence.effectiveViewmodelVisible === effectiveViewmodelVisible
    && convergence.requiredStableTransitions === 8
    && convergence.stableTransitions >= 8
    && convergence.stableSampleCount === convergence.stableTransitions + 1
    && convergence.endedPresentedFrame - convergence.startedPresentedFrame === convergence.stableTransitions
    && convergence.stableElapsedMs >= 50
    && convergence.totalElapsedMs >= convergence.stableElapsedMs
    && convergence.maximumPositionDelta <= 0.0005
    && convergence.maximumRotationDelta <= 0.0005
    && convergence.maximumDepthDelta <= 0.0005
    && convergence.thresholds?.position === 0.0005
    && convergence.thresholds?.rotation === 0.0005
    && convergence.thresholds?.depth === 0.0005;
}

function structuralSuppressionValid(suppression, active) {
  const expectedNames = ['first-person-muzzle-light', 'first-person-viewmodel-fill'];
  return suppression?.contract === 'retained-structural-lights-fullscreen-suppression-v1'
    && suppression.active === active
    && suppression.suppressedScale === 0.0001
    && suppression.rootVisible === true
    && Number.isFinite(suppression.rootScale)
    && (active ? suppression.rootScale === 0.0001 : suppression.rootScale > 0.0001)
    && suppression.structuralLightCount === 2
    && Array.isArray(suppression.structuralLights)
    && suppression.structuralLights.length === 2
    && sameArray(suppression.structuralLights.map((light) => light.name).sort(), expectedNames)
    && suppression.structuralLights.every((light) => {
      const expectedIntensityContract = light.name === 'first-person-viewmodel-fill'
        ? 'zero-when-suppressed'
        : 'transient-fire-decay';
      return light.attachedToRoot === true
        && light.visible === true
        && light.intensityContract === expectedIntensityContract
        && Number.isFinite(light.intensity)
        && light.intensity >= 0
        && (!active || light.intensity === 0);
    });
}

function visiblePoseValid(sample, weapon, pose, expectedSample = null) {
  const requiredDepth = 0.1;
  return sample?.pose === pose
    && sample.sample === expectedSample
    && sample.effectiveViewmodelVisible === true
    && convergenceValid(sample.convergence, true)
    && structuralSuppressionValid(sample.fullscreenSuppression, false)
    && sample.action?.weapon === weapon
    && sample.weaponFraming?.finite === true
    && sample.weaponFraming?.nearPlaneClear === true
    && sample.weaponFraming?.intersectsViewport === true
    && sample.weaponFraming.nearestDepth >= requiredDepth
    && sample.armFraming?.finite === true
    && sample.armFraming?.nearPlaneClear === true
    && sample.armFraming?.intersectsViewport === true
    && sample.armFraming.nearestDepth >= requiredDepth
    && sample.nearestDepth >= requiredDepth
    && sample.requiredDepth === requiredDepth
    && sample.clearanceMargin >= 0
    && contactValid(sample.contact, weapon);
}

function fullscreenAdsValid(sample, weapon) {
  return sample?.pose === 'ads'
    && sample.sample === null
    && sample.effectiveViewmodelVisible === false
    && convergenceValid(sample.convergence, false)
    && structuralSuppressionValid(sample.fullscreenSuppression, true)
    && sample.action?.weapon === weapon
    && sample.action?.state === 'ads'
    && sample.suppressionReason === (weapon === 'sniper'
      ? 'sniper-fullscreen-optic'
      : 'm14-fullscreen-thermal-optic')
    && contactValid(sample.contact, weapon);
}

function identityValid(identity, weapon, designIds) {
  return identity?.weapon === weapon
    && identity.modelKind === 'project-original-blender'
    && identity.firstPersonSource === (weapon === 'explosive-crossbow'
      ? 'project-original-blender-pass65-crossbow'
      : 'project-original-blender-pass65-firearm')
    && identity.weaponModelId === designIds.get(weapon)
    && identity.weaponFinishId === `${weapon}-project-original-pbr-v1`
    && identity.importedModel?.weapon === weapon
    && identity.importedModel?.source === (weapon === 'explosive-crossbow'
      ? './assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb'
      : `./assets/original/models/weapons/pass65-firearms/${weapon}/${weapon}-fp-lod0.glb`)
    && identity.importedModel?.socketContractReady === true
    && identity.importedModel?.meshes > 0
    && identity.importedModel?.triangles > 0
    && identity.armsSource === 'authored-two-chain'
    && identity.authoredFingerBoneCount === 30;
}

function expectedFireCycle(weapon, ageMs) {
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const age = Math.max(0, ageMs);
  const fastAuto = weapon === 'smg' || weapon === 'machine-pistol';
  const cycleMs = fastAuto ? 44 : weapon === 'scattergun' ? 620 : weapon === 'sniper' ? 920
    : weapon === 'lmg' ? 84 : 62;
  const flashDuration = weapon === 'scattergun' ? 82 : weapon === 'sniper' ? 78
    : weapon === 'lmg' ? 62 : fastAuto ? 36 : 52;
  const flashProgress = clamp01(age / flashDuration);
  const kickDuration = weapon === 'scattergun' ? 170 : weapon === 'sniper' ? 310
    : weapon === 'magnum' ? 150 : weapon === 'lmg' ? 105 : fastAuto ? 50
      : weapon === 'pistol' ? 58 : 62;
  const kickProgress = clamp01(age / kickDuration);
  const actionAge = weapon === 'scattergun' ? Math.max(0, age - 180)
    : weapon === 'sniper' ? Math.max(0, age - 130) : age;
  const actionDuration = weapon === 'scattergun' ? 440 : weapon === 'sniper' ? 700 : cycleMs;
  const actionProgress = clamp01(actionAge / actionDuration);
  return {
    flash: (1 - flashProgress) ** 2,
    kick: kickProgress >= 1 ? 0 : (1 - kickProgress) ** 1.35,
    boltTravel: actionProgress >= 1 ? 0 : Math.sin(actionProgress * Math.PI),
    casingReady: age >= (weapon === 'scattergun' ? 230 : weapon === 'sniper' ? 150 : fastAuto ? 24 : 34),
  };
}

function fireCycleValid(sample, weapon, ageMs) {
  const expected = expectedFireCycle(weapon, ageMs);
  return ['flash', 'kick', 'boltTravel'].every((key) => (
    Number.isFinite(sample.fireCycle?.[key])
      && Math.abs(sample.fireCycle[key] - expected[key]) <= 1e-10
      && Number.isFinite(sample.expectedFireCycle?.[key])
      && Math.abs(sample.expectedFireCycle[key] - expected[key]) <= 1e-10
  ))
    && sample.fireCycle?.casingReady === expected.casingReady
    && sample.expectedFireCycle?.casingReady === expected.casingReady;
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) {
  discardEvidence(`Pass 69.3 authored near-plane rejects local Vite environment overrides: ${localViteOverrides.join(', ')}`);
}
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 69.3 authored near-plane requires one completely clean source SHA');
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: releasePass,
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_INSTALLED_EDGE: '1',
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.port,
    PASS69_3_NEAR_PLANE_RENDERER: target.renderer,
    PASS69_3_NEAR_PLANE_RENDER_PROFILE: 'blender',
    PASS69_3_NEAR_PLANE_SOURCE_SHA: sourceSha,
    PASS69_3_NEAR_PLANE_TARGET: targetName,
    PASS69_3_NEAR_PLANE_RELEASE_PASS: releasePass,
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 69.3 ${targetName} authored near-plane failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 69.3 ${targetName} authored near-plane terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) discardEvidence(`Pass 69.3 ${targetName} authored near-plane failed with exit ${result.status ?? 1}`);

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  discardEvidence(`Pass 69.3 ${targetName} authored near-plane did not emit a readable receipt: ${error instanceof Error ? error.message : String(error)}`);
}

const sourceSpecs = JSON.parse(readFileSync(
  resolve(root, 'source-assets/blender/pass65-weapon-family-specs.json'),
  'utf8',
));
const designIds = new Map(sourceSpecs.weapons.map((entry) => [entry.id, entry.designId]));
designIds.set('explosive-crossbow', 'pass65-explosive-crossbow-project-original-v1');

const weaponsValid = Array.isArray(receipt.weapons)
  && receipt.weapons.length === expectedWeapons.length
  && receipt.weapons.every((entry, index) => {
    const weapon = expectedWeapons[index];
    const artifactPath = `artifacts/pass69-3/authored-near-plane-catalog/${target.renderer}/${String(index + 1).padStart(2, '0')}-${weapon}.json`;
    const screenshotPath = `artifacts/pass69-3/authored-near-plane-catalog/${target.renderer}/${String(index + 1).padStart(2, '0')}-${weapon}-maximum-contact-fire-kick.png`;
    const artifactFile = resolve(root, artifactPath);
    const screenshotFile = resolve(root, screenshotPath);
    const fireSamples = entry.fireKick?.samples;
    const reloadSamples = entry.reload?.samples;
    return entry.weapon === weapon
      && identityValid(entry.identity, weapon, designIds)
      && visiblePoseValid(entry.hip, weapon, 'hip')
      && (fullscreenOptics.has(weapon)
        ? fullscreenAdsValid(entry.ads, weapon)
        : visiblePoseValid(entry.ads, weapon, 'ads'))
      && sameArray(entry.fireKick?.agesMs, expectedFireAges)
      && Array.isArray(fireSamples)
      && fireSamples.length === expectedFireAges.length
      && fireSamples.every((sample, sampleIndex) => (
        visiblePoseValid(sample, weapon, 'fire-kick', expectedFireAges[sampleIndex])
        && fireCycleValid(sample, weapon, expectedFireAges[sampleIndex])
      ))
      && sameArray(entry.reload?.progressSamples, expectedReloadProgress)
      && Array.isArray(reloadSamples)
      && reloadSamples.length === expectedReloadProgress.length
      && reloadSamples.every((sample, sampleIndex) => (
        visiblePoseValid(sample, weapon, 'reload', expectedReloadProgress[sampleIndex])
        && sample.action?.state === 'reload'
        && Math.abs(sample.action.reloadProgress - expectedReloadProgress[sampleIndex]) <= 0.015
      ))
      && entry.minimumClearanceMargin >= 0
      && entry.artifact?.path === artifactPath
      && /^[a-f0-9]{64}$/u.test(entry.artifact?.sha256 ?? '')
      && existsSync(artifactFile)
      && sha256(artifactFile) === entry.artifact.sha256
      && entry.screenshot?.path === screenshotPath
      && /^[a-f0-9]{64}$/u.test(entry.screenshot?.sha256 ?? '')
      && existsSync(screenshotFile)
      && sha256(screenshotFile) === entry.screenshot.sha256;
  });

if (receipt.schemaVersion !== 3
  || receipt.status !== 'PASS'
  || receipt.contract !== 'atomic-acres/pass69-3-authored-near-plane-catalog@3'
  || receipt.evidenceScope !== 'maximum-contact-hip-settled-ads-fire-kick-reload-near-plane-clearance'
  || receipt.target !== targetName
  || receipt.sourceSha !== sourceSha
  || receipt.endingSourceSha !== sourceSha
  || receipt.cleanSource !== true
  || receipt.renderer !== target.renderer
  || receipt.renderProfile !== 'blender'
  || receipt.browser?.project !== 'chromium'
  || receipt.browser?.channel !== 'msedge'
  || !/Edg\//u.test(receipt.browser?.userAgent ?? '')
  || receipt.servedCandidate?.schemaVersion !== 4
  || receipt.servedCandidate.channel !== 'the-big-one'
  || receipt.servedCandidate.releasePass !== releasePass
  || receipt.servedCandidate.path !== 'channels/the-big-one'
  || receipt.servedCandidate.sourceSha !== sourceSha
  || !/^[a-f0-9]{64}$/u.test(receipt.servedCandidate?.treeSha256 ?? '')
  || !Number.isSafeInteger(receipt.servedCandidate?.exactRootFileCount)
  || receipt.servedCandidate.exactRootFileCount < 2
  || !runtimeValid(receipt.runtimeBefore)
  || !runtimeValid(receipt.runtimeAfter)
  || !contactFixtureValid(receipt.contactFixture)
  || !roundContinuityValid(receipt.roundContinuity)
  || !sameArray(receipt.catalog?.weapons, expectedWeapons)
  || receipt.catalog?.weaponCount !== expectedWeapons.length
  || JSON.stringify(receipt.catalog?.contactRetreatTable) !== JSON.stringify(expectedRetreats)
  || !sameArray(receipt.catalog?.fireKickAgesMs, expectedFireAges)
  || !sameArray(receipt.catalog?.reloadProgressSamples, expectedReloadProgress)
  || !sameArray(receipt.catalog?.fullscreenOpticWeapons, [...fullscreenOptics])
  || receipt.catalog?.requiredVisibleDepth !== 'cameraNear + requiredMargin'
  || !weaponsValid
  || !Array.isArray(receipt.browserErrors)
  || receipt.browserErrors.length !== 0) {
  discardEvidence(`Pass 69.3 ${targetName} authored near-plane emitted invalid or stale evidence`);
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 69.3 ${targetName} authored near-plane source drifted during verification (${sourceSha} -> ${endingSha})`);
}
console.log(JSON.stringify({
  pass69_3AuthoredNearPlane: 'PASS',
  target: targetName,
  sourceSha,
  weaponCount: receipt.weapons.length,
  receiptPath,
}, null, 2));
