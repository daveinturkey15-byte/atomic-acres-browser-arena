import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Semtex live-stick runtime integration', () => {
  it('derives one live-actor stick state for world, local, self, and remote blast resolution', () => {
    expect(source).toContain('flashbangPresentation, semtexBlastDamage, semtexBlastRadiusM');
    const start = source.indexOf('function explodeGrenade(');
    const end = source.indexOf('\nfunction grenadeDetonatesOnFirstImpact(', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("if (entity.grenade === 'semtex' && attachedTargetId !== null && attachedTargetLifeId !== null)");
    expect(block).toContain('liveAttachedTargetFound = explosiveBoltTargetBuffer.findIndex(attachedTargetId, attachedTargetLifeId) >= 0;');
    expect(block).toContain("sealReceiverStickyDetonation({");
    expect(block).toContain("source: 'semtex'");
    expect(block).toContain('currentAttachmentTarget: { id: attachedTargetId!, lifeId: attachedTargetLifeId! }');
    expect(block).toContain("const semtexStuckToLiveActor = network.role === 'client'");
    expect(block).toContain(': sealedAttachment !== null;');
    expect(block).toContain('semtexBlastRadiusM(semtexStuckToLiveActor)');
    expect(block).toContain('semtexBlastDamage(distance, prone, semtexStuckToLiveActor)');
    expect(block).toMatch(/applyInteractiveWorldExplosion\([\s\S]*point,[\s\S]*blastRadius,[\s\S]*entity\.grenade === 'semtex' \? blastDamage\(0\) : 100,[\s\S]*'grenade-major-collapse',[\s\S]*\);/);
    expect(block).toContain('breakWindowsInGrenadeBlast(point, entity.actionNonce, entity.ownerKind === \'player\', blastRadius)');
    expect(block).toContain("...(semtexStuckToLiveActor ? { stuck: true as const } : {})");
  });

  it('does not multiply stuck Semtex damage a second time after the canonical oracle', () => {
    const start = source.indexOf('function explodeGrenade(');
    const end = source.indexOf('\nfunction grenadeDetonatesOnFirstImpact(', start);
    const block = source.slice(start, end);
    expect(block).not.toContain('damage *= 2');
    expect(block).not.toMatch(/blastDamage\([^\n]+\)\s*\*\s*\([^\n]+\?\s*2\s*:\s*1\)/);
    expect(block.match(/semtexBlastDamage\(/g)).toHaveLength(1);
  });

  it('projects the exact local Semtex victim into the centered 500 ms urgent HUD lane', () => {
    const armStart = source.indexOf('function armImpactGrenade(');
    const armEnd = source.indexOf('\nfunction updateGrenades(', armStart);
    const arm = source.slice(armStart, armEnd);
    expect(arm).toContain('const recordedAttachment = receiverCanAuthorAttachment ? recordReceiverStickyAttachment({');
    expect(arm).toContain("source: 'semtex'");
    expect(arm).toContain('if (recordedAttachment) publishStickyAttachmentOnset(recordedAttachment);');

    const alertStart = source.indexOf('function presentStickyUrgentAlert(');
    const alertEnd = source.indexOf('\nconst hostTriggerAuthorities', alertStart);
    const alert = source.slice(alertStart, alertEnd);
    expect(alert).toContain("audience === 'victim' && attachedTargetId !== player.id");
    expect(alert).toContain('recipientId: player.id');
    expect(alert).toContain("network.role === 'client' ? localHostConfirmedContinuity : localContinuity");
    expect(alert).toContain('if (recipientLifeId === null) return false;');
    expect(alert).toContain('recipientLifeId,');
    expect(alert).toContain("warning.style.setProperty('--sticky-warning-duration', `${STICKY_VICTIM_URGENT_ALERT_DURATION_MS}ms`)");
    expect(alert).toContain('const presentedAtMs = performance.now();');
    expect(alert).toContain('const expiresAtMs = presentedAtMs + STICKY_VICTIM_URGENT_ALERT_DURATION_MS;');
    expect(alert).toContain('Math.max(0, expiresAtMs - performance.now())');
  });
});
