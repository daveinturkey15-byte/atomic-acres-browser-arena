import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../../..');
const fixtureDirectory = path.join(scriptDirectory, 'fixtures');

const EXPECTED_CONTRACT = Object.freeze({
  schemaVersion: 1,
  policyId: 'atomic-acres-webgpu-frame-pacing-v1',
  activeGameplay: Object.freeze({
    nativeWebgpuCanvasReadback: 'forbidden',
    nativeWebgpuCanvasTo2dCopy: 'forbidden',
    periodicCanvasCapture: 'forbidden',
  }),
  pauseBackdrop: Object.freeze({
    nativeWebgpu: 'css-compositor',
    webgl2Compatibility: 'one-pause-open-copy',
    maximumCopiesPerPauseOpen: 1,
    noCompositorFallback: 'generated-no-source-pixels',
  }),
  evidence: Object.freeze({
    sourceIdentity: 'exact-clean-git-sha-before-and-after',
    browser: 'installed-google-chrome',
    backend: 'native-webgpu-required-no-software-adapter',
    viewport: Object.freeze({ width: 2_560, height: 1_440, deviceScaleFactor: 1 }),
    graphics: 'Quality/high',
    arenas: Object.freeze(['atomic-acres', 'skyline-terminal']),
    comparison: 'alternating-fresh-contexts-paired-and-aggregate',
    minimumWindowMs: 10_000,
    metrics: Object.freeze(['p50Ms', 'p95Ms', 'p99Ms', 'maxMs', 'over20Ms', 'over33Ms', 'over50Ms', 'over100Ms']),
    longTasks: 'performance-observer-required-zero-steady',
    runtimeSignals: Object.freeze([
      'queue-completion-failures',
      'device-loss',
      'uncaptured-errors',
      'browser-page-request-errors',
    ]),
    ownerHitl: 'headed-exact-sha-required-before-publish',
    commands: Object.freeze([
      'npm run qa:pass65:frame-pacing',
      'npm run qa:pass65:menu-lifecycle',
      'npm run qa:multiplayer:lifecycle',
    ]),
  }),
});

const SOURCE_PATHS = Object.freeze({
  legacyMain: 'src/legacy-main.ts',
  tacticalCss: 'src/ui/tactical-ui.css',
  rootCss: 'src/style.css',
  lifecycleTest: 'tests/e2e/pass65-menu-lifecycle.spec.ts',
  frameVerifier: 'scripts/qa/verify-pass65-frame-pacing.ts',
  hardwareWebGl2Verifier: 'scripts/qa/verify-pass65-hardware-webgl2-admission.ts',
  hardwareWebGl2ReceiptContract: 'scripts/qa/pass65-hardware-webgl2-receipt-contract.mjs',
  hardwareWebGl2Gate: 'src/pass65-hardware-webgl2-admission-gate.ts',
  admissionDebugTest: 'src/admission-debug-contract.test.ts',
  presentationPrewarmTest: 'src/presentation-prewarm-contract.test.ts',
  atomicSpec: 'tests/e2e/atomic-acres.spec.ts',
  ownerFeedbackVerifier: '.agents/skills/atomic-acres-owner-feedback-gate/scripts/verify-owner-feedback-ledger.mjs',
  frameGate: 'src/pass65-frame-pacing-gate.ts',
  packageJson: 'package.json',
  agents: 'AGENTS.md',
  skillIndex: 'docs/PASS65_PROJECT_SKILLS_SPEC.md',
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function deepContractFailures(actual, expected = EXPECTED_CONTRACT, location = 'contract') {
  const failures = [];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${location} must be an array`];
    if (actual.length !== expected.length) failures.push(`${location} length ${actual.length} != ${expected.length}`);
    const limit = Math.min(actual.length, expected.length);
    for (let index = 0; index < limit; index += 1) {
      failures.push(...deepContractFailures(actual[index], expected[index], `${location}[${index}]`));
    }
    return failures;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return [`${location} must be an object`];
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      failures.push(`${location} keys ${JSON.stringify(actualKeys)} != ${JSON.stringify(expectedKeys)}`);
    }
    for (const key of expectedKeys) {
      if (Object.hasOwn(actual, key)) failures.push(...deepContractFailures(actual[key], expected[key], `${location}.${key}`));
    }
    return failures;
  }
  if (!Object.is(actual, expected)) failures.push(`${location} ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  return failures;
}

function readRepositorySources(overrides = {}) {
  return Object.fromEntries(Object.entries(SOURCE_PATHS).map(([key, relativePath]) => [
    key,
    overrides[key] ?? fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'),
  ]));
}

function occurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) !== -1) {
    count += 1;
    cursor += needle.length;
  }
  return count;
}

