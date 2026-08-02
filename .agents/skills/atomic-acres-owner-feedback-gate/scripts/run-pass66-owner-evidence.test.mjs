import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHardwareWebGl2ReceiptFixture } from '../../../../scripts/qa/pass65-hardware-webgl2-receipt-contract.mjs';
import {
  EvidenceRunnerError,
  PASS66_BROWSER_FOREGROUND_TEST_ID,
  PASS66_EXACT_PACKAGE_SCRIPTS,
  PASS66_HIDDEN_TAB_TEST_ID,
  analyzeCoverage,
  attestNormalCommandAfterPass,
  buildMappings,
  createNormalReceipt,
  createVisualArtifactIdentity,
  decideResumeAction,
  evidenceKindsForTest,
  parseLedger,
  parseMatrix,
  requirementNeedsVisual,
  requireCompleteCoverage,
  runSelfTest,
  sha256,
  tokenizeExactCommand,
  validateEvidenceClaims,
  validateHardwareArtifact,
  validateNormalReceipt,
  validatePass66BlockingCatalog,
  validatePass66ExactPackageScripts,
} from './run-pass66-owner-evidence.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const graphPath = path.join(repoRoot, 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json');
const matrixPath = path.join(repoRoot, 'docs/PASS65_REQUIREMENTS_MATRIX.md');
const ledgerPath = path.join(repoRoot, 'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md');
const digest = 'd'.repeat(64);
const sourceSha = 'a'.repeat(40);

function codeIs(expected) {
  return (error) => error instanceof EvidenceRunnerError && error.code === expected;
}

function loadCanonical() {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  validatePass66BlockingCatalog(graph);
  const matrixRows = parseMatrix(fs.readFileSync(matrixPath, 'utf8'));
  const ledgerRows = parseLedger(fs.readFileSync(ledgerPath, 'utf8'));
  const coverage = requireCompleteCoverage(analyzeCoverage(graph, matrixRows, ledgerRows));
  return { graph, matrixRows, ledgerRows, coverage };
}

function artifactFor(testId) {
  return {
    id: `ART-P66-${testId.replace(/^T-/, '')}`,
    path: `artifacts/pass65-owner-feedback/${testId.toLowerCase()}.json`,
    sha256: digest,
  };
}

const exactPass66TestIds = [
  PASS66_BROWSER_FOREGROUND_TEST_ID,
  PASS66_HIDDEN_TAB_TEST_ID,
  'T-SUPPORT-RUNTIME',
  'T-INTERACTION',
  'T-WEAPON-PRESENTATION',
  'T-DESTRUCTIBLE',
  'T-ADDITIONAL-MAPS',
  'T-BOTS',
  'T-MULTIPLAYER-STABILITY',
  'T-PASS61-NETCODE',
  'T-PRIVATE-LOBBY',
  'T-PASS63-MULTIPLAYER-COMPARATOR',
  'T-ADS-SIGHT-CATALOG',
  'T-SCOPED-ADS',
  'T-SKY-WEBGPU',
  'T-VIEWMODEL-FRAMING',
  'T-PRONE-CONTACT-MATRIX',
  'T-SUPPORT-OPERATE-PROMPT',
  'T-AUDIO-LONG-RUN',
  'T-KILLSTREAK-DEMO-VIDEOS',
  'T-BROWSER-ADMISSION',
  'T-INSTALLED-FIREFOX',
  'T-GUN-RANGE-TEST-BAY',
  'T-TIMED-MAP-WEAPONS',
  'T-RAILGUN',
];

