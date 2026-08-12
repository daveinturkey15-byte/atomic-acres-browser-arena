import { isAbsolute } from 'node:path';
import { PASS70_NATIVE_USER_AGENT_ENV } from './pass70-cross-browser-native-user-agent-contract.mjs';

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OWNED_CANDIDATE_URL = /^http:\/\/127\.0\.0\.1:\d+\/channels\/the-big-one\/$/u;

export const PASS66_MULTIPLAYER_BROWSER_CHANNEL = 'chrome';
export const PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV = 'QA_MULTIPLAYER_BROWSER_CHANNEL';
export const PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV = 'QA_MULTIPLAYER_BROWSER_EXECUTABLE_PATH';
export const PASS66_MULTIPLAYER_BROWSER_SHA256_ENV = 'QA_MULTIPLAYER_BROWSER_EXECUTABLE_SHA256';
export const PASS66_MULTIPLAYER_REMOTE_PLAYWRIGHT_ENV = Object.freeze([
  'PW_TEST_CONNECT_WS_ENDPOINT',
  'PW_TEST_CONNECT_HEADERS',
  'PW_TEST_CONNECT_EXPOSE_NETWORK',
]);

export const PASS66_MULTIPLAYER_SPECS = Object.freeze([
  Object.freeze({
    path: 'tests/e2e/pass66-host-crash-rejoin.spec.ts',
    expectedTests: 1,
    titles: Object.freeze(['a crashed host explicitly resumes the same active room and guests plus bots converge']),
  }),
  Object.freeze({
    path: 'tests/e2e/pass66-owner-feedback-multiplayer-ui.spec.ts',
    expectedTests: 1,
    titles: Object.freeze(['host map changes converge and lobby controls remain stable across streak selection']),
  }),
  Object.freeze({
    path: 'tests/e2e/pass66-timed-map-weapons-multiplayer-rejoin.spec.ts',
    expectedTests: 3,
    titles: Object.freeze([
      'flamethrower authority converges after explicit guest rejoin without replay',
      'flare-gun authority converges after explicit guest rejoin without replay',
      'an active flare repairs a rejoining guest without duplicate replicas',
    ]),
  }),
  Object.freeze({
    path: 'tests/e2e/pass66-qoder-multiplayer-authority.spec.ts',
    expectedTests: 4,
    titles: Object.freeze([
      'post-death ladders survive authenticated replacements and an immediate host renderer crash exactly once',
      'a guest death-drop scavenge converges through host authority exactly once',
      'Semtex and crossbolt sticky results apply once under duplicate, reorder and guest rejoin',
      'host-authoritative facing flash and semantic smoke break bot lock while the guest observes safe replicas',
    ]),
  }),
  Object.freeze({
    path: 'tests/e2e/pass66-adrenaline-match-lifecycle.spec.ts',
    expectedTests: 1,
    titles: Object.freeze(['Adrenaline ends at the round boundary and cannot resurrect through lobby, rematch, or crash rejoin']),
  }),
]);

export const PASS66_MULTIPLAYER_TEST_COUNT = PASS66_MULTIPLAYER_SPECS
  .reduce((sum, spec) => sum + spec.expectedTests, 0);

