import { describe, expect, it } from 'vitest';
import { summarizeWorkflow } from '../scripts/release/workflow-metrics.mjs';

describe('pipeline workflow metrics', () => {
  it('separates job start delay from execution and records acceptance lead time', () => {
    const result = summarizeWorkflow({
      id: 123,
      name: 'verify',
      event: 'pull_request',
      head_sha: 'a'.repeat(40),
      created_at: '2026-07-24T08:00:00Z',
      repository: { full_name: 'owner/repo' },
    }, [{
      name: 'static-and-unit (ubuntu-latest)',
      conclusion: 'success',
      started_at: '2026-07-24T08:02:00Z',
      completed_at: '2026-07-24T08:05:00Z',
    }], {
      feedbackReceivedAt: '2026-07-24T07:00:00Z',
      previewCreatedAt: '2026-07-24T08:06:00Z',
      approvedAt: '2026-07-24T08:16:00Z',
      total: 4,
      verified: 4,
      deferred: 0,
    });
    expect(result).toMatchObject({ wallMs: 300_000, feedbackToPreviewMs: 3_960_000, previewToApprovalMs: 600_000 });
    expect(result.jobs[0]).toMatchObject({ startDelayMs: 120_000, durationMs: 180_000 });
  });
});
