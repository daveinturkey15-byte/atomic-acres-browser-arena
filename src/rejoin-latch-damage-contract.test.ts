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
    // HF-535: ef32a3e7 resent from THIS drop site. That made the recovery
    // edge-triggered by an inbound guest state — the exact signal a latched
    // guest never sends (its 20 Hz pump is gated on !awaitingCanonicalGuestAuthority
    // and on player.alive), so in the day-mp soak the repair fired twice, both
    // within 4 ms of the join, and the host's copy of guestB then froze for 73 s.
    // The drop site now ARMS the latch and the host tick drives it, which
    // strictly widens the cases the resend covers. The drop itself is unchanged.
    expect(window).toContain('armRejoinLatch(incoming.id, performance.now())');
    expect(window).not.toContain('rejoinLatchResendAtMs');
    // The latch still drops the unauthenticated sample; resend only retries the nonce.
    expect(window).toContain('return; }');
    // ...and the resend is still reachable, still throttled, and now also
    // reachable when no guest state ever arrives.
    const tick = source.slice(source.indexOf('function updateRemotes('));
    expect(tick.slice(0, tick.indexOf('\n}\n'))).toContain('driveRejoinLatchRecovery(');
    const drive = source.slice(source.indexOf('function driveRejoinLatchRecovery'));
    expect(drive.slice(0, drive.indexOf('\nfunction ', 1)))
      .toContain('sendGuestResumeAuthority(playerId, remote)');
  });

  it('mints a retained authority only while the replacement latch is held', () => {
    const send = source.slice(
      source.indexOf('function sendGuestResumeAuthority'),
      source.indexOf('function sendAuthoritativeRemoteSnapshotToPlayer'),
    );
    expect(send.length).toBeGreaterThan(200);
    // Skeptic fix 4: the :9141 gate still admits the pending fast-path resend,
    // but the mint branch below it must require awaitingReplacementState, or a
    // guest-authored pose is promoted into the host's retained authority.
    expect(send).toContain('remote.awaitingReplacementState || pendingGuestAuthorityRepairs.has(playerId)');
    expect(send).toContain('if (!connectionEpoch || !remote.awaitingReplacementState || !member');
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