export const PASS66_MULTIPLAYER_PEER_OWNERS = Object.freeze([
  'hostCrashRejoin',
  'ownerFeedbackMultiplayerUi',
  'timedMapWeaponsMultiplayerRejoin',
  'qoderMultiplayerAuthority',
  'adrenalineMatchLifecycle',
]);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function installedChromeExecutable(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  return /\/Google\/Chrome\/Application\/chrome\.exe$/iu.test(normalized)
    || normalized === '/opt/google/chrome/chrome'
    || normalized === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function canonicalSpecPath(value) {
  const normalized = normalizePath(value);
  return PASS66_MULTIPLAYER_SPECS.find(({ path }) => (
    normalized === path || normalized.endsWith(`/${path}`) || normalized === path.split('/').at(-1)
  ))?.path ?? null;
}

export function multiplayerStabilityEnvironmentFailures(environment) {
  const errors = [];
  const baseUrl = environment.QA_BASE_URL ?? '';
  if (environment.QA_OWNED_GATE !== 'multiplayer-stability') {
    errors.push('owned gate must be multiplayer-stability');
  }
  if (!/^PASS \d+(?:\.\d+)?$/u.test(environment.QA_OWNED_RELEASE_PASS ?? '')) {
    errors.push('owned release pass is invalid');
  }
  if (!OWNED_CANDIDATE_URL.test(baseUrl)) errors.push('QA_BASE_URL must be the owned candidate channel route');
  if (environment.BASE_URL !== baseUrl) errors.push('BASE_URL must exactly match QA_BASE_URL');
  if (!SHA40.test(environment.QA_OWNED_SOURCE_SHA ?? '')) errors.push('owned source SHA is invalid');
  if (!SHA256.test(environment.QA_OWNED_TREE_SHA256 ?? '')) errors.push('owned tree digest is invalid');
  const fileCount = Number(environment.QA_OWNED_FILE_COUNT ?? Number.NaN);
  if (!Number.isSafeInteger(fileCount) || fileCount < 2) errors.push('owned file count is invalid');
  if (!isAbsolute(environment.QA_OWNED_RECEIPT_PATH ?? '')) errors.push('owned receipt path must be absolute');
  if (environment[PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV] !== PASS66_MULTIPLAYER_BROWSER_CHANNEL) {
    errors.push('owned browser channel must be installed Chrome');
  }
  if (!installedChromeExecutable(environment[PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV])) {
    errors.push('owned browser executable must be installed Google Chrome');
  }
  if (!SHA256.test(environment[PASS66_MULTIPLAYER_BROWSER_SHA256_ENV] ?? '')) {
    errors.push('owned browser executable SHA-256 is invalid');
  }
  if (environment[PASS70_NATIVE_USER_AGENT_ENV] !== '1') {
    errors.push('owned browser must expose its native user agent');
  }
  if (environment.QA_INSTALLED_EDGE === '1') {
    errors.push('owned browser must not drift to installed Edge');
  }
  for (const key of PASS66_MULTIPLAYER_REMOTE_PLAYWRIGHT_ENV) {
    if (environment[key] !== undefined) errors.push(`owned browser rejects remote Playwright environment ${key}`);
  }
  return errors;
}

export function multiplayerServedCandidateFailures(value, expected) {
  if (!record(value)) return ['served candidate provenance must be an object'];
  const errors = [];
  if (value.schemaVersion !== 4 || value.channel !== 'the-big-one'
    || value.releasePass !== expected.releasePass || value.path !== 'channels/the-big-one') {
    errors.push('served candidate identity mismatch');
  }
  if (value.sourceSha !== expected.sourceSha) errors.push('served candidate source SHA mismatch');
  if (value.treeSha256 !== expected.treeSha256) errors.push('served candidate tree digest mismatch');
  if (value.exactRootFileCount !== expected.exactRootFileCount) errors.push('served candidate file count mismatch');
  return errors;
}

function collectReportSpecs(suites, inheritedFile, output, errors) {
  if (!Array.isArray(suites)) {
    errors.push('Playwright suites must be an array');
    return;
  }
  for (const suite of suites) {
    if (!record(suite)) {
      errors.push('Playwright suite must be an object');
      continue;
    }
    const suiteFile = suite.file ?? inheritedFile;
    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        const file = canonicalSpecPath(spec?.file ?? suiteFile);
        if (file === null) {
          errors.push(`unexpected Playwright spec file ${String(spec?.file ?? suiteFile ?? '(missing)')}`);
          continue;
        }
        output.push({ file, spec });
      }
    }
    if (suite.suites !== undefined) collectReportSpecs(suite.suites, suiteFile, output, errors);
  }
}

