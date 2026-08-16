import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID = 'dave-gaming-pc';
export const PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256 = createHash('sha256')
  .update('desktop-vi3cr5q', 'utf8')
  .digest('hex');

export const PASS71_NATIVE_BROWSER_PARITY = Object.freeze({
  schemaVersion: 4,
  evidenceId: 'HF-311',
  kind: 'pass71-firefox-chrome-quality-parity',
  contract: 'atomic-acres/pass71-firefox-chrome-quality-parity@4',
  gate: 'pass71-native-firefox-chrome-quality-combat-parity-v4',
  viewport: Object.freeze({ width: 1_904, height: 987, deviceScaleFactor: 1 }),
  sceneModes: Object.freeze(['solo-quality-combat', 'hosted-quality-combat']),
  actionTimeline: Object.freeze(['pointer-lock', 'ads-down', 'fire', 'ads-up', 'reload']),
  settleMs: 6_000,
  minimumWindowMs: 8_000,
  maximumWindowMs: 12_000,
  targetWindowMs: 9_000,
  minimumSamples: 120,
  minimumGameFrameToCallbackRatio: 0.98,
  maximumGameFrameToCallbackRatio: 1.02,
  minimumFirefoxMedianFpsRatio: 0.8,
  minimumFirefoxPresentedFpsRatio: 0.8,
  maximumFirefoxP95FrameTimeRatio: 1.25,
  maximumFirefoxMaximumFrameTimeRatio: 1.25,
  maximumLongTasksPerScene: 0,
  stableTelemetrySampleCount: 3,
  sceneStageContract: 'atomic-acres/pass71-native-parity-scene-stage@1',
  scenePositionToleranceM: 0.15,
  maximumSceneSampleDriftM: 0.025,
});

export const PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS = Object.freeze([
  Object.freeze({ phase: 'pointer-lock', type: 'mousedown', button: 0, key: null, code: null }),
  Object.freeze({ phase: 'pointer-lock', type: 'mouseup', button: 0, key: null, code: null }),
  Object.freeze({ phase: 'pointer-lock', type: 'click', button: 0, key: null, code: null }),
  Object.freeze({ phase: 'ads-down', type: 'mousedown', button: 2, key: null, code: null }),
  Object.freeze({ phase: 'fire', type: 'mousedown', button: 0, key: null, code: null }),
  Object.freeze({ phase: 'fire', type: 'mouseup', button: 0, key: null, code: null }),
  Object.freeze({ phase: 'fire', type: 'click', button: 0, key: null, code: null }),
  Object.freeze({ phase: 'ads-up', type: 'mouseup', button: 2, key: null, code: null }),
  Object.freeze({ phase: 'reload', type: 'keydown', button: null, key: 'r', code: 'KeyR' }),
  Object.freeze({ phase: 'reload', type: 'keyup', button: null, key: 'r', code: 'KeyR' }),
]);

export const PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_NATIVE_BROWSER_PARITY.evidenceId,
  kind: PASS71_NATIVE_BROWSER_PARITY.kind,
  minimumCount: 1,
  maximumCount: 1,
});

export const PASS71_NATIVE_BROWSER_PARITY_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-native-browser-parity.mjs',
  contract: 'scripts/qa/pass71-native-browser-parity-contract.mjs',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  viteConfig: 'vite.config.ts',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  releaseChannels: 'release-channels.json',
  runtime: 'src/legacy-main.ts',
  graphicsSettings: 'src/graphics-settings-registry.ts',
  graphicsRuntime: 'src/pass65-settings.ts',
  renderer: 'src/rendering/render-runtime.ts',
  residency: 'src/rendering/resident-memory.ts',
  network: 'src/network.ts',
  protocol: 'src/protocol.ts',
});

export const PASS71_QUALITY_REQUESTED_GRAPHICS = Object.freeze({
  schemaVersion: 1,
  preset: 'high',
  renderScale: 1,
  adaptiveResolution: true,
  targetFps: 240,
  frameRateLimit: 0,
  antiAliasing: 'msaa-4x',
  geometryDetail: 'full',
  shadows: 'high',
  shadowResolution: 'high',
  shadowUpdateMode: 'static',
  indirectLighting: 'high',
  ambientOcclusion: 'off',
  reflectionQuality: 'high',
  volumetricQuality: 'high',
  smokeQuality: 'high',
  particleQuality: 'high',
  anisotropy: 8,
  decalQuality: 'high',
  bloomQuality: 'cinematic',
  exposure: 1,
  toneMapping: 'aces',
  filmGrain: 0.32,
  vignette: 0.16,
});

