import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('sticky urgent-alert authority integration', () => {
  it('publishes onset only from a newly receiver-authored Semtex or crossbow attachment', () => {
    const record = block('function recordReceiverStickyAttachment(', '\nfunction currentStickyAttachmentActorLifeId(');
    expect(record).toContain("if (network.role === 'client') return null");
    expect(record).toContain("if (result.reason !== 'recorded') return null");
    expect(record).toContain('return stickyAttachmentRecord(');

    const semtex = block('function armImpactGrenade(', '\nfunction updateGrenades(');
    expect(semtex).toContain('const recordedAttachment = receiverCanAuthorAttachment ? recordReceiverStickyAttachment({');
    expect(semtex).toContain("source: 'semtex'");
    expect(semtex).toContain('if (recordedAttachment) publishStickyAttachmentOnset(recordedAttachment);');

    const crossbow = block('function updateExplosiveBolts(', '\nfunction throwGrenade(');
    expect(crossbow).toContain('const recordedAttachment = bolt.authority ? recordReceiverStickyAttachment({');
    expect(crossbow).toContain("source: 'explosive-crossbow'");
    expect(crossbow).toContain('if (recordedAttachment) publishStickyAttachmentOnset(recordedAttachment);');
  });

  it('starts local expiry at presentation while retaining attachment time in exact guest receipts', () => {
    const publish = block('function publishStickyAttachmentOnset(', '\nfunction sealReceiverStickyDetonation(');
    expect(publish).toContain("if (network.role === 'client') return");
    expect(publish).toContain('planStickyAttachmentOnset(attachment, player.id)');
    expect(publish).toContain('if (plan.localAudience) presentStickyAttachmentOnset(attachment, plan.localAudience)');
    expect(publish).not.toContain('presentStickyAttachmentOnset(attachment, plan.localAudience,');
    expect(publish).toContain("type: 'sticky-attachment-receipt'");
    expect(publish).toContain('protocolVersion: MULTIPLAYER_PROTOCOL_VERSION');
    expect(publish).toContain('by: player.id');
    expect(publish).toContain('forPlayerId: recipient.playerId');
    expect(publish).toContain('matchEpoch: attachment.matchEpoch');
    expect(publish).toContain('ownerLifeId: attachment.ownerLifeId');
    expect(publish).toContain('targetLifeId: attachment.targetLifeId');
    expect(publish).toContain('attachedAtHostTimeMs: attachment.attachedAtMs');
    expect(publish).toContain('network.sendToPlayer(recipient.playerId, receipt)');
  });

  it('admits guest feedback only from exact authority or queues it until current actor lives arrive', () => {
    const present = block('function presentStickyUrgentAlert(', '\nfunction setStatus(');
    expect(present).toContain("network.role === 'client' ? localHostConfirmedContinuity : localContinuity");
    expect(present).toContain('recipientLifeId,');
    expect(present).toContain('const presentedAtMs = performance.now();');
    expect(present).toContain('const expiresAtMs = presentedAtMs + STICKY_VICTIM_URGENT_ALERT_DURATION_MS;');
    expect(present.indexOf('warning.dataset.presentedAtMs = String(presentedAtMs);'))
      .toBeLessThan(present.indexOf('warning.hidden = false;'));
    expect(present.indexOf('warning.hidden = false;'))
      .toBeLessThan(present.indexOf('stickyUrgentAlertTimeout = window.setTimeout('));

    const currentLife = block('function currentStickyAttachmentActorLifeId(', '\nfunction presentStickyAttachmentOnset(');
    expect(currentLife).toContain("network.role === 'client' ? localHostConfirmedContinuity : localContinuity");

    const handler = block('function handleStickyAttachmentReceipt(', '\nfunction onNetworkMessage(');
    expect(handler).toContain("if (message.type !== 'sticky-attachment-receipt') return false");
    expect(handler).toContain("if (network.role !== 'client' || matchState.phase !== 'active') return true");
    expect(handler).toContain('expectedHostId: privateLobbySnapshot?.hostId');
    expect(handler).toContain('expectedRecipientId: player.id');
    expect(handler).toContain('expectedMatchEpoch: interactiveWorldMatchEpoch');
    expect(handler).toContain('currentOwnerLifeId: currentStickyAttachmentActorLifeId(message.ownerId)');
    expect(handler).toContain('currentTargetLifeId: currentStickyAttachmentActorLifeId(message.targetId)');
    expect(handler).toContain("if (admission.reason === 'pending-continuity') schedulePendingStickyAttachmentReceiptRetry()");

    const retry = block('function retryPendingStickyAttachmentReceipts(', '\nfunction handleStickyAttachmentReceipt(');
    expect(retry).toContain('currentLifeId: currentStickyAttachmentActorLifeId');
    expect(retry).toContain('const result = consumeStickyAttachmentReceipt(entry.message, entry.audience)');
    expect(retry).toContain("if (result !== 'deferred') stickyAttachmentReceiptLedger.finalizePending(entry.message)");
    expect(retry.indexOf('consumeStickyAttachmentReceipt(entry.message, entry.audience)'))
      .toBeLessThan(retry.indexOf('stickyAttachmentReceiptLedger.finalizePending(entry.message)'));
    const advanceLife = block('function advancePendingStickyAttachmentReceiptActorLife(', '\nfunction consumeStickyAttachmentReceipt(');
    expect(advanceLife).toContain("network.role === 'client' && actorId === player.id && lifeId !== localHostConfirmedContinuity");
    expect(source).toContain('if (handleStickyAttachmentReceipt(message)) return;');
  });

  it('retries on canonical life catch-up and cleans pending receipts at exact lifecycle boundaries', () => {
    const guestResume = block('function applyGuestResumeAuthority(', '\nasync function admitLobbyJoin(');
    expect(guestResume).toContain('advancePendingStickyAttachmentReceiptActorLife(player.id, projection.continuity)');

    const respawn = block('function respawn(', '\nfunction applyLocalClassRedeploy(');
    expect(respawn).toContain('discardPendingStickyAttachmentReceiptsForActor(player.id)');

    const removeRemote = block('function removeRemote(', '\nfunction activeSpawnMode(');
    expect(removeRemote).toContain('discardPendingStickyAttachmentReceiptsForActor(id)');

    const networkStatus = block('function setNetworkStatus(', '\nconst network = new ArenaNetwork(');
    expect(networkStatus).toContain('discardPendingStickyAttachmentReceipts()');

    const provisionalRemote = block('remotes.set(incoming.id, remote);', "if (network.role === 'host' && message.type === 'state')");
    expect(provisionalRemote).not.toContain('advancePendingStickyAttachmentReceiptActorLife');
    expect(source).toContain('advancePendingStickyAttachmentReceiptActorLife(incoming.id, admittedContinuity)');
    expect(source).toContain('discardPendingStickyAttachmentReceiptsForActor(message.victim)');
    expect(source).toContain('resetStickyAttachmentReceiptAdmission();');
  });

  it('persists victim replay evidence only after presentation and never derives STUCK from detonation hits', () => {
    const consume = block('function consumeStickyAttachmentReceipt(', '\nfunction schedulePendingStickyAttachmentReceiptRetry(');
    expect(consume).toContain('const receiptKey = stickyVictimReceiptKey(receipt)');
    expect(consume).toContain('saveStickyVictimReceipt(clientPersistentStorage(), receipt)');
    expect(consume.indexOf('presentStickyAttachmentOnset(message, audience)'))
      .toBeLessThan(consume.indexOf('saveStickyVictimReceipt(clientPersistentStorage(), receipt)'));
    expect(consume).toContain("if (!presentStickyAttachmentOnset(message, audience)) return 'deferred'");

    const incomingHit = block("if (message.type === 'hit'", "if (message.type === 'death'");
    expect(incomingHit).not.toContain('presentStickyAttachmentOnset');
    expect(incomingHit).not.toContain('presentStickyUrgentAlert');
    expect(incomingHit).not.toContain('projectStickyVictimFeedback');
    expect(incomingHit).toContain('reconcileLocalAuthoritativeHealth(');
  });
});