export function multiplayerPlaywrightReportFailures(value) {
  if (!record(value)) return ['Playwright JSON report must be an object'];
  const errors = [];
  if (!Array.isArray(value.errors) || value.errors.length !== 0) {
    errors.push('Playwright report-level errors must be empty');
  }
  if (!record(value.stats)) {
    errors.push('Playwright stats are missing');
  } else {
    if (value.stats.expected !== PASS66_MULTIPLAYER_TEST_COUNT) {
      errors.push(`Playwright expected count must be ${PASS66_MULTIPLAYER_TEST_COUNT}`);
    }
    if (value.stats.skipped !== 0) errors.push('Playwright skipped count must be zero');
    if (value.stats.unexpected !== 0) errors.push('Playwright unexpected count must be zero');
    if (value.stats.flaky !== 0) errors.push('Playwright flaky count must be zero');
  }

  const collected = [];
  collectReportSpecs(value.suites, undefined, collected, errors);
  const byFile = new Map(PASS66_MULTIPLAYER_SPECS.map(({ path }) => [path, []]));
  for (const item of collected) byFile.get(item.file)?.push(item.spec);
  for (const expected of PASS66_MULTIPLAYER_SPECS) {
    const specs = byFile.get(expected.path) ?? [];
    if (specs.length !== expected.expectedTests) {
      errors.push(`${expected.path} must report exactly ${expected.expectedTests} tests`);
    }
    if (JSON.stringify(specs.map((spec) => spec?.title)) !== JSON.stringify(expected.titles)) {
      errors.push(`${expected.path} test titles do not match the frozen stability contract`);
    }
    for (const spec of specs) {
      if (spec?.ok !== true) errors.push(`${expected.path} contains a non-passing spec`);
      if (!Array.isArray(spec?.tests) || spec.tests.length !== 1) {
        errors.push(`${expected.path} must contain exactly one Chromium test projection per spec`);
        continue;
      }
      const test = spec.tests[0];
      if (test?.projectName !== 'chromium' || test?.expectedStatus !== 'passed') {
        errors.push(`${expected.path} contains a non-Chromium or non-passing expected test`);
      }
      if (!Array.isArray(test?.results) || test.results.length !== 1 || test.results[0]?.status !== 'passed') {
        errors.push(`${expected.path} must pass exactly once with retries disabled`);
      }
    }
  }
  if (collected.length !== PASS66_MULTIPLAYER_TEST_COUNT) {
    errors.push(`Playwright report must contain exactly ${PASS66_MULTIPLAYER_TEST_COUNT} specs`);
  }
  return errors;
}

export function summarizeMultiplayerPlaywrightReport(value) {
  const failures = multiplayerPlaywrightReportFailures(value);
  if (failures.length > 0) throw new Error(`Invalid multiplayer Playwright report: ${failures.join('; ')}`);
  const collected = [];
  collectReportSpecs(value.suites, undefined, collected, []);
  return {
    stats: {
      expected: value.stats.expected,
      skipped: value.stats.skipped,
      unexpected: value.stats.unexpected,
      flaky: value.stats.flaky,
      durationMs: value.stats.duration,
    },
    totalTests: PASS66_MULTIPLAYER_TEST_COUNT,
    passedTests: PASS66_MULTIPLAYER_TEST_COUNT,
    specs: PASS66_MULTIPLAYER_SPECS.map((expected) => {
      const specs = collected.filter(({ file }) => file === expected.path).map(({ spec }) => spec);
      return {
        path: expected.path,
        testCount: specs.length,
        passedCount: specs.length,
        titles: specs.map((spec) => spec.title),
        durationMs: specs.reduce((sum, spec) => (
          sum + spec.tests[0].results.reduce((testSum, result) => testSum + Number(result.duration ?? 0), 0)
        ), 0),
      };
    }),
  };
}

