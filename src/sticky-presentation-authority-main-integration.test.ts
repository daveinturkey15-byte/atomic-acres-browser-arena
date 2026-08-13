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
    expect(semtex).toContain('if (recordedAttachment) publishStickyAttachmentOnset(recordedAttachment, now);');

    const crossbow = block('function updateExplosiveBolts(', '\nfunction throwGrenade(');
    expect(crossbow).toContain('const recordedAttachment = bolt.authority ? recordReceiverStickyAttachment({');
    expect(crossbow).toContain("source: 'explosive-crossbow'");
    expect(crossbow).toContain('if (recordedAttachment) publishStickyAttachmentOnset(recordedAttachment, now);');
  });

  it('retains immediate offline/host feedback and targets exact guest onset receipts', () => {
    const publish = block('function publishStickyAttachmentOnset(', '\nfunction sealReceiverStickyDetonation(');
    expect(publish).toContain("if (network.role === 'client') return");
    expect(publish).toContain('planStickyAttachmentOnset(attachment, player.id)');
    expect(publish).toContain('if (plan.localAudience) presentStickyAttachmentOnset(attachment, plan.localAudience, nowMs)');
    expect(publish).toContain("type: 'sticky-attachment-receipt'");
    expect(publish).toContain('protocolVersion: MULTIPLAYER_PROTOCOL_VERSION');
    expect(publish).toContain('by: player.id');
    expect(publish).toContain('forPlayerId: recipient.playerId');
    expect(publish).toContain('matchEpoch: attachment.matchEpoch');
    expect(publish).toContain('ownerLifeId: attachment.ownerLifeId');
    expect(publish).toContain('targetLifeId: attachment.targetLifeId');
    expect(publish).toContain('network.sendToPlayer(recipient.playerId, receipt)');
  });

  it('admits guest feedback only from the exact host, recipient, epoch, and current actor lives', () => {
    const handler = block('function handleStickyAttachmentReceipt(', '\nfunction onNetworkMessage(');
    expect(handler).toContain("if (message.type !== 'sticky-attachment-receipt') return false");
    expect(handler).toContain("if (network.role !== 'client' || matchState.phase !== 'active') return true");
    expect(handler).toContain('expectedHostId: privateLobbySnapshot?.hostId');
    expect(handler).toContain('expectedRecipientId: player.id');
    expect(handler).toContain('expectedMatchEpoch: interactiveWorldMatchEpoch');
    expect(handler).toContain('currentOwnerLifeId: currentStickyAttachmentActorLifeId(message.ownerId)');
    expect(handler).toContain('currentTargetLifeId: currentStickyAttachmentActorLifeId(message.targetId)');
    expect(handler).toContain('if (!admission.accepted) return true');
    expect(source).toContain('if (handleStickyAttachmentReceipt(message)) return;');
  });

  it('persists victim replay evidence before presentation and never derives STUCK from detonation hits', () => {
    const handler = block('function handleStickyAttachmentReceipt(', '\nfunction onNetworkMessage(');
    expect(handler).toContain('const receiptKey = stickyVictimReceiptKey(receipt)');
    expect(handler).toContain('saveStickyVictimReceipt(clientPersistentStorage(), receipt)');
    expect(handler.indexOf('saveStickyVictimReceipt(clientPersistentStorage(), receipt)'))
      .toBeLessThan(handler.indexOf('presentStickyAttachmentOnset(message, admission.audience)'));

    const incomingHit = block("if (message.type === 'hit'", "if (message.type === 'death'");
    expect(incomingHit).not.toContain('presentStickyAttachmentOnset');
    expect(incomingHit).not.toContain('presentStickyUrgentAlert');
    expect(incomingHit).not.toContain('projectStickyVictimFeedback');
    expect(incomingHit).toContain('reconcileLocalAuthoritativeHealth(');
  });
});
