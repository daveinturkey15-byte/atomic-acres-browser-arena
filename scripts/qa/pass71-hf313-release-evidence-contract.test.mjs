import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PASS71_HF313_PINNED_CHANNELS,
  PASS71_HF313_MAX_NATIVE_EVIDENCE_JSON_BYTES,
  PASS71_HF313_PUBLIC_CHOICES,
  PASS71_HF313_RELEASE_DESCRIPTOR,
  PASS71_HF313_RELEASE_EVIDENCE,
  PASS71_HF313_RELEASE_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF313_REQUIRED_FEEDBACK_IDS,
  PASS71_HF313_TOOL_PATHS,
  PASS71_HF313_WORKFLOW_STEPS,
  createPass71Hf313EvidenceFixture,
  createPass71Hf313LivePostcondition,
  pass71Hf313DependencyProjection,
  pass71Hf313EvidenceFailures,
  pass71Hf313NativeEvidenceEnvelope,
  pass71Hf313ProductionPostconditionFailures,
  pass71Hf313RecordSha256,
} from './pass71-hf313-release-evidence-contract.mjs';

const candidateA = 'a'.repeat(40);
const candidateB = 'b'.repeat(40);
const sourceTreeSha = 'c'.repeat(40);
const dependencies = PASS71_HF313_REQUIRED_FEEDBACK_IDS.map((feedbackId, index) => ({
  feedbackId, evidenceId: feedbackId, kind: `fixture-${feedbackId.toLowerCase()}`,
  receiptSha256: ((index % 15) + 1).toString(16).repeat(64),
})).sort((left, right) => `${left.feedbackId}\u0000${left.evidenceId}\u0000${left.kind}\u0000${left.receiptSha256}`
  .localeCompare(`${right.feedbackId}\u0000${right.evidenceId}\u0000${right.kind}\u0000${right.receiptSha256}`));
const tooling = PASS71_HF313_TOOL_PATHS.map((path, index) => ({ path, sha256: ((index % 15) + 1).toString(16).repeat(64) }));
const sourceAudit = {
  schemaVersion: 1, sourceSha: candidateA, manifestAbsent: true,
  releaseConfig: {
    schemaVersion: 4, latestLabel: 'PASS 71',
    experimental: { label: 'PASS 71', pass: 'PASS 71', path: 'channels/the-big-one' },
    retained: { label: 'PASS 70 · PREVIOUS LIVE', description: 'retained', ...PASS71_HF313_PINNED_CHANNELS.retained },
    internalStable: { label: 'STABLE SINGLEPLAYER', pass: 'PASS 67.1' },
    rollback: { label: 'PASS 63 · STABLE WEBGL', description: 'rollback', ...PASS71_HF313_PINNED_CHANNELS.rollback, rebuiltFromSource: true },
  },
  publicChoices: [...PASS71_HF313_PUBLIC_CHOICES],
  workflow: {
    orderedSteps: [...PASS71_HF313_WORKFLOW_STEPS], stepOffsets: PASS71_HF313_WORKFLOW_STEPS.map((_, index) => index + 1),
    ordered: true, onlyProtectedPublisher: true, candidateAPreviewVerifier: true,
    acceptanceBeforePublish: true, topologyBeforePublish: true, pagesAndLiveBeforeReceipt: true,
  },
  finalizer: { exactManifestPathOnly: true, standingConditionalNoHitl: true, candidateAOriginalAttemptOnly: true },
  postcondition: {
    receiptSchemaVersion: 4,
    rollbackProvenanceLiveChecked: true,
    pinnedWrapperIdentityStaticChecked: true,
    pinnedWrapperIdentityLiveChecked: true,
    liveVerifiedStatusOwnedByReceipt: true,
  },
};
const dependencyRecords = dependencies.map((entry, index) => ({
  ...entry, completedAt: `2026-08-13T09:${String(index).padStart(2, '0')}:00.000Z`,
}));
const dependencyEnvelope = pass71Hf313NativeEvidenceEnvelope(dependencyRecords);
const expected = { sourceSha: candidateA, sourceTreeSha, sourceAudit, tooling, dependencies, dependencyEnvelope };

function fixture() {
  return createPass71Hf313EvidenceFixture(expected);
}

function resign(record) {
  record.receiptSha256 = pass71Hf313RecordSha256(record);
  return record;
}