test('canonical graph deterministically covers 75 commands, 207 feedback rows, and all 99 requirements', () => {
  const { graph, matrixRows, ledgerRows, coverage } = loadCanonical();
  assert.equal(coverage.testCount, 75);
  assert.equal(coverage.feedbackCount, 207);
  assert.equal(coverage.requirementCount, 99);
  assert.deepEqual(coverage.orphanTests, []);
  assert.deepEqual(coverage.orphanRequirements, []);
  for (const testEntry of graph.testCatalog) validateEvidenceClaims(repoRoot, testEntry);

  const visualByTest = new Map(graph.testCatalog
    .filter((entry) => evidenceKindsForTest(entry).kinds.includes('visual'))
    .map((entry) => [entry.id, { digest }]));
  const mappings = buildMappings({
    graph,
    matrixRows,
    ledgerRows,
    coverage,
    artifacts: graph.testCatalog.map((entry) => artifactFor(entry.id)),
    visualByTest,
    sourceSha,
  });
  assert.equal(mappings.allFeedbackCoverage.length, 207);
  assert.equal(mappings.requirementEvidence.length, 99);
  assert.deepEqual(
    mappings.allFeedbackCoverage.map((entry) => entry.feedbackId),
    [...mappings.allFeedbackCoverage.map((entry) => entry.feedbackId)].sort(),
  );
  const visualRows = matrixRows.filter(requirementNeedsVisual).map((row) => row.id);
  assert.ok(visualRows.includes('R102'));
  assert.ok(visualRows.includes('R303'));
  assert.ok(visualRows.includes('R608'));
  for (const row of mappings.requirementEvidence.filter((entry) => visualRows.includes(entry.planningRequirementId))) {
    assert.equal(row.acceptance, 'mixed');
    assert.ok(row.evidence.some((entry) => entry.kind === 'browser'));
    assert.ok(row.evidence.some((entry) => entry.kind === 'visual'));
  }
  for (const feedbackIds of coverage.feedbackByTest.values()) {
    assert.deepEqual(feedbackIds, [...feedbackIds].sort());
  }
  assert.deepEqual(validatePass66BlockingCatalog(graph).testIds, exactPass66TestIds);
  assert.deepEqual(coverage.feedbackByTest.get(PASS66_BROWSER_FOREGROUND_TEST_ID), ['HF-152', 'HF-200']);
  assert.deepEqual(coverage.feedbackByTest.get(PASS66_HIDDEN_TAB_TEST_ID), ['HF-152', 'HF-200']);
});

test('exact Pass 66 package aliases reject missing or substituted aggregate launchers', () => {
  assert.deepEqual(
    validatePass66ExactPackageScripts(PASS66_EXACT_PACKAGE_SCRIPTS).scriptIds,
    Object.keys(PASS66_EXACT_PACKAGE_SCRIPTS),
  );
  for (const scriptId of Object.keys(PASS66_EXACT_PACKAGE_SCRIPTS)) {
    const substituted = { ...PASS66_EXACT_PACKAGE_SCRIPTS, [scriptId]: 'node scripts/qa/not-the-owned-gate.mjs' };
    assert.throws(
      () => validatePass66ExactPackageScripts(substituted),
      codeIs('E_GRAPH_PASS66_PACKAGE_SCRIPT'),
      `${scriptId} substitution must fail`,
    );
  }
});

test('every exact Pass 66 aggregate gate rejects catalog removal or command substitution', () => {
  const { graph } = loadCanonical();
  for (const testId of exactPass66TestIds) {
    const removed = structuredClone(graph);
    removed.testCatalog = removed.testCatalog.filter((testEntry) => testEntry.id !== testId);
    assert.throws(
      () => validatePass66BlockingCatalog(removed),
      codeIs('E_GRAPH_PASS66_TEST_CONTRACT'),
      `${testId} removal must fail`,
    );

    const substituted = structuredClone(graph);
    substituted.testCatalog.find((testEntry) => testEntry.id === testId).command = 'npm run test';
    assert.throws(
      () => validatePass66BlockingCatalog(substituted),
      codeIs('E_GRAPH_PASS66_TEST_CONTRACT'),
      `${testId} substitution must fail`,
    );
  }
});

