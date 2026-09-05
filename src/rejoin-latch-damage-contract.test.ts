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

describe('rejoin damage decoupled from movement acknowledgement', () => {
  it('repairs same-life damage on a stale self echo without advancing the ack', () => {
    const selfStart = source.indexOf('if (incoming.id === player.id) {');
    const selfEnd = source.indexOf('let remote = remotes.get(incoming.id);', selfStart);
    const selfBlock = source.slice(selfStart, selfEnd);
    const helper = 'shouldApplyStaleSelfHealthRepair({ messageType: message.type';
    expect(selfBlock).toContain(helper);
    // legacy-main hands the life binding to the helper; the equality itself is unit-tested.
    expect(selfBlock).toContain('continuity: message.continuity, localContinuity');
    expect(selfBlock).toContain('incomingHp: incoming.hp, currentHp: player.hp');
    // Damage-direction repair runs inside the stale branch, before the ack advance.
    expect(selfBlock.indexOf(helper))
      .toBeLessThan(selfBlock.indexOf('lastAcknowledgedLocalInputSeq = incoming.seq;'));
    // No position/sequence movement on the stale path: only hp/alive/ammo repair.
    const staleStart = selfBlock.indexOf("recordStateAdmissionDrop('local-reconciliation-stale-seq')");
    const staleEnd = selfBlock.indexOf('lastAcknowledgedLocalInputSeq = incoming.seq;', staleStart);
    const staleBlock = selfBlock.slice(staleStart, staleEnd);
    expect(staleBlock).not.toContain('player.position.set');
    expect(staleBlock).not.toContain('lastAcknowledgedLocalInputSeq = incoming.seq');
  });
});

describe('rejoin latch recovery without bypassing authority', () => {
  it('resends the pending resume authority (throttled) instead of silently holding state', () => {
    const gate = 'remote.awaitingReplacementState || pendingGuestAuthorityRepairs.has(incoming.id)';
    const at = source.indexOf(gate);
    const window = source.slice(at, at + 800);
    expect(window).toContain('rejoinLatchResendAtMs');
    expect(window).toContain('sendGuestResumeAuthority(incoming.id, remote)');
    // The latch still drops the unauthenticated sample; resend only retries the nonce.
    expect(window).toContain('return; }');
  });

  it('re-acknowledges an already-applied resume authority without re-teleporting', () => {
    const applyStart = source.indexOf('function applyGuestResumeAuthority(');
    expect(applyStart).toBeGreaterThanOrEqual(0);
    const applyEnd = source.indexOf('async function admitLobbyJoin(', applyStart);
    const apply = source.slice(applyStart, applyEnd);
    expect(apply).toContain('const appliedResume = lastAppliedGuestResumeAuthority;');
    expect(apply).toContain('appliedResume.authorityNonce');
    expect(apply).toContain('network.send(reack)');
    // Re-ACK precedes admission: a duplicate nonce never re-enters the apply path.
    expect(apply.indexOf('network.send(reack)'))
      .toBeLessThan(apply.indexOf('admitGuestResumeAuthority(message, {'));
    // Re-ACK only fires for the exact applied transaction on the current connection.
    expect(apply).toContain('message.connectionEpoch === appliedResume.connectionEpoch');
    expect(apply).toContain('message.connectionEpoch === localConnectionEpoch');
  });
});