export const PASS71_QUALITY_EFFECTIVE_GRAPHICS = Object.freeze({
  requestedPreset: 'high',
  effectivePreset: 'high',
  renderProfile: 'blender',
  renderScale: 1,
  adaptive: true,
  targetFps: 240,
  frameRateLimit: 0,
  antialiasSamples: 4,
  shadows: true,
  shadowMapSize: 2_048,
  shadowUpdateMode: 'static',
  indirectLightScale: 1,
  ambientOcclusion: Object.freeze({
    quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0,
  }),
  reflectionScale: 1,
  volumetricScale: 0.8,
  maximumAnisotropy: 8,
  particleScale: 0.8,
  decalScale: 0.8,
  smokeScale: 0.8,
  post: Object.freeze({
    bloomStrength: 0.14,
    exposureScale: 1,
    toneMapping: 'aces',
    filmGrainScale: 0.32,
    vignetteStrength: 0.16,
  }),
  reason: null,
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteNonNegative(value) {
  return finite(value) && value >= 0;
}

function vector3(value) {
  return Array.isArray(value) && value.length === 3 && value.every(finite);
}

function vectorDistance(left, right) {
  return vector3(left) && vector3(right)
    ? Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
    : Number.POSITIVE_INFINITY;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function exactKeys(value, expected, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...expected].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function pass71NativeBrowserParityCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 native parity evidence must be an object');
  return canonicalBytes(Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256')));
}

export function pass71NativeBrowserParityRecordSha256(record) {
  return digest(pass71NativeBrowserParityCanonicalBytes(record));
}

export function pass71NativeBrowserParitySceneSignature(scene, contract = PASS71_NATIVE_BROWSER_PARITY) {
  return digest(canonicalBytes({
    mode: scene.mode,
    arenaId: scene.arenaId,
    qualityAssetState: scene.qualityAssetState,
    seed: scene.seed,
    botCount: scene.botCount,
    remoteCount: scene.remoteCount,
    memberCount: scene.memberCount,
    hostRole: scene.hostRole,
    staging: scene.staging,
    actionTimeline: contract.actionTimeline,
  }));
}

export function pass71NativeBrowserParityToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 parity tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_NATIVE_BROWSER_PARITY_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, digest(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    ))],
  )));
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.filter(finite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function summarizePass71FrameWindow(intervalsMs, elapsedMs) {
  const intervals = Array.isArray(intervalsMs) ? intervalsMs.filter((value) => finite(value) && value > 0) : [];
  const medianFrameTimeMs = percentile(intervals, 0.5);
  return Object.freeze({
    elapsedMs,
    sampleCount: intervals.length,
    callbackFps: finite(elapsedMs) && elapsedMs > 0 ? intervals.length * 1_000 / elapsedMs : null,
    medianFrameTimeMs,
    medianFps: finite(medianFrameTimeMs) && medianFrameTimeMs > 0 ? 1_000 / medianFrameTimeMs : null,
    p95FrameTimeMs: percentile(intervals, 0.95),
    p99FrameTimeMs: percentile(intervals, 0.99),
    maximumFrameTimeMs: intervals.length > 0 ? Math.max(...intervals) : null,
  });
}

function validateIdentity(identity, browserName, prefix, failures) {
  exactKeys(identity, browserName === 'firefox'
    ? ['channel', 'installed', 'executableName', 'executableSha256', 'executableVersion', 'runtimeVersion', 'installRoot', 'authenticodeStatus', 'authenticodeSigner', 'userAgent', 'geckodriver']
    : ['channel', 'installed', 'executableName', 'executableSha256', 'executableVersion', 'runtimeVersion', 'installRoot', 'authenticodeStatus', 'authenticodeSigner', 'userAgent'],
  `${prefix}:identity`, failures);
  const executableName = browserName === 'firefox' ? 'firefox.exe' : 'chrome.exe';
  const channel = browserName === 'firefox' ? 'firefox' : 'chrome';
  const installPattern = browserName === 'firefox'
    ? /[\\/]Mozilla Firefox$/iu
    : /[\\/]Google[\\/]Chrome[\\/]Application$/iu;
  const signerPattern = browserName === 'firefox' ? /Mozilla/iu : /Google/iu;
  const userAgentPattern = browserName === 'firefox' ? /Firefox\//u : /Chrome\//u;
  const executableMajor = String(identity?.executableVersion ?? '').match(/^\d+/u)?.[0] ?? null;
  const runtimeMajor = String(identity?.runtimeVersion ?? '').match(/^\d+/u)?.[0] ?? null;
  const userAgentMajor = String(identity?.userAgent ?? '').match(
    browserName === 'firefox' ? /Firefox\/(\d+)/u : /Chrome\/(\d+)/u,
  )?.[1] ?? null;
  if (!object(identity) || identity.channel !== channel || identity.installed !== true
    || identity.executableName !== executableName || !SHA256.test(identity.executableSha256 ?? '')
    || typeof identity.executableVersion !== 'string' || identity.executableVersion.trim() === ''
    || typeof identity.runtimeVersion !== 'string' || identity.runtimeVersion.trim() === ''
    || !installPattern.test(identity.installRoot ?? '') || identity.authenticodeStatus !== 'Valid'
    || !signerPattern.test(identity.authenticodeSigner ?? '') || !userAgentPattern.test(identity.userAgent ?? '')
    || executableMajor === null || runtimeMajor !== executableMajor || userAgentMajor !== executableMajor) {
    failures.push(`${prefix}:installed-browser-identity`);
  }
  if (browserName === 'firefox') {
    exactKeys(identity?.geckodriver, ['executableSha256', 'version'], `${prefix}:geckodriver`, failures);
    if (!SHA256.test(identity?.geckodriver?.executableSha256 ?? '')
      || typeof identity?.geckodriver?.version !== 'string' || identity.geckodriver.version.trim() === '') {
      failures.push(`${prefix}:geckodriver-identity`);
    }
  }
}

function validateFrameWindow(performance, prefix, contract, failures) {
  exactKeys(performance, [
    'elapsedMs', 'sampleCount', 'callbackFps', 'medianFrameTimeMs', 'medianFps',
    'p95FrameTimeMs', 'p99FrameTimeMs', 'maximumFrameTimeMs', 'gameFrameDelta',
    'presentedFps', 'gameFrameToCallbackRatio', 'intervalsMs', 'longTasks',
  ], `${prefix}:performance`, failures);
  if (!object(performance) || !Array.isArray(performance.intervalsMs)
    || performance.intervalsMs.some((value) => !finite(value) || value <= 0)) {
    failures.push(`${prefix}:retained-frame-intervals`);
    return;
  }
  const summary = summarizePass71FrameWindow(performance.intervalsMs, performance.elapsedMs);
  for (const field of ['elapsedMs', 'sampleCount', 'callbackFps', 'medianFrameTimeMs', 'medianFps', 'p95FrameTimeMs', 'p99FrameTimeMs', 'maximumFrameTimeMs']) {
    if (performance[field] !== summary[field]) failures.push(`${prefix}:frame-summary-${field}`);
  }
  const derivedPresentedFps = performance.gameFrameDelta * 1_000 / performance.elapsedMs;
  const derivedRatio = performance.gameFrameDelta / performance.sampleCount;
  if (!finite(performance.elapsedMs) || performance.elapsedMs < contract.minimumWindowMs
    || performance.elapsedMs > contract.maximumWindowMs || performance.sampleCount < contract.minimumSamples
    || !Number.isSafeInteger(performance.gameFrameDelta) || performance.gameFrameDelta < 1
    || performance.presentedFps !== derivedPresentedFps || performance.gameFrameToCallbackRatio !== derivedRatio) {
    failures.push(`${prefix}:measurement-window`);
  }
  if (!finite(derivedRatio) || derivedRatio < contract.minimumGameFrameToCallbackRatio
    || derivedRatio > contract.maximumGameFrameToCallbackRatio) failures.push(`${prefix}:presentation-cadence`);
  exactKeys(performance.longTasks, ['entries', 'count', 'totalDurationMs', 'maximumDurationMs'], `${prefix}:long-tasks`, failures);
  const entries = performance?.longTasks?.entries;
  if (!Array.isArray(entries) || entries.some((entry) => !object(entry)
    || !sameJson(Object.keys(entry).sort(), ['durationMs', 'startTimeMs'])
    || !finiteNonNegative(entry.startTimeMs) || !finiteNonNegative(entry.durationMs))) {
    failures.push(`${prefix}:retained-long-tasks`);
  } else {
    const count = entries.length;
    const total = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
    const maximum = entries.length > 0 ? Math.max(...entries.map((entry) => entry.durationMs)) : 0;
    if (performance.longTasks.count !== count || performance.longTasks.totalDurationMs !== total
      || performance.longTasks.maximumDurationMs !== maximum || count > contract.maximumLongTasksPerScene) {
      failures.push(`${prefix}:long-task-budget`);
    }
  }
}

function validateInventory(inventory, prefix, failures) {
  exactKeys(inventory, ['entries', 'drawables', 'uniqueMaterials', 'triangles', 'sha256'], prefix, failures);
  const entries = inventory?.entries;
  if (!Array.isArray(entries) || entries.length < 1 || entries.some((entry) => !object(entry)
    || !sameJson(Object.keys(entry).sort(), ['material', 'name', 'triangles'])
    || typeof entry.name !== 'string' || typeof entry.material !== 'string'
    || !Number.isSafeInteger(entry.triangles) || entry.triangles < 0)) {
    failures.push(`${prefix}:entries`);
    return;
  }
  const normalized = [...entries].sort((left, right) => left.name.localeCompare(right.name)
    || left.material.localeCompare(right.material) || left.triangles - right.triangles);
  const uniqueMaterials = new Set(entries.flatMap((entry) => entry.material.split(',').filter(Boolean))).size;
  const triangles = entries.reduce((sum, entry) => sum + entry.triangles, 0);
  if (!sameJson(entries, normalized) || inventory.drawables !== entries.length
    || inventory.uniqueMaterials !== uniqueMaterials || inventory.triangles !== triangles
    || inventory.sha256 !== digest(canonicalBytes(entries))) failures.push(`${prefix}:summary`);
}

const RESIDENCY_FIELDS = Object.freeze([
  'activeTextureBytes', 'cachedTextureBytes', 'totalTextureBytes', 'activeGeometryBytes',
  'cachedGeometryBytes', 'totalGeometryBytes', 'activeTextures', 'cachedTextures',
  'activeGeometries', 'cachedGeometries',
]);

function validateResourceStability(resources, prefix, failures) {
  exactKeys(resources, ['before', 'after'], `${prefix}:resources`, failures);
  for (const phase of ['before', 'after']) {
    exactKeys(resources?.[phase], RESIDENCY_FIELDS, `${prefix}:resources:${phase}`, failures);
    if (!object(resources?.[phase]) || RESIDENCY_FIELDS.some((field) => !finiteNonNegative(resources[phase][field]))) {
      failures.push(`${prefix}:resources:${phase}:values`);
    }
  }
  if (!sameJson(resources?.before, resources?.after)) failures.push(`${prefix}:renderer-allocation-drift`);
}

function stableRenderBudgetIdentity(value) {
  if (!object(value)) return value;
  const { rendererSamples: _rendererSamples, ...identity } = value;
  return identity;
}

function validateRenderBudget(renderBudget, prefix, contract, failures) {
  exactKeys(renderBudget, ['before', 'after'], `${prefix}:render-budget`, failures);
  const fields = ['drawCalls', 'triangles', 'rendererReportedCalls', 'totalActiveShadowLights',
    'totalActiveShadowMapPixels', 'authoritativeArenaRoots', 'duplicateArenaRoots', 'playerCamera', 'route',
    'rendererSamples'];
  for (const phase of ['before', 'after']) {
    exactKeys(renderBudget?.[phase], fields, `${prefix}:render-budget:${phase}`, failures);
    const value = renderBudget?.[phase];
    if (!object(value) || !Number.isSafeInteger(value.drawCalls) || value.drawCalls < 1
      || !Number.isSafeInteger(value.triangles) || value.triangles < 1
      || !Number.isSafeInteger(value.rendererReportedCalls) || value.rendererReportedCalls < 1
      || !Number.isSafeInteger(value.totalActiveShadowLights) || value.totalActiveShadowLights < 0
      || !Number.isSafeInteger(value.totalActiveShadowMapPixels) || value.totalActiveShadowMapPixels < 0
      || value.authoritativeArenaRoots !== 1 || value.duplicateArenaRoots !== false
      || value.playerCamera !== true || value.route !== 'complete-playable-game') {
      failures.push(`${prefix}:render-budget:${phase}:values`);
    }
    const samples = value?.rendererSamples;
    if (!Array.isArray(samples) || samples.length !== contract.stableTelemetrySampleCount
      || samples.some((sample) => !object(sample)
        || !sameJson(Object.keys(sample).sort(), ['calls', 'frameCount'])
        || !Number.isSafeInteger(sample.frameCount) || sample.frameCount < 1
        || !Number.isSafeInteger(sample.calls) || sample.calls < 1)
      || samples.some((sample, index) => index > 0 && sample.frameCount <= samples[index - 1].frameCount)
      || samples.some((sample) => sample.calls !== value?.rendererReportedCalls)) {
      failures.push(`${prefix}:render-budget:${phase}:stable-renderer-sampling`);
    }
  }
  if (!sameJson(stableRenderBudgetIdentity(renderBudget?.before), stableRenderBudgetIdentity(renderBudget?.after))) {
    failures.push(`${prefix}:draw-budget-drift`);
  }
}

function validatePresentation(presentation, prefix, failures) {
  exactKeys(presentation, ['before', 'after'], `${prefix}:presentation`, failures);
  const fields = ['status', 'submissionSequence', 'completedSequence', 'completionFailures', 'uncapturedErrors', 'deviceLost'];
  for (const phase of ['before', 'after']) {
    exactKeys(presentation?.[phase], fields, `${prefix}:presentation:${phase}`, failures);
    const value = presentation?.[phase];
    if (!object(value) || value.status !== 'synchronous'
      || !Number.isSafeInteger(value.submissionSequence) || value.submissionSequence !== 0
      || !Number.isSafeInteger(value.completedSequence) || value.completedSequence !== 0
      || value.completionFailures !== 0 || value.uncapturedErrors !== 0 || value.deviceLost !== false) {
      failures.push(`${prefix}:synchronous-gpu-presentation`);
    }
  }
}

function validateAction(action, mode, prefix, contract, failures) {
  exactKeys(action, [
    'timeline', 'trustedEvents', 'pointerLocked', 'ammoBefore', 'ammoAfterFire',
    'ammoAfterReload', 'reserveAfterReload', 'reloadObserved', 'reloadCompleted',
    'targetHealthBefore', 'targetHealthAfter', 'targetKind',
  ], `${prefix}:action`, failures);
  const trustedEvents = action?.trustedEvents;
  const expectedEventFields = PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS;
  const observedEventFields = Array.isArray(trustedEvents) ? trustedEvents.map((event) => ({
    phase: event?.phase, type: event?.type, button: event?.button, key: event?.key, code: event?.code,
  })) : null;
  const trustedEventSchemaValid = Array.isArray(trustedEvents)
    && trustedEvents.length === expectedEventFields.length
    && trustedEvents.every((event) => object(event)
      && sameJson(Object.keys(event).sort(), [
        'button', 'code', 'eventTimestampMs', 'key', 'observedAtMs', 'phase', 'pointerLocked', 'sequence', 'trusted', 'type',
      ])
      && Number.isSafeInteger(event.sequence) && event.sequence >= 0
      && finiteNonNegative(event.eventTimestampMs) && finiteNonNegative(event.observedAtMs)
      && typeof event.pointerLocked === 'boolean' && event.trusted === true)
    && trustedEvents.every((event, index) => index === 0
      || (event.sequence > trustedEvents[index - 1].sequence
        && event.eventTimestampMs >= trustedEvents[index - 1].eventTimestampMs
        && event.observedAtMs >= trustedEvents[index - 1].observedAtMs))
    && trustedEvents.every((event) => event.phase === 'pointer-lock' || event.pointerLocked === true)
    && sameJson(observedEventFields, expectedEventFields);
  if (!trustedEventSchemaValid) failures.push(`${prefix}:trusted-action-events`);
  if (!object(action) || !sameJson(action.timeline, contract.actionTimeline)
    || action.pointerLocked !== true || !trustedEventSchemaValid
    || !Number.isSafeInteger(action.ammoBefore) || !Number.isSafeInteger(action.ammoAfterFire)
    || action.ammoAfterFire !== action.ammoBefore - 1
    || !Number.isSafeInteger(action.ammoAfterReload) || action.ammoAfterReload <= action.ammoAfterFire
    || !Number.isSafeInteger(action.reserveAfterReload) || action.reserveAfterReload < 0
    || action.reloadObserved !== true || action.reloadCompleted !== true
    || !finiteNonNegative(action.targetHealthBefore) || !finiteNonNegative(action.targetHealthAfter)
    || action.targetHealthAfter >= action.targetHealthBefore
    || action.targetKind !== (mode === 'solo-quality-combat' ? 'bot' : 'remote-player')) {
    failures.push(`${prefix}:representative-combat-action`);
  }
}

function validateSceneSampling(sceneState, mode, prefix, contract, failures) {
  const staging = sceneState?.staging;
  exactKeys(staging, [
    'contract', 'positionToleranceM', 'maximumSampleDriftM', 'playerPosition', 'targetPosition',
  ], `${prefix}:scene:staging`, failures);
  const expectedPlayerPosition = [22, 1.7, -39];
  const stagingShapeValid = object(staging)
    && staging.contract === contract.sceneStageContract
    && staging.positionToleranceM === contract.scenePositionToleranceM
    && staging.maximumSampleDriftM === contract.maximumSceneSampleDriftM
    && vector3(staging.playerPosition) && vector3(staging.targetPosition)
    && sameJson(staging.playerPosition, expectedPlayerPosition)
    && (mode === 'hosted-quality-combat'
      ? sameJson(staging.targetPosition, [19.06, 1.7, -44.22])
      : Math.abs(Math.hypot(
        staging.targetPosition[0] - staging.playerPosition[0],
        staging.targetPosition[2] - staging.playerPosition[2],
      ) - 6) <= 0.02 && staging.targetPosition[1] === 0);
  const samplesByPhase = sceneState?.samples;
  exactKeys(samplesByPhase, ['before', 'after'], `${prefix}:scene:samples`, failures);
  let sampleShapeValid = object(samplesByPhase) !== null;
  let samplesWithinStage = stagingShapeValid;
  for (const phase of ['before', 'after']) {
    const samples = samplesByPhase?.[phase];
    const phaseShapeValid = Array.isArray(samples) && samples.length === contract.stableTelemetrySampleCount
      && samples.every((sample) => object(sample)
        && sameJson(Object.keys(sample).sort(), ['frameCount', 'playerPosition', 'playerYaw', 'targetPosition'])
        && Number.isSafeInteger(sample.frameCount) && sample.frameCount >= 1
        && vector3(sample.playerPosition) && finite(sample.playerYaw) && vector3(sample.targetPosition))
      && samples.every((sample, index) => index === 0 || sample.frameCount > samples[index - 1].frameCount);
    sampleShapeValid &&= phaseShapeValid;
    samplesWithinStage &&= phaseShapeValid && samples.every((sample) => (
      vectorDistance(sample.playerPosition, staging.playerPosition) <= staging.positionToleranceM
        && vectorDistance(sample.targetPosition, staging.targetPosition) <= staging.positionToleranceM
        && vectorDistance(sample.playerPosition, samples[0].playerPosition) <= staging.maximumSampleDriftM
        && vectorDistance(sample.targetPosition, samples[0].targetPosition) <= staging.maximumSampleDriftM
    ));
  }
  const finalSample = sampleShapeValid ? samplesByPhase.before.at(-1) : null;
  const summaryMatches = finalSample !== null
    && sameJson(sceneState?.player?.position, finalSample.playerPosition)
    && sceneState?.player?.yaw === finalSample.playerYaw
    && sameJson(sceneState?.target?.position, finalSample.targetPosition);
  if (!stagingShapeValid || !sampleShapeValid || !samplesWithinStage || !summaryMatches) {
    failures.push(`${prefix}:deterministic-scene-signature`);
  }
}

function validateFaults(faults, prefix, failures) {
  exactKeys(faults, [
    'bootstrapError', 'runtimeErrorLog', 'fatalErrorVisible', 'capturedErrors',
    'watchdogStatus', 'watchdogIncidents', 'contextLosses', 'documentVisible', 'documentFocused',
  ], `${prefix}:faults`, failures);
  if (!object(faults) || faults.bootstrapError !== null || faults.runtimeErrorLog !== ''
    || faults.fatalErrorVisible !== false || !Array.isArray(faults.capturedErrors)
    || faults.capturedErrors.length !== 0 || faults.watchdogStatus !== 'healthy'
    || faults.watchdogIncidents !== 0 || faults.contextLosses !== 0
    || faults.documentVisible !== true || faults.documentFocused !== true) {
    failures.push(`${prefix}:runtime-or-watchdog-fault`);
  }
}

function validateScene(scene, mode, prefix, contract, failures) {
  exactKeys(scene, [
    'mode', 'route', 'viewport', 'freshProfile', 'freshBrowserProcess', 'scene', 'runtime',
    'webglVersion', 'displayedGraphicsPreset', 'requestedGraphics', 'effectiveGraphics',
    'principalHdrSamples', 'settleMs', 'performance', 'resources', 'renderInventory',
    'renderBudget', 'presentation', 'action', 'faults',
  ], prefix, failures);
  if (!object(scene) || scene.mode !== mode || scene.freshProfile !== true
    || scene.freshBrowserProcess !== true || scene.settleMs < contract.settleMs) failures.push(`${prefix}:scene-identity`);
  exactKeys(scene?.viewport, ['width', 'height', 'deviceScaleFactor'], `${prefix}:viewport`, failures);
  if (!sameJson(scene?.viewport, contract.viewport)) failures.push(`${prefix}:viewport`);
  exactKeys(scene?.scene, [
    'arenaId', 'gameStarted', 'matchPhase', 'qualityAssetState', 'seed', 'signature',
    'botCount', 'remoteCount', 'memberCount', 'hostRole', 'staging', 'samples', 'player', 'target',
  ], `${prefix}:scene`, failures);
  const expectedCounts = mode === 'solo-quality-combat'
    ? { botCount: 1, remoteCount: 0, memberCount: 0, hostRole: 'offline' }
    : { botCount: 0, remoteCount: 1, memberCount: 2, hostRole: 'host' };
  if (!object(scene?.scene) || scene.scene.arenaId !== 'atomic-acres'
    || scene.scene.gameStarted !== true || scene.scene.matchPhase !== 'active'
    || scene.scene.qualityAssetState !== 'ready' || typeof scene.scene.seed !== 'string'
    || scene.scene.seed.trim() === '' || typeof scene.scene.signature !== 'string'
    || !SHA256.test(scene.scene.signature) || Object.entries(expectedCounts).some(([key, value]) => scene.scene[key] !== value)) {
    failures.push(`${prefix}:canonical-quality-scene`);
  }
  exactKeys(scene?.scene?.player, ['position', 'yaw'], `${prefix}:scene:player`, failures);
  exactKeys(scene?.scene?.target, ['kind', 'position'], `${prefix}:scene:target`, failures);
  validateSceneSampling(scene?.scene, mode, prefix, contract, failures);
  if (!vector3(scene?.scene?.player?.position) || !finite(scene?.scene?.player?.yaw)
    || !vector3(scene?.scene?.target?.position)
    || scene.scene.target.kind !== (mode === 'solo-quality-combat' ? 'bot' : 'remote-player')
    || scene.scene.signature !== pass71NativeBrowserParitySceneSignature({ mode, ...scene.scene }, contract)) {
    failures.push(`${prefix}:deterministic-scene-signature`);
  }
  exactKeys(scene?.runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterLabel', 'softwareAdapter',
    'deviceLost', 'uncapturedErrors',
  ], `${prefix}:runtime`, failures);
  if (!object(scene?.runtime) || scene.runtime.requestedBackend !== 'webgl2'
    || scene.runtime.actualBackend !== 'webgl2' || scene.runtime.initialized !== true
    || scene.runtime.softwareAdapter !== false || SOFTWARE_ADAPTER.test(scene.runtime.adapterLabel ?? '')
    || typeof scene.runtime.adapterLabel !== 'string' || scene.runtime.adapterLabel.trim() === ''
    || scene.runtime.deviceLost !== false || scene.runtime.uncapturedErrors !== 0
    || !String(scene.webglVersion ?? '').includes('WebGL 2')) failures.push(`${prefix}:hardware-webgl2`);
  exactKeys(scene?.requestedGraphics, Object.keys(PASS71_QUALITY_REQUESTED_GRAPHICS), `${prefix}:requested-graphics`, failures);
  exactKeys(scene?.effectiveGraphics, Object.keys(PASS71_QUALITY_EFFECTIVE_GRAPHICS), `${prefix}:effective-graphics`, failures);
  if (scene.displayedGraphicsPreset !== 'high'
    || !sameJson(scene.requestedGraphics, PASS71_QUALITY_REQUESTED_GRAPHICS)
    || !sameJson(scene.effectiveGraphics, PASS71_QUALITY_EFFECTIVE_GRAPHICS)
    || scene.principalHdrSamples !== 4) failures.push(`${prefix}:named-quality-settings`);
  validateFrameWindow(scene.performance, prefix, contract, failures);
  validateResourceStability(scene.resources, prefix, failures);
  exactKeys(scene.renderInventory, ['before', 'after'], `${prefix}:render-inventory`, failures);
  validateInventory(scene.renderInventory?.before, `${prefix}:render-inventory:before`, failures);
  validateInventory(scene.renderInventory?.after, `${prefix}:render-inventory:after`, failures);
  if (scene.renderInventory?.before?.sha256 !== scene.renderInventory?.after?.sha256) {
    failures.push(`${prefix}:material-or-drawable-drift`);
  }
  validateRenderBudget(scene.renderBudget, prefix, contract, failures);
  for (const phase of ['before', 'after']) {
    const sceneFrames = Array.isArray(scene?.scene?.samples?.[phase])
      ? scene.scene.samples[phase].map((sample) => sample?.frameCount)
      : null;
    const rendererFrames = Array.isArray(scene?.renderBudget?.[phase]?.rendererSamples)
      ? scene.renderBudget[phase].rendererSamples.map((sample) => sample?.frameCount)
      : null;
    if (!sameJson(sceneFrames, rendererFrames)) failures.push(`${prefix}:scene-render-sample-alignment:${phase}`);
  }
  validatePresentation(scene.presentation, prefix, failures);
  validateAction(scene.action, mode, prefix, contract, failures);
  validateFaults(scene.faults, prefix, failures);
  if (!String(scene.route ?? '').includes('/channels/the-big-one/')) failures.push(`${prefix}:candidate-route`);
}