test('blocking Pass 66 scheduling evidence rejects synchronized removal or command substitution', () => {
  const { graph } = loadCanonical();
  const removed = structuredClone(graph);
  removed.testCatalog = removed.testCatalog.filter((testEntry) => testEntry.id !== PASS66_HIDDEN_TAB_TEST_ID);
  removed.feedbackNodes.find((node) => node.id === 'HF-152').verification.testRefs =
    removed.feedbackNodes.find((node) => node.id === 'HF-152').verification.testRefs
      .filter((testRef) => testRef !== PASS66_HIDDEN_TAB_TEST_ID);
  assert.throws(() => validatePass66BlockingCatalog(removed), codeIs('E_GRAPH_PASS66_TEST_CONTRACT'));

  const substituted = structuredClone(graph);
  substituted.testCatalog.find((testEntry) => testEntry.id === PASS66_BROWSER_FOREGROUND_TEST_ID).command =
    'npx vitest run src/browser-preparation-scheduler.test.ts';
  assert.throws(() => validatePass66BlockingCatalog(substituted), codeIs('E_GRAPH_PASS66_TEST_CONTRACT'));
});

test('direct gameplay falsifiers reject dropped semantic tests or feedback mappings', () => {
  const { graph } = loadCanonical();
  const contracts = [
    {
      testId: 'T-SUPPORT-RUNTIME',
      requiredPath: 'src/killstreak-drone-deployment.test.ts',
      feedbackIds: ['HF-142', 'HF-143'],
    },
    {
      testId: 'T-INTERACTION',
      requiredPath: 'src/interaction-press-lifecycle.test.ts',
      feedbackIds: ['HF-144'],
    },
    {
      testId: 'T-WEAPON-PRESENTATION',
      requiredPath: 'src/operator-model.test.ts',
      feedbackIds: ['HF-157'],
    },
    {
      testId: 'T-DESTRUCTIBLE',
      requiredPath: 'src/glass-main-integration.test.ts',
      feedbackIds: ['HF-154', 'HF-155', 'HF-157', 'HF-158'],
    },
    {
      testId: 'T-ADDITIONAL-MAPS',
      requiredPath: 'src/additional-maps.test.ts',
      feedbackIds: ['HF-157'],
    },
    {
      testId: 'T-BOTS',
      requiredPath: 'src/bot-perception-authority.test.ts',
      feedbackIds: ['HF-159', 'HF-160'],
    },
  ];

  for (const contract of contracts) {
    const substituted = structuredClone(graph);
    const testEntry = substituted.testCatalog.find((entry) => entry.id === contract.testId);
    testEntry.command = testEntry.command.replace(` ${contract.requiredPath}`, '');
    assert.throws(
      () => validatePass66BlockingCatalog(substituted),
      codeIs('E_GRAPH_PASS66_TEST_CONTRACT'),
      `${contract.testId} must execute ${contract.requiredPath}`,
    );

    for (const feedbackId of contract.feedbackIds) {
      const unmapped = structuredClone(graph);
      const feedback = unmapped.feedbackNodes.find((node) => node.id === feedbackId);
      feedback.verification.testRefs = feedback.verification.testRefs.filter((testRef) => testRef !== contract.testId);
      assert.throws(
        () => validatePass66BlockingCatalog(unmapped),
        codeIs('E_GRAPH_PASS66_GATE_REQUIRED'),
        `${feedbackId} must remain mapped to ${contract.testId}`,
      );
    }
  }
});

test('coverage fails missing, extra, duplicate, and unknown graph relationships', () => {
  const { graph, matrixRows, ledgerRows } = loadCanonical();
  const orphanTest = structuredClone(graph);
  orphanTest.testCatalog.push({ id: 'T-ORPHAN', command: 'npm run test', paths: ['package.json'] });
  assert.throws(() => requireCompleteCoverage(analyzeCoverage(orphanTest, matrixRows, ledgerRows)), codeIs('E_ORPHAN_TEST'));

  const orphanRequirementRows = [...matrixRows, {
    id: 'R999', requirement: 'Synthetic orphan', expected: 'covered', falsifier: 'missing', requiredEvidence: 'receipt', state: 'PLANNED',
  }];
  assert.throws(() => requireCompleteCoverage(analyzeCoverage(graph, orphanRequirementRows, ledgerRows)), codeIs('E_ORPHAN_REQUIREMENT'));

  const duplicate = structuredClone(graph);
  duplicate.testCatalog.push(structuredClone(duplicate.testCatalog[0]));
  assert.throws(() => analyzeCoverage(duplicate, matrixRows, ledgerRows), codeIs('E_DUPLICATE'));

  const unknown = structuredClone(graph);
  unknown.feedbackNodes[0].verification.testRefs.push('T-NOT-REAL');
  assert.throws(() => analyzeCoverage(unknown, matrixRows, ledgerRows), codeIs('E_TEST_UNKNOWN'));
});