export function multiplayerStabilityReceiptFailures(value, expected) {
  if (!record(value)) return ['multiplayer stability receipt must be an object'];
  const errors = [];
  if (value.schemaVersion !== 3 || value.status !== 'PASS'
    || value.gate !== 'multiplayer-stability'
    || value.schema !== 'atomic-acres/multiplayer-stability@3'
    || value.releasePass !== expected.releasePass) {
    errors.push('multiplayer stability receipt identity mismatch');
  }
  if (value.sourceSha !== expected.sourceSha) errors.push('multiplayer stability source SHA mismatch');
  errors.push(...multiplayerServedCandidateFailures(value.servedCandidate, expected));
  errors.push(...multiplayerServedCandidateFailures(value.servedCandidateAfter, expected));
  if (JSON.stringify(value.servedCandidateAfter) !== JSON.stringify(value.servedCandidate)) {
    errors.push('multiplayer stability served candidate changed during verification');
  }
  const expectedArgs = [
    'test',
    ...PASS66_MULTIPLAYER_SPECS.map(({ path }) => path),
    '--project=chromium', '--workers=1', '--retries=0', '--reporter=json',
  ];
  if (!record(value.runner) || value.runner.browser !== 'chromium'
    || value.runner.channel !== PASS66_MULTIPLAYER_BROWSER_CHANNEL
    || value.runner.channel !== expected.browserChannel
    || value.runner.headless !== true
    || value.runner.nativeUserAgent !== true
    || !installedChromeExecutable(value.runner.executablePath)
    || value.runner.executablePath !== expected.browserExecutablePath
    || !SHA256.test(value.runner.executableSha256 ?? '')
    || value.runner.executableSha256 !== expected.browserExecutableSha256
    || value.runner.workers !== 1 || value.runner.retries !== 0
    || value.runner.externalPreview !== true || value.runner.baseUrl !== expected.baseUrl
    || JSON.stringify(value.runner.args) !== JSON.stringify(expectedArgs)) {
    errors.push('multiplayer stability runner identity mismatch');
  }
  const guardedSpecs = PASS66_MULTIPLAYER_SPECS.map(({ path }) => path);
  const initialAdmissionGuard = value.pageBinding?.initialAdmissionGuard;
  if (!record(value.pageBinding) || value.pageBinding.helper !== 'assertPass66OwnedCandidatePage'
    || value.pageBinding.exactCandidateRoute !== '/channels/the-big-one/'
    || JSON.stringify(value.pageBinding.guardedSpecs) !== JSON.stringify(guardedSpecs)
    || !record(initialAdmissionGuard)
    || initialAdmissionGuard.spec !== 'tests/e2e/pass66-host-crash-rejoin.spec.ts'
    || JSON.stringify(initialAdmissionGuard.roles) !== JSON.stringify(['host', 'guest'])
    || JSON.stringify(initialAdmissionGuard.terminalEvents) !== JSON.stringify(['crash', 'close'])
    || initialAdmissionGuard.timeoutMs !== 60_000) {
    errors.push('multiplayer stability page binding is incomplete');
  }
  if (!Array.isArray(value.ownedPeerServers)
    || value.ownedPeerServers.length !== PASS66_MULTIPLAYER_PEER_OWNERS.length) {
    errors.push('multiplayer stability owned PeerJS matrix is incomplete');
  } else {
    const ports = new Set();
    for (const [index, owner] of PASS66_MULTIPLAYER_PEER_OWNERS.entries()) {
      const peer = value.ownedPeerServers[index];
      if (!record(peer) || peer.owner !== owner || peer.host !== '127.0.0.1'
        || !Number.isSafeInteger(peer.port) || peer.port < 1_024 || peer.port > 65_535
        || !/^\/peerjs-[a-f0-9]{24}$/u.test(peer.path ?? '') || peer.localOnly !== true) {
        errors.push(`multiplayer stability ${owner} PeerJS identity mismatch`);
        continue;
      }
      if (ports.has(peer.port)) errors.push('multiplayer stability PeerJS ports must be distinct');
      ports.add(peer.port);
    }
  }
  const playwright = value.playwright;
  if (!record(playwright) || playwright.totalTests !== PASS66_MULTIPLAYER_TEST_COUNT
    || playwright.passedTests !== PASS66_MULTIPLAYER_TEST_COUNT
    || !record(playwright.stats) || playwright.stats.expected !== PASS66_MULTIPLAYER_TEST_COUNT
    || playwright.stats.skipped !== 0 || playwright.stats.unexpected !== 0 || playwright.stats.flaky !== 0
    || !Array.isArray(playwright.specs) || playwright.specs.length !== PASS66_MULTIPLAYER_SPECS.length) {
    errors.push('multiplayer stability Playwright summary is incomplete');
  } else {
    for (const [index, spec] of PASS66_MULTIPLAYER_SPECS.entries()) {
      const evidence = playwright.specs[index];
      if (evidence?.path !== spec.path || evidence.testCount !== spec.expectedTests
        || evidence.passedCount !== spec.expectedTests
        || JSON.stringify(evidence.titles) !== JSON.stringify(spec.titles)
        || !Number.isFinite(evidence.durationMs) || evidence.durationMs < 0) {
        errors.push(`multiplayer stability ${spec.path} summary mismatch`);
      }
    }
  }
  if (!Array.isArray(value.errors) || value.errors.length !== 0) {
    errors.push('multiplayer stability receipt errors must be empty');
  }
  return errors;
}
