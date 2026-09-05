import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('rejoin admission-drop telemetry', () => {
  it('records why a self state is rejected by movement-sequence reconciliation', () => {
    const selfStart = source.indexOf('if (incoming.id === player.id) {');
    expect(selfStart).toBeGreaterThanOrEqual(0);
    const selfEnd = source.indexOf('let remote = remotes.get(incoming.id);', selfStart);
    expect(selfEnd).toBeGreaterThan(selfStart);
    const selfBlock = source.slice(selfStart, selfEnd);
    expect(selfBlock).toContain('reconcileLocalAuthoritativeSnapshot({');
    expect(selfBlock).toContain("recordStateAdmissionDrop('local-reconciliation-stale-seq')");
    expect(selfBlock.indexOf("recordStateAdmissionDrop('local-reconciliation-stale-seq')"))
      .toBeLessThan(selfBlock.indexOf('lastAcknowledgedLocalInputSeq = incoming.seq;'));
  });

  it('records why host state is held behind the rejoin replacement latch', () => {
    const gate = 'remote.awaitingReplacementState || pendingGuestAuthorityRepairs.has(incoming.id)';
    const at = source.indexOf(gate);
    expect(at).toBeGreaterThanOrEqual(0);
    const window = source.slice(at, at + 500);
    expect(window).toContain("recordStateAdmissionDrop(remote.awaitingReplacementState ? 'rejoin-latch-awaiting-replacement' : 'rejoin-latch-pending-repair')");
  });
});