test('exact command tokenizer cannot interpret shell operators', () => {
  assert.deepEqual(tokenizeExactCommand('npx vitest run "src/a test.ts"'), ['npx', 'vitest', 'run', 'src/a test.ts']);
  for (const command of [
    'npm run one && npm run two',
    'npm run one | more',
    'npm run one; whoami',
    'npm run one > output.log',
    'npm run one `whoami`',
    'node test.mjs',
    'npx vitest run "unterminated',
  ]) assert.throws(() => tokenizeExactCommand(command), codeIs('E_COMMAND'));
});

test('normal receipts bind exact source, build, verifier, environment, feedback, and visual bytes', () => {
  const receipt = createNormalReceipt({
    sourceSha,
    buildDigest: digest,
    testId: 'T-RECEIPT',
    verifierDigest: 'e'.repeat(64),
    environmentHash: 'f'.repeat(64),
    feedbackIds: ['HF-002', 'HF-001'],
    visualDigest: 'c'.repeat(64),
  });
  assert.deepEqual(receipt.feedbackIds, ['HF-001', 'HF-002']);
  assert.match(receipt.buildId, /-visual-c{64}$/);
  validateNormalReceipt(receipt, structuredClone(receipt));
  for (const mutation of [
    { sourceSha: 'b'.repeat(40) },
    { buildId: 'wrong' },
    { verifierVersion: 'wrong' },
    { environmentHash: '0'.repeat(64) },
    { feedbackIds: ['HF-001'] },
  ]) assert.throws(() => validateNormalReceipt({ ...receipt, ...mutation }, receipt), codeIs('E_RECEIPT_STALE'));
});

test('normal attestation writes only after exit zero and unchanged post-run identity', async () => {
  const before = { sourceSha, buildDigest: digest, verifierDigest: digest, environmentHash: digest };
  let snapshots = 0;
  let writes = 0;
  await assert.rejects(attestNormalCommandAfterPass({
    testId: 'T-FAIL', before,
    executeExact: async () => ({ code: 7, signal: null }),
    snapshotAfter: async () => { snapshots += 1; return before; },
    createAttestation: async () => ({ receipt: {} }),
    writeReceipt: async () => { writes += 1; },
  }), codeIs('E_TEST_FAILED'));
  assert.equal(snapshots, 0);
  assert.equal(writes, 0);

  await assert.rejects(attestNormalCommandAfterPass({
    testId: 'T-DRIFT', before,
    executeExact: async () => ({ code: 0, signal: null }),
    snapshotAfter: async () => ({ ...before, buildDigest: 'e'.repeat(64) }),
    createAttestation: async () => ({ receipt: {} }),
    writeReceipt: async () => { writes += 1; },
  }), codeIs('E_POST_DRIFT'));
  assert.equal(writes, 0);

  const expectedReceipt = { ok: true };
  const result = await attestNormalCommandAfterPass({
    testId: 'T-PASS', before,
    executeExact: async () => ({ code: 0, signal: null }),
    snapshotAfter: async () => structuredClone(before),
    createAttestation: async () => ({ receipt: expectedReceipt }),
    writeReceipt: async (receipt) => { assert.equal(receipt, expectedReceipt); writes += 1; },
  });
  assert.equal(result.attestation.receipt, expectedReceipt);
  assert.equal(writes, 1);
});

