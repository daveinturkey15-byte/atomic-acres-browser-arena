import assert from 'node:assert/strict';

export const PASS73_NATIVE_ADS_REVEAL_SCHEMA = 'atomic-acres/pass73-native-ads-reveal@1';
export const PASS73_NATIVE_ADS_REVEAL_PROFILES = Object.freeze(['quality', 'performance']);
export const PASS73_NATIVE_ADS_REVEAL_WEAPONS = Object.freeze(['m14-ebr', 'railgun']);
export const PASS73_NATIVE_ADS_REVEAL_ROI = Object.freeze({ width: 512, height: 640, pixelDelta: 6 });
export const PASS73_NATIVE_ADS_REVEAL_THRESHOLDS = Object.freeze({
  minimumRevealChangedFraction: 0.002,
  maximumRevealChangedFraction: 0.3,
  maximumOccludedBodyLeakFraction: 0.0015,
  maximumAdsOffLeakFraction: 0.0015,
  minimumOrangeChangedFraction: 0.00005,
  maximumOrangeChangedFraction: 0.08,
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeGeneration(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function exact(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validRoute(routeValue, profile, weapon) {
  try {
    const route = new URL(routeValue);
    return route.pathname.endsWith('/channels/the-big-one/')
      && route.searchParams.get('release') === 'latest'
      && route.searchParams.get('map') === 'atomic-acres'
      && route.searchParams.get('renderer') === 'webgpu'
      && route.searchParams.get('requireWebGPU') === '1'
      && route.searchParams.get('render') === profile
      && route.searchParams.get('externalServices') === 'off'
      && route.searchParams.get('traceNodeBuilds') === '1'
      && route.searchParams.get('seed') === `pass73-native-ads-reveal-${profile}-${weapon}`;
  } catch {
    return false;
  }
}

function validateRender(renderValue, label, failures) {
  const render = object(renderValue);
  if (render.requestedBackend !== 'webgpu' || render.actualBackend !== 'webgpu'
    || render.initialized !== true || render.failClosed !== false
    || render.adapterClass !== 'GPUAdapter' || render.deviceClass !== 'GPUDevice'
    || typeof render.adapterLabel !== 'string' || render.adapterLabel.length < 3
    || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu.test(render.adapterLabel)
    || render.softwareAdapter !== false || render.deviceLost !== false
    || render.uncapturedErrors !== 0 || render.presentation?.completionFailures !== 0
    || render.presentation?.status !== 'healthy') {
    failures.push(`${label} is not healthy native hardware WebGPU`);
  }
}

function validateReadback(readbackValue, label, artifactsByPath, referencedArtifactPaths, failures) {
  const readback = object(readbackValue);
  if (readback.contract !== 'pass73-native-ads-reveal-hdr-roi-v1'
    || readback.width !== PASS73_NATIVE_ADS_REVEAL_ROI.width
    || readback.height !== PASS73_NATIVE_ADS_REVEAL_ROI.height
    || readback.channels !== 4
    || readback.bytes !== PASS73_NATIVE_ADS_REVEAL_ROI.width * PASS73_NATIVE_ADS_REVEAL_ROI.height * 4
    || !['uint8', 'float16', 'float32'].includes(readback.componentType)
    || readback.nonFiniteComponents !== 0
    || !/^[a-f0-9]{8}$/u.test(readback.hash ?? '')
    || !Number.isSafeInteger(readback.targetWidth) || !Number.isSafeInteger(readback.targetHeight)
    || readback.targetWidth < readback.width || readback.targetHeight < readback.height
    || readback.x !== Math.floor((readback.targetWidth - readback.width) / 2)
    || readback.y !== Math.floor((readback.targetHeight - readback.height) / 2)) {
    failures.push(`${label} has an empty, malformed, off-centre, or non-finite GPU ROI`);
  }
  const artifact = artifactsByPath.get(readback.artifactPath);
  if (!artifact || artifact.sha256 !== readback.artifactSha256 || artifact.bytes !== readback.artifactBytes) {
    failures.push(`${label} is not bound to its hashed artifact`);
  }
  if (referencedArtifactPaths.has(readback.artifactPath)) {
    failures.push(`${label} reuses another readback artifact`);
  } else if (typeof readback.artifactPath === 'string') {
    referencedArtifactPaths.add(readback.artifactPath);
  }
}

function validateTrustedRmb(inputValue, label, failures) {
  const input = object(inputValue);
  const events = array(input.events);
  const required = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
  if (input.source !== 'playwright-page-mouse-physical-rmb'
    || input.syntheticEvents !== 0
    || events.some((event) => event?.button !== 2 || event?.isTrusted !== true)
    || required.some((type) => events.filter((event) => event?.type === type).length !== 1)) {
    failures.push(`${label} did not use exactly one trusted physical RMB down/up lifecycle`);
  }
}

function validateRevealTelemetry(telemetryValue, stage, label, failures) {
  const telemetry = object(telemetryValue);
  const target = array(telemetry.targets).find((entry) => entry?.id === stage.id);
  if (telemetry.contract !== 'exact-animated-operator-plus-orange-halo-v1'
    || telemetry.trackedTargets !== 1 || telemetry.activeTargets !== 1
    || !exact(telemetry.activeTargetIds, [stage.id])
    || telemetry.activeModelLayers < 1
    || telemetry.activeModelLayers !== telemetry.activeSourceBodyLayers
    || telemetry.activeHaloLayers !== telemetry.activeSourceBodyLayers
    || telemetry.geometryIdentity !== true || telemetry.skeletonIdentity !== true
    || telemetry.bindMatrixIdentity !== true || telemetry.meshWorldMatrixIdentity !== true
    || telemetry.haloWorldMatrixIdentity !== true || telemetry.boneWorldMatrixIdentity !== true
    || telemetry.normalMaterialEquivalence !== true || telemetry.silhouetteLayerIdentity !== true
    || telemetry.siblingParentIdentity !== true || telemetry.lifeIdentityCurrent !== true
    || telemetry.poseIdentity !== true || telemetry.sourceRootsAttached !== true
    || telemetry.sourceRootIdentityUnique !== true || telemetry.detachedLayers !== 0
    || telemetry.extraneousModelLayers !== 0 || telemetry.extraneousHaloLayers !== 0
    || telemetry.duplicateSourceRootInputs !== 0 || telemetry.exactModelVisible !== true
    || telemetry.exactModelColorWrite !== true || telemetry.exactModelOpacity <= 0
    || telemetry.exactModelDepthTestDisabled !== true || telemetry.exactModelDepthWriteDisabled !== true
    || telemetry.haloVisible !== true || telemetry.haloColorWrite !== true
    || telemetry.haloOpacity !== 0.88 || telemetry.haloDepthTestDisabled !== true
    || telemetry.haloDepthWriteDisabled !== true || telemetry.throughGeometry !== true
    || telemetry.orangeHalo !== true || telemetry.proxyMeshes !== 0
    || telemetry.completeOperatorModels !== true || telemetry.incompleteTargets !== 0) {
    failures.push(`${label} did not retain one complete exact animated model plus restrained halo`);
  }
  if (!target || target.active !== true || target.lifeId !== stage.lifeId
    || target.continuityId !== stage.continuityId || target.sourceRootUuid !== stage.sourceRootUuid
    || target.sourceRootAttached !== true || target.sourceVisualAttached !== true
    || target.sourceBodyLayers !== stage.normalBodyLayers
    || target.exactModelLayers !== target.sourceBodyLayers
    || target.haloLayers !== target.sourceBodyLayers || target.detachedLayers !== 0
    || target.extraneousModelLayers !== 0 || target.extraneousHaloLayers !== 0
    || target.poseIdentity !== true || target.sourcePoseDigest !== target.modelPoseDigest) {
    failures.push(`${label} target is stale, detached, duplicated, or double-transformed`);
  }
}

function validateCell(cellValue, profile, weapon, artifactsByPath, referencedArtifactPaths, failures) {
  const cell = object(cellValue);
  const label = `${profile}/${weapon}`;
  if (cell.id !== `${profile}:${weapon}` || cell.profile !== profile || cell.weapon !== weapon
    || !validRoute(cell.route, profile, weapon)) failures.push(`${label} route/cell identity is invalid`);
  if (typeof cell.userAgent !== 'string' || !/Chrome\//u.test(cell.userAgent) || /Edg\//u.test(cell.userAgent)
    || !exact(cell.viewport, [2_560, 1_440]) || cell.deviceScaleFactor !== 1) {
    failures.push(`${label} did not use installed Chrome at 2560x1440 DPR 1`);
  }
  if (array(cell.browserErrors).length !== 0) failures.push(`${label} emitted browser/GPU errors`);
  validateRender(cell.render, label, failures);
  validateTrustedRmb(cell.trustedInput, label, failures);

  const stage = object(cell.stage);
  const blockers = array(stage.blockers);
  const blockersValid = blockers.length > 0 && blockers.every((entryValue) => {
    const entry = object(entryValue);
    return finite(entry.minX) && finite(entry.maxX) && entry.maxX > entry.minX
      && finite(entry.minZ) && finite(entry.maxZ) && entry.maxZ > entry.minZ
      && ((entry.minY === null && entry.maxY === null)
        || (finite(entry.minY) && finite(entry.maxY) && entry.maxY > entry.minY));
  });
  if (stage.contract !== 'pass73-native-ads-reveal-staged-target-v1'
    || stage.kind !== 'bot' || stage.hostile !== true || stage.alive !== true
    || !safeGeneration(stage.lifeId) || !safeGeneration(stage.continuityId)
    || typeof stage.id !== 'string' || stage.id.length < 1
    || typeof stage.sourceRootUuid !== 'string' || stage.sourceRootUuid.length < 8
    || stage.sourceRootAttached !== true || !Number.isSafeInteger(stage.normalBodyLayers) || stage.normalBodyLayers < 1
    || stage.normalBodyHidden !== false || !Number.isSafeInteger(stage.blockerCount) || stage.blockerCount < 1
    || blockers.length !== stage.blockerCount || !blockersValid
    || array(stage.targetNdc).length !== 3 || !stage.targetNdc.every(finite)
    || Math.abs(stage.targetNdc[0]) > 0.1 || Math.abs(stage.targetNdc[1]) > 0.2
    || stage.targetNdc[2] < -1 || stage.targetNdc[2] > 1
    || stage.animatedPose?.stance !== 'stand' || !(stage.animatedPose?.speed > 0)) {
    failures.push(`${label} lacks one current animated hostile behind real occluding geometry`);
  }

  const outside = object(cell.outsideAds);
  if (outside.adsHeld !== false || outside.revealActiveTargets !== 0
    || !finite(outside.adsOffLeakFraction)
    || outside.adsOffLeakFraction > PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.maximumAdsOffLeakFraction
    || !finite(outside.normalBodyLeakFraction)
    || outside.normalBodyLeakFraction > PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.maximumOccludedBodyLeakFraction) {
    failures.push(`${label} leaks reveal or ordinary raster body pixels outside ADS`);
  }
  for (const [state, readback] of Object.entries(object(outside.readbacks))) {
    validateReadback(readback, `${label} outside ${state}`, artifactsByPath, referencedArtifactPaths, failures);
  }
  if (Object.keys(object(outside.readbacks)).sort().join(',') !== 'normalHidden,revealEnabled,revealSuppressed') {
    failures.push(`${label} lacks the three ADS-off paired readbacks`);
  }

  const ads = object(cell.ads);
  if (ads.adsHeld !== true || !(ads.adsProgress >= 0.95)
    || !finite(ads.normalBodyLeakFraction)
    || ads.normalBodyLeakFraction > PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.maximumOccludedBodyLeakFraction
    || !finite(ads.revealChangedFraction)
    || ads.revealChangedFraction < PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.minimumRevealChangedFraction
    || ads.revealChangedFraction > PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.maximumRevealChangedFraction
    || !finite(ads.orangeChangedFraction)
    || ads.orangeChangedFraction < PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.minimumOrangeChangedFraction
    || ads.orangeChangedFraction > PASS73_NATIVE_ADS_REVEAL_THRESHOLDS.maximumOrangeChangedFraction) {
    failures.push(`${label} ADS ROI is empty, leaking, excessive, or lacks a restrained orange halo`);
  }
  validateRevealTelemetry(ads.revealTelemetry, stage, `${label} ADS reveal`, failures);
  const identityAfter = object(ads.identityAfter);
  if (identityAfter.id !== stage.id || identityAfter.lifeId !== stage.lifeId
    || identityAfter.continuityId !== stage.continuityId
    || identityAfter.sourceRootUuid !== stage.sourceRootUuid
    || identityAfter.sourceRootAttached !== true || identityAfter.alive !== true
    || identityAfter.hostile !== true || identityAfter.normalBodyHidden !== false) {
    failures.push(`${label} target life/root identity changed during GPU capture`);
  }
  for (const [state, readback] of Object.entries(object(ads.readbacks))) {
    validateReadback(readback, `${label} ADS ${state}`, artifactsByPath, referencedArtifactPaths, failures);
  }
  if (Object.keys(object(ads.readbacks)).sort().join(',') !== 'normalHidden,revealShown,revealSuppressed') {
    failures.push(`${label} lacks the three ADS paired readbacks`);
  }
  const pose = object(ads.pose);
  if (!/^[a-f0-9]{8}$/u.test(pose.firstSourceDigest ?? '')
    || !/^[a-f0-9]{8}$/u.test(pose.secondSourceDigest ?? '')
    || pose.firstSourceDigest === pose.secondSourceDigest
    || pose.firstSourceDigest !== pose.firstModelDigest
    || pose.secondSourceDigest !== pose.secondModelDigest
    || pose.lifeId !== stage.lifeId || pose.continuityId !== stage.continuityId) {
    failures.push(`${label} did not prove a current moving pose on the same life/root`);
  }
  const release = object(cell.release);
  if (release.adsHeld !== false || release.activeTargets !== 0 || release.throughGeometry !== false
    || release.orangeHalo !== false) failures.push(`${label} reveal survived RMB release`);
}

export function pass73NativeAdsRevealFailures(receiptValue, expected = {}) {
  const receipt = object(receiptValue);
  const failures = [];
  if (receipt.schema !== PASS73_NATIVE_ADS_REVEAL_SCHEMA || receipt.verdict !== 'pass') {
    failures.push('receipt schema or verdict is invalid');
  }
  const source = object(receipt.source);
  if (!/^[a-f0-9]{40}$/u.test(source.head ?? '') || !/^[a-f0-9]{40}$/u.test(source.tree ?? '')
    || source.clean !== true || source.head !== source.endingHead || source.tree !== source.endingTree) {
    failures.push('receipt is not bound to one clean immutable Git source/tree');
  }
  if (expected.head && source.head !== expected.head) failures.push('receipt source HEAD differs from the requested candidate');
  if (expected.tree && source.tree !== expected.tree) failures.push('receipt source tree differs from the requested candidate');

  const browser = object(receipt.browser);
  if (typeof browser.executablePath !== 'string'
    || !/[/\\]Google[/\\]Chrome[/\\]Application[/\\]chrome\.exe$/iu.test(browser.executablePath)
    || !/^[a-f0-9]{64}$/u.test(browser.executableSha256 ?? '')
    || typeof browser.version !== 'string' || browser.version.length < 3) {
    failures.push('installed Chrome executable identity is invalid');
  }
  if (expected.executableSha256 && browser.executableSha256 !== expected.executableSha256) {
    failures.push('Chrome executable hash differs from the owned runner');
  }

  const gate = object(receipt.gate);
  if (!exact(gate.profiles, PASS73_NATIVE_ADS_REVEAL_PROFILES)
    || !exact(gate.weapons, PASS73_NATIVE_ADS_REVEAL_WEAPONS)
    || !exact(gate.viewport, [2_560, 1_440]) || gate.deviceScaleFactor !== 1
    || gate.backend !== 'native-hardware-webgpu' || gate.input !== 'trusted-physical-rmb'
    || gate.compositor !== 'headed-offscreen' || gate.cells !== 4 || gate.skipped !== 0
    || !exact(gate.roi, PASS73_NATIVE_ADS_REVEAL_ROI)
    || !exact(gate.thresholds, PASS73_NATIVE_ADS_REVEAL_THRESHOLDS)) {
    failures.push('gate matrix, zero-skip, ROI, or frozen pixel bounds are invalid');
  }
  const summary = object(receipt.testSummary);
  if (summary.expected !== 1 || summary.passed !== 1 || summary.failed !== 0 || summary.skipped !== 0) {
    failures.push('browser test summary is not exactly one pass with zero skips');
  }

  const artifacts = array(receipt.artifacts);
  const artifactsByPath = new Map();
  for (const artifactValue of artifacts) {
    const artifact = object(artifactValue);
    if (typeof artifact.path !== 'string'
      || !/^artifacts\/pass73\/native-ads-reveal\/[a-z0-9-]+\.png$/u.test(artifact.path)
      || !/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? '') || !Number.isSafeInteger(artifact.bytes)
      || artifact.bytes <= 0 || artifactsByPath.has(artifact.path)) {
      failures.push('artifact path/hash/size identity is invalid or duplicated');
      continue;
    }
    artifactsByPath.set(artifact.path, artifact);
  }

  const cells = array(receipt.cells);
  const referencedArtifactPaths = new Set();
  if (cells.length !== 4) failures.push('receipt does not contain all four ADS reveal cells');
  for (const profile of PASS73_NATIVE_ADS_REVEAL_PROFILES) {
    for (const weapon of PASS73_NATIVE_ADS_REVEAL_WEAPONS) {
      const matches = cells.filter((cell) => cell?.profile === profile && cell?.weapon === weapon);
      if (matches.length !== 1) failures.push(`${profile}/${weapon} is missing or duplicated`);
      else validateCell(matches[0], profile, weapon, artifactsByPath, referencedArtifactPaths, failures);
    }
  }
  if (artifactsByPath.size !== 24 || referencedArtifactPaths.size !== 24
    || [...artifactsByPath.keys()].some((path) => !referencedArtifactPaths.has(path))) {
    failures.push('receipt lacks the exact 24 unique hashed GPU ROI artifacts');
  }
  return failures;
}

export function assertPass73NativeAdsRevealReceipt(receipt, expected = {}) {
  const failures = pass73NativeAdsRevealFailures(receipt, expected);
  assert.deepEqual(failures, [], failures.join('\n'));
}

export function pass73NativeAdsRevealStaticFailures(sourcesValue) {
  const sources = object(sourcesValue);
  const spec = String(sources.spec ?? '');
  const runner = String(sources.runner ?? '');
  const config = String(sources.config ?? '');
  const runtime = String(sources.runtime ?? '');
  const legacy = String(sources.legacy ?? '');
  const failures = [];
  if (!spec.includes("page.mouse.down({ button: 'right' })")
    || !spec.includes("page.mouse.up({ button: 'right' })")
    || !spec.includes("source: 'playwright-page-mouse-physical-rmb'")) {
    failures.push('spec does not own trusted physical RMB through page.mouse');
  }
  if (/dispatchEvent\s*\(|new\s+(?:MouseEvent|PointerEvent)\s*\(|\.setAds\s*\(/u.test(spec)) {
    failures.push('spec contains a synthetic ADS/RMB path');
  }
  for (const token of [
    'PASS73_NATIVE_ADS_REVEAL_PROFILES',
    'PASS73_NATIVE_ADS_REVEAL_WEAPONS',
    'stagePass73NativeAdsRevealTarget',
    'capturePass73NativeAdsRevealRoiTriplet',
  ]) if (!spec.includes(token)) failures.push(`spec is missing ${token}`);
  for (const token of [
    'readbackPass73NativeAdsRevealRoi',
    'setPass73AdsRevealNormalBodyHidden',
    'capturePass73NativeAdsRevealRoiTriplet',
    'pass73AdsRevealCaptureFrozenTargetId',
    'railgunPresentation.syncExactOperatorReveal(railgunRevealActive, thermalGhostPresentation.telemetry())',
  ]) if (!legacy.includes(token)) failures.push(`runtime is missing ${token}`);
  for (const token of [
    "git('status', '--porcelain', '--untracked-files=all')",
    "git('rev-parse', 'HEAD')",
    "git('rev-parse', 'HEAD^{tree}')",
    "tests/e2e/pass73-native-ads-reveal.spec.ts",
    "PASS73_NATIVE_CHROME_SHA256",
    "artifacts/pass73/native-ads-reveal/receipt.json",
  ]) if (!runner.includes(token)) failures.push(`runner is missing ${token}`);
  if (!config.includes('executablePath: pass73NativeChromePath')) {
    failures.push('Playwright native gate is not pinned to the hashed Chrome executable');
  }
  for (const token of [
    'PASS73_ADS_REVEAL_ROI_WIDTH = 512',
    'PASS73_ADS_REVEAL_ROI_HEIGHT = 640',
    'PASS73_ADS_REVEAL_PIXEL_DELTA = 6',
    'PASS73_ADS_REVEAL_MIN_CHANGED_FRACTION = 0.002',
    'PASS73_ADS_REVEAL_MAX_CHANGED_FRACTION = 0.3',
    'PASS73_ADS_REVEAL_MAX_OCCLUDED_BODY_LEAK_FRACTION = 0.0015',
    'PASS73_ADS_REVEAL_MAX_ADS_OFF_LEAK_FRACTION = 0.0015',
    'PASS73_ADS_REVEAL_MIN_ORANGE_FRACTION = 0.00005',
    'PASS73_ADS_REVEAL_MAX_ORANGE_FRACTION = 0.08',
  ]) if (!runtime.includes(token)) failures.push(`runtime pixel bound is missing or weakened: ${token}`);
  return failures;
}

export function assertPass73NativeAdsRevealStaticSources(sources) {
  const failures = pass73NativeAdsRevealStaticFailures(sources);
  assert.deepEqual(failures, [], failures.join('\n'));
}