function pinnedTopologyChannel(expectedChannel, channel) {
  return {
    schemaVersion: 4, channel, releasePass: expectedChannel.pass,
    sourceSha: expectedChannel.sourceSha, pagesSha: expectedChannel.pagesSha,
    pagesPath: expectedChannel.pagesPath, path: expectedChannel.path,
    exactRootFileCount: expectedChannel.pagesSubtreeFileCount,
    treeSha256: expectedChannel.pagesSubtreeTreeSha256,
    pinnedRuntime: {
      releasePass: expectedChannel.pass, sourceSha: expectedChannel.sourceSha,
      exactRootFileCount: expectedChannel.runtimeFileCount,
      treeSha256: expectedChannel.runtimeTreeSha256,
    },
  };
}

function productionInput() {
  const readiness = fixture();
  return {
    sourceSha: candidateB, releasePass: 'PASS 71',
    topology: {
      schemaVersion: 4, sourceSha: candidateB, releasePass: 'PASS 71', root: { kind: 'chooser-only' },
      channels: {
        experimental: { releasePass: 'PASS 71', sourceSha: candidateB, path: 'channels/the-big-one', treeSha256: 'e'.repeat(64) },
        retained: pinnedTopologyChannel(PASS71_HF313_PINNED_CHANNELS.retained, 'pass70-retained'),
        rollback: pinnedTopologyChannel(PASS71_HF313_PINNED_CHANNELS.rollback, 'rollback'),
      },
    },
    pages: { status: 'built', pagesSha: 'f'.repeat(40) },
    acceptance: {
      ok: true, releasePass: 'PASS 71', headSha: candidateB, previewSourceSha: candidateA,
      approvalParity: { ok: true, paths: ['acceptance/pass-71.json'] },
      nativeEvidence: [{ evidenceId: 'HF-313', kind: PASS71_HF313_RELEASE_EVIDENCE.kind, receiptSha256: readiness.receiptSha256 }],
    },
    previewProvenance: {
      ok: true, sourceSha: candidateA, exactNameArtifactCount: 1, matchingLiveArtifactCount: 1,
      archiveSha256: '1'.repeat(64), treeSha256: '2'.repeat(64),
      candidateAWorkflow: { status: 'completed', conclusion: 'failure', requirementsConclusion: 'failure', shardArtifactCount: 13 },
    },
    liveSmoke: {
      ok: true, sourceSha: candidateB, releasePass: 'PASS 71', verifiedAt: '2026-08-13T10:30:00.000Z',
      chooserLabels: ['PASS 71', 'PASS 70', 'PASS 63'], failures: [],
      routes: {
        experimental: { url: 'https://example/channels/the-big-one/?release=latest', eyebrow: 'PASS 71' },
        retained: { url: 'https://example/channels/pass70-retained/?release=latest', eyebrow: 'PASS 70' },
        stable: { url: 'https://example/channels/pass63-rollback/?release=latest', eyebrow: 'PASS 63' },
        latest: {}, normal: {}, room: {},
      },
      provenance: {
        retained: {
          embedded: { sourceSha: PASS71_HF313_PINNED_CHANNELS.retained.sourceSha, treeSha256: PASS71_HF313_PINNED_CHANNELS.retained.runtimeTreeSha256 },
          wrapper: { pagesSha: PASS71_HF313_PINNED_CHANNELS.retained.pagesSha },
        },
        rollback: {
          embedded: { sourceSha: PASS71_HF313_PINNED_CHANNELS.rollback.sourceSha, treeSha256: PASS71_HF313_PINNED_CHANNELS.rollback.runtimeTreeSha256 },
          wrapper: { pagesSha: PASS71_HF313_PINNED_CHANNELS.rollback.pagesSha },
        },
      },
    },
  };
}