function requireText(source, needle, label, failures) {
  if (!source.includes(needle)) failures.push(`${label} missing ${JSON.stringify(needle)}`);
}

function functionSlice(source, functionName) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('\nfunction ', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

export function auditRepositorySources(sources = readRepositorySources()) {
  const failures = [];
  const legacy = sources.legacyMain;
  const pauseCopy = functionSlice(legacy, 'presentPauseOnlyWebGlBackdrop');
  const pausePresentation = functionSlice(legacy, 'presentActiveMatchBackdrop');
  const activeFrame = functionSlice(legacy, 'frame');

  if (!pauseCopy) failures.push('legacy-main missing presentPauseOnlyWebGlBackdrop');
  if (!pausePresentation) failures.push('legacy-main missing presentActiveMatchBackdrop');
  if (!activeFrame) failures.push('legacy-main missing frame');
  requireText(pauseCopy, "renderRuntime.backend !== 'webgl2'", 'WebGL2 pause-copy guard', failures);
  requireText(pauseCopy, 'matchPauseFrameFallbackContext.drawImage(canvas', 'WebGL2 pause-only copy', failures);
  if (pauseCopy.includes('setInterval(') || pauseCopy.includes('requestAnimationFrame(')) {
    failures.push('WebGL2 pause copy must not schedule periodic or frame-loop capture');
  }
  if (occurrences(legacy, 'matchPauseFrameFallbackContext.drawImage(canvas') !== 1) {
    failures.push('game canvas must have exactly one approved canvas-to-2D copy site');
  }
  for (const forbidden of [
    'canvas.toDataURL(',
    'canvas.toBlob(',
    'createImageBitmap(canvas',
    'matchPauseFrameFallbackContext.getImageData(',
    'matchPauseFrameFallbackContext.createPattern(canvas',
  ]) {
    if (legacy.includes(forbidden)) failures.push(`runtime contains forbidden game-canvas readback/copy: ${forbidden}`);
  }
  requireText(pausePresentation, "renderRuntime.backend === 'webgl2'", 'pause backend branch', failures);
  requireText(pausePresentation, 'pauseBackdropCompositorSupported()', 'native-WebGPU compositor branch', failures);
  requireText(pausePresentation, "frameProvenance = 'game-canvas-css-compositor'", 'native-WebGPU compositor provenance', failures);
  requireText(pausePresentation, "captureStatus = 'compositor'", 'native-WebGPU compositor status', failures);
  if (occurrences(pausePresentation, 'presentPauseOnlyWebGlBackdrop(reason)') !== 1) {
    failures.push('pause presentation must call the WebGL2 copy site at most once');
  }
  for (const forbidden of [
    'drawImage(',
    'getImageData(',
    'toDataURL(',
    'toBlob(',
    'createImageBitmap(',
    'readRenderTargetPixels(',
    'readPixels(',
    'presentActiveMatchBackdrop(',
    'presentPauseOnlyWebGlBackdrop(',
  ]) {
    if (activeFrame.includes(forbidden)) failures.push(`active frame loop contains forbidden readback/capture path: ${forbidden}`);
  }

  requireText(sources.tacticalCss, '#match-pause-backdrop', 'pause compositor CSS', failures);
  requireText(sources.tacticalCss, '\n    backdrop-filter: blur(14px)', 'pause compositor blur CSS', failures);
  requireText(sources.rootCss, ':not([data-lifecycle-surface=paused-match])', 'paused canvas visibility exception', failures);

  for (const operation of ['drawImage', 'createPattern', 'toDataURL', 'toBlob', 'createImageBitmap']) {
    requireText(sources.lifecycleTest, `rejectReadback('${operation}')`, `lifecycle ${operation} tripwire`, failures);
  }
  requireText(sources.lifecycleTest, 'expect(await gameCanvasReadbackAttempts(page)).toBe(0)', 'zero active readback assertion', failures);
  requireText(sources.lifecycleTest, 'periodicReadbackCount: 0', 'zero periodic readback assertion', failures);
  requireText(sources.lifecycleTest, 'sourceCaptureAttemptCount: 1', 'single WebGL2 pause-open attempt assertion', failures);

  const verifierTokens = [
    "const VIEWPORT = Object.freeze({ width: 2_560, height: 1_440 });",
    "const ARENA_IDS = Object.freeze(['atomic-acres', 'skyline-terminal'] as const);",
    'installed Google Chrome',
    'const sourceSha = git',
    'const cleanBefore = gitStatus().length === 0',
    'const cleanAfter = gitStatus().length === 0',
    "runtime.requestedBackend !== 'webgpu'",
    "runtime.actualBackend !== 'webgpu'",
    'runtime.softwareAdapter === true',
    'runtime.deviceLost === true',
    'runtime.uncapturedErrors !== 0',
    'presentation.completionFailures !== 0',
    "PerformanceObserver.supportedEntryTypes.includes('longtask')",
    'summarizeFramePacingWindow',
    'compareAtomicAgainstTerminal',
    "mode: headed ? 'headed-foreground' : 'headless-native-compositor'",
    'Owner-specific free-look/combat/support feel remains HITL.',
    'Final exact-S0 foreground/headed and owner free-look/combat/support feel remain separate evidence.',
  ];
  for (const token of verifierTokens) requireText(sources.frameVerifier, token, 'native frame-pacing verifier', failures);

  const webGlMatchPrewarm = functionSlice(legacy, 'prewarmExactWebGlMatchComposition');
  const matchStart = functionSlice(legacy, 'startGame');
  for (const token of [
    "renderRuntime.backend !== 'webgl2' || !atomicSignal",
    'const priorCameraLayerMask = camera.layers.mask;',
    'await withArenaFrustumCullingDisabled(scene, async () => {',
    'atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);',
    'camera.layers.mask = priorCameraLayerMask;',
  ]) requireText(webGlMatchPrewarm, token, 'exact layered WebGL2 match prewarm', failures);
  requireText(matchStart, 'await prewarmExactWebGlMatchComposition();', 'WebGL2 match admission branch', failures);
  if (matchStart.includes('await renderRuntime.compileAndRender(scene, camera, scene);')) {
    failures.push('match admission must not regress to a raw whole-scene WebGL2 compile');
  }
  const ladderTitle = 'loops the selected five-slot ladder at its final threshold without requiring banked rewards to be spent';
  const genericStartSoloMarker = 'async function startSolo(page: Page): Promise<void> {';
  const stateOnlySupportLadderMarker = 'async function startSoloForStateOnlySupportLadder(page: Page): Promise<void> {';
  const genericStartSoloStart = sources.atomicSpec.indexOf(genericStartSoloMarker);
  const stateOnlySupportLadderStartIndex = sources.atomicSpec.indexOf(stateOnlySupportLadderMarker);
  const stateOnlySupportLadderEnd = sources.atomicSpec.indexOf('\n// Browser gameplay tests', stateOnlySupportLadderStartIndex);
  const genericStartSolo = genericStartSoloStart >= 0 && stateOnlySupportLadderStartIndex > genericStartSoloStart
    ? sources.atomicSpec.slice(genericStartSoloStart, stateOnlySupportLadderStartIndex)
    : '';
  const stateOnlySupportLadderStart = stateOnlySupportLadderStartIndex >= 0 && stateOnlySupportLadderEnd > stateOnlySupportLadderStartIndex
    ? sources.atomicSpec.slice(stateOnlySupportLadderStartIndex, stateOnlySupportLadderEnd)
    : '';
  const stateOnlyActiveWaitMarker = "admissionState().matchPhase === 'active'";
  const stateOnlyActiveWaitStart = stateOnlySupportLadderStart.indexOf(stateOnlyActiveWaitMarker);
  const stateOnlyAdmissionWait = stateOnlyActiveWaitStart > 0
    ? stateOnlySupportLadderStart.slice(0, stateOnlyActiveWaitStart)
    : '';
  const stateOnlyActiveWait = stateOnlyActiveWaitStart > 0
    ? stateOnlySupportLadderStart.slice(stateOnlyActiveWaitStart)
    : '';
  requireText(sources.atomicSpec, `testInfo.title === '${ladderTitle}'`, 'exact simulation-only ladder route', failures);
  requireText(sources.atomicSpec, `test('${ladderTitle}'`, 'exact ladder test body', failures);
  requireText(sources.atomicSpec, "async () => (await debug(page)).fieldSupport.available['scout-sweep'],\n      { timeout: 2_000 },", 'exact ladder activation projection wait', failures);
  requireText(sources.atomicSpec, "simulationOnly ? '/?render=compat&renderPaused=1' : '/?render=performance'", 'simulation-only compatibility route', failures);
  requireText(genericStartSolo, '{ timeout: 15_000 }', 'frozen generic startSolo timeout', failures);
  for (const token of ['admissionState().gameStarted', '{ timeout: 15_000 }']) {
    requireText(stateOnlyAdmissionWait, token, 'state-only support-ladder admission wait', failures);
  }
  for (const token of [stateOnlyActiveWaitMarker, '{ timeout: 4_000 }', "expect(page.locator('#hud')).toBeVisible()"]) {
    requireText(stateOnlyActiveWait, token, 'state-only support-ladder active wait', failures);
  }
  if (stateOnlyActiveWait.includes('{ timeout: 15_000 }')) failures.push('state-only support-ladder active wait must remain capped at 4000ms');
  requireText(sources.atomicSpec, 'if (stateOnlySupportLadder) await startSoloForStateOnlySupportLadder(page);', 'exact state-only support-ladder routing', failures);

  for (const token of [
    'Pass 65 hardware-WebGL2 QA requires PASS65_CHROME_PATH or installed Google Chrome',
    "renderer=webgl2&render=performance&map=atomic-acres",
    "profilePath = await mkdtemp(path.join(tmpdir(), 'pass65-webgl2-'))",
    'chromium.launchPersistentContext(profilePath',
    "await page.locator('#solo').click()",
    'event.isTrusted',
    'matchAdmissionGeneration',
    'state.gameStarted && state.presentedGameplayFrame > 0',
    'gate.readPixelsTripwireInstalled',
    "stack: new Error('WebGL2 readPixels tripwire').stack",
    'validateAdmissionReadPixels(completeAdmissionReadPixels, timing.transitionReadyAt)',
    'target.__PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF__ = (timestamp) =>',
    'postReadyIntervalsMs',
    'steady-gameplay-presentation-progress-invalid',
    'completeAdmissionReadPixels',
    'validateHardwareWebGl2DetailedReceipt(receipt',
    'canonical-self-validation:',
    'requestedWindowMs = PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.steadyWindowMs',
    'validateFramePacingWindow(summary, frameWindow.longTasks.length, frameWindow.observerSupported)',
    'validatePostReadyFiftyMillisecondFrames(frameWindow.intervalsMs)',
    'const buildManifestBefore = await createBuildManifest()',
    'const buildManifestAfter = await createBuildManifest()',
    "const endingSha = git('rev-parse', 'HEAD')",
    'const chromeExecutableSha256 = sha256(await readFile(executablePath))',
    'schemaVersion: 2',
    "testRefs: ['T-COLD-HARDWARE-WEBGL2']",
  ]) requireText(sources.hardwareWebGl2Verifier, token, 'hardware-WebGL2 candidate verifier', failures);
  for (const token of [
    'freshBrowserTrials: 3',
    'maximumFirstPresentationMs: 10_000',
    'maximumActiveIncludingCountdownMs: 15_000',
    'steadyWindowMs: 10_000',
    'maximumAdmissionReadPixelsCalls: 3',
    'maximumAdmissionReadPixelsArea: 1',
    'maximumPostReadyFramesAtOrAbove50Ms: 0',
    "!/validateOutput/.test(event.stack)",
    'audit.deviceLost !== false',
  ]) requireText(sources.hardwareWebGl2Gate, token, 'hardware-WebGL2 frozen gate', failures);
  for (const token of [
    'validateHardwareWebGl2DetailedReceipt',
    'validateHardwareWebGl2BuildManifest',
    'detailed-source-or-build-binding-invalid',
    'detailed-installed-chrome-binding-invalid',
    'all-map-or-cold-atomic-proof-invalid',
    'raw-atomic-terminal-comparison-failed-or-forged',
    'steady-summary-forged-or-stale',
    'validated-output-without-readpixels-evidence',
    'post-ready-window-not-continuous-or-hitch-free',
    'steady-gameplay-presentation-progress-invalid',
    "active.atomicSignalDataset !== 'active'",
    'runtime.deviceLost !== false',
  ]) requireText(sources.hardwareWebGl2ReceiptContract, token, 'hardware-WebGL2 receipt re-evaluator', failures);
  requireText(sources.admissionDebugTest, 'starts hardware-WebGL2 admission timing from one trusted physical Solo click', 'trusted-start regression test', failures);
  requireText(sources.presentationPrewarmTest, 'await prewarmExactWebGlMatchComposition();', 'layered-prewarm regression test', failures);
  for (const token of [
    "const HARDWARE_WEBGL2_FEEDBACK_IDS",
    "E_CANDIDATE_HARDWARE_WEBGL2_ARTIFACT_REQUIRED",
    'validateHardwareWebGl2DetailedReceipt',
    'currentBuildManifest',
    'chromeExecutableBytesByPath',
  ]) requireText(sources.ownerFeedbackVerifier, token, 'owner-feedback hardware-WebGL2 enforcement', failures);

  for (const token of [
    'minimumWindowMs: 10_000',
    'p50Ms',
    'p95Ms',
    'p99Ms',
    'maxMs',
    'over20Ms',
    'over33Ms',
    'over50Ms',
    'over100Ms',
    'maximumSteadyLongTasks: 0',
    'if (summary.p99Ms > thresholds.maximumP99Ms)',
  ]) requireText(sources.frameGate, token, 'frame-tail gate', failures);

  let packageData = null;
  try {
    packageData = JSON.parse(sources.packageJson);
  } catch (error) {
    failures.push(`package.json invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const scripts = packageData?.scripts ?? {};
  const policyCommand = 'node .agents/skills/atomic-acres-webgpu-frame-pacing/scripts/verify-webgpu-frame-pacing-policy.mjs --self-test';
  if (scripts['qa:pass65:frame-pacing-policy'] !== policyCommand) failures.push('package.json missing exact frame-pacing policy self-test command');
  if (scripts['qa:pass65:frame-pacing'] !== 'npm run qa:pass65:frame-pacing-policy && npm run build && node scripts/qa/verify-pass65-frame-pacing.ts') {
    failures.push('hardware frame-pacing command must run the policy gate before build/hardware evidence');
  }
  if (scripts['qa:pass65:hardware-webgl2-admission'] !== 'npm run qa:pass65:frame-pacing-policy && npm run build && node scripts/qa/verify-pass65-hardware-webgl2-admission.ts') {
    failures.push('hardware-WebGL2 command must run the policy gate, production build and exact verifier');
  }
  if (scripts['qa:pass65:menu-lifecycle'] !== 'playwright test tests/e2e/pass65-menu-lifecycle.spec.ts --project=chromium --workers=1 --retries=0') {
    failures.push('package.json missing exact bounded Pass 65 menu lifecycle gate');
  }
  if (scripts['qa:multiplayer:lifecycle'] !== 'node scripts/qa/verify-multiplayer-lifecycle.mjs') {
    failures.push('package.json multiplayer lifecycle gate drifted');
  }
  requireText(sources.agents, 'atomic-acres-webgpu-frame-pacing', 'AGENTS skill routing', failures);
  requireText(sources.agents, 'at most one fresh pause-open canvas-to-2D copy', 'AGENTS pause-copy invariant', failures);
  requireText(sources.skillIndex, 'atomic-acres-webgpu-frame-pacing/', 'project skill index', failures);
  requireText(sources.skillIndex, '`atomic-acres-webgpu-frame-pacing`', 'project skill contract section', failures);
  return [...new Set(failures)].sort();
}

function replaced(source, needle, replacement) {
  if (!source.includes(needle)) throw new Error(`self-test mutation source missing ${JSON.stringify(needle)}`);
  return source.replace(needle, replacement);
}

function runSelfTest() {
  const knownGood = readJson(path.join(fixtureDirectory, 'known-good.json'));
  const incomplete = readJson(path.join(fixtureDirectory, 'incomplete.json'));
  const escaped = [];
  const baselineContract = deepContractFailures(knownGood);
  if (baselineContract.length) escaped.push(`known-good fixture failed: ${baselineContract.join('; ')}`);
  if (deepContractFailures(incomplete).length === 0) escaped.push('incomplete fixture passed');

  const contractMutations = [
    ['allow native WebGPU copy', value => { value.activeGameplay.nativeWebgpuCanvasTo2dCopy = 'allowed'; }],
    ['periodic capture', value => { value.activeGameplay.periodicCanvasCapture = 'allowed'; }],
    ['WebGPU snapshot', value => { value.pauseBackdrop.nativeWebgpu = 'canvas-snapshot'; }],
    ['two pause copies', value => { value.pauseBackdrop.maximumCopiesPerPauseOpen = 2; }],
    ['dirty source identity', value => { value.evidence.sourceIdentity = 'branch-name'; }],
    ['software backend', value => { value.evidence.backend = 'fallback-allowed'; }],
    ['low viewport', value => { value.evidence.viewport.width = 1_280; }],
    ['drop Terminal comparator', value => { value.evidence.arenas.pop(); }],
    ['short window', value => { value.evidence.minimumWindowMs = 1_000; }],
    ['drop p99', value => { value.evidence.metrics.splice(2, 1); }],
    ['ignore Long Tasks', value => { value.evidence.longTasks = 'ignored'; }],
    ['optional HITL', value => { value.evidence.ownerHitl = 'optional'; }],
    ['unknown self-attestation', value => { value.passed = true; }],
  ];
  for (const [label, mutate] of contractMutations) {
    const candidate = structuredClone(knownGood);
    mutate(candidate);
    if (deepContractFailures(candidate).length === 0) escaped.push(`contract mutation escaped: ${label}`);
  }

  const baselineSources = readRepositorySources();
  const baselineSourceFailures = auditRepositorySources(baselineSources);
  if (baselineSourceFailures.length) escaped.push(`repository source audit failed: ${baselineSourceFailures.join('; ')}`);
  const sourceMutations = [
    ['WebGPU allowed into copy helper', 'legacyMain', "renderRuntime.backend !== 'webgl2'", "renderRuntime.backend !== 'webgpu'"],
    ['second canvas copy', 'legacyMain', 'matchPauseFrameFallbackContext.drawImage(canvas', 'matchPauseFrameFallbackContext.drawImage(canvas); matchPauseFrameFallbackContext.drawImage(canvas'],
    ['remove compositor status', 'legacyMain', "captureStatus = 'compositor'", "captureStatus = 'canvas-snapshot'"],
    ['weaken viewport', 'frameVerifier', 'width: 2_560, height: 1_440', 'width: 1_280, height: 720'],
    ['erase clean-after check', 'frameVerifier', 'const cleanAfter = gitStatus().length === 0', 'const cleanAfter = true'],
    ['erase Long Task observer', 'frameVerifier', "PerformanceObserver.supportedEntryTypes.includes('longtask')", 'false'],
    ['erase p99 gate', 'frameGate', 'if (summary.p99Ms > thresholds.maximumP99Ms)', 'if (false)'],
    ['erase bitmap tripwire', 'lifecycleTest', "rejectReadback('createImageBitmap')", "rejectReadback('bitmap')"],
    ['erase compositor CSS', 'tacticalCss', '\n    backdrop-filter: blur(14px)', '\n    backdrop-filter: none'],
    ['remove policy package command', 'packageJson', 'qa:pass65:frame-pacing-policy', 'qa:pass65:policy-removed'],
    ['remove AGENTS routing', 'agents', 'atomic-acres-webgpu-frame-pacing', 'atomic-acres-frame-policy-removed'],
    ['remove skill index', 'skillIndex', 'atomic-acres-webgpu-frame-pacing/', 'atomic-acres-frame-policy-removed/'],
    ['weaken generic startSolo timeout', 'atomicSpec', '{ timeout: 15_000 }', '{ timeout: 15_001 }'],
    ['weaken state-only ladder admission timeout', 'atomicSpec', "admissionState().gameStarted,\n    undefined,\n    { timeout: 15_000 }", "admissionState().gameStarted,\n    undefined,\n    { timeout: 15_001 }"],
    ['weaken state-only ladder active timeout', 'atomicSpec', "admissionState().matchPhase === 'active',\n    undefined,\n    { timeout: 4_000 }", "admissionState().matchPhase === 'active',\n    undefined,\n    { timeout: 4_001 }"],
    ['weaken exact ladder activation projection wait', 'atomicSpec', "async () => (await debug(page)).fieldSupport.available['scout-sweep'],\n      { timeout: 2_000 },", "async () => (await debug(page)).fieldSupport.available['scout-sweep'],\n      { timeout: 2_001 },"],
    ['extend admission readback past transition-ready', 'hardwareWebGl2Verifier', 'validateAdmissionReadPixels(completeAdmissionReadPixels, timing.transitionReadyAt)', 'validateAdmissionReadPixels(completeAdmissionReadPixels, timing.firstGameplayPresentedAt)'],
    ['remove continuous post-ready capture', 'hardwareWebGl2Verifier', 'target.__PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF__ = (timestamp) =>', 'target.__PASS65_HARDWARE_WEBGL2_STEADY_HANDOFF_REMOVED__ = (timestamp) =>'],
    ['remove steady gameplay progress proof', 'hardwareWebGl2Verifier', 'steady-gameplay-presentation-progress-invalid', 'steady-progress-proof-removed'],
    ['remove final global readPixels proof', 'hardwareWebGl2Verifier', 'validateAdmissionReadPixels(completeAdmissionReadPixels, timing.transitionReadyAt)', 'validateAdmissionReadPixels(admissionReadPixelsAtActive, timing.transitionReadyAt)'],
    ['remove canonical receipt self-validation', 'hardwareWebGl2Verifier', 'validateHardwareWebGl2DetailedReceipt(receipt', 'validateHardwareWebGl2DetailedReceiptRemoved(receipt'],
    ['accept unknown device-loss state', 'hardwareWebGl2Gate', 'audit.deviceLost !== false', 'audit.deviceLost === true'],
    ['accept non-active AtomicSignal dataset', 'hardwareWebGl2ReceiptContract', "active.atomicSignalDataset !== 'active'", "active.atomicSignalDataset === 'fallback'"],
  ];
  for (const [label, key, needle, replacement] of sourceMutations) {
    const candidate = { ...baselineSources, [key]: replaced(baselineSources[key], needle, replacement) };
    if (auditRepositorySources(candidate).length === 0) escaped.push(`source mutation escaped: ${label}`);
  }
  return { escaped, contractMutations: contractMutations.length, sourceMutations: sourceMutations.length };
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const result = runSelfTest();
  if (result.escaped.length) {
    console.error(`FAIL webgpu-frame-pacing-policy self-test escaped=${result.escaped.length}`);
    for (const failure of result.escaped) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`PASS webgpu-frame-pacing-policy contract-mutations=${result.contractMutations} source-mutations=${result.sourceMutations}`);
  process.exit(0);
}

const contractPath = args[0] ? path.resolve(args[0]) : path.join(fixtureDirectory, 'known-good.json');
let contract;
try {
  contract = readJson(contractPath);
} catch (error) {
  console.error(`FAIL webgpu-frame-pacing-policy unreadable-contract ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
const failures = [...deepContractFailures(contract), ...auditRepositorySources()];
if (failures.length) {
  console.error(`FAIL webgpu-frame-pacing-policy failures=${failures.length}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS webgpu-frame-pacing-policy contract=${path.relative(repositoryRoot, contractPath).replaceAll('\\', '/')}`);
