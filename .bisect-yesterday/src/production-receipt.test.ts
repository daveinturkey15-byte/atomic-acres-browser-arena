import { describe, expect, it } from 'vitest';
import { buildProductionReceipt } from '../scripts/release/write-production-receipt.mjs';

describe('production receipt v3', () => {
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
      schemaVersion: 3,
      durations: { startToBuildMs: 60_000, buildToPagesMs: 60_000, pagesToLiveMs: 60_000, totalMs: 180_000 },
    });
  });
});
