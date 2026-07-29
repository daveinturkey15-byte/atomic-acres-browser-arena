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
});