function validateBrowser(browser, browserName, contract, failures) {
  const prefix = browserName;
  exactKeys(browser, ['name', 'identity', 'scenes'], prefix, failures);
  if (!object(browser) || browser.name !== browserName || !Array.isArray(browser.scenes)
    || !sameJson(browser.scenes.map((scene) => scene?.mode), contract.sceneModes)) {
    failures.push(`${prefix}:scene-set`);
  }
  validateIdentity(browser?.identity, browserName, prefix, failures);
  if (Array.isArray(browser?.scenes)) {
    for (const [index, mode] of contract.sceneModes.entries()) {
      if (browser.scenes[index]) validateScene(browser.scenes[index], mode, `${prefix}:${mode}`, contract, failures);
    }
  }
}

function ratio(numerator, denominator) {
  return finite(numerator) && finite(denominator) && denominator > 0 ? numerator / denominator : null;
}

export function pass71NativeBrowserParityFailures(record, expected = {}) {
  const contract = expected.contract ?? PASS71_NATIVE_BROWSER_PARITY;
  const failures = [];
  if (!object(record) || record.schemaVersion !== contract.schemaVersion
    || record.evidenceId !== contract.evidenceId || record.kind !== contract.kind
    || record.contract !== contract.contract || record.gate !== contract.gate
    || record.status !== 'passed') return ['receipt-identity-or-status'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'gate', 'status', 'startedAt',
    'completedAt', 'source', 'servedCandidate', 'environment', 'tooling', 'browsers',
    'comparison', 'faults', 'claims', 'receiptSha256',
  ], 'receipt', failures);
  exactKeys(record.source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTree',
    'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  const expectedSourceSha = expected.sourceSha ?? record.source?.expectedSourceSha;
  if (!SHA40.test(expectedSourceSha ?? '') || !object(record.source)
    || record.source.expectedSourceSha !== expectedSourceSha
    || record.source.checkoutSourceSha !== expectedSourceSha
    || record.source.endingCheckoutSourceSha !== expectedSourceSha
    || !SHA40.test(record.source.sourceTree ?? '')
    || record.source.cleanBefore !== true || record.source.cleanAfter !== true) failures.push('exact-source-identity');
  exactKeys(record.servedCandidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], 'served-candidate', failures);
  if (!object(record.servedCandidate) || record.servedCandidate.schemaVersion !== 4
    || record.servedCandidate.channel !== 'the-big-one' || record.servedCandidate.releasePass !== 'PASS 71'
    || record.servedCandidate.sourceSha !== expectedSourceSha
    || record.servedCandidate.path !== 'channels/the-big-one'
    || !SHA256.test(record.servedCandidate.treeSha256 ?? '')
    || !Number.isSafeInteger(record.servedCandidate.exactRootFileCount)
    || record.servedCandidate.exactRootFileCount < 2) failures.push('staged-candidate-provenance');
  exactKeys(record.environment, ['machine', 'hostnameSha256', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.platform !== 'win32' || typeof record.environment?.arch !== 'string'
    || record.environment.arch.trim() === ''
    || record.environment?.machine !== PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID
    || record.environment?.hostnameSha256 !== PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256
    || (typeof expected.machine === 'string' && record.environment.machine !== expected.machine)) {
    failures.push('native-windows-environment');
  }
  const expectedTooling = expected.tooling ?? record.tooling;
  if (!object(record.tooling) || !object(expectedTooling)
    || Object.keys(record.tooling).sort().join(',') !== Object.keys(expectedTooling).sort().join(',')
    || Object.entries(expectedTooling).some(([key, value]) => !SHA256.test(value ?? '') || record.tooling[key] !== value)) {
    failures.push('exact-source-tooling');
  }
  exactKeys(record.browsers, ['chrome', 'firefox'], 'browsers', failures);
  validateBrowser(record.browsers?.chrome, 'chrome', contract, failures);
  validateBrowser(record.browsers?.firefox, 'firefox', contract, failures);
  exactKeys(record.comparison, ['scenes'], 'comparison', failures);
  const chromeScenes = record.browsers?.chrome?.scenes;
  const firefoxScenes = record.browsers?.firefox?.scenes;
  if (!Array.isArray(record.comparison?.scenes)
    || !sameJson(record.comparison.scenes.map((entry) => entry?.mode), contract.sceneModes)) {
    failures.push('comparison-scene-set');
  } else if (Array.isArray(chromeScenes) && Array.isArray(firefoxScenes)) {
    for (const [index, mode] of contract.sceneModes.entries()) {
      const chrome = chromeScenes[index];
      const firefox = firefoxScenes[index];
      const prefix = `comparison:${mode}`;
      if (chrome?.scene?.signature !== firefox?.scene?.signature) failures.push(`${prefix}:scene-signature`);
      if (chrome?.renderInventory?.before?.sha256 !== firefox?.renderInventory?.before?.sha256
        || !sameJson(
          stableRenderBudgetIdentity(chrome?.renderBudget?.before),
          stableRenderBudgetIdentity(firefox?.renderBudget?.before),
        )) {
        failures.push(`${prefix}:draw-material-scene-signature`);
      }
      const measured = {
        mode,
        firefoxMedianFpsRatio: ratio(firefox?.performance?.medianFps, chrome?.performance?.medianFps),
        firefoxPresentedFpsRatio: ratio(firefox?.performance?.presentedFps, chrome?.performance?.presentedFps),
        firefoxP95FrameTimeRatio: ratio(firefox?.performance?.p95FrameTimeMs, chrome?.performance?.p95FrameTimeMs),
        firefoxMaximumFrameTimeRatio: ratio(firefox?.performance?.maximumFrameTimeMs, chrome?.performance?.maximumFrameTimeMs),
      };
      if (!sameJson(record.comparison.scenes[index], measured)) failures.push(`${prefix}:receipt-mismatch`);
      if (!finite(measured.firefoxMedianFpsRatio)
        || measured.firefoxMedianFpsRatio < contract.minimumFirefoxMedianFpsRatio) failures.push(`${prefix}:median-fps-ratio`);
      if (!finite(measured.firefoxPresentedFpsRatio)
        || measured.firefoxPresentedFpsRatio < contract.minimumFirefoxPresentedFpsRatio) failures.push(`${prefix}:presented-fps-ratio`);
      if (!finite(measured.firefoxP95FrameTimeRatio)
        || measured.firefoxP95FrameTimeRatio > contract.maximumFirefoxP95FrameTimeRatio) failures.push(`${prefix}:p95-frame-time-ratio`);
      if (!finite(measured.firefoxMaximumFrameTimeRatio)
        || measured.firefoxMaximumFrameTimeRatio > contract.maximumFirefoxMaximumFrameTimeRatio) failures.push(`${prefix}:maximum-frame-time-ratio`);
    }
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  exactKeys(record.claims, ['observed', 'inference', 'assumption', 'unknown', 'falsifiers'], 'claims', failures);
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71NativeBrowserParityRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71NativeBrowserParityReceipt(record, expected = {}) {
  const failures = pass71NativeBrowserParityFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 native browser parity failed: ${failures.join(', ')}`);
  return record;
}

export function validatePass71NativeBrowserParityEvidence(record, context) {
  const tooling = pass71NativeBrowserParityToolingHashesAtSource(context.repositoryRoot, context.sourceSha);
  return pass71NativeBrowserParityFailures(record, {
    sourceSha: context.sourceSha,
    tooling,
    machine: PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID,
  });
}

function fixtureInventory() {
  const entries = [
    { name: 'Atomic arena', material: 'MeshStandardMaterial:arena', triangles: 1_000 },
    { name: 'M4A1', material: 'MeshStandardMaterial:m4a1', triangles: 100 },
  ];
  return {
    entries,
    drawables: entries.length,
    uniqueMaterials: 2,
    triangles: 1_100,
    sha256: digest(canonicalBytes(entries)),
  };
}

function fixtureScene(mode, medianFps = 60, p95 = 16, maximum = 17) {
  const elapsedMs = 9_000;
  const interval = 1_000 / medianFps;
  const intervalsMs = Array.from({ length: Math.max(120, Math.round(elapsedMs / interval)) }, () => interval);
  intervalsMs[intervalsMs.length - 2] = p95;
  intervalsMs[intervalsMs.length - 1] = maximum;
  const summary = summarizePass71FrameWindow(intervalsMs, elapsedMs);
  const gameFrameDelta = summary.sampleCount;
  const residency = {
    activeTextureBytes: 1_000, cachedTextureBytes: 100, totalTextureBytes: 1_100,
    activeGeometryBytes: 2_000, cachedGeometryBytes: 200, totalGeometryBytes: 2_200,
    activeTextures: 10, cachedTextures: 1, activeGeometries: 20, cachedGeometries: 2,
  };
  const renderBudget = {
    drawCalls: 2, triangles: 1_100, rendererReportedCalls: 2,
    totalActiveShadowLights: 1, totalActiveShadowMapPixels: 4_194_304,
    authoritativeArenaRoots: 1, duplicateArenaRoots: false, playerCamera: true,
    route: 'complete-playable-game',
  };
  const renderBudgetAt = (startingFrame) => ({
    ...renderBudget,
    rendererSamples: Array.from({ length: PASS71_NATIVE_BROWSER_PARITY.stableTelemetrySampleCount }, (_, index) => ({
      frameCount: startingFrame + index,
      calls: renderBudget.rendererReportedCalls,
    })),
  });
  const presentation = {
    status: 'synchronous', submissionSequence: 0, completedSequence: 0,
    completionFailures: 0, uncapturedErrors: 0, deviceLost: false,
  };
  const targetKind = mode === 'solo-quality-combat' ? 'bot' : 'remote-player';
  const playerPosition = [22, 1.7, -39];
  const targetPosition = mode === 'solo-quality-combat' ? [19.06, 0, -44.22] : [19.06, 1.7, -44.22];
  const staging = {
    contract: PASS71_NATIVE_BROWSER_PARITY.sceneStageContract,
    positionToleranceM: PASS71_NATIVE_BROWSER_PARITY.scenePositionToleranceM,
    maximumSampleDriftM: PASS71_NATIVE_BROWSER_PARITY.maximumSceneSampleDriftM,
    playerPosition: [...playerPosition],
    targetPosition: [...targetPosition],
  };
  const sceneSamplesAt = (startingFrame) => Array.from({ length: PASS71_NATIVE_BROWSER_PARITY.stableTelemetrySampleCount }, (_, index) => ({
    frameCount: startingFrame + index,
    playerPosition: [...playerPosition],
    playerYaw: 2.628,
    targetPosition: [...targetPosition],
  }));
  const sceneIdentity = {
    arenaId: 'atomic-acres', qualityAssetState: 'ready', seed: `pass71-native-parity-${mode}-v3`,
    botCount: mode === 'solo-quality-combat' ? 1 : 0,
    remoteCount: mode === 'hosted-quality-combat' ? 1 : 0,
    memberCount: mode === 'hosted-quality-combat' ? 2 : 0,
    hostRole: mode === 'hosted-quality-combat' ? 'host' : 'offline',
    staging,
    samples: { before: sceneSamplesAt(100), after: sceneSamplesAt(1_000) },
    player: { position: [...playerPosition], yaw: 2.628 },
    target: { position: [...targetPosition], kind: targetKind },
  };
  return {
    mode,
    route: `http://127.0.0.1:4561/channels/the-big-one/?map=atomic-acres&renderer=webgl2&scene=${mode}`,
    viewport: { ...PASS71_NATIVE_BROWSER_PARITY.viewport },
    freshProfile: true,
    freshBrowserProcess: true,
    scene: {
      ...sceneIdentity,
      gameStarted: true,
      matchPhase: 'active',
      signature: pass71NativeBrowserParitySceneSignature({ mode, ...sceneIdentity }),
    },
    runtime: {
      requestedBackend: 'webgl2', actualBackend: 'webgl2', initialized: true,
      adapterLabel: 'NVIDIA GeForce RTX 5080', softwareAdapter: false,
      deviceLost: false, uncapturedErrors: 0,
    },
    webglVersion: 'WebGL 2.0',
    displayedGraphicsPreset: 'high',
    requestedGraphics: PASS71_QUALITY_REQUESTED_GRAPHICS,
    effectiveGraphics: PASS71_QUALITY_EFFECTIVE_GRAPHICS,
    principalHdrSamples: 4,
    settleMs: 6_100,
    performance: {
      ...summary,
      gameFrameDelta,
      presentedFps: gameFrameDelta * 1_000 / elapsedMs,
      gameFrameToCallbackRatio: gameFrameDelta / summary.sampleCount,
      intervalsMs,
      longTasks: { entries: [], count: 0, totalDurationMs: 0, maximumDurationMs: 0 },
    },
    resources: { before: { ...residency }, after: { ...residency } },
    renderInventory: { before: fixtureInventory(), after: fixtureInventory() },
    renderBudget: { before: renderBudgetAt(100), after: renderBudgetAt(1_000) },
    presentation: { before: { ...presentation }, after: { ...presentation } },
    action: {
      timeline: PASS71_NATIVE_BROWSER_PARITY.actionTimeline,
      trustedEvents: PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS.map((event, index) => ({
        ...event,
        sequence: 10 + index,
        eventTimestampMs: 1_000 + index,
        observedAtMs: 1_000.25 + index,
        pointerLocked: event.phase !== 'pointer-lock' || index === 2,
        trusted: true,
      })),
      pointerLocked: true, ammoBefore: 2, ammoAfterFire: 1, ammoAfterReload: 30,
      reserveAfterReload: 1, reloadObserved: true, reloadCompleted: true,
      targetHealthBefore: 100, targetHealthAfter: 75, targetKind,
    },
    faults: {
      bootstrapError: null, runtimeErrorLog: '', fatalErrorVisible: false, capturedErrors: [],
      watchdogStatus: 'healthy', watchdogIncidents: 0, contextLosses: 0,
      documentVisible: true, documentFocused: true,
    },
  };
}

export function createPass71NativeBrowserParityFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(
    Object.keys(PASS71_NATIVE_BROWSER_PARITY_TOOL_PATHS).map((key, index) => [`${key}Sha256`, String((index % 9) + 1).repeat(64)]),
  );
  const chromeScenes = PASS71_NATIVE_BROWSER_PARITY.sceneModes.map((mode) => fixtureScene(mode, 60, 16, 17));
  const firefoxScenes = PASS71_NATIVE_BROWSER_PARITY.sceneModes.map((mode) => fixtureScene(mode, 50, 20, 21.25));
  const record = {
    schemaVersion: PASS71_NATIVE_BROWSER_PARITY.schemaVersion,
    evidenceId: PASS71_NATIVE_BROWSER_PARITY.evidenceId,
    kind: PASS71_NATIVE_BROWSER_PARITY.kind,
    contract: PASS71_NATIVE_BROWSER_PARITY.contract,
    gate: PASS71_NATIVE_BROWSER_PARITY.gate,
    status: 'passed',
    startedAt: options.startedAt ?? '2026-08-13T10:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T10:20:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha, sourceTree: 'b'.repeat(40),
      cleanBefore: true, cleanAfter: true,
    },
    servedCandidate: {
      schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
      path: 'channels/the-big-one', treeSha256: 'c'.repeat(64), exactRootFileCount: 500,
    },
    environment: {
      machine: PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID,
      hostnameSha256: PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256,
      platform: 'win32',
      arch: 'x64',
    },
    tooling,
    browsers: {
      chrome: {
        name: 'chrome',
        identity: {
          channel: 'chrome', installed: true, executableName: 'chrome.exe',
          executableSha256: 'd'.repeat(64), executableVersion: '151.0.1.2',
          runtimeVersion: '151.0.1.2',
          installRoot: 'C:\\Program Files\\Google\\Chrome\\Application',
          authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Google LLC',
          userAgent: 'Mozilla/5.0 Chrome/151.0.1.2',
        },
        scenes: chromeScenes,
      },
      firefox: {
        name: 'firefox',
        identity: {
          channel: 'firefox', installed: true, executableName: 'firefox.exe',
          executableSha256: 'e'.repeat(64), executableVersion: '150.0.1',
          runtimeVersion: '150.0.1',
          installRoot: 'C:\\Program Files\\Mozilla Firefox',
          authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Mozilla Corporation',
          userAgent: 'Mozilla/5.0 Firefox/150.0.1',
          geckodriver: { executableSha256: 'f'.repeat(64), version: 'geckodriver 0.36.0' },
        },
        scenes: firefoxScenes,
      },
    },
    comparison: {
      scenes: PASS71_NATIVE_BROWSER_PARITY.sceneModes.map((mode, index) => ({
        mode,
        firefoxMedianFpsRatio: firefoxScenes[index].performance.medianFps / chromeScenes[index].performance.medianFps,
        firefoxPresentedFpsRatio: firefoxScenes[index].performance.presentedFps / chromeScenes[index].performance.presentedFps,
        firefoxP95FrameTimeRatio: firefoxScenes[index].performance.p95FrameTimeMs / chromeScenes[index].performance.p95FrameTimeMs,
        firefoxMaximumFrameTimeRatio: firefoxScenes[index].performance.maximumFrameTimeMs / chromeScenes[index].performance.maximumFrameTimeMs,
      })),
    },
    faults: [],
    claims: {
      observed: 'Installed Chrome and Firefox ran identical exact-A Quality solo and hosted action timelines.',
      inference: 'A passing receipt supports foreground native Firefox and Chrome parity on this machine.',
      assumption: 'The two bounded scenes represent the reported browser pacing regression.',
      unknown: 'Other machines and drivers are outside this receipt.',
      falsifiers: 'Any identity, Quality, scene, action, allocation, draw, fault, cadence or ratio drift fails.',
    },
  };
  record.receiptSha256 = pass71NativeBrowserParityRecordSha256(record);
  return record;
}
