import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  FinalizationError,
  buildFinalization,
  createSelfTestFixture,
  isAllowedS0mPath,
  runSelfTest,
  writeFinalizationOutputs,
} from './finalize-pass66-owner-evidence.mjs';

const temporaryRoots = [];

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
    assert.deepEqual(graph.artifactCatalog.map((artifact) => artifact.id), ['ART-FIXTURE-1', 'ART-FIXTURE-2']);
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
});