describe('Pass 71 HF-313 protected release evidence', () => {
  it('accepts only a truthful ready-not-live record that binds every prior feedback receipt', () => {
    assert.deepEqual(pass71Hf313EvidenceFailures(fixture(), expected), []);
    assert.deepEqual(PASS71_HF313_RELEASE_DESCRIPTOR, {
      evidenceId: 'HF-313', kind: 'pass71-hf313-protected-release-readiness', minimumCount: 0, maximumCount: 1,
    });
    assert.equal(PASS71_HF313_RELEASE_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  });

  it('projects canonical feedback ownership for exact-schema records that omit feedbackId', () => {
    const records = PASS71_HF313_REQUIRED_FEEDBACK_IDS.flatMap((feedbackId, index) => {
      const count = feedbackId === 'HF-298' ? 5 : 1;
      return Array.from({ length: count }, (_, componentIndex) => ({
        evidenceId: feedbackId,
        kind: `fixture-${feedbackId.toLowerCase()}-${componentIndex}`,
        receiptSha256: ((index + componentIndex) % 15 + 1).toString(16).repeat(64),
        completedAt: `2026-08-13T09:${String(index).padStart(2, '0')}:00.000Z`,
      }));
    });
    const hf302 = records.find((record) => record.evidenceId === 'HF-302');
    hf302.evidenceDigest = hf302.receiptSha256;
    delete hf302.receiptSha256;
    const projected = pass71Hf313DependencyProjection(records);
    assert.equal(projected.length, records.length);
    assert(projected.every((entry) => entry.feedbackId === entry.evidenceId));
    assert.equal(projected.find((entry) => entry.evidenceId === 'HF-302').receiptSha256, hf302.evidenceDigest);
    const projectedEnvelope = pass71Hf313NativeEvidenceEnvelope(records);
    const projectedExpected = {
      ...expected, dependencies: projected, dependencyEnvelope: projectedEnvelope,
    };
    assert.deepEqual(pass71Hf313EvidenceFailures(
      createPass71Hf313EvidenceFixture(projectedExpected), projectedExpected,
    ), []);

    const explicitMismatch = pass71Hf313DependencyProjection([{
      ...records[0], feedbackId: 'HF-999',
    }]);
    assert.equal(explicitMismatch[0].feedbackId, 'HF-999');
  });

  it('rejects invented live status and incomplete prior evidence', () => {
    const invented = fixture();
    invented.publication.alreadyLive = true;
    invented.publication.phase = 'live';
    resign(invented);
    assert(pass71Hf313EvidenceFailures(invented, expected).includes('truthful-prepublication-boundary'));
    const missing = fixture();
    missing.dependencies.pop();
    resign(missing);
    assert(pass71Hf313EvidenceFailures(missing, expected).includes('complete-native-evidence-binding'));
    const oversized = fixture();
    oversized.dependencyEnvelope.jsonBytes = PASS71_HF313_MAX_NATIVE_EVIDENCE_JSON_BYTES + 1;
    resign(oversized);
    assert(pass71Hf313EvidenceFailures(oversized, expected).includes('bounded-native-evidence-envelope'));
    const premature = fixture();
    premature.dependencyEnvelope.latestCompletedAt = '2026-08-13T09:48:00.001Z';
    resign(premature);
    assert(pass71Hf313EvidenceFailures(premature, expected).includes('bounded-native-evidence-envelope'));
  });

  it('rejects channel, publisher, source, tooling, schema and digest drift', () => {
    const channel = fixture();
    channel.sourceAudit.releaseConfig.retained.pagesSha = '0'.repeat(40);
    resign(channel);
    assert(pass71Hf313EvidenceFailures(channel, expected).includes('protected-release-source-audit'));
    const source = fixture();
    source.source.endingCheckoutSourceSha = candidateB;
    resign(source);
    assert(pass71Hf313EvidenceFailures(source, expected).includes('exact-clean-candidate-a'));
    const tool = fixture();
    tool.tooling[0].sha256 = '0'.repeat(64);
    resign(tool);
    assert(pass71Hf313EvidenceFailures(tool, expected).includes('candidate-a-tooling'));
    const unknown = fixture();
    unknown.live = true;
    resign(unknown);
    assert(pass71Hf313EvidenceFailures(unknown, expected).includes('record-identity-or-schema'));
    const digest = fixture();
    digest.completedAt = '2026-08-13T09:50:00.000Z';
    assert(pass71Hf313EvidenceFailures(digest, expected).includes('receipt-sha256'));
  });

  it('closes live status only from the protected post-Pages topology receipt', () => {
    const input = productionInput();
    assert.deepEqual(pass71Hf313ProductionPostconditionFailures(input), []);
    const postcondition = createPass71Hf313LivePostcondition(input);
    assert.equal(postcondition.feedbackId, 'HF-313');
    assert.equal(postcondition.status, 'live-verified');
    assert.equal(postcondition.candidateASourceSha, candidateA);
    assert.equal(postcondition.candidateBSourceSha, candidateB);
    assert.deepEqual(postcondition.publicChoices, PASS71_HF313_PUBLIC_CHOICES);
    input.liveSmoke.routes.stable.url = 'https://example/channels/recent-stable/';
    assert(pass71Hf313ProductionPostconditionFailures(input).includes('canonical-live-routes'));
  });

  it('keeps wrapper subtree identity distinct from embedded runtime identity', () => {
    const input = productionInput();
    const retained = input.topology.channels.retained;
    assert.equal(retained.exactRootFileCount, PASS71_HF313_PINNED_CHANNELS.retained.pagesSubtreeFileCount);
    assert.equal(retained.pinnedRuntime.exactRootFileCount, PASS71_HF313_PINNED_CHANNELS.retained.runtimeFileCount);
    retained.exactRootFileCount = retained.pinnedRuntime.exactRootFileCount;
    assert(pass71Hf313ProductionPostconditionFailures(input).includes('staged-release-topology'));
  });
});
