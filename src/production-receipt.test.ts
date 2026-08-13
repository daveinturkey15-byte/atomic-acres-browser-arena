import { describe, expect, it } from 'vitest';
import { buildProductionReceipt } from '../scripts/release/write-production-receipt.mjs';
import {
  PASS71_HF313_PINNED_CHANNELS,
  PASS71_HF313_RELEASE_EVIDENCE,
} from '../scripts/qa/pass71-hf313-release-evidence-contract.mjs';

describe('production receipt v4', () => {
  it('binds acceptance, topology, Pages, live smoke, and phase timings', () => {
    const sourceSha = 'a'.repeat(40);
    const receipt = buildProductionReceipt({
      sourceSha,
      releasePass: 'PASS 62',
      releaseStartedAt: '2026-07-24T08:00:00Z',
      releaseBuiltAt: '2026-07-24T08:01:00Z',
      workflowRun: '123',
      topology: { sourceSha, releasePass: 'PASS 62' },
      pages: { pagesSha: 'b'.repeat(40), status: 'built', createdAt: '2026-07-24T08:01:30Z', updatedAt: '2026-07-24T08:02:00Z' },
      liveSmoke: { ok: true, sourceSha, releasePass: 'PASS 62', verifiedAt: '2026-07-24T08:03:00Z' },
      acceptance: { ok: true, releasePass: 'PASS 62', total: 3, verified: 3, deferred: 0 },
    });
    expect(receipt).toMatchObject({
      schemaVersion: 4,
      durations: { startToBuildMs: 60_000, buildToPagesMs: 60_000, pagesToLiveMs: 60_000, totalMs: 180_000 },
      postconditions: {},
    });
  });

  it('owns HF-313 live verification only after exact candidate A, candidate B, Pages, and live topology agree', () => {
    const candidateA = 'a'.repeat(40);
    const candidateB = 'b'.repeat(40);
    const pinned = (channel: 'pass69-retained' | 'rollback', value: typeof PASS71_HF313_PINNED_CHANNELS.retained) => ({
      schemaVersion: 4,
      channel,
      releasePass: value.pass,
      sourceSha: value.sourceSha,
      pagesSha: value.pagesSha,
      pagesPath: value.pagesPath,
      path: value.path,
      exactRootFileCount: value.runtimeFileCount,
      treeSha256: value.runtimeTreeSha256,
      pinnedRuntime: {
        releasePass: value.pass,
        sourceSha: value.sourceSha,
        exactRootFileCount: value.runtimeFileCount,
        treeSha256: value.runtimeTreeSha256,
      },
    });
    const receipt = buildProductionReceipt({
      sourceSha: candidateB,
      releasePass: 'PASS 71',
      releaseStartedAt: '2026-08-13T08:00:00Z',
      releaseBuiltAt: '2026-08-13T08:01:00Z',
      workflowRun: '456',
      topology: {
        schemaVersion: 4,
        sourceSha: candidateB,
        releasePass: 'PASS 71',
        root: { kind: 'chooser-only' },
        channels: {
          experimental: { releasePass: 'PASS 71', sourceSha: candidateB, path: 'channels/the-big-one', treeSha256: '1'.repeat(64) },
          retained: pinned('pass69-retained', PASS71_HF313_PINNED_CHANNELS.retained),
          rollback: pinned('rollback', PASS71_HF313_PINNED_CHANNELS.rollback),
        },
      },
      pages: { pagesSha: 'c'.repeat(40), status: 'built', createdAt: '2026-08-13T08:01:30Z', updatedAt: '2026-08-13T08:02:00Z' },
      acceptance: {
        ok: true,
        releasePass: 'PASS 71',
        headSha: candidateB,
        previewSourceSha: candidateA,
        approvalParity: { ok: true, paths: ['acceptance/pass-71.json'] },
        nativeEvidence: [{ evidenceId: 'HF-313', kind: PASS71_HF313_RELEASE_EVIDENCE.kind, receiptSha256: '2'.repeat(64) }],
      },
      previewProvenance: {
        ok: true,
        sourceSha: candidateA,
        exactNameArtifactCount: 1,
        matchingLiveArtifactCount: 1,
        archiveSha256: '3'.repeat(64),
        treeSha256: '4'.repeat(64),
        candidateAWorkflow: {
          status: 'completed', conclusion: 'failure', requirementsConclusion: 'failure', shardArtifactCount: 13,
        },
      },
      liveSmoke: {
        ok: true,
        sourceSha: candidateB,
        releasePass: 'PASS 71',
        verifiedAt: '2026-08-13T08:03:00Z',
        chooserLabels: ['PASS 71', 'PASS 69', 'PASS 63'],
        failures: [],
        routes: {
          experimental: { url: 'https://example/channels/the-big-one/', eyebrow: 'PASS 71' },
          retained: { url: 'https://example/channels/pass69-retained/', eyebrow: 'PASS 69' },
          stable: { url: 'https://example/channels/pass63-rollback/', eyebrow: 'PASS 63' },
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
    });
    expect(receipt).toMatchObject({
      schemaVersion: 4,
      candidate: { candidateASourceSha: candidateA, candidateBSourceSha: candidateB, manifestOnlyFinalizer: true },
      postconditions: { hf313: { feedbackId: 'HF-313', status: 'live-verified' } },
    });
  });
});
