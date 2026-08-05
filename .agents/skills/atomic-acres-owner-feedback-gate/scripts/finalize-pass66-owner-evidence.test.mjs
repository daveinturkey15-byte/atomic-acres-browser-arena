import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FinalizationError,
  artifactIdForTest,
  buildFinalization,
  createSelfTestFixture,
  isAllowedS0mPath,
  runSelfTest,
  validateExactArtifactCatalog,
  writeFinalizationOutputs,
} from './finalize-pass66-owner-evidence.mjs';
import {
  PASS66_BROWSER_FOREGROUND_TEST_ID,
  PASS66_HIDDEN_TAB_TEST_ID,
} from './run-pass66-owner-evidence.mjs';

const temporaryRoots = [];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const hardwareTestId = 'T-COLD-HARDWARE-WEBGL2';
const hardwareVerifierId = 'pass65-installed-chrome-hardware-webgl2-admission';

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function buildFixture(fixture = createSelfTestFixture()) {
  return buildFinalization({
    ...fixture,
    repoRoot: process.cwd(),
    readBytes: (relativePath) => fixture.bytesByPath.get(relativePath) ?? null,
    fileExists: () => true,
    validateAcceptance: false,
  });
}

function errorCode(code) {
  return (caught) => caught instanceof FinalizationError && caught.code === code;
}

function exactCatalogForGraph(graph) {
  const feedbackByTest = new Map(graph.testCatalog.map((test) => [test.id, []]));
  for (const node of graph.feedbackNodes) {
    for (const testRef of node.verification.testRefs) feedbackByTest.get(testRef).push(node.id);
  }
  return graph.testCatalog.map((test) => ({
    id: artifactIdForTest(test.id),
    verifierId: test.id === hardwareTestId ? hardwareVerifierId : test.id,
    verifierVersion: test.id === hardwareTestId ? '1' : 'fixture',
    testRefs: [test.id],
    feedbackIds: feedbackByTest.get(test.id).sort(),
  }));
}

