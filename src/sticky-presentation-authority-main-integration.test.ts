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
  it('keeps immediate Semtex and crossbow alerts on offline/host authority but never on guest prediction', () => {
    const semtex = block('function armImpactGrenade(', '\nfunction updateGrenades(');
    expect(semtex).toContain("if (network.role !== 'client' && targetId === player.id)");
    expect(semtex).toContain("else if (network.role !== 'client' && grenade.ownerKind === 'player')");
    expect(semtex).toContain("presentStickyUrgentAlert('semtex', 'victim'");
    expect(semtex).toContain("presentStickyUrgentAlert('semtex', 'attacker'");

    const crossbow = block('function updateExplosiveBolts(', '\nfunction throwGrenade(');
    expect(crossbow).toContain("if (network.role !== 'client' && targetHitId === player.id)");
    expect(crossbow).toContain("else if (network.role !== 'client' && bolt.ownerId === player.id)");
    expect(crossbow).toContain("'explosive-crossbow', 'victim'");
    expect(crossbow).toContain("'explosive-crossbow', 'attacker'");
  });

  it('admits a guest attacker alert only from the host envelope, current target life, and fresh result nonce', () => {
    const projection = block('function presentCanonicalStickyAttackerFeedback(', '\nfunction onNetworkMessage(');
    expect(projection).toContain("if (network.role !== 'client') return");
    expect(projection).toContain('const targetLifeId = message.target === player.id');
    expect(projection).toContain('projectStickyAttackerFeedback(');
    expect(projection).toContain('const canonicalResult = admitHostCanonicalHitResult(message.hostAuthority');
    expect(projection).toContain('alreadyProcessed: attackerStuckNonces.has(message.nonce)');
    expect(projection).toContain('if (!canonicalResult.accepted) return');
    expect(projection.indexOf('if (!canonicalResult.accepted) return'))
      .toBeLessThan(projection.indexOf("'attacker',\n    feedback.targetId"));
    expect(source).toContain("if (message.type === 'hit') presentCanonicalStickyAttackerFeedback(message);\n  if (message.type === 'hit' && !processedNonces.has(message.nonce))");
  });

  it('retains the persistent canonical victim receipt before showing the current-life alert', () => {
    const incomingHit = block("if (message.type === 'hit'", "if (message.type === 'death'");
    expect(incomingHit).toContain('const receiptKey = stickyVictimReceiptKey(receipt)');
    expect(incomingHit).toContain('saveStickyVictimReceipt(clientPersistentStorage(), receipt)');
    expect(incomingHit.indexOf('saveStickyVictimReceipt(clientPersistentStorage(), receipt)'))
      .toBeLessThan(incomingHit.indexOf("stickyFeedback.source,\n          'victim'"));
  });
});
