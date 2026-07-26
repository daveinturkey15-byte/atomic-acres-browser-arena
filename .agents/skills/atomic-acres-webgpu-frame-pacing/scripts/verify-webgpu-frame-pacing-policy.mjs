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