describe('Pass 66 owner-evidence finalizer', () => {
  it('passes its fail-closed mutation corpus', () => {
    const result = runSelfTest();
    assert.equal(result.ok, true);
    assert.equal(result.deterministicOutputs, 3);
    assert.equal(result.mutationCases, 12);
    assert.ok(result.cases.includes('umbrella receipt cannot infer a missing row mapping'));
    assert.ok(result.cases.includes('runtime drift'));
  });

  it('is deterministic across reordered explicit mapping inputs', () => {
    const firstFixture = createSelfTestFixture();
    const first = buildFixture(firstFixture);
    const secondFixture = createSelfTestFixture();
    secondFixture.plan.artifacts.reverse();
    secondFixture.plan.feedbackEvidence.reverse();
    secondFixture.plan.requirementEvidence.reverse();
    for (const requirement of secondFixture.plan.requirementEvidence) requirement.evidence.reverse();
    const second = buildFixture(secondFixture);

    assert.deepEqual(second.outputDigests, first.outputDigests);
    const graph = JSON.parse(second.outputs.get('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json').toString('utf8'));
    assert.deepEqual(graph.artifactCatalog.map((artifact) => artifact.id), ['ART-P66-A', 'ART-P66-B']);
    assert.deepEqual(graph.feedbackNodes.find((node) => node.id === 'HF-003').verification, {
      coverage: 'partial',
      testRefs: ['T-B'],
      artifactRefs: [],
    });
  });

  it('plans without touching the filesystem and writes only the three generated S0M files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass66-owner-finalizer-'));
    temporaryRoots.push(root);
    const result = buildFixture();
    assert.deepEqual(fs.readdirSync(root), []);

    writeFinalizationOutputs(result, root);
    const written = [
      'acceptance/pass-66.json',
      'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md',
      'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json',
    ];
    for (const relativePath of written) {
      assert.equal(fs.existsSync(path.join(root, relativePath)), true);
      assert.equal(isAllowedS0mPath(relativePath), true);
    }
    assert.equal(fs.existsSync(path.join(root, 'src')), false);
  });

  it('rolls back earlier allowed writes if a later path is forbidden', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pass66-owner-finalizer-rollback-'));
    temporaryRoots.push(root);
    const result = buildFixture();
    result.outputs.set('src/runtime-drift.json', Buffer.from('{}\n'));

    assert.throws(() => writeFinalizationOutputs(result, root), FinalizationError);
    assert.equal(fs.existsSync(path.join(root, 'acceptance/pass-66.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/runtime-drift.json')), false);
  });

  it('requires the exact canonical graph catalog, including every P2-only test', () => {
    const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json'), 'utf8'));
    const catalog = exactCatalogForGraph(graph);
    assert.equal(catalog.length, 55);
    assert.doesNotThrow(() => validateExactArtifactCatalog(graph, catalog));
    const hardwareArtifact = catalog.find((artifact) => artifact.testRefs[0] === hardwareTestId);
    assert.ok(hardwareArtifact, `${hardwareTestId} must remain in the frozen graph`);
    assert.equal(hardwareArtifact.verifierId, hardwareVerifierId);
    assert.equal(hardwareArtifact.verifierVersion, '1');

    const wrongHardwareVerifier = structuredClone(catalog);
    wrongHardwareVerifier.find((artifact) => artifact.testRefs[0] === hardwareTestId).verifierId = hardwareTestId;
    assert.throws(
      () => validateExactArtifactCatalog(graph, wrongHardwareVerifier),
      errorCode('E_ARTIFACT_VERIFIER'),
    );

    const wrongHardwareVersion = structuredClone(catalog);
    wrongHardwareVersion.find((artifact) => artifact.testRefs[0] === hardwareTestId).verifierVersion = '2';
    assert.throws(
      () => validateExactArtifactCatalog(graph, wrongHardwareVersion),
      errorCode('E_ARTIFACT_VERIFIER_VERSION'),
    );

    for (const testId of ['T-LEADERBOARD', 'T-PRIVACY-UNIT', 'T-PRIVACY-E2E']) {
      assert.ok(graph.testCatalog.some((test) => test.id === testId), `${testId} must remain in the frozen graph`);
      assert.throws(
        () => validateExactArtifactCatalog(graph, catalog.filter((artifact) => artifact.testRefs[0] !== testId)),
        errorCode('E_ARTIFACT_TEST_SET'),
      );
    }
    for (const testId of [PASS66_BROWSER_FOREGROUND_TEST_ID, PASS66_HIDDEN_TAB_TEST_ID]) {
      assert.ok(graph.testCatalog.some((test) => test.id === testId), `${testId} must remain in the frozen graph`);
      assert.throws(
        () => validateExactArtifactCatalog(graph, catalog.filter((artifact) => artifact.testRefs[0] !== testId)),
        errorCode('E_ARTIFACT_TEST_SET'),
      );
    }
  });

  it('rejects duplicate or substituted test receipts independently of the runner', () => {
    const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json'), 'utf8'));
    const catalog = exactCatalogForGraph(graph);
    assert.throws(
      () => validateExactArtifactCatalog(graph, [...catalog, structuredClone(catalog[0])]),
      errorCode('E_ARTIFACT_TEST_DUPLICATE'),
    );

    const substituted = structuredClone(catalog);
    [substituted[0].id, substituted[1].id] = [substituted[1].id, substituted[0].id];
    assert.throws(
      () => validateExactArtifactCatalog(graph, substituted),
      errorCode('E_ARTIFACT_CANONICAL_ID'),
    );
  });

  it('rejects a receipt with a forged graph feedback set', () => {
    const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json'), 'utf8'));
    const catalog = exactCatalogForGraph(graph);
    const target = catalog.find((artifact) => artifact.feedbackIds.length > 0);
    assert.ok(target);
    target.feedbackIds = target.feedbackIds.slice(1);
    assert.throws(
      () => validateExactArtifactCatalog(graph, catalog),
      errorCode('E_ARTIFACT_FEEDBACK_SET'),
    );
  });
});