test('visual artifacts are recursive, digest-bound, and fresh for command-produced output', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pass66-visual-'));
  try {
    const artifactDirectory = path.join(temporaryRoot, 'artifacts', 'visual');
    fs.mkdirSync(artifactDirectory, { recursive: true });
    const imagePath = path.join(artifactDirectory, 'frame.png');
    fs.writeFileSync(imagePath, Buffer.from('fresh-image'));
    const testEntry = {
      id: 'T-VISUAL', command: 'npm run visual', paths: ['package.json'],
      evidenceKinds: ['contract', 'visual'], visualArtifactPaths: ['artifacts/visual'],
    };
    const first = createVisualArtifactIdentity(temporaryRoot, testEntry, { freshSinceMs: Date.now() - 1_000 });
    assert.match(first.digest, /^[0-9a-f]{64}$/);
    const staleSiblingPath = path.join(artifactDirectory, 'stale-frame.png');
    fs.writeFileSync(staleSiblingPath, Buffer.from('stale-image'));
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(staleSiblingPath, old, old);
    assert.throws(
      () => createVisualArtifactIdentity(temporaryRoot, testEntry, { freshSinceMs: Date.now() - 1_000 }),
      codeIs('E_VISUAL_STALE'),
    );
    fs.rmSync(staleSiblingPath);
    fs.writeFileSync(imagePath, Buffer.from('changed-image'));
    const second = createVisualArtifactIdentity(temporaryRoot, testEntry);
    assert.notEqual(second.digest, first.digest);
    fs.utimesSync(imagePath, old, old);
    assert.throws(() => createVisualArtifactIdentity(temporaryRoot, testEntry, { freshSinceMs: Date.now() }), codeIs('E_VISUAL_STALE'));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('resume consumes valid evidence but schedules missing or stale evidence for exact rerun', () => {
  let validations = 0;
  const missing = decideResumeAction({
    exists: false,
    validateExisting: () => { validations += 1; },
  });
  assert.deepEqual(missing, { action: 'execute', reason: 'missing' });
  assert.equal(validations, 0);

  const valid = decideResumeAction({
    exists: true,
    validateExisting: () => { validations += 1; return { receipt: 'exact-S0' }; },
  });
  assert.deepEqual(valid, { action: 'resume', reason: 'valid', value: { receipt: 'exact-S0' } });

  const stale = decideResumeAction({
    exists: true,
    validateExisting: () => { validations += 1; throw new EvidenceRunnerError('E_RECEIPT_STALE', 'stale'); },
  });
  assert.deepEqual(stale, { action: 'execute', reason: 'invalid', validationCode: 'E_RECEIPT_STALE' });

  const malformed = decideResumeAction({
    exists: true,
    validateExisting: () => { validations += 1; throw new SyntaxError('bad JSON'); },
  });
  assert.deepEqual(malformed, { action: 'execute', reason: 'invalid', validationCode: 'E_JSON' });
  assert.equal(validations, 3);
  assert.throws(() => decideResumeAction({
    exists: true,
    validateExisting: () => { throw new Error('unexpected I/O failure'); },
  }), /unexpected I\/O failure/);
});

test('visual requirements cannot be emitted as mechanical-only evidence', () => {
  const graph = {
    schemaVersion: 1,
    releasePass: 'PASS 65',
    graphId: 'pass65-owner-feedback-round1',
    testCatalog: [{ id: 'T-ONLY', command: 'npx vitest run visual.test.ts', paths: ['visual.test.ts'] }],
    feedbackNodes: [{ id: 'HF-001', planningRequirementIds: ['R001'], verification: { testRefs: ['T-ONLY'] } }],
  };
  const matrixRows = [{
    id: 'R001', requirement: 'Visible HUD', expected: 'Visual state is correct', falsifier: 'Screenshot differs', requiredEvidence: 'Browser screenshot', state: 'PLANNED',
  }];
  const ledgerRows = [{ id: 'HF-001', priority: 'P0' }];
  const coverage = requireCompleteCoverage(analyzeCoverage(graph, matrixRows, ledgerRows));
  assert.throws(() => buildMappings({
    graph,
    matrixRows,
    ledgerRows,
    coverage,
    artifacts: [artifactFor('T-ONLY')],
    visualByTest: new Map(),
    sourceSha,
  }), codeIs('E_VISUAL_BROWSER_GAP'));
});

test('hardware WebGL2 consumes the original exact schema-v2 owner artifact and rejects wrappers/drift', () => {
  const fixture = createHardwareWebGl2ReceiptFixture(sourceSha);
  const ownerPath = `artifacts/pass65-owner-feedback/hardware-webgl2-admission-${sourceSha}.json`;
  const detailPath = `artifacts/pass65/hardware-webgl2-admission/${sourceSha}-receipt.json`;
  const manifestPath = `artifacts/pass65/hardware-webgl2-admission/${sourceSha}-dist-manifest.json`;
  const feedbackIds = ['HF-041', 'HF-065'];
  const owner = {
    schemaVersion: 2,
    kind: 'pass65-owner-feedback-evidence',
    sourceSha,
    buildId: `pass66-s0-${sourceSha}`,
    verifierId: 'pass65-installed-chrome-hardware-webgl2-admission',
    verifierVersion: '1',
    environmentHash: fixture.environmentHash,
    result: 'passed',
    feedbackIds,
    testRefs: ['T-COLD-HARDWARE-WEBGL2'],
    detailedReceiptPath: detailPath,
    detailedReceiptSha256: fixture.detailedReceiptSha256,
    buildManifestPath: manifestPath,
    buildManifestSha256: fixture.buildManifestSha256,
  };
  const chromePath = fixture.detailedReceipt.environment.chromeExecutable;
  const bytes = new Map([
    [detailPath, fixture.detailedBytes],
    [manifestPath, fixture.manifestBytes],
    [`@absolute:${chromePath}`, fixture.chromeExecutableBytes],
  ]);
  const validate = (candidate = owner, manifest = fixture.manifest) => {
    bytes.set(ownerPath, Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8'));
    return validateHardwareArtifact({
      repoRoot,
      sourceSha,
      expectedFeedbackIds: feedbackIds,
      currentBuildManifest: manifest,
      ownerRelativePath: ownerPath,
      readBytes: (key) => {
        const value = bytes.get(key);
        if (!value) throw new Error(`missing fixture ${key}`);
        return value;
      },
      fileExists: (candidatePath) => candidatePath === chromePath,
    });
  };
  const accepted = validate();
  assert.equal(accepted.receipt.schemaVersion, 2);
  assert.equal(accepted.sha256, sha256(bytes.get(ownerPath)));
  assert.throws(() => validate({ ...owner, schemaVersion: 1 }), codeIs('E_HARDWARE_SCHEMA'));
  assert.throws(() => validate({ ...owner, verifierId: 'T-COLD-HARDWARE-WEBGL2' }), codeIs('E_HARDWARE_VERIFIER'));
  assert.throws(() => validate({ ...owner, verifierId: 'pass65-installed-chrome-hardware-webgl2-admission-v2' }), codeIs('E_HARDWARE_VERIFIER'));
  assert.throws(() => validate({ ...owner, verifierVersion: '2' }), codeIs('E_HARDWARE_VERIFIER'));
  assert.throws(() => validate({ ...owner, feedbackIds: ['HF-041'] }), codeIs('E_HARDWARE_FEEDBACK'));
  assert.throws(() => validate({ ...owner, detailedReceiptSha256: '0'.repeat(64) }), codeIs('E_HARDWARE_DIGEST'));
  assert.throws(() => validate(owner, { ...fixture.manifest, files: [...fixture.manifest.files, { path: 'extra.js', bytes: 1, sha256: digest }] }), codeIs('E_HARDWARE_BUILD'));
});

test('embedded mutation self-test remains green', () => {
  const result = runSelfTest();
  assert.equal(result.ok, true);
  assert.ok(result.mutationCases.includes('visual downgraded to mechanical-only'));
});
